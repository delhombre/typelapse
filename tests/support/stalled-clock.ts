import { vi } from "vitest";

/**
 * Runs `work` on a clock that jumps a second at every read: what a loaded render
 * node looks like to Shiki. Its per-line time limit (vscode-textmate reads
 * `Date.now()` before each scan of a line) then trips on the first check of every
 * line, which a CPU hog only does on a heavily loaded machine (#315), and this
 * does on every run.
 */
export function onStalledClock<T>(work: () => T): T {
	let now = Date.now();
	const clock = vi.spyOn(Date, "now").mockImplementation(() => {
		now += 1_000;
		return now;
	});
	try {
		return work();
	} finally {
		clock.mockRestore();
	}
}
