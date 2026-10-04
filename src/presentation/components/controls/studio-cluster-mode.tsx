import { resolveBackgroundCss } from "@/application/backgrounds/mesh-gradient";
import { exportCtaDetail } from "@/application/export/export-label";
import { FONT_PRESETS } from "@/application/fonts/code-fonts";
import {
	ASPECT_LABELS,
	type AspectLabel,
	RESOLUTION_TIERS,
	type RenderFormat,
	type ResolutionTier,
	dimensionsFor,
	presetFor,
} from "@/domain/entities/render-config";
import { BackgroundPicker } from "@/presentation/components/preview/background-picker";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { trigger } from "@/presentation/haptics";
import { serverRenderOffered, useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useEffect, useState } from "react";
import { Camera, ChevronLeft, Sliders } from "reicon-react";
import { useCloudRenderCta, useCloudTarget } from "./cloud-render";
import {
	type ClusterId,
	DEVICE_CANNOT_ENCODE,
	FPS_OPTIONS,
	NOTHING_TO_RENDER,
	RenderCtaLabel,
	useCanRender,
} from "./cluster-panels";
import {
	CHROME_PRESETS,
	PADDING_PRESETS,
	PROGRESS_STYLES,
	RADIUS_PRESETS,
	TEMPO_PRESETS,
	THEMES,
	loadGoogleFont,
} from "./control-presets";
import { IslandInput, IslandSegmented, IslandSwatch, IslandToggle } from "./island-primitives";

const FALLBACK_PRESET = { aspect: ASPECT_LABELS[0], tier: RESOLUTION_TIERS[0] } as const;

const PROGRESS_LABELS: Record<(typeof PROGRESS_STYLES)[number], string> = {
	reels: "Reels",
	bar: "Bar",
	none: "None",
};

type DetailMode = "frame-spacing" | "look-background" | "look-font" | "look-watermark" | null;

/**
 * A ui.camera-style focused mode: the control rail becomes the setting instead
 * of opening a second surface elsewhere on the page. Less common collections
 * get one extra, explicit step so the root mode stays readable at laptop width.
 */
export function StudioClusterMode({
	cluster,
	onClose,
}: {
	cluster: ClusterId;
	onClose: () => void;
}) {
	const [detail, setDetail] = useState<DetailMode>(null);
	const backLabel = detail === null ? "Back to studio controls" : `Back to ${cluster} controls`;
	const back = () => {
		trigger("selection");
		if (detail !== null) {
			setDetail(null);
			return;
		}
		onClose();
	};

	return (
		<>
			<StudioTooltip content={backLabel}>
				<button
					type="button"
					onClick={back}
					data-island-back=""
					aria-label={backLabel}
					className="si-button si-mode-back"
				>
					<BackGlyph />
				</button>
			</StudioTooltip>
			<span className="si-mode-title">{modeTitle(cluster, detail)}</span>
			<span className="si-mode-seam" />
			{detail === "frame-spacing" && <FrameSpacingMode />}
			{detail === "look-background" && <LookBackgroundMode />}
			{detail === "look-font" && <LookFontMode />}
			{detail === "look-watermark" && <LookWatermarkMode />}
			{detail === null && cluster === "frame" && (
				<FrameMode onSpacing={() => setDetail("frame-spacing")} />
			)}
			{detail === null && cluster === "look" && (
				<LookMode
					onBackground={() => setDetail("look-background")}
					onFont={() => setDetail("look-font")}
					onWatermark={() => setDetail("look-watermark")}
				/>
			)}
			{detail === null && cluster === "motion" && <MotionMode />}
			{detail === null && cluster === "export" && <ExportMode />}
		</>
	);
}

