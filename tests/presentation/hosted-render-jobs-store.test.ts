import type {
	CloudDownload,
	CloudExportPort,
	CloudRenderJob,
} from "@/domain/ports/cloud-export.port";
import {
	CLOUD_RENDER_JOB_KEY,
	type CloudRenderRequest,
	createHostedRenderJobsStore,
} from "@/presentation/stores/hosted-render-jobs.store";
import { describe, expect, it, vi } from "vitest";

const DOWNLOAD: CloudDownload = {
	url: "https://storage.example.test/signed",
	expiresAt: "2026-10-03T10:01:40.000Z",
	mimeType: "video/mp4",
	byteSize: 4096,
};

const REQUEST: CloudRenderRequest = {
	format: "mp4",
	width: 1920,
	height: 1080,
	fps: 30,
	loop: false,
};

function job(
	status: CloudRenderJob["status"],
	download: CloudDownload | null = null,
): CloudRenderJob {
	return { id: "job-1", status, download };
}

function memoryStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
		removeItem: (key: string) => void values.delete(key),
	};
}

/** A client whose job lookups answer from a script, one answer per poll. */
function client(
	overrides: Partial<CloudExportPort> = {},
	lookups: unknown[] = [],
): CloudExportPort {
	const script = [...lookups];
	return {
		allowance: async () => ({
			kind: "ok",
			allowance: { sentence: "You are using 0 of 100 cloud projects.", hostedRenders: true },
		}),
		submit: async () => ({ kind: "accepted", job: job("queued") }),
		job: async () =>
			(script.shift() as Awaited<ReturnType<CloudExportPort["job"]>>) ?? {
				kind: "found",
				job: job("running"),
			},
		download: async () => ({ kind: "ready", download: DOWNLOAD }),
		...overrides,
	};
}

/** Timers run by hand, so every poll is a step the test takes. */
function manualTimers() {
	const pending: { effect: () => void; delayMs: number }[] = [];
	return {
		pending,
		setTimer: (effect: () => void, delayMs: number) => {
			pending.push({ effect, delayMs });
			return pending.length as unknown as ReturnType<typeof setTimeout>;
		},
		clearTimer: () => {
			pending.length = 0;
		},
		async tick() {
			const next = pending.shift();
			next?.effect();
			await vi.waitFor(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, 0));
		},
	};
}

function store(port: CloudExportPort, storage = memoryStorage(), timers = manualTimers()) {
	const open = vi.fn();
	const jobs = createHostedRenderJobsStore({
		client: port,
		storage,
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		open,
		pollMs: 1000,
	});
	return { jobs, storage, timers, open };
}

const saved = async () => ({ kind: "saved" as const, projectId: "project-1", revision: 7 });

