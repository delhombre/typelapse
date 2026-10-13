import { hostedOutputGraceDays } from "@/application/billing/plan-allowance";
import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Plan } from "@/domain/value-objects/plan";
import { cloudTargetTitle } from "@/presentation/components/controls/cloud-render";
import { ClusterPanel, RenderNotes } from "@/presentation/components/controls/cluster-panels";
import { StudioClusterMode } from "@/presentation/components/controls/studio-cluster-mode";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { useHostedRenderSheetStore } from "@/presentation/stores/hosted-render-sheet.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A finger rather than a cursor, switched per test. */
const pointer = vi.hoisted(() => {
	const state = { coarse: false };
	window.matchMedia = ((query: string) => ({
		matches:
			query.includes("reduced-motion") || (state.coarse && query.includes("pointer: coarse")),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	return state;
});

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
}));

const FREE_ALLOWANCE =
	"You are using 0 of 3 cloud projects and 0 MB of 100 MB of media; hosted renders come with Creator.";
const SHEET = "Render on Typelapse Cloud";
const CATALOG = {
	creator: {
		monthly: { currency: "USD", unitAmount: 1200 },
		annual: { currency: "USD", unitAmount: 9900 },
	},
};
const GRACE = `Renders stay downloadable while you are on Creator, and ${hostedOutputGraceDays(Plan.free())} days after.`;

