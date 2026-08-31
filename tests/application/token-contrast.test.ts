import {
	contrastRatio,
	ensureReadableTokenColor,
} from "@/application/accessibility/token-contrast";
import { describe, expect, it } from "vitest";

describe("syntax token contrast", () => {
	it("keeps an already readable token unchanged", () => {
		expect(ensureReadableTokenColor("#ffffff", "#282c34")).toBe("#ffffff");
	});

	it("lifts a low-contrast dark-theme token just past AA", () => {
		const color = ensureReadableTokenColor("#e06c75", "#282c34");

		expect(color).not.toBe("#e06c75");
		expect(contrastRatio(color, "#282c34")).toBeGreaterThanOrEqual(4.5);
	});

	it("darkens a low-contrast light-theme token", () => {
		const color = ensureReadableTokenColor("#9ca3af", "#f0f4f8");

		expect(contrastRatio(color, "#f0f4f8")).toBeGreaterThanOrEqual(4.5);
	});

	it("leaves unsupported CSS colors alone", () => {
		expect(ensureReadableTokenColor("currentColor", "#282c34")).toBe("currentColor");
	});
});
