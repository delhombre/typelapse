/**
 * The app's self-hosted fonts, inside the Remotion bundle.
 *
 * The registry names each file by the path the document serves it at
 * (`/fonts/...`). The composition is not served from there: the v1 bundle has
 * no public folder of ours and the v2 one is a temporary folder holding the
 * project's media. So each file is imported, which makes webpack copy it into
 * the bundle and hand back its URL, and the registry's path is looked up here.
 * The same bytes the preview and the render worker load, so the glyphs match.
 */

import {
	fontsToLoad,
	googleFontCssUrl,
	selfHostedFaces,
} from "../../src/application/fonts/code-fonts";
import { fontFaceRules } from "../../src/application/fonts/font-face-css";
import ioskeleyMonoRegular from "../../public/fonts/IoskeleyMono-Regular.woff2";
import ioskeleyMonoSemiBold from "../../public/fonts/IoskeleyMono-SemiBold.woff2";
import geistCyrillicExt from "../../public/fonts/Geist-cyrillic-ext.woff2";
import geistCyrillic from "../../public/fonts/Geist-cyrillic.woff2";
import geistVietnamese from "../../public/fonts/Geist-vietnamese.woff2";
import geistLatinExt from "../../public/fonts/Geist-latin-ext.woff2";
import geistLatin from "../../public/fonts/Geist-latin.woff2";
import jetBrainsMonoCyrillicExt from "../../public/fonts/JetBrainsMono-cyrillic-ext.woff2";
import jetBrainsMonoCyrillic from "../../public/fonts/JetBrainsMono-cyrillic.woff2";
import jetBrainsMonoGreek from "../../public/fonts/JetBrainsMono-greek.woff2";
import jetBrainsMonoVietnamese from "../../public/fonts/JetBrainsMono-vietnamese.woff2";
import jetBrainsMonoLatinExt from "../../public/fonts/JetBrainsMono-latin-ext.woff2";
import jetBrainsMonoLatin from "../../public/fonts/JetBrainsMono-latin.woff2";

export const BUNDLED_FONT_URLS: Readonly<Record<string, string>> = {
	"/fonts/IoskeleyMono-Regular.woff2": ioskeleyMonoRegular,
	"/fonts/IoskeleyMono-SemiBold.woff2": ioskeleyMonoSemiBold,
	"/fonts/Geist-cyrillic-ext.woff2": geistCyrillicExt,
	"/fonts/Geist-cyrillic.woff2": geistCyrillic,
	"/fonts/Geist-vietnamese.woff2": geistVietnamese,
	"/fonts/Geist-latin-ext.woff2": geistLatinExt,
	"/fonts/Geist-latin.woff2": geistLatin,
	"/fonts/JetBrainsMono-cyrillic-ext.woff2": jetBrainsMonoCyrillicExt,
	"/fonts/JetBrainsMono-cyrillic.woff2": jetBrainsMonoCyrillic,
	"/fonts/JetBrainsMono-greek.woff2": jetBrainsMonoGreek,
	"/fonts/JetBrainsMono-vietnamese.woff2": jetBrainsMonoVietnamese,
	"/fonts/JetBrainsMono-latin-ext.woff2": jetBrainsMonoLatinExt,
	"/fonts/JetBrainsMono-latin.woff2": jetBrainsMonoLatin,
};

/**
 * The stylesheets that register every family these stacks name: the bundled
 * files for a self-hosted family, Google's stylesheet for a picker font that
 * still comes from there. A family the registry does not know is a generic or
 * a system face and needs nothing.
 */
export function fontStylesheets(...stacks: string[]): Promise<string[]> {
	return Promise.all(
		fontsToLoad(...stacks).map((font) => {
			if (font.files) {
				return fontFaceRules(selfHostedFaces(font), (url) => BUNDLED_FONT_URLS[url] ?? url);
			}
			return fetch(googleFontCssUrl(font.google ?? "", font.weights)).then((response) =>
				response.text(),
			);
		}),
	);
}
