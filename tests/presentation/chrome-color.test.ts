import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHROME_COLOR } from "@/presentation/chrome-color";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(__dirname, "../..", file), "utf8");

describe("the colour the browser chrome takes", () => {
	it("is the paper of each side, as app.css declares it", () => {
		const papers = [...read("src/app.css").matchAll(/--color-paper:\s*(#[0-9a-f]{6})/gi)].map(
			(match) => match[1]?.toLowerCase(),
		);

		// The light paper is the theme's own, the dark one the landing's dark theme.
		expect(papers).toEqual([CHROME_COLOR.light, CHROME_COLOR.dark]);
	});

	it("is what index.html says before a script has run, so a forced side and System agree", () => {
		const html = read("index.html");
		const metas = [
			...html.matchAll(/<meta name="theme-color" media="([^"]+)" content="(#[0-9a-f]{6})"/gi),
		];
		const byScheme = Object.fromEntries(
			metas.map(([, media, content]) => [
				media?.includes("dark") ? "dark" : "light",
				content?.toLowerCase(),
			]),
		);

		expect(byScheme).toEqual(CHROME_COLOR);
	});
});
