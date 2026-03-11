import { computeTypingFrames } from "@/application/services/typing-engine";
import { describe, expect, it } from "vitest";

describe("TypingEngine", () => {
	describe("computeTypingFrames", () => {
		it("returns single frame when source and target are identical", () => {
			const frames = computeTypingFrames("hello", "hello", 5);
			expect(frames).toEqual(["hello"]);
		});

		it("returns character-by-character insertion frames", () => {
			const frames = computeTypingFrames("", "abc", 3);
			expect(frames).toEqual(["a", "ab", "abc"]);
		});

		it("returns character-by-character deletion frames", () => {
			const frames = computeTypingFrames("abc", "", 3);
			expect(frames).toEqual(["ab", "a", ""]);
		});

		it("handles replacement by deleting then inserting", () => {
			const frames = computeTypingFrames("ab", "cd", 4);
			// delete b, delete a, type c, type d
			expect(frames).toEqual(["a", "", "c", "cd"]);
		});

		it("handles appending to existing code", () => {
			const frames = computeTypingFrames("hello", "hello world", 6);
			expect(frames).toEqual([
				"hello ",
				"hello w",
				"hello wo",
				"hello wor",
				"hello worl",
				"hello world",
			]);
		});

		it("handles partial prefix match (delete suffix, type new suffix)", () => {
			const frames = computeTypingFrames("hello world", "hello there", 10);
			// Delete "world" char by char (5 frames), then type "there" char by char (5 frames)
			expect(frames).toHaveLength(10);
			expect(frames[0]).toBe("hello worl");
			expect(frames[4]).toBe("hello ");
			expect(frames[5]).toBe("hello t");
			expect(frames[9]).toBe("hello there");
		});

		it("limits to requested frame count when fewer changes needed", () => {
			const frames = computeTypingFrames("a", "ab", 10);
			// Only 1 char to add, so only 1 frame
			expect(frames).toEqual(["ab"]);
		});

		it("handles multiline code", () => {
			const source = "function greet() {\n}";
			const target = "function greet() {\n  return 'hi';\n}";
			const frames = computeTypingFrames(source, target, 50);
			expect(frames.length).toBeGreaterThan(0);
			expect(frames[frames.length - 1]).toBe(target);
		});
	});
});
