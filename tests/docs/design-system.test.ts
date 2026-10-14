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
 * before this rule (the ticket counted 80 of 163 on an earlier main). What does
 * not rot is the value itself and the selector that owns it, so those are what
 * the test checks:
 *
 * - the value must appear in the shipped source, as a whole token run (`1.5` is
 *   not `1.55`) and outside every comment, CSS or script;
 * - a value that appears more than once in its file must name `@ selector`, and
 *   the selector must be the innermost rule that holds the declaration, as whole
 *   selector tokens ending in its last compound, not an ancestor or a fragment;
 *   an at-rule is written whole (`@ @media (...) / .selector`);
 * - two rows cannot cite one value in one file and selector, so one occurrence
 *   never carries two roles;
 * - the one exemption: a value that is itself an at-rule (`@media (hover: hover)
 *   and (pointer: fine)`) may repeat, because the same query means the same
 *   thing wherever it stands.
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

/**
 * What ships: every comment keeps its length (so offsets hold) but is blanked,
 * while strings are skipped over so `"https://x"` is not a comment.
 */
function commentEnd(source: string, at: number, css: boolean, html: boolean): number {
	const close = (marker: string, skip: number) => {
		const found = source.indexOf(marker, at + skip);
		return found === -1 ? source.length : found + marker.length;
	};
	if (source.startsWith("/*", at)) return close("*/", 2);
	if (source.startsWith("//", at) && !css && !html) return close("\n", 2) - 1;
	if (html && source.startsWith("<!--", at)) return close("-->", 4);
	return -1;
}

function blankComments(source: string, file: string): string {
	const css = file.endsWith(".css");
	const html = file.endsWith(".html");
	const blank = (text: string) => text.replace(/[^\n]/g, " ");
	let out = "";
	let at = 0;
	while (at < source.length) {
		const comment = commentEnd(source, at, css, html);
		if (comment !== -1) {
			out += blank(source.slice(at, comment));
			at = comment;
			continue;
		}
		const char = source[at] ?? "";
		const quotes = html ? "" : css ? "\"'" : "\"'`";
		if (quotes.includes(char)) {
			let stop = at + 1;
			while (stop < source.length && source[stop] !== char) {
				if (source[stop] === "\\") stop++;
				if (char !== "`" && source[stop] === "\n") break;
				stop++;
			}
			out += source.slice(at, stop + 1);
			at = stop + 1;
			continue;
		}
		out += char;
		at++;
	}
	return out;
}

/* A source is blanked once per run: a table row costs a scan of the whole file,
   and src/app.css (160 KB) is cited by most rows, so blanking it per row made
   this test slower than a loaded machine could tolerate. */
const shippedCache = new Map<string, string>();
const shipped = (file: string) => {
	const cached = shippedCache.get(file);
	if (cached !== undefined) return cached;
	const blanked = blankComments(read(file), file);
	shippedCache.set(file, blanked);
	return blanked;
};

/**
 * Two citations naming one value in one file and selector would let a single
 * occurrence carry two roles; each role anchors the rule that owns its value.
 */
