import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { expect, request } from "@playwright/test";
import { HOSTED } from "./hosted";

/**
 * Billing in the hosted journeys. Two modes, chosen once per run:
 *
 *  - "sandbox": the API talks to sandbox.polar.sh with the organisation token the
 *    owner put in POLAR_SANDBOX_ACCESS_TOKEN (the environment or .env). Real
 *    products, a real hosted checkout.
 *  - "fake": no token, or E2E_POLAR=fake: the API talks to tests/support/fake-polar.ts
 *    over HTTP. Same SDK, same gateway, same webhook route; only the far end is ours.
 *
 * Either way the webhook is a signed test event the journey posts to the local
 * API: a laptop has no public address for Polar to call.
 */

const SANDBOX_KEYS = ["POLAR_SANDBOX_ACCESS_TOKEN", "POLAR_SANDBOX_WEBHOOK_SECRET"] as const;

/** Only the two sandbox keys are read from .env: loading all of it would hand the servers a stray production token. */
function sandboxSetting(name: (typeof SANDBOX_KEYS)[number]): string | undefined {
	const fromEnvironment = process.env[name]?.trim();
	if (fromEnvironment) return fromEnvironment;
	if (!existsSync(".env")) return undefined;
	return parseEnv(readFileSync(".env", "utf8"))[name]?.trim() || undefined;
}

const sandboxToken = sandboxSetting("POLAR_SANDBOX_ACCESS_TOKEN");

// Generated once in the runner and inherited by every process it starts, like E2E_AUTH_SECRET.
process.env.E2E_POLAR_WEBHOOK_SECRET ??=
	sandboxSetting("POLAR_SANDBOX_WEBHOOK_SECRET") ?? `polar_whs_${randomBytes(24).toString("hex")}`;

export const POLAR_E2E = {
	mode: (sandboxToken && process.env.E2E_POLAR !== "fake" ? "sandbox" : "fake") as
		| "sandbox"
		| "fake",
	sandboxToken,
	webhookSecret: process.env.E2E_POLAR_WEBHOOK_SECRET as string,
	fakePort: Number(process.env.E2E_FAKE_POLAR_PORT ?? HOSTED.apiPort + 10),
	fakeUrl: `http://127.0.0.1:${Number(process.env.E2E_FAKE_POLAR_PORT ?? HOSTED.apiPort + 10)}`,
	/** The ids the fake serves; the sandbox ones are found or made by prepare.ts. */
	fakeProducts: { monthly: "prod_e2e_monthly", annual: "prod_e2e_annual" },
	/** Where prepare.ts leaves the sandbox product ids for the API to read. */
	productsEnvFile: `${HOSTED.state}/polar-products.env`,
};

/** The Polar variables of the hosted API: the double, the sandbox, or none at all. */
export function polarServerEnv(): Record<string, string> {
	if (POLAR_E2E.mode === "sandbox") {
		return {
			POLAR_ACCESS_TOKEN: POLAR_E2E.sandboxToken ?? "",
			POLAR_WEBHOOK_SECRET: POLAR_E2E.webhookSecret,
			POLAR_ENVIRONMENT: "sandbox",
			// The two product ids come from POLAR_E2E.productsEnvFile.
		};
	}
	return {
		POLAR_ACCESS_TOKEN: "polar_oat_e2e_fake",
		POLAR_WEBHOOK_SECRET: POLAR_E2E.webhookSecret,
		POLAR_ENVIRONMENT: "sandbox",
		POLAR_API_URL: POLAR_E2E.fakeUrl,
		POLAR_CREATOR_MONTHLY_PRODUCT_ID: POLAR_E2E.fakeProducts.monthly,
		POLAR_CREATOR_ANNUAL_PRODUCT_ID: POLAR_E2E.fakeProducts.annual,
	};
}

/** Standard Webhooks headers for a body, signed the way Polar signs a delivery. */
export function signedWebhookHeaders(body: string, id: string): Record<string, string> {
	const timestamp = Math.floor(Date.now() / 1000);
	const digest = createHmac("sha256", POLAR_E2E.webhookSecret)
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64");
	return {
		"content-type": "application/json",
		"webhook-id": id,
		"webhook-timestamp": String(timestamp),
		"webhook-signature": `v1,${digest}`,
	};
}

export interface SignedEvent {
	readonly type: string;
	readonly subscriptionId: string;
	readonly customerId: string;
	/** Our account id, which Polar knows as the customer's external id. */
	readonly accountId: string;
	readonly id?: string;
}

/** Post a signed test event to the local API's webhook route, as Polar would. */
export async function postSignedEvent(event: SignedEvent): Promise<{ outcome: string }> {
	const body = JSON.stringify({
		type: event.type,
		timestamp: new Date().toISOString(),
		api_version: "2026-10",
		data: {
			id: event.subscriptionId,
			customer_id: event.customerId,
			customer: { id: event.customerId, external_id: event.accountId },
		},
	});
	const id = event.id ?? `wh_e2e_${randomBytes(6).toString("hex")}`;
	const client = await request.newContext({ baseURL: HOSTED.appUrl });
	try {
		const response = await client.post("/api/billing/webhook", {
			headers: signedWebhookHeaders(body, id),
			data: body,
		});
		expect(response.status(), await response.text()).toBe(200);
		return (await response.json()) as { outcome: string };
	} finally {
		await client.dispose();
	}
}