/** The aspect control is a chooser, not a blind cycle through five values. */
export function StudioAspectMode({ onClose }: { onClose: () => void }) {
	const width = useExportStore((state) => state.width);
	const height = useExportStore((state) => state.height);
	const setResolution = useExportStore((state) => state.setResolution);
	const current = presetFor(width, height) ?? FALLBACK_PRESET;

	return (
		<>
			<StudioTooltip content="Back to studio controls">
				<button
					type="button"
					onClick={() => {
						trigger("selection");
						onClose();
					}}
					data-island-back=""
					aria-label="Back to studio controls"
					className="si-button si-mode-back"
				>
					<BackGlyph />
				</button>
			</StudioTooltip>
			<span className="si-mode-title">Format</span>
			<span className="si-mode-seam" />
			{ASPECT_LABELS.map((aspect) => {
				const dimensions = dimensionsFor(aspect, current.tier);
				return (
					<AspectChoice
						key={aspect}
						aspect={aspect}
						selected={presetFor(width, height)?.aspect === aspect}
						onSelect={() => setResolution(dimensions.width, dimensions.height)}
					/>
				);
			})}
		</>
	);
}

function modeTitle(cluster: ClusterId, detail: DetailMode): string {
	if (detail === "frame-spacing") {
		return "Spacing";
	}
	if (detail === "look-background") {
		return "Background";
	}
	if (detail === "look-font") {
		return "Font";
	}
	if (detail === "look-watermark") {
		return "Watermark";
	}
	return cluster[0]?.toUpperCase() + cluster.slice(1);
}

function FrameMode({ onSpacing }: { onSpacing: () => void }) {
	const windowChrome = useSnippetStore((state) => state.windowChrome);
	const setWindowChrome = useSnippetStore((state) => state.setWindowChrome);
	const showLineNumbers = useSnippetStore((state) => state.showLineNumbers);
	const setShowLineNumbers = useSnippetStore((state) => state.setShowLineNumbers);
	const lineNumberStart = useSnippetStore((state) => state.lineNumberStart);
	const setLineNumberStart = useSnippetStore((state) => state.setLineNumberStart);

	return (
		<>
			<IslandSegmented
				group="rail-chrome"
				eyebrow="Chrome"
				options={CHROME_PRESETS.map((preset) => ({
					value: preset.value,
					label: preset.label,
					title: preset.title,
				}))}
				value={windowChrome}
				onSelect={setWindowChrome}
			/>
			<span className="si-mode-seam" />
			<IslandToggle
				pressed={showLineNumbers}
				label="Line numbers"
				onToggle={() => setShowLineNumbers(!showLineNumbers)}
			/>
			{showLineNumbers && (
				<IslandInput
					type="number"
					min={1}
					width={52}
					value={lineNumberStart}
					label="First line number"
					onChange={(raw) => {
						const next = Number.parseInt(raw, 10);
						if (Number.isFinite(next)) {
							setLineNumberStart(next);
						}
					}}
				/>
			)}
			<button
				type="button"
				onClick={() => {
					trigger("selection");
					onSpacing();
				}}
				className="si-button si-mode-door"
			>
				<SpacingGlyph />
				<span>Spacing</span>
			</button>
		</>
	);
}

function FrameSpacingMode() {
	const framePadding = useSnippetStore((state) => state.framePadding);
	const setFramePadding = useSnippetStore((state) => state.setFramePadding);
	const cardMargin = useSnippetStore((state) => state.cardMargin);
	const setCardMargin = useSnippetStore((state) => state.setCardMargin);
	const borderRadius = useSnippetStore((state) => state.snippet.theme.borderRadius);
	const setBorderRadius = useSnippetStore((state) => state.setBorderRadius);

	return (
		<>
			<RailDiscreteSlider
				label="Frame padding"
				eyebrow="Pad"
				values={PADDING_PRESETS}
				value={framePadding}
				onChange={setFramePadding}
			/>
			<span className="si-mode-seam" />
			<RailDiscreteSlider
				label="Frame margin"
				eyebrow="Margin"
				values={PADDING_PRESETS}
				value={cardMargin}
				onChange={setCardMargin}
			/>
			<span className="si-mode-seam" />
			<RailDiscreteSlider
				label="Frame radius"
				eyebrow="Radius"
				values={RADIUS_PRESETS}
				value={borderRadius}
				onChange={setBorderRadius}
			/>
		</>
	);
}

