import { vi } from "vitest";

/**
 * Runs `work` on a clock that jumps a second at every read: what a loaded render
 * node looks like to Shiki. Its per-line time limit (vscode-textmate reads
 * `Date.now()` before each scan of a line) then trips on the first check of every
 * line, which a CPU hog only does on a heavily loaded machine (#315), and this
 * does on every run.
 *
 * The trick relies on vscode-textmate timing a line with the global `Date.now()`;
 * if it ever moves to `performance.now()`, this clock stops tripping the limit.
 */
export function onStalledClock<T>(work: () => T): T {
	const clock = stallClock();
	try {
		return work();
	} finally {
		clock.mockRestore();
	}
}

/** {@link onStalledClock} for work that awaits, the clock stalled until it settles. */
export async function onStalledClockAsync<T>(work: () => Promise<T>): Promise<T> {
	const clock = stallClock();
	try {
		return await work();
	} finally {
		clock.mockRestore();
	}
}

function stallClock() {
	let now = Date.now();
	return vi.spyOn(Date, "now").mockImplementation(() => {
		now += 1_000;
		return now;
	});
}
