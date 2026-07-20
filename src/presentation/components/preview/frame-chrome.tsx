/**
 * Window chrome header for the code frame: a shared presentational component
 * (like `StepCaption` / `ReelsProgress`): the browser preview and the Remotion
 * composition both render it, so the exported video matches the preview
 * frame-for-frame. Only the header bar is painted here; the frame shell (border,
 * radius, body) stays at the call site. Everything is inline-styled and driven by
 * `scale` so the 2.2× video reads identically to the 1× preview.
 */

export type WindowChrome = "macos" | "browser" | "terminal" | "none";

export const WINDOW_CHROMES: readonly WindowChrome[] = ["macos", "browser", "terminal", "none"];

/** Defensive union guard for imported / shared payloads. */
export function isWindowChrome(value: unknown): value is WindowChrome {
	return typeof value === "string" && (WINDOW_CHROMES as readonly string[]).includes(value);
}

/** Mono stack for chrome titles: matches the app's `--font-mono`. */
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

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
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8 * scale,
				padding: `${12 * scale}px ${16 * scale}px`,
				borderBottom: `1px solid ${foreground}0f`,
			}}
		>
			<Dot size={11 * scale} color="#ff5f57" />
			<Dot size={11 * scale} color="#febc2e" />
			<Dot size={11 * scale} color="#28c840" />
			{title && (
				<span
					style={{
						marginLeft: 8 * scale,
						fontFamily: MONO,
						fontSize: 11 * scale,
						letterSpacing: "-0.02em",
						color: `${foreground}59`,
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
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10 * scale,
				padding: `${9 * scale}px ${14 * scale}px`,
				borderBottom: `1px solid ${foreground}0f`,
			}}
		>
			<div
				aria-hidden="true"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 7 * scale,
					fontFamily: MONO,
					fontSize: 13 * scale,
					color: `${foreground}40`,
				}}
			>
				<span>‹</span>
				<span>›</span>
			</div>
			<div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
				<div
					style={{
						maxWidth: "72%",
						background: `${foreground}0d`,
						borderRadius: 999,
						padding: `${4 * scale}px ${12 * scale}px`,
						overflow: "hidden",
					}}
				>
					<span
						style={{
							display: "block",
							fontFamily: MONO,
							fontSize: 11 * scale,
							letterSpacing: "-0.01em",
							color: `${foreground}59`,
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
			<div aria-hidden="true" style={{ width: 21 * scale, flexShrink: 0 }} />
		</div>
	);
}

/** A thin terminal bar: a prompt glyph, then the title in mono. */
function TerminalChrome({ title, foreground, scale }: BarProps) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8 * scale,
				padding: `${9 * scale}px ${16 * scale}px`,
				background: `${foreground}08`,
				borderBottom: `1px solid ${foreground}0f`,
			}}
		>
			<span
				style={{
					fontFamily: MONO,
					fontSize: 12 * scale,
					fontWeight: 600,
					color: `${foreground}80`,
				}}
			>
				❯
			</span>
			{title && (
				<span
					style={{
						fontFamily: MONO,
						fontSize: 11 * scale,
						letterSpacing: "-0.01em",
						color: `${foreground}59`,
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
