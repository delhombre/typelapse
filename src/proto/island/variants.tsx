import { useState } from "react";
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
 * B — Marks. No drawings at all. Short typographic marks, the way ui.camera
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
