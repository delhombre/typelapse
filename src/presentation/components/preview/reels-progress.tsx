/**
 * Progress indicator baked over the background, matching snipcast's export
 * options. `reels` = one stories-style segment per step; `bar` = a single
 * continuous bar; `none` = hidden. Shared by preview and Remotion video.
 */
export type ProgressStyle = "reels" | "bar" | "none";

interface ReelsProgressProps {
	style?: ProgressStyle;
	segments: number;
	/** Overall playback progress, 0..1. */
	progress: number;
	/** Upscale factor for video (1 in the browser). */
	scale?: number;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function ReelsProgress({
	style = "reels",
	segments,
	progress,
	scale = 1,
}: ReelsProgressProps) {
	if (style === "none" || segments < 1) {
		return null;
	}

	// The bar fills its parent's width; the caller positions it within the window's
	// content column (preview: the `z-10` column; video: the centered card column),
	// so it spans exactly the window and never bleeds past it over the background.
	const row = {
		display: "flex",
		gap: 6 * scale,
		width: "100%",
		pointerEvents: "none" as const,
	};
	const track = {
		height: 4 * scale,
		borderRadius: 999,
		background: "rgba(255,255,255,0.22)",
		overflow: "hidden" as const,
	};
	const fillColor = "rgba(255,255,255,0.92)";

	if (style === "bar") {
		return (
			<div style={row}>
				<div style={{ ...track, flex: 1 }}>
					<div
						style={{ width: `${clamp01(progress) * 100}%`, height: "100%", background: fillColor }}
					/>
				</div>
			</div>
		);
	}

	return (
		<div style={row}>
			{Array.from({ length: segments }, (_, k) => {
				const fill = clamp01(progress * segments - k);
				return (
					<div key={`seg-${k + 1}`} style={{ ...track, flex: 1 }}>
						<div style={{ width: `${fill * 100}%`, height: "100%", background: fillColor }} />
					</div>
				);
			})}
		</div>
	);
}
