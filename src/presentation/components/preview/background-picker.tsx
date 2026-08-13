import {
	MESH_PRESETS,
	type MeshPreset,
	isImageBackground,
	isSolidBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { IslandSwatch } from "@/presentation/components/controls/island-primitives";
import { notify } from "@/presentation/stores/notice.store";
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

/**
 * Every backdrop the frame can sit on: the animated meshes first, then the
 * static gradients, then the two that open something — a colour well and a file.
 *
 * It draws in the island's material now rather than on the page's, because the
 * only place it appears is the Look cluster. Selection is a wash and an inset
 * edge, never a solid plate: a plate behind a colour washes the colour out, and
 * a swatch that cannot show its own colour has stopped being a miniature of
 * what it changes.
 */
export function BackgroundPicker({ selected, onSelect }: BackgroundPickerProps) {
	return (
		<>
			{MESH_PRESETS.map((preset) => {
				const value = `mesh:${preset.id}`;
				return (
					<IslandSwatch
						key={value}
						background={meshSwatch(preset)}
						label={`${preset.label} (animated)`}
						round
						selected={selected === value}
						onSelect={() => onSelect(value)}
					/>
				);
			})}

			<span className="si-gap" />

			{BACKGROUND_PRESETS.map((preset) => (
				<IslandSwatch
					key={preset.name}
					background={preset.preview}
					label={preset.name}
					selected={selected === preset.value}
					onSelect={() => onSelect(preset.value)}
				/>
			))}

			<span className="si-gap" />

			<ColorSwatch selected={selected} onSelect={onSelect} />
			<ImageSwatch selected={selected} onSelect={onSelect} />
		</>
	);
}

const RAINBOW =
	"conic-gradient(from 90deg, #ff0000, #ff9900, #ffee00, #33dd00, #00ccff, #3366ff, #cc33ff, #ff0000)";

/** Custom solid color: proxies a hidden native color input. */
function ColorSwatch({ selected, onSelect }: BackgroundPickerProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isSelected = isSolidBackground(selected);
	const colorValue = /^#[0-9a-fA-F]{6}$/.test(selected) ? selected : "#1e293b";

	return (
		<span className="si-swatch-well">
			<IslandSwatch
				background={isSelected ? selected : RAINBOW}
				label="Custom colour"
				selected={isSelected}
				onSelect={() => inputRef.current?.click()}
			/>
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

/** Soft cap on uploaded images: larger files are refused, and the refusal is said. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Uploaded image: proxies a hidden file input, reads to a data URL. */
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
			notify("That image is too large to use as a background. The limit is 4 MB.", {
				tone: "error",
				detail: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
			});
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
		<span className="si-swatch-well">
			<IslandSwatch
				background={isSelected ? resolveBackgroundCss(selected, 0) : "rgb(255 255 255 / 0.1)"}
				label="Upload image"
				selected={isSelected}
				onSelect={() => inputRef.current?.click()}
			>
				{!isSelected && <ImageGlyph />}
			</IslandSwatch>
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
			aria-hidden="true"
		>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<circle cx="9" cy="9" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
	);
}
