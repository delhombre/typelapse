/**
 * Window chrome header for the code frame: a shared presentational component
 * (like `StepCaption` / `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview
 * frame-for-frame. Only the header bar is painted here; the frame shell (border,
 * radius, body) stays at the call site. Everything is inline-styled and driven by
 * `scale` so the 2.2× video reads identically to the 1× preview.
 */

import { type CSSProperties, memo } from "react";
// Relative, not aliased: the Remotion composition imports this component and is
// type-checked by `server/tsconfig.json`, which has no `@/` path mapping. Every
// other component the video shares does the same.
import {
	CHROME_FONT_STACK,
	CHROME_STYLE,
	CHROME_TEXT_LINE_HEIGHT,
} from "../../../application/layout/frame-metrics";
import { windowTitle } from "../../../application/layout/window-title";

export type WindowChrome = "macos" | "browser" | "terminal" | "none";

export const WINDOW_CHROMES: readonly WindowChrome[] = ["macos", "browser", "terminal", "none"];

/** Defensive union guard for imported / shared payloads. */
export function isWindowChrome(value: unknown): value is WindowChrome {
	return typeof value === "string" && (WINDOW_CHROMES as readonly string[]).includes(value);
}

/**
 * Every number below comes from `CHROME_STYLE`, which `chromeBarHeight` and the
 * frame painter read too. Three surfaces draw this bar; one of them used to draw
 * it from a partial copy of these literals and rendered two of the three
 * variants as an empty strip.
 *
 * The line height and the hairline are set here rather than inherited for the
 * same reason: the studio's body line height is 1.5 and headless Chrome's is
 * `normal`, and a 1px hairline does not grow with the card the painter scales.
 * Either one left to the page made the preview's bar taller than the export's.
 */
const MONO = CHROME_FONT_STACK;

interface FrameChromeProps {
	chrome: WindowChrome;
	title: string;
	/** Theme foreground hex (e.g. "#e6edf3"): every chrome tint derives from it. */
	foreground: string;
	/** Upscale factor for the video (1 in the browser preview). */
	scale?: number;
	/**
	 * The window's width in the same px the bar is laid out at (`scale` applied).
	 * The title is one line cut with an ellipsis at what the bar leaves it, by the
	 * function the frame painter calls too (`windowTitle`), so the three surfaces
	 * draw the same characters. Left out, the whole title is rendered and CSS
	 * clips it, which is the right thing for a window whose width is not known.
	 */
	width?: number;
}

function FrameChromeView({ chrome, title, foreground, scale = 1, width }: FrameChromeProps) {
	if (chrome === "none") {
		return null;
	}
	const shown = width === undefined ? title : windowTitle(title, chrome, width, scale);
	const bar = { title, shown, foreground, scale };
	if (chrome === "browser") {
		return <BrowserChrome {...bar} />;
	}
	if (chrome === "terminal") {
		return <TerminalChrome {...bar} />;
	}
	return <MacosChrome {...bar} />;
}

interface BarProps {
	/** The full name: the tooltip, and what the line is cut from. */
	title: string;
	/** What is drawn: `title` on one line, cut to the room the bar leaves it. */
	shown: string;
	foreground: string;
	scale: number;
}

/**
 * The title's line, which can only ever be one. The string arrives already cut
 * to fit (`shown`); `nowrap` keeps it from wrapping if a fallback face runs a
 * hair wider than the monospace it was counted in, and the ellipsis clip is the
 * whole story when no width was given. `title=` keeps the full name.
 */
function TitleText({
	title,
	shown,
	style,
}: { title: string; shown: string; style: CSSProperties }) {
	return (
		<span
			title={title === "" ? undefined : title}
			style={{
				...style,
				minWidth: 0,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
			}}
		>
			{shown}
		</span>
	);
}

/** The original macOS traffic-light chrome, ported verbatim as scaled inline styles. */
function MacosChrome({ title, shown, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.macos;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				lineHeight: CHROME_TEXT_LINE_HEIGHT,
				borderBottom: `${CHROME_STYLE.border * scale}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
			}}
		>
			{bar.lights.map((color) => (
				<Dot key={color} size={bar.dot * scale} color={color} />
			))}
			{shown && (
				<TitleText
					title={title}
					shown={shown}
					style={{
						marginLeft: bar.gap * scale,
						fontFamily: MONO,
						fontSize: bar.titleSize * scale,
						letterSpacing: bar.titleTracking,
						color: `${foreground}${CHROME_STYLE.titleAlpha}`,
					}}
				/>
			)}
		</div>
	);
}

/** A slim browser tab bar: nav chevrons on the left, a centered pill address bar. */
function BrowserChrome({ title, shown, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.browser;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				lineHeight: CHROME_TEXT_LINE_HEIGHT,
				borderBottom: `${CHROME_STYLE.border * scale}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
			}}
		>
			<div
				aria-hidden="true"
				style={{
					display: "flex",
					alignItems: "center",
					gap: bar.chevronGap * scale,
					fontFamily: MONO,
					fontSize: bar.chevronSize * scale,
					color: `${foreground}${bar.chevronAlpha}`,
				}}
			>
				{bar.chevrons.map((chevron) => (
					<span key={chevron}>{chevron}</span>
				))}
			</div>
			<div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
				<div
					style={{
						maxWidth: `${bar.pillMaxWidth * 100}%`,
						background: `${foreground}${bar.pillAlpha}`,
						borderRadius: bar.pillRadius,
						padding: `${bar.pillPadY * scale}px ${bar.pillPadX * scale}px`,
						overflow: "hidden",
					}}
				>
					<TitleText
						title={title}
						shown={shown}
						style={{
							display: "block",
							// The pill keeps its height when the title has no room (or no
							// text): an empty block has no line box, and the bar is budgeted
							// on a full one.
							minHeight: bar.titleSize * scale * CHROME_TEXT_LINE_HEIGHT,
							fontFamily: MONO,
							fontSize: bar.titleSize * scale,
							letterSpacing: bar.titleTracking,
							color: `${foreground}${CHROME_STYLE.titleAlpha}`,
							textAlign: "center",
						}}
					/>
				</div>
			</div>
			{/* Right spacer keeps the address bar optically centered against the chevrons. */}
			<div aria-hidden="true" style={{ width: bar.spacer * scale, flexShrink: 0 }} />
		</div>
	);
}

/** A thin terminal bar: a prompt glyph, then the title in mono. */
function TerminalChrome({ title, shown, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.terminal;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				lineHeight: CHROME_TEXT_LINE_HEIGHT,
				background: `${foreground}${bar.barAlpha}`,
				borderBottom: `${CHROME_STYLE.border * scale}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
			}}
		>
			<span
				style={{
					fontFamily: MONO,
					fontSize: bar.promptSize * scale,
					fontWeight: bar.promptWeight,
					color: `${foreground}${bar.promptAlpha}`,
				}}
			>
				{bar.prompt}
			</span>
			{shown && (
				<TitleText
					title={title}
					shown={shown}
					style={{
						fontFamily: MONO,
						fontSize: bar.titleSize * scale,
						letterSpacing: bar.titleTracking,
						color: `${foreground}${CHROME_STYLE.titleAlpha}`,
					}}
				/>
			)}
		</div>
	);
}

function Dot({ size, color }: { size: number; color: string }) {
	return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
}

// Memoized: its props hold still while the preview repaints on every playback tick.
export const FrameChrome = memo(FrameChromeView);
