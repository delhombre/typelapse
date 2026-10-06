import { describe, expect, it } from "vitest";
import { editedLabel, sceneCountLabel } from "../../src/application/project/cloud-project-labels";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("what a cloud project's row says about its contents", () => {
	it("counts scenes, and says so when there are none", () => {
		expect(sceneCountLabel(0)).toBe("No scenes");
		expect(sceneCountLabel(1)).toBe("1 scene");
		expect(sceneCountLabel(12)).toBe("12 scenes");
	});
});

describe("how long ago a cloud project was last saved", () => {
	it("says just now for the first two minutes, then counts minutes, hours and days", () => {
		expect(editedLabel(ago(0), NOW)).toBe("Edited just now");
		expect(editedLabel(ago(5 * MINUTE), NOW)).toBe("Edited 5 min ago");
		expect(editedLabel(ago(3 * HOUR), NOW)).toBe("Edited 3 h ago");
		expect(editedLabel(ago(DAY), NOW)).toBe("Edited yesterday");
		expect(editedLabel(ago(6 * DAY), NOW)).toBe("Edited 6 days ago");
	});

	it("names the day after a month, with the year when it is not this one", () => {
		expect(editedLabel(ago(40 * DAY), NOW, "UTC")).toBe("Edited Aug 27");
		expect(editedLabel(new Date("2025-03-01T10:00:00.000Z"), NOW, "UTC")).toBe(
			"Edited Mar 1, 2025",
		);
	});
});
