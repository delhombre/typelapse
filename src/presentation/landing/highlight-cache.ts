/**
 * A process-wide memo of Shiki output for the landing page's static frames.
 *
 * Highlighting is pure — the same code, language and theme always produce the
 * same HTML — but it is asynchronous, so a component that highlights on mount
 * paints empty first and swaps the code in a frame later. The landing page now
 * keeps five feeds mounted and cycles between them forever; without this memo it
 * re-tokenised the same five snippets on every pass, and every remount paid the
 * empty-then-swap flash again.
 *
 * The cache *is* the state: callers read it synchronously during render and only
 * fall back to the async path on a miss. Failures are never cached, so a later
 * mount can retry.
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

/**
 * Resolve the highlight for `key`, running `load` at most once per key: cached
 * keys resolve immediately and simultaneous callers share the one request.
 */
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
