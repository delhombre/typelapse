import {
	HostedProjectApiError,
	type HostedProjectApiPort,
	type HostedProjectSummary,
} from "@/application/project/hosted-project-api.port";
import { HostedProjectHttpAdapter } from "@/infrastructure/project/hosted-project-http.adapter";
import { create } from "zustand";

export type CloudProjectsStatus = "idle" | "loading" | "ready" | "error";

type CloudProjectsPort = Pick<HostedProjectApiPort, "list" | "delete">;

export interface CloudProjectsState {
	/** Null until the first answer; never a guess. */
	projects: readonly HostedProjectSummary[] | null;
	status: CloudProjectsStatus;
	/** One plain sentence for the last refusal. */
	error: string | null;
	/** The id being deleted, while its request is open. */
	deleting: string | null;
	load(): Promise<void>;
	/**
	 * True when the project is gone from the list: deleted now, or already gone,
	 * which is what was asked. False for a refusal (see `error`) or a delete
	 * already open.
	 */
	remove(id: string): Promise<boolean>;
	reset(): void;
}

export interface CloudProjectsStoreOptions {
	readonly port?: CloudProjectsPort;
}

const INITIAL = { projects: null, status: "idle", error: null, deleting: null } as const;

function signedOut(error: unknown): boolean {
	return error instanceof HostedProjectApiError && error.code === "unauthorized";
}

function rendering(error: unknown): boolean {
	return error instanceof HostedProjectApiError && error.code === "render-active";
}

function deleteRefusal(error: unknown): string {
	if (signedOut(error)) return "Sign in again to delete projects.";
	if (rendering(error)) {
		return "A render is still running on this project. Delete it once the render ends.";
	}
	return "The project could not be deleted. Try again in a moment.";
}

export function createCloudProjectsStore({
	port = new HostedProjectHttpAdapter(),
}: CloudProjectsStoreOptions = {}) {
	// An answer that comes back after a reset belongs to someone who has left.
	let epoch = 0;
	return create<CloudProjectsState>((set, get) => ({
		...INITIAL,

		load: async () => {
			const started = epoch;
			set({ status: "loading", error: null });
			try {
				const projects = await port.list();
				if (started === epoch) set({ projects, status: "ready" });
			} catch (error) {
				if (started !== epoch) return;
				set({
					status: "error",
					error: signedOut(error)
						? "Sign in again to see your cloud projects."
						: "Your cloud projects cannot be read right now. Try again in a moment.",
				});
			}
		},

		remove: async (id) => {
			if (get().deleting !== null) return false;
			const started = epoch;
			set({ deleting: id, error: null });
			try {
				await port.delete(id);
				if (started !== epoch) return false;
				set({
					deleting: null,
					projects: (get().projects ?? []).filter((project) => project.id !== id),
				});
				return true;
			} catch (error) {
				if (started === epoch) {
					set({
						deleting: null,
						error: deleteRefusal(error),
					});
				}
				return false;
			}
		},

		reset: () => {
			epoch += 1;
			set({ ...INITIAL });
		},
	}));
}

export const useCloudProjectsStore = createCloudProjectsStore();
