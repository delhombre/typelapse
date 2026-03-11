import { RenderConfig } from "@/domain/entities/render-config";
import { Theme } from "@/domain/entities/theme";
import { HighlightRange } from "@/domain/value-objects/highlight-range";
import { TimeRange } from "@/domain/value-objects/time-range";
import { describe, expect, it } from "vitest";

describe("HighlightRange", () => {
	it("creates a range with start and end lines", () => {
		const range = HighlightRange.create({ startLine: 1, endLine: 5 });

		expect(range.startLine).toBe(1);
		expect(range.endLine).toBe(5);
		expect(range.startColumn).toBeUndefined();
		expect(range.endColumn).toBeUndefined();
	});

	it("creates a range with columns", () => {
		const range = HighlightRange.create({
			startLine: 1,
			endLine: 1,
			startColumn: 5,
			endColumn: 10,
		});

		expect(range.startColumn).toBe(5);
		expect(range.endColumn).toBe(10);
	});

	it("rejects endLine < startLine", () => {
		expect(() => HighlightRange.create({ startLine: 5, endLine: 3 })).toThrow();
	});

	it("rejects negative lines", () => {
		expect(() => HighlightRange.create({ startLine: -1, endLine: 1 })).toThrow();
	});
});

describe("TimeRange", () => {
	it("creates a time range", () => {
		const range = TimeRange.create({ start: 0, end: 1000 });

		expect(range.start).toBe(0);
		expect(range.end).toBe(1000);
		expect(range.duration).toBe(1000);
	});

	it("rejects end <= start", () => {
		expect(() => TimeRange.create({ start: 500, end: 500 })).toThrow();
		expect(() => TimeRange.create({ start: 500, end: 200 })).toThrow();
	});

	it("rejects negative values", () => {
		expect(() => TimeRange.create({ start: -1, end: 100 })).toThrow();
	});
});

describe("Theme", () => {
	it("creates midnight preset", () => {
		const theme = Theme.midnight();
		expect(theme.name).toBe("midnight");
		expect(theme.background).toBeDefined();
	});

	it("creates aurora preset", () => {
		const theme = Theme.aurora();
		expect(theme.name).toBe("aurora");
	});

	it("creates frost preset", () => {
		const theme = Theme.frost();
		expect(theme.name).toBe("frost");
	});

	it("creates custom theme", () => {
		const theme = Theme.create({
			name: "custom",
			background: "#000",
			foreground: "#fff",
			fontFamily: "Fira Code",
			fontSize: 16,
			padding: 32,
			borderRadius: 12,
		});

		expect(theme.name).toBe("custom");
		expect(theme.fontFamily).toBe("Fira Code");
	});
});

describe("RenderConfig", () => {
	it("creates with defaults", () => {
		const config = RenderConfig.defaults();

		expect(config.width).toBe(1920);
		expect(config.height).toBe(1080);
		expect(config.fps).toBe(60);
		expect(config.format).toBe("mp4");
	});

	it("creates with custom values", () => {
		const config = RenderConfig.create({
			width: 1280,
			height: 720,
			fps: 30,
			format: "gif",
		});

		expect(config.width).toBe(1280);
		expect(config.format).toBe("gif");
	});

	it("rejects invalid dimensions", () => {
		expect(() => RenderConfig.create({ width: 0, height: 720, fps: 60, format: "mp4" })).toThrow();
	});

	it("rejects invalid fps", () => {
		expect(() =>
			RenderConfig.create({ width: 1920, height: 1080, fps: 0, format: "mp4" }),
		).toThrow();
	});

	it("rejects invalid format", () => {
		expect(() =>
			RenderConfig.create({
				width: 1920,
				height: 1080,
				fps: 60,
				format: "avi" as "mp4",
			}),
		).toThrow();
	});
});
