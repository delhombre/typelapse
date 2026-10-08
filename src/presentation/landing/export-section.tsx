/**
 * Stage 04's picture: one scene in all five shapes the export writes, captured
 * from the studio's preview at 2x (the caption under the card included).
 * Pictures rather than live frames: the engine already runs twice above (the
 * hero and the morph), and five more copies of it to show a ratio would cost
 * the page what a few kilobytes show.
 *
 * The landscape one leads at the column's width, the four upright ones share
 * the row under it at one height, so the shapes compare side by side and the
 * picture fills its column. Each image declares both sides, so nothing moves
 * when they arrive.
 */
const LEAD = { ratio: "16:9", src: "/landing/frame-16x9.webp", width: 1200, height: 675 };

const UPRIGHT = [
	{ ratio: "1:1", src: "/landing/frame-1x1.webp", width: 480, height: 480 },
	{ ratio: "4:5", src: "/landing/frame-4x5.webp", width: 385, height: 480 },
	{ ratio: "3:4", src: "/landing/frame-3x4.webp", width: 360, height: 480 },
	{ ratio: "9:16", src: "/landing/frame-9x16.webp", width: 272, height: 480 },
] as const;

function Shape({
	shape,
}: { shape: { ratio: string; src: string; width: number; height: number } }) {
	return (
		<li>
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
	);
}

export function ExportShapes() {
	return (
		<figure className="m-0">
			<ul className="lp-aspects" aria-label="Export shapes">
				<Shape shape={LEAD} />
				{UPRIGHT.map((shape) => (
					<Shape key={shape.ratio} shape={shape} />
				))}
			</ul>
			<figcaption className="lp-pic-cap">
				One scene in the five shapes, from the studio’s preview. The caption under the card is baked
				into the file by a hosted render.
			</figcaption>
		</figure>
	);
}
