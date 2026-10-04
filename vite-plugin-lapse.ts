import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Loads the Lapse animation inspector, when it is installed locally.
 *
 * Lapse ships from a private registry tied to a personal course licence. Putting
 * it in package.json would make `pnpm install` fail for everyone who does not
 * hold that licence, CI included, which is not an acceptable trade for a public
 * repository. It therefore lives in `.lapse/`, its own gitignored install
 * with its own manifest, which pnpm never prunes: a package that is merely
 * absent from the project manifest gets removed on the next install.
 *
 * A licence holder sets it up by running the course's install steps inside
 * `.lapse/`, so the registry scope lands in `.lapse/.npmrc` and never in the root.
 *
 * The injection goes through the HTML rather than the app entry because the
 * install module has to run before anything caches the clock. Motion caches
 * requestAnimationFrame and Date.now on import, and a cached reference keeps the
 * real clock, so slow-motion would silently do nothing.
 */
const VIRTUAL_ID = "virtual:lapse";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const GUARD_ID = "virtual:lapse-guard";
const RESOLVED_GUARD_ID = `\0${GUARD_ID}`;
const LAPSE_DIST = ".lapse/node_modules/@aiforui/lapse/dist";

/**
 * The panel is pinned `position: fixed` at `z-index: 2147483647` — the top of
 * the stacking order, by design, so no app can hide the inspector. Nothing can
 * out-stack a maximum z-index, so wherever it sits it swallows every click
 * underneath it, and the product's layout must not be bent around a dev tool.
 * Which means the only question is which slot is emptiest, and the answer is
 * not on the bottom edge at all. Both slots this has already occupied were:
 *
 * - `bottom-left` sat on the export bar's PNG button (154px of panel from the
 *   left edge, 67px of button) at every width the studio uses.
 * - `bottom-center` sat on the landing's instrument dock — measured at 1280×800,
 *   four of its controls at once: backdrop, theme, aspect ratio and "Open
 *   studio".
 *
 * The bottom edge cannot be shared. The studio's belongs to the export bar
 * whole: the format, aspect, resolution, target and Export controls only mount
 * once there are two steps, so an empty studio looks free and a working one is
 * not, and a running render puts a `w-full` status row across all of it.
 *
 * So: the top edge, at its centre — the two collisions above are both bottom
 * furniture, and this is the one slot that meets no control of the studio's at
 * all. Its own cost is the landing's nav island, which passes under it while
 * you scroll back up; the island is hidden for the whole hero, which is the
 * part whose motion is actually inspected, and both the field's Render button
 * and the example rows are the same door into the studio, so covering its CTA
 * strands nobody. The studio's import toast lands here too for its few seconds.
 *
 * At 390 no slot is free of either surface — the studio's nav fills the top
 * edge and its drawer the bottom — and the panel is draggable, which is what
 * that width is left to.
 */
const PANEL_SLOT = "top-center";

/**
 * Single-key shortcuts must not fire while the user is typing, and Lapse binds
 * several (S scope, V video capture, R record, Space pause). Its own guard
 * checks the target's tag name and `isContentEditable`, which was a complete
 * test until editors moved to the EditContext API: Monaco >= 0.52 types into a
 * bare `<div class="native-edit-context" role="textbox">` that is neither a
 * form control nor contenteditable. So typing the letter "s" in the editor
 * armed the scope picker, and latched scope mode then swallowed pointer, key
 * and input events in the capture phase — which is why editor→preview sync,
 * Capture and Share all went quiet at once.
 *
 * That is an upstream defect in a dev-only dependency, so it cannot be fixed
 * in this repository. What this repository does own is the mount, so the guard
 * goes here: Lapse's own key listeners are wrapped, at registration, with the
 * app's editability predicate. Wrapping the listener rather than intercepting
 * the event means propagation is untouched — the keystroke still reaches the
 * editor exactly as before; only Lapse stops hearing it.
 *
 * Remove this once the upstream guard understands EditContext.
 */
