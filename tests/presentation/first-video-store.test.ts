import { useExportStore } from "@/presentation/stores/export.store";
import { useFirstVideoStore } from "@/presentation/stores/first-video.store";
import {
	DEFAULT_FIRST_VIDEO_PREFERENCE,
	FIRST_VIDEO_STORAGE_KEY,
} from "@/presentation/utils/first-video-preference";
import { beforeEach, describe, expect, it } from "vitest";

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
});
