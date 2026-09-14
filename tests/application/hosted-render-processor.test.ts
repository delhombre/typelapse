import type { ProjectDocumentV2 } from "@/application/project/project-document";
import {
	type RenderJobLease,
	type RenderJobQueuePort,
	createHostedRenderWorker,
} from "@/application/render/hosted-render-worker";
import {
	type HostedMultimediaRendererPort,
	type HostedRenderHeartbeatSchedulerPort,
	type HostedRenderOutputStoragePort,
	createHostedRenderProcessor,
	createUnavailableHostedMultimediaRenderer,
} from "@/application/render/process-hosted-render-job";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-30T20:00:00.000Z");

function documentWith(overrides: Partial<ProjectDocumentV2["project"]> = {}): ProjectDocumentV2 {
	return {
		schemaVersion: 2,
		project: {
			id: "project-1",
			title: "Hosted multimedia",
			canvas: { width: 1920, height: 1080, background: "#111111" },
			settings: {
				progressStyle: "none",
				transitionMs: 650,
				typewriter: false,
				focusZoom: false,
			},
			assets: [],
			audioCues: [],
			scenes: [
				{
					id: "scene-1",
					durationMs: 1_000,
					blocks: [
						{
							id: "text-1",
							kind: "text",
							text: "Rendered from the durable snapshot",
							opacity: 1,
							placement: { x: 0, y: 0, width: 1, height: 1 },
							typography: {
								fontFamily: "Inter",
								fontSize: 64,
								fontWeight: 700,
								color: "#ffffff",
								align: "center",
							},
						},
					],
				},
			],
			...overrides,
		},
	};
}

function lease(document = documentWith()): RenderJobLease {
	return {
		id: "job-1",
		ownerId: "owner-1",
		projectId: document.project.id,
		revision: 4,
		projectDocument: document,
		renderOptions: {
			format: "mp4",
			width: 1920,
			height: 1080,
			fps: 30,
			includeAudio: true,
		},
		compilerVersion: "compiler-v2",
		attempt: 1,
		workerId: "worker-a",
		expiresAt: new Date("2026-08-30T20:00:30.000Z"),
	};
}

class MemoryQueue implements RenderJobQueuePort {
	nextLease: RenderJobLease | null = lease();
	successInput: Parameters<RenderJobQueuePort["succeed"]>[0] | null = null;
	failureInput: Parameters<RenderJobQueuePort["fail"]>[0] | null = null;
	heartbeatApplied = true;
	heartbeatError: Error | null = null;
	successApplied = true;

	async claim() {
		return this.nextLease;
	}

	async heartbeat() {
		if (this.heartbeatError) {
			throw this.heartbeatError;
		}
		return this.heartbeatApplied;
	}

	async succeed(input: Parameters<RenderJobQueuePort["succeed"]>[0]) {
		this.successInput = input;
		return this.successApplied;
	}

	async fail(input: Parameters<RenderJobQueuePort["fail"]>[0]) {
		this.failureInput = input;
		return true;
	}
}

class MemoryRenderer implements HostedMultimediaRendererPort {
	lastInput: Parameters<HostedMultimediaRendererPort["render"]>[0] | null = null;
	readonly cleaned: string[] = [];
	waitForAbort = false;
	artifact = {
		temporaryId: "tmp/render-job-1",
		mimeType: "video/mp4",
		byteSize: 42_000,
	};

	async render(input: Parameters<HostedMultimediaRendererPort["render"]>[0]) {
		this.lastInput = input;
		if (this.waitForAbort) {
			return await new Promise<never>((_resolve, reject) => {
				const aborted = () => reject(input.signal.reason ?? new Error("aborted"));
				if (input.signal.aborted) {
					aborted();
					return;
				}
				input.signal.addEventListener("abort", aborted, { once: true });
			});
		}
		return this.artifact;
	}

	async cleanup(artifact: Parameters<HostedMultimediaRendererPort["cleanup"]>[0]) {
		this.cleaned.push(artifact.temporaryId);
	}
}

class MemoryOutputStorage implements HostedRenderOutputStoragePort {
	lastInput: Parameters<HostedRenderOutputStoragePort["storePrivate"]>[0] | null = null;
	readonly deleted: string[] = [];
	storeError: Error | null = null;

	async storePrivate(input: Parameters<HostedRenderOutputStoragePort["storePrivate"]>[0]) {
		this.lastInput = input;
		if (this.storeError) {
			throw this.storeError;
		}
	}

	async deletePrivate(objectKey: string) {
		this.deleted.push(objectKey);
	}
}

