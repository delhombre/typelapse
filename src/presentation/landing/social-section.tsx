import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/application/social/safe-zones";
import { Chip, Eyebrow, Reveal } from "./primitives";
import { SocialShot } from "./social-shot";
import { CONTAINER, SECTION_PY } from "./tokens";

/**
 * Feature c: the social preview, given the one dark, full-bleed section so the
 * phones pop. Copy on the left, a fanned pair of in-feed product shots on the
 * right, over a faint accent glow.
 */
export function SocialSection() {
	return (
		<section className="lp-dark relative overflow-hidden">
			{/* Faint accent glow anchored behind the phones. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(60% 55% at 78% 42%, oklch(0.62 0.19 268 / 0.22), transparent 70%)",
				}}
			/>
			<div className={`${CONTAINER} ${SECTION_PY} relative`}>
				<div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-16">
					<Reveal>
						<Eyebrow>Social preview</Eyebrow>
						<h2 className="lp-h2 mt-4">See it in the feed first.</h2>
						<p className="lp-line mt-4 max-w-md">
							Preview your export inside a faithful TikTok, Reels, or Shorts frame, with the real
							safe zones, before you ever leave the studio. Nothing important lands under a caption
							or an action rail.
						</p>
						<div className="mt-8 flex flex-wrap gap-2">
							{SOCIAL_PLATFORMS.map((platform) => (
								<Chip key={platform} tone="dark">
									{PLATFORM_LABELS[platform]}
								</Chip>
							))}
						</div>
					</Reveal>

					<Reveal delay={0.1} className="flex items-center justify-center">
						{/* w-full gives the phones a definite width to resolve their
						    percentage widths against: without it the flex row shrinks to
						    content, and content sized off that row collapses to zero. */}
						<div className="flex w-full items-center justify-center">
							<SocialShot
								platform="tiktok"
								themeName="dracula"
								presetId="nebula"
								title="app.ts"
								code={"app.boot()\napp.run()"}
								meshTime={5}
								className="w-[45%] max-w-[186px] translate-y-5 -rotate-6"
							/>
							<SocialShot
								platform="reels"
								themeName="aurora"
								presetId="aurora"
								title="ship.ts"
								code={"function ship() {\n  launch()\n}"}
								meshTime={9}
								className="relative z-10 -ml-5 w-[52%] max-w-[218px] rotate-3"
							/>
						</div>
					</Reveal>
				</div>
			</div>
		</section>
	);
}
