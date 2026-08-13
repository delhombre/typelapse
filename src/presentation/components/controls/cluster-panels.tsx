import { exportCtaLabel } from "@/application/export/export-label";
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
import { trigger } from "@/presentation/haptics";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useEffect } from "react";
import {
	CHROME_PRESETS,
	PADDING_PRESETS,
	PROGRESS_STYLES,
	RADIUS_PRESETS,
	TEMPO_PRESETS,
	THEMES,
	loadGoogleFont,
} from "./control-presets";
import {
	ClusterGroup,
	IslandInput,
	IslandSegmented,
	IslandSwatch,
	IslandToggle,
} from "./island-primitives";

/**
 * The four clusters the island raises.
 *
 * Every control the studio ever had below the preview lives in one of these:
 * the settings strip and the export bar are gone, and nothing they held was
 * left behind. They are grouped by the question they answer rather than by
 * which store they happen to write to — Frame is the shape of the picture, Look
 * is what it is made of, Motion is how it moves, Export is what comes out.
 *
 * The layout is the Atelier direction's: a titled cluster, its eyebrow at the
 * landing's 0.18em, its controls beside or under it. What is new is that the
 * paper it was drawn on is the island's own dark material, because the sheet is
 * part of the instrument and not a panel of the page.
 */

export type ClusterId = "frame" | "look" | "motion" | "export";

export const CLUSTERS: { id: ClusterId; label: string }[] = [
	{ id: "frame", label: "Frame" },
	{ id: "look", label: "Look" },
	{ id: "motion", label: "Motion" },
	{ id: "export", label: "Export" },
];

// The default face, fetched once at module load exactly as the old strip did:
// the picker has to be able to show what it offers before anything is chosen.
loadGoogleFont("JetBrains+Mono");

/**
 * What the shape and size chips fall back to when the stored dimensions match
 * no preset — a plan-clamped export, or a hand-edited link. Neither row lights
 * up in that case; these only decide what the *next* press composes against, so
 * a stray size can still be corrected in one tap.
 */
const FALLBACK_PRESET = { aspect: ASPECT_LABELS[0], tier: RESOLUTION_TIERS[0] } as const;

/** The progress styles, said the way a control says them. */
const PROGRESS_LABELS: Record<(typeof PROGRESS_STYLES)[number], string> = {
	reels: "Reels",
	bar: "Bar",
	none: "None",
};

export function ClusterPanel({ cluster }: { cluster: ClusterId }) {
	if (cluster === "frame") {
		return <FrameCluster />;
	}
	if (cluster === "look") {
		return <LookCluster />;
	}
	if (cluster === "motion") {
		return <MotionCluster />;
	}
	return <ExportCluster />;
}

/* ─────────────────────────────── Frame ─────────────────────────────── */

function FrameCluster() {
	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	const setResolution = useExportStore((s) => s.setResolution);
	const windowChrome = useSnippetStore((s) => s.windowChrome);
	const setWindowChrome = useSnippetStore((s) => s.setWindowChrome);
	const showLineNumbers = useSnippetStore((s) => s.showLineNumbers);
	const setShowLineNumbers = useSnippetStore((s) => s.setShowLineNumbers);
	const lineNumberStart = useSnippetStore((s) => s.lineNumberStart);
	const setLineNumberStart = useSnippetStore((s) => s.setLineNumberStart);
	const framePadding = useSnippetStore((s) => s.framePadding);
	const setFramePadding = useSnippetStore((s) => s.setFramePadding);
	const cardMargin = useSnippetStore((s) => s.cardMargin);
	const setCardMargin = useSnippetStore((s) => s.setCardMargin);
	const borderRadius = useSnippetStore((s) => s.snippet.theme.borderRadius);
	const setBorderRadius = useSnippetStore((s) => s.setBorderRadius);

	const current = presetFor(width, height) ?? FALLBACK_PRESET;

	return (
		<>
			<ClusterGroup title="Shape" stacked>
				<span className="si-seg">
					{ASPECT_LABELS.map((aspect) => {
						const dims = dimensionsFor(aspect, current.tier);
						return (
							<AspectOption
								key={aspect}
								aspect={aspect}
								selected={presetFor(width, height)?.aspect === aspect}
								title={`${aspect} · ${dims.width}×${dims.height}`}
								onSelect={() => setResolution(dims.width, dims.height)}
							/>
						);
					})}
				</span>
			</ClusterGroup>

			<ClusterGroup>
				<IslandSegmented
					group="chrome"
					eyebrow="Chrome"
					options={CHROME_PRESETS.map((c) => ({
						value: c.value,
						label: c.label,
						title: c.title,
					}))}
					value={windowChrome}
					onSelect={setWindowChrome}
				/>
				<span className="si-cluster-field">
					<span className="si-eyebrow">Lines</span>
					<IslandToggle
						pressed={showLineNumbers}
						label="Numbers"
						title="Line-number gutter"
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
				</span>
			</ClusterGroup>

			<ClusterGroup>
				<IslandSegmented
					group="padding"
					eyebrow="Pad"
					options={PADDING_PRESETS.map((v) => ({
						value: v,
						label: String(v),
						title: `${v}px of code padding inside the window`,
					}))}
					value={framePadding}
					onSelect={setFramePadding}
				/>
				<IslandSegmented
					group="margin"
					eyebrow="Margin"
					options={PADDING_PRESETS.map((v) => ({
						value: v,
						label: String(v),
						title: `${v}px of mesh around the window`,
					}))}
					value={cardMargin}
					onSelect={setCardMargin}
				/>
				<IslandSegmented
					group="radius"
					eyebrow="Radius"
					options={RADIUS_PRESETS.map((v) => ({
						value: v,
						label: String(v),
						title: `${v}px corner radius`,
					}))}
					value={borderRadius}
					onSelect={setBorderRadius}
				/>
			</ClusterGroup>
		</>
	);
}