describe("hosted render jobs", () => {
	it("saves the canonical revision, submits it, and keeps only the job id", async () => {
		const submit = vi.fn(client().submit);
		const save = vi.fn(saved);
		const { jobs, storage } = store(client({ submit }));
		jobs.getState().connectCloudSave(save);

		await jobs.getState().submit({ ...REQUEST, loop: true });

		expect(save).toHaveBeenCalledOnce();
		expect(submit).toHaveBeenCalledWith({
			projectId: "project-1",
			revision: 7,
			renderOptions: {
				format: "mp4",
				width: 1920,
				height: 1080,
				fps: 30,
				includeAudio: true,
				loop: true,
			},
		});
		expect(jobs.getState().phase).toEqual({ kind: "queued", jobId: "job-1" });
		expect([...storage.values]).toEqual([[CLOUD_RENDER_JOB_KEY, "job-1"]]);
	});

	it("follows the job from queued to running to a download", async () => {
		const { jobs, timers, open } = store(
			client({}, [
				{ kind: "found", job: job("running") },
				{ kind: "found", job: job("succeeded", DOWNLOAD) },
			]),
		);
		jobs.getState().connectCloudSave(saved);
		await jobs.getState().submit(REQUEST);

		await timers.tick();
		expect(jobs.getState().phase).toEqual({ kind: "running", jobId: "job-1" });
		await timers.tick();
		expect(jobs.getState().phase).toEqual({
			kind: "succeeded",
			jobId: "job-1",
			download: DOWNLOAD,
		});
		expect(timers.pending).toHaveLength(0);

		await jobs.getState().download();
		expect(open).toHaveBeenCalledWith(DOWNLOAD.url);
	});

	it("picks the job up again after a reload from nothing but its id", async () => {
		const storage = memoryStorage({ [CLOUD_RENDER_JOB_KEY]: "job-1" });
		const { jobs, timers } = store(client({}, [{ kind: "found", job: job("running") }]), storage);

		jobs.getState().resume();
		expect(jobs.getState().phase).toEqual({ kind: "reconnecting", jobId: "job-1" });
		await timers.tick();

		expect(jobs.getState().phase).toEqual({ kind: "running", jobId: "job-1" });
	});

	it("keeps the job through an API restart and backs off while it is down", async () => {
		const { jobs, timers, storage } = store(
			client({}, [
				{ kind: "unreachable" },
				{ kind: "unreachable" },
				{ kind: "found", job: job("running") },
			]),
		);
		jobs.getState().connectCloudSave(saved);
		await jobs.getState().submit(REQUEST);

		await timers.tick();
		expect(jobs.getState().phase).toEqual({ kind: "reconnecting", jobId: "job-1" });
		expect(timers.pending[0]?.delayMs).toBe(2000);
		await timers.tick();
		expect(timers.pending[0]?.delayMs).toBe(4000);
		await timers.tick();

		expect(jobs.getState().phase).toEqual({ kind: "running", jobId: "job-1" });
		expect(timers.pending[0]?.delayMs).toBe(1000);
		expect(storage.values.get(CLOUD_RENDER_JOB_KEY)).toBe("job-1");
	});

	it("says so when the render fails, and forgets it once dismissed", async () => {
		const { jobs, timers, storage } = store(client({}, [{ kind: "found", job: job("failed") }]));
		jobs.getState().connectCloudSave(saved);
		await jobs.getState().submit(REQUEST);
		await timers.tick();

		expect(jobs.getState().phase).toEqual({
			kind: "failed",
			message: "Typelapse Cloud could not render this project.",
			upgradeTo: null,
		});
		expect(storage.values.get(CLOUD_RENDER_JOB_KEY)).toBe("job-1");
		jobs.getState().dismiss();
		expect(jobs.getState().phase).toEqual({ kind: "idle" });
		expect(storage.values.size).toBe(0);
	});

	it("shows the grace period's sentence once a past output is no longer kept", async () => {
		const expired = {
			kind: "refused" as const,
			status: 402,
			message: "Free keeps past hosted renders for 30 days; Creator keeps them",
			code: "output-expired",
			upgradeTo: "creator",
		};
		const storage = memoryStorage({ [CLOUD_RENDER_JOB_KEY]: "job-1" });
		const { jobs, timers } = store(
			client({ download: async () => expired }, [{ kind: "found", job: job("succeeded") }]),
			storage,
		);

		jobs.getState().resume();
		await timers.tick();

		expect(jobs.getState().phase).toEqual({
			kind: "expired",
			jobId: "job-1",
			message: expired.message,
			upgradeTo: "creator",
		});
	});

	it("never uploads for a plan without hosted renders, and shows the server's 402", async () => {
		const save = vi.fn(saved);
		const submit = vi.fn(async () => ({
			kind: "refused" as const,
			status: 402,
			message: "Hosted renders come with Creator",
			code: "plan-limit",
			upgradeTo: "creator",
		}));
		const { jobs, storage } = store(
			client({
				submit,
				allowance: async () => ({
					kind: "ok",
					allowance: { sentence: "You are using 0 of 3 cloud projects.", hostedRenders: false },
				}),
			}),
		);
		jobs.getState().connectCloudSave(save);

		await jobs.getState().submit(REQUEST);

		expect(save).not.toHaveBeenCalled();
		expect(submit).toHaveBeenCalledWith({
			renderOptions: expect.objectContaining({ format: "mp4" }),
		});
		expect(jobs.getState().phase).toEqual({
			kind: "failed",
			message: "Hosted renders come with Creator",
			upgradeTo: "creator",
		});
		expect(jobs.getState().allowance?.sentence).toBe("You are using 0 of 3 cloud projects.");
		expect(storage.values.size).toBe(0);
	});

	it("refuses a GIF before anything is saved", async () => {
		const save = vi.fn(saved);
		const { jobs } = store(client());
		jobs.getState().connectCloudSave(save);

		await jobs.getState().submit({ ...REQUEST, format: "gif" });

		expect(save).not.toHaveBeenCalled();
		expect(jobs.getState().phase).toMatchObject({ kind: "failed" });
	});

	it("passes on a failed cloud save without submitting", async () => {
		const submit = vi.fn(client().submit);
		const { jobs } = store(client({ submit }));
		jobs.getState().connectCloudSave(async () => ({
			kind: "failed",
			message: "Hosted project sync is temporarily unavailable.",
		}));

		await jobs.getState().submit(REQUEST);

		expect(submit).not.toHaveBeenCalled();
		expect(jobs.getState().phase).toEqual({
			kind: "failed",
			message: "Hosted project sync is temporarily unavailable.",
			upgradeTo: null,
		});
	});

	it("drops an id the server does not know for this account", async () => {
		const storage = memoryStorage({ [CLOUD_RENDER_JOB_KEY]: "job-9" });
		const { jobs, timers } = store(client({}, [{ kind: "not-found" }]), storage);

		jobs.getState().resume();
		await timers.tick();

		expect(storage.values.size).toBe(0);
		expect(jobs.getState().phase).toMatchObject({ kind: "failed" });
	});
});
