import type { BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { describe, expect, it, vi } from "vitest";

function billing(overrides: Partial<BillingPort> = {}): BillingPort {
	return {
		getCatalog: async () => ({
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		}),
		getCurrentPlan: async () => Plan.free(),
		startCheckout: async (_cadence) => ({
			url: "https://checkout.stripe.com/c/pay/test",
			sessionId: "cs_1",
		}),
		openPortal: async () => ({ url: "https://billing.stripe.com/p/session" }),
		...overrides,
	};
}

describe("deployment-aware plan store", () => {
	it("keeps local mode fully unlocked without calling hosted billing", async () => {
		const remote = billing({
			getCatalog: vi.fn(),
			getCurrentPlan: vi.fn(async () => Plan.pro()),
		});
		const store = createPlanStore({ deploymentMode: "local", billing: remote });

		await store.getState().refresh();

		expect(store.getState().plan.tier).toBe("local");
		expect(remote.getCurrentPlan).not.toHaveBeenCalled();
		expect(remote.getCatalog).not.toHaveBeenCalled();
	});

	it("starts hosted builds free and refreshes only from the server-authoritative plan", async () => {
		const remote = billing({ getCurrentPlan: vi.fn(async () => Plan.pro()) });
		const store = createPlanStore({ deploymentMode: "hosted", billing: remote });

		expect(store.getState().plan.tier).toBe("free");
		await store.getState().refresh();

		expect(store.getState().plan.tier).toBe("pro");
		expect(store.getState().billingAvailable).toBe(true);
		expect(store.getState().catalog?.creator.annual?.unitAmount).toBe(12000);
		expect(remote.getCurrentPlan).toHaveBeenCalledOnce();
	});

	it("keeps the server's allowance sentence and drops it when the server cannot give one", async () => {
		const sentence = "You are using 2 of 3 cloud projects and 12 MB of 100 MB of media.";
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ getAllowance: async () => sentence }),
		});

		await store.getState().refresh();
		expect(store.getState().allowance).toBe(sentence);

		const failing = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({
				getAllowance: async () => {
					throw new Error("Hosted allowance is not configured");
				},
			}),
		});
		await failing.getState().refresh();
		expect(failing.getState().allowance).toBeNull();
	});

	it("uses only validated adapter redirects for checkout and portal navigation", async () => {
		const navigate = vi.fn();
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing(),
			navigate,
		});

		store.getState().selectCadence("annual");
		await store.getState().upgrade();
		await store.getState().manageBilling();

		expect(navigate).toHaveBeenNthCalledWith(1, "https://checkout.stripe.com/c/pay/test");
		expect(navigate).toHaveBeenNthCalledWith(2, "https://billing.stripe.com/p/session");
	});

	it("keeps billing unavailable when the public catalog is not configured", async () => {
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ getCatalog: async () => Promise.reject(new Error("not configured")) }),
		});

		await store.getState().refresh();

		expect(store.getState().billingAvailable).toBe(false);
		expect(store.getState().catalog).toBeNull();
	});
});
