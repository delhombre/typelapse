import { createStudioCompositionDocument } from "@/application/project/studio-composition";
import { Asset } from "@/domain/entities/asset";
import { AudioCue } from "@/domain/entities/audio-cue";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { ClusterPanel } from "@/presentation/components/controls/cluster-panels";
import { StudioClusterMode } from "@/presentation/components/controls/studio-cluster-mode";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	readStudioCompositionSnapshot,
	synchronizeStudioCompositionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function scenes(count: number): void {
	let snippet = Snippet.create({ title: "Panel", code: "const a = 1;", language: "typescript" });
	for (let index = 0; index < count; index += 1) {
		snippet = snippet.addStep(Step.create({ code: `const a = ${index};`, duration: 1000 }));
	}
	useSnippetStore.setState({ snippet, currentStepIndex: 0, playback: null });
	useStudioCompositionStore
		.getState()
		.loadDocument(createStudioCompositionDocument(readStudioCompositionSnapshot()));
	synchronizeStudioCompositionStore();
}

function audioCue(): void {
	const asset = Asset.create({
		id: "music",
		kind: "audio",
		fileName: "music.wav",
		mimeType: "audio/wav",
		byteSize: 1000,
		checksum: "music-checksum",
		durationMs: 4000,
	});
	useStudioCompositionStore
		.getState()
		.transact((project) =>
			project
				.registerAsset(asset)
				.addAudioCue(
					AudioCue.create({ id: "cue", assetId: asset.id, trim: { startMs: 0, endMs: 4000 } }),
				),
		);
}

const PANELS: [string, () => ReactElement][] = [
	["the cluster panel", () => <ClusterPanel cluster="export" />],
	["the rail mode", () => <StudioClusterMode cluster="export" onClose={() => {}} />],
];

/** The filled call to action; the rail names it by format and size, the panel by "Render". */
function renderButton(): HTMLButtonElement {
	const button = document.querySelector<HTMLButtonElement>(".si-cluster-cta, .si-mode-cta");
	if (!button) {
		throw new Error("The export panel must show its render button");
	}
	return button;
}

describe.each(PANELS)("export in %s", (_name, panel) => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
	});

	afterEach(() => cleanup());

	it("renders a project of one scene", () => {
		scenes(1);
		render(panel());

		expect(renderButton().disabled).toBe(false);
	});

	it("renders audio alone", () => {
		scenes(0);
		audioCue();
		render(panel());

		expect(renderButton().disabled).toBe(false);
	});

	it("says why it cannot render an empty project", () => {
		scenes(0);
		render(panel());

		expect(renderButton().disabled).toBe(true);
		expect(renderButton().title).toBe("A video needs at least one scene.");
	});

	it("chooses the frame rate the file is rendered at", () => {
		scenes(1);
		render(panel());

		fireEvent.click(screen.getByRole("button", { name: "24" }));
		expect(useExportStore.getState().fps).toBe(24);
		expect(screen.getByRole("button", { name: "24" }).getAttribute("aria-pressed")).toBe("true");

		fireEvent.click(screen.getByRole("button", { name: "30" }));
		expect(useExportStore.getState().fps).toBe(30);
	});
});
