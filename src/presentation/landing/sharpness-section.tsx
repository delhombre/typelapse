import { type CSSProperties, type PointerEvent, useRef, useState } from "react";
import av1Diff from "../../../docs/sharpness/av1-444-diff.png";
import av1Crop from "../../../docs/sharpness/av1-444.png";
import h264Diff from "../../../docs/sharpness/h264-420-diff.png";
import h264Crop from "../../../docs/sharpness/h264-420.png";
import manifest from "../../../docs/sharpness/sharpness.json";
import { nextSplit, splitAt } from "./compare-split";
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
		hint: "Drag across the line: right of the split, the red smears.",
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
		hint: "Brighter is further from the original frame, at the same gain for both files.",
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
	const [split, setSplit] = useState(50);
	const [view, setView] = useState<View>("pixels");
	const frame = useRef<HTMLDivElement>(null);
	const dragging = useRef<number | null>(null);
	const pictures = PICTURES[view];

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
						The usual MP4 keeps one colour for every four pixels, so thin red and orange strokes
						smear on a dark card. Typelapse’s WebM keeps every pixel’s colour.
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
					{/* A drag anywhere on the line moves the split; a vertical swipe stays
					    the page's (`touch-action: pan-y`). The handle is the slider a
					    keyboard and a screen reader use. */}
					<div
						ref={frame}
						className="lp-proof-frame"
						onPointerDown={(event) => {
							dragging.current = event.pointerId;
							event.currentTarget.setPointerCapture?.(event.pointerId);
							follow(event);
						}}
						onPointerMove={(event) => {
							if (dragging.current === event.pointerId) {
								follow(event);
							}
						}}
						onPointerUp={() => {
							dragging.current = null;
						}}
						onPointerCancel={() => {
							dragging.current = null;
						}}
					>
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
