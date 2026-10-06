import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createPolar } from "@polar-sh/sdk/2026-10";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidBillingWebhookSignatureError } from "../../server/billing/billing-service";
import {
	createPolarBillingGateway,
	polarApiUrlFromEnv,
	polarEnvironmentFromEnv,
	polarGatewayFromEnv,
} from "../../server/billing/polar-gateway";

const SECRET = "polar_whs_test_secret";

interface Seen {
	readonly method: string;
	readonly path: string;
	readonly auth: string | undefined;
	readonly body: unknown;
}

/**
 * A stand-in for api.polar.sh that speaks HTTP, so the gateway is proven through
 * the real SDK (snake_case wire names, bearer token, paths) and not through a
 * stub of it.
 */
function fakePolarApi() {
	const seen: Seen[] = [];
	const replies = new Map<string, unknown>();
	let server: Server;
	const readBody = async (request: IncomingMessage): Promise<unknown> => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(chunk as Buffer);
		const text = Buffer.concat(chunks).toString("utf8");
		return text ? JSON.parse(text) : undefined;
	};
	return {
		seen,
		reply(method: string, path: string, body: unknown) {
			replies.set(`${method} ${path}`, body);
		},
		async start(): Promise<string> {
			server = createServer(async (request, response) => {
				const path = (request.url ?? "").split("?")[0] ?? "";
				seen.push({
					method: request.method ?? "",
					path,
					auth: request.headers.authorization,
					body: await readBody(request),
				});
				const reply = replies.get(`${request.method} ${path.replace(/\/$/, "")}`);
				response.setHeader("content-type", "application/json");
				response.statusCode = reply === undefined ? 404 : 200;
				response.end(JSON.stringify(reply ?? { detail: "not found" }));
			});
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
			return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		},
		stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

function sign(body: string, id: string, timestamp: number, secret = SECRET): string {
	const digest = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
	return `v1,${digest}`;
}

function headersFor(body: string, id = "wh_1", secret = SECRET) {
	const timestamp = Math.floor(Date.now() / 1000);
	return {
		"webhook-id": id,
		"webhook-timestamp": String(timestamp),
		"webhook-signature": sign(body, id, timestamp, secret),
	};
}

const customer = { id: "cus_polar_1", external_id: "user-1" };

function subscriptionPayload(type: string, overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		type,
		timestamp: "2026-10-06T10:00:00.000000Z",
		api_version: "2026-10",
		data: { id: "sub_1", customer_id: "cus_polar_1", customer, ...overrides },
	});
}

let api: ReturnType<typeof fakePolarApi>;
let baseUrl: string;

beforeEach(async () => {
	api = fakePolarApi();
	baseUrl = await api.start();
});

afterEach(async () => {
	await api.stop();
});

function gateway(environment: "sandbox" | "production" = "sandbox") {
	return createPolarBillingGateway({
		polar: createPolar({ accessToken: "polar_oat_test", baseUrl }),
		webhookSecret: SECRET,
		environment,
	});
}

