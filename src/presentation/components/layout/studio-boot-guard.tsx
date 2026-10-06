import type { ProjectPayload } from "@/application/project/project-payload";
import { StoredProjectError } from "@/presentation/components/ui/route-error-boundary";
import {
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
	 * Run the restore of the stored project under the guard. When it returns
	 * true (a stored project was put on screen), a throw before the studio next
	 * commits is that project's.
	 */
	readonly guardRestore: (restore: () => boolean) => boolean;
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
 * moment the persistence restore puts one on screen until the studio has
 * committed it once. A throw anywhere else (the first render, a share link, a
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

	/** A restored project is on screen and has not committed yet. */
	private armed = false;
	/** The default project the probe opened, as a payload, to tell work from it. */
	private defaultProject: ProjectPayload | null = null;
	private stuck: StoredProjectError | null = null;
	private boot: MountedBoot = this.mount(false);

	private mount(held: boolean): MountedBoot {
		const boot: MountedBoot = {
			held,
			crashed: false,
			hasCrashed: () => boot.crashed,
			guardRestore: held ? () => false : (restore) => this.guardRestore(restore),
		};
		return boot;
	}

	private guardRestore(restore: () => boolean): boolean {
		this.armed = true;
		let restored = false;
		try {
			restored = restore();
		} finally {
			this.armed = restored;
		}
		if (restored) {
			// Its commit is what disarms the guard (componentDidUpdate).
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
		this.armed = false;
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
			this.armed = false;
			return;
		}
		if (phase === "probe" && previous.phase !== "probe") {
			this.settle();
		}
	}

	/** The default project committed: the stored one was the cause. */
	private settle(): void {
		const outcome = setAsideActiveProject(this.defaultProject ?? startDefaultProject());
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
