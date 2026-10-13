/**
 * A unified diff of `count` single-line replacements in one file, `gap` lines
 * apart: a step each once the hunks are far enough apart, and a full page of
 * rows when they are close. Deterministic, so a measurement made on it can be
 * reproduced by anyone (see `tests/application/step-cap-measurement.test.ts`).
 */
export function manyHunks(path: string, count: number, gap = 30): string {
	const lines = [`--- a/${path}`, `+++ b/${path}`];
	for (let k = 1; k <= count; k++) {
		const at = 1 + k * gap;
		lines.push(`@@ -${at},1 +${at},1 @@`, `-const v${k} = ${k};`, `+const v${k} = ${k * 10};`);
	}
	return lines.join("\n");
}
