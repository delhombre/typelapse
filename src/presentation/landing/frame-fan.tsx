import { StaticFrame } from "./static-frame";

/** The hand, refanned 2026-08-10: five cards, five *shapes*.
    The section's claim is "every aspect", and the previous fan showed five
    identical rectangles while a chip row named the ratios — saying what it
    should show. Now each card is cut to a real export ratio and wears its
    ratio as a proof-sheet corner mark, so the claim is performed by the
    object and the chip row could be retired. Theme and mesh still vary per
    card; widths are tuned so every shape reads at the fan's scale. */
/** The change every card carries. Short enough to sit whole in the narrowest
    shape: at `const active = users.filter(` the 9:16 card cut the line at
    "users.fi", which read as an export that crops your code, and no export does. */
export const FAN_CODE = "users.filter(\n  (u) => u.active\n)";
export const FAN_FONT = 11;
export const FAN_FRAME_PADDING = 16;
export const FAN_MESH_PADDING = 10;

export const FAN_CARDS = [
	{
		themeName: "nord",
		presetId: "forest",
		title: "api/users.ts",
		language: "typescript",
		code: FAN_CODE,
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
		code: FAN_CODE,
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
		code: FAN_CODE,
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
		code: FAN_CODE,
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
		code: FAN_CODE,
		ratio: "3:4",
		width: 215,
		aspect: "3 / 4",
		x: 288,
		rot: 10,
		meshTime: 14,
	},
];

/** The phone's row: the tallest card first, then the hand as the fan deals it.
    A scroller is as tall as its tallest card, so led by the 16:9 it floated that
    card in the 9:16's height of empty paper, with the 9:16 two swipes away. Led
    by the 9:16 the row is full where a phone opens on it. The card after it is
    a wide one, so the first screen shows two different shapes and the second
    runs off the edge at any phone width: a portrait card there ends at 435px
    (24 + 180 + 16 + 215), inside a Pro Max's 430 to 440, and the row would read
    as complete with nothing to swipe to. */
const heightOf = (card: (typeof FAN_CARDS)[number]) => {
	const [w = 1, h = 1] = card.aspect.split("/").map(Number);
	return (card.width * h) / w;
};
const TALLEST = FAN_CARDS.reduce((a, b) => (heightOf(b) > heightOf(a) ? b : a));
export const ROW_CARDS = [TALLEST, ...FAN_CARDS.filter((card) => card !== TALLEST)];

/**
 * A held hand of code cards. On desktop they overlap in a fan; below `lg` the fan
 * collapses to a horizontal scroll-snap row with no rotation.
 *
 * The cards sit still. They used to spring up and straighten under the pointer,
 * and a card that answers a hover is a card that looks like a button: these are
 * pictures of the five cuts, they open nothing, and a lift promised a click that
 * was not there. Nothing here moves, so there is nothing for reduced motion to
 * turn off.
 */
export function FrameFan() {
	return (
		<section className="mx-auto w-full max-w-5xl py-6">
			{/* Desktop: the fan. It switches on at `lg`, not `md`: the hand is about
			    840px from the outer edge of one rotated corner card to the other, so
			    at a 768px tablet it ran off both sides of the page and gave the whole
			    landing a horizontal scroll. */}
			<div className="relative hidden h-[380px] lg:block">
				{FAN_CARDS.map((card, i) => (
					<div
						key={card.ratio}
						className="lp-nogutter absolute bottom-4 left-1/2 select-none"
						style={{
							zIndex: 30 - Math.abs(i - 2) * 10,
							width: card.width,
							aspectRatio: card.aspect,
							transform: `translateX(${card.x - card.width / 2}px) rotate(${card.rot}deg)`,
						}}
					>
						<StaticFrame
							themeName={card.themeName}
							presetId={card.presetId}
							title={card.title}
							language={card.language}
							code={card.code}
							label={`Code video frame, ${card.ratio}, ${card.themeName} theme, ${card.title}`}
							meshTime={card.meshTime}
							fontSize={FAN_FONT}
							framePadding={FAN_FRAME_PADDING}
							meshPadding={FAN_MESH_PADDING}
							fill
							badge={card.ratio}
							className="h-full w-full"
						/>
					</div>
				))}
			</div>

			{/* Mobile: a plain scroll-snap row, no rotation. It deals itself in too —
			    the reveal that used to wrap the whole component is gone, and the row
			    is as much a set of cards as the fan is. It has no arrows, so the
			    keyboard scrolls it by focusing the row, which Chrome already makes a
			    tab stop on its own; the role and name say what that stop is, and the
			    explicit tabIndex gives Safari and Firefox the same stop. It runs edge to
			    edge (`.lp-fan-row` in app.css), is led by `ROW_CARDS`, and stands every
			    card on one baseline, as the fan does. */}
			<div
				// biome-ignore lint/a11y/useSemanticElements: the scroller is a part of this section, not a section of the page
				role="region"
				aria-label="Export ratios"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller with no arrows is reached by focusing it
				tabIndex={0}
				className="lp-fan-row flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{ROW_CARDS.map((card) => (
					<div
						key={card.ratio}
						className="lp-nogutter shrink-0 snap-center select-none self-end"
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
							fontSize={FAN_FONT}
							framePadding={FAN_FRAME_PADDING}
							meshPadding={FAN_MESH_PADDING}
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
