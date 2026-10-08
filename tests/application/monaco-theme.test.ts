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

describe("the editor's themes are the studio's warm tokens", () => {
	it("paints the light editor on the desktop paper and the dark one on the warm #121110", () => {
		expect(STUDIO_EDITOR_PALETTES.light.paper).toBe(token(appCss, "--color-neutral-50"));
		expect(STUDIO_EDITOR_PALETTES.dark.paper).toBe(token(appCss, "--color-neutral-950"));
		expect(studioEditorTheme("dark").colors["editor.background"]).toBe("#121110");
		expect(studioEditorTheme("dark").colors["editor.background"]).not.toBe("#0a0a0a");
	});

	it("reads the same ink and muted grey as the camera tokens", () => {
		expect(STUDIO_EDITOR_PALETTES.light.muted).toBe(token(cameraCss, "--camera-muted"));
		expect(STUDIO_EDITOR_PALETTES.light.surface).toBe(token(cameraCss, "--camera-surface"));
		expect(STUDIO_EDITOR_PALETTES.dark.surface).toBe("#1e1c1a");
		expect(STUDIO_EDITOR_PALETTES.dark.ink).toBe("#f5f3ef");
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
