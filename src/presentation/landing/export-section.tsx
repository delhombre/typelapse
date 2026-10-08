/**
 * Stage 04's picture, captured from the studio's preview at 2x: the card and its
 * caption at a size the code reads at (at least 11px at every width), then the
 * same scene in the five shapes the export writes, side by side at one height,
 * where the shapes are the point and the code is a texture.
 *
 * Pictures rather than live frames: the engine already runs twice above (the
 * hero and the morph), and six more copies of it would cost the page what a few
 * kilobytes show. Each image declares both sides, so nothing moves when they
 * arrive.
 */
const CARD = { src: "/landing/export-card.webp", width: 711, height: 374 };

const SHAPES = [
	{ ratio: "16:9", src: "/landing/frame-16x9.webp", width: 853, height: 480 },
	{ ratio: "1:1", src: "/landing/frame-1x1.webp", width: 480, height: 480 },
	{ ratio: "4:5", src: "/landing/frame-4x5.webp", width: 385, height: 480 },
	{ ratio: "3:4", src: "/landing/frame-3x4.webp", width: 360, height: 480 },
	{ ratio: "9:16", src: "/landing/frame-9x16.webp", width: 272, height: 480 },
] as const;

export function ExportShapes() {
	return (
		<figure className="m-0">
			<img
				className="lp-export-card"
				src={CARD.src}
				width={CARD.width}
				height={CARD.height}
				loading="lazy"
				decoding="async"
				draggable={false}
				alt="A scene of orders.ts, its code card and the caption under it: One query for every order."
			/>
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
				One scene in the five shapes, from the studio’s preview; the caption under the card is baked
				into the file by a hosted&nbsp;render.
			</figcaption>
		</figure>
	);
}
