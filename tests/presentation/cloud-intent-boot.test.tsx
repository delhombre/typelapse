import { Plan } from "@/domain/value-objects/plan";
import { HostedRenderSheet } from "@/presentation/components/controls/hosted-render-sheet";
import {
	CLOUD_CHOSEN_NOTICE,
	CLOUD_INTENT_WAIT_MS,
	CloudIntentBoot,
} from "@/presentation/components/layout/cloud-intent-boot";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderSheetStore } from "@/presentation/stores/hosted-render-sheet.store";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { scenesFromArrival } from "@/presentation/utils/shell-preferences";
import { hasArrivalPayload } from "@/presentation/utils/studio-draft";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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

const SHEET = "Render on Typelapse Cloud";
const FREE_ALLOWANCE =
	"You are using 0 of 3 cloud projects and 0 MB of 100 MB of media; hosted renders come with Creator.";
const SESSION = {
	account: { id: "usr_1", name: "Ada", email: "ada@example.com" },
	expiresAt: new Date(Date.now() + 60_000),
};

function land(hash: string): void {
	window.history.replaceState(null, "", `/app${hash}`);
}

function signedOut(): void {
	useAuthStore.setState({ status: { kind: "anonymous" } });
	usePlanStore.setState({ plan: Plan.free(), allowance: null, accountPlanKnown: false });
}

function signedIn(plan: Plan, allowance: string | null = null): void {
	useAuthStore.setState({ status: { kind: "authenticated", session: SESSION } });
	usePlanStore.setState({ plan, allowance, accountPlanKnown: true });
}

function studio() {
	return render(
		<StrictMode>
			<CloudIntentBoot />
			<HostedRenderSheet surface="stage" />
		</StrictMode>,
	);
}

beforeEach(() => {
	vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
	useExportStore.setState(useExportStore.getInitialState(), true);
	useHostedRenderSheetStore.setState({ openFor: null, opener: null });
	useNoticeStore.setState({ notices: [] });
	usePlanStore.setState({ billingAvailable: true, catalog: null, isUpgrading: false, error: null });
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllEnvs();
	land("");
});

