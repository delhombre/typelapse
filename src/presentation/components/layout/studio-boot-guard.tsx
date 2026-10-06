import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type { ProjectPayload } from "@/application/project/project-payload";
import { StoredProjectError } from "@/presentation/components/ui/route-error-boundary";
import { readStudioProjectDocument } from "@/presentation/stores/studio-composition.store";
import {
	type CompositionCrash,
	announceKeptProject,
	downloadKeptProject,
	setAsideActiveProject,
	startDefaultProject,
} from "@/presentation/utils/studio-recovery";
import {
	Component,
	type ErrorInfo,
	Fragment,
	type ReactNode,
	createContext,
	useContext,
} from "react";

/**
 * The composition on screen, or null when reading it throws: its serialization
 * may be the very thing that threw the studio, and the guard must still try the
 * default project.
 */
function readCrashedComposition(): ProjectDocumentV2 | null {
	try {
		return readStudioProjectDocument();
	} catch {
		return null;
	}
}

/** Which part of the stored project a restore puts on screen. */
export type RestoredPart = "draft" | "composition";

/**
 * What the studio's storage-facing parts (the draft persistence, the
 * composition bridge) learn from the guard. One per mount of the studio.
 */
export interface StudioBoot {
	/**
	 * True while the guard tries the default project after a stored one threw:
	 * nothing is restored, saved or flushed, so storage still holds exactly what
	 * the person left until the guard has decided what to set aside.
	 */
	readonly held: boolean;
	/**
	 * Run a restore of the stored project under the guard: its code (the draft,
	 * on mount) or its composition (layers and media, read from IndexedDB once
	 * the code has committed). When it returns true (stored state was put on
	 * screen), a throw before the studio next commits is that project's.
	 */
	readonly guardRestore: (restore: () => boolean, part?: RestoredPart) => boolean;
	/**
	 * True once this mount of the studio has thrown. Its unmount must not write
	 * what is in memory to the device: that is the state that threw, and a
	 * reload would replay it.
	 */
	readonly hasCrashed: () => boolean;
}

const UNGUARDED: StudioBoot = {
	held: false,
	guardRestore: (restore) => restore(),
	hasCrashed: () => false,
};

const StudioBootContext = createContext<StudioBoot>(UNGUARDED);

export function useStudioBoot(): StudioBoot {
	return useContext(StudioBootContext);
}

interface MountedBoot extends StudioBoot {
	crashed: boolean;
}

type Phase =
	/** The studio, with its storage. */
	| "live"
	/** A stored project threw: the default project is tried with storage held. */
	| "probe";

interface StudioBootGuardState {
	readonly phase: Phase;
	/** Bumped to remount the studio from scratch. */
	readonly generation: number;
	/** Bumped once a restore has put a stored project on screen. */
	readonly restoreTick: number;
	readonly error: Error | null;
}

/**
 * The boot guard: the last line between a stored project that throws and a
 * studio nobody can open.
 *
 * It only blames the stored project when it can be the stored project: from the
 * moment a restore puts part of it on screen until the studio has committed it
 * once. There are two such moments: the persistence restoring its code on mount,
 * and the composition bridge landing its layers from IndexedDB later (the wait
 * in between is not watched). A throw anywhere else (the first render, a share link, a
 * lazy chunk, an edit) is not the stored project's and goes up untouched, with
 * the route's Reload; either way the studio that threw writes nothing on its
 * way out.
 *
 * On a throw it can blame, it moves nothing at first: the default project is
 * mounted with storage held. Only when that commits is the open project set
 * aside under the recovery key (`studio-recovery`), a fresh one opened, and the
 * studio remounted on it with one line and a Download action. If the default
 * project throws too, the stored project was not the cause: nothing moves and
 * the error goes up. If the copy cannot be written, the project stays where it
 * is and the screen offers it as a download instead of a reload that would
 * replay it.
 */
