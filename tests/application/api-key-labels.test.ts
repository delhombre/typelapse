import { describe, expect, it } from "vitest";
import { expiryLabel, lastUsedLabel } from "../../src/application/auth/api-key-labels";

const NOW = new Date("2026-10-05T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("how long ago a key was last used", () => {
	it("says so for a key that never was", () => {
		expect(lastUsedLabel(null, NOW)).toBe("Never used");
	});

	it("says just now for the first two minutes, and counts minutes after that", () => {
		expect(lastUsedLabel(ago(0), NOW)).toBe("Used just now");
		expect(lastUsedLabel(ago(2 * MINUTE - 1), NOW)).toBe("Used just now");
		expect(lastUsedLabel(ago(2 * MINUTE), NOW)).toBe("Used 2 min ago");
		expect(lastUsedLabel(ago(59 * MINUTE + 59_000), NOW)).toBe("Used 59 min ago");
	});

	it("counts hours up to a day, then days up to a month", () => {
		expect(lastUsedLabel(ago(HOUR), NOW)).toBe("Used 1 h ago");
		expect(lastUsedLabel(ago(23 * HOUR + 59 * MINUTE), NOW)).toBe("Used 23 h ago");
		expect(lastUsedLabel(ago(DAY), NOW)).toBe("Used yesterday");
		expect(lastUsedLabel(ago(2 * DAY), NOW)).toBe("Used 2 days ago");
		expect(lastUsedLabel(ago(29 * DAY), NOW)).toBe("Used 29 days ago");
	});

	it("names the day once it is a month or more ago, with the year when it is not this one", () => {
		expect(lastUsedLabel(ago(30 * DAY), NOW, "UTC")).toBe("Used Sep 5");
		expect(lastUsedLabel(new Date("2025-12-31T23:00:00.000Z"), NOW, "UTC")).toBe(
			"Used Dec 31, 2025",
		);
	});

	it("does not run backwards when the machine that wrote it ran ahead", () => {
		expect(lastUsedLabel(new Date(NOW.getTime() + 5 * MINUTE), NOW)).toBe("Used just now");
	});
});

describe("when a key stops working", () => {
	it("has nothing to say for a key that never expires", () => {
		expect(expiryLabel(null, NOW)).toBeNull();
	});

	it("names the day while it is ahead, with the year when it is not this one", () => {
		expect(expiryLabel(new Date("2026-11-04T12:00:00.000Z"), NOW, "UTC")).toBe("Expires Nov 4");
		expect(expiryLabel(new Date("2027-01-02T12:00:00.000Z"), NOW, "UTC")).toBe(
			"Expires Jan 2, 2027",
		);
	});

	it("says expired from the very instant it is", () => {
		expect(expiryLabel(new Date(NOW.getTime() + 1), NOW, "UTC")).toBe("Expires Oct 5");
		expect(expiryLabel(NOW, NOW)).toBe("Expired");
		expect(expiryLabel(ago(3 * DAY), NOW)).toBe("Expired");
	});
});
