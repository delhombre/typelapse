import { FRAME_SECONDARY_ALPHA_HEX } from "@/application/layout/frame-metrics";
import {
	type RenderToken,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "@/application/magic-move/engine";
import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { renderTyping, typedCharCount } from "@/application/magic-move/typewriter";
import type { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { useInViewPlayback } from "@/presentation/hooks/use-in-view-playback";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const EMPTY_FOCUS_SETS: (Set<number> | undefined)[] = [];

/**
 * The magic-move engine, pointed at arbitrary frames: give it code, get a loop.
 *
 * The Instrument wires the same engine to one fixed demo inside a mesh frame and
 * a dock. Sections further down the page want the morph without any of that
 * apparatus, which is what this is — the wiring on its own, painting into
 * whatever box it is given.
 *
 * It is the browser half of the engine the Remotion composition runs, so a
 * section built on it shows the real output rather than an illustration of one.
 */
export function LoopingFrames({
	frames,
	holds,
	theme,
	language = "typescript",
	fontSize,
	lineHeightRatio = 1.6,
	padding = 0,
	lineNumbers = false,
	loop = true,
	playing = true,
	transitionMs,
	typewriter = false,
	focusSets = EMPTY_FOCUS_SETS,
	className,
	ariaLabel,
	ariaHidden = false,
}: {
	frames: string[];
	holds: number[];
	theme: Theme;
	language?: string;
	fontSize: number;
	lineHeightRatio?: number;
	padding?: number;
	/** Line numbers belong on a code frame and never on a headline. */
	lineNumbers?: boolean;
	/** Appends the first frame so the last morph returns instead of cutting. */
	loop?: boolean;
	/**
	 * Keep a calm final-frame poster until the surrounding surface asks for motion.
	 * Showcase cards use this to replay only on hover/focus instead of running six
	 * competing animation loops as soon as the sheet opens.
	 */
	playing?: boolean;
	/** Use the project's own morph cadence when this component previews a project. */
	transitionMs?: number;
	/** Reveal the first frame with the same pure typewriter engine as the export. */
	typewriter?: boolean;
	/** Optional per-frame focus masks, using the same one-based line sets as the studio. */
	focusSets?: (Set<number> | undefined)[];
	className?: string;
	ariaLabel?: string;
	/** The surrounding artwork owns the accessible description. */
	ariaHidden?: boolean;
}) {
	const reduce = useReducedMotion();
	const [view, setView] = useState<{
		tokens: RenderToken[];
		lineCount: number;
		lineNumberCount: number;
		cursor?: { line: number; col: number } | null;
	} | null>(null);
	const [plan, setPlan] = useState<{
		plan: MagicMovePlan;
		timeline: ReturnType<typeof buildTimeline>;
	} | null>(null);
	const elapsedRef = useRef(0);
	const wasPlayingRef = useRef(playing);
	// Two of these run below the fold on the landing page. Each is a persistent
	// rAF loop pushing token state through React, so each one left running while
	// the visitor is elsewhere is measurable jank somewhere else on the page.
	const { ref: observeFrame, inView } = useInViewPlayback<HTMLDivElement>();

	// `frames` and `holds` are depended on by identity, which is why every caller
	// passes module constants: an array literal in JSX would rebuild the plan on
	// every render, and the loop would never leave its first frame.
	useEffect(() => {
		let cancelled = false;
		const codes = loop ? [...frames, frames[0] ?? ""] : frames;
		// The language is loaded before the plan is built: the keyer tokenizes off
		// the raw highlighter, which only ever has the four boot languages unless
		// someone asks for more.
		Promise.all([shikiAdapter.getRawHighlighter(), shikiAdapter.loadLanguage(language)])
			.then(([h]) => {
				if (cancelled) {
					return;
				}
				const built = buildMagicMovePlan(h, codes, language, theme.name, theme.background, false);
				const timeline = buildTimeline(holds, transitionMs);
				// Reduced motion rests on the final frame rather than looping.
				if (reduce) {
					const hold = timeline.segments.find(
						(s) => s.type === "hold" && s.index === frames.length - 1,
					);
					if (hold) {
						elapsedRef.current = hold.startMs + (hold.endMs - hold.startMs) / 2;
					}
				}
				setPlan({ plan: built, timeline });
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [frames, holds, theme.name, theme.background, language, loop, reduce, transitionMs]);

	useEffect(() => {
		if (!plan) {
			return;
		}
		const { plan: built, timeline } = plan;
		const focusAt = (index: number): Set<number> | undefined => {
			if (loop && index === frames.length) {
				return focusSets[0];
			}
			return focusSets[index];
		};

		const resolve = (pos: ReturnType<typeof locate>) => {
			if (typewriter && pos.phase === "hold" && pos.index === 0 && built.typing) {
				const firstCode = frames[0] ?? "";
				const reveal = typedCharCount(firstCode.length, pos.t);
				const { tokens, cursor } = renderTyping(firstCode, built.typing, reveal);
				const lineCount = built.frames[0]?.lineCount ?? 1;
				return { tokens, lineCount, lineNumberCount: lineCount, cursor };
			}
			if (pos.phase === "transition") {
				const t = built.transitions[pos.index];
				const from = built.frames[pos.index];
				const to = built.frames[pos.index + 1];
				if (t && from && to) {
					const eased = easeInOutCubic(pos.t);
					return {
						tokens: renderTransition(
							t.from,
							t.to,
							pos.t,
							{},
							focusAt(pos.index),
							focusAt(pos.index + 1),
						),
						lineCount: from.lineCount + (to.lineCount - from.lineCount) * eased,
						lineNumberCount: Math.max(from.lineCount, to.lineCount),
					};
				}
			}
			const frame = built.frames[pos.index] ?? built.frames[0];
			if (!frame) {
				return { tokens: [], lineCount: 1, lineNumberCount: 1 };
			}
			return {
				tokens: renderStatic(frame.tokens, focusAt(pos.index)),
				lineCount: frame.lineCount,
				lineNumberCount: frame.lineCount,
			};
		};

		const finalHold = timeline.segments.find(
			(segment) => segment.type === "hold" && segment.index === frames.length - 1,
		);
		const posterTime = finalHold
			? finalHold.startMs + (finalHold.endMs - finalHold.startMs) / 2
			: 0;

		if (reduce || !playing) {
			elapsedRef.current = posterTime;
			setView(resolve(locate(timeline, posterTime)));
			wasPlayingRef.current = playing;
			return;
		}

		// A poster becoming active should replay from its first beat. Carrying the
		// final poster's timestamp into the loop makes the first hover appear to do
		// nothing before it wraps, which reads as a broken affordance.
		if (!wasPlayingRef.current) {
			elapsedRef.current = 0;
		}
		wasPlayingRef.current = true;

		// Off screen: hold the last painted frame. `elapsedRef` keeps the clock and
		// `last` is re-read on resume, so the morph continues from where it stopped
		// instead of jumping by the time spent away.
		if (!inView) {
			return;
		}

		let raf = 0;
		let cancelled = false;
		let last = performance.now();
		let lastSig = "";
		const tick = (now: number) => {
			if (cancelled) {
				return;
			}
			const dt = now - last;
			last = now;
			elapsedRef.current = (elapsedRef.current + dt) % timeline.totalMs;
			const pos = locate(timeline, elapsedRef.current);
			const sig = `${pos.phase}:${pos.index}:${pos.phase === "transition" ? Math.round(pos.t * 60) : 0}`;
			if (sig !== lastSig) {
				lastSig = sig;
				setView(resolve(pos));
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [plan, reduce, inView, playing, frames, typewriter, focusSets, loop]);

	// The canvas positions every token absolutely on a `ch` grid, so its wrapper
	// has no intrinsic width and any attempt to centre it centres a 57px box. The
	// width is therefore stated: the longest line across all frames, plus the
	// gutter's own columns when it is shown.
	const maxCols = frames.reduce(
		(n, frame) => Math.max(n, ...frame.split("\n").map((line) => line.length)),
		0,
	);
	// `ch` resolves against the element's own font, so the wrapper has to carry
	// the canvas's font size and family — inheriting the page's 16px made the
	// stated width far too small and the card clipped every long line.
	const sizing = {
		width: `${maxCols + (lineNumbers ? 5 : 1)}ch`,
		fontSize,
		fontFamily: theme.fontFamily,
	};

	if (!view) {
		return (
			<div
				ref={observeFrame}
				className={className}
				aria-hidden={ariaHidden ? true : undefined}
				style={{ ...sizing, minHeight: fontSize * lineHeightRatio }}
			/>
		);
	}

	return (
		<div
			ref={observeFrame}
			className={className}
			role={!ariaHidden && ariaLabel ? "img" : undefined}
			aria-label={!ariaHidden ? ariaLabel : undefined}
			aria-hidden={ariaHidden ? true : undefined}
			data-looping-ready=""
			style={sizing}
		>
			<MagicMoveCanvas
				tokens={view.tokens}
				lineCount={view.lineCount}
				lineNumberCount={view.lineNumberCount}
				showLineNumbers={lineNumbers}
				fontSize={fontSize}
				lineHeightRatio={lineHeightRatio}
				fontFamily={theme.fontFamily}
				color={theme.foreground}
				lineNumberColor={`${theme.foreground}${FRAME_SECONDARY_ALPHA_HEX}`}
				padding={padding}
				cursor={view.cursor}
			/>
		</div>
	);
}
