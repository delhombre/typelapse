import {
	MESH_PRESETS,
	type MeshPreset,
	isImageBackground,
	isSolidBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";
import { type ChangeEvent, useRef } from "react";

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

			<div className="mx-0.5 h-4 w-px bg-neutral-200 dark:bg-neutral-800" />

			<ColorSwatch selected={selected} onSelect={onSelect} />
			<ImageSwatch selected={selected} onSelect={onSelect} />
		</div>
	);
}

const RAINBOW =
	"conic-gradient(from 90deg, #ff0000, #ff9900, #ffee00, #33dd00, #00ccff, #3366ff, #cc33ff, #ff0000)";

/** Custom solid color — proxies a hidden native color input. */
function ColorSwatch({ selected, onSelect }: BackgroundPickerProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isSelected = isSolidBackground(selected);
	const colorValue = /^#[0-9a-fA-F]{6}$/.test(selected) ? selected : "#1e293b";

	return (
		<span className="relative flex items-center justify-center">
			<motion.button
				type="button"
				onClick={() => inputRef.current?.click()}
				whileTap={{ scale: 0.96 }}
				whileHover={{ scale: 1.15 }}
				transition={springs.snappy}
				className="relative flex items-center justify-center"
				title="Custom color"
			>
				{isSelected && (
					<motion.div
						layoutId="bg-ring"
						className="absolute size-5 rounded-lg ring-2 ring-neutral-900 dark:ring-neutral-100"
						transition={springs.snappy}
					/>
				)}
				<div
					className="size-4 rounded-md border border-black/10 dark:border-white/10"
					style={{ background: isSelected ? selected : RAINBOW }}
				/>
			</motion.button>
			<input
				ref={inputRef}
				type="color"
				value={colorValue}
				onChange={(e) => onSelect(e.target.value)}
				className="pointer-events-none absolute size-0 opacity-0"
				aria-label="Custom background color"
				tabIndex={-1}
			/>
		</span>
	);
}

/** Soft cap on uploaded images — larger files are quietly refused. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Uploaded image — proxies a hidden file input, reads to a data URL. */
function ImageSwatch({ selected, onSelect }: BackgroundPickerProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isSelected = isImageBackground(selected);

	function handleFile(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) {
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			console.warn(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 4 MB. Ignored.`);
			return;
		}
		const reader = new FileReader();
		reader.onload = (ev) => {
			const url = ev.target?.result;
			if (typeof url === "string") {
				onSelect(`image:${url}`);
			}
		};
		reader.readAsDataURL(file);
	}

	return (
		<span className="relative flex items-center justify-center">
			<motion.button
				type="button"
				onClick={() => inputRef.current?.click()}
				whileTap={{ scale: 0.96 }}
				whileHover={{ scale: 1.15 }}
				transition={springs.snappy}
				className="relative flex items-center justify-center"
				title="Upload image"
			>
				{isSelected && (
					<motion.div
						layoutId="bg-ring"
						className="absolute size-5 rounded-lg ring-2 ring-neutral-900 dark:ring-neutral-100"
						transition={springs.snappy}
					/>
				)}
				<div
					className="flex size-4 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-neutral-100 text-neutral-500 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-400"
					style={isSelected ? { background: resolveBackgroundCss(selected, 0) } : undefined}
				>
					{!isSelected && <ImageGlyph />}
				</div>
			</motion.button>
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				onChange={handleFile}
				className="pointer-events-none absolute size-0 opacity-0"
				aria-label="Upload background image"
				tabIndex={-1}
			/>
		</span>
	);
}

function ImageGlyph() {
	return (
		<svg
			width="9"
			height="9"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="img"
		>
			<title>Upload image</title>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<circle cx="9" cy="9" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
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
					className={`absolute size-5 ring-2 ring-neutral-900 dark:ring-neutral-100 ${animated ? "rounded-full" : "rounded-lg"}`}
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
