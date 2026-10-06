import { type VideoScript, videoScript } from "@/application/export/video-script";
import { focusLineSet } from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import type { LaidOutToken, MagicMovePlan } from "@/application/magic-move/engine";
import type { ProjectDocumentV1, ProjectDocumentV2 } from "@/application/project/project-document";
import { compileCodeProject } from "@/application/render/compile-project";
import { frameAt } from "@/application/render/render-program";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	openStudioProjectDocument,
	studioProjectFileJson,
} from "@/presentation/utils/studio-project-replacement";
import { describe, expect, it, vi } from "vitest";

/**
 * The product decision behind #66: the studio writes V2 always, code-only
 * projects included, because a code-only project exported as V2 and opened
 * again plays the very frames the V1 path played, at every hold, transition
 * and loop boundary.
 */

vi.mock("@/presentation/studio-media-runtime", async () => {
	const { createSceneAssetSourceRegistry } = await import(
		"@/infrastructure/assets/scene-asset-source.registry"
	);
	const { BrowserObjectUrlSceneAssetSourceFactory } = await import(
		"@/infrastructure/assets/browser-local-media-importer"
	);
	return {
		studioLocalLibrary: { loadAsset: async () => null },
		studioMediaRegistry: createSceneAssetSourceRegistry(),
		studioMediaSourceFactory: new BrowserObjectUrlSceneAssetSourceFactory({
			createObjectURL: () => "blob:test",
			revokeObjectURL: () => undefined,
		}),
	};
});

const FPS = 30;

const PROJECTS: Record<string, ProjectDocumentV1> = {
	"focus, captions and a typewriter": {
		title: "Parity",
		code: "const total = a + b;\nexport { total };",
		language: "typescript",
		themeName: "dracula",
		background: "mesh:aurora",
		windowChrome: "terminal",
		transitionMs: 1000,
		transitionEasing: [0.2, 0.8, 0.2, 1],
		typewriter: true,
		focusZoom: true,
		progressStyle: "bar",
		watermark: "@typelapse",
		width: 1080,
		height: 1920,
		steps: [
			{ code: "const total = a;", duration: 1200, caption: "Start" },
			{ code: "const total = a + b;", duration: 800, focus: "1" },
			{ code: "const total = a + b;\nexport { total };", duration: 1500, focus: "2" },
		],
	},
	"two plain steps at the default tempo": {
		title: "Plain",
		code: "let x = 2;",
		language: "javascript",
		themeName: "midnight",
		background: "mesh:solar",
		steps: [
			{ code: "let x = 1;", duration: 1000 },
			{ code: "let x = 2;", duration: 1000 },
		],
	},
};

/** One token per word, keyed by the word, so different code gives different frames. */
function framesOf(code: string) {
	const tokens: LaidOutToken[] = [];
	for (const [line, text] of code.split("\n").entries()) {
		let col = 0;
		for (const word of text.split(" ")) {
			tokens.push({ key: `${line}:${word}`, content: word, line, col });
			col += word.length + 1;
		}
	}
	return { tokens, lineCount: code.split("\n").length };
}

function planOf(codes: readonly string[]): MagicMovePlan {
	const frames = codes.map(framesOf);
	return {
		frames,
		transitions: frames.slice(1).map((to, index) => ({
			from: frames[index]?.tokens ?? [],
			to: to.tokens,
		})),
	};
}

/** The script the on-device export builds from the studio, read the way its job reads it. */
function studioScript(loop: boolean, withEasing = true): VideoScript {
	const { snippet } = useSnippetStore.getState();
	const scenery = useExportStore.getState();
	return videoScript({
		plan: planOf(snippet.steps.map((step) => step.code)),
		durations: snippet.steps.map((step) => step.duration),
		transitionMs: scenery.transitionMs,
		...(withEasing ? { transitionEasing: scenery.transitionEasing } : {}),
		fps: FPS,
		loop,
		typewriter: scenery.typewriter,
		firstCode: snippet.steps[0]?.code ?? snippet.code,
		focusSets: snippet.steps.map((step) => {
			const lines = focusLineSet(step.highlightRanges, frameLineCount(step.code));
			return lines.size > 0 ? lines : undefined;
		}),
	});
}

