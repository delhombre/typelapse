import {
	LOUPE_REST,
	type LoupeBounds,
	type LoupePoint,
	type LoupeRect,
	type LoupeView,
	isLoupeArrow,
	loupeBounds,
	loupeScale,
	loupeViewport,
	nudgeLoupe,
	openLoupe,
	pulledToClose,
	releaseLoupe,
	rubberBand,
} from "@/application/layout/code-loupe";
import { ISLAND_SPRING } from "@/presentation/components/controls/island-motion";
import type { PhoneViewport } from "@/presentation/hooks/use-phone-viewport";
import {
	type AnimationPlaybackControls,
	type MotionValue,
	animate,
	motion,
	useMotionTemplate,
	useMotionValue,
	useReducedMotion,
} from "motion/react";
import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

/** A press that travels further than this is a pan, not a tap. */
const TAP_SLOP = 6;
/** The finger's speed is read over its last tenth of a second. */
const VELOCITY_WINDOW_MS = 100;
/** Reduced motion swaps the picture at once and fades it in, over this long. */
const REDUCED_FADE = { duration: 0.16, ease: [0.23, 1, 0.32, 1] } as const;

/** Shut: nothing applied. Open: the picture fills the screen. Closing: on its way back. */
type Phase = "shut" | "open" | "closing";

/** What the loupe reads off the page while it is shut, where the picture lies where it is drawn. */
interface RestPicture {
	frame: LoupeRect;
	radius: number;
	window: LoupeRect;
	codePx: number;
	/** The lens box's top-left corner on the screen: its transform pivots on the screen's origin. */
	origin: LoupePoint;
}

interface Press {
	id: number;
	start: LoupePoint;
	from: LoupePoint;
	panning: boolean;
	raw: LoupePoint;
	samples: { x: number; y: number; t: number }[];
}

const rectOf = (element: Element): LoupeRect => {
	const box = element.getBoundingClientRect();
	return { x: box.left, y: box.top, width: box.width, height: box.height };
};

/**
 * The picture as drawn at rest: the frame, its code window, and the code's
 * effective size. The size is the code's own font size times every scale its
 * ancestors draw it at (the box's drawn width over its laid-out width), so it
 * is what the eye gets, whatever the fit and the focus zoom came to.
 */
function readPicture(stage: HTMLElement, lens: HTMLElement): RestPicture | null {
	const frame = stage.querySelector("[data-preview-frame], [data-export-target]");
	if (!frame) return null;
	const window = frame.querySelector(".code-frame-glow") ?? frame;
	const code = frame.querySelector<HTMLElement>("[data-code-canvas]");
	const drawn = code?.getBoundingClientRect().width ?? 0;
	const codePx =
		code && code.offsetWidth > 0
			? Number.parseFloat(getComputedStyle(code).fontSize) * (drawn / code.offsetWidth)
			: 0;
	const lensBox = lens.getBoundingClientRect();
	return {
		frame: rectOf(frame),
		radius: Number.parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0,
		window: rectOf(window),
		// No code on the stage (an image scene): the loupe still magnifies a quarter.
		codePx: codePx > 0 ? codePx : Number.POSITIVE_INFINITY,
		origin: { x: lensBox.left, y: lensBox.top },
	};
}

/** A tap opens the loupe only on the picture, never on a control drawn over it. */
function tapsThePicture(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (!target.closest("[data-preview-frame], [data-export-target]")) return false;
	return !target.closest("button, [role='button'], a, input, textarea, select");
}

/** A scene being reordered or the sheet under a finger: a press on the frame is part of that. */
function somethingIsDragged(): boolean {
	return document.querySelector(".sc-sheet.vaul-dragging, .sc-scene-row[data-dragging]") !== null;
}

function stopAll(values: MotionValue<number>[]) {
	for (const value of values) value.stop();
}

