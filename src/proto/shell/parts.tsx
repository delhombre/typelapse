/**
 * The pieces every direction shares, so only the structure differs between
 * them. Real components where they were cheap (the preview is the landing's
 * own `StaticFrame`, running the real Shiki on the real Solar mesh); static
 * facsimiles where wiring would have cost a day and taught nothing (the
 * editor, the step rows, the top nav).
 *
 * Throwaway: dies with src/proto/shell.
 */

import { Logomark } from "@/presentation/components/ui/logomark";
import { StaticFrame } from "@/presentation/landing/static-frame";
import type { ReactNode } from "react";
import {
	CURRENT_STEP,
	PROJECT_BACKGROUND,
	PROJECT_CODE,
	PROJECT_STEPS,
	PROJECT_THEME,
	PROJECT_TITLE,
} from "./project";

/* ──────────────────────────── The preview ──────────────────────────── */

/** The product shot: the real frame, the real mesh, the real highlighter.
    `compact` is the 390 mock's size, where the same nine lines have to fit a
    342px column. */
export function Stage({
	className = "",
	compact = false,
}: { className?: string; compact?: boolean }) {
	return (
		<StaticFrame
			themeName={PROJECT_THEME}
			presetId={PROJECT_BACKGROUND}
			code={PROJECT_CODE}
			title={PROJECT_TITLE}
			label="Preview: useToast, step 2 of 3, on the Solar mesh"
			meshPadding={compact ? 14 : 24}
			framePadding={compact ? 10 : 20}
			fontSize={compact ? 8 : 12}
			className={className}
		/>
	);
}

/* ──────────────────────────── The top nav ──────────────────────────── */

/** The studio's own header, unchanged: it is not what any of the three is
    arguing about, so it is held fixed in A and B and only removed in C. */
export function Nav() {
	return (
		<nav className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200/70 bg-white/70 px-4 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-950/70">
			<div className="flex items-center gap-4">
				<span className="flex items-center gap-2.5">
					<span className="flex size-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
						<Logomark size={16} />
					</span>
					<span className="text-sm font-semibold tracking-tight">Typelapse</span>
				</span>
				<span className="flex h-8 items-center rounded-lg border border-neutral-200/70 px-3 text-xs font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
					Templates
				</span>
			</div>
			<div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
				<NavGlyph d="M4 7h16M4 12h10M4 17h7" />
				<NavGlyph d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
				<NavGlyph d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
				<span className="mx-1.5 h-5 w-px bg-neutral-200 dark:bg-neutral-800" />
				<NavGlyph d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			</div>
		</nav>
	);
}

