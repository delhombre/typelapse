import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const THEMES: Record<string, () => Theme> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	frost: Theme.frost,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
};

/** Inner code-window radius when the window sits inside a mesh frame. */
const WINDOW_RADIUS = 6;
/** A bare card is its own window, so it carries a slightly larger, crisp radius. */
export const BARE_RADIUS = 11;
/** Refined, layered shadow for a dark code card resting on the light paper: a
    hairline outline, a tight contact shadow, two soft depth shadows, and a top
    inner light-catch. Shadows over borders, as the craft rules prescribe. */
export const CARD_SHADOW = [
	"0 0 0 1px rgb(0 0 0 / 0.04)",
	"0 1px 2px rgb(0 0 0 / 0.05)",
	"0 8px 20px -8px rgb(0 0 0 / 0.16)",
	"0 26px 50px -22px rgb(0 0 0 / 0.16)",
	"inset 0 1px 0 rgb(255 255 255 / 0.06)",
].join(", ");
/** Shadow for the window when it sits inside a mesh frame (deep, on the mesh). */
const MESH_WINDOW_SHADOW = "0 18px 44px -20px rgb(0 0 0 / 0.55)";

interface StaticFrameProps {
	themeName: string;
	/** Mesh preset id. Ignored (and optional) for a `bare` card. */
	presetId?: string;
	code: string;
	language?: string;
	title: string;
	/** Seconds into the mesh loop: vary it per frame for visual variety. */
	meshTime?: number;
	meshPadding?: number;
	framePadding?: number;
	fontSize?: number;
	/** Stretch the window to fill the card (aspect set via className) and centre the code. */
	fill?: boolean;
	/** Drop the mesh backdrop entirely: a clean dark code window on the page, with
	    a refined grounding shadow. Used where the code, not the export look, is the
	    subject (the magic-move and diff shots). */
	bare?: boolean;
	/** Alt text: these are product shots, so screen readers get one concise label
	    instead of the raw, tokenized Shiki markup. */
	label?: string;
	className?: string;
}

/**
 * A single, static, syntax-highlighted code frame. By default it sits on an
 * animated-mesh backdrop (the same look the studio exports). With `bare` it
 * renders as a clean dark code card on the page instead, for shots where the
 * code, not the export look, is the subject.
 */
export function StaticFrame({
	themeName,
	presetId,
	code,
	language = "typescript",
	title,
	meshTime = 3,
	meshPadding = 10,
	framePadding = 18,
	fontSize = 12,
	fill = false,
	bare = false,
	label,
	className = "",
}: StaticFrameProps) {
	const theme = useMemo(() => (THEMES[themeName] ?? Theme.aurora)(), [themeName]);
	const preset = useMemo(
		() => MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0],
		[presetId],
	);
	const [html, setHtml] = useState("");

	useEffect(() => {
		let cancelled = false;
		shikiAdapter
			.highlight(code, language, themeName)
			.then((h) => {
				if (!cancelled) {
					setHtml(h);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [code, language, themeName]);

	const codeBlock = (
		<div
			className={`studio-code font-mono leading-[1.6] ${fill ? "flex flex-1 items-center" : ""}`}
			style={{ padding: framePadding, fontSize, color: theme.foreground }}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output from our own highlighter
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);

	if (bare) {
		return (
			<div role={label ? "img" : undefined} aria-label={label} className={`relative ${className}`}>
				<FrameShell theme={theme} title={title} fill={fill} radius={BARE_RADIUS} shadow={CARD_SHADOW}>
					{codeBlock}
				</FrameShell>
			</div>
		);
	}

	return (
		<div
			role={label ? "img" : undefined}
			aria-label={label}
			className={`code-frame-glow relative overflow-hidden ${className}`}
			style={{
				padding: meshPadding,
				// True concentric: outer radius = inner window radius + the mesh padding,
				// so the frame and window corners nest exactly.
				borderRadius: WINDOW_RADIUS + meshPadding,
				background: preset ? meshGradientCss(preset, meshTime) : undefined,
			}}
		>
			<GrainOverlay />
			<div className={`relative z-10 ${fill ? "flex h-full w-full" : ""}`}>
				<FrameShell theme={theme} title={title} fill={fill}>
					{codeBlock}
				</FrameShell>
			</div>
		</div>
	);
}

function FrameShell({
	theme,
	title,
	children,
	fill = false,
	radius = WINDOW_RADIUS,
	shadow = MESH_WINDOW_SHADOW,
}: {
	theme: Theme;
	title: string;
	children: ReactNode;
	fill?: boolean;
	radius?: number;
	shadow?: string;
}) {
	return (
		<div
			className={`overflow-hidden ${fill ? "flex h-full flex-1 flex-col" : ""}`}
			style={{
				background: theme.background,
				borderRadius: radius,
				boxShadow: shadow,
			}}
		>
			<div
				className={`flex items-center gap-1.5 px-3 py-2.5 ${fill ? "shrink-0" : ""}`}
				style={{ borderBottom: `1px solid ${theme.foreground}0f` }}
			>
				<div className="size-2.5 rounded-full bg-[#ff5f57]" />
				<div className="size-2.5 rounded-full bg-[#febc2e]" />
				<div className="size-2.5 rounded-full bg-[#28c840]" />
				<span
					className="ml-2 truncate font-mono text-[10px] tracking-tight"
					style={{ color: `${theme.foreground}59` }}
				>
					{title}
				</span>
			</div>
			{children}
		</div>
	);
}
