import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	outputExpiredRefusal,
	planLimitRefusal,
} from "../../src/application/billing/plan-allowance";
import {
	type HostedRenderJob,
	type HostedRenderJobService,
	parseHostedRenderOptions,
} from "../../src/application/render/hosted-render-job";
import type {
	HostedRenderDownload,
	HostedRenderDownloadService,
} from "../../src/application/render/hosted-render-download";
import {
	type HostedRenderPageService,
	publicRenderPageUrl,
} from "../../src/application/render/hosted-render-page";
import type { Plan } from "../../src/domain/value-objects/plan";
import {
	type HostedRenderDeps,
	defaultHostedRenderDeps,
	requireHostedAccount,
} from "../auth/hosted-render-guard";

const MAX_RENDER_REQUEST_BYTES = 32 * 1024;

interface CloudRouteEnv {
	Variables: {
		accountId: string;
		plan: Plan;
	};
}

export interface CloudRouteDeps extends HostedRenderDeps {
	readonly renderJobs?: HostedRenderJobService;
	readonly renderDownloads?: HostedRenderDownloadService;
	/** Public pages (`/v/<id>`); without them the owner sees no page control. */
	readonly renderPages?: HostedRenderPageService;
	/** The public origin a page address is written on. */
	readonly appUrl?: string;
}

/** A paid plan keeps every output; a downgraded one keeps them for its grace period. */
async function keepsOutput(
	deps: CloudRouteDeps,
	c: Context<CloudRouteEnv>,
	job: HostedRenderJob,
	now: Date,
): Promise<boolean> {
	const plan = c.get("plan");
	if (plan.capabilities.allowsCloudExport) {
		return true;
	}
	const downgradedAt = (await deps.subscriptions.downgradedAt?.(c.get("accountId"))) ?? null;
	return plan.keepsHostedOutput({
		completedAt: job.completedAt ?? job.createdAt,
		downgradedAt,
		now,
	});
}

async function downloadResponse(
	deps: CloudRouteDeps,
	ownerId: string,
	jobId: string,
): Promise<
	| { readonly outcome: "ready"; readonly download: HostedRenderDownload }
	| { readonly outcome: "not-ready" }
	| { readonly outcome: "not-found" }
	| { readonly outcome: "unavailable" }
> {
	if (!deps.renderDownloads) {
		return { outcome: "unavailable" };
	}
	try {
		return await deps.renderDownloads.open(ownerId, jobId);
	} catch {
		return { outcome: "unavailable" };
	}
}

function renderJobBody(value: unknown): {
	readonly projectId: string;
	readonly revision: number;
	readonly renderOptions: ReturnType<typeof parseHostedRenderOptions>;
} {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Hosted render request must be an object");
	}
	const input = value as Record<string, unknown>;
	if (typeof input.projectId !== "string" || !input.projectId.trim()) {
		throw new Error("Hosted render projectId is required");
	}
	if (
		typeof input.revision !== "number" ||
		!Number.isSafeInteger(input.revision) ||
		input.revision < 1
	) {
		throw new Error("Hosted render revision must be a positive integer");
	}
	return {
		projectId: input.projectId,
		revision: input.revision,
		renderOptions: parseHostedRenderOptions(input.renderOptions),
	};
}

