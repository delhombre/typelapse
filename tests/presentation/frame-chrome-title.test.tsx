import { paintFrame } from "@/application/frame-painter/painter";
import { type FrameSceneInput, frameScene } from "@/application/frame-painter/scene";
import { CANVAS_MARGIN } from "@/application/layout/canvas-fit";
import { windowTitle } from "@/application/layout/window-title";
import { FrameChrome, type WindowChrome } from "@/presentation/components/preview/frame-chrome";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CenteredFrame } from "../../server/remotion/composition";
import { RecordingContext } from "../application/support/recording-context";

const PR_TITLE = "fix(trie-router): count every slash a pattern consumes";
const FG = "#e6edf3";
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

	it.each(BARS)(
		"%s: the painter and the composition draw one string for the same inputs and canvas",
		(chrome) => {
			const inputs = {
				canvasWidth: 1920,
				canvasHeight: 1080,
				title: PR_TITLE,
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
			const painted = ctx.commands
				.map((command) => /^fillText\("(fix\(.*?)",/.exec(command)?.[1])
				.filter((text): text is string => text !== undefined);

			// What the Remotion composition renders, from the same inputs.
			const { container } = render(
				<CenteredFrame
					plan={PLAN}
					theme={THEME}
					title={PR_TITLE}
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
			const composed = titleElement(container)?.textContent;

			expect(painted).toHaveLength(1);
			expect(painted[0]).not.toBe(PR_TITLE);
			expect(painted[0]?.endsWith("…")).toBe(true);
			expect(composed).toBe(painted[0]);
		},
	);
});
