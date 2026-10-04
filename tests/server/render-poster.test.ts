import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type RemotionV2RuntimePort,
	createHostedRemotionV2Renderer,
} from "../../server/render/v2/remotion-v2-renderer";
import { migrateV1ToV2 } from "../../src/application/project/migrate-v1-project";
import {
	type RenderJobLease,
	type RenderJobQueuePort,
	createHostedRenderWorker,
} from "../../src/application/render/hosted-render-worker";
import {
	type HostedMultimediaRendererPort,
	type HostedRenderOutputStoragePort,
	type HostedRenderTemporaryArtifact,
	createHostedRenderProcessor,
} from "../../src/application/render/process-hosted-render-job";

const DOCUMENT = migrateV1ToV2({
	title: "Poster",
	code: "const poster = true;",
	language: "typescript",
	themeName: "midnight",
	background: "mesh:solar",
	steps: [
		{ code: "const poster = true;", duration: 2000 },
		{ code: "const poster = false;", duration: 1000 },
	],
});

const OPTIONS = { format: "mp4", width: 1280, height: 720, fps: 30, includeAudio: false } as const;

function runtime(stills: Array<{ frame: number; outputPath: string }>, failStill = false) {
	const port: RemotionV2RuntimePort = {
		bundle: async () => "http://remotion.invalid/bundle",
		selectComposition: async () => ({ id: "TypelapseV2" }),
		async renderMedia(input) {
			await writeFile(input.outputPath, Buffer.from("rendered-mp4"));
		},
		async renderStill(input) {
			if (failStill) throw new Error("no browser for a still");
			stills.push({ frame: input.frame, outputPath: input.outputPath });
			await writeFile(input.outputPath, Buffer.from("poster-jpeg"));
		},
	};
	return port;
}

describe("the renderer's poster frame", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	async function render(port: RemotionV2RuntimePort) {
		const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "typelapse-poster-"));
		roots.push(temporaryRoot);
		const renderer = createHostedRemotionV2Renderer({
			assets: { materializePrivateAsset: async () => undefined },
			runtime: port,
			temporaryRoot,
		});
		const artifact = await renderer.render({
			jobId: "job_1",
			ownerId: "owner-1",
			projectId: DOCUMENT.project.id,
			revision: 1,
			document: DOCUMENT,
			options: OPTIONS,
			compilerVersion: "compiler-v2",
			signal: new AbortController().signal,
		});
		return { renderer, artifact };
	}

	it("renders a still of the first scene, settled, beside the output", async () => {
		const stills: Array<{ frame: number; outputPath: string }> = [];
		const { renderer, artifact } = await render(runtime(stills));

		// 80% into the first scene's 2 s hold at 30 fps: the code is on screen and still.
		expect(stills).toEqual([{ frame: 48, outputPath: expect.stringMatching(/poster\.jpg$/) }]);
		expect(artifact.poster).toEqual({
			temporaryId: stills[0]?.outputPath,
			mimeType: "image/jpeg",
			byteSize: Buffer.byteLength("poster-jpeg"),
		});
		await renderer.cleanup(artifact);
	});

	it("still delivers the video when the still fails", async () => {
		const { artifact } = await render(runtime([], true));

		expect(artifact.mimeType).toBe("video/mp4");
		expect(artifact.poster).toBeUndefined();
	});
});

function lease(): RenderJobLease {
	return {
		id: "job_1",
		ownerId: "owner-1",
		projectId: DOCUMENT.project.id,
		revision: 1,
		projectDocument: DOCUMENT,
		renderOptions: OPTIONS,
		compilerVersion: "compiler-v2",
		attempt: 1,
		workerId: "worker-a",
		expiresAt: new Date("2026-10-04T10:00:30.000Z"),
	};
}

function harness(options: { readonly posterFails?: boolean; readonly leaseLost?: boolean } = {}) {
	const succeeded: Array<Parameters<RenderJobQueuePort["succeed"]>[0]> = [];
	const stored: string[] = [];
	const deleted: string[] = [];
	const queue: RenderJobQueuePort = {
		claim: async () => lease(),
		heartbeat: async () => true,
		async succeed(input) {
			succeeded.push(input);
			return !options.leaseLost;
		},
		fail: async () => true,
	};
	const artifact: HostedRenderTemporaryArtifact = {
		temporaryId: "tmp/output.mp4",
		mimeType: "video/mp4",
		byteSize: 42,
		poster: { temporaryId: "tmp/poster.jpg", mimeType: "image/jpeg", byteSize: 7 },
	};
	const renderer: HostedMultimediaRendererPort = {
		render: async () => artifact,
		cleanup: async () => undefined,
	};
	const outputs: HostedRenderOutputStoragePort = {
		async storePrivate(input) {
			if (options.posterFails && input.artifact.mimeType === "image/jpeg") {
				throw new Error("storage refused the poster");
			}
			stored.push(input.objectKey);
		},
		async deletePrivate(objectKey) {
			deleted.push(objectKey);
		},
	};
	const processor = createHostedRenderProcessor({
		worker: createHostedRenderWorker({
			queue,
			leaseDurationMs: 30_000,
			maxAttempts: 3,
			retryDelayMs: () => 1000,
			now: () => new Date("2026-10-04T10:00:00.000Z"),
		}),
		renderer,
		outputs,
		heartbeats: { start: () => ({ stop: async () => undefined }) },
		heartbeatIntervalMs: 1000,
	});
	return { processor, succeeded, stored, deleted };
}

const VIDEO_KEY = `accounts/owner-1/projects/${encodeURIComponent(DOCUMENT.project.id)}/renders/job_1/attempt-1.mp4`;
const POSTER_KEY = `accounts/owner-1/projects/${encodeURIComponent(DOCUMENT.project.id)}/renders/job_1/attempt-1.poster.jpg`;

describe("the processor stores the poster with the output", () => {
	it("publishes the poster key beside the video under the same fence", async () => {
		const { processor, succeeded, stored } = harness();

		await expect(processor.runOnce("worker-a")).resolves.toBe("succeeded");
		expect(stored).toEqual([VIDEO_KEY, POSTER_KEY]);
		expect(succeeded[0]?.output).toEqual({
			objectKey: VIDEO_KEY,
			mimeType: "video/mp4",
			byteSize: 42,
			posterObjectKey: POSTER_KEY,
		});
	});

	it("succeeds without a poster when storing it fails", async () => {
		const { processor, succeeded } = harness({ posterFails: true });

		await expect(processor.runOnce("worker-a")).resolves.toBe("succeeded");
		expect(succeeded[0]?.output).toEqual({
			objectKey: VIDEO_KEY,
			mimeType: "video/mp4",
			byteSize: 42,
		});
	});

	it("deletes both objects when the fence is lost before publication", async () => {
		const { processor, deleted } = harness({ leaseLost: true });

		await expect(processor.runOnce("worker-a")).resolves.toBe("lease-lost");
		expect(deleted.sort()).toEqual([VIDEO_KEY, POSTER_KEY].sort());
	});
});
