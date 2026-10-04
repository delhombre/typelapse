import { transparencyPlan, wantsTransparency } from "@/application/export/transparency";
import { describe, expect, it } from "vitest";

const plan = (format: "mp4" | "webm" | "gif", background: string, encoderKeepsAlpha = false) =>
	transparencyPlan({ format, background, encoderKeepsAlpha });

describe("wantsTransparency", () => {
	it("is true only for a background of None", () => {
		expect(wantsTransparency("transparent")).toBe(true);
		expect(wantsTransparency("mesh:aurora")).toBe(false);
		expect(wantsTransparency("#1e293b")).toBe(false);
		expect(wantsTransparency("linear-gradient(135deg, #a 0%, #b 100%)")).toBe(false);
	});
});

describe("transparencyPlan: a frame that has a backdrop", () => {
	it("keeps the opaque canvas, which is the cheaper one", () => {
		// A context with no alpha channel makes every read-back a plain copy
		// rather than a composite, which is what GIF quantisation depends on.
		for (const format of ["mp4", "webm", "gif"] as const) {
			expect(plan(format, "mesh:aurora"), format).toMatchObject({
				keepAlpha: false,
				encodeAlpha: false,
				outcome: "opaque",
				note: null,
			});
		}
	});
});

describe("transparencyPlan: a background of None", () => {
	it("stops MP4 exporting a black rectangle in silence", () => {
		// H.264 has no alpha at all. The old path painted onto an opaque canvas
		// and shipped the black without saying so.
		const result = plan("mp4", "transparent");
		expect(result.outcome).toBe("flattened");
		expect(result.keepAlpha).toBe(false);
		expect(result.note).toMatch(/MP4|H\.264/);
		expect(result.note).toMatch(/WebM|GIF/);
	});

	it("carries it in a GIF, and says what one bit costs", () => {
		const result = plan("gif", "transparent");
		expect(result).toMatchObject({ keepAlpha: true, encodeAlpha: false, outcome: "carried" });
		// A GIF's transparency is one bit, so a rounded corner comes out stepped.
		expect(result.note).toMatch(/one bit|hard-edged/i);
	});

	it("carries it in a WebM when the encoder will", () => {
		expect(plan("webm", "transparent", true)).toMatchObject({
			keepAlpha: true,
			encodeAlpha: true,
			outcome: "carried",
		});
	});

	it("says so rather than shipping black when the encoder will not", () => {
		// Measured: this Chromium refuses `alpha: "keep"` for VP9, VP8 and H.264.
		const result = plan("webm", "transparent", false);
		expect(result).toMatchObject({ keepAlpha: false, encodeAlpha: false, outcome: "flattened" });
		expect(result.note).toMatch(/this browser/i);
	});

	it("only points at a way out that actually keeps the channel", () => {
		// The server's WebM is captured as JPEG and encoded 4:2:0, so sending a
		// transparent export there to keep its alpha would flatten it all the same.
		// GIF is the one format that carries it on every path.
		for (const format of ["mp4", "webm"] as const) {
			const note = plan(format, "transparent", false).note ?? "";
			expect(note, format).not.toMatch(/server/i);
			expect(note, format).toMatch(/GIF/);
			expect(note, format).not.toContain("\u2014");
		}
	});

	it("never asks a canvas to keep an alpha the file cannot hold", () => {
		// Painting transparent onto a canvas whose encoder discards alpha is the
		// worst of both: the cost of the composite and a black frame anyway.
		for (const [format, capable] of [
			["mp4", true],
			["mp4", false],
			["webm", false],
		] as const) {
			expect(plan(format, "transparent", capable).keepAlpha, `${format} ${capable}`).toBe(false);
		}
	});

	it("always has something to say when the file is not what was asked for", () => {
		for (const format of ["mp4", "webm", "gif"] as const) {
			expect(plan(format, "transparent").note, format).not.toBeNull();
		}
	});
});
