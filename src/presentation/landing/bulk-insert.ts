/**
 * A long insertion into the hero's field, taken in one step.
 *
 * Chromium runs `insertText` as one editing command per line it inserts, and
 * each of them walks what the previous ones left: the cost is quadratic. A bare
 * `<textarea>` with no page around it takes 0.9 s for 1,500 lines and 61 s for
 * 8,000 (measured with Playwright's `fill`, which is `insertText`). The same
 * 8,000 lines arriving by Cmd+V take about 100 ms, because a paste is another
 * command; so the slow path is not what a person does with the field, it is what
 * an input method, a dictation tool or an automated test does. (It reaches the
 * page as one `beforeinput` carrying the whole text. `document.execCommand`
 * splits it into one event per line, so the page cannot take that one over.)
 *
 * The cost is the browser's, not the page's, so the page cannot make the command
 * faster. It can do the assignment itself when the insertion is long enough for
 * the difference to be felt. A real paste (`insertFromPaste`) is left alone, so
 * it keeps its native undo; only a long `insertText` loses it.
 */

/** Below this many line breaks the native command is quick and keeps its undo. */
export const BULK_INSERT_LINE_BREAKS = 300;

function countLineBreaks(text: string): number {
	let count = 0;
	for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
		count += 1;
	}
	return count;
}

/**
 * If this `beforeinput` is a long `insertText`, do it and return the field's new
 * value; otherwise return null and leave the event to the browser.
 */
export function takeBulkInsert(event: InputEvent, field: HTMLTextAreaElement): string | null {
	if (event.inputType !== "insertText" || !event.data) {
		return null;
	}
	if (countLineBreaks(event.data) < BULK_INSERT_LINE_BREAKS) {
		return null;
	}
	event.preventDefault();
	const { value, selectionStart, selectionEnd } = field;
	const next = value.slice(0, selectionStart) + event.data + value.slice(selectionEnd);
	// The instance's own setter, which React's value tracking listens to. Going
	// round it (`setRangeText`) leaves React believing the field still holds the
	// old text, and it would then drop the next change that happens to match it.
	field.value = next;
	const caret = selectionStart + event.data.length;
	field.setSelectionRange(caret, caret);
	return next;
}
