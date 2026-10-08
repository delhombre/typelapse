import type { CSSProperties } from "react";
import { StaticFrame } from "./static-frame";

const FINAL_CODE = `export async function GET(req: Request) {
  const users = await db.users.all()
  const active = users.filter((u) => u.active)
  return Response.json(active)
}`;

/** `lines` are the widths, as a share of the thumbnail's window, of the lines of
    code each scene shows: drawn as bars, since code at thumbnail size is not text
    anyone can read. */
const SCENES = [
	{ label: "01", duration: "1.4s", tone: "solar", lines: ["38%"] },
	{ label: "02", duration: "2.2s", tone: "ember", lines: ["72%", "46%"] },
	{ label: "03", duration: "2.6s", tone: "aurora", lines: ["62%", "30%"] },
] as const;

const RULER_TICKS = Array.from({ length: 25 }, (_, position) => ({
	id: `ruler-${position}`,
	major: position % 4 === 0,
}));

/** Stage 01's picture: a compact crop of the real workflow. Source context,
 * exportable preview and scene timeline share a single frame instead of reading
 * as three mock cards. */
export function ImportProductShot() {
	return (
		<div
			className="lp-import-shot"
			role="img"
			aria-label="Pull request 1247 becoming three editable scenes in the Typelapse timeline"
		>
			<div className="lp-import-preview">
				<div className="lp-import-source-island">
					<span className="lp-import-git-mark" aria-hidden="true">
						<BranchIcon />
					</span>
					<span className="lp-import-source-copy">
						<strong>PR #1247</strong>
						<small>api/users.ts</small>
					</span>
					<span className="lp-import-origin">
						<CheckIcon />
						Imported from GitHub
					</span>
				</div>

				<div className="lp-import-frame-wrap" aria-hidden="true">
					<StaticFrame
						themeName="aurora"
						code={FINAL_CODE}
						title="api/users.ts"
						framePadding={15}
						fontSize={9.5}
						fill
						bare
						className="lp-import-render"
					/>
				</div>

				<div className="lp-import-ready">
					<span aria-hidden="true">
						<ScenesIcon />
					</span>
					<strong>3 scenes ready</strong>
					<small>Focus, captions and timing stay editable</small>
				</div>
			</div>

			<div className="lp-import-timeline">
				<div className="lp-import-transport" aria-hidden="true">
					<span>00:00.0</span>
					<div>
						<SkipBackIcon />
						<span className="lp-import-play">
							<PlayIcon />
						</span>
						<SkipForwardIcon />
					</div>
					<span>6.2s</span>
				</div>

				<div className="lp-import-track" aria-hidden="true">
					<span className="lp-import-track-playhead" />
					{SCENES.map((scene, index) => (
						<div
							key={scene.label}
							className="lp-import-scene"
							data-selected={index === 1 ? "" : undefined}
						>
							<div className="lp-import-thumb" data-tone={scene.tone}>
								<div className="lp-import-thumb-window">
									<span className="lp-import-thumb-dots" />
									<span className="lp-import-thumb-lines">
										{scene.lines.map((width) => (
											<i key={width} style={{ "--w": width } as CSSProperties} />
										))}
									</span>
								</div>
							</div>
							<span className="lp-import-scene-number">{scene.label}</span>
							<span className="lp-import-scene-duration">{scene.duration}</span>
						</div>
					))}
					<div className="lp-import-add-scene">
						<PlusIcon />
						<span>Add scene</span>
					</div>
				</div>

				<div className="lp-import-ruler" aria-hidden="true">
					{RULER_TICKS.map((tick) => (
						<span key={tick.id} data-major={tick.major ? "" : undefined} />
					))}
				</div>
			</div>
		</div>
	);
}

function BranchIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="4" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.3" />
			<circle cx="12" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
			<circle cx="4" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.3" />
			<path d="M4 4.5v7M5.5 8h2.2A4.3 4.3 0 0 0 12 6.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="m3 8.2 3.1 3.1L13 4.7"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Three clips on a track: what the badge reports, drawn as the thing itself.
    It was a four-point sparkle, the mark every generated "AI feature" wears,
    on a step that is a parser, not a model. */
function ScenesIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="1.5" y="4.5" width="3.6" height="7" rx="1" fill="currentColor" />
			<rect x="6.2" y="4.5" width="3.6" height="7" rx="1" fill="currentColor" />
			<rect x="10.9" y="4.5" width="3.6" height="7" rx="1" fill="currentColor" />
		</svg>
	);
}

function PlayIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="m3.7 2.2 5.3 3.8-5.3 3.8V2.2Z" fill="currentColor" />
		</svg>
	);
}

function SkipBackIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M3 2.4v7.2M9.3 2.6 4.8 6l4.5 3.4V2.6Z" fill="currentColor" />
		</svg>
	);
}

function SkipForwardIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M9 2.4v7.2M2.7 2.6 7.2 6 2.7 9.4V2.6Z" fill="currentColor" />
		</svg>
	);
}

function PlusIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
			<path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}
