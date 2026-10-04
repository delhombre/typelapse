import { parseFontFaceSources } from "@/application/fonts/font-face-css";
import { installSelfHostedFonts } from "@/presentation/utils/self-hosted-fonts";
import { afterEach, describe, expect, it } from "vitest";

function installedFaces() {
	const sheets = [...document.querySelectorAll("style[data-self-hosted-fonts]")];
	return { count: sheets.length, faces: parseFontFaceSources(sheets[0]?.textContent ?? "") };
}

describe("installSelfHostedFonts", () => {
	afterEach(() => {
		for (const sheet of document.querySelectorAll("style[data-self-hosted-fonts]")) {
			sheet.remove();
		}
	});

	it("gives the document every face the app serves, from /fonts", () => {
		installSelfHostedFonts();

		const { faces } = installedFaces();
		const families = new Set(faces.map((face) => face.family));
		expect(families).toEqual(new Set(["JetBrains Mono", "Ioskeley Mono", "Geist"]));
		expect(faces.every((face) => face.url.startsWith("/fonts/"))).toBe(true);
		expect(faces).toContainEqual(
			expect.objectContaining({ family: "Geist", url: "/fonts/Geist-latin.woff2", weight: "600" }),
		);
	});

	it("installs once", () => {
		installSelfHostedFonts();
		installSelfHostedFonts();

		expect(installedFaces().count).toBe(1);
	});
});
