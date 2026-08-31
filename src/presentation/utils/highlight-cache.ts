/**
 * Process-wide memo for static Shiki frames across the product and landing.
 *
 * Highlighting is pure — identical code, language and theme produce identical
 * HTML — but asynchronous. Callers can paint a synchronous fallback on a cold
 * key and share the same in-flight request instead of tokenising repeatedly.
 */

const resolved = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function highlightCacheKey(themeName: string, language: string, code: string): string {
	return `${themeName}:${language}:${code}`;
}

/** The highlighted HTML if it is already known, `undefined` on a cold cache. */
export function readHighlight(key: string): string | undefined {
	return resolved.get(key);
}

/** Resolve `key`, running `load` once and sharing simultaneous requests. */
export function highlightOnce(key: string, load: () => Promise<string>): Promise<string> {
	const cached = resolved.get(key);
	if (cached !== undefined) {
		return Promise.resolve(cached);
	}

	const pending = inFlight.get(key);
	if (pending) {
		return pending;
	}

	const request = load()
		.then((html) => {
			resolved.set(key, html);
			inFlight.delete(key);
			return html;
		})
		.catch((error: unknown) => {
			inFlight.delete(key);
			throw error;
		});

	inFlight.set(key, request);
	return request;
}

/** Drop everything, so a test suite starts from a cold cache. */
export function clearHighlightCache(): void {
	resolved.clear();
	inFlight.clear();
}
