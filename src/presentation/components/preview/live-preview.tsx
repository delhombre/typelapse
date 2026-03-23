import type { Theme } from "@/domain/entities/theme";
import { PlaybackControls } from "@/presentation/components/controls/playback-controls";
import { AnimatedSizeContainer } from "@/presentation/components/shared/animated-size-container";
import { getRawShikiHighlighter, useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import { ShikiMagicMove } from "shiki-magic-move/react";
import "shiki-magic-move/dist/style.css";
import { CodeFrame } from "./code-frame";

const SHIKI_THEME_MAP: Record<string, string> = {
	midnight: "github-dark",
	aurora: "aurora-x",
	frost: "github-light",
	dracula: "dracula",
	"one-dark": "one-dark-pro",
	catppuccin: "catppuccin-mocha",
	nord: "nord",
};

export function LivePreview() {
	const {
		snippet,
		highlightedHtml,
		isHighlighting,
		stepFrames,
		currentStepIndex,
		isPlaying,
		background,
		framePadding,
		watermark,
	} = useSnippetStore();

	const hasSteps = snippet.steps.length > 0 && stepFrames.length > 0;
	const shikiHighlighter = getRawShikiHighlighter();
	const displayCode = snippet.steps[currentStepIndex]?.code ?? "";
	const displayHtml = hasSteps ? (stepFrames[currentStepIndex] ?? "") : highlightedHtml;

	if (!displayHtml && !isHighlighting) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-400">
				<svg
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1"
					role="img"
				>
					<title>Code icon</title>
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</svg>
				<span className="font-mono text-xs">Write code to see the preview</span>
			</div>
		);
	}

	const isTransparent = background === "transparent";

	return (
		<div className="flex h-full flex-col">
			{/* Canvas — the centerpiece */}
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
				<motion.div
					data-export-target
					className={`w-full max-w-2xl ${isPlaying && !isTransparent ? "bg-animate-playing" : ""}`}
					animate={{ background: isTransparent ? "transparent" : background }}
					transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
					style={{
						opacity: isHighlighting ? 0.7 : 1,
						padding: isTransparent ? 0 : 32,
						borderRadius: isTransparent
							? 0
							: snippet.theme.borderRadius > 0
								? snippet.theme.borderRadius + 8
								: 0,
					}}
				>
					<AnimatedSizeContainer height className="w-full">
						{hasSteps && shikiHighlighter ? (
							<MagicMoveCodeFrame
								highlighter={shikiHighlighter}
								code={displayCode}
								lang={snippet.language}
								theme={snippet.theme}
								title={snippet.title}
								padding={framePadding}
							/>
						) : (
							<CodeFrame
								html={displayHtml}
								theme={snippet.theme}
								title={snippet.title}
								paddingOverride={framePadding}
							/>
						)}
					</AnimatedSizeContainer>
					{watermark && (
						<div className="mt-2 text-right">
							<span
								className="font-mono text-[10px]"
								style={{ color: getWatermarkColor(background, snippet.theme.foreground) }}
							>
								{watermark}
							</span>
						</div>
					)}
				</motion.div>
			</div>

			{/* Playback */}
			<div className="flex shrink-0 justify-center pb-3">
				<PlaybackControls />
			</div>
		</div>
	);
}

/** CodeFrame with shiki-magic-move for smooth token morphing transitions */
function MagicMoveCodeFrame({
	highlighter,
	code,
	lang,
	theme,
	title,
	padding,
}: {
	highlighter: Parameters<typeof ShikiMagicMove>[0]["highlighter"];
	code: string;
	lang: string;
	theme: Theme;
	title: string;
	padding: number;
}) {
	const shikiTheme = SHIKI_THEME_MAP[theme.name] ?? "github-dark";

	return (
		<div
			className="code-frame-glow overflow-hidden"
			style={{ background: theme.background, borderRadius: theme.borderRadius }}
		>
			<div
				className="flex items-center gap-2 px-4 py-3"
				style={{ borderBottom: `1px solid ${theme.foreground}08` }}
			>
				<div className="size-[11px] rounded-full bg-[#ff5f57]" />
				<div className="size-[11px] rounded-full bg-[#febc2e]" />
				<div className="size-[11px] rounded-full bg-[#28c840]" />
				{title && (
					<span
						className="ml-2 font-mono text-[11px] tracking-tight"
						style={{ color: `${theme.foreground}35` }}
					>
						{title}
					</span>
				)}
			</div>
			<div
				style={{
					padding: `0 ${padding}px ${padding}px ${padding}px`,
					fontFamily: theme.fontFamily,
					fontSize: theme.fontSize,
				}}
			>
				<ShikiMagicMove
					highlighter={highlighter}
					lang={lang}
					theme={shikiTheme}
					code={code}
					options={{
						duration: 500,
						stagger: 0.3,
						lineNumbers: true,
						animateContainer: true,
					}}
					className="!bg-transparent"
				/>
			</div>
		</div>
	);
}

/** Pick a watermark color that contrasts with the background */
function getWatermarkColor(background: string, themeForeground: string): string {
	if (background === "transparent") {
		return `${themeForeground}66`;
	}
	// Extract the dominant hex color from gradients or plain colors
	const hexMatch = background.match(/#([0-9a-fA-F]{6})/);
	if (!hexMatch?.[1]) {
		return `${themeForeground}66`;
	}
	const hex = hexMatch[1];
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	// Relative luminance (sRGB)
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
}
