import { editedLabel, sceneCountLabel } from "@/application/project/cloud-project-labels";
import type { HostedProjectSummary } from "@/application/project/hosted-project-api.port";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { feedback } from "@/presentation/haptics";
import { useScrollEdges } from "@/presentation/hooks/use-scroll-edges";
import { springs } from "@/presentation/motion";
import type { useCloudProjectsStore } from "@/presentation/stores/cloud-projects.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, type Ref, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "reicon-react";
import "./studio-cloud-projects.css";

type CloudProjectsStore = typeof useCloudProjectsStore;

export interface StudioCloudProjectsControl {
	readonly store: CloudProjectsStore;
	/** The cloud copy this studio saves to, when it has one: its row says it is open. */
	readonly openId?: string | null;
	/** Said once a project is gone, so the studio can let go of it. */
	readonly onDeleted?: (id: string) => void;
	/** The clock "edited 3 min ago" is read against; a test fixes it. */
	readonly now?: () => Date;
}

/** A programmatic move of focus must never scroll the panel under the person's hand. */
const FOCUS = { preventScroll: true } as const;

/**
 * The account island's third view: what the account keeps in Typelapse Cloud,
 * and the way to let one go. It is built from the keys view's own parts (its
 * back button, rows, notes and scroller, hence `mm-keys` too), because it is the
 * same panel saying the same kind of thing about a different list.
 */
export function StudioCloudProjects({
	projects: { store, openId = null, onDeleted, now = () => new Date() },
	onBack,
}: {
	readonly projects: StudioCloudProjectsControl;
	readonly onBack: () => void;
}) {
	const { projects, status, error, deleting, load, remove } = store();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const [notice, setNotice] = useState<string | null>(null);

	// Entering the view moves focus into it and reads the list again.
	useEffect(() => {
		void load();
		headingRef.current?.focus(FOCUS);
	}, [load]);

	const deleteProject = async (item: HostedProjectSummary) => {
		setNotice(null);
		if (await remove(item.id)) {
			feedback("commit");
			setNotice(`Deleted ${item.title}.`);
			onDeleted?.(item.id);
			headingRef.current?.focus(FOCUS);
		} else {
			feedback("error");
		}
	};

	return (
		<div className="mm-account-copy mm-keys mm-projects">
			<button type="button" className="mm-keys-back" aria-label="Back to account" onClick={onBack}>
				<ChevronLeft size={14} aria-hidden="true" />
				Account
			</button>
			<h2 ref={headingRef} tabIndex={-1}>
				Cloud projects
			</h2>
			<p>Private to your account. Deleting one frees its place in your allowance.</p>

			{error ? (
				<p role="alert" className="mm-account-error mm-keys-error">
					{error}
				</p>
			) : null}
			{notice ? <output className="mm-keys-note">{notice}</output> : null}
			{status === "error" ? (
				<button type="button" className="mm-keys-quiet" onClick={() => void load()}>
					Try again
				</button>
			) : null}

			{projects === null ? (
				status === "error" ? null : (
					<output className="mm-keys-note">Loading projects…</output>
				)
			) : projects.length === 0 ? (
				<p className="mm-keys-note">
					No cloud projects yet. Save a project to the cloud from your account and it appears here.
				</p>
			) : (
				<ProjectList
					projects={projects}
					openId={openId}
					at={now()}
					deleting={deleting}
					onDelete={deleteProject}
				/>
			)}
		</div>
	);
}

function ProjectList({
	projects,
	openId,
	at,
	deleting,
	onDelete,
}: {
	readonly projects: readonly HostedProjectSummary[];
	readonly openId: string | null;
	readonly at: Date;
	readonly deleting: string | null;
	readonly onDelete: (project: HostedProjectSummary) => Promise<void>;
}) {
	const [confirming, setConfirming] = useState<string | null>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const { edges, measure } = useScrollEdges(listRef);

	return (
		<ul
			ref={listRef}
			className="mm-keys-list"
			aria-label="Your cloud projects"
			data-more-above={edges.above}
			data-more-below={edges.below}
			onScroll={measure}
		>
			<AnimatePresence initial={false} mode="popLayout">
				{projects.map((project) => (
					<ProjectRow
						key={project.id}
						item={project}
						at={at}
						open={project.id === openId}
						confirming={confirming === project.id}
						busy={deleting === project.id}
						onAsk={() => setConfirming(project.id)}
						onCancel={() => setConfirming(null)}
						onConfirm={async () => {
							await onDelete(project);
							setConfirming(null);
						}}
					/>
				))}
			</AnimatePresence>
		</ul>
	);
}

function ProjectRow({
	item,
	at,
	open,
	confirming,
	busy,
	onAsk,
	onCancel,
	onConfirm,
	ref,
}: {
	readonly item: HostedProjectSummary;
	readonly at: Date;
	readonly open: boolean;
	readonly confirming: boolean;
	readonly busy: boolean;
	readonly onAsk: () => void;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
	/** AnimatePresence hands the leaving row its ref, to lift it out of the flow. */
	readonly ref?: Ref<HTMLLIElement>;
}) {
	const askRef = useRef<HTMLButtonElement>(null);
	const wasConfirming = useRef(false);
	const reduceMotion = useReducedMotion() === true;

	// Backing out lands where the person was; asking lands on the safe answer
	// (the question puts it there itself).
	useEffect(() => {
		if (!confirming && wasConfirming.current) askRef.current?.focus(FOCUS);
		wasConfirming.current = confirming;
	}, [confirming]);

	// The panel's own Escape closes the panel; inside a question it means "keep it".
	const keepOnEscape = (event: KeyboardEvent<HTMLLIElement>) => {
		if (event.key === "Escape" && confirming && !busy) {
			event.stopPropagation();
			onCancel();
		}
	};

	return (
		// A leaving row goes faster than it came, without travel; the rows beneath
		// glide up on transforms, not on their height.
		<motion.li
			ref={ref}
			className="mm-keys-row mm-projects-row"
			data-confirming={confirming && !busy ? "true" : undefined}
			layout="position"
			initial={reduceMotion ? false : { opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{
				opacity: 0,
				transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: [0.4, 0, 1, 1] },
			}}
			transition={reduceMotion ? { duration: 0 } : springs.snappy}
			onKeyDown={keepOnEscape}
		>
			{confirming && !busy ? (
				<ConfirmDiscard
					message={`Delete “${item.title}”?`}
					detail="Its revisions, media, renders and their share pages go with it."
					keepLabel="Keep project"
					confirmLabel="Delete project"
					focusKeep
					onCancel={onCancel}
					onConfirm={onConfirm}
				/>
			) : (
				<>
					<div className="mm-keys-main">
						<p className="mm-keys-name">{item.title}</p>
						<p className="mm-keys-meta">
							<span>{open ? "Open now" : sceneCountLabel(item.sceneCount)}</span>
							<span>{editedLabel(item.updatedAt, at)}</span>
						</p>
					</div>
					<button
						ref={askRef}
						type="button"
						className="mm-keys-quiet mm-keys-revoke"
						aria-label={`Delete ${item.title}`}
						disabled={busy}
						onClick={onAsk}
					>
						{busy ? "Deleting…" : "Delete"}
					</button>
				</>
			)}
		</motion.li>
	);
}
