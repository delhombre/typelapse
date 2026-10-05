// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design system documents (ui-passes D1) are what every UI agent reads
 * before touching a screen, so a token they name has to be a token the code
 * ships. A row cites `path:line` and quotes its value in backticks; the value
 * must be found in the cited file. The line is where it sat when the row was
 * written: other passes move lines, and a doc that went red on every CSS edit
 * would be switched off rather than read, so only the value is pinned.
 */

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const DOCS = ["docs/design/SYSTEM.md", "docs/design/DECISIONS.md"];
const CITATION = /`((?:src|index|docs)[\w./-]*\.(?:css|ts|tsx|html|md)):(\d+)`/g;

/** A regex group the pattern guarantees; a miss means the pattern changed. */
function required(value: string | undefined, what: string): string {
	if (value === undefined) throw new Error(`no ${what} captured`);
	return value;
}

/**
 * Every citation in a table row, with the backticked values written between
 * it and the previous citation: a row can quote a light value and its source,
 * then a dark value and its own source.
 */
function citations(doc: string) {
	return read(doc)
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.flatMap((line) => {
			let from = 0;
			return [...line.matchAll(CITATION)].map((match) => {
				const between = line.slice(from, match.index);
				from = (match.index ?? 0) + match[0].length;
				const values = [...between.matchAll(/`([^`]+)`/g)].map((value) =>
					required(value[1], `backticked value in "${line}"`),
				);
				const file = required(match[1], `cited file in "${line}"`);
				const lineNumber = Number(required(match[2], `cited line in "${line}"`));
				return { line, file, lineNumber, values };
			});
		});
}

describe("the design system documents", () => {
	it("exist, stay short enough to be read whole, and use no dashes", () => {
		for (const doc of DOCS) {
			expect(existsSync(resolve(ROOT, doc)), doc).toBe(true);
			const text = read(doc);
			// DECISIONS grew to fifteen entries with the screen passes, each needing its why.
			const limit = doc.endsWith("DECISIONS.md") ? 300 : 250;
			expect(text.split("\n").length, doc).toBeLessThan(limit);
			expect(text, doc).not.toMatch(/[\u2013\u2014]/);
		}
	});

	it("cite a real file and line for every token, and the value is in that file", () => {
		const rows = citations("docs/design/SYSTEM.md");
		expect(rows.length).toBeGreaterThan(60);
		for (const row of rows) {
			const source = read(row.file);
			expect(row.lineNumber, row.line).toBeLessThanOrEqual(source.split("\n").length);
			expect(row.values.length, row.line).toBeGreaterThan(0);
			for (const value of row.values) expect(source, row.line).toContain(value);
		}
	});

	it("name the file that enforces every standing decision", () => {
		const text = read("docs/design/DECISIONS.md");
		const entries = text.split(/^## /m).filter((section) => /^D\d+ /.test(section));
		expect(entries.length).toBeGreaterThanOrEqual(8);
		for (const entry of entries) {
			const title = entry.split("\n")[0];
			expect(entry, title).toMatch(/\*\*Why:\*\*/);
			const enforced = entry.match(/\*\*Enforced by:\*\*([^\n]*(?:\n(?!\n)[^\n]*)*)/)?.[1] ?? "";
			const paths = [...enforced.matchAll(/`((?:src|tests|index|docs)[\w./-]*)(?::\d+)?`/g)];
			expect(paths.length, title).toBeGreaterThan(0);
			for (const match of paths) {
				const path = required(match[1], `enforcing path in ${title}`);
				expect(existsSync(resolve(ROOT, path)), `${title}: ${path}`).toBe(true);
			}
		}
	});

	it("give every screen pass the same template", () => {
		const template = read("docs/design/passes/README.md");
		for (const heading of ["Screen", "Before", "Decisions", "After", "Review verdict", "Open"]) {
			expect(template).toMatch(new RegExp(`^## ${heading}$`, "m"));
		}
	});

	it("are linked from the quality loop's interface gate and the repository layout", () => {
		const loop = read("docs/agents/QUALITY_LOOP.md");
		const gate4 = loop.slice(loop.indexOf("### 4 Interface"), loop.indexOf("### 5 Prove"));
		expect(gate4).toContain("docs/design/SYSTEM.md");
		expect(gate4).toContain("docs/design/DECISIONS.md");
		expect(read("docs/agents/domain.md")).toMatch(/docs\/design\//);
	});
});
