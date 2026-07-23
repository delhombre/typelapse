import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import { Theme } from "@/domain/entities/theme";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { FeatureSection } from "./feature-section";

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

const DIFF_PAD = 18;

/** A GitHub-flavored diff frame on a mesh backdrop: the diff-import product shot. */
function DiffFrame() {
	const theme = Theme.midnight();
	const preset = MESH_PRESETS.find((p) => p.id === "ocean") ?? MESH_PRESETS[0];

	return (
		<div
			role="img"
			aria-label="A GitHub pull request diff shown as a code video frame, with one line removed and two added"
			className="code-frame-glow relative w-[300px] overflow-hidden sm:w-[368px]"
			style={{
				padding: DIFF_PAD,
				borderRadius: theme.borderRadius + DIFF_PAD,
				background: preset ? meshGradientCss(preset, 6) : undefined,
			}}
		>
			<GrainOverlay />
			<div
				className="relative z-10 overflow-hidden"
				style={{
					background: theme.background,
					borderRadius: theme.borderRadius,
					boxShadow: "0 18px 44px -20px rgb(0 0 0 / 0.55)",
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
		</div>
	);
}
