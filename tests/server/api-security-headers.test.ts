import { describe, expect, it } from "vitest";
import type { BillingService } from "../../server/billing/billing-service";
import { createApp } from "../../server/index";

/**
 * The API answers JSON and one public HTML page, never a document that loads
 * scripts of its own. Its hardening is the small set a browser honours on any
 * response; the Content-Security-Policy stays the static host's (#217), and
 * the headers must not close the studio's cross-origin door or the Polar
 * webhook, which is a server-to-server POST.
 */

const STUDIO_ORIGIN = "http://localhost:5173";

async function app() {
	return createApp({ deploymentMode: "hosted", database: null, auth: null });
}

describe("API hardening headers", () => {
	it("sends nosniff, no framing, a trimmed referrer and a minimal permissions policy", async () => {
		const response = await (await app()).request("http://localhost/health");

		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
		expect(response.headers.get("permissions-policy")).toBe(
			"camera=(), microphone=(), geolocation=()",
		);
	});

	it("reaches routes that do not exist", async () => {
		const missing = await (await app()).request("http://localhost/api/nope");

		expect(missing.status).toBe(404);
		expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
		expect(missing.headers.get("x-frame-options")).toBe("DENY");
	});

	it("sets no Content-Security-Policy and none of the headers that would wall the studio out", async () => {
		const { headers } = await (await app()).request("http://localhost/health");

		expect(headers.get("content-security-policy")).toBeNull();
		expect(headers.get("content-security-policy-report-only")).toBeNull();
		expect(headers.get("strict-transport-security")).toBeNull();
		expect(headers.get("cross-origin-resource-policy")).toBeNull();
		expect(headers.get("cross-origin-opener-policy")).toBeNull();
		expect(headers.get("cross-origin-embedder-policy")).toBeNull();
	});
});

describe("capability reads are never cached", () => {
	it.each(["/health", "/api/health"])("%s answers no-store", async (path) => {
		const response = await (await app()).request(`http://localhost${path}`);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});
});

describe("the headers leave the cross-origin routes working", () => {
	it("keeps the studio's credentialed CORS answer, preflight and request", async () => {
		const server = await app();

		const preflight = await server.request("http://localhost/api/health", {
			method: "OPTIONS",
			headers: {
				origin: STUDIO_ORIGIN,
				"access-control-request-method": "GET",
			},
		});
		const read = await server.request("http://localhost/api/health", {
			headers: { origin: STUDIO_ORIGIN },
		});

		for (const response of [preflight, read]) {
			expect(response.headers.get("access-control-allow-origin")).toBe(STUDIO_ORIGIN);
			expect(response.headers.get("access-control-allow-credentials")).toBe("true");
		}
		expect(read.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
		expect(preflight.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("hands the Polar webhook its raw body and answers it", async () => {
		let received: string | null = null;
		const billing = {
			processWebhook: async (rawBody: string) => {
				received = rawBody;
				return { outcome: "processed" as const };
			},
		} as unknown as BillingService;
		const server = await createApp({
			deploymentMode: "hosted",
			database: null,
			auth: null,
			billing,
		});
		const body = '{"type":"subscription.created"}';

		const response = await server.request("http://localhost/api/billing/webhook", {
			method: "POST",
			headers: {
				"webhook-id": "msg_1",
				"webhook-timestamp": "1790000000",
				"webhook-signature": "v1,abc",
				"content-type": "application/json",
			},
			body,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true, outcome: "processed" });
		expect(received).toBe(body);
	});
});
