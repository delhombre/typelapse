import {
	type RenderToken,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "@/application/magic-move/engine";
import { buildTimeline, locate } from "@/application/magic-move/timeline";
import type { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * The magic-move engine, pointed at arbitrary frames.
 *
 * The Instrument wires the engine to one fixed demo; two of these hero
 * directions need it aimed somewhere else — at a diff turning into its result,
 * and at a command turning into the headline. Rather than fork the Instrument
 * twice, this is the wiring on its own: give it frames, get a loop.
 *
 * Proto-only. If a direction that uses it wins, this graduates into the landing
 * as the shared player it already is.
 */
export function EngineFrames({
	frames,
	holds,
	theme,
	language = "typescript",
	fontSize,
	lineHeightRatio = 1.6,
	padding = 0,
	lineNumbers = false,
	loop = true,
	className,
	ariaLabel,
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
	className?: string;
	ariaLabel: string;
}) {
	const reduce = useReducedMotion();
	const [view, setView] = useState<{
		tokens: RenderToken[];
		lineCount: number;
		lineNumberCount: number;
	} | null>(null);
	const [plan, setPlan] = useState<{
		plan: MagicMovePlan;
		timeline: ReturnType<typeof buildTimeline>;
	} | null>(null);
	const elapsedRef = useRef(0);

	// `frames` and `holds` are depended on by identity, which is why every caller
	// passes module constants: an array literal in JSX would rebuild the plan on
	// every render, and the loop would never leave its first frame.
	useEffect(() => {
		let cancelled = false;
		const codes = loop ? [...frames, frames[0] ?? ""] : frames;
		shikiAdapter
			.getRawHighlighter()
			.then((h) => {
				if (cancelled) {
					return;
				}
				const built = buildMagicMovePlan(h, codes, language, theme.name, false);
				const timeline = buildTimeline(holds);
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
	}, [frames, holds, theme.name, language, loop, reduce]);

	useEffect(() => {
		if (!plan) {
			return;
		}
		const { plan: built, timeline } = plan;

		const resolve = (pos: ReturnType<typeof locate>) => {
			if (pos.phase === "transition") {
				const t = built.transitions[pos.index];
				const from = built.frames[pos.index];
				const to = built.frames[pos.index + 1];
				if (t && from && to) {
					const eased = easeInOutCubic(pos.t);
					return {
						tokens: renderTransition(t.from, t.to, pos.t),
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
				tokens: renderStatic(frame.tokens),
				lineCount: frame.lineCount,
				lineNumberCount: frame.lineCount,
			};
		};

		if (reduce) {
			setView(resolve(locate(timeline, elapsedRef.current)));
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
	}, [plan, reduce]);

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
			<div className={className} style={{ ...sizing, minHeight: fontSize * lineHeightRatio }} />
		);
	}

	return (
		<div className={className} role="img" aria-label={ariaLabel} style={sizing}>
			<MagicMoveCanvas
				tokens={view.tokens}
				lineCount={view.lineCount}
				lineNumberCount={view.lineNumberCount}
				showLineNumbers={lineNumbers}
				fontSize={fontSize}
				lineHeightRatio={lineHeightRatio}
				fontFamily={theme.fontFamily}
				color={theme.foreground}
				lineNumberColor={`${theme.foreground}26`}
				padding={padding}
			/>
		</div>
	);
}
