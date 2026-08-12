/**
 * C. La scène.
 *
 * No columns and no bars: the paper is the stage, edge to edge, and everything
 * else floats on it. The brand and the file actions are a chip in the top
 * corners; Code and Steps are one card on the left that folds away; the island
 * is the only permanent instrument, and the look controls rise out of it as a
 * sheet wearing the island's own material.
 *
 * Fold the card and the studio is one object on paper, which is the closest of
 * the three to the landing. The honest cost is discoverability: with the card
 * folded, nothing on screen says the word "code".
 */

import { Logomark } from "@/presentation/components/ui/logomark";
import { useState } from "react";
import {
	AspectGlyph,
	CodeFacsimile,
	Gap,
	Island,
	IslandButton,
	IslandRow,
	Stage,
	StepsList,
	Transport,
} from "./parts";
import { BACKGROUND_SWATCHES, THEME_SWATCHES } from "./project";

type Sheet = "frame" | "look" | "motion" | "export" | null;

export function DirectionC({
	initialSheet = null,
	initialCollapsed = false,
}: { initialSheet?: Sheet; initialCollapsed?: boolean }) {
	const [sheet, setSheet] = useState<Sheet>(initialSheet);
	const [collapsed, setCollapsed] = useState(initialCollapsed);

	const toggleSheet = (next: Exclude<Sheet, null>) =>
		setSheet((prev) => (prev === next ? null : next));

	return (
		<div className="pshell studio-root relative h-dvh w-full overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			{/* The stage. It is the page, and it gives the card its room rather than
			    being overlapped by it: fold the card and the object recentres. */}
			<div
				className="absolute inset-0 flex items-center justify-center transition-[padding,transform] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
				style={{
					paddingLeft: collapsed ? 96 : 396,
					paddingRight: 96,
					paddingTop: 88,
					paddingBottom: sheet ? 360 : 104,
					/* Raising the sheet steps the object back rather than covering it.
					   A scale and not a shrink: the frame's height is its nine lines, so
					   nothing here can be solved by giving it less room. */
					transform: sheet ? "scale(0.82)" : "none",
				}}
			>
				<Stage className="max-h-full w-full max-w-[860px]" />
			</div>

			{/* The brand, and the file actions, as two chips rather than a bar. */}
			<div className="ps-float absolute top-5 left-5 flex h-10 items-center gap-2.5 pr-4 pl-2.5">
				<span className="flex size-6 items-center justify-center rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
					<Logomark size={13} />
				</span>
				<span className="text-[12px] font-semibold tracking-tight">use-toast.ts</span>
				<span className="text-[11px] text-neutral-400 dark:text-neutral-500">· 3 steps</span>
			</div>

			<div className="ps-float absolute top-5 right-5 flex h-10 items-center gap-1 px-2 text-neutral-500 dark:text-neutral-400">
				<Glyph d="M4 7h16M4 12h10M4 17h7" />
				<Glyph d="M18 8a3 3 0 1 0-2.83-4M6 15a3 3 0 1 0 0-6M18 22a3 3 0 1 0 0-6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
				<Glyph d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
				<span className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
				<Glyph d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			</div>

			{/* The work surface: Code and Steps in one card that folds to a tab. */}
			{collapsed ? (
				<button
					type="button"
					onClick={() => setCollapsed(false)}
					className="ps-float absolute top-1/2 left-5 flex h-28 w-10 -translate-y-1/2 flex-col items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M9 18l6-6-6-6" />
					</svg>
					<span className="text-[10px] font-semibold tracking-[0.18em] [writing-mode:vertical-rl]">
						CODE
					</span>
				</button>
			) : (
				<div className="ps-float absolute top-20 bottom-24 left-5 flex w-[356px] flex-col overflow-hidden">
					<header className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-200/60 px-4 dark:border-neutral-800/60">
						<span className="ps-eyebrow">Code</span>
						<button
							type="button"
							onClick={() => setCollapsed(true)}
							className="flex size-7 items-center justify-center rounded-lg text-neutral-400 dark:text-neutral-500"
							aria-label="Fold the code card away"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								aria-hidden="true"
							>
								<path d="M15 18l-6-6 6-6" />
							</svg>
						</button>
					</header>
					<div className="shrink-0 overflow-hidden p-4">
						<CodeFacsimile />
					</div>
					<div className="flex min-h-0 flex-1 flex-col border-t border-neutral-200/60 p-4 dark:border-neutral-800/60">
						<div className="flex items-center justify-between">
							<span className="ps-eyebrow">Steps</span>
							<span className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
								3 · 3.9s
							</span>
						</div>
						<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
							<StepsList dense />
						</div>
					</div>
				</div>
			)}

			{/* The instrument, and the sheet it raises. It takes the stage's own
			    padding rather than the viewport's, so the object and the thing that
			    drives it share one centre line — and fold the card and both slide
			    back to the middle together. */}
			<div
				className="psi-dock absolute inset-x-0 bottom-0 transition-[padding] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
				style={{ paddingLeft: collapsed ? 96 : 396, paddingRight: 96 }}
			>
				{sheet && <SheetPanel sheet={sheet} />}
				<Island single>
					<IslandRow>
						<Transport />
						<Gap />
						<IslandButton active={sheet === "frame"} onClick={() => toggleSheet("frame")}>
							Frame
						</IslandButton>
						<IslandButton active={sheet === "look"} onClick={() => toggleSheet("look")}>
							Look
						</IslandButton>
						<IslandButton active={sheet === "motion"} onClick={() => toggleSheet("motion")}>
							Motion
						</IslandButton>
						<button type="button" className="psi-cta" onClick={() => toggleSheet("export")}>
							Export
						</button>
					</IslandRow>
				</Island>
			</div>
		</div>
	);
}