/** Every segment's first and last frame, a transition midpoint, and the very end. */
function boundaries(script: VideoScript): number[] {
	const frames = new Set<number>([0, script.totalFrames - 1]);
	for (const segment of script.segments) {
		frames.add(segment.startFrame);
		frames.add(Math.max(segment.startFrame, segment.endFrame - 1));
		if (segment.type !== "hold") {
			frames.add(Math.floor((segment.startFrame + segment.endFrame) / 2));
		}
	}
	return [...frames].sort((a, b) => a - b);
}

const BLANK = JSON.stringify({
	title: "Blank",
	code: "const blank = 0;",
	language: "typescript",
	themeName: "nord",
});

describe.each(Object.entries(PROJECTS))("V2 parity: %s", (_name, project) => {
	it("survives the V2 round trip with the same studio state", () => {
		openStudioProjectDocument(JSON.stringify(project));
		const viaV1 = useSnippetStore.getState().toProjectPayload();
		const exported = studioProjectFileJson();

		openStudioProjectDocument(BLANK);
		openStudioProjectDocument(exported);

		expect(JSON.parse(exported).schemaVersion).toBe(2);
		expect(useSnippetStore.getState().toProjectPayload()).toEqual(viaV1);
	});

	it.each([false, true])("plays identical frames at every boundary (loop %s)", (loop) => {
		openStudioProjectDocument(JSON.stringify(project));
		const v1 = studioScript(loop);
		const v1Unwarped = studioScript(loop, false);
		const exported = JSON.parse(studioProjectFileJson()) as ProjectDocumentV2;

		openStudioProjectDocument(BLANK);
		openStudioProjectDocument(JSON.stringify(exported));
		const v2 = studioScript(loop);

		expect(v2.totalFrames).toBe(v1.totalFrames);
		expect(v2.segments).toEqual(v1.segments);
		const checked = boundaries(v1);
		expect(checked.length).toBeGreaterThan(6);
		for (const frame of checked) {
			expect(v2.frameAt(frame)).toEqual(v1.frameAt(frame));
		}

		// The V2 renderer seam reads the exported document itself and lands on the
		// frames the V1 studio script draws (that seam does not take the easing).
		const program = compileCodeProject({
			document: exported,
			codePlan: planOf(project.steps.map((step) => step.code)),
			fps: FPS,
			loop,
		});
		expect(program.totalFrames).toBe(v1Unwarped.totalFrames);
		for (const frame of checked) {
			const layer = frameAt(program, frame).layers[0];
			if (layer?.kind !== "code") {
				throw new Error("Expected a code layer");
			}
			expect(layer.frame).toEqual(v1Unwarped.frameAt(frame));
		}
	});
});

describe("V2 parity: settings changed after the project was opened", () => {
	it("exports the tempo, curve, typewriter and edits the studio holds now", () => {
		openStudioProjectDocument(JSON.stringify(PROJECTS["two plain steps at the default tempo"]));
		const exportStore = useExportStore.getState();
		exportStore.setTransitionMs(400);
		exportStore.setTransitionEasing([0.1, 0.9, 0.3, 1]);
		exportStore.setTypewriter(true);
		exportStore.setProgressStyle("none");
		const snippet = useSnippetStore.getState();
		const second = snippet.snippet.steps[1];
		if (!second) {
			throw new Error("Expected two steps");
		}
		snippet.updateStepDuration(second.id, 2400);
		snippet.setWatermark("@later");
		const viaV1 = useSnippetStore.getState().toProjectPayload();
		const v1 = studioScript(true);
		const exported = studioProjectFileJson();

		openStudioProjectDocument(BLANK);
		openStudioProjectDocument(exported);

		expect(useSnippetStore.getState().toProjectPayload()).toEqual(viaV1);
		const v2 = studioScript(true);
		for (const frame of boundaries(v1)) {
			expect(v2.frameAt(frame)).toEqual(v1.frameAt(frame));
		}
	});
});

describe("V2 parity: a live-code project", () => {
	it("keeps its live code and no captured steps", () => {
		openStudioProjectDocument(BLANK);
		const viaV1 = useSnippetStore.getState().toProjectPayload();
		const exported = studioProjectFileJson();

		openStudioProjectDocument(JSON.stringify(PROJECTS["two plain steps at the default tempo"]));
		openStudioProjectDocument(exported);

		expect(useSnippetStore.getState().toProjectPayload()).toEqual(viaV1);
		expect(useSnippetStore.getState().snippet.steps).toHaveLength(0);
	});
});
