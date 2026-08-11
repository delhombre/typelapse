import {
	allowsSingleKeyShortcut,
	isEditableEventTarget,
} from "@/presentation/utils/editable-target";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Dispatches a real KeyboardEvent from `target` and answers `predicate` while
 * the event is still in flight, which is the only time `composedPath()` is
 * populated — a captured event object reports an empty path once dispatch ends.
 * This exercises the predicate exactly as a global listener would.
 */
const whileDispatching = <T>(
	target: Element,
	predicate: (event: KeyboardEvent) => T,
	init: KeyboardEventInit = {},
): T => {
	let answer: { value: T } | null = null;
	const listener = (event: Event) => {
		answer = { value: predicate(event as KeyboardEvent) };
	};

	window.addEventListener("keydown", listener, true);
	target.dispatchEvent(
		new KeyboardEvent("keydown", { key: "s", bubbles: true, composed: true, ...init }),
	);
	window.removeEventListener("keydown", listener, true);

	if (!answer) {
		throw new Error("event never reached the window");
	}
	return (answer as { value: T }).value;
};

const editableAt = (target: Element, init: KeyboardEventInit = {}): boolean => {
	return whileDispatching(target, isEditableEventTarget, init);
};

const allowsAt = (target: Element, init: KeyboardEventInit = {}): boolean => {
	return whileDispatching(target, allowsSingleKeyShortcut, init);
};

const mount = (html: string): HTMLElement => {
	document.body.innerHTML = html;
	return document.body.firstElementChild as HTMLElement;
};

describe("isEditableEventTarget", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("is false for a plain, non-editable element", () => {
		const el = mount("<div><span>press me</span></div>");
		const span = el.querySelector("span") as HTMLElement;

		expect(editableAt(span)).toBe(false);
	});

	it("is true for input, textarea and select", () => {
		mount("<div><input /><textarea></textarea><select></select></div>");

		for (const selector of ["input", "textarea", "select"]) {
			const el = document.querySelector(selector) as HTMLElement;
			expect(editableAt(el)).toBe(true);
		}
	});

	it("is true for a contenteditable host and for anything nested inside it", () => {
		const host = mount('<div contenteditable="true"><span>text</span></div>');
		const nested = host.querySelector("span") as HTMLElement;

		expect(editableAt(host)).toBe(true);
		expect(editableAt(nested)).toBe(true);
	});

	it('is true for contenteditable="plaintext-only"', () => {
		const host = mount('<div contenteditable="plaintext-only"></div>');

		expect(editableAt(host)).toBe(true);
	});

	it('is false for contenteditable="false"', () => {
		const host = mount('<div contenteditable="false"></div>');

		expect(editableAt(host)).toBe(false);
	});

	/**
	 * The defect this predicate exists for. Monaco >= 0.52 types through the
	 * EditContext API: a bare <div class="native-edit-context" role="textbox">
	 * that is neither an <input>/<textarea> nor contenteditable. Every guard
	 * written against tag name plus isContentEditable reads it as decoration.
	 */
	it("is true for an EditContext-backed surface that is not contenteditable", () => {
		const host = mount('<div class="monaco-editor"><div class="native-edit-context"></div></div>');
		const surface = host.querySelector(".native-edit-context") as HTMLElement;
		Object.defineProperty(surface, "editContext", { value: {}, configurable: true });

		// Neither a form control nor contenteditable: the two things the old
		// guards looked for. (jsdom leaves isContentEditable unimplemented, so
		// assert it is not true rather than that it is exactly false.)
		expect(surface.isContentEditable).not.toBe(true);
		expect(surface.getAttribute("contenteditable")).toBeNull();
		expect(editableAt(surface)).toBe(true);
	});

	it("is false when the EditContext property exists but is unset", () => {
		const host = mount("<div><div></div></div>");
		const surface = host.querySelector("div") as HTMLElement;
		Object.defineProperty(surface, "editContext", { value: null, configurable: true });

		expect(editableAt(surface)).toBe(false);
	});

	it("is true for ARIA text-entry roles", () => {
		for (const role of ["textbox", "searchbox", "combobox", "spinbutton"]) {
			const el = mount(`<div role="${role}"></div>`);
			expect(editableAt(el)).toBe(true);
		}
	});

	it("is false for a non-text ARIA role", () => {
		const el = mount('<div role="button"></div>');

		expect(editableAt(el)).toBe(false);
	});

	it("reaches editable hosts across a shadow boundary", () => {
		const host = mount("<div></div>");
		const shadow = host.attachShadow({ mode: "open" });
		const input = document.createElement("input");
		shadow.append(input);

		expect(editableAt(input)).toBe(true);
	});

	it("falls back to the target chain when composedPath is unavailable", () => {
		const host = mount("<div><input /></div>");
		const input = host.querySelector("input") as HTMLElement;

		expect(isEditableEventTarget({ target: input } as unknown as Event)).toBe(true);
	});
});

describe("allowsSingleKeyShortcut", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("allows a bare key pressed outside any editable surface", () => {
		const el = mount("<div></div>");

		expect(allowsAt(el)).toBe(true);
	});

	it("refuses a bare key pressed inside an editable surface", () => {
		const el = mount("<textarea></textarea>");

		expect(allowsAt(el)).toBe(false);
	});

	it("refuses a key held with a modifier, editable or not", () => {
		const el = mount("<div></div>");

		for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
			expect(allowsAt(el, { [modifier]: true })).toBe(false);
		}
	});

	/** Shift is how a keyboard reaches "?" — it does not make a chord. */
	it("still allows a shifted key", () => {
		const el = mount("<div></div>");

		expect(allowsAt(el, { shiftKey: true })).toBe(true);
	});

	it("refuses a key that only repeats an already-held physical key", () => {
		const el = mount("<div></div>");

		expect(allowsAt(el, { repeat: true })).toBe(false);
	});
});
