// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sentence } from "../../cli/errors";

describe("sentence", () => {
	it.each([
		["  Could not render\n the  video ", "Could not render the video."],
		["Is the token set?", "Is the token set?"],
		["Already done.", "Already done."],
		["Chrome crashed during the render process!", "Chrome crashed during the render process!"],
	])("ends %j on one mark", (message, said) => {
		expect(sentence(message)).toBe(said);
	});
});
