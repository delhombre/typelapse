import { Plan } from "@/domain/value-objects/plan";
import { BillingReturnBoot } from "@/presentation/components/layout/billing-return-boot";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useBillingReturnStore } from "@/presentation/stores/billing-return.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import {
	BILLING_RETRY_MS,
	BILLING_RETRY_WINDOW_MS,
	type BillingReturnDeps,
	type BillingReturnPhase,
	announceBillingReturn,
	takeBillingReturn,
} from "@/presentation/utils/billing-return";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

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
	const phases: BillingReturnPhase[] = [];
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
		phase: (next) => {
			phases.push(next);
		},
		wait: async (ms) => {
			waits.push(ms);
		},
		signal: new AbortController().signal,
		...overrides,
	};
	return { deps, messages, phases, waits, asked: () => asked };
}

const kinds = (phases: readonly BillingReturnPhase[]) => phases.map((phase) => phase.kind);

describe("announcing a return from checkout", () => {
	it("confirms at once when the server already knows the plan, without a flash of confirming", async () => {
		const run = harness({ plans: [Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(kinds(run.phases)).toEqual(["confirmed"]);
		expect(run.phases[0]).toMatchObject({ plan: { tier: "pro" } });
		expect(run.messages).toEqual([]);
		expect(run.asked()).toBe(1);
		expect(run.waits).toEqual([]);
	});

	it("stays on confirming until the server confirms: the webhook has not arrived, then it has", async () => {
		const run = harness({ plans: [Plan.free(), Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(kinds(run.phases)).toEqual(["confirming", "confirmed"]);
		expect(run.asked()).toBe(2);
		expect(run.waits).toEqual([BILLING_RETRY_MS]);
	});

	it("asks again every two seconds for twenty, then times out", async () => {
		const run = harness({ plans: [Plan.free()] });
		await announceBillingReturn("success", run.deps);
		expect(kinds(run.phases)).toEqual(["confirming", "timed-out"]);
		expect(BILLING_RETRY_MS).toBe(2_000);
		expect(BILLING_RETRY_WINDOW_MS).toBe(20_000);
		// The first ask, then one per retry over the whole window.
		expect(run.asked()).toBe(1 + BILLING_RETRY_WINDOW_MS / BILLING_RETRY_MS);
		expect(run.waits.every((ms) => ms === BILLING_RETRY_MS)).toBe(true);
	});

	it("never confirms before the plan is not Free", async () => {
		const run = harness({ plans: [Plan.free(), Plan.free(), Plan.pro()] });
		await announceBillingReturn("success", run.deps);
		expect(kinds(run.phases)).toEqual(["confirming", "confirmed"]);
		expect(run.asked()).toBe(3);
	});

	it("says confirming only after the first read still says Free", async () => {
		const seen: string[] = [];
		const run = harness({
			plans: [Plan.free(), Plan.pro()],
			phase: (next) => {
				seen.push(`${next.kind} after ${run.asked()} asks`);
			},
		});
		await announceBillingReturn("success", run.deps);
		expect(seen).toEqual(["confirming after 1 asks", "confirmed after 2 asks"]);
	});

	it("stops asking, and says nothing more, once it is told to stop", async () => {
		const stop = new AbortController();
		const run = harness({
			plans: [Plan.free()],
			signal: stop.signal,
			wait: async () => {
				stop.abort();
			},
		});
		await announceBillingReturn("success", run.deps);
		// One ask, one wait that was cut short: no second ask, no timed-out sheet.
		expect(kinds(run.phases)).toEqual(["confirming"]);
		expect(run.asked()).toBe(1);
	});

	it("says nothing when it is stopped before the session has answered", async () => {
		const stop = new AbortController();
		const run = harness({
			signal: stop.signal,
			signedIn: async () => {
				stop.abort();
				return true;
			},
		});
		await announceBillingReturn("success", run.deps);
		expect(run.phases).toEqual([]);
		expect(run.asked()).toBe(0);
	});

	it("is silent in local mode: there is no plan to confirm", async () => {
		const run = harness({ hosted: false });
		await announceBillingReturn("success", run.deps);
		await announceBillingReturn("cancelled", run.deps);
		expect(run.messages).toEqual([]);
		expect(run.phases).toEqual([]);
		expect(run.asked()).toBe(0);
	});

	it("is silent when nobody is signed in, and never opens the sheet to close it again", async () => {
		const run = harness({ signedIn: async () => false });
		await announceBillingReturn("success", run.deps);
		expect(run.messages).toEqual([]);
		expect(run.phases).toEqual([]);
		expect(run.asked()).toBe(0);
	});

	it("keeps a cancelled checkout a toast, in hosted mode, without asking the plan", async () => {
		const run = harness({ signedIn: async () => false });
		await announceBillingReturn("cancelled", run.deps);
		expect(run.messages).toEqual(["Checkout cancelled, nothing was charged."]);
		expect(run.phases).toEqual([]);
		expect(run.asked()).toBe(0);
	});
});

describe("the sheet a billing return raises in the studio", () => {
	const refresh = vi.fn(async () => undefined);

	beforeEach(() => {
		land("");
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useNoticeStore.setState({ notices: [] });
		useBillingReturnStore.getState().reset();
		useExportStore.setState({ target: "device" });
		refresh.mockReset();
		refresh.mockImplementation(async () => {
			usePlanStore.setState({
				plan: Plan.pro(),
				allowance: "You are using 0 of 100 cloud projects.",
			});
		});
		usePlanStore.setState({
			plan: Plan.free(),
			allowance: null,
			catalog: null,
			notice: null,
			refresh,
		});
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
		vi.useRealTimers();
	});

	const messages = () => useNoticeStore.getState().notices.map((notice) => notice.message);
	const sheet = () => screen.queryByRole("dialog");

	it("opens once, after the plan is confirmed, under StrictMode's double mount", async () => {
		land("?billing=success");
		render(
			<StrictMode>
				<BillingReturnBoot />
			</StrictMode>,
		);

		const dialog = await screen.findByRole("dialog", { name: "Creator is on." });
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(dialog.textContent).toContain("Cloud is now under Where when you export.");
		// The allowance sentence is the plan store's own, as the server wrote it.
		expect(dialog.textContent).toContain("You are using 0 of 100 cloud projects.");
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledWith({ signedIn: true });
		expect(window.location.search).toBe("");
		expect(messages()).toEqual([]);
	});

	it("shows Confirming your payment while the plan is still Free, then the confirmed sheet", async () => {
		vi.useFakeTimers();
		refresh.mockImplementation(async () => undefined);
		land("?billing=success");
		render(<BillingReturnBoot />);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByRole("dialog", { name: "Confirming your payment" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Render in the cloud" })).toBeNull();

		refresh.mockImplementation(async () => {
			usePlanStore.setState({ plan: Plan.pro(), allowance: "You are using 0 of 100." });
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(BILLING_RETRY_MS);
		});

		expect(screen.getByRole("dialog", { name: "Creator is on." })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Render in the cloud" })).toBeTruthy();
	});

	it("keeps a poll that is still waiting through StrictMode's remount", async () => {
		vi.useFakeTimers();
		refresh.mockImplementation(async () => undefined);
		land("?billing=success");
		render(
			<StrictMode>
				<BillingReturnBoot />
			</StrictMode>,
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByRole("dialog", { name: "Confirming your payment" })).toBeTruthy();

		refresh.mockImplementation(async () => {
			usePlanStore.setState({ plan: Plan.pro(), allowance: "You are using 0 of 100." });
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(BILLING_RETRY_MS);
		});

		expect(screen.getByRole("dialog", { name: "Creator is on." })).toBeTruthy();
	});

	it("stops asking, and clears its timer, when the studio goes away", async () => {
		vi.useFakeTimers();
		refresh.mockImplementation(async () => undefined);
		land("?billing=success");
		const { unmount } = render(<BillingReturnBoot />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(refresh).toHaveBeenCalledTimes(1);

		unmount();
		await vi.advanceTimersByTimeAsync(BILLING_RETRY_WINDOW_MS + BILLING_RETRY_MS);

		expect(refresh).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("stops asking, and closes the sheet, when the person signs out mid-poll", async () => {
		vi.useFakeTimers();
		refresh.mockImplementation(async () => undefined);
		land("?billing=success");
		render(<BillingReturnBoot />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(screen.getByRole("dialog", { name: "Confirming your payment" })).toBeTruthy();

		act(() => {
			useAuthStore.setState({ status: { kind: "anonymous" } });
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(BILLING_RETRY_WINDOW_MS + BILLING_RETRY_MS);
		});

		expect(refresh).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("goes straight to Creator is on, with no confirming in between, when the webhook was first", async () => {
		const seen: string[] = [];
		const stop = useBillingReturnStore.subscribe((state) => {
			if (state.phase) {
				seen.push(state.phase.kind);
			}
		});
		land("?billing=success");
		render(<BillingReturnBoot />);
		await screen.findByRole("dialog", { name: "Creator is on." });
		stop();

		expect(seen).toEqual(["confirmed"]);
	});

	it("says the payment arrived when the window runs out", async () => {
		vi.useFakeTimers();
		refresh.mockImplementation(async () => undefined);
		land("?billing=success");
		render(<BillingReturnBoot />);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(BILLING_RETRY_WINDOW_MS + BILLING_RETRY_MS);
		});

		const dialog = screen.getByRole("dialog", { name: "Payment received." });
		expect(dialog.textContent).toContain("Your plan updates in a moment.");
		expect(screen.queryByRole("button", { name: "Render in the cloud" })).toBeNull();
	});

	it("sets Where to Cloud and closes when Render in the cloud is pressed", async () => {
		land("?billing=success");
		render(<BillingReturnBoot />);
		await screen.findByRole("dialog", { name: "Creator is on." });

		fireEvent.click(screen.getByRole("button", { name: "Render in the cloud" }));

		expect(useExportStore.getState().target).toBe("cloud");
		expect(useBillingReturnStore.getState().phase).toBeNull();
	});

	it("closes on Escape and on its close button without touching Where, and stays closed", async () => {
		land("?billing=success");
		render(<BillingReturnBoot />);
		const dialog = await screen.findByRole("dialog", { name: "Creator is on." });

		fireEvent.keyDown(dialog, { key: "Escape" });

		expect(useBillingReturnStore.getState().phase).toBeNull();
		expect(useExportStore.getState().target).toBe("device");
		// A late confirmation does not bring it back over the person's work.
		act(() => {
			useBillingReturnStore.getState().show({ kind: "timed-out" });
		});
		expect(useBillingReturnStore.getState().phase).toBeNull();
	});

	it("is a named dialog with a close button, and says its phase in a live region", async () => {
		land("?billing=success");
		render(<BillingReturnBoot />);
		const dialog = await screen.findByRole("dialog", { name: "Creator is on." });

		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		const live = dialog.querySelector("[aria-live]");
		expect(live?.querySelector(".sr-only")?.textContent).toBe("Creator is on.");
		expect(dialog.querySelector("[aria-busy]")).toBeNull();
	});

	it("adds the sandbox line when the billing catalog says the provider is a sandbox", async () => {
		usePlanStore.setState({
			catalog: {
				environment: "sandbox",
				creator: { monthly: { currency: "USD", unitAmount: 1200 } },
			},
		});
		land("?billing=success");
		render(<BillingReturnBoot />);
		const dialog = await screen.findByRole("dialog", { name: "Creator is on." });

		expect(dialog.textContent).toContain("Test mode: no real charges");
	});

	it("leaves the sandbox line out of a production build", async () => {
		usePlanStore.setState({
			catalog: {
				environment: "production",
				creator: { monthly: { currency: "USD", unitAmount: 1200 } },
			},
		});
		land("?billing=success");
		render(<BillingReturnBoot />);
		const dialog = await screen.findByRole("dialog", { name: "Creator is on." });

		expect(dialog.textContent).not.toContain("Test mode");
	});

	it("says what the new plan lifts only for an account that had lapsed", async () => {
		land("?billing=success");
		render(<BillingReturnBoot />);
		const plain = await screen.findByRole("dialog", { name: "Creator is on." });
		expect(plain.textContent).not.toContain("no longer expire");

		cleanup();
		useBillingReturnStore.getState().reset();
		usePlanStore.setState({
			plan: Plan.free(),
			notice: { kind: "ended", sentence: "Your Creator plan has ended." },
		});
		refresh.mockImplementation(async () => {
			usePlanStore.setState({ plan: Plan.pro() });
		});
		land("?billing=success");
		render(<BillingReturnBoot />);
		const lapsed = await screen.findByRole("dialog", { name: "Creator is on." });

		// The day count is the Free plan's own grace, read from the domain.
		expect(lapsed.textContent).toContain("Your earlier renders no longer expire after 30 days.");
	});

	it("keeps a cancelled checkout a toast, with no sheet", async () => {
		land("?billing=cancelled");
		render(<BillingReturnBoot />);

		await waitFor(() => expect(messages()).toEqual(["Checkout cancelled, nothing was charged."]));
		expect(sheet()).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("stays silent on an ordinary visit", async () => {
		render(<BillingReturnBoot />);
		await Promise.resolve();
		expect(messages()).toEqual([]);
		expect(sheet()).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});

	it("is silent in a local build, and still drops the parameter", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		land("?billing=success");
		render(<BillingReturnBoot />);
		await Promise.resolve();
		expect(messages()).toEqual([]);
		expect(sheet()).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
		expect(window.location.search).toBe("");
	});

	it("is silent when signed out: no sheet, no flash", async () => {
		useAuthStore.setState({ status: { kind: "anonymous" } });
		land("?billing=success");
		render(<BillingReturnBoot />);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(messages()).toEqual([]);
		expect(sheet()).toBeNull();
		expect(useBillingReturnStore.getState().phase).toBeNull();
		expect(refresh).not.toHaveBeenCalled();
	});
});
