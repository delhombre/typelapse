// @vitest-environment node
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const remotion = vi.hoisted(() => ({
	renderMedia: vi.fn(async ({ outputLocation }: { outputLocation: string }) => {
		await writeFile(outputLocation, "video");
	}),
}));

vi.mock("@remotion/bundler", () => ({
	bundle: async () => mkdtemp(path.join(os.tmpdir(), "typelapse-test-bundle-")),
}));

vi.mock("@remotion/renderer", () => ({
	selectComposition: async () => ({
		id: "Typelapse",
		width: 1920,
		height: 1080,
		fps: 30,
		durationInFrames: 60,
	}),
	renderMedia: remotion.renderMedia,
}));

const { renderRoute } = await import("../../server/routes/render");

function render(body: Record<string, unknown>) {
	return renderRoute.request("/render", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			title: "Audio",
			language: "typescript",
			theme: {
				name: "github-dark",
				fontFamily: "monospace",
				background: "#0d1117",
				foreground: "#e6edf3",
			},
			steps: [{ code: "const a = 1;", duration: 600 }],
			format: "mp4",
			...body,
		}),
	});
}

describe("the V1 render route's audio track", () => {
	beforeEach(() => {
		remotion.renderMedia.mockClear();
	});

	// A silent AAC stream lengthens the file past the device export, and the
	// export note promises no sound: the V2 renderer's rule, applied to V1.
	it("writes no audio track when the project has no sound", async () => {
		const response = await render({ sound: false });

		expect(response.status).toBe(200);
		expect(remotion.renderMedia).toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
	});

	it("keeps the tick track when sound is on", async () => {
		const response = await render({ sound: true });

		expect(response.status).toBe(200);
		expect(remotion.renderMedia).toHaveBeenCalledWith(expect.objectContaining({ muted: false }));
	});
});

describe("the V1 render route's typed scene", () => {
	beforeEach(() => {
		remotion.renderMedia.mockClear();
	});

	// A title card first has no code to type: the picture and the ticks both go
	// to the first scene that has some.
	it("types the first scene with code, in the picture and in the ticks alike", async () => {
		const response = await render({
			sound: true,
			typewriter: true,
			steps: [
				{ code: "", duration: 600 },
				{ code: "const a = 1;", duration: 600 },
			],
		});

		expect(response.status).toBe(200);
		const { inputProps } = remotion.renderMedia.mock.calls[0]?.[0] as unknown as {
			inputProps: {
				input: {
					typingIndex: number;
					audioDataUrl: string;
					plan: { frames: { tokens: unknown[] }[] };
				};
			};
		};
		const { input } = inputProps;
		expect(input.typingIndex).toBe(1);
		// The ticks: nothing sounds over the blank hold, and the typed scene does.
		const pcm = Buffer.from(input.audioDataUrl.replace(/^data:audio\/wav;base64,/, ""), "base64");
		const samples = new Int16Array(pcm.buffer, pcm.byteOffset + 44, (pcm.length - 44) / 2);
		const blankHold = Math.floor(0.6 * 44100);
		expect(samples.slice(0, blankHold).every((sample) => sample === 0)).toBe(true);
		expect(samples.slice(blankHold).some((sample) => sample !== 0)).toBe(true);
		// The blank scene holds its neighbour's code in the plan, so there is a card to type.
		expect(input.plan.frames[0]?.tokens.length).toBeGreaterThan(0);
	});

	it("keeps the first scene as the typed one when it has code", async () => {
		await render({ typewriter: true });

		const { inputProps } = remotion.renderMedia.mock.calls[0]?.[0] as unknown as {
			inputProps: { input: { typingIndex: number } };
		};
		expect(inputProps.input.typingIndex).toBe(0);
	});
});
