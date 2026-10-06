import { canvasFont } from "@/application/frame-painter/font";
import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import {
	CHROME_FONT_STACK,
	CHROME_STYLE,
	CHROME_TEXT_LINE_HEIGHT,
	type ChromeVariant,
	chromePadY,
	chromeRowHeight,
} from "@/application/layout/frame-metrics";
import { chromeGlyphAdvance, windowTitle } from "@/application/layout/window-title";
import type { RenderToken } from "@/application/magic-move/engine";
import { describe, expect, it } from "vitest";
import { RecordingContext, round } from "./support/recording-context";

const THEME = {
	background: "#0d1117",
	foreground: "#e6edf3",
	fontFamily: "JetBrains Mono, monospace",
	fontSize: 14,
	borderRadius: 12,
};

const BASE: FrameSceneInput = {
	canvasWidth: 1280,
	canvasHeight: 720,
	plan: {
		frames: [
			{ lineCount: 2, tokens: [{ col: 0, content: "const" }] },
			{ lineCount: 2, tokens: [{ col: 0, content: "let" }] },
		],
	},
	theme: THEME,
	title: "demo.ts",
	chrome: "macos",
	background: "mesh:aurora",
	padding: 24,
	cardMargin: 32,
	showLineNumbers: true,
	lineNumberStart: 1,
	charWidthRatio: 0.6,
	scale: 2.2,
	canvasMargin: 0.05,
	grain: null,
};

const TOKEN: RenderToken = { key: "k", content: "const", line: 0, col: 0, opacity: 1 };
const UNIT = 2.2;

function paint(input: Partial<FrameSceneInput> = {}) {
	const scene = frameScene({ ...BASE, ...input });
	const ctx = new RecordingContext();
	paintFrame(ctx, scene, { tokens: [TOKEN], lineCount: 2, lineNumberCount: 2, timeSeconds: 0 });
	return { ctx, scene };
}

/** The y the bar's centred flex row sits on, from the shared metrics. */
function centreY(scene: ReturnType<typeof frameScene>, chrome: ChromeVariant) {
	return scene.window.y + (chromePadY(chrome) + chromeRowHeight(chrome) / 2) * UNIT;
}

const VARIANTS: ChromeVariant[] = ["macos", "browser", "terminal"];

describe("paintChrome: every variant is drawn, not just macOS", () => {
	it("puts more than a hairline in each bar", () => {
		// The bug: `browser` and `terminal` painted the border and returned, so
		// the exported video showed an empty strip where the preview showed a
		// tab bar or a prompt.
		for (const chrome of VARIANTS) {
			const { ctx, scene } = paint({ chrome });
			const bar = ctx.commands.filter(
				(command) =>
					command.startsWith("fillText(") ||
					command.startsWith("arc(") ||
					command.startsWith("roundRect("),
			);
			// Anything inside the bar's own vertical band belongs to the chrome.
			const drawn = bar.filter((command) => {
				const y = Number(command.split(",")[1]);
				return y > scene.window.y && y < scene.window.y + scene.chromeHeight;
			});
			expect(drawn.length, chrome).toBeGreaterThan(0);
		}
	});

	it("draws nothing at all for `none`", () => {
		const { ctx, scene } = paint({ chrome: "none" });
		expect(scene.chromeHeight).toBe(0);
		expect(ctx.commands).not.toContain('fillText("demo.ts",0,0)');
	});

	it("closes every bar with the same hairline", () => {
		for (const chrome of VARIANTS) {
			const { ctx, scene } = paint({ chrome });
			expect(ctx.commands, chrome).toContain(
				`fillRect(${round(scene.window.x)},${round(scene.window.y + scene.chromeHeight - UNIT)},${round(scene.window.width)},${round(UNIT)})`,
			);
		}
	});

	it("sets the bar's type in the app's mono, not the theme's", () => {
		// `FrameChrome` hard-codes its own stack whatever the code is set in, so a
		// theme in Cascadia still gets a JetBrains title bar.
		const { ctx } = paint({ chrome: "terminal", theme: { ...THEME, fontFamily: "Cascadia Code" } });
		const fonts = ctx.commands.filter((command) => command.startsWith("font="));
		expect(fonts.some((font) => font.includes("JetBrains Mono"))).toBe(true);
	});
});