function RailDiscreteSlider<T extends number>({
	label,
	eyebrow,
	values,
	value,
	onChange,
}: {
	label: string;
	eyebrow: string;
	values: readonly T[];
	value: number;
	onChange: (value: T) => void;
}) {
	const found = values.findIndex((entry) => entry === value);
	const index = found < 0 ? 0 : found;
	const selected = values[index] ?? values[0];
	if (selected === undefined) {
		return null;
	}

	return (
		<label className="si-rail-slider">
			<span className="si-eyebrow">{eyebrow}</span>
			<input
				type="range"
				min={0}
				max={values.length - 1}
				step={1}
				value={index}
				aria-label={label}
				aria-valuetext={`${selected} pixels`}
				onChange={(event) => {
					const next = values[Number(event.currentTarget.value)];
					if (next === undefined) {
						return;
					}
					trigger("selection");
					onChange(next);
				}}
				className="si-rail-range"
			/>
			<span className="si-rail-value" aria-hidden="true">
				{selected}
			</span>
		</label>
	);
}

function LookMode({
	onBackground,
	onFont,
	onWatermark,
}: {
	onBackground: () => void;
	onFont: () => void;
	onWatermark: () => void;
}) {
	const themeName = useSnippetStore((state) => state.snippet.theme.name);
	const setTheme = useSnippetStore((state) => state.setTheme);
	const syncEditorTheme = useSnippetStore((state) => state.syncEditorTheme);
	const setSyncEditorTheme = useSnippetStore((state) => state.setSyncEditorTheme);
	const background = useSnippetStore((state) => state.background);
	const fontFamily = useSnippetStore((state) => state.snippet.theme.fontFamily);
	const fontLabel = FONT_PRESETS.find((font) => fontFamily.includes(font.label))?.label ?? "Font";

	return (
		<>
			<span className="si-eyebrow">Theme</span>
			{THEMES.map((theme) => (
				<IslandSwatch
					key={theme.name}
					background={theme.bg}
					label={theme.label}
					selected={themeName === theme.name}
					onSelect={() => setTheme(theme.factory())}
				/>
			))}
			<span className="si-mode-seam" />
			<button
				type="button"
				onClick={() => {
					trigger("selection");
					onBackground();
				}}
				aria-label="Background choices"
				className="si-button si-mode-door"
			>
				<span
					className="si-mode-swatch"
					style={{ background: resolveBackgroundCss(background, 0) }}
					aria-hidden="true"
				/>
				<span>Background</span>
			</button>
			<button
				type="button"
				onClick={() => {
					trigger("selection");
					onFont();
				}}
				aria-label="Font choices"
				className="si-button si-mode-door"
			>
				<span>{fontLabel}</span>
			</button>
			<IslandToggle
				pressed={syncEditorTheme}
				label="Sync editor"
				onToggle={() => setSyncEditorTheme(!syncEditorTheme)}
			/>
			<button
				type="button"
				onClick={() => {
					trigger("selection");
					onWatermark();
				}}
				aria-label="Watermark"
				className="si-button si-mode-door"
			>
				<span className="si-at-glyph" aria-hidden="true">
					@
				</span>
				<span>Mark</span>
			</button>
		</>
	);
}

function LookBackgroundMode() {
	const background = useSnippetStore((state) => state.background);
	const setBackground = useSnippetStore((state) => state.setBackground);
	return <BackgroundPicker selected={background} onSelect={setBackground} />;
}

function LookFontMode() {
	const fontFamily = useSnippetStore((state) => state.snippet.theme.fontFamily);
	const setFont = useSnippetStore((state) => state.setFont);
	return (
		<IslandSegmented
			group="rail-font"
			options={FONT_PRESETS.map((font) => ({ value: font.label, label: font.label }))}
			value={FONT_PRESETS.find((font) => fontFamily.includes(font.label))?.label ?? null}
			onSelect={(label) => {
				const font = FONT_PRESETS.find((entry) => entry.label === label);
				if (!font) {
					return;
				}
				if (font.google) {
					loadGoogleFont(font.google);
				}
				setFont(font.stack);
			}}
		/>
	);
}

