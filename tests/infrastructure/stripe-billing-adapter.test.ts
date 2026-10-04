import { StripeBillingAdapter } from "@/infrastructure/billing/stripe-billing.adapter";
import { describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("hosted Stripe billing client", () => {
	it("reads the public Stripe-backed Creator catalog", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({
				creator: {
					monthly: { currency: "EUR", unitAmount: 1200 },
					annual: { currency: "EUR", unitAmount: 12000 },
				},
			}),
		);
		const billing = new StripeBillingAdapter(fetcher);

		await expect(billing.getCatalog()).resolves.toEqual({
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		});
		expect(fetcher).toHaveBeenCalledWith("/api/billing/catalog", {
			credentials: "include",
		});
	});

	it("reads the server-authoritative Creator plan with session cookies", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({
				plan: { tier: "creator", currentPeriodEnd: null, cancelAtPeriodEnd: false },
			}),
		);
		const billing = new StripeBillingAdapter(fetcher);

		const plan = await billing.getCurrentPlan();

		expect(plan.isPro).toBe(true);
		expect(fetcher).toHaveBeenCalledWith("/api/billing/plan", {
			credentials: "include",
		});
	});

	it("calls the browser fetch unbound, as browsers require", async () => {
		// A real window.fetch throws "Illegal invocation" when called as a method
		// of another object, which made every billing call fail in the browser.
		vi.stubGlobal("fetch", function (this: unknown) {
			if (this !== undefined && this !== globalThis) {
				return Promise.reject(new TypeError("Illegal invocation"));
			}
			return Promise.resolve(jsonResponse({ allowance: { sentence: "Allowance." } }));
		});
		try {
			await expect(new StripeBillingAdapter().getAllowance()).resolves.toBe("Allowance.");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("reads the allowance sentence the server wrote, with session cookies", async () => {
		const sentence = "You are using 2 of 3 cloud projects and 12 MB of 100 MB of media.";
		const fetcher = vi.fn(async () => jsonResponse({ allowance: { plan: "free", sentence } }));
		const billing = new StripeBillingAdapter(fetcher);

		await expect(billing.getAllowance()).resolves.toBe(sentence);
		expect(fetcher).toHaveBeenCalledWith("/api/billing/allowance", { credentials: "include" });
		await expect(
			new StripeBillingAdapter(vi.fn(async () => jsonResponse({ allowance: {} }))).getAllowance(),
		).rejects.toThrow("allowance");
	});

	it("never simulates a paid plan when the hosted backend refuses the request", async () => {
		const billing = new StripeBillingAdapter(
			vi.fn(async () => jsonResponse({ error: "Sign in" }, 401)),
		);

		await expect(billing.getCurrentPlan()).rejects.toThrow("Sign in");
	});

	it("starts Checkout and opens Portal only from validated HTTPS redirects", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ url: "https://checkout.stripe.com/c/pay/test", sessionId: "cs_1" }),
			)
			.mockResolvedValueOnce(jsonResponse({ url: "https://billing.stripe.com/p/session" }));
		const billing = new StripeBillingAdapter(fetcher);

		await expect(billing.startCheckout("annual")).resolves.toEqual({
			url: "https://checkout.stripe.com/c/pay/test",
			sessionId: "cs_1",
		});
		await expect(billing.openPortal()).resolves.toEqual({
			url: "https://billing.stripe.com/p/session",
		});
		expect(fetcher).toHaveBeenNthCalledWith(1, "/api/billing/checkout", {
			method: "POST",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ cadence: "annual" }),
		});
		expect(fetcher).toHaveBeenNthCalledWith(2, "/api/billing/portal", {
			method: "POST",
			credentials: "include",
		});
	});

	it("refuses malformed or unsafe redirect responses", async () => {
		const billing = new StripeBillingAdapter(
			vi.fn(async () => jsonResponse({ url: "javascript:alert(1)", sessionId: "cs_1" })),
		);

		await expect(billing.startCheckout("monthly")).rejects.toThrow("secure redirect URL");
	});
});