describe("Polar billing gateway", () => {
	it("starts a checkout for one product with our account id as the external customer", async () => {
		api.reply("POST", "/v1/checkouts", { id: "co_1", url: "https://sandbox.polar.sh/checkout/co_1" });

		const checkout = await gateway().createCheckout({
			userId: "user-1",
			productId: "prod_monthly",
			successUrl: "https://typelapse.test/app?billing=success",
			returnUrl: "https://typelapse.test/app?billing=cancelled",
		});

		expect(checkout).toEqual({ id: "co_1", url: "https://sandbox.polar.sh/checkout/co_1" });
		expect(api.seen[0]).toMatchObject({
			method: "POST",
			auth: "Bearer polar_oat_test",
			body: {
				products: ["prod_monthly"],
				external_customer_id: "user-1",
				success_url: "https://typelapse.test/app?billing=success",
				return_url: "https://typelapse.test/app?billing=cancelled",
			},
		});
	});

	it("opens the customer portal through a pre-authenticated session for the account", async () => {
		api.reply("POST", "/v1/customer-sessions", {
			customer_portal_url: "https://sandbox.polar.sh/portal?token=short_lived",
		});

		const portal = await gateway().createPortal({
			userId: "user-1",
			returnUrl: "https://typelapse.test/app",
		});

		expect(portal).toEqual({ url: "https://sandbox.polar.sh/portal?token=short_lived" });
		expect(api.seen[0]?.body).toEqual({
			external_customer_id: "user-1",
			return_url: "https://typelapse.test/app",
		});
	});

	it("reads the subscription state back from Polar", async () => {
		api.reply("GET", "/v1/subscriptions/sub_1", {
			id: "sub_1",
			status: "past_due",
			customer_id: "cus_polar_1",
			product_id: "prod_monthly",
			current_period_end: "2026-11-06T10:00:00Z",
			cancel_at_period_end: true,
		});

		await expect(gateway().retrieveSubscription("sub_1")).resolves.toEqual({
			customerId: "cus_polar_1",
			subscriptionId: "sub_1",
			productId: "prod_monthly",
			status: "past_due",
			currentPeriodEnd: new Date("2026-11-06T10:00:00Z"),
			cancelAtPeriodEnd: true,
		});
	});

	it("reads a product's USD fixed price and its recurring interval", async () => {
		api.reply("GET", "/v1/products/prod_yearly", {
			id: "prod_yearly",
			is_archived: false,
			is_recurring: true,
			recurring_interval: "year",
			prices: [
				{ amount_type: "fixed", price_currency: "usd", price_amount: 9900, is_archived: false },
			],
		});

		await expect(gateway().retrieveProduct("prod_yearly")).resolves.toEqual({
			id: "prod_yearly",
			currency: "usd",
			unitAmount: 9900,
			recurringInterval: "year",
		});
	});

	it("refuses a product that is archived, one-time, or without a fixed price", async () => {
		const base = { id: "prod_x", is_archived: false, is_recurring: true, recurring_interval: "month" };
		const fixed = { amount_type: "fixed", price_currency: "usd", price_amount: 1200, is_archived: false };
		api.reply("GET", "/v1/products/archived", { ...base, is_archived: true, prices: [fixed] });
		api.reply("GET", "/v1/products/one-time", { ...base, is_recurring: false, recurring_interval: null, prices: [fixed] });
		api.reply("GET", "/v1/products/free", { ...base, prices: [{ amount_type: "free", is_archived: false }] });

		for (const id of ["archived", "one-time", "free"]) {
			await expect(gateway().retrieveProduct(id)).rejects.toThrow("active monthly or annual");
		}
	});

	describe("webhooks", () => {
		it("verifies the signature and reads the account id from the customer's external id", async () => {
			const body = subscriptionPayload("subscription.active");

			const event = await gateway().verifyWebhook(body, headersFor(body, "wh_active"));

			expect(event).toMatchObject({
				id: "wh_active",
				type: "subscription.active",
				customerId: "cus_polar_1",
				subscriptionId: "sub_1",
				userId: "user-1",
				livemode: false,
			});
			expect(event.createdAt).toEqual(new Date("2026-10-06T10:00:00Z"));
			expect(event.payloadHash).toMatch(/^[0-9a-f]{64}$/);
		});

		it("marks a production delivery as live and a sandbox one as not", async () => {
			const body = subscriptionPayload("subscription.revoked");

			const live = await gateway("production").verifyWebhook(body, headersFor(body));

			expect(live.livemode).toBe(true);
		});

		it("finds the subscription of an order.paid event", async () => {
			const body = JSON.stringify({
				type: "order.paid",
				timestamp: "2026-10-06T10:05:00Z",
				api_version: "2026-10",
				data: { id: "ord_1", subscription_id: "sub_9", customer_id: "cus_polar_1", customer },
			});

			await expect(gateway().verifyWebhook(body, headersFor(body))).resolves.toMatchObject({
				type: "order.paid",
				subscriptionId: "sub_9",
				customerId: "cus_polar_1",
				userId: "user-1",
			});
		});

		it("rejects a bad signature, a wrong secret and missing headers", async () => {
			const body = subscriptionPayload("subscription.active");
			const forged = { ...headersFor(body), "webhook-signature": "v1,AAAA" };
			const wrongSecret = headersFor(body, "wh_1", "someone_elses_secret");

			await expect(gateway().verifyWebhook(body, forged)).rejects.toBeInstanceOf(
				InvalidBillingWebhookSignatureError,
			);
			await expect(gateway().verifyWebhook(body, wrongSecret)).rejects.toBeInstanceOf(
				InvalidBillingWebhookSignatureError,
			);
			await expect(gateway().verifyWebhook(body, {})).rejects.toBeInstanceOf(
				InvalidBillingWebhookSignatureError,
			);
		});

		it("rejects a body that was changed after it was signed", async () => {
			const body = subscriptionPayload("subscription.active");
			const tampered = body.replace("user-1", "user-2");

			await expect(gateway().verifyWebhook(tampered, headersFor(body))).rejects.toBeInstanceOf(
				InvalidBillingWebhookSignatureError,
			);
		});

		it("returns a signed event of a type this SDK does not know as one without identity", async () => {
			const body = JSON.stringify({ type: "brand_new.event", timestamp: "2026-10-06T10:00:00Z", data: {} });

			const event = await gateway().verifyWebhook(body, headersFor(body, "wh_new"));

			expect(event).toMatchObject({ id: "wh_new", type: "brand_new.event" });
			expect(event.subscriptionId).toBeUndefined();
			expect(event.userId).toBeUndefined();
		});
	});
});