function sharedProblems(rows: Row[], label = "SYSTEM.md"): string[] {
	const seen = new Map<string, Row>();
	const found: string[] = [];
	for (const row of rows) {
		for (const value of row.values) {
			const key = [row.file, squash(row.anchor ?? ""), value].join("\u0000");
			const first = seen.get(key);
			if (first && first !== row) {
				found.push(
					`${label} rows "${first.name}" and "${row.name}" both cite \`${value}\` in \`${row.file}${row.anchor ? ` @ ${row.anchor}` : ""}\`: one occurrence cannot carry two roles, anchor each row to the rule that owns its value`,
				);
			} else seen.set(key, row);
		}
	}
	return found;
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

/** Where `value` stands as a whole token run: `1.5` is not the start of `1.55`. */
const occurrences = (source: string, value: string) => {
	const found: number[] = [];
	const word = /[\w-]/;
	for (let at = source.indexOf(value); at >= 0; at = source.indexOf(value, at + 1)) {
		const before = source[at - 1] ?? "";
		const after = source[at + value.length] ?? "";
		const startsInside = word.test(value[0] ?? "") && word.test(before);
		if (!startsInside && !/[\w.%-]/.test(after)) found.push(at);
	}
	return found;
};

const COMBINATORS = new Set([" ", ">", "+", "~"]);

/** A selector as simple selectors and combinators, so `.si-c` is not `.si-cta`. */
function selectorTokens(selector: string): string[] {
	const pattern = /\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?|[.#]?[\w-]+|\*|\s*[>+~]\s*|\s+/g;
	return [...selector.matchAll(pattern)].map((match) =>
		COMBINATORS.has(match[0].trim()) || /^\s+$/.test(match[0]) ? match[0].trim() || " " : match[0],
	);
}

/** The comma-separated selectors of a rule header, each as tokens. */
function selectorList(header: string): string[][] {
	const parts: string[] = [];
	let depth = 0;
	let from = 0;
	for (let at = 0; at < header.length; at++) {
		const char = header[at];
		if (char === "(" || char === "[") depth++;
		else if (char === ")" || char === "]") depth--;
		else if (char === "," && depth === 0) {
			parts.push(header.slice(from, at));
			from = at + 1;
		}
	}
	parts.push(header.slice(from));
	return parts.map((part) => selectorTokens(squash(part)));
}

/**
 * Whether the anchor names the rule that owns the declaration: its tokens are a
 * run of one selector of the innermost header, ending in the selector's last
 * compound (`.landing-root` is not the owner of `.landing-root .lp-h2`). An
 * at-rule is written whole, alone when the declaration sits directly in it, or
 * before ` / selector` when the selector sits inside it.
 */
function ownsDeclaration(anchor: string, chain: string[]): boolean {
	const innermost = chain.at(-1);
	if (innermost === undefined) return false;
	const [first = "", second] = anchor.split(" / ").map(squash);
	if (second === undefined && first.startsWith("@")) return innermost === first;
	const selector = second ?? first;
	if (second !== undefined && !chain.slice(0, -1).includes(first)) return false;
	if (selector.startsWith("@") || innermost.startsWith("@")) return false;
	const wanted = selectorTokens(selector);
	// Every character of the anchor must be a token: `.` or `si-` is not a selector.
	if (wanted.length === 0 || wanted.join("").replace(/\s/g, "") !== selector.replace(/\s/g, ""))
		return false;
	return selectorList(innermost).some((tokens) => {
		const lastCombinator = tokens.map((token) => COMBINATORS.has(token)).lastIndexOf(true);
		for (let start = 0; start + wanted.length <= tokens.length; start++) {
			const end = start + wanted.length - 1;
			if (end > lastCombinator && wanted.every((token, i) => tokens[start + i] === token))
				return true;
		}
		return false;
	});
}

type Row = ReturnType<typeof citations>[number];

/** Why one citation is not true against `source` (already comment-blanked). */
function rowProblems(row: Row, source: string, label = "SYSTEM.md"): string[] {
	const where = `${label} row "${row.name}", \`${row.file}${row.anchor ? ` @ ${row.anchor}` : ""}\``;
	if (row.values.length === 0) {
		return [`${where}: quotes no value, write the shipped value in backticks before it`];
	}
	const css = row.file.endsWith(".css");
	if (row.anchor && !css) {
		return [`${where}: only a CSS file takes \`@ selector\`, quote more of the line instead`];
	}
	const found: string[] = [];
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
			if (!owners.some((chain) => ownsDeclaration(anchor, chain))) {
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
	return found;
}

/** One line per citation of the doc that is not true, saying what was cited and what is there. */
function problems(doc: string): string[] {
	const label = doc.split("/").pop();
	const rows = citations(doc);
	return [
		...rows.flatMap((row) => rowProblems(row, shipped(row.file), label)),
		...sharedProblems(rows, label),
	];
}

describe("the design system documents", () => {
	it("exist, stay short enough to be read whole, and use no dashes", () => {
		for (const doc of DOCS) {
			expect(existsSync(resolve(ROOT, doc)), doc).toBe(true);
			const text = read(doc);
			// DECISIONS grew to sixteen entries with the screen passes and the panels audit
			// (2026-10-08, D16 and the D10 paragraph), each needing its why.
			const limit = doc.endsWith("DECISIONS.md") ? 325 : 250;
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

describe("the citation check", () => {
	const row = (anchor: string | undefined, ...values: string[]): Row => ({
		name: "Role",
		file: "x.css",
		anchor,
		values,
	});
	const css = (text: string) => blankComments(text, "x.css");
	const ts = (text: string) => blankComments(text, "x.ts");
	const sheet = `
.a { line-height: 1.05; }
.b .c { line-height: 1.55; }
.landing-root .d:hover { color: red; }
@media (pointer: coarse) {
	.e button { height: 44px; }
	.e-more { height: 44px; }
}
`;

	it("matches an anchor as whole selector tokens, not a fragment", () => {
		expect(rowProblems(row(".b .c", "line-height: 1.55"), css(sheet))).toEqual([]);
		expect(rowProblems(row(".b", "line-height: 1.55"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row(".", "line-height: 1.55"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row("c", "line-height: 1.55"), css(sheet))).toHaveLength(1);
	});

	it("matches a value on its boundary, not as the start of a longer one", () => {
		expect(rowProblems(row(undefined, "line-height: 1.0"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row(".b .c", "line-height: 1.5"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row(".a", "line-height: 1.05"), css(sheet))).toEqual([]);
	});

	it("does not count a value that only a comment carries, in CSS or in a script", () => {
		expect(
			rowProblems(row(undefined, "gap: 9px"), css("/* gap: 9px */ .a { gap: 8px; }")),
		).toHaveLength(1);
		const script = { ...row(undefined, "SCALE = 0.97"), file: "x.ts" };
		expect(rowProblems(script, ts("// SCALE = 0.97\nconst SCALE = 0.98;"))).toHaveLength(1);
		expect(rowProblems(script, ts("/* SCALE = 0.97 */ const SCALE = 0.98;"))).toHaveLength(1);
		expect(rowProblems(script, ts("const SCALE = 0.97; // SCALE = 0.1"))).toEqual([]);
		expect(rowProblems(script, ts('const url = "https://x.test"; const SCALE = 0.97;'))).toEqual(
			[],
		);
	});

	it("takes the innermost rule's selector, not an ancestor, and a named at-rule in full", () => {
		expect(rowProblems(row(".landing-root", "color: red"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row(".d", "color: red"), css(sheet))).toEqual([]);
		expect(rowProblems(row(".landing-root .d", "color: red"), css(sheet))).toEqual([]);
		expect(rowProblems(row("@media", "height: 44px"), css(sheet))).toHaveLength(1);
		expect(rowProblems(row("@media (pointer: coarse)", "height: 44px"), css(sheet))).toHaveLength(
			1,
		);
		expect(rowProblems(row("@media / .e button", "height: 44px"), css(sheet))).toHaveLength(1);
		expect(
			rowProblems(row("@media (pointer: coarse) / .e button", "height: 44px"), css(sheet)),
		).toEqual([]);
		expect(rowProblems(row(".e button", "height: 44px"), css(sheet))).toEqual([]);
	});

	it("refuses two rows that cite one value in one place", () => {
		const first = { ...row(".a", "line-height: 1.05"), name: "First" };
		const second = { ...row(".a", "line-height: 1.05"), name: "Second" };
		const other = { ...row(".b .c", "line-height: 1.55"), name: "Other" };
		expect(sharedProblems([first, other])).toEqual([]);
		const found = sharedProblems([first, second]);
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("First");
		expect(found[0]).toContain("Second");
	});
});
