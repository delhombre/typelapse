import { CHROME_STYLE, FRAME_SECONDARY_ALPHA_HEX } from "@/application/layout/frame-metrics";
import { Theme } from "@/domain/entities/theme";
import { describe, expect, it } from "vitest";

const BUILT_IN_THEMES = [
	Theme.midnight(),
	Theme.aurora(),
	Theme.frost(),
	Theme.dracula(),
	Theme.oneDark(),
	Theme.catppuccin(),
	Theme.nord(),
];

describe("secondary ink inside the rendered code frame", () => {
	it("keeps small chrome and gutter text at AA contrast in every built-in theme", () => {
		for (const theme of BUILT_IN_THEMES) {
			const secondary = composite(
				theme.foreground,
				theme.background,
				Number.parseInt(FRAME_SECONDARY_ALPHA_HEX, 16) / 255,
			);
			expect(contrast(secondary, theme.background), theme.name).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("uses the same secondary ink for window titles", () => {
		expect(CHROME_STYLE.titleAlpha).toBe(FRAME_SECONDARY_ALPHA_HEX);
	});
});

function composite(foreground: string, background: string, alpha: number): string {
	const foregroundChannels = channels(foreground);
	const backgroundChannels = channels(background);
	return `#${foregroundChannels
		.map((channel, index) =>
			Math.round(channel * alpha + (backgroundChannels[index] ?? 0) * (1 - alpha))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function contrast(a: string, b: string): number {
	const lighter = Math.max(luminance(a), luminance(b));
	const darker = Math.min(luminance(a), luminance(b));
	return (lighter + 0.05) / (darker + 0.05);
}

function luminance(color: string): number {
	const [red = 0, green = 0, blue = 0] = channels(color).map((channel) => {
		const normal = channel / 255;
		return normal <= 0.03928 ? normal / 12.92 : ((normal + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function channels(color: string): number[] {
	return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
}
