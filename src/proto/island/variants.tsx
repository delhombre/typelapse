import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { AspectGlyph, BackGlyph, BackdropGlyph, PauseGlyph, PlayGlyph, ThemeGlyph } from "./icons";

const BACKDROPS = [
	{ id: "aurora", label: "Aurora", from: "#6d28d9", to: "#1e3a8a" },
	{ id: "nebula", label: "Nebula", from: "#be185d", to: "#4c1d95" },
	{ id: "ocean", label: "Ocean", from: "#0891b2", to: "#1e3a8a" },
	{ id: "ember", label: "Ember", from: "#ea580c", to: "#7c2d12" },
	{ id: "forest", label: "Forest", from: "#15803d", to: "#064e3b" },
];

const THEMES = [
	{ id: "aurora", label: "Aurora", bg: "#1a1b2e", a: "#c4b5fd", b: "#6ee7b7" },
	{ id: "midnight", label: "Midnight", bg: "#0d1117", a: "#79c0ff", b: "#7ee787" },
	{ id: "frost", label: "Frost", bg: "#f0f4f8", a: "#2563eb", b: "#047857" },
	{ id: "dracula", label: "Dracula", bg: "#282a36", a: "#ff79c6", b: "#50fa7b" },
	{ id: "nord", label: "Nord", bg: "#2e3440", a: "#88c0d0", b: "#a3be8c" },
];

const ASPECTS = ["16:9", "1:1", "9:16"];

/**
 * Every number here was sampled off an external reference frame by frame, not guessed.
 *
 * WIDTH: their island runs 348 → 322.4 → 324 over ~480ms, so it undershoots by
 * ~1.6px on a 24px move and settles back: a spring with bounce left in it.
 *
 * ROW: the incoming row does not fade. Its first frame is already at opacity
 * 0.99 and the work is done by a scale that overshoots (0.996 → 1.0068 → 1).
 * The outgoing row is the dramatic half: opacity to 0, blur to 4px, scale to
 * 1.20 in ~156ms.
 */
const WIDTH_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 1 } as const;

/**
 * The aspect frame's morph. `restDelta` is the point here: without it the
 * spring keeps writing imperceptible sub-pixel values for seconds — a Lapse
 * take measured one morph running 2666ms, which keeps the compositor awake
 * long after the movement is over.
 */
const FRAME_SPRING = {
	type: "spring",
	stiffness: 420,
	damping: 30,
	mass: 0.7,
	restDelta: 0.004,
	restSpeed: 0.01,
} as const;
const EASE = [0.23, 1, 0.32, 1] as const;

const ROW_MOTION = {
	initial: { opacity: 0.99, scale: 0.996, filter: "blur(0.4px)" },
	animate: { opacity: 1, scale: [0.996, 1.0068, 1] as number[], filter: "blur(0px)" },
	exit: { opacity: 0, scale: 1.2, filter: "blur(4px)" },
	transition: { duration: 0.32, ease: EASE as [number, number, number, number] },
};

/** The swatch under a control cross-fades rather than cutting to the new value. */
const VALUE_FADE = {
	initial: { opacity: 0 },
	animate: { opacity: 1 },
	exit: { opacity: 0 },
	transition: { duration: 0.22, ease: EASE as [number, number, number, number] },
};

/** Shared state so flipping between directions compares like with like. */
function useIslandState() {
	const [playing, setPlaying] = useState(true);
	const [backdrop, setBackdrop] = useState(BACKDROPS[0]);
	const [theme, setTheme] = useState(THEMES[0]);
	const [aspect, setAspect] = useState(ASPECTS[0]);
	const [open, setOpen] = useState<null | "backdrop" | "theme">(null);

	const cycleAspect = () =>
		setAspect((a) => ASPECTS[(ASPECTS.indexOf(a ?? "16:9") + 1) % ASPECTS.length]);

	return {
		playing,
		setPlaying,
		backdrop,
		setBackdrop,
		theme,
		setTheme,
		aspect,
		cycleAspect,
		open,
		setOpen,
	};
}

