/**
 * A blank scene (ticket #96) has no code card, and no renderer draws one on
 * it: the DOM preview and the canvas painter fade the card by
 * `primaryCodeOpacity`, the server composition draws only the code layers the
 * compiler resolves. Through a transition the neighbouring card fades where it
 * stands.
 */

import { layeredFrameAt } from "@/application/frame-painter/composition";
import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addTextLayer } from "@/application/project/multimedia-authoring";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import {
	type StudioCompositionSnapshot,
	createStudioCompositionDocument,
} from "@/application/project/studio-composition";
import { hasCodeCard, primaryCodeOpacity } from "@/application/render/composition-slots";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { describe, expect, it } from "vitest";

const FPS = 60;

function snapshot(scenes: StudioCompositionSnapshot["scenes"]): StudioCompositionSnapshot {
	return {
		projectId: "launch",
		title: "Launch",
		language: "typescript",
		themeName: "midnight",
		fontFamily: "JetBrains Mono",
		borderRadius: 12,
		background: "mesh:solar",
		windowChrome: "macos",
		showLineNumbers: true,
		lineNumberStart: 1,
		framePadding: 24,
		cardMargin: 32,
		canvas: { width: 1920, height: 1080 },
		transitionMs: 650,
		transitionEasing: [0.76, 0, 0.24, 1],
		typewriter: false,
		focusZoom: false,
		progressStyle: "none",
		watermark: "",
		scenes,
	};
}

/** A title card (1 s) before a code scene (1 s), with the default 650 ms morph. */
function titleThenCode() {
	const composed = hydrateProjectDocument(
		createStudioCompositionDocument(
			snapshot([
				{ id: "title", code: "", durationMs: 1_000 },
				{ id: "code", code: "const a = 1;", durationMs: 1_000 },
			]),
		),
	);
	return serializeProjectDocument({
		...composed,
		project: addTextLayer(composed.project, "title", { id: "headline", text: "Ship it" }),
	});
}

describe("a blank scene's card", () => {
	const document = titleThenCode();
	const timeline = compileSceneTimeline({ document, fps: FPS });
	const at = (ms: number) => timeline.frameAt(Math.round((ms / 1_000) * FPS));

	it("is absent from the scene, and present on the code scene", () => {
		const [title, code] = document.project.scenes;
		expect(title && hasCodeCard(title)).toBe(false);
		expect(code && hasCodeCard(code)).toBe(true);
	});

	it("is not drawn while the title card holds, and the title is", () => {
		const frame = at(500);
		expect(primaryCodeOpacity(frame)).toBe(0);
		expect(frame.layers.some((layer) => layer.kind === "code")).toBe(false);
		const painted = layeredFrameAt(document, frame, new Map(), 1920);
		expect(painted.codeOpacity).toBe(0);
		expect([...painted.under, ...painted.over].map((layer) => layer.kind)).toEqual(["text"]);
	});

	it("fades in through the morph and is whole on the code scene", () => {
		const mid = primaryCodeOpacity(at(1_325));
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
		expect(primaryCodeOpacity(at(2_000))).toBe(1);
	});

	it("is shown when there is no scene at all to hide it", () => {
		expect(primaryCodeOpacity({ scenes: [], layers: [] })).toBe(1);
	});
});
