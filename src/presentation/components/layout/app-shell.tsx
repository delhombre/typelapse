import { mountVariants, springs } from "@/presentation/motion";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ExportBar } from "../settings/export-bar";
import { SettingsStrip } from "../settings/settings-panel";
import { TopNav } from "./top-nav";

interface AppShellProps {
	editor: ReactNode;
	stepBuilder: ReactNode;
	preview: ReactNode;
}

/** Desktop workspace: a fixed, non-scrolling two-column layout (renders at lg and up). */
export function AppShell({ editor, stepBuilder, preview }: AppShellProps) {
	return (
		<div className="studio-root flex h-dvh w-full flex-col overflow-hidden bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
			<TopNav />

			{/* ── Body ── */}
			<div className="flex min-h-0 flex-1 overflow-hidden">
				{/* Left panel: editor + steps */}
				<motion.aside
					className="flex w-[348px] shrink-0 flex-col overflow-hidden border-r border-neutral-200/70 dark:border-neutral-800/70"
					variants={mountVariants}
					initial="hidden"
					animate="visible"
					transition={springs.gentle}
				>
					<div className="flex min-h-0 flex-1 flex-col p-5">
						<SectionLabel>Code</SectionLabel>
						<div className="mt-4 flex min-h-0 flex-1 flex-col">{editor}</div>
					</div>

					<div className="shrink-0 border-t border-neutral-200/70 p-5 dark:border-neutral-800/70">
						<SectionLabel>Steps</SectionLabel>
						<div className="mt-4">{stepBuilder}</div>
					</div>
				</motion.aside>

				{/* Main area: preview + settings */}
				<motion.main
					className="flex min-h-0 flex-1 flex-col overflow-hidden bg-neutral-100/50 dark:bg-neutral-900/20"
					variants={mountVariants}
					initial="hidden"
					animate="visible"
					transition={{ ...springs.gentle, delay: 0.06 }}
				>
					<div className="flex min-h-0 flex-1 flex-col">{preview}</div>

					<div className="shrink-0 border-t border-neutral-200/70 bg-white/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] backdrop-blur backdrop-saturate-150 dark:border-neutral-800/70 dark:bg-neutral-950/50 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
						<SettingsStrip />
					</div>
				</motion.main>
			</div>

			{/* ── Export bar ── */}
			<motion.div
				className="shrink-0 border-t border-neutral-200/70 dark:border-neutral-800/70"
				variants={mountVariants}
				initial="hidden"
				animate="visible"
				transition={{ ...springs.gentle, delay: 0.1 }}
			>
				<ExportBar />
			</motion.div>
		</div>
	);
}

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
			{children}
		</span>
	);
}
