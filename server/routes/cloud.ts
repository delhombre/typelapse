import { Hono } from "hono";
import {
	type HostedRenderDeps,
	defaultHostedRenderDeps,
	requireHostedRenderEntitlement,
} from "../auth/hosted-render-guard";

interface CloudRenderBody {
	steps?: unknown[];
}

/**
 * Hosted render: the render itself is still a STUB.
 *
 * The production implementation enqueues the job on a render queue processed by
 * a fleet of Remotion workers, uploads the result to object storage, and
 * returns a signed download URL once done.
 *
 * The entitlement check, however, is real: every route here is behind
 * {@link requireHostedRenderEntitlement}, which resolves the caller's plan from
 * their session. Ports are injected rather than imported so that a deployment
 * chooses its auth provider and a test can supply its own.
 */
export const createCloudRoute = (deps: HostedRenderDeps = defaultHostedRenderDeps) => {
	const cloudRoute = new Hono();

	cloudRoute.use("*", requireHostedRenderEntitlement(deps));

	cloudRoute.post("/render", async (c) => {
		const body = (await c.req.json().catch(() => null)) as CloudRenderBody | null;
		if (!body || !Array.isArray(body.steps) || body.steps.length < 2) {
			return c.json({ error: "At least 2 steps required" }, 400);
		}

		const jobId = `job_${Date.now().toString(36)}`;
		return c.json(
			{
				jobId,
				status: "queued",
				message: "Hosted rendering is being provisioned, this endpoint is a stub.",
			},
			202,
		);
	});

	/** Job status: STUB. Always reports "queued" until workers are attached. */
	cloudRoute.get("/jobs/:id", (c) => {
		const jobId = c.req.param("id");
		return c.json({
			jobId,
			status: "queued",
			message: "Stub: no render worker is attached yet.",
		});
	});

	return cloudRoute;
};

/** The route as mounted by the server, with no auth provider wired yet. */
export const cloudRoute = createCloudRoute();