describe("paintChrome: macos", () => {
	it("lays three traffic lights out on the flex row", () => {
		const bar = CHROME_STYLE.macos;
		const { ctx, scene } = paint({ chrome: "macos" });
		const cy = centreY(scene, "macos");
		const size = bar.dot * UNIT;
		let cx = scene.window.x + bar.padX * UNIT;
		for (const color of bar.lights) {
			expect(ctx.commands).toContain(
				`arc(${round(cx + size / 2)},${round(cy)},${round(size / 2)},0,${round(Math.PI * 2)})`,
			);
			expect(ctx.commands).toContain(`fillStyle=${color}`);
			cx += size + bar.gap * UNIT;
		}
	});

	it("puts the title after the lights, plus its own left margin", () => {
		const bar = CHROME_STYLE.macos;
		const { ctx, scene } = paint({ chrome: "macos" });
		const cy = centreY(scene, "macos");
		const lights = bar.lights.length * (bar.dot * UNIT + bar.gap * UNIT);
		const x = scene.window.x + bar.padX * UNIT + lights + bar.gap * UNIT;
		expect(ctx.commands).toContain(`fillText("demo.ts",${round(x)},${round(cy)})`);
	});

	it("carries the title's own tracking", () => {
		const { ctx } = paint({ chrome: "macos" });
		expect(ctx.commands).toContain(`letterSpacing=${CHROME_STYLE.macos.titleTracking}`);
	});
});

describe("paintChrome: browser", () => {
	const bar = CHROME_STYLE.browser;

	/**
	 * A wide frame, so the address pill is sized by its own text rather than
	 * capped at 72% of the room: the narrow case is the ellipsis test below.
	 */
	const WIDE: Partial<FrameSceneInput> = {
		chrome: "browser",
		plan: {
			frames: [{ lineCount: 2, tokens: [{ col: 0, content: "x".repeat(48) }] }],
		},
	};

	it("draws both nav chevrons at the bar's own size", () => {
		const { ctx, scene } = paint(WIDE);
		const cy = centreY(scene, "browser");
		const left = scene.window.x + bar.padX * UNIT;
		expect(ctx.commands).toContain(`font=${canvasFont(bar.chevronSize * UNIT, CHROME_FONT_STACK)}`);
		expect(ctx.commands).toContain(`fillText("‹",${round(left)},${round(cy)})`);
		// The second chevron sits one glyph and one gap along.
		const advance = bar.chevronSize * UNIT * 0.6;
		expect(ctx.commands).toContain(
			`fillText("›",${round(left + advance + bar.chevronGap * UNIT)},${round(cy)})`,
		);
	});

	it("centres a pill address bar in the room the flex child has", () => {
		const { ctx, scene } = paint(WIDE);
		const cy = centreY(scene, "browser");
		const left = scene.window.x + bar.padX * UNIT;
		const contentWidth = scene.window.width - 2 * bar.padX * UNIT;
		const advance = bar.chevronSize * UNIT * 0.6;
		const chevrons = 2 * advance + bar.chevronGap * UNIT;
		const flexLeft = left + chevrons + bar.gap * UNIT;
		const flexWidth = contentWidth - chevrons - bar.spacer * UNIT - 2 * bar.gap * UNIT;

		const titleAdvance = bar.titleSize * UNIT * (0.6 + Number(bar.titleTracking.replace("em", "")));
		const pillWidth = Math.min(
			"demo.ts".length * titleAdvance + 2 * bar.pillPadX * UNIT,
			bar.pillMaxWidth * flexWidth,
		);
		const pillHeight = (2 * bar.pillPadY + bar.titleSize * CHROME_TEXT_LINE_HEIGHT) * UNIT;
		const pillX = flexLeft + (flexWidth - pillWidth) / 2;

		expect(ctx.commands).toContain(
			`roundRect(${round(pillX)},${round(cy - pillHeight / 2)},${round(pillWidth)},${round(pillHeight)},${bar.pillRadius})`,
		);
		// The pill's height is exactly the bar's content row, so it is the child
		// that decides how tall the bar is.
		expect(pillHeight).toBeCloseTo(chromeRowHeight("browser") * UNIT, 6);
		expect(ctx.commands).toContain(
			`fillText("demo.ts",${round(pillX + pillWidth / 2)},${round(cy)})`,
		);
	});

	it("centres the title inside the pill rather than starting it there", () => {
		const { ctx } = paint(WIDE);
		const before = ctx.commands.indexOf("textAlign=center");
		const at = ctx.commands.findIndex((command) => command.startsWith('fillText("demo.ts"'));
		expect(before).toBeGreaterThanOrEqual(0);
		expect(before).toBeLessThan(at);
	});

	it("ellipsises a title too long for the pill, as the DOM does", () => {
		const title = "a-very-long-file-name-that-cannot-possibly-fit-inside-the-address-pill.tsx";
		const { ctx } = paint({ chrome: "browser", title });
		const drawn = ctx.commands.find(
			(command) => command.startsWith("fillText(") && command.includes("…"),
		);
		expect(drawn).toBeDefined();
		expect(drawn).not.toContain(title);
	});

	it("still draws the pill when there is no title to put in it", () => {
		// The DOM renders the pill unconditionally for this variant.
		const { ctx } = paint({ ...WIDE, title: "" });
		expect(ctx.commands.some((command) => command.startsWith("roundRect("))).toBe(true);
	});
});

