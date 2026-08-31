import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
	type HostedRenderJobService,
	parseHostedRenderOptions,
} from "../../src/application/render/hosted-render-job";
import type {
	HostedRenderDownload,
	HostedRenderDownloadService,
} from "../../src/application/render/hosted-render-download";
import {
	type HostedRenderDeps,
	defaultHostedRenderDeps,
	requireHostedRenderEntitlement,
} from "../auth/hosted-render-guard";

const MAX_RENDER_REQUEST_BYTES = 32 * 1024;

interface CloudRouteEnv {
	Variables: {
		accountId: string;
	};
}

export interface CloudRouteDeps extends HostedRenderDeps {
	readonly renderJobs?: HostedRenderJobService;
	readonly renderDownloads?: HostedRenderDownloadService;
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

	cloudRoute.use("*", requireHostedRenderEntitlement(deps));
	cloudRoute.use(
		"/render",
		bodyLimit({
			maxSize: MAX_RENDER_REQUEST_BYTES,
			onError: (c) => c.json({ error: "Hosted render request is too large" }, 413),
		}),
	);

	cloudRoute.post("/render", async (c) => {
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
		});
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
		const result = await downloadResponse(deps, c.get("accountId"), job.id);
		if (result.outcome !== "ready") {
			return c.json({ error: "Render output is temporarily unavailable" }, 503);
		}
		c.header("Cache-Control", "no-store");
		return c.json({ job, download: result.download });
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
