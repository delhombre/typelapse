// @vitest-environment node
/**
 * The static poster's highlighter: the first frame as HTML before the plan is
 * ready, cached by the poster. A loaded machine must not cut its lines short
 * either, or the poster and the first frame of the video disagree (#315).
 */

import { ShikiAdapter } from "@/infrastructure/highlighting/shiki.adapter";
import { MAX_TOKENIZED_LINE_COLUMNS } from "@/infrastructure/highlighting/whole-line-tokenization";
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

	it("leaves a line past the length cap as one token with no colour of its own (#331)", async () => {
		const line = "x=1;".repeat(MAX_TOKENIZED_LINE_COLUMNS);
		const html = await new ShikiAdapter().highlight(
			`const a = 1;\n${line}`,
			"typescript",
			"midnight",
		);
		// No `color:` style: the span inherits the <pre>'s foreground, as the DOM preview does.
		expect(html).toContain(`<span class="line"><span>${line}</span></span>`);
	});
});
