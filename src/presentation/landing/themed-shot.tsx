/**
 * A capture of the product in the page's own theme: the light capture on the
 * light page, the dark one on the dark page. Both are in the markup and the
 * stylesheet hides one (`.lp-shot-light` / `.lp-shot-dark`); a lazy image that
 * is not displayed is not fetched, so a visitor loads one of the two. Both
 * sides are declared, so the picture holds its box before it arrives.
 *
 * `phone` is a second crop for a phone, where the column is a third of a
 * desktop's and what reads at 470px does not at 340px; it is a `<source>` with
 * its own sides, so the box is still held before it loads.
 *
 * `bare` is for a picture made of pieces on a transparent ground, which carry
 * their own corners and edges: no frame, lift or outline around the whole.
 */

interface PhoneCrop {
	light: string;
	dark: string;
	width: number;
	height: number;
}

const PHONE = "(max-width: 639px)";

export function ThemedShot({
	light,
	dark,
	width,
	height,
	alt,
	phone,
	bare = false,
}: {
	light: string;
	dark: string;
	width: number;
	height: number;
	alt: string;
	phone?: PhoneCrop;
	bare?: boolean;
}) {
	return (
		<div className={bare ? "lp-pic-bare" : "lp-pic"}>
			{(["light", "dark"] as const).map((theme) => (
				<picture key={theme}>
					{phone ? (
						<source media={PHONE} srcSet={phone[theme]} width={phone.width} height={phone.height} />
					) : null}
					<img
						className={theme === "light" ? "lp-shot-light" : "lp-shot-dark"}
						src={theme === "light" ? light : dark}
						width={width}
						height={height}
						alt={alt}
						loading="lazy"
						decoding="async"
						draggable={false}
					/>
				</picture>
			))}
		</div>
	);
}
