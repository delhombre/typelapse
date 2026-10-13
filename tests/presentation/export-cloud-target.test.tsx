import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Plan } from "@/domain/value-objects/plan";
import { ClusterPanel } from "@/presentation/components/controls/cluster-panels";
import { ExportStatus } from "@/presentation/components/controls/export-status";
import { StudioClusterMode } from "@/presentation/components/controls/studio-cluster-mode";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
	"You are using 0 of 3 cloud projects and 0 MB of 100 MB of media; hosted renders come with Creator.";

/** The hosted API as a free account sees it. */
function freeAccountApi() {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push(`${init?.method ?? "GET"} ${url}`);
			if (url === "/api/billing/allowance") {
				return Response.json({
					allowance: {
						plan: "free",
						sentence: FREE_ALLOWANCE,
						limits: { cloudProjects: 3, mediaBytes: 1, hostedRenderTime: 0, concurrentRenders: 0 },
						usage: {},
					},
				});
			}
			if (url === "/api/cloud/render") {
				return Response.json(
					{
						error: "Hosted renders come with Creator",
						code: "plan-limit",
						ceiling: "hostedRenderTime",
						limit: 0,
						used: 0,
						plan: "free",
						upgradeTo: "creator",
					},
					{ status: 402 },
				);
			}
			return Response.json({ error: "Not found" }, { status: 404 });
		}),
	);
	return calls;
}

function oneScene(): void {
	const snippet = Snippet.create({
		title: "Cloud",
		code: "const a = 1;",
		language: "typescript",
	}).addStep(Step.create({ code: "const a = 1;", duration: 1000 }));
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

function signedIn(): void {
	useAuthStore.setState({
		status: {
			kind: "authenticated",
			session: {
				account: { id: "usr_1", name: "Ada", email: "ada@example.com" },
				expiresAt: new Date(Date.now() + 60_000),
			},
		},
	});
}

const PANELS: [string, () => ReactElement][] = [
	["the cluster panel", () => <ClusterPanel cluster="export" />],
	["the rail mode", () => <StudioClusterMode cluster="export" onClose={() => {}} />],
];

function renderButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>(".si-cluster-cta, .si-mode-cta");
	if (!button) throw new Error("The export panel must show its render button");
	return button;
}

describe.each(PANELS)("Cloud under Where in %s", (_name, panel) => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useHostedRenderJobsStore.setState({ phase: { kind: "idle" }, allowance: null });
		localStorage.clear();
		oneScene();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("does not exist in a local build", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		const calls = freeAccountApi();
		signedIn();
		render(panel());

		expect(screen.queryByRole("button", { name: "Cloud" })).toBeNull();
		expect(calls).toEqual([]);
	});

	it("is listed for a signed-out visitor of a hosted build, and pressing it calls nothing", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		const calls = freeAccountApi();
		useAuthStore.setState({ status: { kind: "anonymous" } });
		usePlanStore.setState({ plan: Plan.free() });
		render(panel());

		// ux-waves D3: the paid side is visible to everyone, gated at the press
		// (the sheet it opens is pinned in hosted-render-sheet.test.tsx).
		fireEvent.click(screen.getByRole("button", { name: "Cloud" }));
		expect(useExportStore.getState().target).toBe("device");
		expect(calls).toEqual([]);
	});

	it("is not listed where the hosted build has no accounts to sign in to", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useAuthStore.setState({ status: { kind: "hosted-unconfigured" } });
		render(panel());

		expect(screen.queryByRole("button", { name: "Cloud" })).toBeNull();
	});

	it("keeps a free account whose Where is already Cloud (a plan that ended) on the server's 402, with Render still live", async () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		const calls = freeAccountApi();
		signedIn();
		usePlanStore.setState({ plan: Plan.free() });
		useExportStore.getState().setTarget("cloud");
		render(
			<>
				{panel()}
				<ExportStatus />
			</>,
		);

		// A press on Cloud would open the upgrade sheet; a Where chosen before the plan
		// ended still reads the allowance first, then meets the server's refusal.
		await waitFor(() =>
			expect(screen.getByTestId("cloud-render-status").textContent).toBe(FREE_ALLOWANCE),
		);

		fireEvent.click(renderButton());
		expect(await screen.findByText("Hosted renders come with Creator")).toBeTruthy();
		await waitFor(() => expect(renderButton().disabled).toBe(false));
		// Nothing was saved to the cloud for a render the plan does not include.
		expect(calls.filter((call) => call.includes("/api/projects"))).toEqual([]);
		expect(calls).toContain("POST /api/cloud/render");
	});
});