export class StudioBootGuard extends Component<
	{ readonly children: ReactNode },
	StudioBootGuardState
> {
	override state: StudioBootGuardState = {
		phase: "live",
		generation: 0,
		restoreTick: 0,
		error: null,
	};

	/** Which part of a restored project is on screen and has not committed yet. */
	private armed: RestoredPart | null = null;
	/** The default project the probe opened, as a payload, to tell work from it. */
	private defaultProject: ProjectPayload | null = null;
	/** Set when the composition restore threw, taken before the default replaces it. */
	private crash: CompositionCrash | null = null;
	private stuck: StoredProjectError | null = null;
	private boot: MountedBoot = this.mount(false);

	private mount(held: boolean): MountedBoot {
		const boot: MountedBoot = {
			held,
			crashed: false,
			hasCrashed: () => boot.crashed,
			guardRestore: held
				? () => false
				: (restore, part = "draft") => this.guardRestore(restore, part),
		};
		return boot;
	}

	private guardRestore(restore: () => boolean, part: RestoredPart): boolean {
		const before = this.armed;
		this.armed = part;
		let restored = false;
		try {
			restored = restore();
		} finally {
			this.armed = restored ? part : before;
		}
		if (restored) {
			// Its commit is what disarms the guard (componentDidUpdate). For the
			// composition, landing outside any React event, that is the guard's
			// DefaultLane commit, one task after the composition's own SyncLane
			// commit: conservative, since the stored state has rendered by then. The
			// cost is low: another update pending in that same render that throws
			// would be blamed on the stored project.
			this.setState((state) => ({ restoreTick: state.restoreTick + 1 }));
		}
		return restored;
	}

	static getDerivedStateFromError(error: Error): Partial<StudioBootGuardState> {
		return { error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		if (this.state.phase !== "live" || !this.armed) {
			return;
		}
		// The layers that threw are only in memory now; the next step replaces them.
		this.crash = this.armed === "composition" ? { document: readCrashedComposition() } : null;
		this.armed = null;
		console.warn(
			"Typelapse could not open the stored project; trying the default one",
			error,
			info.componentStack,
		);
		this.defaultProject = startDefaultProject();
		this.boot = this.mount(true);
		this.setState((state) => ({
			phase: "probe",
			generation: state.generation + 1,
			error: null,
		}));
	}

	override componentDidUpdate(_props: unknown, previous: StudioBootGuardState): void {
		const { phase, restoreTick, error } = this.state;
		if (error) {
			return;
		}
		if (phase === "live" && restoreTick !== previous.restoreTick) {
			// The restored project is on screen: from here a throw is not its.
			this.armed = null;
			return;
		}
		if (phase === "probe" && previous.phase !== "probe") {
			this.settle();
		}
	}

	/** The default project committed: the stored one was the cause. */
	private settle(): void {
		const outcome = setAsideActiveProject(this.defaultProject ?? startDefaultProject(), this.crash);
		this.crash = null;
		if (outcome.status === "failed") {
			const project = outcome.project;
			this.stuck = new StoredProjectError(
				new Error("The stored project could not be set aside"),
				() => downloadKeptProject(project),
			);
			this.forceUpdate();
			return;
		}
		if (outcome.status === "kept") {
			announceKeptProject(outcome.kept);
		}
		this.boot = this.mount(false);
		this.setState((state) => ({ phase: "live", generation: state.generation + 1 }));
	}

	override render(): ReactNode {
		if (this.stuck) {
			throw this.stuck;
		}
		const { error, phase, generation } = this.state;
		if (error) {
			this.boot.crashed = true;
			if (phase === "live" && this.armed) {
				// Held back for componentDidCatch, which tries the default project.
				return null;
			}
			throw error;
		}
		return (
			<StudioBootContext.Provider value={this.boot}>
				<Fragment key={generation}>{this.props.children}</Fragment>
			</StudioBootContext.Provider>
		);
	}
}
