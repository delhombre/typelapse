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

import { fontsToLoad, selfHostedFaces } from "../../src/application/fonts/code-fonts";
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
import firaCodeCyrillic from "../../public/fonts/FiraCode-cyrillic.woff2";
import firaCodeGreek from "../../public/fonts/FiraCode-greek.woff2";
import firaCodeSymbols from "../../public/fonts/FiraCode-symbols.woff2";
import firaCodeLatinExt from "../../public/fonts/FiraCode-latin-ext.woff2";
import firaCodeLatin from "../../public/fonts/FiraCode-latin.woff2";
import sourceCodeProCyrillic from "../../public/fonts/SourceCodePro-cyrillic.woff2";
import sourceCodeProGreek from "../../public/fonts/SourceCodePro-greek.woff2";
import sourceCodeProLatinExt from "../../public/fonts/SourceCodePro-latin-ext.woff2";
import sourceCodeProLatin from "../../public/fonts/SourceCodePro-latin.woff2";
import ibmPlexMonoCyrillic from "../../public/fonts/IBMPlexMono-cyrillic.woff2";
import ibmPlexMonoGreek from "../../public/fonts/IBMPlexMono-greek.woff2";
import ibmPlexMonoLatinExt from "../../public/fonts/IBMPlexMono-latin-ext.woff2";
import ibmPlexMonoLatin from "../../public/fonts/IBMPlexMono-latin.woff2";
import cascadiaCodeCyrillic from "../../public/fonts/CascadiaCode-cyrillic.woff2";
import cascadiaCodeGreek from "../../public/fonts/CascadiaCode-greek.woff2";
import cascadiaCodeSymbols from "../../public/fonts/CascadiaCode-symbols.woff2";
import cascadiaCodeLatinExt from "../../public/fonts/CascadiaCode-latin-ext.woff2";
import cascadiaCodeLatin from "../../public/fonts/CascadiaCode-latin.woff2";
import interCyrillic from "../../public/fonts/Inter-cyrillic.woff2";
import interGreek from "../../public/fonts/Inter-greek.woff2";
import interLatinExt from "../../public/fonts/Inter-latin-ext.woff2";
import interLatin from "../../public/fonts/Inter-latin.woff2";

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
	"/fonts/FiraCode-cyrillic.woff2": firaCodeCyrillic,
	"/fonts/FiraCode-greek.woff2": firaCodeGreek,
	"/fonts/FiraCode-symbols.woff2": firaCodeSymbols,
	"/fonts/FiraCode-latin-ext.woff2": firaCodeLatinExt,
	"/fonts/FiraCode-latin.woff2": firaCodeLatin,
	"/fonts/SourceCodePro-cyrillic.woff2": sourceCodeProCyrillic,
	"/fonts/SourceCodePro-greek.woff2": sourceCodeProGreek,
	"/fonts/SourceCodePro-latin-ext.woff2": sourceCodeProLatinExt,
	"/fonts/SourceCodePro-latin.woff2": sourceCodeProLatin,
	"/fonts/IBMPlexMono-cyrillic.woff2": ibmPlexMonoCyrillic,
	"/fonts/IBMPlexMono-greek.woff2": ibmPlexMonoGreek,
	"/fonts/IBMPlexMono-latin-ext.woff2": ibmPlexMonoLatinExt,
	"/fonts/IBMPlexMono-latin.woff2": ibmPlexMonoLatin,
	"/fonts/CascadiaCode-cyrillic.woff2": cascadiaCodeCyrillic,
	"/fonts/CascadiaCode-greek.woff2": cascadiaCodeGreek,
	"/fonts/CascadiaCode-symbols.woff2": cascadiaCodeSymbols,
	"/fonts/CascadiaCode-latin-ext.woff2": cascadiaCodeLatinExt,
	"/fonts/CascadiaCode-latin.woff2": cascadiaCodeLatin,
	"/fonts/Inter-cyrillic.woff2": interCyrillic,
	"/fonts/Inter-greek.woff2": interGreek,
	"/fonts/Inter-latin-ext.woff2": interLatinExt,
	"/fonts/Inter-latin.woff2": interLatin,
};

/**
 * The stylesheets that register every family these stacks name, from the files
 * bundled above. A family the registry does not know is a generic or a system
 * face and needs nothing.
 */
export function fontStylesheets(...stacks: string[]): Promise<string[]> {
	return Promise.all(
		fontsToLoad(...stacks).map((font) =>
			fontFaceRules(selfHostedFaces(font), (url) => BUNDLED_FONT_URLS[url] ?? url),
		),
	);
}

/** The face a step caption is set in (`step-caption.tsx`: Inter, weight 500). */
export const CAPTION_FONT_PROBE = "500 16px Inter";

/**
 * Register the bundled faces for these stacks in the page, then wait until the
 * probe font (the theme's, whose advance the card is sized on) and the caption's
 * Inter are actually loaded. A face that no element has asked for yet is not
 * loading, so `fonts.ready` alone would let a frame be drawn in the fallback.
 */
export async function loadCompositionFonts(probeFont: string, ...stacks: string[]): Promise<void> {
	for (const css of await fontStylesheets(...stacks)) {
		const style = document.createElement("style");
		style.textContent = css;
		document.head.appendChild(style);
	}
	await Promise.all([
		document.fonts.load(probeFont, "0"),
		document.fonts.load(CAPTION_FONT_PROBE, "A"),
	]);
	await document.fonts.ready;
}
