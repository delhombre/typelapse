import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { StaticFrame } from "./static-frame";

/** The unified product-shot hover feel: critically damped (no bounce), a short,
    confident settle. Shared with the CSS lift on the static frames and phones. */
const LIFT_SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

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
		presetId: "aurora",
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
 * A held hand of code cards (the Interface Craft move). On desktop they overlap
 * in a fan; hovering one springs it up and straightens it, quietly. On mobile the
 * fan collapses to a horizontal scroll-snap row with no rotation.
 */
export function FrameFan() {
	const reduce = useReducedMotion();
	const [hovered, setHovered] = useState<number | null>(null);

	return (
		<section className="mx-auto w-full max-w-5xl px-6 py-6">
			{/* Desktop: the fan. */}
			<div className="relative hidden h-[380px] md:block">
				{FAN.map((card, i) => {
					const rotToward = card.rot - Math.sign(card.rot) * 2;
					const baseZ = 30 - Math.abs(i - 2) * 10;
					return (
						<motion.div
							key={card.ratio}
							onHoverStart={() => setHovered(i)}
							onHoverEnd={() => setHovered(null)}
							className="absolute bottom-4 left-1/2"
							style={{
								zIndex: hovered === i ? 50 : baseZ,
								width: card.width,
								aspectRatio: card.aspect,
							}}
							initial={false}
							animate={{ x: card.x - card.width / 2, y: 0, rotate: card.rot }}
							whileHover={reduce ? undefined : { y: -14, rotate: rotToward }}
							transition={LIFT_SPRING}
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
					);
				})}
			</div>

			{/* Mobile: a plain scroll-snap row, no rotation. */}
			<div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