function Glyph({ d }: { d: string }) {
	return (
		<span className="flex size-8 items-center justify-center rounded-lg">
			<svg
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				aria-hidden="true"
			>
				<path d={d} />
			</svg>
		</span>
	);
}

function SheetPanel({ sheet }: { sheet: Exclude<Sheet, null> }) {
	return (
		<div className="ps-sheet">
			<div className="ps-sheet-tabs">
				<IslandButton active={sheet === "frame"}>Frame</IslandButton>
				<IslandButton active={sheet === "look"}>Look</IslandButton>
				<IslandButton active={sheet === "motion"}>Motion</IslandButton>
				<IslandButton active={sheet === "export"}>Export</IslandButton>
			</div>
			{sheet === "look" && <LookSheet />}
			{sheet === "frame" && <FrameSheet />}
			{sheet === "motion" && <MotionSheet />}
			{sheet === "export" && <ExportSheet />}
		</div>
	);
}

function LookSheet() {
	return (
		<>
			<div className="ps-sheet-group">
				<p className="ps-sheet-label">Theme</p>
				<div className="grid grid-cols-7 gap-2">
					{THEME_SWATCHES.map((theme, i) => (
						<span key={theme.name} className="flex flex-col items-center gap-1.5">
							<span
								className={`h-9 w-full rounded-[9px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] ${
									i === 0 ? "outline outline-2 outline-offset-2 outline-[var(--dock-ink)]" : ""
								}`}
								style={{ background: theme.bg }}
							/>
							<span className="text-[9.5px] text-[var(--dock-dim)]">{theme.label}</span>
						</span>
					))}
				</div>
			</div>
			<div className="ps-sheet-group">
				<p className="ps-sheet-label">Mesh</p>
				<div className="grid grid-cols-7 gap-2">
					{BACKGROUND_SWATCHES.map((bg, i) => (
						<span key={bg.id} className="flex flex-col items-center gap-1.5">
							<span
								className={`h-9 w-full rounded-[9px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)] ${
									i === 0 ? "outline outline-2 outline-offset-2 outline-[var(--dock-ink)]" : ""
								}`}
								style={{ background: bg.css }}
							/>
							<span className="text-[9.5px] text-[var(--dock-dim)]">{bg.label}</span>
						</span>
					))}
				</div>
			</div>
			<div className="ps-sheet-group flex items-center gap-5">
				<span className="flex items-center gap-1">
					<span className="ps-sheet-label-inline">Radius</span>
					<IslandButton selected>12</IslandButton>
				</span>
				<span className="flex items-center gap-1">
					<span className="ps-sheet-label-inline">Font</span>
					<IslandButton selected>JetBrains</IslandButton>
					<IslandButton>Fira</IslandButton>
					<IslandButton>Geist</IslandButton>
				</span>
			</div>
		</>
	);
}

function FrameSheet() {
	return (
		<>
			<div className="ps-sheet-group">
				<p className="ps-sheet-label">Shape</p>
				<div className="flex items-center gap-1">
					<IslandButton soft label="16 by 9">
						<AspectGlyph w={16} h={9} />
					</IslandButton>
					<IslandButton label="1 by 1">
						<AspectGlyph w={13} h={13} />
					</IslandButton>
					<IslandButton label="9 by 16">
						<AspectGlyph w={9} h={16} />
					</IslandButton>
					<IslandButton label="4 by 5">
						<AspectGlyph w={11} h={14} />
					</IslandButton>
					<IslandButton label="3 by 4">
						<AspectGlyph w={11} h={15} />
					</IslandButton>
				</div>
			</div>
			<div className="ps-sheet-group flex items-center gap-6">
				<span className="flex items-center gap-1">
					<span className="ps-sheet-label-inline">Chrome</span>
					<IslandButton selected>macOS</IslandButton>
					<IslandButton>Web</IslandButton>
					<IslandButton>Term</IslandButton>
					<IslandButton>None</IslandButton>
				</span>
				<span className="flex items-center gap-1">
					<span className="ps-sheet-label-inline">Pad</span>
					<IslandButton>24</IslandButton>
					<span className="ps-sheet-label-inline">Margin</span>
					<IslandButton>32</IslandButton>
				</span>
			</div>
		</>
	);
}

function MotionSheet() {
	return (
		<div className="ps-sheet-group flex flex-wrap items-center gap-x-6 gap-y-3">
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Tempo</span>
				<IslandButton>Snappy</IslandButton>
				<IslandButton selected>Smooth</IslandButton>
				<IslandButton>Cine</IslandButton>
			</span>
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Beats</span>
				<IslandButton active>Type</IslandButton>
				<IslandButton>Zoom</IslandButton>
				<IslandButton active>Sound</IslandButton>
				<IslandButton>Loop</IslandButton>
			</span>
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Progress</span>
				<IslandButton selected>Reels</IslandButton>
				<IslandButton>Bar</IslandButton>
				<IslandButton>None</IslandButton>
			</span>
		</div>
	);
}

function ExportSheet() {
	return (
		<div className="ps-sheet-group flex flex-wrap items-center gap-x-6 gap-y-3">
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Format</span>
				<IslandButton selected>MP4</IslandButton>
				<IslandButton>WebM</IslandButton>
				<IslandButton>GIF</IslandButton>
			</span>
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Size</span>
				<IslandButton selected>1080p</IslandButton>
				<IslandButton>1440p</IslandButton>
				<IslandButton>4K</IslandButton>
			</span>
			<span className="flex items-center gap-1">
				<span className="ps-sheet-label-inline">Where</span>
				<IslandButton selected>This device</IslandButton>
				<IslandButton>Server</IslandButton>
			</span>
			<button type="button" className="psi-cta ml-auto">
				Render 16:9 · MP4
			</button>
		</div>
	);
}
