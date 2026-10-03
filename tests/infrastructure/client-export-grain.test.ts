/**
 * Ticket #108: the on-device export came out a few levels darker than the
 * preview and the server file, across the whole frame. The file was faithful to
 * its canvas; the canvas had no film grain, because the worker decoded the SVG
 * tile with `createImageBitmap(blob)`, which Chrome refuses for SVG in every
 * scope, and the refusal was swallowed. The preview and the server composite
 * the grain in soft-light, which lifts the backdrop's mean.
 *
 * The tile is rasterised in the tab instead, where an `<img>` can draw SVG, and
 * moves to the worker with the job.
 */

import { GRAIN_TILE_URL } from "@/application/backgrounds/grain";
import { DEFAULT_TRANSITION_EASING } from "@/application/magic-move/easing";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import type { ClientExportJob } from "@/infrastructure/export/client-export-job";
import { grainTileOf } from "@/infrastructure/export/grain-tile";
import {
	type ClientScenery,
	WebCodecsRendererAdapter,
} from "@/infrastructure/export/webcodecs-renderer.adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TILE = { width: 160, height: 160, close: () => {} } as unknown as ImageBitmap;

const posted: { job: ClientExportJob; transfer: Transferable[] }[] = [];

class FakeWorker {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	postMessage(job: ClientExportJob, transfer: Transferable[] = []) {
		posted.push({ job, transfer });
		queueMicrotask(() =>
			this.onmessage?.({
				data: { type: "failed", message: "stop here" },
			} as MessageEvent),
		);
	}
	terminate() {}
}

const scenery: ClientScenery = {
	plan: { frames: [{ tokens: [], lineCount: 1 }], transitions: [], typing: [] } as never,
	background: "#3366cc",
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
	title: "flat.ts",
	code: "const a = 1;",
	language: "typescript",
}).addStep(Step.create({ code: "const a = 1;", duration: 1000 }));

let decodedFrom: unknown[] = [];

beforeEach(() => {
	posted.length = 0;
	decodedFrom = [];
	vi.stubGlobal("Worker", FakeWorker);
	vi.stubGlobal("OffscreenCanvas", class {});
	vi.stubGlobal(
		"createImageBitmap",
		vi.fn(async (source: unknown) => {
			decodedFrom.push(source);
			return TILE;
		}),
	);
	// jsdom has no `decode`; Chrome does, and it is what waits for the SVG to draw.
	Object.defineProperty(HTMLImageElement.prototype, "decode", {
		configurable: true,
		writable: true,
		value: vi.fn(async () => {}),
	});
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		() => ({ font: "", measureText: () => ({ width: 8.4 }) }) as never,
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

async function postedJob() {
	await new WebCodecsRendererAdapter(scenery)
		.renderVideo(snippet, snippet.renderConfig)
		.catch(() => {});
	expect(posted).toHaveLength(1);
	const [entry] = posted;
	if (!entry) {
		throw new Error("the adapter posted no job");
	}
	return entry;
}

describe("the grain tile on an on-device export", () => {
	it("is rasterised in the tab through an <img> and moved to the worker with the job", async () => {
		const { job, transfer } = await postedJob();

		expect(job.grain).toBe(TILE);
		expect(transfer).toContain(TILE);
		// Never from a Blob: Chrome cannot decode an SVG that way, in any scope.
		expect(decodedFrom).toHaveLength(1);
		expect(decodedFrom[0]).toBeInstanceOf(HTMLImageElement);
		expect((decodedFrom[0] as HTMLImageElement).src).toBe(GRAIN_TILE_URL);
	});

	it("is left out, without failing the export, when the tab cannot draw it", async () => {
		HTMLImageElement.prototype.decode = vi.fn(async () => {
			throw new Error("no SVG here");
		});

		const { job } = await postedJob();

		expect(job.grain).toBeNull();
	});
});

describe("grainTileOf", () => {
	it("tiles the bitmap at the CSS size and opacity for a video", () => {
		expect(grainTileOf(TILE, "mp4")).toEqual({ image: TILE, size: 160, opacity: 0.28 });
		expect(grainTileOf(TILE, "webm")).toMatchObject({ image: TILE });
	});

	it("leaves a GIF without grain: noise costs a palette six times the bytes", () => {
		expect(grainTileOf(TILE, "gif")).toBeNull();
	});

	it("has nothing to tile without a bitmap", () => {
		expect(grainTileOf(null, "mp4")).toBeNull();
	});
});
