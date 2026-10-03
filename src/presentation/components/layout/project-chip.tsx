import { resolveBackgroundCss } from "@/application/backgrounds/mesh-gradient";
import type { LocalProjectRecord } from "@/application/project/local-project-library";
import { Logomark } from "@/presentation/components/ui/logomark";
import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { holdStudioPersistence } from "@/presentation/stores/studio-composition.store";
import {
	activateLocalProject,
	createLocalProject,
	readLocalProjects,
	saveActiveLocalProject,
	starterProjectPayload,
	subscribeLocalProjects,
} from "@/presentation/utils/local-project-storage";
import { writeDraft } from "@/presentation/utils/studio-draft";
import {
	restoreBlankStudioProject,
	restoreStudioProject,
	saveStudioProject,
} from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown } from "reicon-react";

/**
 * Leave the open project for another local one. The project being left is
 * saved whole first (its code spine in the library, its V2 document with
 * layers, media and audio in IndexedDB, under its own id), then the next one's
 * code is loaded and its own stored layers are put back on it. Autosave is held
 * for the whole swap, so the moment where the composition holds the next
 * project's code and the previous project's layers is never written anywhere.
 */
async function openLocalProject(select: () => LocalProjectRecord | null): Promise<boolean> {
	const release = holdStudioPersistence();
	try {
		saveActiveLocalProject(useSnippetStore.getState().toProjectPayload());
		try {
			await saveStudioProject();
		} catch {
			// Storage blocked or full: the code spine above is saved, and the switch
			// must not trap the user in the current project.
		}
		const selected = select();
		if (!selected) {
			return false;
		}
		const json = JSON.stringify(selected.project);
		useSnippetStore.getState().importFromJson(json);
		writeDraft(json);
		try {
			await restoreStudioProject(selected.id);
		} catch {
			// Unreadable storage leaves the composition of the code alone, under the
			// project's own id, rather than the previous project's layers.
			restoreBlankStudioProject(selected.id);
		}
		return true;
	} finally {
		release();
	}
}

/**
 * The project, top left, as a chip rather than a bar.
 *
 * It says the three things a title bar ever said — where you are, what this is
 * called, and how long it runs — and it takes 200px of a corner to say them
 * instead of the full width of the window. The name is the field itself: a
 * title that has to be opened before it can be renamed is a title behind a
 * door, and there is nothing behind this one.
 *
 * It is also the only place the project's name is editable now. The code card
 * used to carry a second field bound to the same value; two inputs for one
 * string is a question about which one is the real one, and the answer was
 * never interesting.
 */
export function ProjectChip() {
	const title = useSnippetStore((s) => s.snippet.title);
	const setTitle = useSnippetStore((s) => s.setTitle);
	const steps = useSnippetStore((s) => s.snippet.steps.length);
	const [open, setOpen] = useState(false);
	const [library, setLibrary] = useState(readLocalProjects);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const reduce = useReducedMotion() === true;

	useEffect(() => subscribeLocalProjects(() => setLibrary(readLocalProjects())), []);

	const close = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}
		const onPointerDown = (event: PointerEvent) => {
			const root = rootRef.current;
			if (root && !event.composedPath().includes(root)) {
				close();
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [close, open]);

	const switchTo = useCallback(
		(id: string) => {
			void openLocalProject(() => activateLocalProject(id)).then((opened) => {
				if (opened) {
					feedback("selection");
				}
			});
			close();
		},
		[close],
	);

	const createProject = useCallback(() => {
		void openLocalProject(() => createLocalProject(starterProjectPayload())).then((opened) => {
			if (opened) {
				feedback("commit");
			}
		});
		close();
	}, [close]);

	return (
		<div ref={rootRef} className="sc-project-root">
			<div className="sc-chip sc-project">
				<StudioTooltip content="Back to home" side="bottom">
					<Link to="/" className="sc-brand" aria-label="Typelapse home">
						<Logomark size={13} />
					</Link>
				</StudioTooltip>
				<input
					type="text"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="Untitled"
					aria-label="Project name"
					className="sc-title"
				/>
				<span className="sc-steps">{steps === 1 ? "1 scene" : `${steps} scenes`}</span>
				<button
					ref={triggerRef}
					type="button"
					aria-label="Open project menu"
					aria-haspopup="menu"
					aria-expanded={open}
					className="sc-project-trigger"
					onClick={() => {
						setLibrary(readLocalProjects());
						setOpen((current) => !current);
					}}
				>
					<ChevronDown
						size={11}
						strokeWidth={1.8}
						aria-hidden="true"
						style={{ transform: open ? "rotate(180deg)" : undefined }}
					/>
				</button>
			</div>

			<AnimatePresence>
				{open && (
					<motion.div
						role="menu"
						aria-label="Local projects"
						className="sc-project-menu"
						initial={
							reduce ? { opacity: 0 } : { opacity: 0, y: -5, scale: 0.97, filter: "blur(4px)" }
						}
						animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.98, filter: "blur(3px)" }}
						transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
						style={{ transformOrigin: "top left" }}
					>
						<header className="sc-project-menu-head">
							<div>
								<span>Local projects</span>
								<small>Saved on this device</small>
							</div>
							<span>{library.projects.length}</span>
						</header>
						<div className="sc-project-list">
							{library.projects.map((project) => {
								const active = project.id === library.activeId;
								return (
									<button
										key={project.id}
										type="button"
										role="menuitem"
										aria-label={`Open ${project.project.title}`}
										data-active={active ? "" : undefined}
										className="sc-project-row"
										onClick={() => switchTo(project.id)}
									>
										<span
											className="sc-project-thumb"
											style={{ background: resolveBackgroundCss(project.project.background, 0) }}
											aria-hidden="true"
										/>
										<span className="sc-project-copy">
											<strong>{project.project.title}</strong>
											<small>{active ? "Open now" : "Saved on this device"}</small>
										</span>
										{active && <Check size={13} strokeWidth={1.8} aria-hidden="true" />}
									</button>
								);
							})}
						</div>
						<button
							type="button"
							role="menuitem"
							className="sc-project-new"
							onClick={createProject}
						>
							<span aria-hidden="true">+</span>
							New project
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
