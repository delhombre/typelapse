/**
 * Scoped stand-ins for the two browser calls jsdom does not implement and the
 * code under test makes on purpose.
 *
 * jsdom answers them with a "Not implemented" line on the virtual console and
 * returns nothing, once per call. The gate (`.craft/verify.sh`) fails on that
 * line, so a test that reaches one of them names it here, for its own file,
 * rather than every test getting a stub that hides the next stray caller.
 */

import { type MockInstance, afterAll, beforeEach, vi } from "vitest";

/**
 * Takes the spy before each test and gives the method back after the file's last
 * one. Not after each test: a Motion frame or a font-load callback that lands
 * between two tests, or after the last, must find the stand-in still in place.
 */
function holdForFile(taken: () => MockInstance): void {
	let spy: MockInstance | undefined;
	beforeEach(() => {
		spy = taken();
	});
	afterAll(() => {
		spy?.mockRestore();
	});
}

/** Advance of JetBrains Mono and the monospaces it falls back to, in em. */
const MONOSPACE_ADVANCE_EM = 0.6;

/**
 * Gives `<canvas>.getContext("2d")` a context that measures text the way a real
 * monospace face does: 0.6 em per character at the size in `font`. The
 * composition measures its theme font's advance on one (`measureAdvance`), and
 * a card sized on any other number is not the card a browser draws.
 */
export function useMonospaceCanvas(): void {
	holdForFile(() => {
		const meter = {
			font: "",
			measureText(text: string) {
				const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(meter.font)?.[1] ?? "0");
				return { width: MONOSPACE_ADVANCE_EM * size * text.length };
			},
		};
		return vi
			.spyOn(HTMLCanvasElement.prototype, "getContext")
			.mockReturnValue(meter as unknown as CanvasRenderingContext2D);
	});
}

/**
 * Makes `window.scrollTo` a no-op. Motion's keyframe resolver calls it to
 * restore the scroll position after measuring; jsdom has no scrolling to restore.
 */
export function useInertWindowScroll(): void {
	holdForFile(() => vi.spyOn(window, "scrollTo").mockImplementation(() => undefined));
}

/** What a test can make the next read of the instant reader do instead of answering. */
export interface InstantFileReaderControls {
	/** The next read fires `onerror` (a permission, a file removed after the pick). */
	failNext(): void;
	/** The next read fires `onabort`, as `reader.abort()` would. */
	abortNext(): void;
}

/**
 * A `FileReader` that answers inside the call that asked, for a file a test built
 * from strings in this file.
 *
 * jsdom's reader finishes on a later turn of the task queue, so a test that picks a
 * file and then asserts waits on a real clock, and a loaded machine overruns the
 * default one-second wait of `findBy`/`waitFor`. Answered inside the change event
 * (which `fireEvent` wraps in `act`), the result and the render it causes are
 * settled when `fireEvent` returns, and nothing waits at all.
 *
 * jsdom 26 has no `Blob.text()` either, so `File` is wrapped to remember the
 * strings it was built from. Only a text reader is stood in for. A file that was
 * not built from strings alone (bytes, a bare `Blob`) throws instead of reading as
 * empty: a silent "" would hide a test that picked the wrong file. `failNext()` and
 * `abortNext()` make the next read fail or abort, for the paths a real disk takes.
 */
export function useInstantFileReader(): InstantFileReaderControls {
	const RealFile = globalThis.File;
	const texts = new WeakMap<Blob, string>();
	let next: "read" | "fail" | "abort" = "read";

	class TextRememberingFile extends RealFile {
		constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
			super(parts, name, options);
			if (parts.every((part) => typeof part === "string")) {
				texts.set(this, parts.join(""));
			}
		}
	}

	class InstantFileReader {
		result: string | null = null;
		onload: ((event: { target: InstantFileReader }) => void) | null = null;
		onerror: ((event: { target: InstantFileReader }) => void) | null = null;
		onabort: ((event: { target: InstantFileReader }) => void) | null = null;

		readAsText(file: Blob): void {
			const outcome = next;
			next = "read";
			if (outcome === "fail") {
				this.onerror?.({ target: this });
				return;
			}
			if (outcome === "abort") {
				this.onabort?.({ target: this });
				return;
			}
			const text = texts.get(file);
			if (text === undefined) {
				throw new Error(
					"useInstantFileReader: this file was not built from strings in this test file, so it has no text to read",
				);
			}
			this.result = text;
			this.onload?.({ target: this });
		}
	}

	beforeEach(() => {
		next = "read";
		vi.stubGlobal("File", TextRememberingFile);
		vi.stubGlobal("FileReader", InstantFileReader);
	});
	afterAll(() => {
		vi.unstubAllGlobals();
	});

	return {
		failNext: () => {
			next = "fail";
		},
		abortNext: () => {
			next = "abort";
		},
	};
}
