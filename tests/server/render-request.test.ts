// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
	MAX_STEP_CODE_CHARS,
	MAX_TOTAL_CODE_CHARS,
	progressStyleOf,
	renderRequestProblem,
	windowChromeOf,
} from "../../server/remotion/render-request";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		title: "demo",
		language: "typescript",
		theme: {
			name: "midnight",
			background: "#0d1117",
			foreground: "#e6edf3",
			fontFamily: "JetBrains Mono",
			fontSize: 14,
			borderRadius: 12,
		},
		steps: [
			{ code: "const a = 1;", duration: 1200 },
			{ code: "const a = 2;", duration: 1200 },
		],
		background: "mesh:aurora",
		...overrides,
	};
}

describe("renderRequestProblem", () => {
	it("accepts the body the studio and the demo script send", () => {
		expect(renderRequestProblem(body())).toBeNull();
	});

	it("names the problem for bodies that used to crash the route into a 500", () => {
		expect(renderRequestProblem(null)).toBe("Request body must be a JSON object");
		expect(renderRequestProblem([1, 2])).toBe("Request body must be a JSON object");
		expect(renderRequestProblem(body({ steps: "abcdef" }))).toBe("At least 2 steps required");
		expect(renderRequestProblem(body({ steps: [1, 2] }))).toBe(
			"Each step needs its code as a string",
		);
		expect(renderRequestProblem(body({ theme: undefined }))).toBe(
			"A theme with a name and a font family is required",
		);
	});

	it("refuses theme colours that headless Chrome would fetch as a URL", () => {
		const theme = body().theme as Record<string, unknown>;
		expect(
			renderRequestProblem(body({ theme: { ...theme, background: "url(http://127.0.0.1/x)" } })),
		).toBe("Theme colours must be hex colours");
		expect(
			renderRequestProblem(body({ theme: { ...theme, foreground: "url(http://127.0.0.1/x)" } })),
		).toBe("Theme colours must be hex colours");
	});

	it("caps step code before it can crash or stall the renderer", () => {
		const long = "x".repeat(MAX_STEP_CODE_CHARS + 1);
		expect(renderRequestProblem(body({ steps: [{ code: long }, { code: "a" }] }))).toMatch(
			/too long/,
		);
		const steps = Array.from({ length: 6 }, () => ({ code: "x".repeat(MAX_STEP_CODE_CHARS) }));
		expect(MAX_STEP_CODE_CHARS * steps.length).toBeGreaterThan(MAX_TOTAL_CODE_CHARS);
		expect(renderRequestProblem(body({ steps }))).toMatch(/too long in total/);
	});
});

describe("windowChromeOf / progressStyleOf", () => {
	it("keep known values and fall back for strings the composition cannot draw", () => {
		expect(windowChromeOf("terminal")).toBe("terminal");
		expect(windowChromeOf("evil")).toBe("macos");
		expect(progressStyleOf("bar")).toBe("bar");
		expect(progressStyleOf(42)).toBe("reels");
	});
});