/** Entitled, canonical-revision cloud rendering. */
export const createCloudRoute = (
	deps: CloudRouteDeps = { ...defaultHostedRenderDeps },
): Hono<CloudRouteEnv> => {
	const cloudRoute = new Hono<CloudRouteEnv>();
	const now = deps.now ?? (() => new Date());
	const pageUrl = (c: Context<CloudRouteEnv>, jobId: string) =>
		publicRenderPageUrl(deps.appUrl ?? new URL(c.req.url).origin, jobId);

	/**
	 * The receipt's page control: a Creator owner can publish, and an owner whose
	 * page is already up can always take it down. Anyone else has no control.
	 */
	const ownerPage = async (c: Context<CloudRouteEnv>, jobId: string) => {
		if (!deps.renderPages) {
			return null;
		}
		const isPublic = await deps.renderPages.isPublic(c.get("accountId"), jobId);
		if (isPublic === null || (!isPublic && !c.get("plan").capabilities.allowsCloudExport)) {
			return null;
		}
		return { public: isPublic, url: pageUrl(c, jobId) };
	};

	cloudRoute.use("*", requireHostedAccount({ ...deps, now }));
	cloudRoute.use(
		"/render",
		bodyLimit({
			maxSize: MAX_RENDER_REQUEST_BYTES,
			onError: (c) => c.json({ error: "Hosted render request is too large" }, 413),
		}),
	);

	cloudRoute.post("/render", async (c) => {
		const plan = c.get("plan");
		if (!plan.capabilities.allowsCloudExport) {
			return c.json(planLimitRefusal(plan, "hostedRenderTime", 0), 402);
		}
		if (!deps.renderJobs) {
			return c.json({ error: "Hosted rendering is not configured" }, 503);
		}
		let body: ReturnType<typeof renderJobBody>;
		try {
			body = renderJobBody(await c.req.json());
		} catch (error) {
			return c.json(
				{ error: error instanceof Error ? error.message : "Invalid hosted render request" },
				400,
			);
		}
		const result = await deps.renderJobs.submit({
			ownerId: c.get("accountId"),
			projectId: body.projectId,
			revision: body.revision,
			renderOptions: body.renderOptions,
			plan,
			now: now(),
		});
		if (result.outcome === "plan-limit") {
			// Too many jobs at once clears by itself, so it is a retry, not an upgrade.
			return c.json(
				planLimitRefusal(plan, result.ceiling, result.used),
				result.ceiling === "concurrentRenders" ? 429 : 402,
			);
		}
		if (result.outcome === "resolution-limit") {
			return c.json({ error: result.message, code: "resolution-limit" }, 402);
		}
		if (result.outcome === "project-not-found") {
			return c.json({ error: "Project not found" }, 404);
		}
		if (result.outcome === "revision-conflict") {
			return c.json(
				{ error: "Project revision conflict", currentRevision: result.currentRevision },
				409,
			);
		}
		if (result.outcome === "assets-unavailable") {
			return c.json(
				{ error: "Project assets are not ready", assetIds: result.assetIds },
				409,
			);
		}
		return c.json({ job: result.job }, 202);
	});

	cloudRoute.get("/jobs/:id", async (c) => {
		if (!deps.renderJobs) {
			return c.json({ error: "Hosted rendering is not configured" }, 503);
		}
		const job = await deps.renderJobs.status(c.get("accountId"), c.req.param("id"));
		if (!job) {
			return c.json({ error: "Render job not found" }, 404);
		}
		if (job.status !== "succeeded" || !deps.renderDownloads) {
			return c.json({ job });
		}
		if (!(await keepsOutput(deps, c, job, now()))) {
			return c.json({ job });
		}
		const result = await downloadResponse(deps, c.get("accountId"), job.id);
		if (result.outcome !== "ready") {
			return c.json({ error: "Render output is temporarily unavailable" }, 503);
		}
		c.header("Cache-Control", "no-store");
		const page = await ownerPage(c, job.id);
		return c.json({ job, download: result.download, ...(page ? { page } : {}) });
	});

	cloudRoute.put("/jobs/:id/public", async (c) => {
		if (!deps.renderJobs || !deps.renderPages) {
			return c.json({ error: "Public pages are not configured" }, 503);
		}
		const body: unknown = await c.req.json().catch(() => null);
		const value =
			typeof body === "object" && body !== null && "public" in body ? body.public : undefined;
		if (typeof value !== "boolean") {
			return c.json({ error: "Send { public: true } or { public: false }" }, 400);
		}
		const job = await deps.renderJobs.status(c.get("accountId"), c.req.param("id"));
		if (!job) {
			return c.json({ error: "Render job not found" }, 404);
		}
		if (job.status !== "succeeded") {
			return c.json({ error: "Render output is not ready" }, 409);
		}
		// Taking a page down is always the owner's; putting one up is Creator's.
		const plan = c.get("plan");
		if (value && !plan.capabilities.allowsCloudExport) {
			return c.json(planLimitRefusal(plan, "hostedRenderTime", 0), 402);
		}
		if (!(await deps.renderPages.setPublic(c.get("accountId"), job.id, value))) {
			return c.json({ error: "Render job not found" }, 404);
		}
		c.header("Cache-Control", "no-store");
		return c.json({ page: { public: value, url: pageUrl(c, job.id) } });
	});

	cloudRoute.get("/jobs/:id/download", async (c) => {
		if (!deps.renderJobs || !deps.renderDownloads) {
			return c.json({ error: "Hosted rendering is not configured" }, 503);
		}
		const jobId = c.req.param("id");
		const job = await deps.renderJobs.status(c.get("accountId"), jobId);
		if (!job) {
			return c.json({ error: "Render job not found" }, 404);
		}
		if (job.status === "succeeded" && !(await keepsOutput(deps, c, job, now()))) {
			return c.json(outputExpiredRefusal(c.get("plan")), 402);
		}
		const result = await downloadResponse(deps, c.get("accountId"), jobId);
		if (result.outcome === "not-found") {
			return c.json({ error: "Render job not found" }, 404);
		}
		if (result.outcome === "not-ready") {
			return c.json({ error: "Render output is not ready" }, 409);
		}
		if (result.outcome === "unavailable") {
			return c.json({ error: "Render output is temporarily unavailable" }, 503);
		}
		c.header("Cache-Control", "no-store");
		return c.json({ download: result.download });
	});

	return cloudRoute;
};

/** Fail-closed route used when hosted dependencies are absent. */
export const cloudRoute = createCloudRoute();
