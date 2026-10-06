import { request } from "@playwright/test";
import { createPolar } from "@polar-sh/sdk/2026-10";
import { HOSTED, accountId, newAccount, openAccountPanel, signUpInIsland } from "../support/hosted";
import { POLAR_E2E, postSignedBody, postSignedEvent, signedWebhookHeaders } from "../support/polar";
import { expect, openStudio, test } from "../support/studio";

/**
 * Billing through Polar, from the account island to the plan. Polar cannot reach
 * a laptop, so the journey posts the webhook to the local API itself: the route,
 * the signature check, the idempotency ledger and the projection are the real
 * ones; only the delivery is ours. Against the fake the body is synthetic;
 * against the sandbox it is Polar's own recorded body (see the sandbox journey).
 *
 * Two journeys, one per far end, and only one runs: against the fake Polar
 * (tests/support/fake-polar.ts) when there is no sandbox token, against
 * sandbox.polar.sh when POLAR_SANDBOX_ACCESS_TOKEN is set (the environment or
 * .env) and E2E_POLAR is not "fake".
 */

const FREE_ENDED =
	/Your Creator plan has ended; past renders stay downloadable until \d{1,2} \w+ \d{4}\./;
const PAST_DUE =
	/Your last payment failed and Creator is paused; update your card in Manage billing, and past renders stay downloadable until \d{1,2} \w+ \d{4}\./;

async function fakePolar<T>(method: "GET" | "PUT", path: string, data?: unknown): Promise<T> {
	const client = await request.newContext({ baseURL: POLAR_E2E.fakeUrl });
	try {
		const response = await client.fetch(path, { method, ...(data ? { data } : {}) });
		return (await response.json()) as T;
	} finally {
		await client.dispose();
	}
}

