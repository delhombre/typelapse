import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { renderRoute } from "./routes/render";

const app = new Hono();

app.use(
	"*",
	cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api", renderRoute);

const port = Number(process.env.PORT) || 3001;
console.log(`Typelapse server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
