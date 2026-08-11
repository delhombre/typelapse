import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/application/social/safe-zones";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { IphoneShowcase, usePlatformCycle } from "./iphone-showcase";
import { Eyebrow, Reveal } from "./primitives";
import { CONTAINER, SECTION_PY } from "./tokens";

/**
 * Feature c: the social preview, given the one dark, full-bleed section so the
 * device pops. Copy on the left, a big, Apple-product-shot iPhone on the right
 * whose screen auto-cycles through real-looking TikTok / Reels / Shorts feeds of
 * our code. The platform chips below the copy double as a live cycle indicator:
 * the chip for the feed currently on screen brightens, the rest dim.
 */
export function SocialSection() {
	const { platform } = usePlatformCycle();

	return (
		<section className="lp-dark relative overflow-hidden">
			{/* A soft neutral glow behind the device: enough to lift it off a clean
			    near-black, no brand tint, so the only colour on the section is the
			    product mesh inside the phone. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background: "radial-gradient(48% 46% at 78% 44%, oklch(1 0 0 / 0.05), transparent 70%)",
				}}
			/>
			<div className={`${CONTAINER} ${SECTION_PY} relative`}>
				<div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-16">
					<Reveal>
						<Eyebrow>Step 03 · Check</Eyebrow>
						<h2 className="lp-h2 mt-4">Check where it lands.</h2>
						<p className="lp-line mt-4 max-w-md">
							The same clip, dropped into a faithful TikTok, Reels, Shorts, X or LinkedIn frame with
							the real safe zones. You see what a caption or an action rail would cover before you
							ever leave the studio.
						</p>
						<div className="mt-8 flex flex-wrap gap-2">
							{SOCIAL_PLATFORMS.map((p) => (
								<PlatformChip key={p} platform={p} active={p === platform} />
							))}
						</div>
					</Reveal>

					<Reveal delay={0.1} className="flex items-center justify-center">
						<div className="relative flex w-full items-center justify-center">
							{/* A second, tighter glow hugging the device for extra product-shot depth. */}
							<div
								aria-hidden
								className="pointer-events-none absolute inset-0"
								style={{
									background:
										"radial-gradient(40% 38% at 50% 46%, oklch(1 0 0 / 0.06), transparent 72%)",
								}}
							/>
							<IphoneShowcase platform={platform} className="relative z-10" />
						</div>
					</Reveal>
				</div>
			</div>
		</section>
	);
}

/**
 * A platform chip that tracks the screen: the active platform brightens with a
 * hairline and a whisper of fill, the rest sit dim. Colours cross-fade so the
 * indicator glides from chip to chip as the feed swipes.
 */
function PlatformChip({ platform, active }: { platform: SocialPlatform; active: boolean }) {
	const base =
		"inline-flex h-9 items-center rounded-full border px-4 font-medium text-[13px] tabular-nums transition-colors duration-500";
	/* The selected one wears the primary. This section is the darkest surface on
	   the page, which is exactly where that colour is at its strongest, and a
	   white-on-white indicator here was the one live control that had no idea
	   what the product's colour was. The unselected ones stay a dim white: the
	   brand marks the one that is playing, not the row. */
	const tone = active
		? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
		: "border-white/12 bg-transparent text-white/40";
	return (
		<span className={`${base} ${tone}`}>
			{active ? (
				<span
					aria-hidden
					className="mr-2 inline-block size-1.5 rounded-full bg-[var(--color-primary)]"
					style={{ boxShadow: "0 0 8px var(--color-primary-glow)" }}
				/>
			) : null}
			{PLATFORM_LABELS[platform]}
		</span>
	);
}
