import { trigger } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * The controls a cluster is built from, in the island's own material.
 *
 * There is exactly one rule and everything here follows from it: nothing in the
 * island is filled except the thing that says which option is true. A word gets
 * a solid plate under it; a colour gets a wash and an inset edge instead, since
 * a solid plate behind a swatch washes the colour out and the control stops
 * being a miniature of what it changes.
 *
 * The plate is a `layoutId` per group, so it glides between options rather than
 * blinking from place to place — and it is a `<span className="si-plate">`, not
 * a bare child span, because the rule that styles the label has to be a class:
 * a `.si-button > span` selector would match the plate too, give it
 * `position: relative`, and cancel the `inset: 0` that makes it a plate at all.
 */

interface OptionProps<T> {
	value: T;
	label: string;
	title?: string;
	disabled?: boolean;
}

export function IslandSegmented<T extends string | number>({
	group,
	options,
	value,
	onSelect,
	eyebrow,
}: {
	/** Unique per group: the plate glides between the options of one group only. */
	group: string;
	options: OptionProps<T>[];
	value: T | null;
	onSelect: (value: T) => void;
	eyebrow?: string;
}) {
	const reduce = useReducedMotion() === true;

	return (
		<span className="si-cluster-field">
			{eyebrow && <span className="si-eyebrow">{eyebrow}</span>}
			<span className="si-seg">
				{options.map((option) => {
					const selected = option.value === value;
					return (
						<button
							key={option.value}
							type="button"
							aria-pressed={selected}
							disabled={option.disabled}
							title={option.title}
							onClick={() => {
								trigger("selection");
								onSelect(option.value);
							}}
							className="si-button si-seg-option"
							{...(selected ? { "data-selected": "" } : {})}
						>
							{selected && (
								<motion.span
									layoutId={`si-plate-${group}`}
									className="si-plate"
									transition={reduce ? { duration: 0 } : springs.snappy}
								/>
							)}
							<span className="si-seg-label">{option.label}</span>
						</button>
					);
				})}
			</span>
		</span>
	);
}

/**
 * A binary control. A wash, not a fill: a solid plate is reserved for "this one
 * of several", which is a different claim. The attribute a screen reader reads
 * is the attribute the stylesheet reads, so the two can never disagree.
 */
export function IslandToggle({
	pressed,
	label,
	title,
	onToggle,
	children,
}: {
	pressed: boolean;
	label: string;
	title?: string;
	onToggle: () => void;
	children?: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			aria-label={label}
			title={title}
			onClick={() => {
				trigger("selection");
				onToggle();
			}}
			className="si-button si-toggle"
		>
			{children}
			<span className="si-seg-label">{label}</span>
		</button>
	);
}

/**
 * A swatch: a miniature of what it changes, at the island's own scale. Selected,
 * it takes the wash-and-inset-edge mark rather than a plate, and keeps its own
 * colour — which is the whole reason anyone is looking at it.
 */
export function IslandSwatch({
	background,
	label,
	selected,
	round = false,
	onSelect,
	children,
}: {
	background: string;
	label: string;
	selected: boolean;
	round?: boolean;
	onSelect: () => void;
	children?: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={label}
			title={label}
			onClick={() => {
				trigger("selection");
				onSelect();
			}}
			className="si-button si-swatch-button"
		>
			{selected && <span className="si-plate si-plate-soft" />}
			<span
				className="si-swatch"
				data-round={round ? "" : undefined}
				style={{ background }}
				aria-hidden="true"
			>
				{children}
			</span>
		</button>
	);
}

/** A titled cluster row: the landing's eyebrow at 0.18em, its controls beside it. */
export function ClusterGroup({
	title,
	stacked = false,
	children,
}: {
	title?: string;
	stacked?: boolean;
	children: ReactNode;
}) {
	if (stacked) {
		return (
			<div className="si-cluster-group">
				{title && <p className="si-eyebrow si-eyebrow-block">{title}</p>}
				<div className="si-cluster-row">{children}</div>
			</div>
		);
	}
	return (
		<div className="si-cluster-group si-cluster-row">
			{title && <span className="si-eyebrow">{title}</span>}
			{children}
		</div>
	);
}

/** A number the visitor may set, in the island's material rather than the page's. */
export function IslandInput({
	value,
	onChange,
	label,
	placeholder,
	type = "text",
	width = 68,
	min,
}: {
	value: string | number;
	onChange: (value: string) => void;
	label: string;
	placeholder?: string;
	type?: "text" | "number";
	width?: number;
	min?: number;
}) {
	return (
		<input
			type={type}
			value={value}
			min={min}
			aria-label={label}
			title={label}
			placeholder={placeholder}
			onChange={(event) => onChange(event.target.value)}
			className="si-input"
			style={{ width }}
		/>
	);
}
