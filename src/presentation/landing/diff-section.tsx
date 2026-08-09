import { Theme } from "@/domain/entities/theme";
import { FeatureSection } from "./feature-section";
import { BARE_RADIUS, CARD_SHADOW } from "./static-frame";

/** Feature b: import a diff or a whole PR, windowed into steps. */
export function DiffSection() {
	return (
		<FeatureSection
			eyebrow="Diff to video"
			title="Paste a pull request. Get a video."
			line="Drop in a unified diff or a GitHub pull request URL. Typelapse reads the changed lines, windows them into steps, and animates the change the way a reviewer would read it."
			align="right"
			visual={<DiffFrame />}
		/>
	);
}

type DiffKind = "ctx" | "add" | "del";

interface DiffLine {
	kind: DiffKind;
	text: string;
}

/* A small, real-looking hunk. Additions and deletions carry their own tint and
   sign so it reads as a diff at a glance, independent of the syntax theme. */
const HUNK: DiffLine[] = [
	{ kind: "ctx", text: "async function GET() {" },
	{ kind: "del", text: "  return db.all()" },
	{ kind: "add", text: "  const rows = db.all()" },
	{ kind: "add", text: "  return json(rows)" },
	{ kind: "ctx", text: "}" },
];

const STYLE: Record<DiffKind, { sign: string; text: string; bg: string }> = {
	ctx: { sign: " ", text: "#8b949e", bg: "transparent" },
	add: { sign: "+", text: "#7ee787", bg: "rgba(46,160,67,0.16)" },
	del: { sign: "-", text: "#ffa198", bg: "rgba(248,81,73,0.15)" },
};

/** A GitHub-flavored diff shown as a clean dark code card (no mesh): the code is
    the subject here, so it matches the magic-move cards rather than the mesh
    product shots. */
function DiffFrame() {
	const theme = Theme.midnight();

	return (
		<div
			role="img"
			aria-label="A GitHub pull request diff shown as a code video frame, with one line removed and two added"
			className="lp-lift relative w-[300px] overflow-hidden sm:w-[368px]"
			style={{
				background: theme.background,
				borderRadius: BARE_RADIUS,
				boxShadow: CARD_SHADOW,
			}}
		>
			<div
				className="flex items-center gap-1.5 px-3 py-2.5"
				style={{ borderBottom: `1px solid ${theme.foreground}0f` }}
			>
				<div className="size-2.5 rounded-full bg-[#ff5f57]" />
				<div className="size-2.5 rounded-full bg-[#febc2e]" />
				<div className="size-2.5 rounded-full bg-[#28c840]" />
				<span
					className="ml-2 font-mono text-[10px] tracking-tight"
					style={{ color: `${theme.foreground}59` }}
				>
					app/route.ts
				</span>
				<span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
					<span style={{ color: STYLE.add.text }}>+2</span>
					<span style={{ color: STYLE.del.text }}>-1</span>
				</span>
			</div>
			<div className="py-2.5 font-mono text-[12.5px] leading-[1.7]">
				{HUNK.map((line) => {
					const s = STYLE[line.kind];
					return (
						<div
							key={line.text}
							className="flex gap-2.5 px-3"
							style={{ background: s.bg, color: s.text }}
						>
							<span className="w-[1ch] select-none opacity-80">{s.sign}</span>
							<span className="whitespace-pre">{line.text}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
