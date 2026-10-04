import type { RenderFormat } from "@/domain/entities/render-config";
import type {
	CloudAllowance,
	CloudDownload,
	CloudExportPort,
	CloudFailure,
	CloudRenderJob,
	CloudRenderOptions,
} from "@/domain/ports/cloud-export.port";
import { CloudRenderAdapter } from "@/infrastructure/export/cloud-render.adapter";
import { create } from "zustand";

/** The only thing the browser keeps about a cloud render: its id. Status always comes from the server. */
export const CLOUD_RENDER_JOB_KEY = "typelapse:cloud-render-job";

const MAX_BACKOFF_MS = 15_000;

/** What the account island's cloud save answers: the canonical revision, or why there is none. */
export type CloudSaveResult =
	| { readonly kind: "saved"; readonly projectId: string; readonly revision: number }
	| { readonly kind: "failed"; readonly message: string };

export type SaveCloudRevision = () => Promise<CloudSaveResult>;

/** The export panel's settings, as they stand when Render is pressed. */
export interface CloudRenderRequest {
	readonly format: RenderFormat;
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly loop: boolean;
}

export type CloudRenderPhase =
	| { readonly kind: "idle" }
	| { readonly kind: "saving" }
	| { readonly kind: "submitting" }
	| { readonly kind: "queued"; readonly jobId: string }
	| { readonly kind: "running"; readonly jobId: string }
	/** Asking the server again: after a reload, or while the API does not answer. */
	| { readonly kind: "reconnecting"; readonly jobId: string }
	| {
			readonly kind: "succeeded";
			readonly jobId: string;
			readonly download: CloudDownload;
			readonly notice?: string;
	  }
	| {
			readonly kind: "expired";
			readonly jobId: string;
			readonly message: string;
			readonly upgradeTo: string | null;
	  }
	| { readonly kind: "failed"; readonly message: string; readonly upgradeTo: string | null };

/** A render is on its way: Render waits for it rather than starting a second one. */
export function isCloudRenderBusy(phase: CloudRenderPhase): boolean {
	return (
		phase.kind === "saving" ||
		phase.kind === "submitting" ||
		phase.kind === "queued" ||
		phase.kind === "running" ||
		phase.kind === "reconnecting"
	);
}

export interface HostedRenderJobsState {
	phase: CloudRenderPhase;
	/** The server's allowance, read when Cloud is chosen and again at each submit. */
	allowance: CloudAllowance | null;
	/** The account island hands its cloud save over; it returns the disconnect. */
	connectCloudSave(save: SaveCloudRevision | null): () => void;
	refreshAllowance(): Promise<void>;
	submit(request: CloudRenderRequest): Promise<void>;
	/** Follow the job a previous page left behind, if any. */
	resume(): void;
	download(): Promise<void>;
	dismiss(): void;
}

type JobStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface HostedRenderJobsOptions {
	readonly client: CloudExportPort;
	readonly storage: JobStorage | null;
	readonly setTimer?: (effect: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
	readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
	readonly open?: (url: string) => void;
	readonly pollMs?: number;
}

function failed(message: string, upgradeTo: string | null = null): CloudRenderPhase {
	return { kind: "failed", message, upgradeTo };
}

const UNREACHABLE_MESSAGE = "Typelapse Cloud did not answer. Try again in a moment.";

function failureMessage(failure: CloudFailure): string {
	return failure.kind === "refused" ? failure.message : UNREACHABLE_MESSAGE;
}

/** A new tab, so the studio stays where it was while the signed link downloads. */
function openInNewTab(url: string): void {
	const link = document.createElement("a");
	link.href = url;
	link.target = "_blank";
	link.rel = "noopener";
	link.click();
}

function toRenderOptions(request: CloudRenderRequest): CloudRenderOptions | null {
	if (request.format !== "mp4" && request.format !== "webm") return null;
	return {
		format: request.format,
		width: request.width,
		height: request.height,
		fps: request.fps as CloudRenderOptions["fps"],
		// The server mixes the project's own audio, and only where there is some.
		includeAudio: true,
		...(request.loop ? { loop: true } : {}),
	};
}

export function createHostedRenderJobsStore({
	client,
	storage,
	setTimer = (effect, delayMs) => setTimeout(effect, delayMs),
	clearTimer = (timer) => clearTimeout(timer),
	open = openInNewTab,
	pollMs = 1500,
}: HostedRenderJobsOptions) {
	let save: SaveCloudRevision | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	// Every submit, resume and dismiss starts a new generation; a late answer
	// from an older one is dropped instead of overwriting what is on screen.
	let generation = 0;

	const remember = (jobId: string | null) => {
		try {
			if (jobId) storage?.setItem(CLOUD_RENDER_JOB_KEY, jobId);
			else storage?.removeItem(CLOUD_RENDER_JOB_KEY);
		} catch {
			// Private mode: the job still runs, it just will not survive a reload.
		}
	};

	const recalled = (): string | null => {
		try {
			return storage?.getItem(CLOUD_RENDER_JOB_KEY) ?? null;
		} catch {
			return null;
		}
	};

	const stopPolling = () => {
		if (timer !== null) clearTimer(timer);
		timer = null;
	};

	return create<HostedRenderJobsState>((set, get) => {
		const schedule = (jobId: string, run: number, attempt: number, delayMs: number) => {
			stopPolling();
			timer = setTimer(() => {
				timer = null;
				void poll(jobId, run, attempt);
			}, delayMs);
		};

		const settle = async (job: CloudRenderJob, run: number) => {
			if (job.status === "queued" || job.status === "running") {
				set({ phase: { kind: job.status, jobId: job.id } });
				schedule(job.id, run, 0, pollMs);
				return;
			}
			if (job.status === "failed") {
				set({ phase: failed("Typelapse Cloud could not render this project.") });
				return;
			}
			if (job.status === "canceled") {
				set({ phase: failed("This cloud render was canceled.") });
				return;
			}
			if (job.download) {
				set({ phase: { kind: "succeeded", jobId: job.id, download: job.download } });
				return;
			}
			// Succeeded without a link: the plan no longer keeps it, and only the
			// download route says why, in the sentence that names the plan.
			const access = await client.download(job.id);
			if (run !== generation) return;
			if (access.kind === "ready") {
				set({ phase: { kind: "succeeded", jobId: job.id, download: access.download } });
			} else if (access.kind === "refused") {
				set({
					phase: {
						kind: "expired",
						jobId: job.id,
						message: access.message,
						upgradeTo: access.upgradeTo,
					},
				});
			} else {
				set({ phase: { kind: "reconnecting", jobId: job.id } });
				schedule(job.id, run, 1, pollMs * 2);
			}
		};

		const poll = async (jobId: string, run: number, attempt: number) => {
			const answer = await client.job(jobId);
			if (run !== generation) return;
			if (answer.kind === "found") {
				await settle(answer.job, run);
				return;
			}
			if (answer.kind === "not-found") {
				remember(null);
				set({ phase: failed("This cloud render is no longer available.") });
				return;
			}
			if (answer.kind === "refused" && answer.status === 401) {
				// Kept: once signed in again, the same job is picked up.
				set({ phase: failed("Sign in again to follow this cloud render.") });
				return;
			}
			// A restart or a blip: keep the job and ask again, less and less often.
			const next = attempt + 1;
			set({ phase: { kind: "reconnecting", jobId } });
			schedule(jobId, run, next, Math.min(pollMs * 2 ** next, MAX_BACKOFF_MS));
		};

		return {
			phase: { kind: "idle" },
			allowance: null,

			connectCloudSave: (next) => {
				save = next;
				return () => {
					if (save === next) save = null;
				};
			},

			refreshAllowance: async () => {
				const answer = await client.allowance();
				if (answer.kind === "ok") set({ allowance: answer.allowance });
			},

			submit: async (request) => {
				if (isCloudRenderBusy(get().phase)) return;
				stopPolling();
				const run = ++generation;
				const renderOptions = toRenderOptions(request);
				if (!renderOptions) {
					set({
						phase: failed(
							"Typelapse Cloud renders MP4 and WebM. Switch the format, or make the GIF on this device.",
						),
					});
					return;
				}

				set({ phase: { kind: "submitting" } });
				const allowance = await client.allowance();
				if (run !== generation) return;
				if (allowance.kind === "ok") {
					set({ allowance: allowance.allowance });
					if (!allowance.allowance.hostedRenders) {
						// Nothing is uploaded for a render the plan does not include: the
						// route checks the plan before the body, so its 402 is the answer.
						const refusal = await client.submit({ renderOptions });
						if (run !== generation) return;
						if (
							refusal.kind !== "accepted" &&
							!(refusal.kind === "refused" && refusal.status === 400)
						) {
							set({
								phase: failed(
									failureMessage(refusal),
									refusal.kind === "refused" ? refusal.upgradeTo : null,
								),
							});
							return;
						}
						// Anything else means the plan changed since: save and submit for real.
					}
				}

				if (!save) {
					set({ phase: failed("Sign in to render on Typelapse Cloud.") });
					return;
				}
				set({ phase: { kind: "saving" } });
				const revision = await save();
				if (run !== generation) return;
				if (revision.kind === "failed") {
					set({ phase: failed(revision.message) });
					return;
				}

				set({ phase: { kind: "submitting" } });
				const result = await client.submit({
					projectId: revision.projectId,
					revision: revision.revision,
					renderOptions,
				});
				if (run !== generation) return;
				if (result.kind !== "accepted") {
					set({
						phase: failed(
							failureMessage(result),
							result.kind === "refused" ? result.upgradeTo : null,
						),
					});
					return;
				}
				remember(result.job.id);
				await settle(result.job, run);
			},

			resume: () => {
				if (get().phase.kind !== "idle") return;
				const jobId = recalled();
				if (!jobId) return;
				const run = ++generation;
				set({ phase: { kind: "reconnecting", jobId } });
				schedule(jobId, run, 0, 0);
			},

			download: async () => {
				const phase = get().phase;
				if (phase.kind !== "succeeded") return;
				// The link in the status is valid for a minute; a fresh one is asked for
				// at each press, so a tab left open overnight still downloads.
				const access = await client.download(phase.jobId);
				if (get().phase !== phase) return;
				if (access.kind === "ready") {
					set({ phase: { kind: "succeeded", jobId: phase.jobId, download: access.download } });
					open(access.download.url);
				} else if (access.kind === "refused" && access.code === "output-expired") {
					set({
						phase: {
							kind: "expired",
							jobId: phase.jobId,
							message: access.message,
							upgradeTo: access.upgradeTo,
						},
					});
				} else {
					set({ phase: { ...phase, notice: failureMessage(access) } });
				}
			},

			dismiss: () => {
				if (isCloudRenderBusy(get().phase)) return;
				generation += 1;
				stopPolling();
				remember(null);
				set({ phase: { kind: "idle" } });
			},
		};
	});
}

function browserStorage(): JobStorage | null {
	try {
		return typeof localStorage === "undefined" ? null : localStorage;
	} catch {
		return null;
	}
}

export const useHostedRenderJobsStore = createHostedRenderJobsStore({
	client: new CloudRenderAdapter(),
	storage: browserStorage(),
});

/** A hosted build, read at call time so a test can stub the environment. */
export function isHostedBuild(): boolean {
	return import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE === "hosted";
}
