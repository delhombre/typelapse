/**
 * Getting the app's own fonts into a scope that has no document.
 *
 * The document gets the app's fonts through `@font-face` rules in a stylesheet,
 * which a worker does not have. So the same files, from the same registry and
 * served by the app itself (nothing leaves for a third party), are fetched here
 * and registered by hand, and — this is the part that matters — a family that
 * will not load fails the export instead of being quietly stood in for.
 *
 * The old version of this had one entry in it, for the self-hosted family, which
 * meant all five of the picker's fonts resolved to whatever the machine had
 * lying around. Measured in a real worker: Cascadia Code came out 2.4% narrower
 * per glyph than the preview, and Fira Code came out as a different typeface at
 * almost exactly the same width, which is the worse of the two because nothing
 * measures it.
 */

import { type CodeFont, fontsToLoad, selfHostedFaces } from "@/application/fonts/code-fonts";
import { unresolvedFontMessage } from "@/application/fonts/font-fidelity";

/** A scope that can hold fonts: `self.fonts` in a worker, `document.fonts` in a tab. */
type FontRegistry = Pick<FontFaceSet, "add">;

/**
 * Load every family these stacks name that the app is responsible for
 * supplying. Throws, with a sentence a panel can show, when one cannot be had.
 */
export async function loadExportFonts(
	registry: FontRegistry | undefined,
	...stacks: string[]
): Promise<void> {
	const wanted = fontsToLoad(...stacks);
	if (wanted.length === 0) {
		// Nothing but generics and system faces, which every scope resolves alike.
		return;
	}
	if (!registry || typeof FontFace === "undefined") {
		throw new Error(refusal(wanted.map((font) => font.family)));
	}

	const loaded = await Promise.all(wanted.map((font) => register(registry, font)));
	const missing = wanted.filter((_, index) => !loaded[index]).map((font) => font.family);
	if (missing.length > 0) {
		throw new Error(refusal(missing));
	}
}

function refusal(missing: string[]): string {
	return unresolvedFontMessage(missing) ?? "A font this export needs could not be loaded.";
}

/**
 * True when at least one face of the family made it in.
 *
 * A family is one file per unicode subset. Latin is the one that has to
 * arrive; a Cyrillic subset that 404s is not a reason to refuse a snippet of
 * TypeScript, so each face is tried on its own.
 */
async function register(registry: FontRegistry, font: CodeFont): Promise<boolean> {
	const results = await Promise.all(
		selfHostedFaces(font).map(async (source) => {
			try {
				const face = new FontFace(font.family, `url(${source.url})`, {
					weight: source.weight,
					style: source.style,
					unicodeRange: source.unicodeRange,
				});
				registry.add(await face.load());
				return true;
			} catch {
				return false;
			}
		}),
	);
	return results.some(Boolean);
}