describe("paintChrome: terminal", () => {
	const bar = CHROME_STYLE.terminal;

	it("fills the bar with its own tint, under the hairline", () => {
		const { ctx, scene } = paint({ chrome: "terminal" });
		const fill = `fillRect(${round(scene.window.x)},${round(scene.window.y)},${round(scene.window.width)},${round(scene.chromeHeight)})`;
		const hairline = `fillRect(${round(scene.window.x)},${round(scene.window.y + scene.chromeHeight - UNIT)},${round(scene.window.width)},${round(UNIT)})`;
		expect(ctx.commands).toContain(fill);
		expect(ctx.commands.indexOf(fill)).toBeLessThan(ctx.commands.indexOf(hairline));
	});

	it("draws the prompt glyph at the weight the DOM gives it", () => {
		const { ctx, scene } = paint({ chrome: "terminal" });
		const cy = centreY(scene, "terminal");
		expect(ctx.commands).toContain(
			`font=${canvasFont(bar.promptSize * UNIT, CHROME_FONT_STACK, undefined, bar.promptWeight)}`,
		);
		expect(ctx.commands).toContain(
			`fillText("${bar.prompt}",${round(scene.window.x + bar.padX * UNIT)},${round(cy)})`,
		);
	});

	it("puts the title one gap past the prompt", () => {
		const { ctx, scene } = paint({ chrome: "terminal" });
		const cy = centreY(scene, "terminal");
		const left = scene.window.x + bar.padX * UNIT;
		const promptWidth = bar.promptSize * UNIT * 0.6;
		expect(ctx.commands).toContain(
			`fillText("demo.ts",${round(left + promptWidth + bar.gap * UNIT)},${round(cy)})`,
		);
	});

	it("draws the prompt alone when there is no title", () => {
		const { ctx } = paint({ chrome: "terminal", title: "" });
		expect(ctx.commands.some((command) => command.includes(bar.prompt))).toBe(true);
		expect(ctx.commands.some((command) => command.startsWith('fillText("demo.ts"'))).toBe(false);
	});
});

