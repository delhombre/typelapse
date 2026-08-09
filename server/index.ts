import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { betterAuthAdapter } from "../src/infrastructure/auth/better-auth.adapter";
import { Plan } from "../src/domain/value-objects/plan";
import { authInstance } from "./auth/auth-instance";
import type { HostedRenderDeps } from "./auth/hosted-render-guard";
import { billingRoute } from "./routes/billing";
import { createCloudRoute } from "./routes/cloud";
import { renderRoute } from "./routes/render";

const app = new Hono();

app.use(
	"*",
	cors({
		origin: process.env.CORS_ORIGIN || "http://localhost:5173",
		credentials: true,
	}),
);

app.get("/health", (c) => c.json({ status: "ok" }));

const auth = authInstance();

if (auth) {
	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}

/**
 * Every account is on the free plan until billing is real.
 *
 * Deliberately not a lookup that defaults to free on error: there is no
 * subscription table yet, and inventing one that always says "free" would read
 * like a wired feature.
 */
const hostedRenderDeps: HostedRenderDeps | undefined = auth
	? {
			auth: betterAuthAdapter(auth),
			subscriptions: { planFor: async () => Plan.free() },
		}
	: undefined;

// Local (Free/local) render, unchanged
app.route("/api", renderRoute);
// Hosted (Pro/Team) render: entitlement is real, the render itself is a stub
app.route("/api/cloud", createCloudRoute(hostedRenderDeps));
app.route("/api/billing", billingRoute);

const port = Number(process.env.PORT) || 3001;
console.log(`Typelapse server running on http://localhost:${port}`);
console.log(
	auth
		? "Auth: better-auth active"
		: "Auth: no DATABASE_URL, hosted rendering stays closed",
);

serve({ fetch: app.fetch, port });
