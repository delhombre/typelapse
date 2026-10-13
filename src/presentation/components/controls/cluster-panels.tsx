import { captionsCaveat, exportCtaLabel, gifFpsCaveat } from "@/application/export/export-label";
import { renderBlock } from "@/application/export/render-block";
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
import { gifSafeFps } from "@/infrastructure/export/gif-timing";
import { BackgroundPicker } from "@/presentation/components/preview/background-picker";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback, trigger } from "@/presentation/haptics";
import { serverRenderOffered, useExportStore } from "@/presentation/stores/export.store";
import { hasEmptyDraft, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	hasAuthoredMultimedia,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { useCallback, useEffect } from "react";
import { Camera } from "reicon-react";
import {
	KeepCaptionsLink,
	RENDER_BUSY_LABELS,
	useCloudRenderCta,
	useCloudTarget,
	useWhereSelect,
} from "./cloud-render";
import {
	CHROME_PRESETS,
	PADDING_PRESETS,
	PROGRESS_STYLES,
	RADIUS_PRESETS,
	TEMPO_PRESETS,
	THEMES,
} from "./control-presets";
import { HostedRenderSheet } from "./hosted-render-sheet";
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

/**
 * What the shape and size chips fall back to when the stored dimensions match
 * no preset, such as a hand-edited link. Neither row lights
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
	return (
		<>
			<OpensAtTop />
			<ClusterControls cluster={cluster} />
		</>
	);
}

function ClusterControls({ cluster }: { cluster: ClusterId }) {
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

/**
 * A tab opens at its top. On the phone the panel's body scrolls, and the tabs
 * swap in the same body, so one scrolled to its end would hand the next its
 * offset and open it with its first rows above the fold.
 */
function OpensAtTop() {
	// Stable, so React attaches it once, when the tab mounts, and not again on
	// every render of the panel: a callback ref made inline is a new function
	// each time, and would throw a scrolled panel back to its top whenever a
	// control in it changed a store.
	const toTop = useCallback((marker: HTMLSpanElement | null) => {
		const body = marker?.closest(".si-sheet-body");
		if (body) {
			body.scrollTop = 0;
		}
	}, []);
	return <span hidden ref={toTop} />;
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
		<StudioTooltip content={title}>
			<button
				type="button"
				aria-pressed={selected}
				aria-label={`Aspect ratio ${aspect}`}
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
		</StudioTooltip>
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
					title="Type the first scene out character by character"
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
					title="The last scene morphs back to the first"
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
	const selectWhere = useWhereSelect("cluster");
	const deviceSupported = useExportStore((s) => s.deviceSupported);
	const probeDevice = useExportStore((s) => s.probeDevice);
	const isExporting = useExportStore((s) => s.isExporting);
	const exportVideo = useExportStore((s) => s.exportVideo);
	const exportPng = useExportStore((s) => s.exportPng);
	const fps = useExportStore((s) => s.fps);
	const setFps = useExportStore((s) => s.setFps);
	const canRender = useCanRender();
	const cloudTarget = useCloudTarget();
	const cloudCta = useCloudRenderCta(target);

	useEffect(() => {
		if (deviceSupported === null) {
			void probeDevice();
		}
	}, [deviceSupported, probeDevice]);

	const current = presetFor(width, height) ?? FALLBACK_PRESET;

	return (
		<>
			{/* What blocks or changes Render comes first, in the one place a person looks when
			    Render is greyed: a tooltip never shows on a phone, a disabled button is not
			    reached by a screen reader, and the pinned Render row is below the fold of a
			    scrolled sheet. The reason and its Capture shortcut, then the GIF and captions
			    caveats, then what this browser cannot encode. */}
			<RenderNotes variant="sheet" />
			{deviceSupported === false ? <p className="si-cluster-note">{DEVICE_CANNOT_ENCODE}</p> : null}

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
				<IslandSegmented
					group="fps"
					eyebrow="FPS"
					options={fpsOptionsFor(format)}
					value={fps}
					onSelect={setFps}
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
									? DEVICE_CANNOT_ENCODE
									: "Renders in this tab. Nothing is uploaded, and no server has to be running.",
							disabled: deviceSupported === false,
						},
						...(serverRenderOffered()
							? [
									{
										value: "server" as const,
										label: "Server",
										title:
											"Renders with Remotion on the Typelapse API server, which has to be running.",
									},
								]
							: []),
						...(cloudTarget ? [cloudTarget] : []),
					]}
					value={target}
					onSelect={selectWhere}
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
			</ClusterGroup>

			{/* Only the button is the footer. On the phone, when the sheet's room holds it and
			    two rows of chips, it stays pinned (app.css, \`data-roomy\`); below that it
			    scrolls with everything else, so no control is ever out of reach. The reasons are above the rows. */}
			<div className="si-cluster-group si-cluster-row si-cluster-footer">
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
					aria-busy={isExporting || cloudCta.busy || undefined}
					aria-describedby={canRender ? undefined : RENDER_NOTES_ID}
					className="si-cta si-cluster-cta"
				>
					<RenderCtaLabel
						idle={`Render · ${current.aspect}`}
						shown={isExporting ? "Rendering…" : (cloudCta.label ?? `Render · ${current.aspect}`)}
					/>
				</button>
			</div>
			<HostedRenderSheet surface="cluster" />
		</>
	);
}

