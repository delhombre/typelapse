import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	AssetIngestionError,
	type AssetIngestionDependencies,
	createAssetIngestionService,
} from "../../src/application/assets/asset-ingestion";
import type { AssetRecord } from "../../src/application/assets/asset-repository.port";
import { authenticateAccount } from "../../src/application/auth/authenticate-account";
import { planLimitRefusal } from "../../src/application/billing/plan-allowance";
import type { AuthPort } from "../../src/domain/ports/auth.port";
import type { SubscriptionPort } from "../../src/domain/ports/subscription.port";
import { Plan } from "../../src/domain/value-objects/plan";

interface AssetsRouteEnv {
	Variables: {
		accountId: string;
	};
}

const MAX_ASSET_REQUEST_BYTES = 64 * 1024;

export interface AssetsRouteDeps extends AssetIngestionDependencies {
	readonly auth: AuthPort;
	/** Resolves the media allowance; without billing every account is on the free plan. */
	readonly subscriptions?: SubscriptionPort;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
	const input = await request.json().catch(() => null);
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return null;
	}
	return input as Record<string, unknown>;
}

function hasOnlyKeys(input: Record<string, unknown>, allowed: readonly string[]): boolean {
	const keys = Object.keys(input);
	return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function assetView(asset: AssetRecord) {
	return {
		id: asset.id,
		projectId: asset.projectId,
		metadata: asset.metadata,
		status: asset.status,
		verifiedChecksum: asset.verifiedChecksum,
		failureCode: asset.failureCode,
		createdAt: asset.createdAt,
		updatedAt: asset.updatedAt,
		readyAt: asset.readyAt,
	};
}

function errorResponse(c: Context<AssetsRouteEnv>, error: unknown, plan?: Plan): Response {
	if (!(error instanceof AssetIngestionError)) {
		throw error;
	}
	if (error.code === "quota-exceeded" && plan) {
		const usedBytes = Number(error.details?.usedBytes ?? 0);
		return c.json(
			{ ...planLimitRefusal(plan, "mediaBytes", usedBytes), ...error.details },
			413,
		);
	}
	const body = { error: error.message, code: error.code, ...error.details };
	switch (error.code) {
		case "invalid-metadata":
			return c.json(body, 400);
		case "unsupported-media-type":
			return c.json(body, 415);
		case "asset-too-large":
		case "quota-exceeded":
			return c.json(body, 413);
		case "not-found":
			return c.json(body, 404);
		case "upload-integrity-failed":
			return c.json(body, 422);
		case "idempotency-conflict":
		case "upload-missing":
		case "invalid-state":
		case "asset-referenced":
			return c.json(body, 409);
	}
}

/** Authenticated direct-to-object-storage media ingestion and owner-scoped CRUD. */
export function createAssetsRoute({
	auth,
	assets,
	storage,
	policy,
	subscriptions = { planFor: async () => Plan.free() },
	now = () => new Date(),
	createId,
}: AssetsRouteDeps): Hono<AssetsRouteEnv> {
	const route = new Hono<AssetsRouteEnv>();
	const service = createAssetIngestionService({ assets, storage, policy, now, createId });

	route.use("*", async (c, next) => {
		const accountId = await authenticateAccount({
			credential: c.req.header("cookie") ?? null,
			auth,
			now: now(),
		});
		if (!accountId) {
			return c.json({ error: "Sign in to manage assets" }, 401);
		}
		c.set("accountId", accountId);
		await next();
	});

	route.use(
		"*",
		bodyLimit({
			maxSize: MAX_ASSET_REQUEST_BYTES,
			onError: (c) => c.json({ error: "Asset request is too large" }, 413),
		}),
	);

	route.post("/reserve", async (c) => {
		const idempotencyKey = c.req.header("idempotency-key");
		if (!idempotencyKey) {
			return c.json({ error: "Idempotency-Key header is required" }, 400);
		}
		const input = await readJsonObject(c.req.raw);
		if (!input || !hasOnlyKeys(input, ["projectId", "metadata"])) {
			return c.json({ error: "Project id and asset metadata are required" }, 400);
		}
		const plan = await subscriptions.planFor(c.get("accountId"));
		try {
			const result = await service.reserve({
				ownerId: c.get("accountId"),
				projectId: input.projectId,
				metadata: input.metadata,
				idempotencyKey,
				maxOwnerStorageBytes: plan.limitFor("mediaBytes"),
			});
			const body = {
				asset: assetView(result.asset),
				upload: result.upload,
				replayed: result.replayed,
			};
			return result.replayed ? c.json(body, 200) : c.json(body, 201);
		} catch (error) {
			return errorResponse(c, error, plan);
		}
	});

	route.post("/:id/finalize", async (c) => {
		const idempotencyKey = c.req.header("idempotency-key");
		if (!idempotencyKey) {
			return c.json({ error: "Idempotency-Key header is required" }, 400);
		}
		try {
			const result = await service.finalize({
				ownerId: c.get("accountId"),
				id: c.req.param("id"),
				idempotencyKey,
			});
			return c.json({ asset: assetView(result.asset), replayed: result.replayed }, 200);
		} catch (error) {
			return errorResponse(c, error);
		}
	});

	route.get("/", async (c) => {
		try {
			const items = await service.list(c.get("accountId"), c.req.query("projectId"));
			return c.json({ assets: items.map(assetView) });
		} catch (error) {
			return errorResponse(c, error);
		}
	});

	route.get("/:id/content", async (c) => {
		try {
			const access = await service.open(c.get("accountId"), c.req.param("id"));
			c.header("Cache-Control", "no-store");
			return c.json({ access });
		} catch (error) {
			return errorResponse(c, error);
		}
	});

	route.get("/:id", async (c) => {
		try {
			const asset = await service.get(c.get("accountId"), c.req.param("id"));
			return c.json({ asset: assetView(asset) });
		} catch (error) {
			return errorResponse(c, error);
		}
	});

	route.delete("/:id", async (c) => {
		try {
			await service.delete(c.get("accountId"), c.req.param("id"));
			return c.body(null, 204);
		} catch (error) {
			return errorResponse(c, error);
		}
	});

	return route;
}