class ControlledHeartbeats implements HostedRenderHeartbeatSchedulerPort {
	started = false;
	stopped = false;
	lastInput: Parameters<HostedRenderHeartbeatSchedulerPort["start"]>[0] | null = null;

	start(input: Parameters<HostedRenderHeartbeatSchedulerPort["start"]>[0]) {
		this.started = true;
		this.lastInput = input;
		return {
			stop: async () => {
				this.stopped = true;
			},
		};
	}

	async beat() {
		await this.lastInput?.heartbeat();
	}
}

function setup(document = documentWith()) {
	const queue = new MemoryQueue();
	queue.nextLease = lease(document);
	const renderer = new MemoryRenderer();
	const outputs = new MemoryOutputStorage();
	const heartbeats = new ControlledHeartbeats();
	const worker = createHostedRenderWorker({
		queue,
		now: () => NOW,
		leaseDurationMs: 30_000,
		maxAttempts: 3,
		retryDelayMs: (attempt) => attempt * 2_000,
	});
	return {
		queue,
		renderer,
		outputs,
		heartbeats,
		worker,
		processor: createHostedRenderProcessor({
			worker,
			renderer,
			outputs,
			heartbeats,
			heartbeatIntervalMs: 10_000,
		}),
	};
}

function imageDocument(): ProjectDocumentV2 {
	return documentWith({
		assets: [
			{
				id: "image-1",
				kind: "image",
				fileName: "cover.png",
				mimeType: "image/png",
				byteSize: 1_000,
				checksum: "a".repeat(64),
				width: 1600,
				height: 900,
			},
		],
		scenes: [
			{
				id: "scene-image",
				durationMs: 1_000,
				blocks: [
					{
						id: "image-block",
						kind: "image",
						assetId: "image-1",
						fit: "cover",
						focalPoint: { x: 0.5, y: 0.5 },
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	});
}

function videoDocument(): ProjectDocumentV2 {
	return documentWith({
		assets: [
			{
				id: "video-1",
				kind: "video",
				fileName: "clip.mp4",
				mimeType: "video/mp4",
				byteSize: 2_000,
				checksum: "b".repeat(64),
				width: 1920,
				height: 1080,
				durationMs: 4_000,
			},
		],
		scenes: [
			{
				id: "scene-video",
				durationMs: 1_000,
				blocks: [
					{
						id: "video-block",
						kind: "video",
						assetId: "video-1",
						fit: "contain",
						focalPoint: { x: 0.5, y: 0.5 },
						trim: { startMs: 0, endMs: 4_000 },
						playbackRate: 1,
						muted: true,
						opacity: 1,
						placement: { x: 0, y: 0, width: 1, height: 1 },
					},
				],
			},
		],
	});
}

function audioOnlyDocument(): ProjectDocumentV2 {
	return documentWith({
		assets: [
			{
				id: "audio-1",
				kind: "audio",
				fileName: "voice.wav",
				mimeType: "audio/wav",
				byteSize: 3_000,
				checksum: "c".repeat(64),
				durationMs: 2_000,
			},
		],
		audioCues: [
			{
				id: "cue-1",
				assetId: "audio-1",
				startMs: 0,
				trim: { startMs: 0, endMs: 2_000 },
				gain: 1,
				fadeInMs: 0,
				fadeOutMs: 0,
			},
		],
		scenes: [],
	});
}

describe("hosted render processor", () => {
	it("renders the immutable text snapshot, stores it privately, cleans temp data, then fences success", async () => {
		const document = documentWith();
		const { processor, renderer, outputs, queue, heartbeats } = setup(document);

		await expect(processor.runOnce("worker-a")).resolves.toBe("succeeded");

		expect(renderer.lastInput?.document).toEqual(document);
		expect(Object.isFrozen(renderer.lastInput?.document)).toBe(true);
		expect(outputs.lastInput).toMatchObject({
			objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
			artifact: { temporaryId: "tmp/render-job-1", mimeType: "video/mp4", byteSize: 42_000 },
		});
		expect(renderer.cleaned).toEqual(["tmp/render-job-1"]);
		expect(queue.successInput).toMatchObject({
			jobId: "job-1",
			workerId: "worker-a",
			attempt: 1,
			output: {
				objectKey: "accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
				mimeType: "video/mp4",
				byteSize: 42_000,
			},
		});
		expect(heartbeats).toMatchObject({ started: true, stopped: true });
	});

	it("cleans temporary and possibly partial private bytes before scheduling a retry", async () => {
		const { processor, renderer, outputs, queue, heartbeats } = setup();
		outputs.storeError = new Error("private storage unavailable");

		await expect(processor.runOnce("worker-a")).resolves.toBe("retry-scheduled");

		expect(renderer.cleaned).toEqual(["tmp/render-job-1"]);
		expect(outputs.deleted).toEqual([
			"accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
		]);
		expect(queue.failureInput).toEqual({
			jobId: "job-1",
			workerId: "worker-a",
			attempt: 1,
			now: NOW,
			error: {
				code: "render-processing-failed",
				message: "private storage unavailable",
			},
			retryAt: new Date("2026-08-30T20:00:02.000Z"),
		});
		expect(heartbeats.stopped).toBe(true);
	});

	it("aborts in-flight rendering when the fenced heartbeat loses its lease", async () => {
		const { processor, renderer, queue, heartbeats } = setup();
		renderer.waitForAbort = true;
		queue.heartbeatApplied = false;

		const processing = processor.runOnce("worker-a");
		await Promise.resolve();
		await Promise.resolve();
		await heartbeats.beat();

		await expect(processing).resolves.toBe("lease-lost");
		expect(renderer.lastInput?.signal.aborted).toBe(true);
		expect(queue.failureInput).toBeNull();
		expect(heartbeats.stopped).toBe(true);
	});

	it("fails closed when heartbeat ownership cannot be confirmed", async () => {
		const { processor, renderer, queue, heartbeats } = setup();
		renderer.waitForAbort = true;
		queue.heartbeatError = new Error("database unavailable");

		const processing = processor.runOnce("worker-a");
		await Promise.resolve();
		await Promise.resolve();
		await heartbeats.beat();

		await expect(processing).resolves.toBe("lease-lost");
		expect(renderer.lastInput?.signal.aborted).toBe(true);
		expect(queue.successInput).toBeNull();
		expect(queue.failureInput).toBeNull();
	});

	it("propagates shutdown abort without acknowledging or retrying the lease", async () => {
		const { processor, renderer, queue } = setup();
		renderer.waitForAbort = true;
		const shutdown = new AbortController();

		const processing = processor.runOnce("worker-a", { signal: shutdown.signal });
		await Promise.resolve();
		await Promise.resolve();
		shutdown.abort(new Error("SIGTERM"));

		await expect(processing).resolves.toBe("aborted");
		expect(renderer.lastInput?.signal.aborted).toBe(true);
		expect(queue.successInput).toBeNull();
		expect(queue.failureInput).toBeNull();
	});

	it.each([
		["text", documentWith()],
		["image", imageDocument()],
		["video", videoDocument()],
		["audio-only", audioOnlyDocument()],
	])("fails %s explicitly when only the audited code renderer exists", async (_kind, document) => {
		const runtime = setup(document);
		const processor = createHostedRenderProcessor({
			worker: runtime.worker,
			renderer: createUnavailableHostedMultimediaRenderer(),
			outputs: runtime.outputs,
			heartbeats: runtime.heartbeats,
			heartbeatIntervalMs: 10_000,
		});

		await expect(processor.runOnce("worker-a")).resolves.toBe("failed");
		expect(runtime.queue.failureInput).toMatchObject({
			error: {
				code: "multimedia-renderer-unavailable",
				message: expect.stringContaining("code-only"),
			},
			retryAt: null,
		});
		expect(runtime.outputs.lastInput).toBeNull();
	});

	it("never publishes a renderer-owned or stale output key", async () => {
		const { processor, renderer, outputs, queue } = setup();
		renderer.artifact = {
			temporaryId: "accounts/foreign/renders/stolen.mp4",
			mimeType: "video/mp4",
			byteSize: 42_000,
		};
		queue.successApplied = false;

		const result = await processor.runOnce("worker-a");

		expect(result).toBe("lease-lost");
		expect(outputs.lastInput?.objectKey).toBe(
			"accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
		);
		expect(queue.successInput?.output.objectKey).not.toContain("foreign");
		expect(outputs.deleted).toEqual([
			"accounts/owner-1/projects/project-1/renders/job-1/attempt-1.mp4",
		]);
	});

	it("rejects an artifact whose media type does not match the durable job", async () => {
		const { processor, renderer, outputs, queue } = setup();
		renderer.artifact = {
			temporaryId: "tmp/wrong-format",
			mimeType: "video/webm",
			byteSize: 42_000,
		};

		await expect(processor.runOnce("worker-a")).resolves.toBe("failed");
		expect(outputs.lastInput).toBeNull();
		expect(renderer.cleaned).toEqual(["tmp/wrong-format"]);
		expect(queue.failureInput).toMatchObject({
			error: { code: "renderer-invalid-output" },
			retryAt: null,
		});
	});
});