/** Every call the studio makes; a gated Cloud makes none. */
function recordFetch(): string[] {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${String(input)}`);
			return Response.json({ error: "Not found" }, { status: 404 });
		}),
	);
	return calls;
}

function oneScene({ caption = false } = {}): void {
	const step = Step.create({
		code: "const a = 1;",
		duration: 1000,
		...(caption ? { annotation: "Why this line" } : {}),
	});
	const snippet = Snippet.create({
		title: "Cloud",
		code: "const a = 1;",
		language: "typescript",
	}).addStep(step);
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

const SESSION = {
	account: { id: "usr_1", name: "Ada", email: "ada@example.com" },
	expiresAt: new Date(Date.now() + 60_000),
};

function signedIn(plan: Plan): void {
	useAuthStore.setState({ status: { kind: "authenticated", session: SESSION } });
	usePlanStore.setState({ plan, accountPlanKnown: true });
}

function signedOut(): void {
	useAuthStore.setState({ status: { kind: "anonymous" } });
	usePlanStore.setState({ plan: Plan.free(), allowance: null, accountPlanKnown: false });
}

const PANELS: [string, () => ReactElement][] = [
	["the cluster panel", () => <ClusterPanel cluster="export" />],
	[
		"the rail mode",
		() => (
			<>
				<RenderNotes variant="pill" />
				<StudioClusterMode cluster="export" onClose={() => {}} />
			</>
		),
	],
];

function cloudChip(): HTMLButtonElement {
	return within(screen.getByRole("group", { name: "Where" })).getByRole("button", {
		name: "Cloud",
	}) as HTMLButtonElement;
}

describe.each(PANELS)("The hosted render sheet in %s", (_name, panel) => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useHostedRenderJobsStore.setState({ phase: { kind: "idle" }, allowance: null });
		useHostedRenderSheetStore.setState({ openFor: null, opener: null });
		usePlanStore.setState({
			plan: Plan.free(),
			allowance: null,
			catalog: null,
			billingAvailable: true,
			isUpgrading: false,
			error: null,
		});
		localStorage.clear();
		oneScene();
	});

	afterEach(() => {
		pointer.coarse = false;
		cleanup();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("is not offered by a local build: no Cloud, no link on the captions caveat", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		oneScene({ caption: true });
		signedIn(Plan.local());
		render(panel());

		expect(screen.queryByRole("button", { name: "Cloud" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Keep them with Cloud" })).toBeNull();
		expect(screen.getAllByText(/Captions are not baked on this device yet/).length).toBeGreaterThan(
			0,
		);
	});

	it("lists Cloud for a signed-out visitor, and pressing it explains a hosted render and offers sign-in", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		const calls = recordFetch();
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText("Captions and audio baked into the video.")).toBeTruthy();
		expect(within(sheet).getByText("Rendered on our servers, not on your device.")).toBeTruthy();
		// The third gain is the plan's, not storage a free account already has: a Creator's
		// renders do not expire, and a downgrade keeps them for the grace period.
		expect(within(sheet).getByText(GRACE)).toBeTruthy();
		expect(
			Plan.pro().keepsHostedOutput({
				completedAt: new Date(0),
				downgradedAt: null,
				now: new Date(),
			}),
		).toBe(true);
		// One filled action (DECISIONS D2), and nothing chosen or asked of the server yet.
		expect(within(sheet).getAllByRole("button", { name: "Sign in" })).toHaveLength(1);
		expect(useExportStore.getState().target).toBe("device");
		expect(calls.filter((call) => call.includes("/api/cloud"))).toEqual([]);

		// Sign in opens the code panel: the account's own form, in the sheet.
		fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
		expect(within(sheet).getByRole("textbox", { name: "Email" })).toBeTruthy();
		expect(within(sheet).getByRole("button", { name: "Email me a code" })).toBeTruthy();
	});

	it("closes on Escape without closing the export panel, and gives focus back to Cloud", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		const panelEscape = vi.fn();
		document.addEventListener("keydown", panelEscape);
		render(panel());

		cloudChip().focus();
		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		// Focus moves into the sheet on its first frame (a modal holds it).
		await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));

		fireEvent.keyDown(sheet, { key: "Escape" });

		await waitFor(() => expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull());
		// The island closes its panel on a document Escape: the sheet keeps the key.
		expect(panelEscape).not.toHaveBeenCalled();
		document.removeEventListener("keydown", panelEscape);
		expect(screen.getByRole("group", { name: "Where" })).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(cloudChip()));
	});

	it("shows a free account its allowance and one Upgrade to Creator, which starts checkout", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		const calls = recordFetch();
		const upgrade = vi.fn(async () => {});
		signedIn(Plan.free());
		usePlanStore.setState({ allowance: FREE_ALLOWANCE, upgrade });
		render(panel());

		fireEvent.click(cloudChip());

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText(FREE_ALLOWANCE)).toBeTruthy();
		expect(within(sheet).queryByRole("button", { name: "Sign in" })).toBeNull();
		fireEvent.click(within(sheet).getByRole("button", { name: "Upgrade to Creator" }));
		expect(upgrade).toHaveBeenCalledTimes(1);
		expect(useExportStore.getState().target).toBe("device");
		expect(calls.filter((call) => call.includes("/api/cloud/render"))).toEqual([]);
	});

	it("says it is opening checkout while it does, and keeps the button from a second press", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedIn(Plan.free());
		usePlanStore.setState({ allowance: FREE_ALLOWANCE, isUpgrading: true });
		render(panel());

		fireEvent.click(cloudChip());

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		// Busy, it stays focusable and says so; a press does nothing more (the store also
		// refuses a second checkout).
		const busy = within(sheet).getByRole("button", { name: "Opening secure checkout…" });
		expect(busy.getAttribute("aria-disabled")).toBe("true");
		expect((busy as HTMLButtonElement).disabled).toBe(false);
	});

	it("offers no upgrade where the server sells none, and still says what the plan includes", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedIn(Plan.free());
		usePlanStore.setState({ allowance: FREE_ALLOWANCE, billingAvailable: false });
		render(panel());

		fireEvent.click(cloudChip());

		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText(FREE_ALLOWANCE)).toBeTruthy();
		expect(within(sheet).queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
	});

	it("chooses Cloud at once for a Creator, with no sheet", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedIn(Plan.pro());
		render(panel());

		fireEvent.click(cloudChip());

		expect(useExportStore.getState().target).toBe("cloud");
		expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
	});

	it("presents a gated Cloud as what it is, a button that opens a dialog, and an open one as a choice", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		const { unmount } = render(panel());

		expect(cloudChip().getAttribute("aria-haspopup")).toBe("dialog");
		expect(cloudChip().hasAttribute("aria-pressed")).toBe(false);
		unmount();

		signedIn(Plan.pro());
		render(panel());
		expect(cloudChip().getAttribute("aria-pressed")).toBe("false");
		expect(cloudChip().hasAttribute("aria-haspopup")).toBe(false);
	});

	it("keeps its own title through the code step, with the form's heading and pitch left out", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

		const title = within(sheet).getByRole("heading", { name: SHEET });
		expect(title.className).not.toContain("sr-only");
		expect(within(sheet).getAllByRole("heading", { level: 2 })).toEqual([title]);
		expect(within(sheet).queryByText("Continue your work.")).toBeNull();
		expect(within(sheet).queryByText("On this device:")).toBeNull();
		expect(within(sheet).getByRole("button", { name: "Email me a code" })).toBeTruthy();
	});

	it("checks the address when it is left for another control in the sheet", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));
		const field = within(sheet).getByRole("textbox", { name: "Email" });
		fireEvent.change(field, { target: { value: "ada" } });
		fireEvent.blur(field, {
			relatedTarget: within(sheet).getByRole("button", { name: "Close", exact: true } as never),
		});

		expect(
			await within(sheet).findByText("Enter an email address like ada@example.com."),
		).toBeTruthy();
	});

	it("keeps focus in the sheet on a phone, where the address does not raise the keyboard", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		pointer.coarse = true;
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
		fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

		await waitFor(() =>
			expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: SHEET })),
		);
	});

	it("waits for a signed-in account's plan before it offers Creator, then chooses Cloud for a Creator", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		useAuthStore.setState({ status: { kind: "authenticated", session: SESSION } });
		usePlanStore.setState({ plan: Plan.free(), accountPlanKnown: false, allowance: null });
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText("Checking your plan…")).toBeTruthy();
		expect(within(sheet).queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
		expect(useExportStore.getState().target).toBe("device");

		act(() => usePlanStore.setState({ plan: Plan.pro(), accountPlanKnown: true }));

		await waitFor(() => expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull());
		expect(useExportStore.getState().target).toBe("cloud");
	});

	it("shows Creator's price from the public catalog, signed out and on Free alike", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		usePlanStore.setState({ catalog: CATALOG });
		const { unmount } = render(panel());

		fireEvent.click(cloudChip());
		let sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText("Creator is $99 / year, or $12 / month.")).toBeTruthy();
		unmount();
		useHostedRenderSheetStore.setState({ openFor: null, opener: null });

		signedIn(Plan.free());
		usePlanStore.setState({ allowance: FREE_ALLOWANCE });
		render(panel());
		fireEvent.click(cloudChip());
		sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).getByText("Creator is $99 / year, or $12 / month.")).toBeTruthy();
	});

	it("names no price where the catalog has none, and says test mode where the provider is its sandbox", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedIn(Plan.free());
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		expect(within(sheet).queryByText(/^Creator is /)).toBeNull();
		expect(within(sheet).queryByText("Test mode: no real charges")).toBeNull();

		act(() => usePlanStore.setState({ catalog: { ...CATALOG, environment: "sandbox" } }));
		expect(await within(sheet).findByText("Test mode: no real charges")).toBeTruthy();
	});

	it("chooses Cloud and closes once the account it was waiting for turns out to be Creator", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());
		await screen.findByRole("dialog", { name: SHEET });

		act(() => signedIn(Plan.pro()));

		await waitFor(() => expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull());
		expect(useExportStore.getState().target).toBe("cloud");
	});

	it("turns into the upgrade once a visitor signs in on Free", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		signedOut();
		render(panel());

		fireEvent.click(cloudChip());
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
		fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

		act(() => {
			signedIn(Plan.free());
			usePlanStore.setState({ allowance: FREE_ALLOWANCE });
		});

		expect(await within(sheet).findByRole("button", { name: "Upgrade to Creator" })).toBeTruthy();
		expect(within(sheet).queryByRole("textbox", { name: "Email" })).toBeNull();
		// The code field it held is gone: focus stays in the sheet, on its heading.
		await waitFor(() =>
			expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: SHEET })),
		);
	});

	it("links the captions caveat to the same sheet", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		oneScene({ caption: true });
		signedOut();
		render(panel());

		const links = screen.getAllByRole("button", { name: "Keep them with Cloud" });
		fireEvent.click(links[0] as HTMLButtonElement);

		expect(await screen.findByRole("dialog", { name: SHEET })).toBeTruthy();
		expect(useExportStore.getState().target).toBe("device");
	});

	it("gives focus to Cloud when the caveat link that opened it went away with its caveat", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		oneScene({ caption: true });
		signedOut();
		render(panel());

		const link = screen.getAllByRole("button", { name: "Keep them with Cloud" })[0] as HTMLElement;
		link.focus();
		fireEvent.click(link);
		const sheet = await screen.findByRole("dialog", { name: SHEET });
		await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));

		act(() => signedIn(Plan.pro()));

		await waitFor(() => expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull());
		expect(useExportStore.getState().target).toBe("cloud");
		await waitFor(() => expect(document.activeElement).toBe(cloudChip()));
	});

	it("lets the captions caveat choose Cloud outright for a Creator", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		recordFetch();
		oneScene({ caption: true });
		signedIn(Plan.pro());
		render(panel());

		const links = screen.getAllByRole("button", { name: "Keep them with Cloud" });
		fireEvent.click(links[0] as HTMLButtonElement);

		expect(useExportStore.getState().target).toBe("cloud");
		expect(screen.queryByRole("dialog", { name: SHEET })).toBeNull();
	});
});

describe("Cloud's tooltip", () => {
	it("says what the press does in each state", () => {
		expect(cloudTargetTitle("open")).toBe(
			"Saves this project to your private cloud and renders it on Typelapse servers.",
		);
		expect(cloudTargetTitle("sign-in")).toBe(
			"Renders on Typelapse servers, with captions and audio. Sign in to start.",
		);
		expect(cloudTargetTitle("upgrade")).toBe("Hosted renders come with Creator.");
		expect(cloudTargetTitle("pending")).toBe("Checking your plan.");
	});
});