function LookWatermarkMode() {
	const watermark = useSnippetStore((state) => state.watermark);
	const setWatermark = useSnippetStore((state) => state.setWatermark);
	return (
		<IslandInput
			value={watermark}
			width={164}
			label="Watermark"
			placeholder="@username"
			onChange={setWatermark}
		/>
	);
}

function MotionMode() {
	const transitionMs = useExportStore((state) => state.transitionMs);
	const setTransitionMs = useExportStore((state) => state.setTransitionMs);
	const typewriter = useExportStore((state) => state.typewriter);
	const setTypewriter = useExportStore((state) => state.setTypewriter);
	const focusZoom = useExportStore((state) => state.focusZoom);
	const setFocusZoom = useExportStore((state) => state.setFocusZoom);
	const sound = useExportStore((state) => state.sound);
	const setSound = useExportStore((state) => state.setSound);
	const loop = useExportStore((state) => state.loop);
	const setLoop = useExportStore((state) => state.setLoop);
	const progressStyle = useExportStore((state) => state.progressStyle);
	const setProgressStyle = useExportStore((state) => state.setProgressStyle);

	return (
		<>
			<IslandSegmented
				group="rail-tempo"
				eyebrow="Tempo"
				options={TEMPO_PRESETS.map((tempo) => ({
					value: tempo.ms,
					label: tempo.label,
					title: tempo.title,
				}))}
				value={transitionMs}
				onSelect={setTransitionMs}
			/>
			<span className="si-mode-seam" />
			<IslandToggle pressed={typewriter} label="Type" onToggle={() => setTypewriter(!typewriter)} />
			<IslandToggle
				pressed={focusZoom}
				label="Focus zoom"
				onToggle={() => setFocusZoom(!focusZoom)}
			/>
			<IslandToggle pressed={sound} label="Sound" onToggle={() => setSound(!sound)} />
			<IslandToggle pressed={loop} label="Loop" onToggle={() => setLoop(!loop)} />
			<span className="si-mode-seam" />
			<IslandSegmented
				group="rail-progress"
				eyebrow="Progress"
				options={PROGRESS_STYLES.map((style) => ({
					value: style,
					label: PROGRESS_LABELS[style],
				}))}
				value={progressStyle}
				onSelect={setProgressStyle}
			/>
		</>
	);
}

