/**
 * Typelapse logomark — a monoline play glyph and its record dot, in the mnemos
 * house style: ONE rounded stroke (the play triangle) plus ONE filled accent (the
 * record point). The dot sits to the left like a record head that just hit play —
 * record → play, the whole app in two marks. Monochrome (currentColor) so it drops
 * into any badge.
 */
export function Logomark({ size = 15, className }: { size?: number; className?: string }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			role="img"
			className={className}
		>
			<title>Typelapse</title>
			{/* Play glyph — a closed rounded triangle drawn as a monoline stroke. */}
			<path
				d="M9.5 7.2L17.8 12L9.5 16.8Z"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
			{/* Record point — the filled accent dot. */}
			<circle cx="4.8" cy="12" r="1.7" fill="currentColor" />
		</svg>
	);
}