/** The shape chip is a miniature of the shape, which no word can be. */
function AspectOption({
	aspect,
	selected,
	title,
	onSelect,
}: { aspect: AspectLabel; selected: boolean; title: string; onSelect: () => void }) {
	const [w, h] = aspect.split(":").map(Number);
	const ratio = (w ?? 1) / (h ?? 1);
	const box = ratio >= 1 ? { width: 17, height: 17 / ratio } : { width: 15 * ratio, height: 15 };

	return (
		<button
			type="button"
			aria-pressed={selected}
			aria-label={`Aspect ratio ${aspect}`}
			title={title}
			onClick={() => {
				trigger("selection");
				onSelect();
			}}
			className="si-button si-seg-option"
			{...(selected ? { "data-selected": "" } : {})}
		>
			{selected && <span className="si-plate si-plate-soft" />}
			<span className="si-frame" style={box} aria-hidden="true" />
		</button>
	);
}

/* ─────────────────────────────── Look ──────────────────────────────── */

function LookCluster() {
	const themeName = useSnippetStore((s) => s.snippet.theme.name);
	const setTheme = useSnippetStore((s) => s.setTheme);
	const syncEditorTheme = useSnippetStore((s) => s.syncEditorTheme);
	const setSyncEditorTheme = useSnippetStore((s) => s.setSyncEditorTheme);
	const background = useSnippetStore((s) => s.background);
	const setBackground = useSnippetStore((s) => s.setBackground);
	const fontFamily = useSnippetStore((s) => s.snippet.theme.fontFamily);
	const setFont = useSnippetStore((s) => s.setFont);
	const watermark = useSnippetStore((s) => s.watermark);
	const setWatermark = useSnippetStore((s) => s.setWatermark);

	return (
		<>
			<ClusterGroup title="Theme" stacked>
				{THEMES.map((theme) => (
					<IslandSwatch
						key={theme.name}
						background={theme.bg}
						label={theme.label}
						selected={themeName === theme.name}
						onSelect={() => setTheme(theme.factory())}
					/>
				))}
				<span className="si-gap" />
				<IslandToggle
					pressed={syncEditorTheme}
					label="Sync editor"
					title={syncEditorTheme ? "Editor mirrors the preview theme" : "Editor uses the app theme"}
					onToggle={() => setSyncEditorTheme(!syncEditorTheme)}
				/>
			</ClusterGroup>

			<ClusterGroup title="Mesh" stacked>
				<BackgroundPicker selected={background} onSelect={setBackground} />
			</ClusterGroup>

			<ClusterGroup>
				<IslandSegmented
					group="font"
					eyebrow="Font"
					options={FONT_PRESETS.map((font) => ({ value: font.label, label: font.label }))}
					value={FONT_PRESETS.find((f) => fontFamily.includes(f.label))?.label ?? null}
					onSelect={(label) => {
						const font = FONT_PRESETS.find((f) => f.label === label);
						if (!font) {
							return;
						}
						if (font.google) {
							loadGoogleFont(font.google);
						}
						setFont(font.stack);
					}}
				/>
				<span className="si-cluster-field">
					<span className="si-eyebrow">Mark</span>
					<IslandInput
						value={watermark}
						width={104}
						label="Watermark"
						placeholder="@username"
						onChange={setWatermark}
					/>
				</span>
			</ClusterGroup>
		</>
	);
}

/* ─────────────────────────────── Motion ────────────────────────────── */

