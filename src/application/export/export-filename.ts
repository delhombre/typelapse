/**
 * The file a render is saved as, from the project's title. A title is a
 * sentence ("fix(trie-router): count every slash"); a file name is a run of
 * letters, digits and the hyphens inside words, so every other run of
 * characters collapses into one underscore and neither end carries a separator.
 */
export function exportFilename(title: string): string {
	const name = title
		.replace(/[^a-zA-Z0-9]+/g, (run) => (run === "-" ? run : "_"))
		.replace(/^[_-]+|[_-]+$/g, "");
	return name || "typelapse";
}