test.describe("Billing against the fake Polar", () => {
	test.skip(
		POLAR_E2E.mode !== "fake",
		"A Polar sandbox token is set: the sandbox journey runs instead.",
	);

	test("checkout, a webhook that makes the account Creator, a failed payment, then the plan ending", async ({
		page,
	}) => {
		const account = newAccount("billing");
		// Polar's hosted pages are not ours to load: the journey stops at the redirect.
		const reached: string[] = [];
		await page.route("https://sandbox.polar.sh/**", (route) => {
			reached.push(new URL(route.request().url()).pathname);
			return route.fulfill({ contentType: "text/html", body: "<title>Polar</title>" });
		});

		await openStudio(page);
		await signUpInIsland(page, account);
		let panel = await openAccountPanel(page, account);

		// The catalog is the two products' prices, as Polar returns them.
		await expect(panel.getByText("Free", { exact: true })).toBeVisible();
		await expect(panel.getByText("$12 / month")).toBeVisible();
		await expect(panel.getByText("$99 / year")).toBeVisible();
		await expect(panel.getByRole("status")).toHaveCount(0);

		// Annual checkout reaches Polar's hosted checkout with our account id as the customer.
		await panel.getByRole("button", { name: "Annual billing" }).click();
		await panel.getByRole("button", { name: "Upgrade to Creator" }).click();
		await expect.poll(() => reached.some((path) => path.startsWith("/checkout/"))).toBe(true);
		const id = await accountId(account.email);
		const asked = await fakePolar<{ route: string; body: Record<string, unknown> }[]>(
			"GET",
			"/__requests",
		);
		expect(asked.find((entry) => entry.route === "POST /v1/checkouts")?.body).toMatchObject({
			products: [POLAR_E2E.fakeProducts.annual],
			external_customer_id: id,
		});

		// The customer paid; Polar tells us. Nothing is Creator before that.
		const subscription = {
			subscriptionId: `sub_e2e_${id}`,
			customerId: `cus_e2e_${id}`,
			accountId: id,
		};
		const period = new Date(Date.now() + 30 * 86_400_000).toISOString();
		const polarSays = (status: string) =>
			fakePolar("PUT", `/__subscriptions/${subscription.subscriptionId}`, {
				status,
				customer_id: subscription.customerId,
				product_id: POLAR_E2E.fakeProducts.annual,
				current_period_end: period,
				cancel_at_period_end: false,
			});
		await polarSays("active");
		expect(await postSignedEvent({ ...subscription, type: "subscription.active" })).toMatchObject({
			outcome: "processed",
		});

		await openStudio(page);
		panel = await openAccountPanel(page, account);
		await expect(panel.getByText("Creator", { exact: true })).toBeVisible();
		await expect(panel.getByText(/hosted render minutes this month/)).toBeVisible();
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toHaveCount(0);

		// The portal opens for the account through a pre-authenticated session.
		await panel.getByRole("button", { name: "Manage billing" }).click();
		await expect.poll(() => reached.some((path) => path.startsWith(`/portal/${id}`))).toBe(true);

		// The card fails: Creator pauses, the island says why and offers the portal, not a second checkout.
		await polarSays("past_due");
		await postSignedEvent({ ...subscription, type: "subscription.past_due" });
		await openStudio(page);
		panel = await openAccountPanel(page, account);
		await expect(panel.getByRole("status")).toHaveText(PAST_DUE);
		await expect(panel.getByRole("button", { name: "Manage billing" })).toBeVisible();
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toHaveCount(0);
		await panel.screenshot({ path: "test-results/e2e-hosted/billing-past-due.png" });

		// Polar revokes it: free, with the 30 days of grace named, and Creator for sale again.
		await polarSays("canceled");
		await postSignedEvent({ ...subscription, type: "subscription.revoked" });
		await openStudio(page);
		panel = await openAccountPanel(page, account);
		await expect(panel.getByRole("status")).toHaveText(FREE_ENDED);
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toBeVisible();
		await panel.screenshot({ path: "test-results/e2e-hosted/billing-ended.png" });
	});

	test("refuses a webhook whose signature is not Polar's and never claims it", async () => {
		const body = JSON.stringify({
			type: "subscription.active",
			timestamp: new Date().toISOString(),
			data: {},
		});
		const api = await request.newContext({ baseURL: HOSTED.appUrl });
		try {
			const forged = await api.post("/api/billing/webhook", {
				headers: { ...signedWebhookHeaders(body, "wh_forged"), "webhook-signature": "v1,AAAA" },
				data: body,
			});
			expect(forged.status()).toBe(400);
			const unsigned = await api.post("/api/billing/webhook", { data: body });
			expect(unsigned.status()).toBe(400);
		} finally {
			await api.dispose();
		}
	});
});

/**
 * What is real and what is synthetic in the sandbox journey:
 *  - real: the products and their prices (created through the API), the hosted
 *    checkout and the 4242 test card, the subscription Polar creates, and the
 *    webhook BODY: it is read back from Polar's own delivery log
 *    (webhooks.listWebhookDeliveries), so `customer.external_id`, the timestamp
 *    and the object shape are exactly what Polar sent.
 *  - synthetic: the delivery and its signature. Polar cannot reach a laptop, so the
 *    recorded body is posted to the local API by this journey, signed with the
 *    journey's own secret (E2E_POLAR_WEBHOOK_SECRET). The webhook-id is Polar's event id.
 * Everything after the POST (verification, ledger, refresh from the API, projection,
 * island) is the product's own.
 */
