import {
	DEFAULT_FIRST_VIDEO_PREFERENCE,
	FIRST_VIDEO_STORAGE_KEY,
	parseFirstVideoPreference,
	readFirstVideoPreference,
	writeFirstVideoPreference,
} from "@/presentation/utils/first-video-preference";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("what the first video card remembers", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts with nothing done and nothing dismissed", () => {
		expect(DEFAULT_FIRST_VIDEO_PREFERENCE).toEqual({
			dismissed: false,
			rendered: false,
			completed: false,
		});
		expect(parseFirstVideoPreference(null)).toEqual(DEFAULT_FIRST_VIDEO_PREFERENCE);
	});

	it("reads back what was written", () => {
		const preference = { dismissed: true, rendered: true, completed: false };
		writeFirstVideoPreference(preference);
		expect(readFirstVideoPreference()).toEqual(preference);
	});

	it("keeps it in a key of its own, never in the project", () => {
		writeFirstVideoPreference({ dismissed: true, rendered: false, completed: false });
		expect(window.localStorage.getItem(FIRST_VIDEO_STORAGE_KEY)).toBe(
			'{"dismissed":true,"rendered":false,"completed":false}',
		);
		expect(FIRST_VIDEO_STORAGE_KEY).not.toBe("typelapse:draft");
	});

	it("ignores a stash it cannot read rather than hiding the card on a guess", () => {
		expect(parseFirstVideoPreference("not json")).toEqual(DEFAULT_FIRST_VIDEO_PREFERENCE);
		expect(parseFirstVideoPreference("[]")).toEqual(DEFAULT_FIRST_VIDEO_PREFERENCE);
		expect(parseFirstVideoPreference('{"dismissed":"yes"}')).toEqual({
			...DEFAULT_FIRST_VIDEO_PREFERENCE,
		});
	});

	it("keeps the fields it understands when another is missing", () => {
		expect(parseFirstVideoPreference('{"dismissed":true}')).toEqual({
			dismissed: true,
			rendered: false,
			completed: false,
		});
	});

	it("stays amnesiac, without throwing, when storage is blocked", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		expect(readFirstVideoPreference()).toEqual(DEFAULT_FIRST_VIDEO_PREFERENCE);
		expect(() =>
			writeFirstVideoPreference({ dismissed: true, rendered: true, completed: true }),
		).not.toThrow();
	});
});