function MotionCluster() {
	const transitionMs = useExportStore((s) => s.transitionMs);
	const setTransitionMs = useExportStore((s) => s.setTransitionMs);
	const typewriter = useExportStore((s) => s.typewriter);
	const setTypewriter = useExportStore((s) => s.setTypewriter);
	const focusZoom = useExportStore((s) => s.focusZoom);
	const setFocusZoom = useExportStore((s) => s.setFocusZoom);
	const sound = useExportStore((s) => s.sound);
	const setSound = useExportStore((s) => s.setSound);
	const loop = useExportStore((s) => s.loop);
	const setLoop = useExportStore((s) => s.setLoop);
	const progressStyle = useExportStore((s) => s.progressStyle);
	const setProgressStyle = useExportStore((s) => s.setProgressStyle);

	return (
		<>
			<ClusterGroup>
				<IslandSegmented
					group="tempo"
					eyebrow="Tempo"
					options={TEMPO_PRESETS.map((t) => ({ value: t.ms, label: t.label, title: t.title }))}
					value={transitionMs}
					onSelect={setTransitionMs}
				/>
			</ClusterGroup>

			<ClusterGroup title="Beats" stacked>
				<IslandToggle
					pressed={typewriter}
					label="Type"
					title="Type the first step out character by character"
					onToggle={() => setTypewriter(!typewriter)}
				/>
				<IslandToggle
					pressed={focusZoom}
					label="Zoom"
					title="Push in on the focused lines"
					onToggle={() => setFocusZoom(!focusZoom)}
				/>
				<IslandToggle
					pressed={sound}
					label="Sound"
					title="Synthesized key ticks and morph thumps"
					onToggle={() => setSound(!sound)}
				/>
				<IslandToggle
					pressed={loop}
					label="Loop"
					title="The last step morphs back to the first"
					onToggle={() => setLoop(!loop)}
				/>
			</ClusterGroup>

			<ClusterGroup>
				<IslandSegmented
					group="progress"
					eyebrow="Progress"
					options={PROGRESS_STYLES.map((style) => ({
						value: style,
						label: PROGRESS_LABELS[style],
					}))}
					value={progressStyle}
					onSelect={setProgressStyle}
				/>
			</ClusterGroup>
		</>
	);
}

/* ─────────────────────────────── Export ────────────────────────────── */

function ExportCluster() {
	const format = useExportStore((s) => s.format);
	const setFormat = useExportStore((s) => s.setFormat);
	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	const setResolution = useExportStore((s) => s.setResolution);
	const target = useExportStore((s) => s.target);
	const setTarget = useExportStore((s) => s.setTarget);
	const deviceSupported = useExportStore((s) => s.deviceSupported);
	const probeDevice = useExportStore((s) => s.probeDevice);
	const isExporting = useExportStore((s) => s.isExporting);
	const exportVideo = useExportStore((s) => s.exportVideo);
	const exportPng = useExportStore((s) => s.exportPng);
	const hasSteps = useSnippetStore((s) => s.snippet.steps.length >= 2);

	useEffect(() => {
		if (deviceSupported === null) {
			void probeDevice();
		}
	}, [deviceSupported, probeDevice]);

	const current = presetFor(width, height) ?? FALLBACK_PRESET;

	return (
		<>
			<ClusterGroup>
				<IslandSegmented
					group="format"
					eyebrow="Format"
					options={[
						{ value: "mp4" as RenderFormat, label: "MP4" },
						{ value: "webm" as RenderFormat, label: "WebM" },
						{ value: "gif" as RenderFormat, label: "GIF" },
					]}
					value={format}
					onSelect={setFormat}
				/>
				<IslandSegmented
					group="tier"
					eyebrow="Size"
					options={RESOLUTION_TIERS.map((tier) => {
						const dims = dimensionsFor(current.aspect, tier);
						return { value: tier, label: tier, title: `${dims.width}×${dims.height}` };
					})}
					value={presetFor(width, height)?.tier ?? null}
					onSelect={(tier) => {
						const dims = dimensionsFor(current.aspect, tier as ResolutionTier);
						setResolution(dims.width, dims.height);
					}}
				/>
			</ClusterGroup>

			<ClusterGroup>
				<IslandSegmented
					group="target"
					eyebrow="Where"
					options={[
						{
							value: "device" as const,
							label: "This device",
							title:
								deviceSupported === false
									? "This browser has no encoder for the selected format and size."
									: "Renders in this tab. Nothing is uploaded, and no server has to be running.",
							disabled: deviceSupported === false,
						},
						{
							value: "server" as const,
							label: "Server",
							title: "Renders with Remotion on the Typelapse API server, which has to be running.",
						},
					]}
					value={target}
					onSelect={setTarget}
				/>
				<span className="si-gap" />
				<button
					type="button"
					onClick={() => {
						trigger("light");
						void exportPng();
					}}
					disabled={isExporting}
					title="Save the current frame as a PNG"
					className="si-button"
				>
					<CameraGlyph />
					<span className="si-seg-label">PNG</span>
				</button>
				<button
					type="button"
					onClick={() => {
						trigger("light");
						void exportVideo();
					}}
					disabled={isExporting || !hasSteps}
					title={hasSteps ? undefined : "A video needs at least two steps."}
					className="si-cta si-cluster-cta"
				>
					{isExporting ? "Rendering…" : `Render · ${current.aspect}`}
				</button>
			</ClusterGroup>
		</>
	);
}

/** What the island's one filled shape says when nothing is open. */
export function useExportCtaLabel(): string {
	const format = useExportStore((s) => s.format);
	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	return exportCtaLabel({ format, width, height });
}

function CameraGlyph() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<rect x="3" y="3" width="18" height="18" rx="3" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
	);
}
