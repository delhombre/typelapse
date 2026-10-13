/**
 * The bridge from a landing figure to hairline's own format.
 *
 * The figures are TypeScript modules (`src/presentation/landing/figures/*.ts`)
 * that import the kernel and export a definition. Hairline's `validate.mjs` and
 * `look.mjs` read a plain JavaScript file that takes its parts from a global
 * `HL` and ends with `hairline({ ... })`. This turns the first into the second:
 * esbuild drops the types and the comments, the imports go, and the exported
 * definition becomes the `hairline({ ... })` call.
 *
 * The 200-line rule is measured on what this prints, so it is what a figure
 * is held to (#293). It is a module so the unit test and `pnpm figures:validate`
 * run the very same bridge.
 *
 *   node scripts/figures/bridge.mjs glide /tmp/glide.js
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

/** hairline's rule: a figure is at most this many lines. */
export const LINE_LIMIT = 200;

const FIGURES_DIR = fileURLToPath(
	new URL("../../src/presentation/landing/figures/", import.meta.url),
);

/** Every figure in the folder: a module that declares a `HairlineFigureDef`. A new one is found, not listed. */
export const FIGURES = readdirSync(FIGURES_DIR)
	.filter(
		(f) =>
			f.endsWith(".ts") &&
			readFileSync(`${FIGURES_DIR}${f}`, "utf8").includes(": HairlineFigureDef = {"),
	)
	.map((f) => f.slice(0, -3))
	.sort();

/** The figure `name` as hairline reads it: JavaScript, no comments, ending in `hairline({ ... })`. */
export async function bridge(name, dir = FIGURES_DIR) {
	const src = readFileSync(`${dir}${name}.ts`, "utf8");
	const { code } = await transformWithEsbuild(src, "figure.ts", {
		loader: "ts",
		format: "esm",
		target: "es2022",
	});
	const js = code
		.replace(/^import .*\n/gm, "")
		.replace(new RegExp(`const ${name} = \\{`), "hairline({")
		.replace(/\n\};\s*var \w+_default = \w+;\s*export \{[^}]*\};?\s*$/, "\n});\n")
		.replace(new RegExp(`\\n\\};\\s*export default ${name};?\\s*$`), "\n});\n");
	if (!js.includes("hairline({")) {
		throw new Error(
			`bridge: ${name}.ts has no "const ${name} = {" definition to turn into hairline({`,
		);
	}
	return js;
}

/** Lines the way hairline's `validate.mjs` counts them. */
export const lineCount = (js) => js.split("\n").length;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const [name, out] = process.argv.slice(2);
	if (!name || !out) {
		console.error("usage: node scripts/figures/bridge.mjs <figure> <out.js>");
		process.exit(2);
	}
	const js = await bridge(name);
	writeFileSync(out, js);
	console.log(`${name}: ${lineCount(js)} lines -> ${out}`);
}
