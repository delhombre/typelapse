import {
	type CSSProperties,
	type PointerEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import av1Diff from "../../../docs/sharpness/av1-444-diff.png";
import av1Crop from "../../../docs/sharpness/av1-444.png";
import h264Diff from "../../../docs/sharpness/h264-420-diff.png";
import h264Crop from "../../../docs/sharpness/h264-420.png";
import manifest from "../../../docs/sharpness/sharpness.json";
import { SPLIT_REST, dragIntent, nextSplit, onFrame, splitAt, sweepSplit } from "./compare-split";
import { Eyebrow } from "./primitives";
import { SpecSheet } from "./spec-sheet";
import { CONTAINER, SECTION_PY } from "./tokens";

/**
 * The sharpness proof: one line of red code, the same frame out of the WebM and
 * the MP4, under one slider.
 *
 * Nothing here is drawn for the page. Both crops, both difference maps and every
 * number come from `pnpm sharpness:render`, which exports
 * `docs/sharpness/sharpness.project.json` through the studio's own on-device path
 * and writes what it measured to `sharpness.json`; this file only reads that
 * manifest, so the copy cannot claim a figure the files on disk do not have.
 *
 * One comparison rather than two stacked crops (Bruno, 2026-10-08: two pixelated
 * pictures say nothing): the same line, the WebM left of the split and the MP4
 * right of it, so dragging across a word shows that word change in place. The
 * crops are enlarged by whole multiples with no smoothing (two below 1024px,
 * three above), because a smoothed enlargement would invent the very softness
 * the section is about. "Difference" swaps both sides for each file's error
 * against the lossless frame, at the same gain, for a reader the pixels alone
 * do not convince. The numbers are the footnote.
 *
 * The split rests in the middle of the first word, and sweeps through it once,
 * slowly, the first time the line is well in view (D8: once, never a loop; not
 * at all under reduced motion; the reader's first touch or key stops it).
 */

const NAMES = { webm: "WebM", mp4: "MP4" } as const;

const PICTURES = {
	pixels: {
		webm: {
			src: av1Crop,
			alt: "The start of a line of code from the WebM, enlarged: the red keywords keep clean edges on the dark card.",
		},
		mp4: {
			src: h264Crop,
			alt: "The same line from the MP4, enlarged: every red stroke smears into the dark card and darkens at its edges.",
		},
		hint: "The worst case: thin red on dark. Drag the split: right of it, the MP4 smears the red.",
	},
	difference: {
		webm: {
			src: av1Diff,
			alt: "Where the WebM departs from the original frame, enlarged: almost nothing shows.",
		},
		mp4: {
			src: h264Diff,
			alt: "Where the MP4 departs from the original frame, enlarged: the edge of every red stroke lights up.",
		},
		hint: "Brighter is further from the original frame, at the same gain for both files. The WebM’s even grey is most pixels one step in 255 off: a level, not lost detail.",
	},
} as const;

type View = keyof typeof PICTURES;

function decibels(value: number): string {
	return `${value.toFixed(2)} dB`;
}

function megabytes(bytes: number): string {
	return `${(bytes / 1e6).toFixed(2)} MB`;
}

export function SharpnessSection() {
	const { crop } = manifest;
	const seconds = (manifest.files[0]?.frames ?? 0) / manifest.fps;
	const webm = manifest.files.find((file) => file.format === "webm");
	const mp4 = manifest.files.find((file) => file.format === "mp4");
	const [split, setSplit] = useState(SPLIT_REST);
	const [view, setView] = useState<View>("pixels");
	const frame = useRef<HTMLDivElement>(null);
	/* The drag under way: which pointer, where it went down, whether it moves the split yet. */
	const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
	/* Set by the reader's first touch or key: the sweep never runs, or stops, after it. */
	const touched = useRef(false);
	const pictures = PICTURES[view];

	useSweepOnce(frame, touched, setSplit);

	const follow = (event: PointerEvent<HTMLDivElement>) => {
		const box = frame.current?.getBoundingClientRect();
		if (box) {
			setSplit(splitAt(event.clientX, box.left, box.width));
		}
	};

	return (
		<section id="proof" className="lp-dark" aria-labelledby="sharpness-heading">
			<div className={`${CONTAINER} ${SECTION_PY}`}>
				<div className="max-w-2xl">
					<Eyebrow>Measured on the file</Eyebrow>
					<h2 id="sharpness-heading" className="lp-h2 mt-4 text-ink">
						Thin coloured code stays crisp.
					</h2>
					<p className="lp-line mt-4 max-w-xl">
						An H.264 MP4, ours included, keeps one colour for every four pixels, so thin red and
						orange strokes smear on a dark card. Typelapse’s WebM keeps every pixel’s&nbsp;colour.
					</p>
				</div>

				<figure
					className="lp-proof"
					style={{ "--crop-w": `${crop.width}px`, "--crop-h": `${crop.height}px` } as CSSProperties}
				>
					<div className="lp-proof-sides" aria-hidden="true">
						<span>{NAMES.webm}</span>
						<span>{NAMES.mp4}</span>
					</div>
					{/* A drag anywhere on the line moves the split: a mouse at once, a
					    finger once it goes sideways, so a thumb that lands on the picture
					    to scroll the page leaves the split where it was (`touch-action:
					    pan-y` keeps the vertical swipe the page's). The handle is the
					    slider a keyboard and a screen reader use. */}
					<div
						ref={frame}
						className="lp-proof-frame"
						onPointerDown={(event) => {
							touched.current = true;
							const on = dragIntent(event.pointerType, 0, 0) === "follow";
							drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, on };
							if (on) {
								event.currentTarget.setPointerCapture?.(event.pointerId);
								follow(event);
							}
						}}
						onPointerMove={(event) => {
							const now = drag.current;
							if (now?.id !== event.pointerId) {
								return;
							}
							if (!now.on) {
								const intent = dragIntent(
									event.pointerType,
									event.clientX - now.x,
									event.clientY - now.y,
								);
								if (intent === "release") {
									drag.current = null;
									return;
								}
								if (intent === "wait") {
									return;
								}
								now.on = true;
								event.currentTarget.setPointerCapture?.(event.pointerId);
							}
							follow(event);
						}}
						onPointerUp={() => {
							drag.current = null;
						}}
						onPointerCancel={() => {
							drag.current = null;
						}}
					>
						<div className="lp-proof-window">
							<img
								src={pictures.webm.src}
								width={crop.width}
								height={crop.height}
								alt={pictures.webm.alt}
								loading="lazy"
								decoding="async"
								draggable={false}
								className="lp-proof-picture [image-rendering:pixelated]"
							/>
							<div className="lp-proof-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
								<img
									src={pictures.mp4.src}
									width={crop.width}
									height={crop.height}
									alt={pictures.mp4.alt}
									loading="lazy"
									decoding="async"
									draggable={false}
									className="lp-proof-picture [image-rendering:pixelated]"
								/>
							</div>
						</div>
						<div
							className="lp-proof-handle"
							style={{ left: `${split}%` }}
							role="slider"
							tabIndex={0}
							aria-label="Split between the WebM and the MP4"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={split}
							aria-valuetext={`${split}% WebM, ${100 - split}% MP4`}
							onKeyDown={(event) => {
								touched.current = true;
								const next = nextSplit(split, event.key);
								if (next !== null) {
									event.preventDefault();
									setSplit(next);
								}
							}}
						>
							<span aria-hidden="true" />
						</div>
					</div>

					<div className="lp-proof-controls">
						<p className="lp-proof-hint">{pictures.hint}</p>
						<fieldset className="lp-proof-modes" aria-label="What the line shows">
							{(Object.keys(PICTURES) as View[]).map((mode) => (
								<button
									key={mode}
									type="button"
									aria-pressed={view === mode}
									onClick={() => setView(mode)}
								>
									{mode === "pixels" ? "Pixels" : "Difference"}
								</button>
							))}
						</fieldset>
					</div>

					{/* The numbers are the fine print: the picture is the claim. */}
					<figcaption className="lp-proof-note">
						<p className="tabular-nums">
							<span className="text-ink">WebM</span> {decibels(webm?.psnr ?? 0)} ·{" "}
							{megabytes(webm?.bytes ?? 0)}
							<span aria-hidden="true">{" "}</span>
							<span className="text-ink">MP4</span> {decibels(mp4?.psnr ?? 0)} ·{" "}
							{megabytes(mp4?.bytes ?? 0)}
						</p>
						<p>
							PSNR in RGB against the lossless reference frame, on this line: higher is closer to
							the original. Sizes are for the whole {seconds.toFixed(1)}&nbsp;s clip.{" "}
							<code className="whitespace-nowrap font-mono text-[0.95em]">
								pnpm sharpness:render
							</code>{" "}
							rebuilds both from a committed project. Exported in {manifest.browser} on{" "}
							{manifest.platform}; a browser without an AV1 High encoder falls back to 4:2:0, and
							the export says which codec it used.
						</p>
					</figcaption>
				</figure>

				<SpecSheet />
			</div>
		</section>
	);
}