/**
 * The Render button's words, every one it can say stacked in one grid cell and
 * only the current one visible. The button is as wide as its longest label from
 * the start, so pressing it does not resize the island, which springs its width
 * off this row and would slide every control beside it. The hidden ones are
 * aria-hidden, so the button's name is the word on screen.
 */
export function RenderCtaLabel({ idle, shown }: { idle: string; shown: string }) {
	const labels = [...new Set([idle, ...RENDER_BUSY_LABELS, "Rendering…", shown])];
	return (
		<span className="si-cta-labels">
			{labels.map((label) => (
				<span key={label} aria-hidden={label === shown ? undefined : true}>
					{label}
				</span>
			))}
		</span>
	);
}

/** The rates a file can be rendered at; the project file carries the choice. */
export const FPS_OPTIONS = [24, 30, 60].map((rate) => ({
	value: rate,
	label: String(rate),
	title: `${rate} frames per second`,
}));

/** A GIF cannot hold these rates: each chip says what it becomes before it is pressed. */
export function fpsOptionsFor(format: RenderFormat) {
	if (format !== "gif") {
		return FPS_OPTIONS;
	}
	return FPS_OPTIONS.map((option) => {
		const safe = gifSafeFps(option.value);
		return safe < option.value
			? { ...option, title: `${option.value} fps renders at ${safe} in a GIF` }
			: option;
	});
}

/** Why "This device" is greyed: WebCodecs said no to the chosen format and size. */
export const DEVICE_CANNOT_ENCODE = "This browser cannot encode this format at this size.";

/** D3: Render is on from one scene, and for authored media such as audio alone. */
export function useRenderBlock() {
	const sceneCount = useSnippetStore((s) => s.snippet.steps.length);
	const project = useStudioCompositionStore((s) => s.value.project);
	const emptyDraft = useSnippetStore(hasEmptyDraft);
	return renderBlock({ sceneCount, hasMedia: hasAuthoredMultimedia(project), emptyDraft });
}

export function useCanRender(): boolean {
	return useRenderBlock() === null;
}

/** The id the Render button points `aria-describedby` at while it is off. */
export const RENDER_NOTES_ID = "si-render-notes";

/**
 * What to know about Render before pressing it, in words on the page: why it is
 * off (with a Capture shortcut when that unblocks it), what a GIF does to the
 * frame rate, and what the on-device file leaves out. A tooltip never shows on a
 * phone and a disabled button is not reached by a screen reader, so a reason
 * kept in `title` is no reason at all (D7).
 *
 * The sheet draws it under the button; the desktop rail has no room for a line
 * in its one row, so it floats it above the island as the status pill does.
 */
export function RenderNotes({ variant }: { variant: "sheet" | "pill" }) {
	const block = useRenderBlock();
	const format = useExportStore((s) => s.format);
	const fps = useExportStore((s) => s.fps);
	const target = useExportStore((s) => s.target);
	const isExporting = useExportStore((s) => s.isExporting);
	const hasCaptions = useSnippetStore((s) => s.snippet.steps.some((step) => step.annotation));
	const captureStep = useSnippetStore((s) => s.captureStep);
	const gifNote = gifFpsCaveat({ format, fps, safeFps: gifSafeFps(fps) });
	const captionsNote = captionsCaveat({
		hasCaptions,
		onDevice: target === "device",
		serverOffered: serverRenderOffered(),
	});
	const notes = [gifNote, captionsNote].filter((note): note is string => note !== null);

	if ((variant === "pill" && isExporting) || (!block && notes.length === 0)) {
		return null;
	}

	const lines = (
		<>
			{block ? (
				<span className="si-note-row">
					<span>{block.reason}</span>
					{block.canCapture ? (
						<button
							type="button"
							className="si-note-action"
							onClick={() => {
								captureStep();
								feedback("commit");
							}}
						>
							Capture a scene
						</button>
					) : null}
				</span>
			) : null}
			{notes.map((note) => (
				<span key={note} className="si-note-row">
					<span>{note}</span>
					{/* Where a hosted render bakes them, the caveat says so (ux-waves D3): the
					    link chooses Cloud for a plan that renders there, and opens the sheet
					    that explains it for any other. A local build has no Cloud to name. */}
					{note === captionsNote ? (
						<KeepCaptionsLink
							surface={variant === "pill" ? "rail" : "cluster"}
							className="si-note-action"
						/>
					) : null}
				</span>
			))}
		</>
	);

	return variant === "pill" ? (
		<div id={RENDER_NOTES_ID} role="note" className="si-status si-render-notes">
			<div className="si-render-notes-lines">{lines}</div>
		</div>
	) : (
		<p id={RENDER_NOTES_ID} className="si-cluster-note si-cluster-notes">
			{lines}
		</p>
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
	return <Camera size={11} strokeWidth={2} aria-hidden="true" />;
}
