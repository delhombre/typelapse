import { springs } from "@/presentation/motion";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { StaticFrame } from "./static-frame";

/** The fanned hand — one snippet, five ways: every card a different theme × mesh
    (a light frost card among them), each three short lines. */
const FAN = [
	{
		themeName: "nord",
		presetId: "forest",
		title: "server.ts",
		language: "typescript",
		code: 'const app = Hono()\napp.get("/", ok)\napp.fire()',
		x: -260,
		rot: -10,
		meshTime: 2,
	},
	{
		themeName: "dracula",
		presetId: "nebula",
		title: "store.ts",
		language: "typescript",
		code: "const s = create()\ns.set({ n: 0 })\nexport { s }",
		x: -130,
		rot: -5,
		meshTime: 5,
	},
	{
		themeName: "aurora",
		presetId: "aurora",
		title: "route.ts",
		language: "typescript",
		code: "function get() {\n  return json(x)\n}",
		x: 0,
		rot: 0,
		meshTime: 8,
	},
	{
		themeName: "frost",
		presetId: "ocean",
		title: "hook.ts",
		language: "typescript",
		code: "function useNow() {\n  return Date.now()\n}",
		x: 130,
		rot: 5,
		meshTime: 11,
	},
	{
		themeName: "catppuccin",
		presetId: "ember",
		title: "main.py",
		language: "python",
		code: 'def greet(n):\n    msg = f"hi {n}"\n    return msg',
		x: 260,
		rot: 10,
		meshTime: 14,
	},
];

const CARD_HALF = 125;
const CARD_CLASS = "w-[250px]";

/**
 * A held hand of code cards (the Interface Craft move). On desktop they overlap
 * in a fan; hovering one springs it up and straightens it, quietly. On mobile the
 * fan collapses to a horizontal scroll-snap row with no rotation.
 */
export function FrameFan() {
	const reduce = useReducedMotion();
	const [hovered, setHovered] = useState<number | null>(null);

	return (
		<section className="mx-auto w-full max-w-5xl px-6 py-20">
			<p className="mx-auto mb-14 max-w-md text-center font-serif text-[15px] text-ash italic">
				Seven themes, five living backdrops — the same snippet, dressed differently.
			</p>

			{/* Desktop: the fan. */}
			<div className="relative hidden h-[360px] md:block">
				{FAN.map((card, i) => {
					const rotToward = card.rot - Math.sign(card.rot) * 2;
					const baseZ = 30 - Math.abs(i - 2) * 10;
					return (
						<motion.div
							key={card.title}
							onHoverStart={() => setHovered(i)}
							onHoverEnd={() => setHovered(null)}
							className="absolute bottom-4 left-1/2"
							style={{ zIndex: hovered === i ? 50 : baseZ }}
							initial={false}
							animate={{ x: card.x - CARD_HALF, y: 0, rotate: card.rot }}
							whileHover={reduce ? undefined : { y: -14, rotate: rotToward }}
							transition={springs.snappy}
						>
							<StaticFrame
								themeName={card.themeName}
								presetId={card.presetId}
								title={card.title}
								language={card.language}
								code={card.code}
								meshTime={card.meshTime}
								fontSize={11}
								framePadding={16}
								meshPadding={20}
								className={CARD_CLASS}
							/>
						</motion.div>
					);
				})}
			</div>

			{/* Mobile: a plain scroll-snap row, no rotation. */}
			<div className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{FAN.map((card) => (
					<div key={card.title} className="shrink-0 snap-center">
						<StaticFrame
							themeName={card.themeName}
							presetId={card.presetId}
							title={card.title}
							language={card.language}
							code={card.code}
							meshTime={card.meshTime}
							fontSize={11}
							framePadding={16}
							meshPadding={20}
							className={CARD_CLASS}
						/>
					</div>
				))}
			</div>
		</section>
	);
}
