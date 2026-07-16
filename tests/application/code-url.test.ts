import { languageFromFilename, resolveCodeUrl } from "@/application/import/code-url";
import { describe, expect, it } from "vitest";

describe("resolveCodeUrl", () => {
	it("maps a gist page to the gist API", () => {
		expect(resolveCodeUrl("https://gist.github.com/octocat/6cad326836d38bd3a7ae")).toEqual({
			fetchUrl: "https://api.github.com/gists/6cad326836d38bd3a7ae",
			kind: "gist-api",
		});
	});

	it("keeps the gist id when a file fragment is present", () => {
		expect(
			resolveCodeUrl("https://gist.github.com/octocat/6cad326836d38bd3a7ae#file-hello-ts"),
		).toEqual({
			fetchUrl: "https://api.github.com/gists/6cad326836d38bd3a7ae",
			kind: "gist-api",
		});
	});

	it("maps a github blob url to raw.githubusercontent.com", () => {
		expect(
			resolveCodeUrl("https://github.com/facebook/react/blob/main/packages/react/index.js"),
		).toEqual({
			fetchUrl: "https://raw.githubusercontent.com/facebook/react/main/packages/react/index.js",
			kind: "raw",
		});
	});

	it("handles nested blob paths and a sha ref", () => {
		expect(resolveCodeUrl("https://github.com/o/r/blob/abc123/src/deep/nested/file.ts")).toEqual({
			fetchUrl: "https://raw.githubusercontent.com/o/r/abc123/src/deep/nested/file.ts",
			kind: "raw",
		});
	});

	it("passes a raw.githubusercontent url through unchanged", () => {
		const url = "https://raw.githubusercontent.com/o/r/main/x.py";
		expect(resolveCodeUrl(url)).toEqual({ fetchUrl: url, kind: "raw" });
	});

	it("passes a gist.githubusercontent url through unchanged", () => {
		const url = "https://gist.githubusercontent.com/o/id/raw/abc/hello.rs";
		expect(resolveCodeUrl(url)).toEqual({ fetchUrl: url, kind: "raw" });
	});

	it("accepts any https url ending in a known code extension", () => {
		const url = "https://example.com/snippets/thing.go";
		expect(resolveCodeUrl(url)).toEqual({ fetchUrl: url, kind: "raw" });
	});

	it("accepts a url without an explicit protocol", () => {
		expect(resolveCodeUrl("gist.github.com/octocat/abc123")).toEqual({
			fetchUrl: "https://api.github.com/gists/abc123",
			kind: "gist-api",
		});
	});

	it("rejects a github repo root (no blob path)", () => {
		expect(resolveCodeUrl("https://github.com/facebook/react")).toBeNull();
	});

	it("rejects an arbitrary https page with no code extension", () => {
		expect(resolveCodeUrl("https://example.com/about")).toBeNull();
	});

	it("rejects blank or nonsense input", () => {
		expect(resolveCodeUrl("")).toBeNull();
		expect(resolveCodeUrl("   ")).toBeNull();
		expect(resolveCodeUrl("not a url at all")).toBeNull();
	});
});

describe("languageFromFilename", () => {
	const cases: [string, string][] = [
		["app.ts", "typescript"],
		["app.tsx", "typescript"],
		["app.js", "javascript"],
		["app.jsx", "javascript"],
		["main.py", "python"],
		["lib.rs", "rust"],
		["main.go", "go"],
		["index.html", "html"],
		["styles.css", "css"],
		["data.json", "json"],
		["App.java", "java"],
		["Program.cs", "csharp"],
		["main.cpp", "cpp"],
		["foo.cc", "cpp"],
		["index.php", "php"],
		["app.rb", "ruby"],
		["View.swift", "swift"],
		["Main.kt", "kotlin"],
		["query.sql", "sql"],
		["config.yml", "yaml"],
		["config.yaml", "yaml"],
		["README.md", "markdown"],
		["run.sh", "shell"],
		["Dockerfile", "dockerfile"],
	];

	for (const [name, lang] of cases) {
		it(`maps ${name} to ${lang}`, () => {
			expect(languageFromFilename(name)).toBe(lang);
		});
	}

	it("resolves the basename out of a path", () => {
		expect(languageFromFilename("src/deep/main.py")).toBe("python");
	});

	it("defaults unknown or extensionless names to typescript", () => {
		expect(languageFromFilename("mystery.xyz")).toBe("typescript");
		expect(languageFromFilename("LICENSE")).toBe("typescript");
	});
});