function ExportMode() {
	const format = useExportStore((state) => state.format);
	const setFormat = useExportStore((state) => state.setFormat);
	const width = useExportStore((state) => state.width);
	const height = useExportStore((state) => state.height);
	const setResolution = useExportStore((state) => state.setResolution);
	const target = useExportStore((state) => state.target);
	const setTarget = useExportStore((state) => state.setTarget);
	const deviceSupported = useExportStore((state) => state.deviceSupported);
	const probeDevice = useExportStore((state) => state.probeDevice);
	const isExporting = useExportStore((state) => state.isExporting);
	const exportVideo = useExportStore((state) => state.exportVideo);
	const exportPng = useExportStore((state) => state.exportPng);
	const fps = useExportStore((state) => state.fps);
	const setFps = useExportStore((state) => state.setFps);
	const canRender = useCanRender();
	const cloudTarget = useCloudTarget();
	const cloudCta = useCloudRenderCta(target);
	const renderLabel = isExporting ? "Rendering…" : (cloudCta.label ?? "Render");
	const current = presetFor(width, height) ?? FALLBACK_PRESET;

	useEffect(() => {
		if (deviceSupported === null) {
			void probeDevice();
		}
	}, [deviceSupported, probeDevice]);

	return (
		<>
			<IslandSegmented
				group="rail-format"
				eyebrow="Format"
				options={[
					{ value: "mp4" as RenderFormat, label: "MP4" },
					{ value: "webm" as RenderFormat, label: "WebM" },
					{ value: "gif" as RenderFormat, label: "GIF" },
				]}
				value={format}
				onSelect={setFormat}
			/>
			<span className="si-mode-seam" />
			<IslandSegmented
				group="rail-tier"
				eyebrow="Size"
				options={RESOLUTION_TIERS.map((tier) => {
					const dimensions = dimensionsFor(current.aspect, tier);
					return { value: tier, label: tier, title: `${dimensions.width}×${dimensions.height}` };
				})}
				value={presetFor(width, height)?.tier ?? null}
				onSelect={(tier) => {
					const dimensions = dimensionsFor(current.aspect, tier as ResolutionTier);
					setResolution(dimensions.width, dimensions.height);
				}}
			/>
			<span className="si-mode-seam" />
			<IslandSegmented
				group="rail-fps"
				eyebrow="FPS"
				options={FPS_OPTIONS}
				value={fps}
				onSelect={setFps}
			/>
			<span className="si-mode-seam" />
			<IslandSegmented
				group="rail-target"
				eyebrow="Where"
				options={[
					{
						value: "device" as const,
						label: "Device",
						// Same words as the cluster panel: a chip that greys out without
						// saying why reads as a bug rather than as this browser's limit.
						title:
							deviceSupported === false
								? DEVICE_CANNOT_ENCODE
								: "Renders in this tab. Nothing is uploaded, and no server has to be running.",
						disabled: deviceSupported === false,
					},
					...(serverRenderOffered() ? [{ value: "server" as const, label: "Server" }] : []),
					...(cloudTarget ? [cloudTarget] : []),
				]}
				value={target}
				onSelect={setTarget}
			/>
			<button
				type="button"
				onClick={() => {
					trigger("light");
					void exportPng();
				}}
				disabled={isExporting}
				className="si-button"
			>
				<CameraGlyph />
				<span>PNG</span>
			</button>
			<button
				type="button"
				onClick={() => {
					if (isExporting || cloudCta.busy) return;
					trigger("light");
					void exportVideo();
				}}
				// Busy, it stays focusable: a disabled button drops a keyboard user's
				// focus to the page the moment they press it.
				disabled={!canRender}
				aria-disabled={isExporting || cloudCta.busy || undefined}
				// The same reason the cluster panel gives: a disabled button with no
				// word on it reads as broken.
				title={canRender ? undefined : NOTHING_TO_RENDER}
				// The name is the word on the button, plus the format and size it
				// leaves out while idle; busy, it is what the button says.
				aria-label={
					renderLabel === "Render"
						? `Render · ${exportCtaDetail({ format, width, height })}`
						: renderLabel
				}
				className="si-cta si-mode-cta"
			>
				<RenderCtaLabel idle="Render" shown={renderLabel} />
			</button>
		</>
	);
}

function AspectChoice({
	aspect,
	selected,
	onSelect,
}: {
	aspect: AspectLabel;
	selected: boolean;
	onSelect: () => void;
}) {
	const [width, height] = aspect.split(":").map(Number);
	const ratio = (width ?? 1) / (height ?? 1);
	const box = ratio >= 1 ? { width: 15, height: 15 / ratio } : { width: 13 * ratio, height: 13 };
	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`Aspect ratio ${aspect}`}
			onClick={() => {
				trigger("selection");
				onSelect();
			}}
			className="si-button si-seg-option si-aspect-choice"
			{...(selected ? { "data-selected": "" } : {})}
		>
			{selected && <span className="si-plate" />}
			<span className="si-frame" style={box} aria-hidden="true" />
			<span className="si-seg-label si-ratio">{aspect}</span>
		</button>
	);
}

function BackGlyph() {
	return <ChevronLeft size={13} strokeWidth={2.2} aria-hidden="true" />;
}

function SpacingGlyph() {
	return <Sliders size={12} strokeWidth={2} aria-hidden="true" />;
}

function CameraGlyph() {
	return <Camera size={11} strokeWidth={2} aria-hidden="true" />;
}
