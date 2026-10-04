import { exportCtaDetail, exportCtaLabel } from "@/application/export/export-label";
import { FEED_ASPECTS, feedEntryFor, socialCorrection } from "@/application/social/feed-aspects";
import {
	PLATFORM_LABELS,
	type SocialPlatform,
	platformsForAspect,
} from "@/application/social/safe-zones";
import {
	ASPECT_LABELS,
	type AspectLabel,
	RESOLUTION_TIERS,
	presetFor,
} from "@/domain/entities/render-config";
import { AnimatedSizeContainer } from "@/presentation/components/ui/animated-size-container";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { trigger } from "@/presentation/haptics";
import { useIsNarrow } from "@/presentation/hooks/use-media-query";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	resolveSocialPlatform,
	useSocialPreviewStore,
} from "@/presentation/stores/social-preview.store";
import {
	MAX_DOTS,
	NARROW_MAX_DOTS,
	playbackFill,
	showsDots,
	stepCounter,
	stepDotLabel,
	transportFace,
	transportLabel,
} from "@/presentation/utils/playback-readout";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AspectRatioSquare,
	ChevronLeft,
	ColorSwatch,
	Crop,
	Frame,
	Mobile,
	Pause,
	Play,
	Repeat,
	Sliders,
	VolumeHigh,
	WavePulse,
	X,
} from "reicon-react";
import { CLUSTERS, type ClusterId, ClusterPanel } from "./cluster-panels";
import { StudioAspectMode, StudioClusterMode } from "./studio-cluster-mode";

/** The island's 3px side insets plus its two 1px material edges. */
const ISLAND_PADDING = 8;

/** What can be open at once, which is one thing. */
type Panel = ClusterId | "social" | "aspect" | null;

/**
 * The studio's control island: one dark plate under the preview holding the
 * transport, the progress track, the step dots, the counter, the four clusters
 * of settings and the export CTA.
 *
 * It wears the landing's dock material on purpose. That plate is the product's
 * most recognisable object, and the studio used to answer it with two stacked
 * white pills, so crossing from / to /app changed instruments as well as pages.
 * Same fill, same 40px height, same 30px transparent controls, same rule that
 * only one shape in the zone is ever filled. Decided in
 * docs/decisions/2026-08-09-instrument-island.md; the numbers here are that
 * document's, not new ones.
 *
 * The material is fixed in both colour schemes. A dock that inverts with the
 * theme is a panel; a dock that stays is an instrument sitting on the page.
 *
 * Two things open out of it, and they open differently on purpose. Social
 * *replaces* the row — it is a mode the preview enters, so the transport it
 * would fight with steps aside for it. A cluster *raises a sheet* above the
 * plate instead, because a cluster is not a mode: the transport still works
 * while you are choosing a theme, and the picture behind is what you are
 * choosing it against. Only one of the two is ever open.
 */
