/**
 * Window chrome header for the code frame: a shared presentational component
 * (like `StepCaption` / `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview
 * frame-for-frame. Only the header bar is painted here; the frame shell (border,
 * radius, body) stays at the call site. Everything is inline-styled and driven by
 * `scale` so the 2.2× video reads identically to the 1× preview.
 */

// Relative, not aliased: the Remotion composition imports this component and is
// type-checked by `server/tsconfig.json`, which has no `@/` path mapping. Every
// other component the video shares does the same.
import { CHROME_FONT_STACK, CHROME_STYLE } from "../../../application/layout/frame-metrics";

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
 */
const MONO = CHROME_FONT_STACK;

interface FrameChromeProps {
	chrome: WindowChrome;
	title: string;
	/** Theme foreground hex (e.g. "#e6edf3"): every chrome tint derives from it. */
	foreground: string;
	/** Upscale factor for the video (1 in the browser preview). */
	scale?: number;
}

export function FrameChrome({ chrome, title, foreground, scale = 1 }: FrameChromeProps) {
	if (chrome === "none") {
		return null;
	}
	if (chrome === "browser") {
		return <BrowserChrome title={title} foreground={foreground} scale={scale} />;
	}
	if (chrome === "terminal") {
		return <TerminalChrome title={title} foreground={foreground} scale={scale} />;
	}
	return <MacosChrome title={title} foreground={foreground} scale={scale} />;
}

interface BarProps {
	title: string;
	foreground: string;
	scale: number;
}

/** The original macOS traffic-light chrome, ported verbatim as scaled inline styles. */
function MacosChrome({ title, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.macos;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				borderBottom: `${CHROME_STYLE.border}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
			}}
		>
			{bar.lights.map((color) => (
				<Dot key={color} size={bar.dot * scale} color={color} />
			))}
			{title && (
				<span
					style={{
						marginLeft: bar.gap * scale,
						fontFamily: MONO,
						fontSize: bar.titleSize * scale,
						letterSpacing: bar.titleTracking,
						color: `${foreground}${CHROME_STYLE.titleAlpha}`,
					}}
				>
					{title}
				</span>
			)}
		</div>
	);
}

/** A slim browser tab bar: nav chevrons on the left, a centered pill address bar. */
function BrowserChrome({ title, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.browser;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				borderBottom: `${CHROME_STYLE.border}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
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
					<span
						style={{
							display: "block",
							fontFamily: MONO,
							fontSize: bar.titleSize * scale,
							letterSpacing: bar.titleTracking,
							color: `${foreground}${CHROME_STYLE.titleAlpha}`,
							textAlign: "center",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{title}
					</span>
				</div>
			</div>
			{/* Right spacer keeps the address bar optically centered against the chevrons. */}
			<div aria-hidden="true" style={{ width: bar.spacer * scale, flexShrink: 0 }} />
		</div>
	);
}

/** A thin terminal bar: a prompt glyph, then the title in mono. */
function TerminalChrome({ title, foreground, scale }: BarProps) {
	const bar = CHROME_STYLE.terminal;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: bar.gap * scale,
				padding: `${bar.padY * scale}px ${bar.padX * scale}px`,
				background: `${foreground}${bar.barAlpha}`,
				borderBottom: `${CHROME_STYLE.border}px solid ${foreground}${CHROME_STYLE.borderAlpha}`,
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
			{title && (
				<span
					style={{
						fontFamily: MONO,
						fontSize: bar.titleSize * scale,
						letterSpacing: bar.titleTracking,
						color: `${foreground}${CHROME_STYLE.titleAlpha}`,
					}}
				>
					{title}
				</span>
			)}
		</div>
	);
}

function Dot({ size, color }: { size: number; color: string }) {
	return <div style={{ width: size, height: size, borderRadius: "50%", background: color }} />;
}
