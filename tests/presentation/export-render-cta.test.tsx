import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { ClusterPanel } from "@/presentation/components/controls/cluster-panels";
import { StudioClusterMode } from "@/presentation/components/controls/studio-cluster-mode";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, render, screen, within } from "@testing-library/react";
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

function oneScene(): void {
	const snippet = Snippet.create({
		title: "Render",
		code: "const a = 1;",
		language: "typescript",
	}).addStep(Step.create({ code: "const a = 1;", duration: 1000 }));
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
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

describe.each(PANELS)("the export panel in %s", (_name, panel) => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useHostedRenderJobsStore.setState({ phase: { kind: "idle" }, allowance: null });
		useAuthStore.setState({ status: { kind: "anonymous" } });
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ error: "Not found" }, { status: 404 })),
		);
		localStorage.clear();
		oneScene();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("offers Server in a local build, where the Remotion routes run", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		render(panel());

		expect(screen.getByRole("button", { name: "Server" })).toBeTruthy();
	});

	it("does not offer Server in a hosted build, which mounts no /api/render", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		render(panel());

		expect(screen.queryByRole("button", { name: "Server" })).toBeNull();
	});

	it("names the render button by what it shows while a render runs", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		useExportStore.setState({ isExporting: true });
		render(panel());

		const button = renderButton();
		expect(screen.getByRole("button", { name: "Rendering…" })).toBe(button);
		expect(screen.queryByRole("button", { name: /^Export/ })).toBeNull();
	});

	it("tells a screen reader which question each row of choices answers", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		render(panel());

		for (const name of ["Format", "Size", "FPS", "Where"]) {
			expect(screen.getByRole("group", { name })).toBeTruthy();
		}
		expect(
			within(screen.getByRole("group", { name: "Where" })).getByRole("button", { name: "Server" }),
		).toBeTruthy();
	});

	it("stays focusable while it renders, so a keyboard user keeps their place", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		const exportVideo = vi.fn(async () => {});
		useExportStore.setState({ isExporting: true, exportVideo });
		render(panel());

		const button = renderButton();
		// A disabled button drops focus to the page the moment it is pressed.
		expect(button.disabled).toBe(false);
		expect(button.getAttribute("aria-disabled")).toBe("true");
		button.click();
		expect(exportVideo).not.toHaveBeenCalled();
	});

	it("names it Render when idle, never Export", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		render(panel());

		expect(screen.getByRole("button", { name: /^Render/ })).toBe(renderButton());
	});

	it("keeps every label it can show in the button, so pressing it does not change its width", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		render(panel());

		const labels = Array.from(renderButton().querySelectorAll(".si-cta-labels > span")).map(
			(label) => label.textContent,
		);
		expect(labels).toEqual(expect.arrayContaining(["Rendering…", "Saving…", "Sending…"]));
		const shown = renderButton().querySelectorAll(".si-cta-labels > span:not([aria-hidden])");
		expect(shown).toHaveLength(1);
	});
});
