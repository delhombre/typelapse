import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { StaticFrame } from "./static-frame";

/** Picking a card up and putting it down are not the same gesture, so they do
    not share a curve. Reaching in is deliberate and carries one soft breath of
    overshoot — about a pixel and a half past where it lands, then down onto it,
    which is what makes it read as a thing with mass rather than a layer whose
    top value changed. The bounce is set by what that overshoot measures, not by
    a number that sounds restrained: below roughly a pixel there is nothing left
    to feel and the spring may as well be flat. Letting go is quicker and dead
    flat: a release nobody should have to watch finish. */
const PICK_UP = { type: "spring" as const, bounce: 0.4, duration: 0.4 };
const PUT_DOWN = { type: "spring" as const, bounce: 0, duration: 0.3 };

/** What the hover does to the card under the cursor: off the table (y), toward
    the viewer (scale), and turned almost square to be read (rotate). The card
    keeps a quarter of its fanned angle so it still belongs to the hand. */
const LIFT_Y = -16;
const LIFT_SCALE = 1.035;
const LIFT_STRAIGHTEN = 0.25;

/** And what it does to the two cards either side: they lean out of the way. The
    rest of the hand holds still — a fan where every card answers every hover is
    a fan that is never at rest, and the gesture stops meaning anything. */
const NUDGE_X = 7;
const NUDGE_ROT = 1.5;

/** The stack is asymmetric because the lift is: a card takes the front the
    instant it starts rising, and a card that is coming back down still has to
    cover the fan it has not yet rejoined — demote it on the frame the hover
    leaves and its raised edge is clipped by neighbours it is still standing
    above, which is the pop. But holding it at the *front* is the other error:
    the cursor has usually moved to the next card, and an abandoned card that
    keeps the front paints over the one being pointed at. So three tiers, not
    two. Only the hovered card is at the front; a descending card outranks the
    fan and nothing else; everyone else sits where the fan put them. This is why
    it cannot be a CSS delay: a delay can only hold the value a card used to
    have, and what a descending card needs is a value it has never held.

    The tier is ordered by the fan's own resting order, so cards falling
    together never trade places. A flat value for the whole tier would rank them
    by document order instead the moment more than one is in the air — a sweep
    across the fan replaces the hand's stacking with the DOM's, then unpicks it
    in a series of snaps as each card lands, motionless. Lifting every descending
    card by the same amount keeps their mutual order exactly as it will be when
    they arrive, so the only overlaps that ever change are the ones the lift
    itself owns. Between tiers: hovered above descending above at rest. */
const Z_DESCENDING_BOOST = 50;
const Z_HOVERED = 100;

function stackZ(hovered: boolean, descending: boolean, baseZ: number): number {
	if (hovered) {
		return Z_HOVERED;
	}
	if (descending) {
		return baseZ + Z_DESCENDING_BOOST;
	}
	return baseZ;
}

/** The hand, refanned 2026-08-10: five cards, five *shapes*.
    The section's claim is "every aspect", and the previous fan showed five
    identical rectangles while a chip row named the ratios — saying what it
    should show. Now each card is cut to a real export ratio and wears its
    ratio as a proof-sheet corner mark, so the claim is performed by the
    object and the chip row could be retired. Theme and mesh still vary per
    card; widths are tuned so every shape reads at the fan's scale. */
const FAN = [
	{
		themeName: "nord",
		presetId: "forest",
		title: "api/users.ts",
		language: "typescript",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		ratio: "16:9",
		width: 300,
		aspect: "16 / 9",
		x: -285,
		rot: -10,
		meshTime: 2,
	},
	{
		themeName: "dracula",
		presetId: "nebula",
		title: "api/users.ts",
		language: "typescript",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		ratio: "4:5",
		width: 210,
		aspect: "4 / 5",
		x: -140,
		rot: -5,
		meshTime: 5,
	},
	{
		themeName: "aurora",
		presetId: "solar",
		title: "api/users.ts",
		language: "typescript",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		ratio: "9:16",
		width: 180,
		aspect: "9 / 16",
		x: 0,
		rot: 0,
		meshTime: 8,
	},
	{
		themeName: "frost",
		presetId: "ocean",
		title: "api/users.ts",
		language: "typescript",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		ratio: "1:1",
		width: 230,
		aspect: "1 / 1",
		x: 145,
		rot: 5,
		meshTime: 11,
	},
	{
		themeName: "catppuccin",
		presetId: "ember",
		title: "api/users.ts",
		language: "typescript",
		code: "const active = users.filter(\n  (u) => u.active\n)",
		ratio: "3:4",
		width: 215,
		aspect: "3 / 4",
		x: 288,
		rot: 10,
		meshTime: 14,
	},
];

/**
 * A held hand of code cards. On desktop they overlap
 * in a fan; hovering one springs it up and straightens it, quietly. Below `lg` the
 * fan collapses to a horizontal scroll-snap row with no rotation.
 */
