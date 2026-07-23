import { FeatureSection } from "./feature-section";
import { StaticFrame } from "./static-frame";

/* One snippet, two states: the shared engine morphs the first into the second
   token by token. Same theme + backdrop, so the eye reads only what changed.
   Lines are kept short so both frames stay legible when they shrink on mobile. */
const BEFORE = `const a = get()
const b = a.id`;
const AFTER = `const a = get()
const b = a.id
const c = b + 1`;

const FRAME = "w-[64%] max-w-[240px] lp-nogutter sm:w-[42%]";

/** Feature a: the signature magic-move, shown as a crisp before then after. */
export function MagicMoveSection() {
	return (
		<FeatureSection
			eyebrow="Magic move"
			title="Token by token."
			line="One engine lays out and morphs your code on a monospace grid. The browser preview and the exported video run that exact same engine, so what you see is what you ship."
			align="left"
			visual={<BeforeAfter />}
		/>
	);
}

function BeforeAfter() {
	return (
		<div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
			<StaticFrame
				themeName="one-dark"
				presetId="nebula"
				title="total.ts"
				code={BEFORE}
				label="Code frame before the magic move, showing two lines"
				meshTime={3}
				fontSize={11}
				framePadding={14}
				meshPadding={12}
				className={FRAME}
			/>
			<Arrow />
			<StaticFrame
				themeName="one-dark"
				presetId="nebula"
				title="total.ts"
				code={AFTER}
				label="The same code frame after the magic move, with a third line added"
				meshTime={8}
				fontSize={11}
				framePadding={14}
				meshPadding={12}
				className={FRAME}
			/>
		</div>
	);
}

/** A morph hint between the two states: points down when the frames stack. */
function Arrow() {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			role="img"
			aria-label="morphs into"
			className="shrink-0 rotate-90 text-ash sm:rotate-0"
		>
			<title>morphs into</title>
			<path
				d="M4 12h15M13 6l6 6-6 6"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
