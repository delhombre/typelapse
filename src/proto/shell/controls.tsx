/**
 * The paper-side controls direction B's inspector is built from.
 *
 * The landing's material, applied to a settings column: rounded-2xl cards, one
 * hairline each, an eyebrow at 0.18em for the cluster name, and a label / control
 * row rhythm so forty controls read as four groups of ten rather than forty.
 */

import type { ReactNode } from "react";

export function Cluster({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-2xl border border-neutral-200/70 bg-white p-3.5 dark:border-neutral-800/70 dark:bg-neutral-900/40">
			<h2 className="ps-eyebrow">{title}</h2>
			<div className="mt-2.5 flex flex-col gap-2">{children}</div>
		</section>
	);
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-7 items-center justify-between gap-3">
			<span className="shrink-0 text-[12px] text-neutral-500 dark:text-neutral-400">{label}</span>
			{children}
		</div>
	);
}

/** A row whose control needs the column's full width: the label goes above it
    rather than beside it, which is the only way four toggles fit 228px. */
export function StackRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[12px] text-neutral-500 dark:text-neutral-400">{label}</span>
			<span className="flex items-center gap-1">{children}</span>
		</div>
	);
}

export function Segmented({
	items,
	value,
	compact = false,
}: { items: readonly string[]; value: string; compact?: boolean }) {
	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-neutral-200/70 p-0.5 dark:border-neutral-800">
			{items.map((item) => (
				<span
					key={item}
					className={`rounded-md ${compact ? "px-1.5" : "px-2"} py-1 text-[11px] font-medium tabular-nums ${
						item === value
							? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
							: "text-neutral-500 dark:text-neutral-400"
					}`}
				>
					{item}
				</span>
			))}
		</div>
	);
}

/** The control that stands in for a whole grid: the current choice, wearing its
    own colour, and a chevron that says there are more behind it. */
export function PickerButton({
	label,
	swatch,
	open = false,
	onClick,
}: { label: string; swatch: string; open?: boolean; onClick?: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex h-8 items-center gap-2 rounded-lg border px-2 text-[11px] font-medium transition-colors ${
				open
					? "border-neutral-400 bg-neutral-100 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
					: "border-neutral-200/70 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
			}`}
		>
			<span
				className="size-4 rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]"
				style={{ background: swatch }}
			/>
			{label}
			<svg
				width="9"
				height="9"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				aria-hidden="true"
				className="text-neutral-400"
			>
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>
	);
}

export function Popover({ children }: { children: ReactNode }) {
	return (
		<div className="absolute top-full right-0 z-30 mt-2 rounded-2xl border border-neutral-200/70 bg-white p-3 shadow-[0_2px_6px_rgb(0_0_0/0.04),0_24px_48px_-20px_rgb(0_0_0/0.28)] dark:border-neutral-800 dark:bg-neutral-900">
			{children}
		</div>
	);
}

export function SwatchGrid({
	items,
	selected,
}: { items: readonly { label: string; css: string }[]; selected: string }) {
	return (
		<div className="grid w-[188px] grid-cols-3 gap-2">
			{items.map((item) => (
				<span key={item.label} className="flex flex-col items-center gap-1.5">
					<span
						className={`h-11 w-full rounded-[9px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ${
							item.label === selected
								? "ring-2 ring-neutral-900 ring-offset-2 ring-offset-white dark:ring-neutral-100 dark:ring-offset-neutral-900"
								: ""
						}`}
						style={{ background: item.css }}
					/>
					<span className="text-[10px] text-neutral-500 dark:text-neutral-400">{item.label}</span>
				</span>
			))}
		</div>
	);
}

export function Toggle({ label, on = false }: { label: string; on?: boolean }) {
	return (
		<span
			className={`inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-medium ${
				on
					? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
					: "border-neutral-200/70 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
			}`}
		>
			{label}
		</span>
	);
}

/** A number that is one of a family: the term and the value in one chip, so
    three of them fit a row a 280px column can hold. */
export function ValueChip({ term, value }: { term: string; value: string }) {
	return (
		<span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-neutral-200/70 px-2 text-[11px] dark:border-neutral-800">
			<span className="text-neutral-400 dark:text-neutral-500">{term}</span>
			<span className="tabular-nums text-neutral-600 dark:text-neutral-300">{value}</span>
		</span>
	);
}

export function PrimaryButton({ children }: { children: ReactNode }) {
	return (
		<button
			type="button"
			className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-primary)] text-[12px] font-semibold text-[var(--color-on-primary)] shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_16px_-4px_var(--color-primary-glow)]"
		>
			{children}
		</button>
	);
}

export function GhostButton({ children }: { children: ReactNode }) {
	return (
		<button
			type="button"
			className="flex h-10 w-full items-center justify-center rounded-xl border border-neutral-200/70 text-[12px] font-medium text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
		>
			{children}
		</button>
	);
}
