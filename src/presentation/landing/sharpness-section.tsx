import av1Crop from "../../../docs/sharpness/av1-444.png";
import h264Crop from "../../../docs/sharpness/h264-420.png";
import manifest from "../../../docs/sharpness/sharpness.json";
import { Eyebrow } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

/**
 * The sharpness proof: one line of code, the same frame out of two exports.
 *
 * Nothing here is drawn for the page. Both crops and every number come from
 * `pnpm sharpness:render`, which exports `docs/sharpness/sharpness.project.json`
 * through the studio's own on-device path and writes what it measured to
 * `sharpness.json`; this file only reads that manifest, so the copy cannot
 * claim a figure the files on disk do not have.
 *
 * Still, on purpose. The point is a frame, and a frame is two PNGs of a few
 * kilobytes; a video would cost a megabyte to show the same thing and would
 * run whether or not anyone asked it to. Nothing moves, so there is nothing for
 * reduced motion to turn off, and both sides of every image are declared, so
 * there is nothing to shift.
 *
 * The crops are enlarged by whole multiples with no smoothing (two on a phone
 * and a tablet, three where the column has room), because a fractional or a
 * smoothed enlargement would invent the very softness the section is about.
 */

const CROPS: Record<string, string> = {
	"av1-444.png": av1Crop,
	"h264-420.png": h264Crop,
};

/** What the file is, in the export panel's own words, for each measured file. */
const NAMES: Record<string, string> = {
	webm: "WebM · AV1 4:4:4",
	mp4: "MP4 · H.264 4:2:0",
};

const ALTS: Record<string, string> = {
	webm: "The line of code from the WebM, enlarged: the orange f, the red arrow and the violet call keep clean edges on the dark card.",
	mp4: "The same line from the MP4, enlarged: the coloured strokes bleed into the dark card and their edges darken.",
};

function decibels(value: number): string {
	return `${value.toFixed(2)} dB`;
}

function megabytes(bytes: number): string {
	return `${(bytes / 1e6).toFixed(2)} MB`;
}

export function SharpnessSection() {
	const { crop } = manifest;
	const seconds = (manifest.files[0]?.frames ?? 0) / manifest.fps;

	return (
		<section className={`${CONTAINER} ${SECTION_PY}`} aria-labelledby="sharpness-heading">
			<div className="mx-auto max-w-2xl text-center">
				<Eyebrow>Measured on the file</Eyebrow>
				<h2 id="sharpness-heading" className="lp-h2 mt-4 text-ink">
					The WebM is as sharp as the preview.
				</h2>
				<p className="lp-line mx-auto mt-4 max-w-xl">
					One frame of the same 1080p60 export, decoded from each file and enlarged without
					smoothing; only the codec differs.
				</p>
			</div>

			<figure className="mx-auto mt-12 w-full max-w-[576px] lg:max-w-[864px]">
				<div className="flex flex-col gap-6">
					{manifest.files.map((file) => (
						<div key={file.format}>
							<div className="mb-2 flex items-baseline justify-between gap-4 text-[13px]">
								<span className="font-mono text-ink">{NAMES[file.format]}</span>
								{/* The decibels are the claim and the bytes are its price, so the
								    first takes the ink and the second stays ash. */}
								<span className="text-ash tabular-nums">
									<span className="text-ink">{decibels(file.psnr)}</span> · {megabytes(file.bytes)}
								</span>
							</div>
							<div className="h-[96px] overflow-hidden rounded-[12px] bg-[#0d1117] outline outline-1 outline-hairline -outline-offset-1 lg:h-[144px]">
								<img
									src={CROPS[file.crop]}
									width={crop.width}
									height={crop.height}
									alt={ALTS[file.format]}
									loading="lazy"
									decoding="async"
									draggable={false}
									className="block h-[96px] w-[576px] max-w-none select-none [image-rendering:pixelated] lg:h-[144px] lg:w-[864px]"
								/>
							</div>
						</div>
					))}
				</div>
				{/* Why first, then how: the reason the bottom crop looks the way it does
				    is what a reader wants after looking, and the method is the fine print. */}
				<figcaption className="mt-6">
					<p className="text-[15px] text-ink leading-relaxed">
						H.264 keeps one colour sample for every four pixels, so thin red and orange strokes
						bleed into a dark background.
					</p>
					<p className="lp-micro mt-2 leading-relaxed">
						PSNR in RGB against the painter&rsquo;s lossless frame, on this line only; sizes are for
						the whole {seconds.toFixed(1)}&nbsp;s clip.{" "}
						<code className="whitespace-nowrap font-mono text-[0.95em]">pnpm sharpness:render</code>{" "}
						rebuilds both crops from a committed project. Exported in {manifest.browser} on{" "}
						{manifest.platform}; a browser without an AV1 High encoder falls back to 4:2:0, and the
						export says which codec it used.
					</p>
				</figcaption>
			</figure>
		</section>
	);
}
