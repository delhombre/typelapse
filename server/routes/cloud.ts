import { Hono } from "hono";

const cloudRoute = new Hono();

interface CloudRenderBody {
	steps?: unknown[];
}

/**
 * Hosted render: STUB.
 *
 * The production implementation enqueues the job on a render queue processed by
 * a fleet of Remotion workers, uploads the result to object storage, and
 * returns a signed download URL once done.
 *
 * For now it performs the entitlement check + request validation and returns a
 * queued-job placeholder so the client flow can be wired end-to-end.
 */
cloudRoute.post("/render", async (c) => {
	// Placeholder entitlement check. A real impl verifies a signed session token
	// / Stripe subscription server-side, never trust a client header.
	const plan = c.req.header("x-typelapse-plan");
	if (plan !== "pro") {
		return c.json({ error: "Hosted rendering requires a Pro plan" }, 402);
	}

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

export { cloudRoute };
