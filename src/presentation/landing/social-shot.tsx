import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { SocialChrome } from "@/presentation/components/preview/social-chrome";
import { SANS } from "@/presentation/components/preview/social-chrome/shared";
import { StaticFrame } from "./static-frame";

interface SocialShotProps {
	platform: SocialPlatform;
	themeName: string;
	presetId: string;
	code: string;
	title: string;
	meshTime?: number;
	/** Width (and any rotation / offset) for the phone; height follows 9:16. */
	className?: string;
}

/** Phone-screen rounding for the 9:16 product shot. */
const PHONE_RADIUS = 30;

/**
 * A static "product shot" of a 9:16 export sitting in a real platform feed: the
 * export's mesh fills the frame, an opaque code window floats in the safe middle,
 * and the faithful in-feed chrome (reused from the studio) floats on top. The
 * chrome sizes itself off a `cqmin` container root, exactly as the live preview
 * does, so the whole mockup scales with the phone.
 */
export function SocialShot({
	platform,
	themeName,
	presetId,
	code,
	title,
	meshTime = 6,
	className = "",
}: SocialShotProps) {
	const preset = MESH_PRESETS.find((p) => p.id === presetId) ?? MESH_PRESETS[0];

	return (
		<div
			className={`lp-phone relative overflow-hidden ${className}`}
			style={{ aspectRatio: "9 / 16", borderRadius: PHONE_RADIUS, containerType: "size" }}
		>
			<div
				aria-hidden
				className="absolute inset-0"
				style={{ background: preset ? meshGradientCss(preset, meshTime) : undefined }}
			/>
			<GrainOverlay />

			<div className="absolute inset-0 flex items-center justify-center">
				{/* The `w-[68%]` wrapper is a direct child of this full-size layer, so its
				    width resolves against the phone, not the shrink-wrapped window. */}
				<div className="w-[68%]" style={{ transform: "translateY(-4%)" }}>
					<StaticFrame
						themeName={themeName}
						presetId={presetId}
						code={code}
						title={title}
						meshTime={meshTime}
						meshPadding={0}
						framePadding={13}
						fontSize={10.5}
						className="w-full lp-nogutter"
					/>
				</div>
			</div>

			<div className="absolute inset-0" style={{ fontSize: "2.7cqmin", fontFamily: SANS }}>
				<SocialChrome platform={platform} />
			</div>
		</div>
	);
}
