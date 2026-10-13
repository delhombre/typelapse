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

	it("stays busy once checkout is under way: the page is leaving, a second press opens nothing", async () => {
		const startCheckout = vi.fn(async () => ({
			url: "https://sandbox.polar.sh/checkout/co_leaving",
			sessionId: "cs_leaving",
		}));
		const navigate = vi.fn();
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ startCheckout }),
			navigate,
		});

		await store.getState().upgrade();
		expect(store.getState().isUpgrading).toBe(true);
		await store.getState().upgrade();

		expect(startCheckout).toHaveBeenCalledOnce();
		expect(navigate).toHaveBeenCalledOnce();
	});

	it("frees the button again when checkout fails, with the reason", async () => {
		const startCheckout = vi
			.fn()
			.mockRejectedValueOnce(new Error("Checkout is unavailable"))
			.mockResolvedValueOnce({ url: "https://sandbox.polar.sh/checkout/co_2", sessionId: "cs_2" });
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({ startCheckout }),
			navigate: vi.fn(),
		});

		await store.getState().upgrade();
		expect(store.getState().isUpgrading).toBe(false);
		expect(store.getState().error).toBe("Checkout is unavailable");
		await store.getState().upgrade();
		expect(startCheckout).toHaveBeenCalledTimes(2);
	});

	it("applies only the latest read when two overlap and the older one lands last", async () => {
		const catalogs: ((value: Awaited<ReturnType<BillingPort["getCatalog"]>>) => void)[] = [];
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({
				getCatalog: () =>
					new Promise((resolve) => {
						catalogs.push(resolve);
					}),
				getCurrentPlan: async () => Plan.pro(),
			}),
		});
		const catalog = { creator: { monthly: { currency: "USD", unitAmount: 1200 } } };

		// Signed out first, then signed in; the signed-out read answers last.
		const older = store.getState().refresh({ signedIn: false });
		await vi.waitFor(() => expect(catalogs).toHaveLength(1));
		const newer = store.getState().refresh({ signedIn: true });
		await vi.waitFor(() => expect(catalogs).toHaveLength(2));
		catalogs[1]?.(catalog);
		await newer;
		catalogs[0]?.(catalog);
		await older;

		expect(store.getState().plan.tier).toBe("pro");
		expect(store.getState().accountPlanKnown).toBe(true);
	});

	it("a read that was overtaken resolves only once the standing read has written", async () => {
		// The checkout return asks for the plan, then reads the store: if the account island
		// started its own read in between, the first ask must not resolve on an empty store.
		const catalogs: ((value: Awaited<ReturnType<BillingPort["getCatalog"]>>) => void)[] = [];
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing({
				getCatalog: () =>
					new Promise((resolve) => {
						catalogs.push(resolve);
					}),
				getCurrentPlan: async () => Plan.pro(),
				getNotice: async () => ({ kind: "ended", sentence: "Your Creator plan has ended." }),
			}),
		});
		const catalog = { creator: { monthly: { currency: "USD", unitAmount: 1200 } } };

		const overtaken = store.getState().refresh({ signedIn: true });
		await vi.waitFor(() => expect(catalogs).toHaveLength(1));
		const standing = store.getState().refresh({ signedIn: true });
		await vi.waitFor(() => expect(catalogs).toHaveLength(2));

		let overtakenResolved = false;
		void overtaken.then(() => {
			overtakenResolved = true;
		});
		catalogs[0]?.(catalog);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(overtakenResolved).toBe(false);

		catalogs[1]?.(catalog);
		await overtaken;
		await standing;
		expect(store.getState().plan.tier).toBe("pro");
		expect(store.getState().notice?.kind).toBe("ended");
	});

	it("frees the button for a page restored from the back-forward cache, with no error", async () => {
		const store = createPlanStore({
			deploymentMode: "hosted",
			billing: billing(),
			navigate: vi.fn(),
		});
		await store.getState().upgrade();
		expect(store.getState().isUpgrading).toBe(true);

		store.getState().releaseCheckout();

		expect(store.getState().isUpgrading).toBe(false);
		expect(store.getState().error).toBeNull();
	});
});
