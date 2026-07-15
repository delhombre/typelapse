import { motion } from "motion/react";

/** The six dark editor themes offered by the live restyler, with a swatch colour. */
export const THEME_SWATCHES = [
	{ name: "aurora", bg: "#1a1b2e" },
	{ name: "midnight", bg: "#0d1117" },
	{ name: "dracula", bg: "#282a36" },
	{ name: "one-dark", bg: "#282c34" },
	{ name: "catppuccin", bg: "#1e1e2e" },
	{ name: "nord", bg: "#2e3440" },
];

/**
 * A single restyle swatch. The selection ring is a shared `layoutId` element, so
 * it glides between swatches within a group instead of popping.
 */
export function Swatch({
	group,
	title,
	selected,
	onClick,
	preview,
	square = false,
}: {
	group: string;
	title: string;
	selected: boolean;
	onClick: () => void;
	preview: string;
	square?: boolean;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={{ scale: 1.18 }}
			whileTap={{ scale: 0.9 }}
			transition={{ type: "spring", stiffness: 400, damping: 22 }}
			className="relative flex items-center justify-center"
			title={title}
			aria-label={`${group} ${title}`}
		>
			{selected && (
				<motion.span
					layoutId={`swatch-ring-${group}`}
					className={`absolute size-6 ring-2 ring-white ${square ? "rounded-[7px]" : "rounded-full"}`}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}
			<span
				className={`size-4 border border-white/10 ${square ? "rounded-[5px]" : "rounded-full"}`}
				style={{ background: preview }}
			/>
		</motion.button>
	);
}
