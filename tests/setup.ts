/**
 * Node 24 exposes a native `localStorage` getter, but without
 * `--localstorage-file` it resolves to undefined. Vitest 3 then keeps that
 * reserved global instead of installing jsdom's isolated Storage instance.
 * Resolve through the active jsdom on every access so each test file keeps its
 * own browser storage; node-environment suites still see no localStorage.
 */
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	get: () =>
		(
			globalThis as typeof globalThis & {
				jsdom?: { window: { localStorage: Storage } };
			}
		).jsdom?.window.localStorage,
});
