import { captionsBakedFor } from "@/application/captions/caption-baking";
import { describe, expect, it } from "vitest";

/**
 * #271: the frame in the preview is what the chosen Where exports. The painter
 * (This device) bakes no caption; Remotion (the local server and Cloud) does.
 */
describe("captionsBakedFor", () => {
	it("is false on this device, whose painter draws no caption", () => {
		expect(captionsBakedFor("device")).toBe(false);
	});

	it("is true where Remotion renders the video", () => {
		expect(captionsBakedFor("server")).toBe(true);
		expect(captionsBakedFor("cloud")).toBe(true);
	});
});