export function PreviewIsland({
	onSheetRaisedChange,
	variant = "preview",
}: {
	/** Told when a settings surface is visible, so the stage can make room for it. */
	onSheetRaisedChange?: (raised: boolean) => void;
	/** The timeline owns transport in the desktop scene-table layout. */
	variant?: "preview" | "timeline";
}) {
	const snippet = useSnippetStore((s) => s.snippet);
	const isPlaying = useSnippetStore((s) => s.isPlaying);
	const isPreparing = useSnippetStore((s) => s.isPreparing);
	const currentStepIndex = useSnippetStore((s) => s.currentStepIndex);
	const play = useSnippetStore((s) => s.play);
	const pause = useSnippetStore((s) => s.pause);
	const setCurrentStepIndex = useSnippetStore((s) => s.setCurrentStepIndex);

	const format = useExportStore((s) => s.format);
	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	const outcome = useExportStore((s) => s.outcome);
	const setResolution = useExportStore((s) => s.setResolution);
	const loop = useExportStore((s) => s.loop);
	const setLoop = useExportStore((s) => s.setLoop);
	const sound = useExportStore((s) => s.sound);
	const setSound = useExportStore((s) => s.setSound);
	const enabled = useSocialPreviewStore((s) => s.enabled);
	const platform = useSocialPreviewStore((s) => s.platform);
	const showGuides = useSocialPreviewStore((s) => s.showGuides);
	const setEnabled = useSocialPreviewStore((s) => s.setEnabled);
	const setPlatform = useSocialPreviewStore((s) => s.setPlatform);
	const setShowGuides = useSocialPreviewStore((s) => s.setShowGuides);

	const reduce = useReducedMotion() === true;
	const narrow = useIsNarrow();
	const [panel, setPanel] = useState<Panel>(null);
	const cluster = panel === null || panel === "social" || panel === "aspect" ? null : panel;
	/** Which door the phone's single settings button opens: the last one used. */
	const [lastCluster, setLastCluster] = useState<ClusterId>("frame");

	const platforms = useMemo(() => platformsForAspect(width, height), [width, height]);
	const totalSteps = snippet.steps.length;
	const hasTransport = variant === "preview" && totalSteps >= 2;
	const currentPreset = presetFor(width, height) ?? {
		aspect: ASPECT_LABELS[0],
		tier: RESOLUTION_TIERS[0],
	};

	// Keep the stored platform valid for the current aspect, so the picker
	// highlights (and the overlay shows) a platform that uses this aspect. Runs
	// on enable and whenever the aspect changes underneath an open panel.
	useEffect(() => {
		const correction = socialCorrection({ enabled, platform, platforms });
		if (correction === null) {
			return;
		}
		if ("disable" in correction) {
			setEnabled(false);
			return;
		}
		setPlatform(correction.platform);
	}, [enabled, platforms, platform, setPlatform, setEnabled]);

	// Only the compact preview raises a sheet. On the scene-table rail, settings
	// replace the row in place, so the picture remains still while it is judged.
	useEffect(() => {
		onSheetRaisedChange?.(variant !== "timeline" && cluster !== null);
	}, [cluster, onSheetRaisedChange, variant]);

	/**
	 * A finished render is a thing the machine did, at a moment nobody chose: it
	 * gets the one tap of feedback a completed job earns, and only when the
	 * outcome is new. Starting one taps at the press, in the cluster.
	 */
	const lastOutcome = useRef(outcome);
	useEffect(() => {
		if (outcome !== null && outcome !== lastOutcome.current) {
			trigger("light");
		}
		lastOutcome.current = outcome;
	}, [outcome]);

	/**
	 * Opening a panel takes the pressed control away — the social row replaces
	 * the whole row, and a cluster's opener stays but is no longer where the hand
	 * is. So each direction hands focus to the control that undoes the move:
	 * opening lands inside the panel, closing lands back on the opener.
	 *
	 * Only keyboard dismissal restores. A press outside is already a statement
	 * about where the hand wants to be, and pulling focus back would undo it.
	 */
	const restoreTo = useRef<Panel>(null);
	const focusModeOnMount = useRef(false);
	const dockRef = useRef<HTMLDivElement>(null);
	const rootRowRef = useRef<HTMLDivElement | null>(null);
	const panelRef = useRef<Panel>(null);
	panelRef.current = panel;

	const openPanel = useCallback(
		(next: Exclude<Panel, null>, focusOnMount = false) => {
			trigger("selection");
			restoreTo.current = null;
			focusModeOnMount.current = variant === "timeline" && focusOnMount;
			if (next !== "social" && next !== "aspect") {
				setLastCluster(next);
			}
			setPanel(next);
		},
		[variant],
	);

	const closePanel = useCallback((restore: boolean) => {
		const current = panelRef.current;
		if (current === null) {
			return;
		}
		trigger("selection");
		restoreTo.current = restore ? current : null;
		setPanel(null);
	}, []);

	const togglePanel = useCallback(
		(next: Exclude<Panel, null>, focusOnMount = false) => {
			if (panelRef.current === next) {
				closePanel(true);
				return;
			}
			openPanel(next, focusOnMount);
		},
		[closePanel, openPanel],
	);

	// The island springs to a measured width, since `width: auto` cannot be
	// animated. `offsetWidth`, not `scrollWidth`: the controls carry their pointer
	// targets as absolutely positioned pseudo-elements that reach past the row on
	// purpose, and `scrollWidth` counts that reach as content. A ResizeObserver
	// rather than a mount callback, because the row's content changes without
	// remounting (a step added, the counter appearing at a wider viewport).
	const [rowWidth, setRowWidth] = useState<number | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);
	const measureRow = useCallback((node: HTMLDivElement | null) => {
		observerRef.current?.disconnect();
		if (!node) {
			return;
		}
		const read = () => setRowWidth(node.offsetWidth);
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		observerRef.current = observer;
	}, []);

	useEffect(() => {
		return () => observerRef.current?.disconnect();
	}, []);

	/** Give focus back to the opener, the moment the opener is on screen again. */
	const restoreOpenerFocus = useCallback(() => {
		const id = restoreTo.current;
		if (id === null) {
			return;
		}
		const opener = rootRowRef.current?.querySelector<HTMLElement>(`[data-island-opener="${id}"]`);
		if (opener) {
			restoreTo.current = null;
			opener.focus({ preventScroll: true });
		}
	}, []);

	const mountRootRow = useCallback(
		(node: HTMLDivElement | null) => {
			rootRowRef.current = node;
			measureRow(node);
			restoreOpenerFocus();
		},
		[measureRow, restoreOpenerFocus],
	);

	// Closing a cluster never remounts the root row — it was never gone — so the
	// restore rides this instead of the mount callback the social row uses.
	useEffect(() => {
		if (panel === null) {
			restoreOpenerFocus();
		}
	}, [panel, restoreOpenerFocus]);

	/**
	 * Set while a feed-aspect chip is being pressed, and read once by the row that
	 * replaces it. A press that reshapes the project has already said where the
	 * hand wants to be — inside the picker it just opened — so that row does not
	 * hand focus back to the way out. Every other way in still lands on Back.
	 */
	const landOnFeed = useRef(false);
	/**
	 * The row this callback has already placed focus in.
	 *
	 * StrictMode attaches a ref, detaches it and attaches it again on the same
	 * node, so without this the second pass ran against a flag the first had
	 * already spent: the press landed in the picker and was pulled back to Back a
	 * frame later. Keying on the element rather than on a counter also makes the
	 * callback safe to call as often as React likes — one row, one placement.
	 */
	const placedIn = useRef<HTMLElement | null>(null);

	const mountSocialRow = useCallback(
		(node: HTMLDivElement | null) => {
			measureRow(node);
			// The detach call arrives *before* the replacement row attaches, so it must
			// not touch the flag: clearing it here spent it on the row that was leaving.
			if (!node || placedIn.current === node) {
				return;
			}
			placedIn.current = node;
			const feed = landOnFeed.current
				? node.querySelector<HTMLElement>("[data-island-feed][aria-pressed='true']")
				: null;
			landOnFeed.current = false;
			(feed ?? node.querySelector<HTMLElement>("[data-island-back]"))?.focus({
				preventScroll: true,
			});
		},
		[measureRow],
	);

	/** Focus enters an in-rail settings mode on its one reliable way back out. */
	const mountModeRow = useCallback(
		(node: HTMLDivElement | null) => {
			measureRow(node);
			if (!node || placedIn.current === node) {
				return;
			}
			placedIn.current = node;
			if (focusModeOnMount.current) {
				focusModeOnMount.current = false;
				node.querySelector<HTMLElement>("[data-island-back]")?.focus({ preventScroll: true });
			}
		},
		[measureRow],
	);

	/**
	 * A panel is a mode, and a mode needs both of its exits: Escape for the
	 * keyboard, a press anywhere else for the pointer. pointerdown rather than
	 * click, so the panel is gone by the time the press resolves, the same beat a
	 * native menu dismisses on.
	 *
	 * Escape stops here rather than carrying on to the window, where the studio's
	 * bare-key shortcut would also read it and pause playback: one key, one
	 * meaning, and the meaning is the panel in front of you.
	 */
	useEffect(() => {
		if (panel === null) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				closePanel(true);
			}
		};
		const onPointerDown = (event: PointerEvent) => {
			const dock = dockRef.current;
			const path = event.composedPath();
			const insideDock = dock !== null && path.includes(dock);
			if (!insideDock) {
				closePanel(false);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [panel, closePanel]);

	const face = transportFace(isPreparing, isPlaying);
	const label = transportLabel(face);
	const dots = showsDots(totalSteps, narrow ? NARROW_MAX_DOTS : MAX_DOTS);
	const selection: SocialPlatform | "off" =
		resolveSocialPlatform(enabled, platform, width, height) ?? "off";

	const onTransport = () => {
		trigger("light");
		if (isPlaying) {
			pause();
			return;
		}
		play();
	};

	const onSeek = (index: number) => {
		// Seeking is a paused affordance; while playing the dots only track. A
		// scrubbable track is the next move, and it lands on this same row.
		if (isPlaying) {
			return;
		}
		trigger("selection");
		setCurrentStepIndex(index);
	};

	const onSelectFeed = (value: SocialPlatform | "off") => {
		trigger("selection");
		if (value === "off") {
			setEnabled(false);
			return;
		}
		setPlatform(value);
		setEnabled(true);
	};

	/**
	 * One press on a shape chip does the whole move: it reshapes the canvas and
	 * enters the feed that shape belongs to.
	 *
	 * The size goes through `setResolution`, which is the same store action the
	 * Frame cluster's shape chips call, composed from the same `dimensionsFor` at
	 * the tier the project is already on — so a 4K 16:9 project becomes a 4K 9:16
	 * one, and the Frame chip for the new shape lights up as though it had been
	 * pressed there. The feed goes through `onSelectFeed`, which is the picker's
	 * own path. Two producers would be two chances to disagree about what
	 * "9:16 with Reels on" means.
	 */
	const onPickFeedAspect = (aspect: AspectLabel) => {
		const tier = presetFor(width, height)?.tier ?? RESOLUTION_TIERS[0];
		const entry = feedEntryFor(aspect, tier);
		if (!entry) {
			return;
		}
		landOnFeed.current = true;
		setResolution(entry.width, entry.height);
		onSelectFeed(entry.platform);
	};

	const sheetLayer = (
		<AnimatePresence>
			{variant !== "timeline" && cluster !== null && (
				<ClusterSheet
					cluster={cluster}
					reduce={reduce}
					docked={false}
					onSelect={(next) => openPanel(next)}
					onClose={() => closePanel(true)}
				/>
			)}
		</AnimatePresence>
	);

	return (
		<div
			className={`si-dock ${variant === "timeline" ? "si-dock-timeline" : ""}`}
			id="studio-island"
			ref={dockRef}
		>
			{sheetLayer}

			<motion.div
				className="si-island"
				role="toolbar"
				aria-label={variant === "timeline" ? "Studio controls" : "Preview controls"}
				initial={false}
				animate={rowWidth === null ? undefined : { width: rowWidth + ISLAND_PADDING }}
				transition={reduce ? { duration: 0 } : springs.default}
			>
				<AnimatePresence mode="wait" initial={false}>
					{panel === "social" ? (
						// The social row has two faces and they are one key apart, not two
						// AnimatePresences deep: reshaping the canvas swaps the row on the
						// same `mode="wait"` the panel itself swaps on, so a chip press
						// reads as one row changing rather than as a row inside a row.
						<motion.div
							key={platforms.length === 0 ? "social-shape" : "social-feed"}
							ref={mountSocialRow}
							className="si-row"
							{...rowMotion(reduce)}
						>
							<button
								type="button"
								onClick={() => closePanel(true)}
								data-island-back=""
								aria-label={
									variant === "timeline" ? "Back to studio controls" : "Back to playback controls"
								}
								className="si-button"
							>
								<BackGlyph />
							</button>

							{platforms.length === 0 ? (
								<FeedShapePicker onPick={onPickFeedAspect} />
							) : (
								<>
									<FeedPicker
										platforms={platforms}
										value={selection}
										onSelect={onSelectFeed}
										reduce={reduce}
									/>
									<button
										type="button"
										onClick={() => {
											trigger("selection");
											setShowGuides(!showGuides);
										}}
										aria-pressed={showGuides}
										aria-label="Safe-zone guides"
										// No `data-active` beside the `aria-pressed`: the attribute the
										// screen reader reads is the attribute the stylesheet reads, so
										// the two can never disagree about whether guides are on.
										className="si-button si-toggle"
									>
										<GuidesGlyph />
										<span className="si-label">Guides</span>
									</button>
								</>
							)}
						</motion.div>
					) : null}

					{variant === "timeline" && cluster !== null ? (
						<motion.div
							key={`cluster-${cluster}`}
							ref={mountModeRow}
							className="si-row si-mode-row"
							{...rowMotion(reduce)}
						>
							<StudioClusterMode cluster={cluster} onClose={() => closePanel(true)} />
						</motion.div>
					) : null}

					{variant === "timeline" && panel === "aspect" ? (
						<motion.div
							key="aspect"
							ref={mountModeRow}
							className="si-row si-mode-row"
							{...rowMotion(reduce)}
						>
							<StudioAspectMode onClose={() => closePanel(true)} />
						</motion.div>
					) : null}

					{panel !== "social" &&
					!(variant === "timeline" && (cluster !== null || panel === "aspect")) ? (
						<motion.div
							key="root"
							ref={mountRootRow}
							className="si-row"
							data-dots={dots ? "on" : "off"}
							{...rowMotion(reduce)}
						>
							{hasTransport && (
								<>
									<button
										type="button"
										onClick={onTransport}
										disabled={isPreparing}
										aria-label={label}
										className="si-button"
										data-active=""
									>
										<AnimatePresence mode="wait" initial={false}>
											<motion.span
												key={face}
												className="si-glyph"
												initial={reduce ? false : { opacity: 0, scale: 0.6 }}
												animate={{ opacity: 1, scale: 1 }}
												exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
												transition={reduce ? { duration: 0 } : springs.snappy}
											>
												<TransportGlyph face={face} />
											</motion.span>
										</AnimatePresence>
									</button>

									{/* rAF-driven, so the fill tracks the clock directly and carries no
									    CSS transition. Decorative to a screen reader on purpose: the
									    dots announce the step and the counter announces the run, so a
									    third voice for the same position would only be noise. */}
									<div className="si-track" aria-hidden="true">
										<IslandFill totalSteps={totalSteps} />
									</div>

									{dots && (
										<div className="si-dots">
											{snippet.steps.map((step, index) => (
												<button
													key={step.id}
													type="button"
													onClick={() => onSeek(index)}
													aria-label={stepDotLabel(index, totalSteps)}
													{...(index === currentStepIndex ? { "aria-current": "step" } : {})}
													className="si-dot"
												>
													<span />
												</button>
											))}
										</div>
									)}

									<span className="si-count">{stepCounter(currentStepIndex, totalSteps)}</span>
									<span className="si-gap" />
								</>
							)}

							{/* Three doors where there is room for them, one where there is not.
							    The sheet carries the four tabs either way, so the phone loses a
							    shortcut and never a destination. */}
							{narrow ? (
								<button
									type="button"
									onClick={(event) => togglePanel(cluster ?? lastCluster, event.detail === 0)}
									data-island-opener={cluster ?? lastCluster}
									aria-expanded={cluster !== null}
									aria-label="Settings"
									className="si-button"
									{...(cluster !== null ? { "data-active": "" } : {})}
								>
									<SettingsGlyph />
								</button>
							) : (
								CLUSTERS.filter((entry) => entry.id !== "export").map((entry) => (
									<button
										key={entry.id}
										type="button"
										onClick={(event) => togglePanel(entry.id, event.detail === 0)}
										data-island-opener={entry.id}
										aria-expanded={cluster === entry.id}
										aria-label={`${entry.label} settings`}
										className="si-button"
										{...(cluster === entry.id ? { "data-active": "" } : {})}
									>
										<ClusterGlyph cluster={entry.id} />
										<span className="si-label">{entry.label}</span>
									</button>
								))
							)}

							<button
								type="button"
								onClick={(event) => togglePanel("social", event.detail === 0)}
								data-island-opener="social"
								aria-label={`Social preview: ${enabled ? "on" : "off"}. Open social preview controls`}
								className="si-button"
								{...(enabled ? { "data-active": "" } : {})}
							>
								<FeedGlyph />
								<span className="si-label">Social</span>
							</button>

							{variant === "timeline" && (
								<>
									<button
										type="button"
										onClick={() => {
											trigger("selection");
											setLoop(!loop);
										}}
										aria-pressed={loop}
										aria-label={`Loop playback: ${loop ? "on" : "off"}`}
										className="si-button si-toggle si-rail-direct"
									>
										<LoopGlyph />
										<span className="si-label">Loop</span>
									</button>
									<button
										type="button"
										onClick={() => {
											trigger("selection");
											setSound(!sound);
										}}
										aria-pressed={sound}
										aria-label={`Preview sound: ${sound ? "on" : "off"}`}
										className="si-button si-toggle si-rail-direct"
									>
										<SoundGlyph />
										<span className="si-label">Sound</span>
									</button>
									<button
										type="button"
										onClick={(event) => togglePanel("aspect", event.detail === 0)}
										data-island-opener="aspect"
										aria-expanded={panel === "aspect"}
										aria-label={`Aspect ratio ${currentPreset.aspect}. Choose a format`}
										className="si-button si-rail-aspect"
										{...(panel === "aspect" ? { "data-active": "" } : {})}
									>
										<AspectGlyph />
										<span className="si-ratio">{currentPreset.aspect}</span>
									</button>
								</>
							)}

							{/* The one filled shape in the zone. It hands its fill to the sheet
							    while the export cluster is open, so there is still only one. */}
							<button
								type="button"
								onClick={(event) => togglePanel("export", event.detail === 0)}
								data-island-opener="export"
								aria-expanded={cluster === "export"}
								aria-label={exportCtaLabel({ format, width, height })}
								className="si-cta"
								{...(cluster === "export" ? { "data-open": "" } : {})}
							>
								Export
								<span className="si-cta-detail">
									· {exportCtaDetail({ format, width, height })}
								</span>
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}

/**
 * The sheet a cluster raises: the island's own material, one step above the
 * plate, holding the four tabs and whichever cluster is open.
 *
 * The tabs are inside the sheet rather than only in the row below, so swapping
 * cluster is one press instead of two, and so a keyboard lands somewhere that
 * can move sideways as well as out. The body springs its own height, because
 * the clusters are not the same size and a sheet that jumped between them would
 * read as four sheets rather than one that changed its mind.
 */
/**
 * The track's fill, the island's one reader of the clock. It subscribes on its
 * own so a playback tick repaints this bar and not the island around it.
 */
function IslandFill({ totalSteps }: { totalSteps: number }) {
	const fill = useSnippetStore((s) =>
		s.playback
			? Math.min(Math.max(s.playbackProgress, 0), 1)
			: playbackFill({
					isPlaying: s.isPlaying,
					playbackProgress: s.playbackProgress,
					currentStepIndex: s.currentStepIndex,
					totalSteps,
				}),
	);
	return <div className="si-fill" style={{ width: `${fill * 100}%` }} />;
}

function ClusterSheet({
	cluster,
	reduce,
	docked,
	onSelect,
	onClose,
}: {
	cluster: ClusterId;
	reduce: boolean;
	docked: boolean;
	onSelect: (cluster: ClusterId) => void;
	onClose: () => void;
}) {
	const label = CLUSTERS.find((c) => c.id === cluster)?.label ?? "";
	const tabsRef = useRef<HTMLDivElement>(null);

	// On the way in, focus lands on the tab that is open: it says where you are,
	// and it is also the fastest way back out (Escape) or sideways (the tab
	// beside it). Only on the way in — the sheet stays mounted across a swap, and
	// a swap is a press that already put focus where the hand chose.
	useEffect(() => {
		tabsRef.current
			?.querySelector<HTMLElement>("[data-sheet-tab][data-selected]")
			?.focus({ preventScroll: true });
	}, []);

	return (
		<motion.fieldset
			className="si-sheet"
			data-cluster={cluster}
			aria-label={`${label} settings`}
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			// `pointerEvents` is not animated, so Motion sets it the instant the exit
			// begins. It has to: the sheet is invisible after about 280ms but its
			// spring is only judged finished at about 660, and for the 380ms in
			// between an unseeable panel was swallowing presses aimed at the frame
			// behind it.
			exit={
				reduce
					? { opacity: 0, pointerEvents: "none", transition: { duration: 0 } }
					: { opacity: 0, y: 12, scale: 0.98, pointerEvents: "none" }
			}
			transition={reduce ? { duration: 0 } : springs.default}
			style={{ transformOrigin: docked ? "bottom right" : "bottom center" }}
		>
			<div className="si-sheet-tabs" ref={tabsRef}>
				{CLUSTERS.map((entry) => {
					const selected = entry.id === cluster;
					return (
						<button
							key={entry.id}
							type="button"
							data-sheet-tab=""
							aria-pressed={selected}
							onClick={() => onSelect(entry.id)}
							className="si-button si-seg-option"
							{...(selected ? { "data-selected": "" } : {})}
						>
							{selected && (
								<motion.span
									layoutId="si-plate-sheet-tabs"
									className="si-plate"
									transition={reduce ? { duration: 0 } : springs.snappy}
								/>
							)}
							<span className="si-seg-label">{entry.label}</span>
						</button>
					);
				})}
				<span className="si-sheet-spacer" />
				<StudioTooltip content="Close settings">
					<button type="button" onClick={onClose} aria-label="Close settings" className="si-button">
						<CloseGlyph />
					</button>
				</StudioTooltip>
			</div>

			{/* `popLayout` and not `wait`, which is what the row below swaps on. The
			    row can wait because its size does not change; the sheet's does, and
			    the box only learns its new height once the new cluster is mounted. On
			    `wait` that is after the outgoing spring has fully settled, so the new
			    cluster sat in the old cluster's box for about half a second and the
			    sheet resized when nothing had just happened. Popped, the incoming
			    mounts at once and the height spring runs with the crossfade. */}
			<AnimatedSizeContainer
				height
				className="si-sheet-body"
				transition={reduce ? { duration: 0 } : springs.default}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div key={cluster} className="si-cluster" {...rowMotion(reduce)}>
						<ClusterPanel cluster={cluster} />
					</motion.div>
				</AnimatePresence>
			</AnimatedSizeContainer>
		</motion.fieldset>
	);
}

/**
 * What the social row offers when the canvas is a shape no feed uses.
 *
 * It used to be a sentence — "Set a 9:16, 1:1 or 4:5 ratio" — and the sentence
 * was two failures at once. It named an action it would not perform: the ratio
 * lives in the Frame sheet, and the row neither took you there nor did it
 * itself, so the one control on screen was a dead end that told you to go
 * somewhere else. And it never said what Social *was*, so the instruction read
 * as a riddle: a ratio, demanded, for a reason nobody had given.
 *
 * So the row says what it is and then does the work. The label is prose and
 * takes the interface's sans; the chips are the machine's own notation for a
 * shape and take the mono, the same way the step counter does. One press
 * reshapes the canvas and enters that shape's feed together, because those were
 * never two decisions.
 */
function FeedShapePicker({ onPick }: { onPick: (aspect: AspectLabel) => void }) {
	return (
		<>
			<span className="si-hint">Preview in the feed</span>
			<div className="si-seg">
				{FEED_ASPECTS.map((aspect) => (
					<button
						key={aspect}
						type="button"
						onClick={() => onPick(aspect)}
						aria-label={`Switch to ${aspect} and preview the feed`}
						className="si-button si-seg-option"
					>
						<span className="si-seg-label si-ratio">{aspect}</span>
					</button>
				))}
			</div>
		</>
	);
}

/**
 * Which feed the preview is wearing, "Off" included as its own option rather
 * than as a separate master switch. One control answers one question here, and
 * the question is which feed you are looking at; a switch plus a picker asked it
 * twice and cost the row 70px it does not have at 390.
 *
 * Exactly one option is true at a time and the plate that says which is the
 * only filled shape in the whole island. They are pressed buttons in a group
 * rather than radios: the island announces itself as a toolbar, and a toolbar's
 * members are buttons that report their own state.
 */
function FeedPicker({
	platforms,
	value,
	onSelect,
	reduce,
}: {
	platforms: SocialPlatform[];
	value: SocialPlatform | "off";
	onSelect: (value: SocialPlatform | "off") => void;
	reduce: boolean;
}) {
	const options: (SocialPlatform | "off")[] = ["off", ...platforms];

	return (
		<div className="si-seg">
			{options.map((option) => {
				const selected = option === value;
				const name = option === "off" ? "Off" : PLATFORM_LABELS[option];
				return (
					<button
						key={option}
						type="button"
						aria-pressed={selected}
						data-island-feed=""
						aria-label={`Social feed: ${name}`}
						onClick={() => onSelect(option)}
						className="si-button si-seg-option"
						{...(selected ? { "data-selected": "" } : {})}
					>
						{selected && (
							<motion.span
								layoutId="si-feed-plate"
								className="si-plate"
								transition={reduce ? { duration: 0 } : springs.snappy}
							/>
						)}
						<span className="si-seg-label">{name}</span>
					</button>
				);
			})}
		</div>
	);
}

/**
 * The row's entrance and exit.
 *
 * The arrival is a spring from the shared tokens, so the row reads as an object
 * finding its place. The departure is not, and that is the whole point: it is
 * only asked to stop being in the way.
 *
 * It used to run `springs.snappy` too, and the rows swap on `mode="wait"`, which
 * holds the incoming row until the outgoing one's animation is *judged*
 * finished rather than until it is invisible. Measured on the shape → feed swap:
 * the outgoing row reached opacity 0 at 214ms and the incoming row did not mount
 * until 514ms — three hundred milliseconds in which the island sat there as an
 * empty pill, which reads as a hang and not as a transition. A spring settles on
 * physics; a departure that is already invisible has nothing left to settle. So
 * the exit is given a duration, and the swap closes in about 400ms end to end.
 */
const ROW_EXIT = { duration: 0.12, ease: [0.23, 1, 0.32, 1] as const };

function rowMotion(reduce: boolean) {
	if (reduce) {
		return {
			initial: false as const,
			animate: { opacity: 1 },
			exit: { opacity: 0, transition: { duration: 0 } },
		};
	}
	return {
		initial: { opacity: 0.99, scale: 0.98 },
		animate: { opacity: 1, scale: 1 },
		exit: { opacity: 0, scale: 0.99, transition: ROW_EXIT },
		transition: springs.snappy,
	};
}

function TransportGlyph({ face }: { face: "preparing" | "pause" | "play" }): ReactNode {
	if (face === "preparing") {
		return <SpinnerGlyph />;
	}
	return face === "pause" ? <PauseGlyph /> : <PlayGlyph />;
}

function ClusterGlyph({ cluster }: { cluster: ClusterId }): ReactNode {
	if (cluster === "frame") {
		return <FrameGlyph />;
	}
	if (cluster === "look") {
		return <LookGlyph />;
	}
	return <MotionGlyph />;
}

function PlayGlyph() {
	return (
		<Play
			size={13}
			weight="Filled"
			aria-hidden="true"
			style={{ transform: "translateX(0.75px)" }}
		/>
	);
}

function PauseGlyph() {
	return <Pause size={13} weight="Filled" aria-hidden="true" />;
}

function SpinnerGlyph() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			className="animate-spin motion-reduce:animate-none"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
			<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}

function FrameGlyph() {
	return <Frame size={11} strokeWidth={2} aria-hidden="true" />;
}

function LookGlyph() {
	return <ColorSwatch size={11} strokeWidth={2} aria-hidden="true" />;
}

function MotionGlyph() {
	return <WavePulse size={11} strokeWidth={2} aria-hidden="true" />;
}

function SettingsGlyph() {
	return <Sliders size={12} strokeWidth={2} aria-hidden="true" />;
}

function FeedGlyph() {
	return <Mobile size={11} strokeWidth={2} aria-hidden="true" />;
}

function LoopGlyph() {
	return <Repeat size={12} strokeWidth={2} aria-hidden="true" />;
}

function SoundGlyph() {
	return <VolumeHigh size={12} strokeWidth={2} aria-hidden="true" />;
}

function AspectGlyph() {
	return <AspectRatioSquare size={12} strokeWidth={2} aria-hidden="true" />;
}

function GuidesGlyph() {
	return <Crop size={11} strokeWidth={2} aria-hidden="true" />;
}

function BackGlyph() {
	return <ChevronLeft size={13} strokeWidth={2.2} aria-hidden="true" />;
}

function CloseGlyph() {
	return <X size={12} strokeWidth={2.2} aria-hidden="true" />;
}