const Cta = () => (
	<a className="iproto-cta" href="#open">
		Open studio
	</a>
);

/**
 * A — Instrument. One drawn icon per control, 16px at 1.5 stroke, and colour
 * exactly once: on the backdrop dot, where the colour is the value itself.
 * Everything else recedes to a dim grey and lifts on hover.
 */
export function Instrument() {
	const s = useIslandState();
	return (
		<div className="iproto-dock">
			<div className="iproto-island" role="toolbar" aria-label="Preview controls">
				{s.open === null ? (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setPlaying(!s.playing)}
							aria-label={s.playing ? "Pause" : "Play"}
						>
							{s.playing ? <PauseGlyph /> : <PlayGlyph />}
						</button>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setOpen("backdrop")}
							aria-label={`Backdrop: ${s.backdrop?.label}. Open backdrop control`}
						>
							<BackdropGlyph />
							<span
								className="iproto-dot"
								style={{
									background: `linear-gradient(135deg, ${s.backdrop?.from}, ${s.backdrop?.to})`,
								}}
							/>
						</button>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setOpen("theme")}
							aria-label={`Theme: ${s.theme?.label}. Open theme control`}
						>
							<ThemeGlyph />
						</button>
						<button
							type="button"
							className="iproto-btn"
							onClick={s.cycleAspect}
							aria-label={`Cycle aspect ratio. ${s.aspect} active.`}
							data-on=""
						>
							<AspectGlyph />
							{s.aspect}
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setOpen(null)}
							aria-label="Back to controls"
						>
							<BackGlyph />
						</button>
						{s.open === "backdrop" &&
							BACKDROPS.map((b) => (
								<button
									key={b.id}
									type="button"
									className="iproto-btn"
									style={{ minWidth: 30, padding: 0 }}
									onClick={() => s.setBackdrop(b)}
									aria-label={`Backdrop ${b.label}`}
									{...(s.backdrop?.id === b.id ? { "data-on": "" } : {})}
								>
									<span
										className="iproto-dot"
										style={{
											background: `linear-gradient(135deg, ${b.from}, ${b.to})`,
											outline: s.backdrop?.id === b.id ? "2px solid #f2f2f4" : undefined,
											outlineOffset: 2,
										}}
									/>
								</button>
							))}
						{s.open === "theme" &&
							THEMES.map((t) => (
								<button
									key={t.id}
									type="button"
									className="iproto-btn"
									onClick={() => s.setTheme(t)}
									aria-label={`Theme ${t.label}`}
									{...(s.theme?.id === t.id ? { "data-on": "" } : {})}
								>
									{t.label}
								</button>
							))}
					</>
				)}
			</div>
			<Cta />
		</div>
	);
}

/**
 * B — Marks. No drawings at all. Short typographic marks, the way an external reference
 * uses ƒ and AF, so the island reads as an instrument panel and inherits the
 * hero's typographic voice instead of introducing a second one.
 */
export function Marks() {
	const s = useIslandState();
	return (
		<div className="iproto-dock">
			<div className="iproto-island" role="toolbar" aria-label="Preview controls">
				{s.open === null ? (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setPlaying(!s.playing)}
							aria-label={s.playing ? "Pause" : "Play"}
						>
							{s.playing ? <PauseGlyph /> : <PlayGlyph />}
						</button>
						<button
							type="button"
							className="iproto-btn iproto-mark"
							onClick={() => s.setOpen("backdrop")}
							aria-label={`Backdrop: ${s.backdrop?.label}. Open backdrop control`}
						>
							{s.backdrop?.label}
						</button>
						<button
							type="button"
							className="iproto-btn iproto-mark"
							onClick={() => s.setOpen("theme")}
							aria-label={`Theme: ${s.theme?.label}. Open theme control`}
						>
							{s.theme?.label}
						</button>
						<button
							type="button"
							className="iproto-btn"
							onClick={s.cycleAspect}
							aria-label={`Cycle aspect ratio. ${s.aspect} active.`}
							data-on=""
						>
							{s.aspect}
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setOpen(null)}
							aria-label="Back to controls"
						>
							<BackGlyph />
						</button>
						{(s.open === "backdrop" ? BACKDROPS : THEMES).map((item) => {
							const active =
								s.open === "backdrop" ? s.backdrop?.id === item.id : s.theme?.id === item.id;
							return (
								<button
									key={item.id}
									type="button"
									className="iproto-btn iproto-mark"
									onClick={() =>
										s.open === "backdrop"
											? s.setBackdrop(item as (typeof BACKDROPS)[number])
											: s.setTheme(item as (typeof THEMES)[number])
									}
									aria-label={item.label}
									{...(active ? { "data-on": "" } : {})}
								>
									{item.label}
								</button>
							);
						})}
					</>
				)}
			</div>
			<Cta />
		</div>
	);
}

