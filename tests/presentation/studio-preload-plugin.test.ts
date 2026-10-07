// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type StudioBundle, studioChunkFiles } from "../../vite-plugin-studio-preload";

/**
 * What the build tells the page about the studio route (ticket #214): its own
 * file and CSS, any shared chunk only it needs, and never the entry bundle or
 * what the studio merely may load later (Monaco, the export encoder).
 */
const ENTRY = { type: "chunk", fileName: "assets/index-1.js", isEntry: true } as const;

describe("studioChunkFiles", () => {
	it("lists the route chunk and its CSS", () => {
		const bundle: StudioBundle = {
			"assets/index-1.js": { ...ENTRY },
			"assets/studio-route-2.js": {
				type: "chunk",
				fileName: "assets/studio-route-2.js",
				moduleIds: ["/repo/src/app.css", "/repo/src/presentation/studio/studio-route.tsx"],
				imports: ["assets/index-1.js"],
				viteMetadata: { importedCss: new Set(["assets/studio-route-3.css"]) },
			},
		};
		expect(studioChunkFiles(bundle)).toEqual([
			"assets/studio-route-2.js",
			"assets/studio-route-3.css",
		]);
	});

	it("follows static imports that are not the entry, and leaves dynamic ones alone", () => {
		const bundle: StudioBundle = {
			"assets/index-1.js": { ...ENTRY },
			"assets/studio-route-2.js": {
				type: "chunk",
				fileName: "assets/studio-route-2.js",
				moduleIds: ["/repo/src/app.css", "/repo/src/presentation/studio/studio-route.tsx"],
				imports: ["assets/index-1.js", "assets/shared-4.js"],
			},
			"assets/shared-4.js": {
				type: "chunk",
				fileName: "assets/shared-4.js",
				imports: ["assets/index-1.js"],
				viteMetadata: { importedCss: new Set(["assets/shared-5.css"]) },
			},
			"assets/monaco-runtime-6.js": { type: "chunk", fileName: "assets/monaco-runtime-6.js" },
		};
		expect(studioChunkFiles(bundle)).toEqual([
			"assets/studio-route-2.js",
			"assets/shared-4.js",
			"assets/shared-5.css",
		]);
	});

	it("lists nothing when the bundle has no studio route", () => {
		expect(studioChunkFiles({ "assets/index-1.js": { ...ENTRY } })).toEqual([]);
	});
});
