import { StoredProjectError } from "@/presentation/components/ui/route-error-boundary";
import { recoverFromStoredProject } from "@/presentation/utils/studio-recovery";
import { Component, type ErrorInfo, Fragment, type ReactNode } from "react";

/** How long after the studio opens a failure is the stored project's, not an edit's. */
export const BOOT_WINDOW_MS = 3_000;

interface StudioBootGuardProps {
	readonly children: ReactNode;
	/** Overridable so a test need not wait. */
	readonly bootWindowMs?: number;
}

interface StudioBootGuardState {
	/** Bumped on each recovery so the studio remounts on the default project. */
	readonly attempt: number;
	readonly error: Error | null;
}

/**
 * The boot guard: the last line between a stored project that throws and a
 * studio nobody can open. The project is restored from storage as the studio
 * mounts, so a failure in that first moment is the stored project's, and a
 * reload would only replay it. The guard then sets the project aside under the
 * recovery key, starts the default project and says so in one line.
 *
 * It recovers once. A second failure (the default project itself) goes up to the
 * route's error screen as a `StoredProjectError`, which does not promise that a
 * reload helps; a failure after the boot window is an edit's, not the stored
 * project's, and goes up as it is.
 */
export class StudioBootGuard extends Component<StudioBootGuardProps, StudioBootGuardState> {
	override state: StudioBootGuardState = { attempt: 0, error: null };

	private readonly openedAt = Date.now();
	private recovered = false;
	/** Set by the render that held the studio back, read by the catch that follows it. */
	private recovering = false;

	static getDerivedStateFromError(error: Error): Partial<StudioBootGuardState> {
		return { error };
	}

	private canRecover(): boolean {
		return (
			!this.recovered && Date.now() - this.openedAt <= (this.props.bootWindowMs ?? BOOT_WINDOW_MS)
		);
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		if (!this.recovering) {
			return;
		}
		this.recovering = false;
		this.recovered = true;
		console.warn(
			"Typelapse set the stored project aside because it could not be opened",
			error,
			info.componentStack,
		);
		recoverFromStoredProject();
		this.setState((state) => ({ attempt: state.attempt + 1, error: null }));
	}

	override render(): ReactNode {
		const { error } = this.state;
		if (error) {
			if (this.canRecover()) {
				this.recovering = true;
				return null;
			}
			throw this.recovered ? new StoredProjectError(error) : error;
		}
		return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
	}
}
