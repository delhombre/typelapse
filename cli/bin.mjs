#!/usr/bin/env node
/**
 * The `typelapse` executable. The CLI is TypeScript that imports the studio's
 * own modules through the `@/` alias, so it runs under tsx with the repo's
 * tsconfig named explicitly: run from any directory (npx, a CI checkout), the
 * alias still resolves.
 *
 * The render route and Remotion log progress with console.log; stdout belongs
 * to the result (a path, a link, or one JSON object), so those logs move to
 * stderr before anything is loaded.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "tsx/esm/api";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
register({ tsconfig: resolve(ROOT, "tsconfig.json") });

console.log = console.error;
console.info = console.error;

const { defaultIO, runCli } = await import("./typelapse.ts");
const { disposeRenderer } = await import("./render-project.ts");

let code = 4;
try {
	code = await runCli(process.argv.slice(2), defaultIO());
} finally {
	await disposeRenderer().catch(() => undefined);
}
// Remotion keeps its browser and compositor handles open; the run is over.
process.exit(code);
