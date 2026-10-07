import type { IndexHtmlTransformResult, Plugin } from "vite";

/**
 * Tells the page which files the studio route is made of, so a hard load of
 * `/app` can fetch them beside the entry bundle and the landing can fetch them
 * ahead of a click.
 *
 * The studio is a lazy route, which keeps it out of the landing's first load,
 * and that is also why nothing asks for it until the entry bundle has run, the
 * router has matched `/app` and React has rendered the Suspense boundary: the
 * longest serial chain on a slow phone. Its file names carry a content hash, so
 * `index.html` cannot spell them; the build knows them, and writes them down as
 * a JSON element that the inline script in `index.html` and the landing's
 * prefetch both read (`presentation/utils/studio-prefetch.ts`).
 *
 * Only the studio's own files are listed. Its dynamic imports (Monaco, the
 * export encoder) stay lazy: this is about the route, not the editor.
 */

export const STUDIO_CHUNKS_ELEMENT_ID = "typelapse-studio-chunks";

const STUDIO_ROUTE_MODULE = "/presentation/studio/studio-route.tsx";

/** The slice of a Rollup output bundle this plugin reads. */
interface BundleEntry {
	type: string;
	fileName: string;
	/** Every module the chunk holds; the facade id is null once Rollup merges the route with its helpers. */
	moduleIds?: string[];
	isEntry?: boolean;
	imports?: string[];
	viteMetadata?: { importedCss?: Set<string> };
}

export type StudioBundle = Record<string, BundleEntry>;

/**
 * The files of the studio route chunk: the chunk, the chunks it statically
 * imports that are not the entry (which is already on its way), and its CSS.
 * Empty when the bundle has no such chunk.
 */
export function studioChunkFiles(bundle: StudioBundle): string[] {
	const studio = Object.values(bundle).find(
		(entry) =>
			entry.type === "chunk" && entry.moduleIds?.some((id) => id.endsWith(STUDIO_ROUTE_MODULE)),
	);
	if (!studio) {
		return [];
	}
	const files = new Set<string>();
	const visit = (entry: BundleEntry) => {
		if (files.has(entry.fileName) || entry.isEntry) {
			return;
		}
		files.add(entry.fileName);
		for (const css of entry.viteMetadata?.importedCss ?? []) {
			files.add(css);
		}
		for (const imported of entry.imports ?? []) {
			const next = bundle[imported];
			if (next) {
				visit(next);
			}
		}
	};
	visit(studio);
	return [...files];
}

/** What the build says when no chunk holds the studio route: where to look, not just that. */
export function missingStudioChunkMessage(): string {
	return `typelapse-studio-preload: no chunk in the bundle contains ${STUDIO_ROUTE_MODULE}. The studio route was renamed, moved or merged into the entry; update STUDIO_ROUTE_MODULE in vite-plugin-studio-preload.ts, or the /app hard load loses its chunk preload.`;
}

export function studioPreload(): Plugin {
	let base = "/";
	return {
		name: "typelapse-studio-preload",
		apply: "build",
		configResolved(config) {
			base = config.base.endsWith("/") ? config.base : `${config.base}/`;
		},
		transformIndexHtml: {
			order: "post",
			handler(html, context): IndexHtmlTransformResult {
				if (!context.bundle) {
					return html;
				}
				const files = studioChunkFiles(context.bundle as StudioBundle);
				if (files.length === 0) {
					// A route that moved or a bundle that merged it away would otherwise
					// ship without its hints and nobody would see it until the numbers.
					throw new Error(missingStudioChunkMessage());
				}
				return {
					html,
					tags: [
						{
							tag: "script",
							attrs: { type: "application/json", id: STUDIO_CHUNKS_ELEMENT_ID },
							children: JSON.stringify(files.map((file) => `${base}${file}`)),
							injectTo: "head-prepend",
						},
					],
				};
			},
		},
	};
}
