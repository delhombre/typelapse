import { MESH_PRESETS, type MeshPreset } from "@/application/backgrounds/mesh-gradient";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";

export interface BackgroundPreset {
	name: string;
	value: string;
	preview: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
	{
		name: "Midnight",
		value: "radial-gradient(ellipse at 30% 20%, #1e3a5f 0%, #0d1117 50%, #0a0e14 100%)",
		preview: "linear-gradient(135deg, #1e3a5f, #0d1117)",
	},
	{
		name: "Aurora",
		value: "radial-gradient(ellipse at 70% 30%, #2d1b69 0%, #1a1b2e 50%, #12131f 100%)",
		preview: "linear-gradient(135deg, #2d1b69, #1a1b2e)",
	},
	{
		name: "Frost",
		value: "radial-gradient(ellipse at 50% 30%, #e8f0fe 0%, #f0f4f8 50%, #e2e8f0 100%)",
		preview: "linear-gradient(135deg, #e8f0fe, #e2e8f0)",
	},
	{
		name: "Candy",
		value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
		preview: "linear-gradient(135deg, #667eea, #764ba2)",
	},
	{
		name: "Sunset",
		value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
		preview: "linear-gradient(135deg, #f093fb, #f5576c)",
	},
	{
		name: "Ocean",
		value: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
		preview: "linear-gradient(135deg, #4facfe, #00f2fe)",
	},
	{
		name: "Forest",
		value: "linear-gradient(135deg, #38ef7d 0%, #11998e 100%)",
		preview: "linear-gradient(135deg, #38ef7d, #11998e)",
	},
	{
		name: "Ember",
		value: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)",
		preview: "linear-gradient(135deg, #f7971e, #ffd200)",
	},
	{
		name: "None",
		value: "transparent",
		preview: "repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 6px 6px",
	},
];

interface BackgroundPickerProps {
	selected: string;
	onSelect: (value: string) => void;
}

/** Static swatch approximating an animated mesh preset. */
function meshSwatch(preset: MeshPreset): string {
	const [a, b, c] = preset.blobs;
	return `radial-gradient(circle at 25% 25%, ${a?.color ?? preset.accent}, transparent 60%), radial-gradient(circle at 75% 70%, ${c?.color ?? b?.color ?? preset.accent}, transparent 60%), ${preset.base}`;
}

export function BackgroundPicker({ selected, onSelect }: BackgroundPickerProps) {
	return (
		<div className="flex items-center gap-1.5">
			{MESH_PRESETS.map((preset) => {
				const value = `mesh:${preset.id}`;
				return (
					<Swatch
						key={value}
						title={`${preset.label} (animated)`}
						preview={meshSwatch(preset)}
						animated
						isSelected={selected === value}
						onSelect={() => onSelect(value)}
					/>
				);
			})}

			<div className="mx-0.5 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />

			{BACKGROUND_PRESETS.map((preset) => (
				<Swatch
					key={preset.name}
					title={preset.name}
					preview={preset.preview}
					isSelected={selected === preset.value}
					onSelect={() => onSelect(preset.value)}
				/>
			))}
		</div>
	);
}

function Swatch({
	title,
	preview,
	isSelected,
	onSelect,
	animated = false,
}: {
	title: string;
	preview: string;
	isSelected: boolean;
	onSelect: () => void;
	animated?: boolean;
}) {
	return (
		<motion.button
			type="button"
			onClick={onSelect}
			whileTap={{ scale: 0.96 }}
			whileHover={{ scale: 1.15 }}
			transition={springs.snappy}
			className="relative flex items-center justify-center"
			title={title}
		>
			{isSelected && (
				<motion.div
					layoutId="bg-ring"
					className={`absolute size-5 ring-2 ring-neutral-900 dark:ring-neutral-100 ${animated ? "rounded-full" : "rounded-md"}`}
					transition={springs.snappy}
				/>
			)}
			<div
				className={`size-4 border border-black/10 dark:border-white/10 ${animated ? "rounded-full" : "rounded-md"}`}
				style={{ background: preview }}
			/>
		</motion.button>
	);
}
