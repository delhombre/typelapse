/**
 * The PNG is a frame of the export, not a screenshot of the window (ticket #166).
 *
 * `exportPng` used to photograph the scaled DOM card: the file's size followed
 * the browser window (754×494 at 1440×900 for a "1080p 16:9" export), it had no
 * mesh behind it, and the size preset and the aspect were ignored. The still is
 * now painted by the same painter, at the export config's size, from the same
 * script the video steps through.
 *
 * jsdom has no canvas backend, so the canvas is a recording double that writes a
 * real PNG header for whatever size it was given: the decoded dimensions of the
 * blob are what the file would have, read the way any PNG reader reads them.
 */

import { DEFAULT_TRANSITION_EASING } from "@/application/magic-move/easing";
import type { ProjectDocumentV2 } from "@/application/project/project-document";
import { RenderConfig, dimensionsFor } from "@/domain/entities/render-config";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import {
	type ClientScenery,
	WebCodecsRendererAdapter,
} from "@/infrastructure/export/webcodecs-renderer.adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingContext } from "../application/support/recording-context";

const scenery: ClientScenery = {
	plan: {
		frames: [
			{ tokens: [{ key: "a", content: "one", line: 0, col: 0 }], lineCount: 1 },
			{ tokens: [{ key: "b", content: "two", line: 0, col: 0 }], lineCount: 1 },
		],
		transitions: [{ from: [], to: [] }],
		typing: [],
	} as never,
	background: "mesh:aurora",
	chrome: "macos",
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	transitionMs: 650,
	transitionEasing: DEFAULT_TRANSITION_EASING,
	loop: false,
	typewriter: false,
	focusZoom: false,
	progress: null,
	watermark: null,
};

const snippet = Snippet.create({
	title: "demo",
	code: "one",
	language: "typescript",
})
	.addStep(Step.create({ code: "one", duration: 1000 }))
	.addStep(Step.create({ code: "two", duration: 2000 }));

const oneScene = Snippet.create({
	title: "demo",
	code: "one",
	language: "typescript",
}).addStep(Step.create({ code: "one", duration: 1000 }));

/** The width and height a PNG's IHDR chunk declares, as a decoder reads them. */
async function decodedSize(blob: Blob): Promise<{ width: number; height: number }> {
	// jsdom's Blob has no `arrayBuffer()`; its FileReader is the way to the bytes.
	const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(blob);
	});
	const bytes = new DataView(buffer);
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	for (const [i, byte] of signature.entries()) {
		expect(bytes.getUint8(i)).toBe(byte);
	}
	return { width: bytes.getUint32(16), height: bytes.getUint32(20) };
}

