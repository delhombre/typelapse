// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design system documents (ui-passes D1) are what every UI agent reads
 * before touching a screen, so a token they name has to be a token the code
 * ships. A table row quotes a value in backticks and cites the file that ships
 * it, `path`, or `path @ selector` where the file says it more than once.
 *
 * The rule (ticket #159): a citation carries no line number. A line is true
 * only until the next edit above it, and a doc that went red on every CSS edit
 * would be switched off rather than read; 82 of 168 line citations had rotted
 * before this rule. What does not rot is the value itself and the selector
 * that owns it, so those are what the test checks:
 *
 * - the value must appear in the shipped source (a CSS comment is not shipped);
 * - a value that appears more than once in its file must name `@ selector`, and
 *   the selector must be one of the blocks enclosing an occurrence;
 * - a value is quoted whole, so two roles cannot pass on one shared occurrence.
 *
 * Every failure names the row, the citation and what was found, so a pass fixes
 * it in one edit to SYSTEM.md (docs/design/passes/README.md says how).
 */

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const DOCS = ["docs/design/SYSTEM.md", "docs/design/DECISIONS.md"];
const FILE = String.raw`(?:src|index|docs)[\w./-]*\.(?:css|ts|tsx|html|md)`;
const CITATION = new RegExp(`\`(${FILE})(?: @ ([^\`]+))?\``, "g");
/** The retired form: a line number in a citation. */
const LINE_CITATION = new RegExp(`\`${FILE}:\\d+\``, "g");

/** A regex group the pattern guarantees; a miss means the pattern changed. */
function required(value: string | undefined, what: string): string {
	if (value === undefined) throw new Error(`no ${what} captured`);
	return value;
}

/**
 * Every citation in a table row, with the backticked values written between
 * it and the previous citation: a row can quote a light value and its source,
 * then a dark value and its own source. The first cell is the row's name and
 * is never a value.
 */
function citations(doc: string) {
	return read(doc)
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.flatMap((line) => {
			const name = line.slice(1, line.indexOf("|", 1)).trim();
			const cells = line.slice(line.indexOf("|", 1));
			let from = 0;
			return [...cells.matchAll(CITATION)].map((match) => {
				const between = cells.slice(from, match.index);
				from = (match.index ?? 0) + match[0].length;
				const values = [...between.matchAll(/`([^`]+)`/g)].map((value) =>
					required(value[1], `backticked value in "${line}"`),
				);
				const file = required(match[1], `cited file in "${line}"`);
				return { name, file, anchor: match[2]?.trim(), values };
			});
		});
}

/** What ships: a CSS comment keeps its length (so offsets hold) but is blanked. */
function shipped(file: string): string {
	const source = read(file);
	return file.endsWith(".css")
		? source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
		: source;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** The selectors and at-rules of the blocks enclosing `index`, outermost first. */
function enclosing(css: string, index: number): string[] {
	const stack: string[] = [];
	let headerStart = 0;
	for (let at = 0; at < index; at++) {
		const char = css[at];
		if (char === "{") {
			stack.push(squash(css.slice(headerStart, at)));
			headerStart = at + 1;
		} else if (char === "}") {
			stack.pop();
			headerStart = at + 1;
		} else if (char === ";") headerStart = at + 1;
	}
	return stack;
}

const occurrences = (source: string, value: string) => {
	const found: number[] = [];
	for (let at = source.indexOf(value); at >= 0; at = source.indexOf(value, at + 1)) found.push(at);
	return found;
};

/** One line per citation that is not true, saying what was cited and what is there. */
function problems(doc: string): string[] {
	const label = doc.split("/").pop();
	const found: string[] = [];
	for (const row of citations(doc)) {
		const where = `${label} row "${row.name}", \`${row.file}${row.anchor ? ` @ ${row.anchor}` : ""}\``;
		if (row.values.length === 0) {
			found.push(`${where}: quotes no value, write the shipped value in backticks before it`);
			continue;
		}
		const css = row.file.endsWith(".css");
		if (row.anchor && !css) {
			found.push(`${where}: only a CSS file takes \`@ selector\`, quote more of the line instead`);
			continue;
		}
		const source = shipped(row.file);
		for (const value of row.values) {
			const at = occurrences(source, value);
			if (at.length === 0) {
				found.push(
					`${where}: \`${value}\` is not in the file (a comment does not count), update the value or the row`,
				);
				continue;
			}
			const owners = at.map((index) => (css ? enclosing(source, index) : []));
			if (row.anchor) {
				const anchor = squash(row.anchor);
				if (!owners.some((chain) => chain.some((header) => header.includes(anchor)))) {
					const seen = [...new Set(owners.map((chain) => chain.at(-1) ?? "(top level)"))];
					found.push(
						`${where}: \`${value}\` is in the file but not inside \`${anchor}\`, it sits in: ${seen.join(" | ")}`,
					);
				}
			} else if (at.length > 1 && !value.startsWith("@")) {
				const seen = css
					? `add \`@ selector\` with one of: ${[...new Set(owners.map((c) => c.at(-1) ?? "(top level)"))].join(" | ")}`
					: "quote more of the line so it is unique";
				found.push(`${where}: \`${value}\` appears ${at.length} times in the file, ${seen}`);
			}
		}
	}
	return found;
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

	it("cite, for every token, a file that ships the value, and the selector where it repeats", () => {
		expect(citations("docs/design/SYSTEM.md").length).toBeGreaterThan(60);
		const found = problems("docs/design/SYSTEM.md");
		expect(found, `\n${found.join("\n")}\n`).toEqual([]);
	});

	it("carry no line numbers, which rot on the next edit", () => {
		for (const doc of DOCS) {
			const stale = read(doc).match(LINE_CITATION) ?? [];
			expect(stale, `${doc}: drop the line number, keep the file (and \`@ selector\`)`).toEqual([]);
		}
	});

	it("only point at files that exist", () => {
		for (const doc of DOCS) {
			const named = read(doc).matchAll(new RegExp(`\`(${FILE})(?: @ [^\`]+)?\``, "g"));
			for (const match of named) {
				const path = required(match[1], `path in ${doc}`);
				expect(existsSync(resolve(ROOT, path)), `${doc} names ${path}`).toBe(true);
			}
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
