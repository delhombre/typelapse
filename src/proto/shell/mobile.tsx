/**
 * How each direction degrades at 390.
 *
 * A sketch, not a fourth build: three labelled mocks side by side, so the
 * question "and on a phone?" is answered in the same picker rather than in a
 * paragraph. Nothing here is responsive; each mock is a fixed 390 box.
 */

import { Gap, Island, IslandButton, IslandRow, Stage, Transport } from "./parts";
import { BACKGROUND_SWATCHES, PROJECT_STEPS, THEME_SWATCHES } from "./project";

export function MobileSketch() {
	return (
		<div className="pshell studio-root flex min-h-dvh w-full flex-col items-center overflow-y-auto bg-neutral-50 px-8 pt-24 pb-16 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<header className="mb-10 max-w-[720px] text-center">
				<p className="ps-eyebrow">At 390</p>
				<h1 className="mt-3 text-[22px] font-semibold tracking-tight">
					Each direction, folded to one column
				</h1>
				<p className="mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
					Only the structural answer is drawn. The frame, the steps and the mesh are the same
					project as the desktop compositions.
				</p>
			</header>

			<div className="flex flex-wrap items-start justify-center gap-10">
				<Mock
					letter="A"
					title="L'instrument"
					note="The island is already the phone answer: it drops its labels below 640 and the open cluster scrolls sideways inside the plate. Code and Steps stay on the tab bar the mobile shell already has. One control model at every width."
				>
					<MockBar />
					<div className="flex flex-1 items-center justify-center px-4">
						<Stage compact className="w-full" />
					</div>
					<div className="psi-dock">
						<Island>
							<IslandRow>
								<Transport />
								<Gap />
								<IslandButton active>Look</IslandButton>
							</IslandRow>
							<div className="psi-panel-rule" />
							<div className="psi-panel">
								<span className="psi-eyebrow">Theme</span>
								{THEME_SWATCHES.slice(0, 4).map((theme, i) => (
									<IslandButton key={theme.name} soft={i === 0} label={theme.label}>
										<span className="psi-swatch" style={{ background: theme.bg }} />
									</IslandButton>
								))}
								<span className="psi-count">›</span>
							</div>
						</Island>
					</div>
					<MockTabs active="Preview" />
				</Mock>

				<Mock
					letter="B"
					title="L'atelier"
					note="The inspector column has nowhere to go, so it becomes a bottom sheet behind one Settings button, with the four clusters as an accordion. It works, but it is a second navigation model: the column on desktop and the sheet on the phone have to be kept in step by hand."
				>
					<MockBar settings />
					<div className="flex flex-1 items-center justify-center px-4">
						<Stage compact className="w-full" />
					</div>
					<div className="psi-dock">
						<Island single>
							<IslandRow>
								<Transport />
							</IslandRow>
						</Island>
					</div>
					<div className="mx-3 mb-3 rounded-2xl border border-neutral-200/70 bg-white p-3 dark:border-neutral-800/70 dark:bg-neutral-900/60">
						<div className="flex items-center justify-between">
							<span className="ps-eyebrow">Look</span>
							<span className="text-[11px] text-neutral-400">Frame · Motion · Export</span>
						</div>
						<div className="mt-3 grid grid-cols-6 gap-1.5">
							{BACKGROUND_SWATCHES.map((bg, i) => (
								<span
									key={bg.id}
									className={`h-8 rounded-lg shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ${
										i === 0 ? "ring-2 ring-neutral-900 ring-offset-2 dark:ring-neutral-100" : ""
									}`}
									style={{ background: bg.css }}
								/>
							))}
						</div>
					</div>
					<MockTabs active="Preview" />
				</Mock>

				<Mock
					letter="C"
					title="La scène"
					note="Already this shape. The stage is the screen, the card that floated on the left becomes the sheet that rises from the bottom, and the island never moves. Nothing has to be re-laid out — but the discoverability cost the desktop pays is the same one here, with less room to soften it."
				>
					<div className="relative flex flex-1 flex-col">
						<div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
							<span className="ps-float flex h-8 items-center px-3 text-[11px] font-semibold">
								use-toast.ts
							</span>
							<span className="ps-float flex size-8 items-center justify-center text-[13px] text-neutral-400">
								⋯
							</span>
						</div>
						<div className="flex flex-1 items-center justify-center px-4">
							<Stage compact className="w-full" />
						</div>
						<div className="psi-dock">
							<Island single>
								<IslandRow>
									<Transport />
									<Gap />
									<IslandButton active>Look</IslandButton>
								</IslandRow>
							</Island>
						</div>
						<div className="ps-float mx-3 mb-3 flex flex-col gap-2 p-3">
							<span className="mx-auto h-1 w-9 rounded-full bg-neutral-300 dark:bg-neutral-700" />
							<div className="flex items-center justify-between">
								<span className="ps-eyebrow">Steps</span>
								<span className="text-[11px] text-neutral-400">3 · 3.9s</span>
							</div>
							{PROJECT_STEPS.slice(0, 2).map((step, i) => (
								<span
									key={step.index}
									className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 font-mono text-[11px] ${
										i === 1
											? "border-neutral-300 bg-neutral-100/80 dark:border-neutral-600/60 dark:bg-neutral-800/50"
											: "border-neutral-200/70 dark:border-neutral-800"
									}`}
								>
									<span className="text-[10px] tabular-nums text-neutral-400">
										{String(step.index).padStart(2, "0")}
									</span>
									<span className="truncate text-neutral-600 dark:text-neutral-300">
										{step.preview}
									</span>
								</span>
							))}
						</div>
					</div>
				</Mock>
			</div>
		</div>
	);
}

function Mock({
	letter,
	title,
	note,
	children,
}: { letter: string; title: string; note: string; children: React.ReactNode }) {
	return (
		<figure className="flex w-[390px] flex-col">
			<figcaption className="mb-4 flex items-baseline gap-2">
				<span className="text-[13px] font-semibold tabular-nums">{letter}</span>
				<span className="text-[13px] text-neutral-500 dark:text-neutral-400">{title}</span>
			</figcaption>
			<div className="ps-mock flex flex-col">{children}</div>
			<p className="mt-4 max-w-[390px] text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
				{note}
			</p>
		</figure>
	);
}

function MockBar({ settings = false }: { settings?: boolean }) {
	return (
		<div className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200/70 px-4 dark:border-neutral-800/70">
			<span className="text-[12px] font-semibold tracking-tight">Typelapse</span>
			<span className="flex items-center gap-2 text-[11px] text-neutral-400">
				{settings && (
					<span className="rounded-lg border border-neutral-200/70 px-2 py-1 text-neutral-500 dark:border-neutral-800">
						Settings
					</span>
				)}
				⋯
			</span>
		</div>
	);
}

function MockTabs({ active }: { active: string }) {
	return (
		<div className="flex h-12 shrink-0 items-center justify-around border-t border-neutral-200/70 text-[11px] font-medium dark:border-neutral-800/70">
			{["Code", "Steps", "Preview"].map((tab) => (
				<span
					key={tab}
					className={
						tab === active
							? "text-neutral-900 dark:text-neutral-100"
							: "text-neutral-400 dark:text-neutral-500"
					}
				>
					{tab}
				</span>
			))}
		</div>
	);
}
