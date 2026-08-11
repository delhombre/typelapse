import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/application/social/safe-zones";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { useInViewPlayback } from "@/presentation/hooks/use-in-view-playback";
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
	/* One observer for both halves of the exhibit. The chips are an indicator of
	   the cycle and the cycle drives the screen, so if the phone is not being
	   watched neither of them has anything to say — and they must agree about
	   when that is, or a chip would light for a feed that never swiped. */
	const { ref: stageRef, inView } = useInViewPlayback<HTMLDivElement>();
	const { platform } = usePlatformCycle(inView);

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
						<div ref={stageRef} className="relative flex w-full items-center justify-center">
							{/* A second, tighter glow hugging the device for extra product-shot depth. */}
							<div
								aria-hidden
								className="pointer-events-none absolute inset-0"
								style={{
									background:
										"radial-gradient(40% 38% at 50% 46%, oklch(1 0 0 / 0.06), transparent 72%)",
								}}
							/>
							<IphoneShowcase platform={platform} active={inView} className="relative z-10" />
						</div>
					</Reveal>
				</div>
			</div>
		</section>
	);
}

/** How far the label steps aside for the dot, and the padding that makes the
    step affordable. The chip's width is fixed by its content, so every pixel
    the label moves right is a pixel taken off the right inset: shove it the
    full width of the dot and its air, and an active chip ends up 29px in on the
    left and 5px in on the right — visibly lopsided, worst on a one-letter
    label. Splitting the difference is what balances both states. The chip
    carries 22px of padding instead of 16, and the label moves 6: at rest it
    sits 22 in on both sides, and lit it runs from the dot at 16 to a right
    inset of 16, so the *content* is centred either way. */
const INDICATOR_ROOM = 6;
const CHIP_PAD = 22;

/**
 * A platform chip that tracks the screen: the active platform brightens with a
 * hairline and a whisper of fill, the rest sit dim. Colours cross-fade so the
 * indicator glides from chip to chip as the feed swipes.
 */
function PlatformChip({ platform, active }: { platform: SocialPlatform; active: boolean }) {
	/* The padding is a style rather than a class: it is arithmetic against the
	   dot's offset and the label's step, and a class built by interpolation is
	   a class Tailwind never sees to generate. */
	const base =
		"relative inline-flex h-9 items-center rounded-full border font-medium text-[13px] tabular-nums transition-colors duration-500";
	/* The selected one wears the primary. This section is the darkest surface on
	   the page, which is exactly where that colour is at its strongest, and a
	   white-on-white indicator here was the one live control that had no idea
	   what the product's colour was. The unselected ones stay a dim white: the
	   brand marks the one that is playing, not the row. */
	const tone = active
		? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
		: "border-white/12 bg-transparent text-white/40";
	/* The dot is always here. Mounted only while active it had to appear from
	   nothing on the frame the carousel turned, in the middle of a 500ms colour
	   fade — the one hard cut inside an otherwise slow change. And it sat in the
	   flow, so the chip grew by its width and its margin as it lit up and the
	   whole row reflowed around it. Out of the flow and never unmounted, it
	   costs the layout nothing and can be faded and scaled like anything else;
	   the label slides over to make the room the chip no longer has to find. */
	const indicator = {
		opacity: active ? 1 : 0,
		transform: `translateY(-50%) scale(${active ? 1 : 0.5})`,
		transition: "opacity 200ms var(--ease-out), transform 200ms var(--ease-out)",
		boxShadow: "0 0 8px var(--color-primary-glow)",
	};

	return (
		<span className={`${base} ${tone}`} style={{ paddingInline: CHIP_PAD }}>
			<span
				aria-hidden
				className="absolute top-1/2 left-4 size-1.5 rounded-full bg-[var(--color-primary)]"
				style={indicator}
			/>
			<span
				className="inline-block"
				style={{
					transform: `translateX(${active ? INDICATOR_ROOM : 0}px)`,
					transition: "transform 200ms var(--ease-out)",
				}}
			>
				{PLATFORM_LABELS[platform]}
			</span>
		</span>
	);
}
