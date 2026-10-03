/**
 * Order-insensitive JSON for comparing documents that crossed a store free to
 * reorder object keys. PostgreSQL `jsonb` does exactly that, so a project the
 * server echoes back is the same project even when `JSON.stringify` disagrees.
 *
 * Object keys are sorted at every depth. Arrays keep their order: scene, block
 * and cue order is meaning, not formatting. Everything else follows
 * `JSON.stringify` (`toJSON`, dropped `undefined` fields).
 */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, entry: unknown) => {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			return entry;
		}
		const source = entry as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(source).sort()) {
			sorted[key] = source[key];
		}
		return sorted;
	});
}
