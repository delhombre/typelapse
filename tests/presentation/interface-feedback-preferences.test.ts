import {
	DEFAULT_INTERFACE_FEEDBACK,
	INTERFACE_FEEDBACK_STORAGE_KEY,
	parseInterfaceFeedbackPreference,
	readInterfaceFeedbackPreference,
	writeInterfaceFeedbackPreference,
} from "@/presentation/utils/interface-feedback-preferences";
import { beforeEach, describe, expect, it } from "vitest";

describe("interface feedback preference", () => {
	beforeEach(() => window.localStorage.clear());

	it("starts on so the product feels responsive on its first deliberate press", () => {
		expect(DEFAULT_INTERFACE_FEEDBACK).toBe(true);
		expect(parseInterfaceFeedbackPreference(null)).toBe(true);
	});

	it("accepts only the tiny versioned shape it owns", () => {
		expect(parseInterfaceFeedbackPreference('{"version":1,"enabled":false}')).toBe(false);
		expect(parseInterfaceFeedbackPreference('{"version":1,"enabled":true}')).toBe(true);
		expect(parseInterfaceFeedbackPreference("nope")).toBe(true);
		expect(parseInterfaceFeedbackPreference('{"enabled":false}')).toBe(true);
	});

	it("persists separately from exported video sound", () => {
		writeInterfaceFeedbackPreference(false);
		expect(readInterfaceFeedbackPreference()).toBe(false);
		expect(window.localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY)).toBe(
			'{"version":1,"enabled":false}',
		);
		expect(window.localStorage.getItem("typelapse:draft")).toBeNull();
	});
});
