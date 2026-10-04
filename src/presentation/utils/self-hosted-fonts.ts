import { LOADABLE_FONTS, selfHostedFaces } from "@/application/fonts/code-fonts";
import { fontFaceRules } from "@/application/fonts/font-face-css";

/**
 * Hand the document the faces the app serves itself, straight from the font
 * registry, so the page, the render worker and the server composition register
 * the same files at the same weights and no copy of the list can drift.
 *
 * Called before the first render: nothing is set in a font before React runs,
 * and the file the first paint needs is already on its way (index.html
 * preloads it).
 */
export function installSelfHostedFonts(doc: Document = document): void {
	if (doc.querySelector("style[data-self-hosted-fonts]")) {
		return;
	}
	const style = doc.createElement("style");
	style.dataset.selfHostedFonts = "";
	style.textContent = fontFaceRules(LOADABLE_FONTS.flatMap(selfHostedFaces));
	doc.head.appendChild(style);
}