test.describe("Billing against the Polar sandbox", () => {
	test.skip(
		POLAR_E2E.mode !== "sandbox",
		"No POLAR_SANDBOX_ACCESS_TOKEN (environment or .env), or E2E_POLAR=fake.",
	);

	/** A bad token or missing products must fail this journey, never skip it. */
	const WATCHED_EVENTS = [
		"subscription.active",
		"subscription.updated",
		"subscription.canceled",
		"subscription.uncanceled",
		"subscription.revoked",
		"subscription.past_due",
		"order.paid",
	] as const;
	const ENDPOINT_URL = "https://typelapse-e2e.invalid/api/billing/webhook";

	test("pays on Polar's hosted checkout with the 4242 test card and the plan flips to Creator", async ({
		page,
	}) => {
		test.setTimeout(300_000);
		const polar = createPolar({
			accessToken: POLAR_E2E.sandboxToken ?? "",
			environment: "sandbox",
		});
		const account = newAccount("sandbox");

		// An endpoint that exists makes Polar log the real body of every event, even though
		// it cannot deliver it here. Found by URL, so a second run reuses it.
		const endpoints = await polar.webhooks.listWebhookEndpoints({ limit: 100 });
		const endpoint =
			endpoints.items.find((candidate) => candidate.url === ENDPOINT_URL) ??
			(await polar.webhooks.createWebhookEndpoint({
				url: ENDPOINT_URL,
				name: "Typelapse hosted journey (never delivers)",
				format: "raw",
				events: [...WATCHED_EVENTS],
			}));

		await openStudio(page);
		await signUpInIsland(page, account);
		const panel = await openAccountPanel(page, account);
		await expect(
			panel.getByRole("button", { name: "Upgrade to Creator" }),
			"billing is off: the sandbox token could not read or create the two Creator products (see the API log)",
		).toBeVisible();
		await expect(panel.getByText("$12 / month")).toBeVisible();
		await expect(panel.getByText("$99 / year")).toBeVisible();

		await panel.getByRole("button", { name: "Upgrade to Creator" }).click();
		await page.waitForURL(/sandbox\.polar\.sh\/checkout\//, { timeout: 60_000 });

		// Polar's checkout: contact details, then Stripe's card fields in frames.
		await page.getByLabel(/email/i).first().fill(account.email);
		await page.getByLabel(/name/i).first().fill(account.name);
		const card = page.frameLocator('iframe[title*="card number" i]').first();
		await card.getByRole("textbox").fill("4242424242424242");
		await page
			.frameLocator('iframe[title*="expiration" i]')
			.first()
			.getByRole("textbox")
			.fill("1234");
		await page
			.frameLocator('iframe[title*="security code" i], iframe[title*="CVC" i]')
			.first()
			.getByRole("textbox")
			.fill("123");
		await page
			.getByRole("button", { name: /subscribe|pay|start/i })
			.last()
			.click();
		await page.waitForURL(/\/app\?billing=success/, { timeout: 120_000 });

		// The real delivery Polar logged for this account's subscription.active.
		const id = await accountId(account.email);
		let recorded: { body: string; eventId: string; subscriptionId: string } | undefined;
		await expect
			.poll(
				async () => {
					const deliveries = await polar.webhooks.listWebhookDeliveries({
						endpoint_id: endpoint.id,
						event_type: ["subscription.active"],
						limit: 50,
					});
					for (const delivery of deliveries.items) {
						const body = delivery.webhook_event.payload;
						if (!body) continue;
						const parsed = JSON.parse(body) as {
							data?: { id?: string; customer?: { external_id?: string | null } };
						};
						if (parsed.data?.customer?.external_id === id && parsed.data.id) {
							recorded = {
								body,
								eventId: delivery.webhook_event.id,
								subscriptionId: parsed.data.id,
							};
							return true;
						}
					}
					return false;
				},
				{ timeout: 90_000, message: "Polar logged no subscription.active for this account" },
			)
			.toBe(true);
		const payload = JSON.parse(recorded?.body ?? "{}") as {
			timestamp?: string;
			data?: { customer?: { external_id?: string } };
		};
		// Our account id travelled as external_customer_id and came back in Polar's own payload.
		expect(payload.data?.customer?.external_id).toBe(id);
		expect(Number.isNaN(Date.parse(payload.timestamp ?? ""))).toBe(false);

		expect(await postSignedBody(recorded?.body ?? "", recorded?.eventId ?? "")).toMatchObject({
			outcome: "processed",
		});

		await openStudio(page);
		const creator = await openAccountPanel(page, account);
		await expect(creator.getByText("Creator", { exact: true })).toBeVisible();
		await expect(creator.getByText(/hosted render minutes this month/)).toBeVisible();

		// Leave the sandbox tidy: revoke what this run bought.
		await polar.subscriptions.revoke(recorded?.subscriptionId ?? "");
	});
});