describe("The Cloud intent, on arrival at /app#cloud", () => {
	it("signed out: opens the stage's sheet on what a hosted render adds and Sign in, and clears the hash", async () => {
		signedOut();
		land("#cloud");
		studio();

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText("Captions and audio baked into the video.")).toBeTruthy();
		expect(within(sheet).getAllByRole("button", { name: "Sign in" })).toHaveLength(1);
		expect(useHostedRenderSheetStore.getState().openFor).toBe("stage");
		expect(window.location.hash).toBe("");
		expect(window.location.pathname).toBe("/app");
		expect(useExportStore.getState().target).toBe("device");
	});

	it("Free: shows the allowance and one Upgrade, and chooses nothing", async () => {
		signedIn(Plan.free(), FREE_ALLOWANCE);
		land("#cloud");
		studio();

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText(FREE_ALLOWANCE)).toBeTruthy();
		expect(within(sheet).getAllByRole("button", { name: "Upgrade to Creator" })).toHaveLength(1);
		expect(within(sheet).queryByRole("button", { name: "Sign in" })).toBeNull();
		expect(useExportStore.getState().target).toBe("device");
	});

	it("Creator: selects Cloud and shows no sheet", async () => {
		signedIn(Plan.pro());
		land("#cloud");
		studio();

		await act(async () => {});
		expect(useExportStore.getState().target).toBe("cloud");
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
		expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
		expect(window.location.hash).toBe("");
	});

	it("waits for the session, so a Creator is never shown the signed-out offer", async () => {
		useAuthStore.setState({ status: { kind: "checking" } });
		usePlanStore.setState({ plan: Plan.free(), accountPlanKnown: false });
		land("#cloud");
		studio();

		await act(async () => {});
		// The hash is already consumed, the sheet is not up.
		expect(window.location.hash).toBe("");
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();

		await act(async () => {
			signedIn(Plan.pro());
		});
		expect(useExportStore.getState().target).toBe("cloud");
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
	});

	it("waits for a signed-in account's plan, then shows the Free view", async () => {
		useAuthStore.setState({ status: { kind: "authenticated", session: SESSION } });
		usePlanStore.setState({
			plan: Plan.free(),
			allowance: FREE_ALLOWANCE,
			accountPlanKnown: false,
		});
		land("#cloud");
		studio();

		await act(async () => {});
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();

		await act(async () => {
			usePlanStore.setState({ accountPlanKnown: true });
		});
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByRole("button", { name: "Upgrade to Creator" })).toBeTruthy();
	});

	it("opens the sheet after the wait when the session never answers, rather than doing nothing", async () => {
		vi.useFakeTimers();
		useAuthStore.setState({ status: { kind: "checking" } });
		land("#cloud");
		studio();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(CLOUD_INTENT_WAIT_MS - 1);
		});
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(useHostedRenderSheetStore.getState().openFor).toBe("stage");
	});

	it("does nothing in a local build, and still clears the hash", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		useAuthStore.setState({ status: { kind: "local-offline" } });
		land("#cloud");
		studio();

		await act(async () => {});
		expect(window.location.hash).toBe("");
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
		expect(useExportStore.getState().target).toBe("device");
	});

	it("answers once: a sheet closed is not opened again by a rerender", async () => {
		signedOut();
		land("#cloud");
		studio();
		await screen.findByRole("dialog", { name: SHEET });

		await act(async () => {
			useHostedRenderSheetStore.getState().close();
		});
		await act(async () => {
			signedOut();
		});
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
	});

	it("follows a hash that changes on a studio already open", async () => {
		signedOut();
		studio();
		await act(async () => {});
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();

		await act(async () => {
			land("#cloud");
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});
		expect(useHostedRenderSheetStore.getState().openFor).toBe("stage");
		expect(window.location.hash).toBe("");
	});

	it("on a studio already open, asks for the plan again first: an upgrade made in another tab", async () => {
		signedIn(Plan.free(), FREE_ALLOWANCE);
		const hashWhenAsked: string[] = [];
		const refresh = vi.fn(async () => {
			hashWhenAsked.push(window.location.hash);
			usePlanStore.setState({ plan: Plan.pro() });
		});
		usePlanStore.setState({ refresh });
		studio();
		await act(async () => {});

		await act(async () => {
			land("#cloud");
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledWith({ signedIn: true });
		// Scrubbed before the await, as on arrival.
		expect(hashWhenAsked).toEqual([""]);
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
		expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
		expect(useExportStore.getState().target).toBe("cloud");
	});

	it("does not ask for the plan on arrival, nor for a signed-out visitor", async () => {
		const refresh = vi.fn(async () => {});
		usePlanStore.setState({ refresh });
		signedOut();
		studio();
		await act(async () => {
			land("#cloud");
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		});
		expect(refresh).not.toHaveBeenCalled();
		expect(useHostedRenderSheetStore.getState().openFor).toBe("stage");
	});

	it("leaves a sheet the person already opened as it is, opener included", async () => {
		useAuthStore.setState({ status: { kind: "checking" } });
		land("#cloud");
		studio();
		await act(async () => {});

		// Cloud under Where, pressed while the intent waited for the session.
		const opener = document.createElement("button");
		document.body.append(opener);
		await act(async () => {
			useHostedRenderSheetStore.getState().show("rail", opener);
		});
		await act(async () => {
			useAuthStore.setState({ status: { kind: "anonymous" } });
		});

		expect(useHostedRenderSheetStore.getState().openFor).toBe("rail");
		expect(useHostedRenderSheetStore.getState().opener).toBe(opener);
		opener.remove();
	});

	it("tells a Creator once that Cloud is selected, and tells no one else", async () => {
		signedIn(Plan.pro());
		land("#cloud");
		studio();
		await act(async () => {});

		const messages = useNoticeStore.getState().notices.map((notice) => notice.message);
		expect(messages).toEqual([CLOUD_CHOSEN_NOTICE]);
		expect(CLOUD_CHOSEN_NOTICE).toBe("Cloud is selected under Where");
	});

	it("says nothing where the sheet opens or there is no Cloud", async () => {
		signedOut();
		land("#cloud");
		studio();
		await screen.findByRole("dialog", { name: SHEET });
		expect(useNoticeStore.getState().notices).toEqual([]);
	});

	it("leaves an unknown hash alone, for the reader that owns it", async () => {
		signedOut();
		land("#cloudy");
		studio();

		await act(async () => {});
		expect(window.location.hash).toBe("#cloudy");
		expect(useHostedRenderSheetStore.getState().openFor).toBeNull();
	});
});

describe("The other arrival readers ignore #cloud", () => {
	it("is no payload: the stored draft is still restored, and the outline draws the draft's mode", () => {
		expect(hasArrivalPayload("#cloud")).toBe(false);
		expect(scenesFromArrival("#cloud")).toBeNull();
	});
});