const guardModule = (): string => {
	return `
import { isEditableEventTarget } from "/src/presentation/utils/editable-target";

const GUARDED_EVENTS = new Set(["keydown", "keypress"]);
/** Only listeners registered from inside the Lapse bundle are wrapped. */
const LAPSE_FRAME = /@aiforui\\/lapse/;
const wrapped = new WeakMap();

const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;

/** A key that text entry consumes: letters, digits, punctuation, and space.
 *  Escape, Tab, Enter and the arrows have longer names and stay untouched, so
 *  Lapse keeps its escape hatches while typing. */
const isTextKey = (event) =>
	typeof event.key === "string" &&
	event.key.length === 1 &&
	!event.ctrlKey &&
	!event.metaKey &&
	!event.altKey;

const guardFor = (type, listener) => {
	let byType = wrapped.get(listener);
	if (!byType) {
		byType = new Map();
		wrapped.set(listener, byType);
	}

	const existing = byType.get(type);
	if (existing) {
		return existing;
	}

	const guarded = function (event) {
		if (isTextKey(event) && isEditableEventTarget(event)) {
			return;
		}
		return listener.call(this, event);
	};
	byType.set(type, guarded);
	return guarded;
};

const isLapseCaller = () => LAPSE_FRAME.test(new Error().stack || "");

EventTarget.prototype.addEventListener = function (type, listener, options) {
	if (GUARDED_EVENTS.has(type) && typeof listener === "function" && isLapseCaller()) {
		return addListener.call(this, type, guardFor(type, listener), options);
	}
	return addListener.call(this, type, listener, options);
};

EventTarget.prototype.removeEventListener = function (type, listener, options) {
	const guarded = GUARDED_EVENTS.has(type) && typeof listener === "function"
		? wrapped.get(listener)?.get(type)
		: undefined;
	return removeListener.call(this, type, guarded ?? listener, options);
};
`;
};

export function lapse(): Plugin {
	const root = process.cwd();
	const installEntry = resolve(root, `${LAPSE_DIST}/install.mjs`);
	const panelEntry = resolve(root, `${LAPSE_DIST}/panel.mjs`);
	const enabled = existsSync(installEntry) && existsSync(panelEntry);

	return {
		name: "typelapse:lapse",
		apply: "serve",

		config() {
			if (!enabled) {
				return;
			}
			// The package sits outside the project's own node_modules, so the dev
			// server has to be allowed to serve from there.
			return { server: { fs: { allow: [root, resolve(root, ".lapse")] } } };
		},

		configResolved() {
			if (enabled) {
				console.log("  \x1b[36m➜\x1b[0m  \x1b[1mLapse\x1b[0m:    animation inspector active");
			}
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_ID;
			}
			return id === GUARD_ID ? RESOLVED_GUARD_ID : null;
		},

		load(id) {
			if (id === RESOLVED_GUARD_ID) {
				return guardModule();
			}
			if (id !== RESOLVED_ID) {
				return null;
			}
			// Import order matters twice over. The guard is first because imports
			// are hoisted and evaluated in source order, so it has to be in place
			// before Lapse can register a listener. `install` is before `panel`
			// because it patches the clock, and Motion caches rAF and Date.now on
			// import — a cached reference keeps the real clock and slow-motion
			// would silently do nothing.
			return [
				`import ${JSON.stringify(GUARD_ID)};`,
				`import ${JSON.stringify(installEntry)};`,
				`import { mountLapse } from ${JSON.stringify(panelEntry)};`,
				`mountLapse({ position: ${JSON.stringify(PANEL_SLOT)} });`,
			].join("\n");
		},

		transformIndexHtml() {
			if (!enabled) {
				return;
			}
			return [
				{
					tag: "script",
					attrs: { type: "module", src: `/@id/${VIRTUAL_ID}` },
					injectTo: "head-prepend" as const,
				},
			];
		},
	};
}