function NavGlyph({ d }: { d: string }) {
	return (
		<span className="flex size-9 items-center justify-center rounded-xl">
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

/* ──────────────────────────── The editor ──────────────────────────── */

type Tok = readonly [string, string];

const CODE_LINES: readonly (readonly Tok[])[] = [
	[
		["tk-kw", "export function "],
		["tk-fn", "useToast"],
		["", "() {"],
	],
	[
		["", "  "],
		["tk-kw", "const "],
		["", "[items, setItems] = "],
		["tk-fn", "useState"],
		["tk-ty", "<Toast[]>"],
		["", "([]);"],
	],
	[],
	[
		["", "  "],
		["tk-kw", "const "],
		["tk-fn", "push"],
		["", " = (message: "],
		["tk-ty", "string"],
		["", ") => {"],
	],
	[
		["", "    "],
		["tk-fn", "setItems"],
		["", "((prev) => [...prev, { id: "],
		["tk-fn", "uid"],
		["", "(), message }]);"],
	],
	[["", "  };"]],
	[],
	[
		["", "  "],
		["tk-kw", "return "],
		["", "{ items, push };"],
	],
	[["", "}"]],
];

/** A static picture of the editor. The question on this page is where the
    column sits, not what Monaco does inside it. */
export function CodeFacsimile() {
	return (
		<div className="ps-code">
			{CODE_LINES.map((tokens, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed, static listing
				<div className="ps-code-line" key={i}>
					<span className="ps-code-num">{String(i + 1).padStart(2, "0")}</span>
					<span className="ps-code-text">
						{tokens.map((tok, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a fixed, static listing
							<span className={tok[0]} key={j}>
								{tok[1]}
							</span>
						))}
					</span>
				</div>
			))}
		</div>
	);
}

/* ──────────────────────────── The steps ──────────────────────────── */

export function StepsList({ dense = false }: { dense?: boolean }) {
	return (
		<div className="flex flex-col gap-2">
			{PROJECT_STEPS.map((step, i) => {
				const selected = i === CURRENT_STEP;
				return (
					<div
						key={step.index}
						className={`flex flex-col gap-1.5 rounded-xl border ${dense ? "p-2" : "p-2.5"} ${
							selected
								? "border-neutral-300 bg-neutral-100/80 dark:border-neutral-600/60 dark:bg-neutral-800/50"
								: "border-neutral-200/70 dark:border-neutral-800"
						}`}
					>
						<div className="flex items-center gap-2">
							<span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
								{String(step.index).padStart(2, "0")}
							</span>
							<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
								{step.preview}
							</span>
							<span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
								{step.seconds}
							</span>
						</div>
						<span className="pl-6 text-[11px] text-neutral-400 dark:text-neutral-500">
							{step.annotation}
						</span>
					</div>
				);
			})}
			<button
				type="button"
				className="flex h-9 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-[11px] font-medium text-neutral-400 dark:border-neutral-700 dark:text-neutral-500"
			>
				+ Capture step
			</button>
		</div>
	);
}

/* ──────────── The island (acquired from PR #48, sketched in place) ──────── */

export function Island({ children, single = false }: { children: ReactNode; single?: boolean }) {
	return (
		<div className="psi-island" {...(single ? { "data-single": "" } : {})}>
			<div className="psi-column">{children}</div>
		</div>
	);
}

export function IslandRow({ children }: { children: ReactNode }) {
	return <div className="psi-row">{children}</div>;
}

export function IslandButton({
	children,
	active = false,
	selected = false,
	soft = false,
	onClick,
	label,
}: {
	children: ReactNode;
	active?: boolean;
	/** One of several: the ink plate, and the word on it goes dark. */
	selected?: boolean;
	/** The same claim over a swatch: a wash, so the colour survives it. */
	soft?: boolean;
	onClick?: () => void;
	label?: string;
}) {
	const marked = selected || soft;
	return (
		<button
			type="button"
			className="psi-button"
			onClick={onClick}
			aria-label={label}
			{...(active ? { "data-active": "" } : {})}
			{...(selected ? { "data-selected": "" } : {})}
		>
			{marked && <span className={soft ? "psi-plate psi-plate-soft" : "psi-plate"} />}
			<span className="psi-label">{children}</span>
		</button>
	);
}

/** Play, the three step dots, the gauge and the readout: the transport the
    island already carries on main, held identical in all three directions. */
export function Transport() {
	return (
		<>
			<IslandButton label="Play">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M8 5v14l11-7z" />
				</svg>
			</IslandButton>
			<div className="psi-dots">
				{PROJECT_STEPS.map((step, i) => (
					<button
						type="button"
						key={step.index}
						className="psi-dot"
						aria-label={`Step ${step.index}`}
						{...(i === CURRENT_STEP ? { "aria-current": "step" as const } : {})}
					>
						<span />
					</button>
				))}
			</div>
			<div className="psi-track">
				<div className="psi-fill" style={{ width: "46%" }} />
			</div>
			<span className="psi-count">02 / 03</span>
		</>
	);
}

export function Gap() {
	return <span className="psi-gap" aria-hidden="true" />;
}

/** An aspect chip drawn as the ratio itself, the way the landing's island
    draws its frame control. */
export function AspectGlyph({ w, h }: { w: number; h: number }) {
	return <span className="psi-frame" style={{ width: w, height: h }} aria-hidden="true" />;
}
