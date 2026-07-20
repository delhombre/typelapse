import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { billingRoute } from "./routes/billing";
import { cloudRoute } from "./routes/cloud";
import { renderRoute } from "./routes/render";

const app = new Hono();

app.use(
	"*",
	cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

// Local (Free/local) render, unchanged
app.route("/api", renderRoute);
// Hosted (Pro/Team) render + billing: stubs
app.route("/api/cloud", cloudRoute);
app.route("/api/billing", billingRoute);

const port = Number(process.env.PORT) || 3001;
console.log(`Typelapse server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
