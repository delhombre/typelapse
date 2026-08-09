import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

export const HEADLINE = "Your pull request, as a video";

export const LEAD =
	"Paste a snippet, a unified diff, or a whole GitHub pull request. Typelapse morphs it token by token and exports a video that matches the preview frame for frame.";

export const MICRO = "MIT licensed. Runs on your machine. No account needed.";

interface Part {
	readonly t: string;
	readonly c?: string;
}

interface Line {
	readonly id: string;
	readonly parts: readonly Part[];
	readonly state?: "add" | "del";
}

/** The shared frame: unchanged lines that survive the morph. */
const SHARED: Line[] = [
	{
		id: "sig",
		parts: [
			{ t: "export function ", c: "tok-key" },
			{ t: "authorizeHostedRender", c: "tok-fn" },
			{ t: "(req) {" },
		],
	},
	{
		id: "guard",
		parts: [
			{ t: "  if ", c: "tok-key" },
			{ t: "(!req.credential) return " },
			{ t: '"unauthenticated"', c: "tok-str" },
			{ t: ";" },
		],
	},
];

const BEFORE: Line[] = [
	{
		id: "b1",
		state: "del",
		parts: [{ t: '  const plan = req.header("x-typelapse-plan");' }],
	},
];

const AFTER: Line[] = [
	{
		id: "a1",
		state: "add",
		parts: [{ t: "  const session = await auth.verify(req.credential);" }],
	},
	{
		id: "a2",
		state: "add",
		parts: [{ t: "  const plan = await subscriptions.planFor(session);" }],
	},
];

const CLOSE: Line[] = [{ id: "close", parts: [{ t: "}" }] }];

const EASE = [0.23, 1, 0.32, 1] as const;

function CodeLine({ line, index }: { line: Line; index: number }) {
	const rowClass =
		line.state === "add" ? "proto-row-add" : line.state === "del" ? "proto-row-del" : undefined;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 4 }}
			transition={{ duration: 0.32, ease: EASE }}
			className={`proto-line ${rowClass ?? ""}`}
		>
			<span className="proto-gutter">{String(index).padStart(2, "0")}</span>
			<span>
				{line.state === "add" ? <span className="tok-add">+ </span> : null}
				{line.state === "del" ? <span className="tok-del">- </span> : null}
				{line.parts.map((p) => (
					<span key={p.t} className={p.c ?? (line.state ? `tok-${line.state}` : undefined)}>
						{p.t}
					</span>
				))}
			</span>
		</motion.div>
	);
}

/**
 * The hero's product shot. A real morph rather than a still: the removed line
 * leaves, the two added lines arrive, and the shared lines hold their place.
 * That is the whole product in four seconds.
 */
export function MorphingCode({ label }: { label: string }) {
	const [after, setAfter] = useState(false);

	useEffect(() => {
		const id = setInterval(() => setAfter((v) => !v), 3200);
		return () => clearInterval(id);
	}, []);

	const lines = [...SHARED, ...(after ? AFTER : BEFORE), ...CLOSE];

	return (
		<div className="proto-frame">
			<div className="proto-frame-bar">
				<span className="proto-dot" />
				<span className="proto-dot" />
				<span className="proto-dot" />
				<span className="proto-mono proto-micro" style={{ marginInlineStart: 8 }}>
					{label}
				</span>
			</div>
			<div className="proto-code">
				<AnimatePresence initial={false} mode="popLayout">
					{lines.map((line, i) => (
						<CodeLine key={line.id} line={line} index={i + 1} />
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}
