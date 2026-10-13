import { useExportStore } from "@/presentation/stores/export.store";
import { useFirstVideoStore } from "@/presentation/stores/first-video.store";
import {
	type CloudRenderPhase,
	useHostedRenderJobsStore,
} from "@/presentation/stores/hosted-render-jobs.store";
import {
	DEFAULT_FIRST_VIDEO_PREFERENCE,
	FIRST_VIDEO_STORAGE_KEY,
} from "@/presentation/utils/first-video-preference";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function done(filename: string) {
	return {
		kind: "done" as const,
		filename,
		bytes: 10,
		target: "device" as const,
		elapsedMs: 5,
	};
}

describe("the first video card's memory", () => {
	beforeEach(() => {
		window.localStorage.clear();
		useExportStore.setState({ outcome: null });
		useHostedRenderJobsStore.setState({ phase: { kind: "idle" } });
		useFirstVideoStore.setState({
			preference: DEFAULT_FIRST_VIDEO_PREFERENCE,
			completedAtLoad: false,
		});
	});

	it("remembers a finished video, even with no card on screen", () => {
		useExportStore.setState({ outcome: done("typelapse.mp4") });
		expect(useFirstVideoStore.getState().preference.rendered).toBe(true);
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"rendered":true');
	});

	it("keeps it after the outcome is dismissed", () => {
		useExportStore.setState({ outcome: done("typelapse.gif") });
		useExportStore.getState().dismissOutcome();
		expect(useFirstVideoStore.getState().preference.rendered).toBe(true);
	});

	it("does not count a PNG snapshot or a failed render", () => {
		useExportStore.setState({ outcome: done("typelapse.png") });
		useExportStore.setState({ outcome: { kind: "failed", message: "No." } });
		expect(useFirstVideoStore.getState().preference.rendered).toBe(false);
	});

	it("hides for good on Later, stored locally", () => {
		useFirstVideoStore.getState().dismiss();
		expect(useFirstVideoStore.getState().preference.dismissed).toBe(true);
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toContain('"dismissed":true');
	});

	it("records the completion without taking the card away mid-session", () => {
		useFirstVideoStore.getState().markCompleted();
		expect(useFirstVideoStore.getState().preference.completed).toBe(true);
		expect(useFirstVideoStore.getState().completedAtLoad).toBe(false);
	});

	it("does not count a render that was cancelled: the outcome going back to null", () => {
		useExportStore.setState({ outcome: null });
		useExportStore.setState({ isExporting: true, outcome: null });
		useExportStore.setState({ isExporting: false, outcome: null });
		expect(useFirstVideoStore.getState().preference.rendered).toBe(false);
	});

	describe("a hosted Cloud render", () => {
		const download = {
			url: "https://example.test/v.mp4",
			expiresAt: "2026-10-20T00:00:00Z",
			mimeType: "video/mp4",
			byteSize: 10,
		};
		const succeeded = (jobId: string): CloudRenderPhase => ({ kind: "succeeded", jobId, download });

		it("ticks when it succeeds", () => {
			useHostedRenderJobsStore.setState({ phase: { kind: "running", jobId: "j1" } });
			expect(useFirstVideoStore.getState().preference.rendered).toBe(false);
			useHostedRenderJobsStore.setState({ phase: succeeded("j1") });
			expect(useFirstVideoStore.getState().preference.rendered).toBe(true);
		});

		it("ticks when a reload resumes straight onto a success", () => {
			useHostedRenderJobsStore.setState({ phase: { kind: "reconnecting", jobId: "j1" } });
			useHostedRenderJobsStore.setState({ phase: succeeded("j1") });
			expect(useFirstVideoStore.getState().preference.rendered).toBe(true);
		});

		it("does not tick when it fails, is queued or expires", () => {
			useHostedRenderJobsStore.setState({ phase: { kind: "queued", jobId: "j1" } });
			useHostedRenderJobsStore.setState({
				phase: { kind: "failed", message: "No.", upgradeTo: null },
			});
			useHostedRenderJobsStore.setState({
				phase: { kind: "expired", jobId: "j1", message: "Gone.", upgradeTo: null },
			});
			expect(useFirstVideoStore.getState().preference.rendered).toBe(false);
		});
	});

	it("merges with what is stored before writing, so a second tab's choice survives", () => {
		// Another tab hid the card after this one loaded.
		window.localStorage.setItem(
			FIRST_VIDEO_STORAGE_KEY,
			'{"dismissed":true,"rendered":false,"completed":false}',
		);
		useFirstVideoStore.getState().markRendered();
		expect(JSON.parse(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY) ?? "{}")).toEqual({
			dismissed: true,
			rendered: true,
			completed: false,
		});
		expect(useFirstVideoStore.getState().preference.dismissed).toBe(true);
	});

	describe("with storage blocked (private mode)", () => {
		beforeEach(() => {
			vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
				throw new Error("blocked");
			});
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				throw new Error("blocked");
			});
		});
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("keeps what this tab already knows across a second write", () => {
			useFirstVideoStore.getState().dismiss();
			useFirstVideoStore.getState().markRendered();
			expect(useFirstVideoStore.getState().preference).toEqual({
				dismissed: true,
				rendered: true,
				completed: false,
			});
			useFirstVideoStore.getState().markCompleted();
			expect(useFirstVideoStore.getState().preference.rendered).toBe(true);
			expect(useFirstVideoStore.getState().preference.dismissed).toBe(true);
		});
	});
});
