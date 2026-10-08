import { Plan } from "@/domain/value-objects/plan";
import { BillingReturnBoot } from "@/presentation/components/layout/billing-return-boot";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import {
	BILLING_RETRY_MS,
	BILLING_RETRY_WINDOW_MS,
	type BillingReturnDeps,
	announceBillingReturn,
	takeBillingReturn,
} from "@/presentation/utils/billing-return";
import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function land(search: string, hash = "") {
	window.history.replaceState(null, "", `/app${search}${hash}`);
}

describe("the billing return address", () => {
	beforeEach(() => land(""));

	it("reads a finished checkout", () => {
		land("?billing=success");
		expect(takeBillingReturn()).toBe("success");
	});

	it("reads a checkout that was left", () => {
		land("?billing=cancelled");
		expect(takeBillingReturn()).toBe("cancelled");
	});

	it("reads nothing from an unknown value or no value", () => {
		land("?billing=maybe");
		expect(takeBillingReturn()).toBeNull();
		land("");
		expect(takeBillingReturn()).toBeNull();
	});

	it("drops the parameter, and only that one, in the same breath", () => {
		land("?ref=hn&billing=success&x=1", "#share=abc");
		expect(takeBillingReturn()).toBe("success");
		expect(window.location.search).toBe("?ref=hn&x=1");
		expect(window.location.hash).toBe("#share=abc");
		expect(window.location.pathname).toBe("/app");
	});

	it("scrubs an unknown value too, so it is not read on the next mount", () => {
		land("?billing=maybe");
		takeBillingReturn();
		expect(window.location.search).toBe("");
	});

	it("is read once: a second look finds nothing", () => {
		land("?billing=cancelled");
		takeBillingReturn();
		expect(takeBillingReturn()).toBeNull();
	});
});

/** What the announcement does, with the clock, the account and the plan in the test's hands. */
function harness(overrides: Partial<BillingReturnDeps> & { plans?: Plan[] } = {}) {
	const messages: string[] = [];
	const waits: number[] = [];
	const plans = overrides.plans ?? [Plan.free()];
	let asked = 0;
	const deps: BillingReturnDeps = {
		hosted: true,
		signedIn: async () => true,
		refreshPlan: async () => {
			const plan = plans[Math.min(asked, plans.length - 1)] as Plan;
			asked += 1;
			return plan;
		},
		notify: (message) => {
			messages.push(message);
		},
		wait: async (ms) => {
			waits.push(ms);
		},
		...overrides,
	};
	return { deps, messages, waits, asked: () => asked };
}

describe("announcing a return from checkout", () => {
	it("says Creator is on at once when the server already knows the plan", async () => {
		const run = harness({ plans: [Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual(["Creator is on."]);
		expect(run.asked()).toBe(1);
		expect(run.waits).toEqual([]);
	});

	it("says nothing until the server confirms: the webhook has not arrived, then it has", async () => {
		const run = harness({ plans: [Plan.free(), Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual(["Creator is on."]);
		expect(run.asked()).toBe(2);
		expect(run.waits).toEqual([BILLING_RETRY_MS]);
	});

	it("asks again every two seconds for twenty, then says only that the payment arrived", async () => {
		const run = harness({ plans: [Plan.free()] });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual(["Payment received. Your plan updates in a moment."]);
		expect(BILLING_RETRY_MS).toBe(2_000);
		expect(BILLING_RETRY_WINDOW_MS).toBe(20_000);
		// The first ask, then one per retry over the whole window.
		expect(run.asked()).toBe(1 + BILLING_RETRY_WINDOW_MS / BILLING_RETRY_MS);
		expect(run.waits.every((ms) => ms === BILLING_RETRY_MS)).toBe(true);
	});

	it("never says Creator is on before the plan is not Free", async () => {
		const run = harness({ plans: [Plan.free(), Plan.free(), Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual(["Creator is on."]);
		expect(run.asked()).toBe(3);
	});

	it("is silent in local mode: there is no plan to confirm", async () => {
		const run = harness({ hosted: false });
		await announceBillingReturn("success", run.deps);
		await announceBillingReturn("cancelled", run.deps);
		expect(run.messages).toEqual([]);
		expect(run.asked()).toBe(0);
	});

	it("is silent when nobody is signed in: the plan is not theirs to confirm", async () => {
		const run = harness({ signedIn: async () => false });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual([]);
		expect(run.asked()).toBe(0);
	});

	it("says nothing was charged after a cancelled checkout, in hosted mode, without asking the plan", async () => {
		const run = harness({ signedIn: async () => false });
		await announceBillingReturn("cancelled", run.deps);
		expect(run.messages).toEqual(["Checkout cancelled, nothing was charged."]);
		expect(run.asked()).toBe(0);
	});
});

describe("the notice a billing return raises in the studio", () => {
	const refresh = vi.fn(async () => undefined);

	beforeEach(() => {
		land("");
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useNoticeStore.setState({ notices: [] });
		refresh.mockReset();
		refresh.mockImplementation(async () => {
			usePlanStore.setState({ plan: Plan.pro() });
		});
		usePlanStore.setState({ plan: Plan.free(), refresh });
		useAuthStore.setState({
			status: {
				kind: "authenticated",
				session: { accountId: "a", email: "a@example.com" },
			} as never,
		});
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	const messages = () => useNoticeStore.getState().notices.map((notice) => notice.message);

	it("announces once, after the plan is confirmed, under StrictMode's double mount", async () => {
		land("?billing=success");
		render(
			<StrictMode>
				<BillingReturnBoot />
			</StrictMode>,
		);
		await waitFor(() => expect(messages()).toEqual(["Creator is on."]));
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledWith({ signedIn: true });
		expect(window.location.search).toBe("");
	});

	it("stays silent on an ordinary visit", async () => {
		render(<BillingReturnBoot />);
		await Promise.resolve();
		expect(messages()).toEqual([]);
		expect(refresh).not.toHaveBeenCalled();
	});

	it("is silent in a local build, and still drops the parameter", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		land("?billing=success");
		render(<BillingReturnBoot />);
		await Promise.resolve();
		expect(messages()).toEqual([]);
		expect(refresh).not.toHaveBeenCalled();
		expect(window.location.search).toBe("");
	});

	it("is silent when signed out", async () => {
		useAuthStore.setState({ status: { kind: "anonymous" } });
		land("?billing=success");
		render(<BillingReturnBoot />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(messages()).toEqual([]);
		expect(refresh).not.toHaveBeenCalled();
	});
});
