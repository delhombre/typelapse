import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Plan } from "@/domain/value-objects/plan";
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

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
}));

const FREE_ALLOWANCE =
	"You are using 0 of 3 cloud projects and 0 MB of 100 MB of media; hosted renders come with Creator.";
const SHEET = "Render on Typelapse Cloud";

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
	usePlanStore.setState({ plan });
}

function signedOut(): void {
	useAuthStore.setState({ status: { kind: "anonymous" } });
	usePlanStore.setState({ plan: Plan.free(), allowance: null });
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
			billingAvailable: true,
			isUpgrading: false,
			error: null,
		});
		localStorage.clear();
		oneScene();
	});

	afterEach(() => {
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
		expect(within(sheet).getByText("Rendered on our servers, not on your laptop.")).toBeTruthy();
		expect(within(sheet).getByText("Kept in your private cloud storage.")).toBeTruthy();
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
		const busy = within(sheet).getByRole("button", { name: "Opening secure checkout…" });
		expect((busy as HTMLButtonElement).disabled).toBe(true);
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
