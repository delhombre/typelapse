/**
 * The file a render is saved as, from the project's title. A title is a
 * sentence ("fix(trie-router): count every slash"); a file name is a run of
 * letters, digits and the hyphens inside words (an accented letter is its plain
 * one), so every other run of characters collapses into one underscore and
 * neither end carries a separator. The device's download and the render API's
 * Content-Disposition both name a file with it.
 */
export function exportFilename(title: string): string {
	const name = title
		// Accents come apart from their letter first, so "Café" is "Cafe", not "Caf_".
		.normalize("NFD")
		.replace(/\p{M}+/gu, "")
		.replace(/[^a-zA-Z0-9]+/g, (run) => (run === "-" ? run : "_"))
		.replace(/^[_-]+|[_-]+$/g, "");
	return name || "typelapse";
}
