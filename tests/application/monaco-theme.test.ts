import { readFileSync } from "node:fs";
import { contrastRatio } from "@/application/accessibility/token-contrast";
import {
	STUDIO_EDITOR_PALETTES,
	previewEditorTheme,
	studioEditorTheme,
} from "@/application/editor/monaco-theme";
import { describe, expect, it } from "vitest";

const appCss = readFileSync("src/app.css", "utf8");
const cameraCss = readFileSync("src/presentation/studio-camera.css", "utf8");

/** The value a custom property is given in the first declaration of it in a file. */
function token(css: string, name: string): string | undefined {
	return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
}

/** The declarations of the camera tokens' own rule: the light block, then the `.dark` one. */
function cameraBlock(mode: "light" | "dark"): string {
	const opener =
		mode === "dark"
			? ".dark :is(.studio-camera-root, .sc-root-mobile, .sc-tokens, .sc-sheet) {"
			: ":is(.studio-camera-root, .sc-root-mobile, .sc-tokens, .sc-sheet) {";
	const start = cameraCss.indexOf(`\n${opener}`);
	if (start === -1) {
		throw new Error(`The camera tokens' ${mode} block moved: ${opener}`);
	}
	return cameraCss.slice(start, cameraCss.indexOf("\n}", start));
}

/** `oklch(L C h)` as the sRGB hex Monaco takes, so the accent is read, not copied. */
function oklchHex(value: string): string {
	const [lightness, chroma, hue] = (/oklch\(([^)]+)\)/.exec(value)?.[1] ?? "")
		.split(/\s+/)
		.map(Number) as [number, number, number];
	const a = chroma * Math.cos((hue * Math.PI) / 180);
	const b = chroma * Math.sin((hue * Math.PI) / 180);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return `#${linear
		.map((channel) => {
			const clamped = Math.min(1, Math.max(0, channel));
			const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
			return Math.round(encoded * 255)
				.toString(16)
				.padStart(2, "0");
		})
		.join("")}`;
}

describe("the editor's themes are the studio's warm tokens", () => {
	it("paints the light editor on the desktop paper and the dark one on the warm #121110", () => {
		expect(STUDIO_EDITOR_PALETTES.light.paper).toBe(token(appCss, "--color-neutral-50"));
		expect(STUDIO_EDITOR_PALETTES.dark.paper).toBe(token(appCss, "--color-neutral-950"));
		expect(studioEditorTheme("dark").colors["editor.background"]).toBe("#121110");
		expect(studioEditorTheme("dark").colors["editor.background"]).not.toBe("#0a0a0a");
	});

	it("reads the light ink, muted, surface, line and accent from the tokens", () => {
		const light = STUDIO_EDITOR_PALETTES.light;
		expect(light.ink).toBe(token(appCss, "--color-neutral-900"));
		expect(light.line).toBe(token(appCss, "--color-neutral-200"));
		expect(light.muted).toBe(token(cameraBlock("light"), "--camera-muted"));
		expect(light.surface).toBe(token(cameraBlock("light"), "--camera-surface"));
		expect(light.accent).toBe(
			oklchHex(/--color-accent:\s*(oklch\([^)]+\))/.exec(appCss)?.[1] ?? ""),
		);
	});

	it("reads the dark ink, muted and surface from the `.dark` block of the tokens", () => {
		const dark = STUDIO_EDITOR_PALETTES.dark;
		expect(dark.ink).toBe(token(cameraBlock("dark"), "--camera-ink"));
		expect(dark.muted).toBe(token(cameraBlock("dark"), "--camera-muted"));
		expect(dark.surface).toBe(token(cameraBlock("dark"), "--camera-surface"));
	});

	it.each(["light", "dark"] as const)("keeps %s line numbers and brackets at 4.5:1", (mode) => {
		const { colors } = studioEditorTheme(mode);
		const background = colors["editor.background"] as string;
		expect(
			contrastRatio(colors["editorLineNumber.foreground"] as string, background),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			contrastRatio(colors["editorLineNumber.activeForeground"] as string, background),
		).toBeGreaterThanOrEqual(4.5);
		for (const level of [1, 2, 3, 4, 5, 6]) {
			const bracket = colors[`editorBracketHighlight.foreground${level}`] as string;
			expect(bracket, `bracket ${level}`).toBeDefined();
			expect(contrastRatio(bracket, background), `bracket ${level}`).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("keeps a mirrored syntax theme's line numbers readable on its own background", () => {
		for (const [bg, fg] of [
			["#0d1117", "#e6edf3"],
			["#f0f4f8", "#1a202c"],
			["#282a36", "#f8f8f2"],
		] as const) {
			const { colors } = previewEditorTheme({
				base: bg === "#f0f4f8" ? "vs" : "vs-dark",
				bg,
				fg,
			});
			expect(
				contrastRatio(colors["editorLineNumber.foreground"] as string, bg),
			).toBeGreaterThanOrEqual(4.5);
			expect(colors["editor.background"]).toBe(bg);
		}
	});
});
