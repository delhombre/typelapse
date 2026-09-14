import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { deploymentModeFrom } from "../../server/config/deployment-mode";
import { createApp } from "../../server/index";

describe("deployment mode configuration", () => {
	it("keeps the self-hosted development server local when configuration is absent", () => {
		expect(deploymentModeFrom({})).toBe("local");
	});

	it("accepts the two explicit deployment modes", () => {
		expect(deploymentModeFrom({ TYPELAPSE_DEPLOYMENT_MODE: "local" })).toBe("local");
		expect(deploymentModeFrom({ TYPELAPSE_DEPLOYMENT_MODE: "hosted" })).toBe("hosted");
	});

	it("refuses an unknown mode instead of opening local compute", () => {
		expect(() => deploymentModeFrom({ TYPELAPSE_DEPLOYMENT_MODE: "preview" })).toThrow(
			/TYPELAPSE_DEPLOYMENT_MODE/,
		);
	});
});

describe("anonymous synchronous rendering", () => {
	const synchronousRenderRoute = () =>
		new Hono().post("/render", (c) => c.json({ renderer: "synchronous" }));

	it("keeps /api/render mounted in local mode", async () => {
		const app = await createApp({
			deploymentMode: "local",
			synchronousRenderRoute: synchronousRenderRoute(),
		});

		const response = await app.request("http://localhost/api/render", { method: "POST" });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ renderer: "synchronous" });
	});

	it("does not mount /api/render in hosted mode", async () => {
		const app = await createApp({
			deploymentMode: "hosted",
			synchronousRenderRoute: synchronousRenderRoute(),
		});

		const response = await app.request("http://localhost/api/render", { method: "POST" });

		expect(response.status).toBe(404);
	});
});