function pngHeader(width: number, height: number): Blob {
	const header = new Uint8Array(24);
	header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const view = new DataView(header.buffer);
	view.setUint32(8, 13);
	header.set([0x49, 0x48, 0x44, 0x52], 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return new Blob([header], { type: "image/png" });
}

const painted: { context: RecordingContext; width: number; height: number }[] = [];

/**
 * The canvas the frame went onto. A render also makes a canvas to measure the
 * font on, and a project's layers a scratch one; the frame's own is the one
 * that was drawn on the most.
 */
function stillCanvas() {
	return painted.reduce<(typeof painted)[number] | undefined>(
		(most, next) =>
			!most || next.context.commands.length > most.context.commands.length ? next : most,
		undefined,
	);
}

beforeEach(() => {
	painted.length = 0;
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
		this: HTMLCanvasElement,
	) {
		const context = new RecordingContext();
		painted.push({ context, width: this.width, height: this.height });
		return context as unknown as CanvasRenderingContext2D;
	});
	vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
		this: HTMLCanvasElement,
		callback: BlobCallback,
	) {
		callback(pngHeader(this.width, this.height));
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("WebCodecsRendererAdapter.renderStill", () => {
	it("is 1920×1080 at the 1080p 16:9 preset, whatever the window is", async () => {
		const { width, height } = dimensionsFor("16:9", "1080p");
		const config = RenderConfig.create({ width, height, fps: 60, format: "mp4" });
		const blob = await new WebCodecsRendererAdapter(scenery).renderStill(snippet, config, 0);
		expect(blob.type).toBe("image/png");
		expect(await decodedSize(blob)).toEqual({ width: 1920, height: 1080 });
	});

	it("is 1080×1920 at 9:16, the aspect swapped and not cropped", async () => {
		const { width, height } = dimensionsFor("9:16", "1080p");
		const config = RenderConfig.create({ width, height, fps: 60, format: "mp4" });
		const blob = await new WebCodecsRendererAdapter(scenery).renderStill(snippet, config, 0);
		expect(await decodedSize(blob)).toEqual({ width: 1080, height: 1920 });
	});

	it("paints the frame, mesh background first, on the canvas it sized", async () => {
		const config = RenderConfig.create({ width: 1920, height: 1080, fps: 60, format: "mp4" });
		await new WebCodecsRendererAdapter(scenery).renderStill(snippet, config, 0);
		const still = stillCanvas();
		expect(still).toMatchObject({ width: 1920, height: 1080 });
		const commands = still?.context.commands ?? [];
		expect(commands.length).toBeGreaterThan(0);
		// The backdrop is the first thing down: a still without one is the bug, and
		// so is one painted over the card. Nothing precedes the full-canvas fill but
		// the fill style that sets it up, and the mesh's gradients follow it.
		const firstDraw = commands.find((command) =>
			/^(fillRect|fillText|roundRect|drawImage)/.test(command),
		);
		expect(firstDraw).toBe("fillRect(0,0,1920,1080)");
		const draws = commands.filter((command) => /^(fillText|roundRect)/.test(command));
		const lastBackdropFill = commands.lastIndexOf("fillRect(0,0,1920,1080)");
		expect(lastBackdropFill).toBeLessThan(commands.indexOf(draws[0] ?? ""));
		expect(commands.some((command) => command.includes("createRadialGradient"))).toBe(true);
	});

	it("paints a studio project's text layer, because the still is the export's frame", async () => {
		const document: ProjectDocumentV2 = {
			schemaVersion: 2,
			project: {
				id: "proof",
				title: "Proof",
				canvas: { width: 1920, height: 1080, background: "#101014" },
				settings: { progressStyle: "none", transitionMs: 650, typewriter: false, focusZoom: false },
				assets: [],
				audioCues: [],
				scenes: [
					{
						id: "a",
						durationMs: 1000,
						blocks: [
							{
								id: "a::code",
								kind: "code",
								code: "one",
								language: "typescript",
								themeName: "midnight",
								chrome: "macos",
								showLineNumbers: true,
								lineNumberStart: 1,
								framePadding: 24,
								cardMargin: 32,
								continuityKey: "primary-code",
								opacity: 1,
								placement: { x: 0, y: 0, width: 1, height: 1 },
							},
							{
								id: "title",
								kind: "text",
								text: "Ship it",
								opacity: 1,
								placement: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
								typography: {
									fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
									fontSize: 88,
									fontWeight: 650,
									color: "#fffaf0",
									align: "center",
								},
							},
						],
					},
				],
			},
		};
		const config = RenderConfig.create({ width: 1920, height: 1080, fps: 60, format: "mp4" });
		const layered = new WebCodecsRendererAdapter({
			...scenery,
			composition: { document, library: { loadAsset: vi.fn() } },
		});
		const load = vi.fn(async () => []);
		Object.defineProperty(globalThis.document, "fonts", { value: { load }, configurable: true });
		try {
			await layered.renderStill(oneScene, config, 0);
		} finally {
			Reflect.deleteProperty(globalThis.document, "fonts");
		}
		// The face the layer paints with is the one asked for: Geist registers one
		// per weight, so the family alone would load the regular and fall back.
		expect(load).toHaveBeenCalledWith(expect.stringMatching(/^650 16px Geist,/));
		const withLayers = stillCanvas()?.context.commands ?? [];
		expect(withLayers.some((command) => command.startsWith('fillText("Ship it"'))).toBe(true);

		// The same project without its layers is the code card alone.
		painted.length = 0;
		await new WebCodecsRendererAdapter(scenery).renderStill(oneScene, config, 0);
		const without = stillCanvas()?.context.commands ?? [];
		expect(without.some((command) => command.includes("Ship it"))).toBe(false);
	});

	it("takes the scene it is asked for, at the end of its hold", async () => {
		const config = RenderConfig.create({ width: 1920, height: 1080, fps: 60, format: "mp4" });
		const renderer = new WebCodecsRendererAdapter(scenery);
		await renderer.renderStill(snippet, config, 0);
		const first = stillCanvas()?.context.commands.filter((c) => c.startsWith("fillText"));
		painted.length = 0;
		await renderer.renderStill(snippet, config, 1);
		const second = stillCanvas()?.context.commands.filter((c) => c.startsWith("fillText"));
		expect(first?.some((c) => c.includes("one"))).toBe(true);
		expect(second?.some((c) => c.includes("two"))).toBe(true);
		expect(second?.some((c) => c.includes("one"))).toBe(false);
	});
});