/** A split given on the picture, as a split of the frame `target` that shows it. */
function fitted(target: HTMLElement, value: number): number {
	const picture = target.querySelector<HTMLElement>(".lp-proof-picture");
	return onFrame(value, picture?.offsetWidth ?? 0, target.offsetWidth);
}

/** How long the one sweep takes, and the pause before it, in ms. */
const SWEEP_MS = 2600;
const SWEEP_DELAY_MS = 400;

/**
 * Rests the split in the middle of the line's first word, and sweeps it through
 * the word once, the first time the line is 60%
 * in view (the figures' threshold, D8). Never under reduced motion, never after
 * the reader has touched the slider, and it lets go the moment they do.
 */
function useSweepOnce(
	frame: RefObject<HTMLDivElement | null>,
	touched: RefObject<boolean>,
	setSplit: (value: number) => void,
) {
	/* The rest, placed on the frame this screen has (a phone's shows less of the
	   line), until the reader takes the slider. */
	useEffect(() => {
		const target = frame.current;
		if (!target) {
			return;
		}
		const place = () => {
			if (!touched.current) {
				setSplit(fitted(target, SPLIT_REST));
			}
		};
		place();
		window.addEventListener("resize", place);
		return () => window.removeEventListener("resize", place);
	}, [frame, touched, setSplit]);

	useEffect(() => {
		const target = frame.current;
		const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		if (!target || still || typeof IntersectionObserver === "undefined") {
			return;
		}
		let raf = 0;
		let start = 0;
		const step = (now: number) => {
			if (touched.current) {
				return;
			}
			start ||= now + SWEEP_DELAY_MS;
			const t = (now - start) / SWEEP_MS;
			setSplit(fitted(target, sweepSplit(Math.max(0, t))));
			if (t < 1) {
				raf = requestAnimationFrame(step);
			}
		};
		const seen = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					seen.disconnect();
					raf = requestAnimationFrame(step);
				}
			},
			{ threshold: 0.6 },
		);
		seen.observe(target);
		return () => {
			seen.disconnect();
			cancelAnimationFrame(raf);
		};
	}, [frame, touched, setSplit]);
}
