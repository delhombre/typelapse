/**
 * Stage 04's picture: one scene in four of the five shapes the export writes,
 * captured from the studio's preview. Pictures rather than live frames: the
 * engine already runs twice above (the hero and the morph), and four more
 * copies of it to show a ratio would cost the page what a 6 KB file shows.
 *
 * Each image declares both sides, and the row sets only their height, so
 * nothing moves when they arrive.
 */
const SHAPES = [
	{ ratio: "16:9", src: "/landing/frame-16x9.webp", width: 570, height: 320 },
	{ ratio: "1:1", src: "/landing/frame-1x1.webp", width: 320, height: 320 },
	{ ratio: "4:5", src: "/landing/frame-4x5.webp", width: 257, height: 320 },
	{ ratio: "9:16", src: "/landing/frame-9x16.webp", width: 182, height: 320 },
] as const;

export function ExportShapes() {
	return (
		<figure className="m-0">
			<ul className="lp-aspects" aria-label="Export shapes">
				{SHAPES.map((shape) => (
					<li key={shape.ratio}>
						<img
							src={shape.src}
							width={shape.width}
							height={shape.height}
							loading="lazy"
							decoding="async"
							draggable={false}
							alt={`The same scene in ${shape.ratio}.`}
						/>
						<span aria-hidden="true">{shape.ratio}</span>
					</li>
				))}
			</ul>
			<figcaption className="lp-pic-cap">
				One scene, four of the five shapes, from the studio's preview. The caption under the card is
				baked into the file by a hosted render.
			</figcaption>
		</figure>
	);
}