interface CodeLoupeProps {
	/** The screen and its safe areas, as the shell reads them. */
	viewport: PhoneViewport;
	/** The sheet's share of the slot's foot (phone-sheet.ts). */
	stageBottom: number;
	stageRef: RefObject<HTMLDivElement | null>;
	/** False while an island panel is open: the panel's room is measured off the frame. */
	enabled: boolean;
	/** Open (or opening): the shell hides and disables its chrome. */
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

/**
 * The phone's loupe (design audit 2026-10-08, D5; the arithmetic is
 * application/layout/code-loupe.ts).
 *
 * It owns the stage's slot. Shut, it is the slot and nothing else. A tap on the
 * frame grows the slot's clip from the frame to the screen and scales the
 * preview inside it until the code reaches the floor, about the tapped line;
 * one finger pans it, a tap, a pull down past the top, Done or Escape put it
 * back. The preview is the live one, scaled by a transform: it keeps playing,
 * and it is the same DOM picture the video is rendered from, never a copy.
 *
 * Only `transform` and `clip-path` move, on one spring per value (the island's,
 * critically damped); under reduced motion the swap is instant and fades.
 */
export function CodeLoupe({
	viewport,
	stageBottom,
	stageRef,
	enabled,
	onOpenChange,
	children,
}: CodeLoupeProps) {
	const reduce = useReducedMotion() ?? false;
	const [phase, setPhase] = useState<Phase>("shut");
	const phaseRef = useRef<Phase>("shut");
	const lensRef = useRef<HTMLDivElement>(null);
	const targetRef = useRef<HTMLButtonElement>(null);
	const picture = useRef<RestPicture | null>(null);
	const press = useRef<Press | null>(null);
	const flight = useRef<AnimationPlaybackControls[]>([]);

	// The picture's view, and the clip's four insets and radius, one spring each.
	const scale = useMotionValue(1);
	const x = useMotionValue(0);
	const y = useMotionValue(0);
	const top = useMotionValue(0);
	const right = useMotionValue(0);
	const bottom = useMotionValue(0);
	const left = useMotionValue(0);
	const radius = useMotionValue(0);
	const fade = useMotionValue(1);
	const clipPath = useMotionTemplate`inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;

	const go = useCallback((next: Phase) => {
		phaseRef.current = next;
		setPhase(next);
	}, []);

	useEffect(() => onOpenChange(phase === "open"), [phase, onOpenChange]);

	const view = (): LoupeView => ({ scale: scale.get(), x: x.get(), y: y.get() });
	const viewRect = useCallback(
		() =>
			loupeViewport({
				width: viewport.viewportWidth,
				height: viewport.viewportHeight,
				safeTop: viewport.safeTop,
				safeBottom: viewport.safeBottom,
			}),
		[viewport],
	);
	const bounds = (at: number): LoupeBounds | null =>
		picture.current ? loupeBounds(at, viewRect(), picture.current.window) : null;
	/** The scale the open loupe lands on: what a release and an arrow key are bounded by. */
	const openScale = () => (picture.current ? loupeScale(picture.current.codePx) : 1);

	/** The clip around the frame at rest, as insets from the screen's edges. */
	const restClip = (shown: RestPicture) => ({
		top: shown.frame.y,
		right: viewport.viewportWidth - shown.frame.x - shown.frame.width,
		bottom: viewport.viewportHeight - shown.frame.y - shown.frame.height,
		left: shown.frame.x,
		radius: shown.radius,
	});

	/** Every value to its target: on the island's spring, or at once under reduced motion. */
	const settle = (
		targets: [MotionValue<number>, number][],
		velocity: Map<MotionValue<number>, number> = new Map(),
	): Promise<unknown> => {
		for (const controls of flight.current) controls.stop();
		if (reduce) {
			for (const [value, target] of targets) value.jump(target);
			fade.jump(0);
			flight.current = [animate(fade, 1, REDUCED_FADE)];
			return Promise.resolve();
		}
		flight.current = targets.map(([value, target]) =>
			animate(value, target, {
				...ISLAND_SPRING,
				velocity: velocity.get(value) ?? value.getVelocity(),
			}),
		);
		return Promise.all(flight.current);
	};

	const open = (tap?: LoupePoint) => {
		const stage = stageRef.current;
		const lens = lensRef.current;
		if (!stage || !lens) return;
		// The picture is read with the loupe shut, where the page draws it at rest; a
		// loupe caught while closing keeps the reading it opened with.
		if (phaseRef.current === "shut") {
			const shown = readPicture(stage, lens);
			if (!shown) return;
			picture.current = shown;
			lens.style.transformOrigin = `${-shown.origin.x}px ${-shown.origin.y}px`;
			const clip = restClip(shown);
			top.jump(clip.top);
			right.jump(clip.right);
			bottom.jump(clip.bottom);
			left.jump(clip.left);
			radius.jump(clip.radius);
		}
		const shown = picture.current;
		if (!shown) return;
		const target = openLoupe({
			scale: openScale(),
			viewport: viewRect(),
			window: shown.window,
			tap,
			from: phaseRef.current === "shut" ? LOUPE_REST : view(),
		});
		go("open");
		void settle([
			[scale, target.scale],
			[x, target.x],
			[y, target.y],
			[top, 0],
			[right, 0],
			[bottom, 0],
			[left, 0],
			[radius, 0],
		]);
	};

	const close = () => {
		const shown = picture.current;
		if (phaseRef.current !== "open" || !shown) return;
		go("closing");
		targetRef.current?.focus({ preventScroll: true });
		const clip = restClip(shown);
		void settle([
			[scale, 1],
			[x, 0],
			[y, 0],
			[top, clip.top],
			[right, clip.right],
			[bottom, clip.bottom],
			[left, clip.left],
			[radius, clip.radius],
		]).then(() => {
			if (phaseRef.current === "closing") go("shut");
		});
	};
	const closeRef = useRef(close);
	closeRef.current = close;

	// A rotation or a panel opening changes what the rest picture was: the loupe
	// puts the picture back at once rather than land somewhere it no longer is.
	// biome-ignore lint/correctness/useExhaustiveDependencies: a change of viewport or of enabled is the trigger
	useEffect(() => {
		if (phaseRef.current === "shut") return;
		for (const controls of flight.current) controls.stop();
		for (const value of [scale, x, y]) value.jump(value === scale ? 1 : 0);
		fade.jump(1);
		go("shut");
	}, [viewport, enabled]);

	// Escape closes from anywhere while open: the Done chip has focus as often as the frame.
	useEffect(() => {
		if (phase !== "open") return;
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [phase]);

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		// A second finger while the loupe is open is not a second pan.
		if (press.current && phaseRef.current !== "shut") return;
		const current = phaseRef.current;
		if (current === "shut") {
			if (!enabled || !tapsThePicture(event.target) || somethingIsDragged()) return;
		} else {
			// Open or on its way back: the loupe owns every press on the screen. Open, the
			// finger takes the picture where it is; the scale still lands on the floor.
			event.currentTarget.setPointerCapture(event.pointerId);
			if (current === "open") stopAll([x, y]);
		}
		const point = { x: event.clientX, y: event.clientY };
		press.current = {
			id: event.pointerId,
			start: point,
			from: { x: x.get(), y: y.get() },
			panning: false,
			raw: { x: x.get(), y: y.get() },
			samples: [{ ...point, t: event.timeStamp }],
		};
	};

	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const held = press.current;
		if (!held || held.id !== event.pointerId) return;
		const dx = event.clientX - held.start.x;
		const dy = event.clientY - held.start.y;
		if (!held.panning) {
			if (Math.hypot(dx, dy) <= TAP_SLOP) return;
			// Shut, a drag on the frame is not the loupe's; closing, only a tap catches it.
			if (phaseRef.current !== "open") {
				press.current = null;
				return;
			}
			held.panning = true;
		}
		const limits = bounds(scale.get());
		if (!limits) return;
		const area = viewRect();
		held.raw = { x: held.from.x + dx, y: held.from.y + dy };
		x.set(rubberBand(held.raw.x, limits.minX, limits.maxX, area.width));
		y.set(rubberBand(held.raw.y, limits.minY, limits.maxY, area.height));
		held.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
		if (held.samples.length > 8) held.samples.shift();
	};

	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		const held = press.current;
		if (!held || held.id !== event.pointerId) return;
		press.current = null;
		const current = phaseRef.current;
		if (!held.panning) {
			if (event.type !== "pointerup") return;
			if (current === "open") close();
			else open({ x: event.clientX, y: event.clientY });
			return;
		}
		const limits = bounds(openScale());
		if (!limits) return;
		if (pulledToClose(held.raw.y, limits)) {
			close();
			return;
		}
		const recent = held.samples.filter((sample) => event.timeStamp - sample.t < VELOCITY_WINDOW_MS);
		let velocity = { x: 0, y: 0 };
		const first = recent[0];
		const last = recent[recent.length - 1];
		if (first && last && recent.length > 1) {
			const seconds = Math.max(16, last.t - first.t) / 1000;
			velocity = { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
		}
		const rest = releaseLoupe({ x: x.get(), y: y.get() }, velocity, limits);
		void settle(
			[
				[x, rest.x],
				[y, rest.y],
			],
			new Map([
				[x, velocity.x],
				[y, velocity.y],
			]),
		);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		// A keyboard move is one-to-one and instant (DECISIONS D8).
		if (phaseRef.current === "open" && isLoupeArrow(event.key)) {
			const limits = bounds(openScale());
			if (!limits) return;
			event.preventDefault();
			stopAll([x, y]);
			const next = nudgeLoupe(view(), event.key, limits);
			x.jump(next.x);
			y.jump(next.y);
		}
	};

	const shown = phase !== "shut";
	return (
		<>
			<motion.div
				className="sc-stage-slot"
				data-loupe={shown ? phase : undefined}
				style={{
					paddingBottom: stageBottom,
					clipPath: shown ? clipPath : undefined,
					opacity: fade,
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				// The tap that closed the loupe gave focus back to the frame; the mouse
				// events a browser sends after a touch would take it away again.
				onMouseDown={(event) => {
					if (phaseRef.current !== "shut") event.preventDefault();
				}}
			>
				<div className="sc-loupe-backdrop" aria-hidden="true" />
				<div className="sc-stage" ref={stageRef}>
					<motion.div ref={lensRef} className="sc-loupe-lens" style={{ x, y, scale }}>
						{children}
					</motion.div>
					{/* The keyboard's way in. The frame holds controls of its own (an image
					    layer is a button), so it cannot be one; this sits over it, lets every
					    pointer through, and is where focus comes back to. */}
					<button
						ref={targetRef}
						type="button"
						className="sc-loupe-target"
						aria-label={phase === "open" ? "Close the magnified code" : "Magnify the code"}
						aria-expanded={phase === "open"}
						disabled={!enabled && phase === "shut"}
						onKeyDown={onKeyDown}
						// Enter, Space or a screen reader's activation: every pointer goes
						// through this button to the slot's own handlers.
						onClick={() => {
							if (phaseRef.current === "open") close();
							else if (enabled) open();
						}}
					/>
				</div>
			</motion.div>
			{/* Above the chrome the loupe hides, beside the slot rather than in its clip. */}
			<button
				type="button"
				className="sc-loupe-done"
				data-shown={phase === "open" ? "" : undefined}
				inert={phase !== "open"}
				onClick={close}
			>
				Done
			</button>
		</>
	);
}
