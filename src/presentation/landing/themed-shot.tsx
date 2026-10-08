/**
 * A capture of the product in the page's own theme: the light capture on the
 * light page, the dark one on the dark page. Both are in the markup and the
 * stylesheet hides one (`.lp-shot-light` / `.lp-shot-dark`); a lazy image that
 * is not displayed is not fetched, so a visitor loads one of the two. Both
 * sides are declared, so the picture holds its box before it arrives.
 */
export function ThemedShot({
	light,
	dark,
	width,
	height,
	alt,
}: {
	light: string;
	dark: string;
	width: number;
	height: number;
	alt: string;
}) {
	return (
		<div className="lp-pic">
			<img
				className="lp-shot-light"
				src={light}
				width={width}
				height={height}
				alt={alt}
				loading="lazy"
				decoding="async"
				draggable={false}
			/>
			<img
				className="lp-shot-dark"
				src={dark}
				width={width}
				height={height}
				alt={alt}
				loading="lazy"
				decoding="async"
				draggable={false}
			/>
		</div>
	);
}
