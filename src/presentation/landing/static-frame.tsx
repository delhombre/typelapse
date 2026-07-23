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

/** Restrained, Tuple-like corner radii: a crisp inner window, and a mesh frame
    that is exactly concentric with it (outer = inner + the mesh padding). */
const WINDOW_RADIUS = 8;

interface StaticFrameProps {
	themeName: string;
	presetId: string;
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
	/** Alt text: these are product shots, so screen readers get one concise label
	    instead of the raw, tokenized Shiki markup. */
	label?: string;
	className?: string;
}

/**
 * A single, static, syntax-highlighted code frame on an animated-mesh backdrop:
 * the same look the studio exports, rendered once (no loop). Used for the theme
 * gallery and aspect-ratio showcase where variety, not motion, is the point.
 */
export function StaticFrame({
	themeName,
	presetId,
	code,
	language = "typescript",
	title,
	meshTime = 3,
	meshPadding = 14,
	framePadding = 18,
	fontSize = 12,
	fill = false,
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
					<div
						className={`studio-code font-mono leading-[1.6] ${fill ? "flex flex-1 items-center" : ""}`}
						style={{ padding: framePadding, fontSize, color: theme.foreground }}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output from our own highlighter
						dangerouslySetInnerHTML={{ __html: html }}
					/>
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
}: { theme: Theme; title: string; children: ReactNode; fill?: boolean }) {
	return (
		<div
			className={`overflow-hidden ${fill ? "flex h-full flex-1 flex-col" : ""}`}
			style={{
				background: theme.background,
				borderRadius: WINDOW_RADIUS,
				boxShadow: "0 18px 44px -20px rgb(0 0 0 / 0.55)",
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
