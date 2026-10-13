import { planAllowance } from "@/application/billing/plan-allowance";
import type { BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { describe, expect, it, vi } from "vitest";

function billing(overrides: Partial<BillingPort> = {}): BillingPort {
	return {
		getCatalog: async () => ({
			creator: {
				monthly: { currency: "USD", unitAmount: 1200 },
				annual: { currency: "USD", unitAmount: 9900 },
			},
		}),
		getCurrentPlan: async () => Plan.free(),
		startCheckout: async (_cadence) => ({
			url: "https://sandbox.polar.sh/checkout/co_test",
			sessionId: "cs_1",
		}),
		openPortal: async () => ({ url: "https://sandbox.polar.sh/portal/session" }),
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
		expect(store.getState().catalog?.creator.annual?.unitAmount).toBe(9900);
		expect(remote.getCurrentPlan).toHaveBeenCalledOnce();
	});

	it("asks a signed-out visitor's browser only for the public catalog", async () => {
		const remote = billing({
			getCurrentPlan: vi.fn(async () => Plan.pro()),
			getAllowance: vi.fn(async () => "never read"),
		});
		const store = createPlanStore({ deploymentMode: "hosted", billing: remote });

		await store.getState().refresh({ signedIn: false });

		// Plan and allowance belong to an account: asking for them without one was
		// two 401s in the console on every first visit.
		expect(remote.getCurrentPlan).not.toHaveBeenCalled();
		expect(remote.getAllowance).not.toHaveBeenCalled();
		expect(store.getState().plan.tier).toBe("free");
		expect(store.getState().allowance).toBeNull();
		expect(store.getState().billingAvailable).toBe(true);
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

	it("keeps the allowance whole for the meter, and its sentence for everything else", async () => {
		const reading = planAllowance(
			Plan.free(),
			{ cloudProjects: 2, mediaBytes: 0, hostedRenderMsThisMonth: 0, activeRenders: 0 },
			new Date("2026-10-13T09:00:00.000Z"),
		);
		const read = vi.fn(async () => reading);
		const getAllowance = vi.fn(async () => "never read when the reader answers");
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ getAllowance }),
			allowanceReader: { read },
		});

		await store.getState().refresh();

		expect(store.getState().allowance).toBe(reading.sentence);
		expect(store.getState().allowanceDetail).toEqual(reading);
		expect(read).toHaveBeenCalledOnce();
		expect(getAllowance).not.toHaveBeenCalled();

		await store.getState().refresh({ signedIn: false });
		expect(store.getState().allowanceDetail).toBeNull();
		expect(read).toHaveBeenCalledOnce();
	});

	it("shows no meter when the allowance cannot be read, and none from a sentence alone", async () => {
		const failing = createPlanStore({
			deploymentMode: "hosted",
			billing: billing(),
			allowanceReader: {
				read: async () => {
					throw new Error("Hosted allowance is not configured");
				},
			},
		});
		await failing.getState().refresh();
		expect(failing.getState().allowance).toBeNull();
		expect(failing.getState().allowanceDetail).toBeNull();

		const sentenceOnly = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ getAllowance: async () => "You are using 1 of 3 cloud projects." }),
		});
		await sentenceOnly.getState().refresh();
		expect(sentenceOnly.getState().allowance).toBe("You are using 1 of 3 cloud projects.");
		expect(sentenceOnly.getState().allowanceDetail).toBeNull();
	});

	it("keeps the notice the server wrote, drops it when the server cannot give one, and never asks signed out", async () => {
		const notice =
			"Your last payment failed and Creator is paused; update your card in Manage billing.";
		const getNotice = vi.fn(async () => ({ kind: "past-due" as const, sentence: notice }));
		const store = createPlanStore({ deploymentMode: "hosted", billing: billing({ getNotice }) });

		await store.getState().refresh({ signedIn: false });
		expect(getNotice).not.toHaveBeenCalled();
		expect(store.getState().notice).toBeNull();

		await store.getState().refresh();
		expect(store.getState().notice).toEqual({ kind: "past-due", sentence: notice });

		const failing = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({
				getNotice: async () => {
					throw new Error("Billing is not configured");
				},
			}),
		});
		await failing.getState().refresh();
		expect(failing.getState().notice).toBeNull();
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

		expect(navigate).toHaveBeenNthCalledWith(1, "https://sandbox.polar.sh/checkout/co_test");
		expect(navigate).toHaveBeenNthCalledWith(2, "https://sandbox.polar.sh/portal/session");
	});

	it("asks billing for nothing when the server says billing is off", async () => {
		// Hosted without Polar: the capability read says so, and the catalog, plan,
		// allowance and notice reads were four 503s in the console on every load.
		const remote = billing({
			isConfigured: vi.fn(async () => false),
			getCatalog: vi.fn(),
			getCurrentPlan: vi.fn(),
			getAllowance: vi.fn(async () => "You are using 1 of 3 cloud projects."),
			getNotice: vi.fn(),
		});
		const store = createPlanStore({ deploymentMode: "hosted", billing: remote });

		await store.getState().refresh();

		// The allowance does not depend on checkout: a signed-in Free account keeps it.
		expect(store.getState().allowance).toBe("You are using 1 of 3 cloud projects.");
		await store.getState().refresh({ signedIn: false });

		expect(remote.getCatalog).not.toHaveBeenCalled();
		expect(remote.getCurrentPlan).not.toHaveBeenCalled();
		expect(remote.getAllowance).toHaveBeenCalledOnce();
		expect(remote.getNotice).not.toHaveBeenCalled();
		expect(store.getState().allowance).toBeNull();
		expect(store.getState().billingAvailable).toBe(false);
		expect(store.getState().plan.tier).toBe("free");
		// One answer for the session: billing does not switch on while the page is open.
		expect(remote.isConfigured).toHaveBeenCalledOnce();
	});

	it("reads billing as usual when the capability read itself rejects", async () => {
		const remote = billing({
			isConfigured: async () => Promise.reject(new Error("boom")),
			getCurrentPlan: vi.fn(async () => Plan.pro()),
		});
		const store = createPlanStore({ deploymentMode: "hosted", billing: remote });

		await store.getState().refresh();
		await store.getState().refresh();

		expect(store.getState().plan.tier).toBe("pro");
	});

	it("reads billing as usual when the server says it is configured", async () => {
		const remote = billing({
			isConfigured: async () => true,
			getCurrentPlan: vi.fn(async () => Plan.pro()),
		});
		const store = createPlanStore({ deploymentMode: "hosted", billing: remote });

		await store.getState().refresh();

		expect(store.getState().billingAvailable).toBe(true);
		expect(store.getState().plan.tier).toBe("pro");
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

	it("starts one checkout for two presses: the second waits on the first", async () => {
		let finish: (value: { url: string; sessionId: string }) => void = () => {};
		const startCheckout = vi.fn(
			() =>
				new Promise<{ url: string; sessionId: string }>((resolve) => {
					finish = resolve;
				}),
		);
		const navigate = vi.fn();
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ startCheckout }),
			navigate,
		});

		const first = store.getState().upgrade();
		const second = store.getState().upgrade();
		finish({ url: "https://sandbox.polar.sh/checkout/co_once", sessionId: "cs_once" });
		await Promise.all([first, second]);

		expect(startCheckout).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledOnce();
	});

	it("knows the account's plan only once a signed-in read has landed", async () => {
		let answer: (plan: Plan) => void = () => {};
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({
				getCurrentPlan: () =>
					new Promise<Plan>((resolve) => {
						answer = resolve;
					}),
			}),
		});
		expect(store.getState().accountPlanKnown).toBe(false);

		await store.getState().refresh({ signedIn: false });
		expect(store.getState().accountPlanKnown).toBe(false);

		const reading = store.getState().refresh({ signedIn: true });
		await Promise.resolve();
		expect(store.getState().accountPlanKnown).toBe(false);
		answer(Plan.pro());
		await reading;
		expect(store.getState().accountPlanKnown).toBe(true);
		expect(store.getState().plan.tier).toBe("pro");

		// Signed out again, the next account's plan is unknown until it is read.
		await store.getState().refresh({ signedIn: false });
		expect(store.getState().accountPlanKnown).toBe(false);
	});

	it("knows the plan at once in a local build, where it is always local", () => {
		const store = createPlanStore({ deploymentMode: "local", billing: billing() });
		expect(store.getState().accountPlanKnown).toBe(true);
	});
});
