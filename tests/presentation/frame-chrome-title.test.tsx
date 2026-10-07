import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { CANVAS_MARGIN } from "@/application/layout/canvas-fit";
import { CHROME_STYLE, CHROME_TEXT_LINE_HEIGHT } from "@/application/layout/frame-metrics";
import { windowTitle, windowTitleCapacity } from "@/application/layout/window-title";
import { displayWidth } from "@/application/text/display-width";
import { FrameChrome, type WindowChrome } from "@/presentation/components/preview/frame-chrome";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredFrame } from "../../server/remotion/composition";
import { RecordingContext } from "../application/support/recording-context";

const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";
/** Titles in two cells a glyph: what the cut must count in cells, not code points. */
const CJK_TITLE = "修复(路由器): 每个斜杠都要计数，每个路径都要匹配，不要漏掉任何一个";
const EMOJI_TITLE = "🚀🚀🚀 ship the 🔥 trie-router fix 🎉🎉🎉 ✨ before the 🌍 launch 🚀🚀🚀";
const TITLES = [
	{ name: "ascii", title: PR_TITLE },
	{ name: "CJK", title: CJK_TITLE },
	{ name: "emoji", title: EMOJI_TITLE },
];
const FG = "#e6edf3";
const bar = CHROME_STYLE.browser;
const BARS: Exclude<WindowChrome, "none">[] = ["macos", "browser", "terminal"];

/** The element carrying the title: the one whose `title=` is the full name. */
function titleElement(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>(`[title="${PR_TITLE}"]`);
}

describe("FrameChrome: the title is one line, cut by the shared function (#186)", () => {
	describe.each(BARS)("%s", (chrome) => {
		it.each([1, 2.2])("renders exactly the string the painter draws, at scale %s", (scale) => {
			const width = 340 * scale;
			const { container } = render(
				<FrameChrome
					chrome={chrome}
					title={PR_TITLE}
					foreground={FG}
					scale={scale}
					width={width}
				/>,
			);
			const expected = windowTitle(PR_TITLE, chrome, width, scale);
			expect(expected).not.toBe(PR_TITLE);
			expect(expected.endsWith("…")).toBe(true);
			expect(titleElement(container)?.textContent).toBe(expected);
		});

		it("renders the title whole, full name in title=, when the window has room", () => {
			const { container } = render(
				<FrameChrome chrome={chrome} title={PR_TITLE} foreground={FG} width={900} />,
			);
			expect(titleElement(container)?.textContent).toBe(PR_TITLE);
		});

		it("never lets the title wrap", () => {
			const { container } = render(
				<FrameChrome chrome={chrome} title={PR_TITLE} foreground={FG} width={300} />,
			);
			expect(titleElement(container)?.style.whiteSpace).toBe("nowrap");
		});

		it("draws no title for an empty title", () => {
			const { container } = render(
				<FrameChrome chrome={chrome} title="" foreground={FG} width={900} />,
			);
			expect(container.querySelector("[title]")).toBeNull();
		});
	});

	it("falls back to the full string on one clipped line when the window's width is not known", () => {
		const { container } = render(<FrameChrome chrome="macos" title={PR_TITLE} foreground={FG} />);
		const el = titleElement(container);
		expect(el?.textContent).toBe(PR_TITLE);
		expect(el?.style.textOverflow).toBe("ellipsis");
		expect(el?.style.whiteSpace).toBe("nowrap");
	});
});

describe("FrameChrome: a CJK or emoji title is cut by cells, as the painter cuts it (#197)", () => {
	describe.each(BARS)("%s", (chrome) => {
		it.each(TITLES.slice(1))(
			"$name: renders the shared string, whole glyphs, within the room",
			({ title }) => {
				const width = 340;
				const { container } = render(
					<FrameChrome chrome={chrome} title={title} foreground={FG} width={width} />,
				);
				const expected = windowTitle(title, chrome, width, 1);
				expect(expected).not.toBe(title);
				expect(expected.endsWith("…")).toBe(true);
				expect(displayWidth(expected)).toBeLessThanOrEqual(windowTitleCapacity(chrome, width, 1));
				expect(container.querySelector<HTMLElement>(`[title="${title}"]`)?.textContent).toBe(
					expected,
				);
			},
		);
	});
});

