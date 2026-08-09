import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Loads the Lapse animation inspector, when it is installed locally.
 *
 * Lapse ships from a private registry tied to a personal course licence. Putting
 * it in package.json would make `pnpm install` fail for everyone who does not
 * hold that licence, CI included, which is not an acceptable trade for a public
 * MIT repository. It therefore lives in `.lapse/`, its own gitignored install
 * with its own manifest, which pnpm never prunes: a package that is merely
 * absent from the project manifest gets removed on the next install.
 *
 * Set it up with:
 *   mkdir -p .lapse && cd .lapse
 *   echo '@aiforui:registry=https://aiforui.dev/npm/' > .npmrc
 *   pnpm add @aiforui/lapse
 *
 * The injection goes through the HTML rather than the app entry because the
 * install module has to run before anything caches the clock. Motion caches
 * requestAnimationFrame and Date.now on import, and a cached reference keeps the
 * real clock, so slow-motion would silently do nothing.
 */
const VIRTUAL_ID = "virtual:lapse";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const LAPSE_DIST = ".lapse/node_modules/@aiforui/lapse/dist";

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
			return id === VIRTUAL_ID ? RESOLVED_ID : null;
		},

		load(id) {
			if (id !== RESOLVED_ID) {
				return null;
			}
			return [
				`import ${JSON.stringify(installEntry)};`,
				`import { mountLapse } from ${JSON.stringify(panelEntry)};`,
				"mountLapse();",
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
