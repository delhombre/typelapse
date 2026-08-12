/**
 * Whether a keystroke came from a surface that is currently taking text.
 *
 * Single-key shortcuts and text entry compete for the same keys, so every
 * global shortcut has to be able to tell them apart. The usual guard checks the
 * tag name and `isContentEditable` of `document.activeElement`, and that guard
 * is now wrong in two ways.
 *
 * It asks the wrong element. `document.activeElement` is where focus happens to
 * be when the handler runs, not where the key was pressed; the event's own path
 * is the only authority on that, and it is also the only thing that sees
 * through a shadow root.
 *
 * And it asks the wrong question. Monaco >= 0.52 types through the EditContext
 * API: its text surface is a bare `<div class="native-edit-context"
 * role="textbox">` that is neither a form control nor contenteditable, so a
 * tag-name guard reads it as decoration and lets every letter through. That is
 * a capability, not a kind of element, so this asks about capabilities:
 * contenteditable, an attached EditContext, a form control, or an ARIA
 * text-entry role. Anything that grows a new way to take text is covered by the
 * same four questions; a list of known editor class names would not be.
 */

const FORM_CONTROLS = new Set(["input", "textarea", "select"]);

/** ARIA roles whose contract is "this element receives typed characters". */
const TEXT_ENTRY_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

/** Values of the contenteditable attribute that turn editing on. */
const EDITABLE_ATTRIBUTE_VALUES = new Set(["", "true", "plaintext-only", "caret"]);

const isElement = (node: unknown): node is Element => {
	return node instanceof Element;
};

const takesText = (el: Element): boolean => {
	if (FORM_CONTROLS.has(el.tagName.toLowerCase())) {
		return true;
	}

	// An element hosting an EditContext is a text surface by definition, whatever
	// it is made of. This is how Monaco, and increasingly every editor that wants
	// real IME support, receives input.
	if ("editContext" in el && (el as { editContext?: unknown }).editContext) {
		return true;
	}

	if (el instanceof HTMLElement && el.isContentEditable) {
		return true;
	}

	// jsdom, and any detached subtree, computes isContentEditable as false; the
	// attribute is still the author's stated intent.
	const attribute = el.getAttribute("contenteditable");
	if (attribute !== null && EDITABLE_ATTRIBUTE_VALUES.has(attribute.toLowerCase())) {
		return true;
	}

	const role = el.getAttribute("role");
	return role !== null && TEXT_ENTRY_ROLES.has(role.toLowerCase());
};

/**
 * Walks up from the target when the event cannot report its own path, so the
 * predicate still answers correctly for a synthetic or replayed event.
 */
const ancestorsOf = (target: EventTarget | null): Element[] => {
	const chain: Element[] = [];
	let node = isElement(target) ? target : null;

	while (node) {
		chain.push(node);
		node = node.parentElement;
	}

	return chain;
};

/** True when the event originated inside any surface that is taking text. */
export function isEditableEventTarget(event: Pick<Event, "target"> & Partial<Event>): boolean {
	const path =
		typeof event.composedPath === "function" ? event.composedPath() : ancestorsOf(event.target);

	return path.some((node) => isElement(node) && takesText(node));
}

/**
 * True when a bare-key shortcut is allowed to act on this keystroke.
 *
 * A single key is only a shortcut when nothing else claims it: no editable
 * surface underneath, no chord modifier held, and not the auto-repeat of a key
 * that is already down. Shift is deliberately not a chord modifier — it is how
 * a keyboard reaches characters like "?".
 */
export function allowsSingleKeyShortcut(event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
		return false;
	}

	return !isEditableEventTarget(event);
}