describe("FrameChrome: the 80px empty card draws no title, not a lone ellipsis (#203)", () => {
	const titleOf = (container: HTMLElement) =>
		container.querySelector<HTMLElement>('[title="Untitled"]');

	it("macos: renders no title node", () => {
		const { container } = render(
			<FrameChrome chrome="macos" title="Untitled" foreground={FG} width={80} />,
		);
		expect(titleOf(container)).toBeNull();
		expect(container.textContent).not.toContain("…");
	});

	it("browser: keeps the pill, with an empty title in it", () => {
		const { container } = render(
			<FrameChrome chrome="browser" title="Untitled" foreground={FG} width={80} />,
		);
		expect(titleOf(container)?.textContent).toBe("");
		expect(container.textContent).not.toContain("…");
	});
});

describe("the Remotion composition draws the same title (#186)", () => {
	const THEME = {
		name: "midnight",
		background: "#0d1117",
		foreground: FG,
		fontFamily: "'JetBrains Mono', monospace",
		fontSize: 14,
		borderRadius: 12,
	};
	const PLAN = {
		frames: [
			{
				lineCount: 2,
				tokens: [{ key: "a", content: "const x = 1;", line: 0, col: 0, color: FG }],
			},
		],
		transitions: [],
	};
	const UNIT = 2.2;

	it("hands the bar the window's own width, so the string is the painter's", () => {
		const { container } = render(
			<CenteredFrame
				plan={PLAN}
				theme={THEME}
				title={PR_TITLE}
				windowChrome="macos"
				showLineNumbers
				lineNumberStart={1}
				framePadding={24}
				cardMargin={32}
				canvasWidth={1920}
				canvasHeight={1080}
				videoScale={UNIT}
				charWidthRatio={0.6}
			>
				<div />
			</CenteredFrame>,
		);
		const windowEl = container.querySelector<HTMLElement>("[data-code-window]");
		const windowWidth = Number.parseFloat(windowEl?.style.width ?? "");
		const expected = windowTitle(PR_TITLE, "macos", windowWidth, UNIT);
		expect(expected).not.toBe(PR_TITLE);
		expect(expected.endsWith("…")).toBe(true);
		expect(titleElement(container)?.textContent).toBe(expected);
	});

	const CASES = BARS.flatMap((chrome) => TITLES.map((entry) => ({ chrome, ...entry })));

	it.each(CASES)(
		"$chrome, $name title: the painter and the composition draw one string for the same inputs and canvas",
		({ chrome, title }) => {
			const inputs = {
				canvasWidth: 1920,
				canvasHeight: 1080,
				title,
				chrome,
				padding: 24,
				cardMargin: 32,
				showLineNumbers: true,
				lineNumberStart: 1,
				charWidthRatio: 0.6,
				scale: UNIT,
			};
			// What the painter draws: the string handed to `fillText` with the title's name.
			const scene = frameScene({
				...inputs,
				plan: PLAN as unknown as FrameSceneInput["plan"],
				theme: THEME,
				background: "mesh:aurora",
				canvasMargin: CANVAS_MARGIN,
				grain: null,
			});
			const ctx = new RecordingContext();
			paintFrame(ctx, scene, { tokens: [], lineCount: 2, lineNumberCount: 2, timeSeconds: 0 });
			const first = Array.from(title)[0] ?? "";
			const painted = ctx.commands
				.map((command) => /^fillText\((".*?"),/.exec(command)?.[1])
				.filter((text): text is string => text !== undefined)
				.map((text) => JSON.parse(text) as string)
				.filter((text) => text.startsWith(first));

			// What the Remotion composition renders, from the same inputs.
			const { container } = render(
				<CenteredFrame
					plan={PLAN}
					theme={THEME}
					title={title}
					windowChrome={chrome}
					showLineNumbers
					lineNumberStart={1}
					framePadding={inputs.padding}
					cardMargin={inputs.cardMargin}
					canvasWidth={inputs.canvasWidth}
					canvasHeight={inputs.canvasHeight}
					videoScale={UNIT}
					charWidthRatio={inputs.charWidthRatio}
				>
					<div />
				</CenteredFrame>,
			);
			const composed = container.querySelector<HTMLElement>(`[title="${title}"]`)?.textContent;

			expect(painted).toHaveLength(1);
			expect(painted[0]).not.toBe(title);
			expect(displayWidth(painted[0] ?? "")).toBeLessThanOrEqual(
				windowTitleCapacity(chrome, scene.window.width, UNIT),
			);
			expect(painted[0]?.endsWith("…")).toBe(true);
			expect(composed).toBe(painted[0]);
		},
	);
});

describe("the browser pill is as wide in the DOM as in the painter, in cells (#205)", () => {
	const UNIT = 2.2;
	const PLAN = {
		frames: [{ lineCount: 2, tokens: [{ key: "a", content: "x".repeat(48), line: 0, col: 0 }] }],
	};
	const LABELS = [
		{ name: "ascii", title: "demo.ts" },
		{ name: "CJK", title: "路由器.ts" },
		{ name: "emoji", title: "🚀 ship.ts" },
	];

	it.each(LABELS)(
		"$name label: the painter's roundRect and the DOM pill share one width",
		({ title }) => {
			const scene = frameScene({
				canvasWidth: 1920,
				canvasHeight: 1080,
				title,
				chrome: "browser",
				padding: 24,
				cardMargin: 32,
				showLineNumbers: true,
				lineNumberStart: 1,
				charWidthRatio: 0.6,
				scale: UNIT,
				plan: PLAN as unknown as FrameSceneInput["plan"],
				theme: {
					background: "#0d1117",
					foreground: FG,
					fontFamily: "JetBrains Mono, monospace",
					fontSize: 14,
					borderRadius: 12,
				},
				background: "mesh:aurora",
				canvasMargin: CANVAS_MARGIN,
				grain: null,
			});
			const ctx = new RecordingContext();
			paintFrame(ctx, scene, { tokens: [], lineCount: 2, lineNumberCount: 2, timeSeconds: 0 });
			const pillHeight = (2 * bar.pillPadY + bar.titleSize * CHROME_TEXT_LINE_HEIGHT) * UNIT;
			const painted = ctx.commands
				.filter((command) => command.startsWith("roundRect("))
				.map((command) => command.slice("roundRect(".length, -1).split(",").map(Number))
				.find((args) => Math.abs((args[3] ?? 0) - pillHeight) < 0.01);

			const { container } = render(
				<FrameChrome
					chrome="browser"
					title={title}
					foreground={FG}
					scale={UNIT}
					width={scene.window.width}
				/>,
			);
			const dom = container.querySelector<HTMLElement>(`[title="${title}"]`)?.parentElement;

			expect(painted?.[2]).toBeDefined();
			expect(Number.parseFloat(dom?.style.width ?? "")).toBeCloseTo(painted?.[2] ?? Number.NaN, 1);
		},
	);

	it("keeps ASCII at the width it always had: cells at the title's advance, plus the padding", () => {
		const { container } = render(
			<FrameChrome chrome="browser" title="demo.ts" foreground={FG} scale={UNIT} width={900} />,
		);
		const dom = container.querySelector<HTMLElement>('[title="demo.ts"]')?.parentElement;
		const advance = bar.titleSize * UNIT * (0.6 + Number.parseFloat(bar.titleTracking));
		expect(Number.parseFloat(dom?.style.width ?? "")).toBeCloseTo(
			displayWidth("demo.ts") * advance + 2 * bar.pillPadX * UNIT,
			1,
		);
	});
});
