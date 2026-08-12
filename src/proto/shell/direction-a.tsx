/**
 * A. L'instrument.
 *
 * The settings strip and the export bar are gone, and nothing takes their
 * place: the island already under the preview grows a second row instead. Four
 * clusters — Frame, Look, Motion, Export — swap into the plate exactly the way
 * PR #48 swaps the Social row in, and the helper pill above names the one that
 * is open, which is the landing instrument's own habit.
 *
 * Below the preview there is now no full-width anything. The 96px the two bars
 * were taking go back to the left column, and Steps is what gets them.
 */

import { useState } from "react";
import {
	AspectGlyph,
	CodeFacsimile,
	Gap,
	Island,
	IslandButton,
	IslandRow,
	Nav,
	Stage,
	StepsList,
	Transport,
} from "./parts";
import { BACKGROUND_SWATCHES, THEME_SWATCHES } from "./project";

export type Cluster = "frame" | "look" | "motion" | "export" | null;

const CLUSTER_LABEL: Record<string, string> = {
	frame: "Frame",
	look: "Look",
	motion: "Motion",
	export: "Export",
};

export function DirectionA({ initialCluster = null }: { initialCluster?: Cluster }) {
	const [cluster, setCluster] = useState<Cluster>(initialCluster);
	const toggle = (next: Exclude<Cluster, null>) =>
		setCluster((prev) => (prev === next ? null : next));

	return (
		<div className="pshell studio-root flex h-dvh w-full flex-col overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<Nav />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* The editor column keeps its place and its width. What changes is the
				    split inside it: Steps used to get whatever was left after the code,
				    and it is now an equal half of the column. */}
				<aside className="flex w-[348px] shrink-0 flex-col overflow-hidden border-r border-neutral-200/70 dark:border-neutral-800/70">
					<section className="flex shrink-0 flex-col p-5">
						<Label>Code</Label>
						<div className="mt-4 overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
							<CodeFacsimile />
						</div>
					</section>
					<section className="flex min-h-0 flex-1 flex-col border-t border-neutral-200/70 p-5 dark:border-neutral-800/70">
						<div className="flex items-center justify-between">
							<Label>Steps</Label>
							<span className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
								3 steps · 3.9s
							</span>
						</div>
						<div className="mt-4 min-h-0 flex-1 overflow-y-auto">
							<StepsList />
						</div>
					</section>
				</aside>

				<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-900/20">
					<div className="flex min-h-0 flex-1 items-center justify-center p-8">
						<Stage className="max-h-full w-full max-w-[760px]" />
					</div>

					<div className="psi-dock">
						{cluster && <span className="psi-helper">{CLUSTER_LABEL[cluster]}</span>}
						<Island single={!cluster}>
							<IslandRow>
								<Transport />
								<Gap />
								<IslandButton active={cluster === "frame"} onClick={() => toggle("frame")}>
									Frame
								</IslandButton>
								<IslandButton active={cluster === "look"} onClick={() => toggle("look")}>
									Look
								</IslandButton>
								<IslandButton active={cluster === "motion"} onClick={() => toggle("motion")}>
									Motion
								</IslandButton>
								<button type="button" className="psi-cta" onClick={() => toggle("export")}>
									Export
								</button>
							</IslandRow>

							{cluster && (
								<>
									<div className="psi-panel-rule" />
									<div className="psi-panel">{PANELS[cluster]}</div>
								</>
							)}
						</Island>
					</div>
				</main>
			</div>
		</div>
	);
}

const PANELS = {
	frame: <FramePanel />,
	look: <LookPanel />,
	motion: <MotionPanel />,
	export: <ExportPanel />,
} as const;

function FramePanel() {
	return (
		<>
			<span className="psi-eyebrow">Shape</span>
			<IslandButton soft label="16 by 9">
				<AspectGlyph w={16} h={9} />
			</IslandButton>
			<IslandButton label="1 by 1">
				<AspectGlyph w={13} h={13} />
			</IslandButton>
			<IslandButton label="9 by 16">
				<AspectGlyph w={9} h={16} />
			</IslandButton>
			<IslandButton label="4 by 5">
				<AspectGlyph w={11} h={14} />
			</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Chrome</span>
			<IslandButton selected>macOS</IslandButton>
			<IslandButton>Web</IslandButton>
			<IslandButton>Term</IslandButton>
			<IslandButton>None</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Pad</span>
			<IslandButton>24</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Margin</span>
			<IslandButton>32</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Lines</span>
			<IslandButton active>01</IslandButton>
		</>
	);
}

function LookPanel() {
	return (
		<>
			<span className="psi-eyebrow">Theme</span>
			{THEME_SWATCHES.map((theme, i) => (
				<IslandButton key={theme.name} soft={i === 0} label={theme.label}>
					<span className="psi-swatch" style={{ background: theme.bg }} />
				</IslandButton>
			))}
			<Gap />
			<span className="psi-eyebrow">Mesh</span>
			{BACKGROUND_SWATCHES.map((bg, i) => (
				<IslandButton key={bg.id} soft={i === 0} label={bg.label}>
					<span className="psi-swatch" style={{ background: bg.css }} />
				</IslandButton>
			))}
			<Gap />
			<span className="psi-eyebrow">Radius</span>
			<IslandButton selected>12</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Font</span>
			<IslandButton>JetBrains</IslandButton>
		</>
	);
}

function MotionPanel() {
	return (
		<>
			<span className="psi-eyebrow">Tempo</span>
			<IslandButton>Snappy</IslandButton>
			<IslandButton selected>Smooth</IslandButton>
			<IslandButton>Cine</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Beats</span>
			<IslandButton active>Type</IslandButton>
			<IslandButton>Zoom</IslandButton>
			<IslandButton active>Sound</IslandButton>
			<IslandButton>Loop</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Progress</span>
			<IslandButton selected>Reels</IslandButton>
			<IslandButton>Bar</IslandButton>
			<IslandButton>None</IslandButton>
		</>
	);
}

function ExportPanel() {
	return (
		<>
			<span className="psi-eyebrow">Format</span>
			<IslandButton selected>MP4</IslandButton>
			<IslandButton>WebM</IslandButton>
			<IslandButton>GIF</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Size</span>
			<IslandButton selected>1080p</IslandButton>
			<IslandButton>1440p</IslandButton>
			<IslandButton>4K</IslandButton>
			<Gap />
			<span className="psi-eyebrow">Where</span>
			<IslandButton selected>This device</IslandButton>
			<IslandButton>Server</IslandButton>
			<Gap />
			<IslandButton>PNG</IslandButton>
			<button type="button" className="psi-cta">
				Render 16:9 · MP4
			</button>
		</>
	);
}

export function Label({ children }: { children: string }) {
	return <span className="ps-eyebrow">{children}</span>;
}
