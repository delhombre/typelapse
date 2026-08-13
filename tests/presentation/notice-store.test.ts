import { notify, useNoticeStore } from "@/presentation/stores/notice.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The studio's one feedback surface. A notice arrives, waits politely, and
 * leaves on its own; nothing here blocks, and nothing here is a dialog.
 */

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	// Drain whatever a test left behind so the next one starts clean.
	for (const notice of useNoticeStore.getState().notices) {
		useNoticeStore.getState().dismiss(notice.id);
	}
	vi.useRealTimers();
});

describe("notice store", () => {
	it("adds a notice with its message, defaulting to the info tone", () => {
		notify("Saved.");

		const notices = useNoticeStore.getState().notices;
		expect(notices).toHaveLength(1);
		expect(notices[0]?.message).toBe("Saved.");
		expect(notices[0]?.tone).toBe("info");
	});

	it("carries an error tone and a machine-text detail when given", () => {
		notify("That file could not be read.", { tone: "error", detail: "broken.json" });

		const notice = useNoticeStore.getState().notices[0];
		expect(notice?.tone).toBe("error");
		expect(notice?.detail).toBe("broken.json");
	});

	it("dismisses itself after the default dwell", () => {
		notify("Ephemeral.");
		vi.advanceTimersByTime(4999);
		expect(useNoticeStore.getState().notices).toHaveLength(1);

		vi.advanceTimersByTime(1);
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("honours a custom dwell", () => {
		notify("Quick.", { durationMs: 1000 });
		vi.advanceTimersByTime(1000);
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("can be dismissed by hand, cancelling the timer", () => {
		const id = notify("Dismiss me.");
		useNoticeStore.getState().dismiss(id);
		expect(useNoticeStore.getState().notices).toHaveLength(0);

		// The stale timer must not throw or touch anything later.
		vi.advanceTimersByTime(10000);
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});

	it("stacks notices in arrival order with distinct ids", () => {
		const first = notify("First.");
		const second = notify("Second.");

		const notices = useNoticeStore.getState().notices;
		expect(notices.map((n) => n.message)).toEqual(["First.", "Second."]);
		expect(first).not.toBe(second);
	});

	it("dismisses one without disturbing its neighbours", () => {
		const first = notify("Stays? No.");
		notify("Stays.");
		useNoticeStore.getState().dismiss(first);

		expect(useNoticeStore.getState().notices.map((n) => n.message)).toEqual(["Stays."]);
	});
});
