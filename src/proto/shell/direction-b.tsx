/**
 * B. L'atelier.
 *
 * Three columns and no horizontal bars at all: editor left, the object in the
 * middle, and a 280px inspector on the right where the forty controls are
 * regrouped into four titled clusters. Theme and mesh stop being fourteen
 * swatches laid out in a strip and become one control each — the current
 * choice, wearing its own colour — with the grid behind a popover.
 *
 * The island stays where PR #48 put it, carrying the transport only: in this
 * direction it is a transport, not a settings dock.
 */

import { useState } from "react";
import {
	Cluster,
	GhostButton,
	PickerButton,
	Popover,
	PrimaryButton,
	Row,
	Segmented,
	StackRow,
	SwatchGrid,
	Toggle,
	ValueChip,
} from "./controls";
import { CodeFacsimile, Island, IslandRow, Nav, Stage, StepsList, Transport } from "./parts";
import { BACKGROUND_SWATCHES, THEME_SWATCHES } from "./project";

type OpenPicker = "theme" | "mesh" | null;

export function DirectionB({ initialPicker = null }: { initialPicker?: OpenPicker }) {
	const [open, setOpen] = useState<OpenPicker>(initialPicker);
	const toggle = (next: Exclude<OpenPicker, null>) =>
		setOpen((prev) => (prev === next ? null : next));

	return (
		<div className="pshell studio-root flex h-dvh w-full flex-col overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<Nav />

			<div className="flex min-h-0 flex-1 overflow-hidden">
				<aside className="flex w-[320px] shrink-0 flex-col overflow-hidden border-r border-neutral-200/70 dark:border-neutral-800/70">
					<section className="flex shrink-0 flex-col p-5">
						<span className="ps-eyebrow">Code</span>
						<div className="mt-3 overflow-hidden rounded-xl border border-neutral-200/70 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
							<CodeFacsimile />
						</div>
					</section>
					<section className="flex min-h-0 flex-1 flex-col border-t border-neutral-200/70 p-5 dark:border-neutral-800/70">
						<div className="flex items-center justify-between">
							<span className="ps-eyebrow">Steps</span>
							<span className="text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
								3 · 3.9s
							</span>
						</div>
						<div className="mt-3 min-h-0 flex-1 overflow-y-auto">
							<StepsList />
						</div>
					</section>
				</aside>

				<main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-900/20">
					<div className="flex min-h-0 flex-1 items-center justify-center p-8">
						<Stage className="max-h-full w-full max-w-[720px]" />
					</div>
					<div className="psi-dock">
						<Island single>
							<IslandRow>
								<Transport />
							</IslandRow>
						</Island>
					</div>
				</main>

				<aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-neutral-200/70 p-3 dark:border-neutral-800/70">
					<div className="flex flex-col gap-2.5">
						<Cluster title="Frame">
							<Row label="Shape">
								<Segmented items={["16:9", "1:1", "9:16", "4:5"]} value="16:9" compact />
							</Row>
							<Row label="Chrome">
								<Segmented items={["macOS", "Web", "Term", "None"]} value="macOS" compact />
							</Row>
							{/* Three numbers that all answer "how much space", on one line: the
							    column is 280px and a row each would spend 84 of its 844. */}
							<Row label="Space">
								<span className="flex items-center gap-1">
									<ValueChip term="pad" value="24" />
									<ValueChip term="gap" value="32" />
									<ValueChip term="rad" value="12" />
								</span>
							</Row>
							<Row label="Line numbers">
								<Toggle label="01" on />
							</Row>
						</Cluster>

						<div className="relative">
							<Cluster title="Look">
								<Row label="Theme">
									<PickerButton
										label="Midnight"
										swatch={THEME_SWATCHES[0].bg}
										open={open === "theme"}
										onClick={() => toggle("theme")}
									/>
								</Row>
								<Row label="Mesh">
									<PickerButton
										label="Solar"
										swatch={BACKGROUND_SWATCHES[0].css}
										open={open === "mesh"}
										onClick={() => toggle("mesh")}
									/>
								</Row>
								<Row label="Font">
									<span className="inline-flex h-7 items-center rounded-lg border border-neutral-200/70 px-2 font-mono text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
										JetBrains Mono
									</span>
								</Row>
								<Row label="Watermark">
									<span className="inline-flex h-7 w-28 items-center rounded-lg border border-neutral-200/70 px-2 text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
										@username
									</span>
								</Row>
							</Cluster>

							{open === "theme" && (
								<Popover>
									<SwatchGrid
										items={THEME_SWATCHES.map((t) => ({ label: t.label, css: t.bg }))}
										selected="Midnight"
									/>
								</Popover>
							)}
							{open === "mesh" && (
								<Popover>
									<SwatchGrid
										items={BACKGROUND_SWATCHES.map((b) => ({ label: b.label, css: b.css }))}
										selected="Solar"
									/>
								</Popover>
							)}
						</div>

						<Cluster title="Motion">
							<Row label="Tempo">
								<Segmented items={["Snappy", "Smooth", "Cine"]} value="Smooth" compact />
							</Row>
							<StackRow label="Beats">
								<Toggle label="Type" on />
								<Toggle label="Zoom" />
								<Toggle label="Sound" on />
								<Toggle label="Loop" />
							</StackRow>
							<Row label="Progress">
								<Segmented items={["Reels", "Bar", "None"]} value="Reels" compact />
							</Row>
						</Cluster>

						<Cluster title="Export">
							<Row label="Format">
								<Segmented items={["MP4", "WebM", "GIF"]} value="MP4" compact />
							</Row>
							<Row label="Size">
								<Segmented items={["1080p", "1440p", "4K"]} value="1080p" compact />
							</Row>
							<Row label="Render on">
								<Segmented items={["This device", "Server"]} value="This device" compact />
							</Row>
							<div className="mt-1 flex items-center gap-2">
								<PrimaryButton>Export · MP4 · 1080p</PrimaryButton>
								<span className="w-20 shrink-0">
									<GhostButton>PNG</GhostButton>
								</span>
							</div>
						</Cluster>
					</div>
				</aside>
			</div>
		</div>
	);
}
