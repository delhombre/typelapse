import { languageFromPath } from "@/application/language/language-from-filename";
import { describe, expect, it } from "vitest";

describe("languageFromPath", () => {
	it("maps common extensions to Shiki language ids", () => {
		expect(languageFromPath("src/app.ts")).toBe("typescript");
		expect(languageFromPath("src/App.tsx")).toBe("tsx");
		expect(languageFromPath("index.js")).toBe("javascript");
		expect(languageFromPath("Button.jsx")).toBe("jsx");
		expect(languageFromPath("main.py")).toBe("python");
		expect(languageFromPath("lib.rs")).toBe("rust");
		expect(languageFromPath("server.go")).toBe("go");
		expect(languageFromPath("styles.css")).toBe("css");
		expect(languageFromPath("page.html")).toBe("html");
		expect(languageFromPath("data.json")).toBe("json");
	});

	it("is case-insensitive on the extension", () => {
		expect(languageFromPath("SRC/APP.TS")).toBe("typescript");
	});

	it("handles paths with multiple dots", () => {
		expect(languageFromPath("src/foo.test.ts")).toBe("typescript");
		expect(languageFromPath("config.d.ts")).toBe("typescript");
	});

	it("returns undefined for unknown or missing extensions", () => {
		expect(languageFromPath("Makefile")).toBeUndefined();
		expect(languageFromPath("bin/run")).toBeUndefined();
		expect(languageFromPath("archive.tar.gz")).toBeUndefined();
		expect(languageFromPath("")).toBeUndefined();
		expect(languageFromPath(null)).toBeUndefined();
	});
});
