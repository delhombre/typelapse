import { HttpBillingAdapter } from "@/infrastructure/billing/http-billing.adapter";
import { describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("hosted billing client", () => {
	it("reads the public Creator catalog", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({
				creator: {
					monthly: { currency: "USD", unitAmount: 1200 },
					annual: { currency: "USD", unitAmount: 9900 },
				},
			}),
		);
		const billing = new HttpBillingAdapter(fetcher);

		await expect(billing.getCatalog()).resolves.toEqual({
			creator: {
				monthly: { currency: "USD", unitAmount: 1200 },
				annual: { currency: "USD", unitAmount: 9900 },
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
		const billing = new HttpBillingAdapter(fetcher);

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
			await expect(new HttpBillingAdapter().getAllowance()).resolves.toBe("Allowance.");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("reads the allowance sentence the server wrote, with session cookies", async () => {
		const sentence = "You are using 2 of 3 cloud projects and 12 MB of 100 MB of media.";
		const fetcher = vi.fn(async () => jsonResponse({ allowance: { plan: "free", sentence } }));
		const billing = new HttpBillingAdapter(fetcher);

		await expect(billing.getAllowance()).resolves.toBe(sentence);
		expect(fetcher).toHaveBeenCalledWith("/api/billing/allowance", { credentials: "include" });
		await expect(
			new HttpBillingAdapter(vi.fn(async () => jsonResponse({ allowance: {} }))).getAllowance(),
		).rejects.toThrow("allowance");
	});

	it("reads the notice the server wrote for an account whose billing is not in order", async () => {
		const notice =
			"Your last payment failed and Creator is paused; update your card in Manage billing.";
		const fetcher = vi.fn(async () =>
			jsonResponse({ plan: { tier: "free", notice: { kind: "past-due", sentence: notice } } }),
		);

		await expect(new HttpBillingAdapter(fetcher).getNotice()).resolves.toEqual({
			kind: "past-due",
			sentence: notice,
		});
		expect(fetcher).toHaveBeenCalledWith("/api/billing/plan", { credentials: "include" });
	});

	it("reads no notice when the server has none, or is older than the notice", async () => {
		for (const plan of [
			{ tier: "creator", notice: null },
			{ tier: "creator" },
			{ tier: "free", notice: { kind: "past-due", sentence: "  " } },
			{ tier: "free", notice: { kind: "other", sentence: "x" } },
		]) {
			const fetcher = vi.fn(async () => jsonResponse({ plan }));
			await expect(new HttpBillingAdapter(fetcher).getNotice()).resolves.toBeNull();
		}
	});

	it("never simulates a paid plan when the hosted backend refuses the request", async () => {
		const billing = new HttpBillingAdapter(
			vi.fn(async () => jsonResponse({ error: "Sign in" }, 401)),
		);

		await expect(billing.getCurrentPlan()).rejects.toThrow("Sign in");
	});

	it("starts checkout and opens the portal only from validated HTTPS redirects", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ url: "https://sandbox.polar.sh/checkout/co_test", sessionId: "cs_1" }),
			)
			.mockResolvedValueOnce(jsonResponse({ url: "https://sandbox.polar.sh/portal/session" }));
		const billing = new HttpBillingAdapter(fetcher);

		await expect(billing.startCheckout("annual")).resolves.toEqual({
			url: "https://sandbox.polar.sh/checkout/co_test",
			sessionId: "cs_1",
		});
		await expect(billing.openPortal()).resolves.toEqual({
			url: "https://sandbox.polar.sh/portal/session",
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
		const billing = new HttpBillingAdapter(
			vi.fn(async () => jsonResponse({ url: "javascript:alert(1)", sessionId: "cs_1" })),
		);

		await expect(billing.startCheckout("monthly")).rejects.toThrow("secure redirect URL");
	});
});