describe("Polar gateway configuration", () => {
	it("reaches the API at POLAR_API_URL when one is set, for a self-hosted Polar or a test double", async () => {
		api.reply("POST", "/v1/checkouts", { id: "co_env", url: "https://sandbox.polar.sh/checkout/co_env" });
		const fromEnv = polarGatewayFromEnv({
			POLAR_ACCESS_TOKEN: "polar_oat_env",
			POLAR_WEBHOOK_SECRET: SECRET,
			POLAR_ENVIRONMENT: "sandbox",
			POLAR_API_URL: baseUrl,
		});

		await fromEnv?.createCheckout({
			userId: "user-1",
			productId: "prod_monthly",
			successUrl: "https://typelapse.test/app?billing=success",
			returnUrl: "https://typelapse.test/app?billing=cancelled",
		});

		expect(api.seen[0]?.auth).toBe("Bearer polar_oat_env");
	});

	it("honours POLAR_API_URL only against the sandbox, never for production money", () => {
		const url = "http://127.0.0.1:9999";

		expect(polarApiUrlFromEnv({ POLAR_ENVIRONMENT: "sandbox", POLAR_API_URL: url })).toBe(url);
		expect(polarApiUrlFromEnv({ POLAR_API_URL: url })).toBeUndefined();
		expect(polarApiUrlFromEnv({ POLAR_ENVIRONMENT: "production", POLAR_API_URL: url })).toBeUndefined();
		expect(polarApiUrlFromEnv({ POLAR_ENVIRONMENT: "sandbox" })).toBeUndefined();
	});

	it("reads the environment, defaulting to production and refusing a typo", () => {
		expect(polarEnvironmentFromEnv({})).toBe("production");
		expect(polarEnvironmentFromEnv({ POLAR_ENVIRONMENT: "sandbox" })).toBe("sandbox");
		expect(polarEnvironmentFromEnv({ POLAR_ENVIRONMENT: " Production " })).toBe("production");
		expect(polarEnvironmentFromEnv({ POLAR_ENVIRONMENT: "sandbx" })).toBeNull();
	});

	it("stays unavailable when the token or the webhook secret is missing, or the environment is wrong", () => {
		expect(polarGatewayFromEnv({})).toBeNull();
		expect(polarGatewayFromEnv({ POLAR_ACCESS_TOKEN: "polar_oat_only" })).toBeNull();
		expect(polarGatewayFromEnv({ POLAR_WEBHOOK_SECRET: "secret_only" })).toBeNull();
		expect(
			polarGatewayFromEnv({
				POLAR_ACCESS_TOKEN: "polar_oat_x",
				POLAR_WEBHOOK_SECRET: "secret",
				POLAR_ENVIRONMENT: "sandbx",
			}),
		).toBeNull();
		expect(
			polarGatewayFromEnv({ POLAR_ACCESS_TOKEN: "polar_oat_x", POLAR_WEBHOOK_SECRET: "secret" }),
		).not.toBeNull();
	});
});
