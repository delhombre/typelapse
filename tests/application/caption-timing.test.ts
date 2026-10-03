import { captionAt } from "@/application/captions/caption-timing";
import { describe, expect, it } from "vitest";

const annotations = ["first", "second"];

describe("captionAt during a hold", () => {
	it("shows the held step's caption at full opacity", () => {
		expect(captionAt({ phase: "hold", index: 0, t: 0 }, annotations)).toEqual({
			text: "first",
			opacity: 1,
		});
		expect(captionAt({ phase: "hold", index: 1, t: 0 }, annotations)).toEqual({
			text: "second",
			opacity: 1,
		});
	});

	it("is invisible when the held step has no caption", () => {
		const result = captionAt({ phase: "hold", index: 0, t: 0 }, ["", "second"]);
		expect(result.opacity).toBe(0);
	});
});

describe("captionAt during a transition", () => {
	it("holds the old caption fully visible at the very start", () => {
		expect(captionAt({ phase: "transition", index: 0, t: 0 }, annotations)).toEqual({
			text: "first",
			opacity: 1,
		});
	});

	it("fades the old caption out over the first 40%", () => {
		const at20 = captionAt({ phase: "transition", index: 0, t: 0.2 }, annotations);
		expect(at20.text).toBe("first");
		expect(at20.opacity).toBeCloseTo(0.5);
	});

	it("is empty across the middle 20% gap", () => {
		expect(captionAt({ phase: "transition", index: 0, t: 0.4 }, annotations).opacity).toBeCloseTo(
			0,
		);
		expect(captionAt({ phase: "transition", index: 0, t: 0.5 }, annotations).opacity).toBeCloseTo(
			0,
		);
		expect(captionAt({ phase: "transition", index: 0, t: 0.6 }, annotations).opacity).toBeCloseTo(
			0,
		);
	});

	it("fades the new caption in over the last 40%", () => {
		const at80 = captionAt({ phase: "transition", index: 0, t: 0.8 }, annotations);
		expect(at80.text).toBe("second");
		expect(at80.opacity).toBeCloseTo(0.5);
	});

	it("shows the new caption fully by the end", () => {
		expect(captionAt({ phase: "transition", index: 0, t: 1 }, annotations)).toEqual({
			text: "second",
			opacity: 1,
		});
	});

	it("stays invisible in the first half when the old step had no caption", () => {
		const result = captionAt({ phase: "transition", index: 0, t: 0.2 }, ["", "second"]);
		expect(result.opacity).toBe(0);
	});

	it("stays invisible in the second half when the new step has no caption", () => {
		const result = captionAt({ phase: "transition", index: 0, t: 0.8 }, ["first", ""]);
		expect(result.opacity).toBe(0);
	});
});

describe("captionAt during the loop morph", () => {
	const three = ["first", "second", "third"];

	it("hands the last caption back to the first, as the server composition does", () => {
		expect(captionAt({ phase: "loop", index: 2, t: 0 }, three)).toEqual({
			text: "third",
			opacity: 1,
		});
		expect(captionAt({ phase: "loop", index: 2, t: 1 }, three)).toEqual({
			text: "first",
			opacity: 1,
		});
	});
});
