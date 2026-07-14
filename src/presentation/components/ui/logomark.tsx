/**
 * Typelapse logomark — a play head with two motion trails: "play, fast-forwarded"
 * → a timelapse of a video. Monochrome (currentColor) so it sits in any badge.
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
			{/* Motion trails — decreasing height + opacity, echoing left as the head moves right. */}
			<rect x="2" y="9.4" width="2.3" height="5.2" rx="1.15" fill="currentColor" opacity="0.3" />
			<rect x="5.7" y="7.9" width="2.3" height="8.2" rx="1.15" fill="currentColor" opacity="0.55" />
			{/* Play head — a softly rounded triangle. */}
			<path
				d="M10.4 7.3c0-1 1.1-1.6 2-1.05l7 4.7a1.25 1.25 0 0 1 0 2.1l-7 4.7c-.9.55-2-.05-2-1.05V7.3Z"
				fill="currentColor"
			/>
		</svg>
	);
}