describe("paintChrome: the code below it is unaffected", () => {
	it("puts the tracking back before the tokens are drawn", () => {
		// A chrome title's negative tracking left on the context would narrow
		// every glyph of code under it.
		for (const chrome of VARIANTS) {
			const { ctx } = paint({ chrome });
			// `0px`, not `normal`: a canvas ignores the keyword and keeps the title's
			// tracking, which the recorder now reproduces.
			const reset = ctx.commands.lastIndexOf("letterSpacing=0px");
			const token = ctx.commands.findIndex((command) => command.startsWith('fillText("const"'));
			expect(reset, chrome).toBeGreaterThanOrEqual(0);
			expect(reset, chrome).toBeLessThan(token);
		}
	});
});

describe("paintChrome: a long title is one line, cut at the width the bar leaves it (#186)", () => {
	const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";

	it.each(VARIANTS)("%s: draws the string the shared function decides", (chrome) => {
		const { ctx, scene } = paint({ chrome, title: PR_TITLE });
		const expected = windowTitle(PR_TITLE, chrome, scene.window.width, UNIT);
		// A window this narrow cannot hold the title, or the test proves nothing.
		expect(expected).not.toBe(PR_TITLE);
		expect(expected.endsWith("…")).toBe(true);
		const drawn = ctx.commands.filter((command) => command.startsWith('fillText("'));
		expect(
			drawn.some((command) => command.startsWith(`fillText(${JSON.stringify(expected)},`)),
		).toBe(true);
		// One line, and never the untruncated string the old painter drew.
		expect(drawn.some((command) => command.includes(PR_TITLE))).toBe(false);
	});

	it("draws the whole title where the window has room for it", () => {
		const { ctx, scene } = paint({
			chrome: "macos",
			title: PR_TITLE,
			plan: { frames: [{ lineCount: 2, tokens: [{ col: 0, content: "x".repeat(80) }] }] },
		});
		expect(windowTitle(PR_TITLE, "macos", scene.window.width, UNIT)).toBe(PR_TITLE);
		expect(ctx.commands.some((command) => command.startsWith(`fillText("${PR_TITLE}",`))).toBe(
			true,
		);
	});
});

describe("paintChrome: the bar's furniture is placed on the advance the title is counted in (#186)", () => {
	/** A machine whose fallback face draws U+276F and the chevrons a third wider. */
	class WideFallback extends RecordingContext {
		measureText(text: string) {
			const measured = super.measureText(text);
			return ["❯", "‹", "›"].includes(text)
				? { ...measured, width: measured.width * 1.4 }
				: measured;
		}
	}

	function paintWide(input: Partial<FrameSceneInput>) {
		const scene = frameScene({ ...BASE, ...input });
		const ctx = new WideFallback();
		paintFrame(ctx, scene, { tokens: [TOKEN], lineCount: 2, lineNumberCount: 2, timeSeconds: 0 });
		return { ctx, scene };
	}

	it("terminal: the title sits one gap past the counted prompt, not the measured one", () => {
		const bar = CHROME_STYLE.terminal;
		const { ctx, scene } = paintWide({ chrome: "terminal" });
		const cy = centreY(scene, "terminal");
		const x =
			scene.window.x + bar.padX * UNIT + chromeGlyphAdvance(bar.promptSize, UNIT) + bar.gap * UNIT;
		expect(ctx.commands).toContain(`fillText("demo.ts",${round(x)},${round(cy)})`);
	});

	it("browser: the second chevron is one counted glyph and one gap along", () => {
		const bar = CHROME_STYLE.browser;
		const { ctx, scene } = paintWide({ chrome: "browser" });
		const cy = centreY(scene, "browser");
		const x =
			scene.window.x +
			bar.padX * UNIT +
			chromeGlyphAdvance(bar.chevronSize, UNIT) +
			bar.chevronGap * UNIT;
		expect(ctx.commands).toContain(`fillText("›",${round(x)},${round(cy)})`);
	});
});
