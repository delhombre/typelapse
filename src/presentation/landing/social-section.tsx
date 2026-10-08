import { PLATFORM_LABELS } from "@/application/social/safe-zones";
import type { SocialPlatform } from "@/application/social/safe-zones";
import { CYCLE_PLATFORMS, IphoneShowcase, usePlatformCycle } from "./iphone-showcase";

/**
 * Stage 03's picture: the studio's feed preview in a phone whose screen can be
 * switched or swiped through faithful TikTok, Reels, Shorts, X and LinkedIn
 * feeds of our code, with the platform chips under it as both picker and
 * indicator. It used to be the page's dark band; on the pipeline it sits on the
 * paper like every other stage, and the band went to the measured proof.
 */
export function FeedCheck() {
	/* The whole picker, not just what it is showing: chips and swipe move the
	   same ring. Nothing advances without the visitor asking it to. */
	const cycle = usePlatformCycle();
	const platform = cycle.platform;

	return (
		<figure className="lp-feed-check m-0">
			{/* The device's own contact shadow is its one depth cue. */}
			<div className="lp-feed-phone">
				<IphoneShowcase cycle={cycle} />
			</div>
			{/* The row and the phone drive the same selected platform. Nothing
			    moves unless a chip, key press or swipe asks it to. */}
			<div className="lp-chip-row flex flex-wrap justify-center">
				{CYCLE_PLATFORMS.map((p, i) => (
					<PlatformChip
						key={p}
						platform={p}
						active={p === platform}
						onSelect={() => cycle.controls.select(i)}
					/>
				))}
			</div>
			<figcaption className="lp-pic-cap text-center">
				Swipe the phone or pick a feed. The handle and the counts are placeholders.
			</figcaption>
		</figure>
	);
}

/** How far the label steps aside for the dot, and the padding that makes the
    step affordable. The chip's width is fixed by its content, so every pixel
    the label moves right is a pixel taken off the right inset: shove it the
    full width of the dot and its air, and an active chip ends up 29px in on the
    left and 5px in on the right, visibly lopsided, worst on a one-letter
    label. Splitting the difference is what balances both states. The chip
    carries 22px of padding instead of 16, and the label moves 6: at rest it
    sits 22 in on both sides, and lit it runs from the dot at 16 to a right
    inset of 16, so the *content* is centred either way.

    Both are CSS variables on the row (`.lp-chip-row`), because a phone closes the
    padding up so five chips fit one row, and the dot's offset (padding minus
    step) has to follow. */
const CHIP_PAD = "var(--chip-pad)";
const INDICATOR_ROOM = "var(--chip-step)";

/**
 * A platform chip that tracks the screen and moves it: the active platform
 * brightens with a hairline and a whisper of fill, the rest sit dim. Colours
 * cross-fade so the indicator glides from chip to chip as the feed swipes,
 * whether the swipe came from the clock, a thumb, or this chip.
 *
 * `aria-pressed` rather than a tab or a radio: the row is an indicator that
 * happens to be operable, and the chips do not own the screen the way tabs own
 * a panel — the clock moves it too.
 */
function PlatformChip({
	platform,
	active,
	onSelect,
}: {
	platform: SocialPlatform;
	active: boolean;
	onSelect: () => void;
}) {
	/* The padding is a style rather than a class: it is arithmetic against the
	   dot's offset and the label's step, and a class built by interpolation is
	   a class Tailwind never sees to generate. */
	const base =
		"relative inline-flex h-9 items-center rounded-full border font-medium text-[13px] tabular-nums active:scale-[0.97]";
	/* On the paper the primary cannot be text (1.67:1), so the selected chip is a
	   raised one in ink with an ink dot; the stage keeps one accent, the
	   studio's own inside the phone. The others are ash, which clears 4.5:1 on
	   the paper in both themes. */
	const tone = active
		? "border-ink/25 bg-surface text-ink"
		: "border-hairline bg-transparent text-ash hover:border-ink/20 hover:text-ink";
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
	};

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={active}
			aria-label={`Show the ${PLATFORM_LABELS[platform]} frame`}
			// 36px of chip, 44px of hit area: the row is the same one a thumb uses.
			className={`${base} ${tone} hit-ext cursor-pointer`}
			/* The colours keep their slow cross-fade, the press its own quick one:
			   at 500ms a press would still be sinking after the finger left. */
			style={{
				paddingInline: CHIP_PAD,
				transition:
					"color 500ms var(--ease-out), background-color 500ms var(--ease-out), border-color 500ms var(--ease-out), transform 140ms var(--ease-out)",
			}}
		>
			<span
				aria-hidden
				className="absolute top-1/2 size-1.5 rounded-full bg-ink"
				style={{ ...indicator, left: "calc(var(--chip-pad) - var(--chip-step))" }}
			/>
			<span
				className="inline-block"
				style={{
					transform: `translateX(${active ? INDICATOR_ROOM : "0px"})`,
					transition: "transform 200ms var(--ease-out)",
				}}
			>
				{PLATFORM_LABELS[platform]}
			</span>
		</button>
	);
}
