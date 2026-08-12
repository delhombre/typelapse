import {
	PLATFORM_LABELS,
	type SocialPlatform,
	platformsForAspect,
} from "@/application/social/safe-zones";
import { trigger } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	resolveSocialPlatform,
	useSocialPreviewStore,
} from "@/presentation/stores/social-preview.store";
import {
	playbackFill,
	showsDots,
	stepCounter,
	stepDotLabel,
	transportFace,
	transportLabel,
} from "@/presentation/utils/playback-readout";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The island's own horizontal padding, which the measured row does not include. */
const ISLAND_PADDING = 12;

/**
 * The studio's control island: one dark plate under the preview holding the
 * transport, the progress track, the step dots, the counter and the social
 * preview.
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
 */
export function PreviewIsland() {
	const snippet = useSnippetStore((s) => s.snippet);
	const isPlaying = useSnippetStore((s) => s.isPlaying);
	const isPreparing = useSnippetStore((s) => s.isPreparing);
	const currentStepIndex = useSnippetStore((s) => s.currentStepIndex);
	const playbackProgress = useSnippetStore((s) => s.playbackProgress);
	const play = useSnippetStore((s) => s.play);
	const pause = useSnippetStore((s) => s.pause);
	const setCurrentStepIndex = useSnippetStore((s) => s.setCurrentStepIndex);

	const width = useExportStore((s) => s.width);
	const height = useExportStore((s) => s.height);
	const enabled = useSocialPreviewStore((s) => s.enabled);
	const platform = useSocialPreviewStore((s) => s.platform);
	const showGuides = useSocialPreviewStore((s) => s.showGuides);
	const setEnabled = useSocialPreviewStore((s) => s.setEnabled);
	const setPlatform = useSocialPreviewStore((s) => s.setPlatform);
	const setShowGuides = useSocialPreviewStore((s) => s.setShowGuides);

	const reduce = useReducedMotion() === true;
	const [panel, setPanel] = useState<"social" | null>(null);

	const platforms = useMemo(() => platformsForAspect(width, height), [width, height]);
	const totalSteps = snippet.steps.length;
	const hasTransport = totalSteps >= 2;

	// Keep the stored platform valid for the current aspect, so the picker
	// highlights (and the overlay shows) a platform that uses this aspect. Runs
	// on enable and whenever the aspect changes underneath an open panel.
	useEffect(() => {
		if (!enabled || platforms.length === 0) {
			return;
		}
		const first = platforms[0];
		if (first && !platforms.includes(platform)) {
			setPlatform(first);
		}
	}, [enabled, platforms, platform, setPlatform]);

	/**
	 * Opening the panel replaces the whole row, so the button that was pressed
	 * stops existing and focus falls to the body. Each direction therefore hands
	 * focus to the control that undoes the move: opening lands on Back, closing
	 * lands on the opener. Both ride the incoming row's mount, since `mode="wait"`
	 * holds it until the outgoing row has finished leaving and the moment of the
	 * press is too early to focus anything.
	 *
	 * Only keyboard dismissal restores. A press outside is already a statement
	 * about where the hand wants to be, and pulling focus back would undo it.
	 */
	const restoreFocus = useRef(false);
	const dockRef = useRef<HTMLDivElement>(null);

	const closePanel = useCallback((restore: boolean) => {
		restoreFocus.current = restore;
		setPanel(null);
	}, []);

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

	const mountRootRow = useCallback(
		(node: HTMLDivElement | null) => {
			measureRow(node);
			const restore = restoreFocus.current;
			restoreFocus.current = false;
			if (node && restore) {
				node.querySelector<HTMLElement>("[data-island-opener]")?.focus({ preventScroll: true });
			}
		},
		[measureRow],
	);

	const mountPanelRow = useCallback(
		(node: HTMLDivElement | null) => {
			measureRow(node);
			node?.querySelector<HTMLElement>("[data-island-back]")?.focus({ preventScroll: true });
		},
		[measureRow],
	);

	/**
	 * A panel is a mode, and a mode needs both of its exits: Escape for the
	 * keyboard, a press anywhere else for the pointer. pointerdown rather than
	 * click, so the panel is gone by the time the press resolves, the same beat a
	 * native menu dismisses on.
	 */
	useEffect(() => {
		if (panel === null) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closePanel(true);
			}
		};
		const onPointerDown = (event: PointerEvent) => {
			const dock = dockRef.current;
			if (dock && !event.composedPath().includes(dock)) {
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
	const fill = playbackFill({ isPlaying, playbackProgress, currentStepIndex, totalSteps });
	const dots = showsDots(totalSteps);
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

	return (
		<div className="si-dock" ref={dockRef}>
			<motion.div
				className="si-island"
				role="toolbar"
				aria-label="Preview controls"
				initial={false}
				animate={rowWidth === null ? undefined : { width: rowWidth + ISLAND_PADDING }}
				transition={reduce ? { duration: 0 } : springs.default}
			>
				<AnimatePresence mode="wait" initial={false}>
					{panel === null ? (
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
										<div className="si-fill" style={{ width: `${fill * 100}%` }} />
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
								</>
							)}

							<button
								type="button"
								onClick={() => setPanel("social")}
								data-island-opener=""
								aria-label={`Social preview: ${enabled ? "on" : "off"}. Open social preview controls`}
								className="si-button"
								{...(enabled ? { "data-active": "" } : {})}
							>
								<FeedGlyph />
								<span className="si-label">Social</span>
							</button>
						</motion.div>
					) : (
						<motion.div key="social" ref={mountPanelRow} className="si-row" {...rowMotion(reduce)}>
							<button
								type="button"
								onClick={() => closePanel(true)}
								data-island-back=""
								aria-label="Back to playback controls"
								className="si-button"
							>
								<BackGlyph />
							</button>

							{platforms.length === 0 ? (
								<span className="si-hint">Set a 9:16, 1:1 or 4:5 ratio</span>
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
					)}
				</AnimatePresence>
			</motion.div>
		</div>
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
 * The row's entrance and exit. Both are springs from the shared tokens: the
 * arrival overshoots its scale so the row reads as an object finding its place,
 * and the departure is only asked to stop being in the way, which is why it is
 * the snappier of the two.
 */
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
		exit: { opacity: 0, scale: 0.99 },
		transition: springs.snappy,
	};
}

function TransportGlyph({ face }: { face: "preparing" | "pause" | "play" }): ReactNode {
	if (face === "preparing") {
		return <SpinnerGlyph />;
	}
	return face === "pause" ? <PauseGlyph /> : <PlayGlyph />;
}

function PlayGlyph() {
	// A centred triangle reads left-heavy; 1px right puts it optically centred.
	return (
		<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<path d="M4 2v12l10-6z" style={{ transform: "translateX(1px)" }} />
		</svg>
	);
}

function PauseGlyph() {
	return (
		<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<rect x="3" y="2" width="3.5" height="12" rx="0.75" />
			<rect x="9.5" y="2" width="3.5" height="12" rx="0.75" />
		</svg>
	);
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

function FeedGlyph() {
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
			<rect x="6" y="2.5" width="12" height="19" rx="2.5" />
			<line x1="10" y1="18.5" x2="14" y2="18.5" strokeLinecap="round" />
		</svg>
	);
}

function GuidesGlyph() {
	return (
		<svg
			width="11"
			height="11"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeDasharray="3 3"
			aria-hidden="true"
		>
			<rect x="3" y="3" width="18" height="18" rx="3" />
		</svg>
	);
}

function BackGlyph() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M14.5 5.5 8 12l6.5 6.5" />
		</svg>
	);
}