/**
 * C — Specimen. Every control is a miniature of the thing it changes: the
 * backdrop shows its own gradient, the theme shows two lines in its own syntax
 * colours, the ratio shows a frame at its true proportion. No icon to decode,
 * because the control *is* a preview.
 */
export function Specimen() {
	const s = useIslandState();
	const frame = (ratio: string) => {
		const [w, h] = ratio.split(":").map(Number);
		const scale = 15 / Math.max(w ?? 1, h ?? 1);
		return { width: Math.round((w ?? 1) * scale), height: Math.round((h ?? 1) * scale) };
	};

	return (
		<div className="iproto-dock">
			<div className="iproto-island" role="toolbar" aria-label="Preview controls">
				{s.open === null ? (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setPlaying(!s.playing)}
							aria-label={s.playing ? "Pause" : "Play"}
						>
							{s.playing ? <PauseGlyph /> : <PlayGlyph />}
						</button>
						<button
							type="button"
							className="iproto-btn"
							style={{ minWidth: 30, padding: 0 }}
							onClick={() => s.setOpen("backdrop")}
							aria-label={`Backdrop: ${s.backdrop?.label}. Open backdrop control`}
						>
							<span
								className="iproto-spec"
								style={{
									width: 18,
									height: 15,
									background: `linear-gradient(135deg, ${s.backdrop?.from}, ${s.backdrop?.to})`,
								}}
							/>
						</button>
						<button
							type="button"
							className="iproto-btn"
							style={{ minWidth: 30, padding: 0 }}
							onClick={() => s.setOpen("theme")}
							aria-label={`Theme: ${s.theme?.label}. Open theme control`}
						>
							<span className="iproto-spec-theme" style={{ background: s.theme?.bg }}>
								<span
									className="iproto-spec-line"
									style={{ background: s.theme?.a, width: "100%" }}
								/>
								<span
									className="iproto-spec-line"
									style={{ background: s.theme?.b, width: "62%" }}
								/>
							</span>
						</button>
						<button
							type="button"
							className="iproto-btn"
							onClick={s.cycleAspect}
							aria-label={`Cycle aspect ratio. ${s.aspect} active.`}
							data-on=""
						>
							<span
								className="iproto-spec"
								style={{ ...frame(s.aspect ?? "16:9"), background: "rgb(255 255 255 / 0.14)" }}
							/>
							{s.aspect}
						</button>
					</>
				) : (
					<>
						<button
							type="button"
							className="iproto-btn"
							onClick={() => s.setOpen(null)}
							aria-label="Back to controls"
						>
							<BackGlyph />
						</button>
						{s.open === "backdrop" &&
							BACKDROPS.map((b) => (
								<button
									key={b.id}
									type="button"
									className="iproto-btn"
									style={{ minWidth: 30, padding: 0 }}
									onClick={() => s.setBackdrop(b)}
									aria-label={`Backdrop ${b.label}`}
									{...(s.backdrop?.id === b.id ? { "data-on": "" } : {})}
								>
									<span
										className="iproto-spec"
										style={{
											width: 18,
											height: 15,
											background: `linear-gradient(135deg, ${b.from}, ${b.to})`,
											outline: s.backdrop?.id === b.id ? "2px solid #f2f2f4" : undefined,
											outlineOffset: 2,
										}}
									/>
								</button>
							))}
						{s.open === "theme" &&
							THEMES.map((t) => (
								<button
									key={t.id}
									type="button"
									className="iproto-btn"
									style={{ minWidth: 30, padding: 0 }}
									onClick={() => s.setTheme(t)}
									aria-label={`Theme ${t.label}`}
									{...(s.theme?.id === t.id ? { "data-on": "" } : {})}
								>
									<span
										className="iproto-spec-theme"
										style={{
											background: t.bg,
											outline: s.theme?.id === t.id ? "2px solid #f2f2f4" : undefined,
											outlineOffset: 2,
										}}
									>
										<span className="iproto-spec-line" style={{ background: t.a, width: "100%" }} />
										<span className="iproto-spec-line" style={{ background: t.b, width: "62%" }} />
									</span>
								</button>
							))}
					</>
				)}
			</div>
			<Cta />
		</div>
	);
}

