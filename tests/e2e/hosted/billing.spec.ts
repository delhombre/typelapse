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
		let panel = await openAccountPanel(page, account, "Plan");

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
		// The fake's log outlives a test (a repetition, another worker's journey), so the
		// checkout is the one asked for this account, not the first one in the log.
		expect(
			asked.find(
				(entry) => entry.route === "POST /v1/checkouts" && entry.body.external_customer_id === id,
			)?.body,
		).toMatchObject({
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
		// Back from checkout before Polar has told us: the sheet says it is confirming, not nothing.
		await page.goto("/app?billing=success");
		await expect(page.getByRole("dialog", { name: "Confirming your payment" })).toBeVisible();
		await expect(page).toHaveURL(/\/app$/);

		await polarSays("active");
		expect(await postSignedEvent({ ...subscription, type: "subscription.active" })).toMatchObject({
			outcome: "processed",
		});

		// The next ask finds Creator and the same sheet turns into what changed.
		const sheet = page.getByRole("dialog", { name: "Creator is on." });
		await expect(sheet).toBeVisible({ timeout: 15_000 });
		await expect(sheet.getByText("Cloud is now under Where when you export.")).toBeVisible();
		await expect(sheet.getByText(/hosted render minutes this month/)).toBeVisible();
		await sheet.getByRole("button", { name: "Render in the cloud" }).click();
		await expect(sheet).toBeHidden();
		await page.getByRole("button", { name: /^Export · / }).click();
		await expect(
			page.getByRole("group", { name: "Where" }).getByRole("button", { name: "Cloud" }),
		).toHaveAttribute("aria-pressed", "true");

		await openStudio(page);
		panel = await openAccountPanel(page, account, "Plan");
		await expect(panel.getByText("Creator", { exact: true })).toBeVisible();
		await expect(panel.getByText(/hosted render minutes this month/)).toBeVisible();
		await expect(panel.getByText("Hosted render minutes", { exact: true })).toBeVisible();
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toHaveCount(0);

		// The portal opens for the account through a pre-authenticated session.
		await panel.getByRole("button", { name: "Manage billing" }).click();
		await expect.poll(() => reached.some((path) => path.startsWith(`/portal/${id}`))).toBe(true);

		// The card fails: Creator pauses, the island says why and offers the portal, not a second checkout.
		await polarSays("past_due");
		await postSignedEvent({ ...subscription, type: "subscription.past_due" });
		await openStudio(page);
		panel = await openAccountPanel(page, account);
		// Billing not in order: the sheet opens on Plan, so the notice is never behind a tab.
		await expect(panel.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
		await expect(panel.getByRole("status")).toHaveText(PAST_DUE);
		await expect(panel.getByRole("button", { name: "Manage billing" })).toBeVisible();
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toHaveCount(0);
		await panel.screenshot({ path: "test-results/e2e-hosted/billing-past-due.png" });

		// Polar revokes it: free, with the 30 days of grace named, and Creator for sale again.
		await polarSays("canceled");
		await postSignedEvent({ ...subscription, type: "subscription.revoked" });
		await openStudio(page);
		panel = await openAccountPanel(page, account);
		// Billing not in order: the sheet opens on Plan, so the notice is never behind a tab.
		await expect(panel.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
		await expect(panel.getByRole("status")).toHaveText(FREE_ENDED);
		await expect(panel.getByRole("button", { name: "Upgrade to Creator" })).toBeVisible();
		await panel.screenshot({ path: "test-results/e2e-hosted/billing-ended.png" });
	});

	test("a lapsed account that pays again is told what changed, with its earlier renders no longer expiring", async ({
		page,
	}) => {
		const account = newAccount("lapsed");
		await openStudio(page);
		await signUpInIsland(page, account);
		const id = await accountId(account.email);
		const period = new Date(Date.now() + 30 * 86_400_000).toISOString();
		const subscribe = async (subscriptionId: string, status: string, type: string) => {
			await fakePolar("PUT", `/__subscriptions/${subscriptionId}`, {
				status,
				customer_id: `cus_e2e_${id}`,
				product_id: POLAR_E2E.fakeProducts.annual,
				current_period_end: period,
				cancel_at_period_end: false,
			});
			expect(
				await postSignedEvent({
					subscriptionId,
					customerId: `cus_e2e_${id}`,
					accountId: id,
					type,
				}),
			).toMatchObject({ outcome: "processed" });
		};

		// Creator, then Polar revokes it: free, inside the 30 days of grace.
		await subscribe(`sub_e2e_${id}_first`, "active", "subscription.active");
		await subscribe(`sub_e2e_${id}_first`, "canceled", "subscription.revoked");

		// Back from a second checkout before Polar has said it is active: the first read
		// is still Free and still carries the ended plan's notice, so the sheet confirms.
		await page.goto("/app?billing=success");
		const confirming = page.getByRole("dialog", { name: "Confirming your payment" });
		await expect(confirming).toBeVisible();

		await subscribe(`sub_e2e_${id}_second`, "active", "subscription.active");

		const sheet = page.getByRole("dialog", { name: "Creator is on." });
		await expect(sheet).toBeVisible({ timeout: 15_000 });
		await expect(sheet.getByText("Cloud is now under Where when you export.")).toBeVisible();
		await expect(sheet.getByText(/hosted render minutes this month/)).toBeVisible();
		await expect(
			sheet.getByText("Your earlier renders no longer expire after 30 days."),
		).toBeVisible();
		await expect(sheet.getByRole("button", { name: "Render in the cloud" })).toHaveCount(1);
		await sheet.getByRole("button", { name: "Render in the cloud" }).click();
		await expect(sheet).toBeHidden();
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
		test.setTimeout(180_000);
		const polar = createPolar({
			accessToken: POLAR_E2E.sandboxToken ?? "",
			environment: "sandbox",
		});
		const account = newAccount("sandbox");

		// An endpoint that exists makes Polar log the real body of every event, even though
		// it cannot deliver it here. Found by URL, so a second run reuses it.
		const endpoints = await polar.webhooks.listWebhookEndpoints({ limit: 100 });
		const existing = endpoints.items.find((candidate) => candidate.url === ENDPOINT_URL);
		// Polar may disable an endpoint that always fails; a disabled one logs nothing.
		const endpoint = existing
			? existing.enabled
				? existing
				: await polar.webhooks.updateWebhookEndpoint(existing.id, { enabled: true })
			: await polar.webhooks.createWebhookEndpoint({
					url: ENDPOINT_URL,
					name: "Typelapse hosted journey (never delivers)",
					format: "raw",
					events: [...WATCHED_EVENTS],
				});

		const startedAt = new Date().toISOString();
		await openStudio(page);
		await signUpInIsland(page, account);
		const panel = await openAccountPanel(page, account, "Plan");
		await expect(
			panel.getByRole("button", { name: "Upgrade to Creator" }),
			"billing is off: the sandbox token could not read or create the two Creator products (see the API log)",
		).toBeVisible();
		await expect(panel.getByText("$12 / month")).toBeVisible();
		await expect(panel.getByText("$99 / year")).toBeVisible();

		await panel.getByRole("button", { name: "Upgrade to Creator" }).click();
		await page.waitForURL(/sandbox\.polar\.sh\/checkout\//, { timeout: 60_000 });

		// Polar's checkout form is long: at 720px tall the Subscribe click leaves the
		// page without confirming (no /confirm request), at 1400px it confirms. Observed
		// against sandbox.polar.sh; a tall viewport keeps the whole form on screen.
		await page.setViewportSize({ width: 1280, height: 1400 });
		const patches = new Set<unknown>();
		const isPatch = (request: { method(): string; url(): string }) =>
			request.method() === "PATCH" && request.url().includes("/v1/checkouts/client/");
		page.on("request", (request) => {
			if (isPatch(request)) patches.add(request);
		});
		const done = (request: { method(): string; url(): string }) => {
			patches.delete(request);
		};
		page.on("requestfinished", done);
		const confirmations: string[] = [];
		page.on("response", async (response) => {
			if (response.url().includes("/confirm")) {
				confirmations.push(
					`${response.status()} ${(await response.text().catch(() => "")).slice(0, 200)}`,
				);
			}
		});
		page.on("requestfailed", done);

		// Polar's checkout (https://sandbox.polar.sh/checkout/polar_c_...): contact details,
		// then Stripe's payment element in one frame titled "Secure payment input frame".
		// Polar refuses a reserved domain (.test) and one that does not accept mail
		// (example.com), so the checkout gets a throwaway address on a public inbox
		// domain: a random sandbox receipt is the only thing it can ever receive.
		const checkoutDomain = process.env.E2E_POLAR_CHECKOUT_EMAIL_DOMAIN ?? "mailinator.com";
		await page
			.getByRole("textbox", { name: "Email" })
			.fill(account.email.replace(/@.*/, `@${checkoutDomain}`));
		await page.getByRole("textbox", { name: "Cardholder name" }).fill(account.name);
		const stripe = page.frameLocator('iframe[title="Secure payment input frame"]');
		await stripe.getByRole("textbox", { name: "Card number" }).fill("4242424242424242");
		await stripe.getByRole("textbox", { name: "Expiration date" }).fill("12 / 34");
		await stripe.getByRole("textbox", { name: "Security code" }).fill("123");
		// The country is a custom picker over a native select; the select takes the ISO code.
		await page.locator("select").first().selectOption("US");
		// A US address asks for the rest of it, so tax can be worked out.
		await page.getByPlaceholder("Street address").fill("1 Main Street");
		await page.getByPlaceholder("Postal code").fill("10001");
		await page.getByPlaceholder("City").fill("New York");
		await page
			.locator("select")
			.filter({ has: page.locator('option[value="US-NY"], option[value="NY"]') })
			.first()
			.selectOption({ label: "New York" });
		// Every field edit patches the checkout (tax is recomputed server side); confirming
		// while one is in flight is a 409 "Checkout is currently being processed". So wait
		// for the tax line, then for the patches to stop, before pressing Subscribe.
		await expect(page.getByText(/^Taxes/).locator("..")).not.toContainText("\u2014");
		await expect.poll(() => patches.size, { timeout: 30_000 }).toBe(0);
		await page.waitForTimeout(1_500);
		await expect.poll(() => patches.size).toBe(0);
		await page.getByRole("button", { name: "Subscribe now" }).click();
		console.log(
			`checkout: ${new URL(page.url()).origin}${new URL(page.url()).pathname.replace(/polar_c_\w+/, "polar_c_<id>")}`,
		);
		await page.waitForURL(/\/app\?billing=success/, { timeout: 120_000 }).catch((error) => {
			throw new Error(
				`checkout did not return to the app; confirmations: ${confirmations.join(" | ")}`,
				{ cause: error },
			);
		});

		// The real delivery Polar logged for a given event of this account's subscription.
		const id = await accountId(account.email);
		const recordedDelivery = async (type: (typeof WATCHED_EVENTS)[number]) => {
			let found: { body: string; eventId: string; subscriptionId: string } | undefined;
			await expect
				.poll(
					async () => {
						const deliveries = await polar.webhooks.listWebhookDeliveries({
							endpoint_id: endpoint.id,
							event_type: [type],
							start_timestamp: startedAt,
							limit: 50,
						});
						for (const delivery of deliveries.items) {
							const body = delivery.webhook_event.payload;
							if (!body) continue;
							const parsed = JSON.parse(body) as {
								data?: { id?: string; customer?: { external_id?: string | null } };
							};
							if (parsed.data?.customer?.external_id === id && parsed.data.id) {
								found = {
									body,
									eventId: delivery.webhook_event.id,
									subscriptionId: parsed.data.id,
								};
								return true;
							}
						}
						return false;
					},
					{ timeout: 90_000, message: `Polar logged no ${type} for this account` },
				)
				.toBe(true);
			return found as { body: string; eventId: string; subscriptionId: string };
		};
		const recorded = await recordedDelivery("subscription.active");
		const payload = JSON.parse(recorded.body) as {
			timestamp?: string;
			data?: { customer?: { external_id?: string } };
		};
		// Our account id travelled as external_customer_id and came back in Polar's own payload.
		expect(payload.data?.customer?.external_id).toBe(id);
		// The delivery is for the subscription this checkout produced, not a stale one.
		const made = await polar.subscriptions.list({ external_customer_id: id, active: true });
		expect(made.items.map((subscription) => subscription.id)).toContain(recorded.subscriptionId);

		expect(await postSignedBody(recorded.body, recorded.eventId)).toMatchObject({
			outcome: "processed",
		});

		await openStudio(page);
		const creator = await openAccountPanel(page, account, "Plan");
		await expect(creator.getByText("Creator", { exact: true })).toBeVisible();
		await expect(creator.getByText(/hosted render minutes this month/)).toBeVisible();

		// The portal opens for the account through a pre-authenticated customer session.
		await creator.getByRole("button", { name: "Manage billing" }).click();
		await page.waitForURL(/sandbox\.polar\.sh\/.*portal/, { timeout: 60_000 });
		console.log(
			`portal: ${new URL(page.url()).origin}${new URL(page.url()).pathname.replace(/[^/]{16,}/g, "<id>")}`,
		);

		// Revoke what this run bought; Polar's own subscription.revoked delivery then ends the plan.
		await polar.subscriptions.revoke(recorded.subscriptionId);
		const revoked = await recordedDelivery("subscription.revoked");
		expect(revoked.subscriptionId).toBe(recorded.subscriptionId);
		expect(await postSignedBody(revoked.body, revoked.eventId)).toMatchObject({
			outcome: "processed",
		});
		await openStudio(page);
		const ended = await openAccountPanel(page, account);
		await expect(ended.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
		await expect(ended.getByRole("status")).toHaveText(FREE_ENDED);
		await expect(ended.getByRole("button", { name: "Upgrade to Creator" })).toBeVisible();
	});
});
