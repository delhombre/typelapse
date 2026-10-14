// @vitest-environment node
/**
 * The static poster's highlighter: the first frame as HTML before the plan is
 * ready, cached by the poster. A loaded machine must not cut its lines short
 * either, or the poster and the first frame of the video disagree (#315).
 */

import { ShikiAdapter } from "@/infrastructure/highlighting/shiki.adapter";
import { describe, expect, it } from "vitest";
import { onStalledClockAsync } from "../support/stalled-clock";

const CODE = "function greet(name: string) {\n  return `Hi ${name}`;\n}";

describe("ShikiAdapter.highlight", () => {
	it("highlights every token when each line overruns Shiki's time limit (#315)", async () => {
		const adapter = new ShikiAdapter();
		const unhurried = await adapter.highlight(CODE, "typescript", "midnight");
		const stalled = await onStalledClockAsync(() =>
			adapter.highlight(CODE, "typescript", "midnight"),
		);
		expect(stalled).toBe(unhurried);
	});
});