/**
 * D — Combined. The synthesis you asked for, and it has a rule of its own:
 * **a preview where the setting has an appearance, a drawn icon where it does
 * not.** Backdrop and theme show themselves, because their value *is* a look.
 * Play cannot be previewed, so it stays an icon. Aspect gets both — a frame
 * drawn at the true proportion, plus the number, because the shape alone is
 * ambiguous between 1:1 and 4:5 at 15px.
 *
 * The CTA moves inside the island: one object rather than two, so the whole
 * zone reads as a single instrument.
 */
export function Combined() {
	const s = useIslandState();

	// The island springs to a measured number, because `width: auto` cannot be
	// animated. A ref callback alone is not enough: it fires on mount, but
	// cycling the ratio changes the button's label (1:1 → 9:16) without
	// remounting the row, so the island kept the old width and `overflow:
	// hidden` clipped the CTA off the end. A ResizeObserver follows the content
	// instead of the mount.
	const [rowWidth, setRowWidth] = useState<number | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);
	const measureRow = useCallback((node: HTMLDivElement | null) => {
		observerRef.current?.disconnect();
		if (!node) {
			return;
		}
		setRowWidth(node.scrollWidth);
		const observer = new ResizeObserver(() => setRowWidth(node.scrollWidth));
		observer.observe(node);
		observerRef.current = observer;
	}, []);

	/**
	 * The aspect frame morphs by scaling a 14px square rather than animating
	 * width and height. Same picture, but scale is composited while width and
	 * height force a layout pass on every frame of the transition.
	 */
	const frameScale = (ratio: string) => {
		const [w, h] = ratio.split(":").map(Number);
		const max = Math.max(w ?? 1, h ?? 1);
		return { scaleX: (w ?? 1) / max, scaleY: (h ?? 1) / max };
	};

	const swatch = (b: (typeof BACKDROPS)[number]) => `linear-gradient(135deg, ${b.from}, ${b.to})`;

	return (
		<div className="iproto-dock">
			<motion.div
				className="iproto-island iproto-island-animated"
				role="toolbar"
				aria-label="Preview controls"
				initial={false}
				animate={rowWidth === null ? undefined : { width: rowWidth + 12 }}
				transition={WIDTH_SPRING}
			>
				<AnimatePresence mode="wait" initial={false}>
					{s.open === null ? (
						<motion.div key="collapsed" ref={measureRow} className="iproto-row" {...ROW_MOTION}>
							<button
								type="button"
								className="iproto-btn"
								onClick={() => s.setPlaying(!s.playing)}
								aria-label={s.playing ? "Pause" : "Play"}
							>
								<AnimatePresence mode="wait" initial={false}>
									<motion.span
										key={s.playing ? "pause" : "play"}
										className="iproto-glyph"
										initial={{ opacity: 0, scale: 0.7 }}
										animate={{ opacity: 1, scale: 1 }}
										exit={{ opacity: 0, scale: 0.7 }}
										transition={{ duration: 0.16, ease: EASE as [number, number, number, number] }}
									>
										{s.playing ? <PauseGlyph /> : <PlayGlyph />}
									</motion.span>
								</AnimatePresence>
							</button>

							<button
								type="button"
								className="iproto-btn iproto-btn-tight"
								onClick={() => s.setOpen("backdrop")}
								aria-label={`Backdrop: ${s.backdrop?.label}. Open backdrop control`}
							>
								{/* Cross-fade: two layers, so changing backdrop is a dissolve
								    rather than a cut. */}
								<span className="iproto-spec iproto-spec-stack">
									<AnimatePresence initial={false}>
										<motion.span
											key={s.backdrop?.id}
											className="iproto-spec-layer"
											style={{ background: s.backdrop ? swatch(s.backdrop) : undefined }}
											{...VALUE_FADE}
										/>
									</AnimatePresence>
								</span>
							</button>

							<button
								type="button"
								className="iproto-btn iproto-btn-tight"
								onClick={() => s.setOpen("theme")}
								aria-label={`Theme: ${s.theme?.label}. Open theme control`}
							>
								<motion.span
									className="iproto-spec-theme"
									animate={{ backgroundColor: s.theme?.bg }}
									transition={{ duration: 0.22, ease: EASE as [number, number, number, number] }}
								>
									<motion.span
										className="iproto-spec-line"
										animate={{ backgroundColor: s.theme?.a }}
										transition={{ duration: 0.22, ease: EASE as [number, number, number, number] }}
										style={{ width: "100%" }}
									/>
									<motion.span
										className="iproto-spec-line"
										animate={{ backgroundColor: s.theme?.b }}
										transition={{ duration: 0.22, ease: EASE as [number, number, number, number] }}
										style={{ width: "62%" }}
									/>
								</motion.span>
							</button>

							<button
								type="button"
								className="iproto-btn"
								onClick={s.cycleAspect}
								aria-label={`Cycle aspect ratio. ${s.aspect} active.`}
								data-on=""
							>
								<span className="iproto-frame-box">
									<motion.span
										className="iproto-frame"
										animate={frameScale(s.aspect ?? "16:9")}
										transition={FRAME_SPRING}
									/>
								</span>
								<span className="iproto-num">{s.aspect}</span>
							</button>

							<a className="iproto-cta iproto-cta-inline" href="#open">
								Open studio
							</a>
						</motion.div>
					) : (
						<motion.div key={s.open} ref={measureRow} className="iproto-row" {...ROW_MOTION}>
							<button
								type="button"
								className="iproto-btn"
								onClick={() => s.setOpen(null)}
								aria-label="Back to controls"
							>
								<BackGlyph />
							</button>

							{s.open === "backdrop" &&
								BACKDROPS.map((b) => (
									<button
										key={b.id}
										type="button"
										className="iproto-btn iproto-btn-tight"
										onClick={() => s.setBackdrop(b)}
										aria-label={`Backdrop ${b.label}`}
										{...(s.backdrop?.id === b.id ? { "data-on": "" } : {})}
									>
										<span className="iproto-spec" style={{ background: swatch(b) }} />
										{/* One ring that glides between options instead of one
										    appearing and another vanishing. */}
										{s.backdrop?.id === b.id && (
											<motion.span
												layoutId="island-ring"
												className="iproto-ring"
												transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
											/>
										)}
									</button>
								))}

							{s.open === "theme" &&
								THEMES.map((t) => (
									<button
										key={t.id}
										type="button"
										className="iproto-btn iproto-btn-tight"
										onClick={() => s.setTheme(t)}
										aria-label={`Theme ${t.label}`}
										{...(s.theme?.id === t.id ? { "data-on": "" } : {})}
									>
										<span className="iproto-spec-theme" style={{ background: t.bg }}>
											<span
												className="iproto-spec-line"
												style={{ background: t.a, width: "100%" }}
											/>
											<span
												className="iproto-spec-line"
												style={{ background: t.b, width: "62%" }}
											/>
										</span>
										{s.theme?.id === t.id && (
											<motion.span
												layoutId="island-ring"
												className="iproto-ring"
												transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
											/>
										)}
									</button>
								))}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}
