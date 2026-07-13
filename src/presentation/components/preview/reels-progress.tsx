/**
 * Progress indicator baked over the background, matching a competing tool's export
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

	const containerStyle = {
		position: "absolute" as const,
		top: 22 * scale,
		left: 26 * scale,
		right: 26 * scale,
		display: "flex",
		gap: 6 * scale,
		zIndex: 20,
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
			<div style={containerStyle}>
				<div style={{ ...track, flex: 1 }}>
					<div
						style={{ width: `${clamp01(progress) * 100}%`, height: "100%", background: fillColor }}
					/>
				</div>
			</div>
		);
	}

	return (
		<div style={containerStyle}>
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