export function FrameFan() {
	const reduce = useReducedMotion();
	const [hovered, setHovered] = useState<number | null>(null);
	/* A set, not a slot: flicking across the fan leaves several cards falling at
	   once, and a single slot would evict the first one while it was still in
	   the air — the very clip this tier exists to prevent. Under reduced motion
	   nothing lifts, so nothing is ever entered here and the demotion is plain. */
	const [descending, setDescending] = useState<ReadonlySet<number>>(new Set());

	const beginDescent = (i: number) => {
		if (reduce) {
			return;
		}
		setDescending((prev) => new Set(prev).add(i));
	};

	/* The descent is over when the spring says so, not when a timer guesses: the
	   card reports its own landing, so the tier can never outlive the motion. */
	const endDescent = (i: number) => {
		setDescending((prev) => {
			if (!prev.has(i)) {
				return prev;
			}
			const next = new Set(prev);
			next.delete(i);
			return next;
		});
	};

	return (
		<section className="mx-auto w-full max-w-5xl lp-gutter py-6">
			{/* Desktop: the fan. It switches on at `lg`, not `md`: the hand is about
			    840px from the outer edge of one rotated corner card to the other, so
			    at a 768px tablet it ran off both sides of the page and gave the whole
			    landing a horizontal scroll. */}
			<div className="relative hidden h-[380px] lg:block">
				{FAN.map((card, i) => {
					const baseZ = 30 - Math.abs(i - 2) * 10;
					/* Only the cards touching the hovered one move aside, and they move
					   *away* from it: the sign comes from which side of the hover they
					   sit on, never from their own position in the fan. The centre card
					   is the reason the outward lean cannot simply follow the card's own
					   angle — it has none, so it borrows the direction it is being
					   pushed. */
					const isNeighbour = !reduce && hovered !== null && Math.abs(hovered - i) === 1;
					const away = hovered === null ? 0 : Math.sign(i - hovered);
					const leanOut = card.rot === 0 ? away : Math.sign(card.rot);
					const restX = isNeighbour ? NUDGE_X * away : 0;
					const restRot = card.rot + (isNeighbour ? NUDGE_ROT * leanOut : 0);
					return (
						/* Three jobs, three owners. The card's place in the fan is static, so
						   it is a transform in the style: it never animates and does not need
						   a motion value to hold it. Its place in the *stack* is an integer
						   and has to arrive whole — inside the motion element it was a
						   target like any other, so the spring interpolated it and the
						   lifted card climbed through its neighbours over the length of the
						   lift instead of coming to the front. Out here it is a step, taken
						   at once on the way up and one settle late on the way down. Only
						   the lift itself is animated. */
						<div
							key={card.ratio}
							className="absolute bottom-4 left-1/2"
							style={{
								zIndex: stackZ(hovered === i, descending.has(i), baseZ),
								width: card.width,
								aspectRatio: card.aspect,
								transform: `translateX(${card.x - card.width / 2}px)`,
							}}
						>
							{/* The entrance is its own layer, between the wrapper that owns the
							    stacking and the element that owns the hover. It has to be: the
							    deal and the lift are different gestures on different clocks,
							    and one element cannot hold two sets of transforms without one
							    of them overwriting the other the moment they overlap. */}
							<div className="h-full w-full">
								<motion.div
									onHoverStart={() => setHovered(i)}
									onHoverEnd={() => {
										setHovered(null);
										beginDescent(i);
									}}
									onAnimationComplete={() => endDescent(i)}
									className="h-full w-full"
									initial={false}
									animate={{
										x: restX,
										y: 0,
										rotate: restRot,
										scale: 1,
										transition: isNeighbour ? PICK_UP : PUT_DOWN,
									}}
									whileHover={
										reduce
											? undefined
											: {
													y: LIFT_Y,
													scale: LIFT_SCALE,
													rotate: card.rot * LIFT_STRAIGHTEN,
													transition: PICK_UP,
												}
									}
								>
									<StaticFrame
										themeName={card.themeName}
										presetId={card.presetId}
										title={card.title}
										language={card.language}
										code={card.code}
										label={`Code video frame, ${card.ratio}, ${card.themeName} theme, ${card.title}`}
										meshTime={card.meshTime}
										fontSize={11}
										framePadding={16}
										meshPadding={10}
										fill
										badge={card.ratio}
										className="h-full w-full"
									/>
								</motion.div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Mobile: a plain scroll-snap row, no rotation. It deals itself in too —
			    the reveal that used to wrap the whole component is gone, and the row
			    is as much a set of cards as the fan is. It has no arrows, so the
			    keyboard scrolls it by focusing the row, which Chrome already makes a
			    tab stop on its own; the role and name say what that stop is, and the
			    explicit tabIndex gives Safari and Firefox the same stop. */}
			<div
				// biome-ignore lint/a11y/useSemanticElements: the scroller is a part of this section, not a section of the page
				role="region"
				aria-label="Export ratios"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller with no arrows is reached by focusing it
				tabIndex={0}
				className="lp-fan-row -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{FAN.map((card) => (
					<div
						key={card.ratio}
						className="shrink-0 snap-center self-center"
						style={{ width: card.width, aspectRatio: card.aspect }}
					>
						<StaticFrame
							themeName={card.themeName}
							presetId={card.presetId}
							title={card.title}
							language={card.language}
							code={card.code}
							label={`Code video frame, ${card.ratio}, ${card.themeName} theme, ${card.title}`}
							meshTime={card.meshTime}
							fontSize={11}
							framePadding={16}
							meshPadding={10}
							fill
							badge={card.ratio}
							className="h-full w-full"
						/>
					</div>
				))}
			</div>
		</section>
	);
}
