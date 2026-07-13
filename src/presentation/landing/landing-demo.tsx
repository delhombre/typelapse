import { MESH_PRESETS, meshGradientCss } from "@/application/backgrounds/mesh-gradient";
import {
	type RenderToken,
	easeInOutCubic,
	renderStatic,
	renderTransition,
} from "@/application/magic-move/engine";
import { buildTimeline, locate } from "@/application/magic-move/timeline";
import { Theme } from "@/domain/entities/theme";
import { shikiAdapter } from "@/infrastructure/highlighting/highlighter";
import {
	type MagicMovePlan,
	buildMagicMovePlan,
} from "@/infrastructure/highlighting/magic-move-keyer";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { MagicMoveCanvas } from "@/presentation/components/preview/magic-move-canvas";
import { type ReactNode, useEffect, useRef, useState } from "react";

const LINE_HEIGHT_RATIO = 1.6;
const FRAME_PADDING = 22;
const MESH_PADDING = 30;

// The story the hero tells: an API handler written line by line, then refined.
const DEMO_FRAMES = [
	`export async function GET(req) {
  const users = await db.users.all()
}`,
	`export async function GET(req) {
  const users = await db.users.all()
  return Response.json(users)
}`,
	`export async function GET(req) {
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  return Response.json(active)
}`,
];
// Append the first frame so the loop morphs back to the start seamlessly.
const LOOP_CODES = [...DEMO_FRAMES, DEMO_FRAMES[0] ?? ""];
const HOLDS = [1200, 1500, 2100, 700];

const PRESET = MESH_PRESETS.find((p) => p.id === "aurora") ?? MESH_PRESETS[0];

interface DemoView {
	tokens: RenderToken[];
	lineCount: number;
	lineNumberCount: number;
}

function resolveView(plan: MagicMovePlan, pos: ReturnType<typeof locate>): DemoView {
	if (pos.phase === "transition") {
		const transition = plan.transitions[pos.index];
		const from = plan.frames[pos.index];
		const to = plan.frames[pos.index + 1];
		if (transition && from && to) {
			const eased = easeInOutCubic(pos.t);
			return {
				tokens: renderTransition(transition.from, transition.to, pos.t),
				lineCount: from.lineCount + (to.lineCount - from.lineCount) * eased,
				lineNumberCount: Math.max(from.lineCount, to.lineCount),
			};
		}
	}
	const frame = plan.frames[pos.index] ?? plan.frames[0];
	if (!frame) {
		return { tokens: [], lineCount: 1, lineNumberCount: 1 };
	}
	return {
		tokens: renderStatic(frame.tokens),
		lineCount: frame.lineCount,
		lineNumberCount: frame.lineCount,
	};
}

/**
 * The hero's living proof: the real magic-move engine + shared canvas, looping
 * over a few frames on an animated mesh background. It is the same pipeline the
 * editor and the exported video use, so what you see here is what you'd ship.
 */
export function LandingDemo() {
	const theme = useRef(Theme.aurora()).current;
	const meshRef = useRef<HTMLDivElement>(null);
	const [view, setView] = useState<DemoView | null>(null);

	useEffect(() => {
		let raf = 0;
		let cancelled = false;
		const lastSig = { current: "" };

		if (PRESET && meshRef.current) {
			meshRef.current.style.background = meshGradientCss(PRESET, 0);
		}

		shikiAdapter
			.getRawHighlighter()
			.then((h) => {
				if (cancelled) {
					return;
				}
				const plan = buildMagicMovePlan(h, LOOP_CODES, "typescript", theme.name, false);
				const timeline = buildTimeline(HOLDS);
				let start = performance.now();

				const tick = () => {
					if (cancelled) {
						return;
					}
					const now = performance.now();
					let elapsed = now - start;
					if (elapsed >= timeline.totalMs) {
						start = now;
						elapsed = 0;
					}
					const pos = locate(timeline, elapsed);

					// Re-render only when the painted frame actually changes (every frame
					// during a morph, never during a hold); the mesh keeps drifting below.
					const sig = `${pos.phase}:${pos.index}:${pos.phase === "transition" ? Math.round(pos.t * 60) : 0}`;
					if (sig !== lastSig.current) {
						lastSig.current = sig;
						setView(resolveView(plan, pos));
					}
					if (PRESET && meshRef.current) {
						meshRef.current.style.background = meshGradientCss(PRESET, now / 1000);
					}
					raf = requestAnimationFrame(tick);
				};
				raf = requestAnimationFrame(tick);
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
		};
	}, [theme.name]);

	return (
		<div
			ref={meshRef}
			className="code-frame-glow relative w-full overflow-hidden"
			style={{
				padding: MESH_PADDING,
				borderRadius: theme.borderRadius + MESH_PADDING,
				background: PRESET?.base,
			}}
		>
			<GrainOverlay />
			<div className="relative z-10">
				<FrameShell theme={theme} title="api/users.ts">
					{view ? (
						<MagicMoveCanvas
							tokens={view.tokens}
							lineCount={view.lineCount}
							lineNumberCount={view.lineNumberCount}
							fontSize={theme.fontSize}
							lineHeightRatio={LINE_HEIGHT_RATIO}
							fontFamily={theme.fontFamily}
							color={theme.foreground}
							lineNumberColor={`${theme.foreground}26`}
							padding={FRAME_PADDING}
						/>
					) : (
						<div style={{ height: 4 * theme.fontSize * LINE_HEIGHT_RATIO }} />
					)}
				</FrameShell>
			</div>
		</div>
	);
}

/** Themed card with macOS window chrome — a trimmed copy of the preview's shell. */
function FrameShell({
	theme,
	title,
	children,
}: {
	theme: Theme;
	title: string;
	children: ReactNode;
}) {
	return (
		<div
			className="code-frame-glow overflow-hidden"
			style={{ background: theme.background, borderRadius: theme.borderRadius }}
		>
			<div
				className="flex items-center gap-2 px-4 py-3"
				style={{ borderBottom: `1px solid ${theme.foreground}0f` }}
			>
				<div className="size-3 rounded-full bg-[#ff5f57]" />
				<div className="size-3 rounded-full bg-[#febc2e]" />
				<div className="size-3 rounded-full bg-[#28c840]" />
				<span
					className="ml-2 font-mono text-[11px] tracking-tight"
					style={{ color: `${theme.foreground}59` }}
				>
					{title}
				</span>
			</div>
			{children}
		</div>
	);
}
