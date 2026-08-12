import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
	COMPARISON_CHECKED_ON,
	COMPARISON_GROUPS,
	type Cell,
	PRODUCTS,
	type Row,
} from "@/presentation/landing/compare/comparison";
import { describe, expect, it } from "vitest";

/**
 * `/compare` names two competitors in public. It only works if it is
 * unimpeachable, so the rules that make it unimpeachable are asserted here
 * rather than trusted to whoever edits the constant next.
 */

const OUR_REPO = "https://github.com/delhombre/typelapse/";

const ALL_ROWS: Row[] = COMPARISON_GROUPS.flatMap((group) => [...group.rows]);

function competitorCells(row: Row): Cell[] {
	return [row.snappify, row.snipcast];
}

function facts(cells: Cell[]): Extract<Cell, { kind: "fact" }>[] {
	return cells.filter((cell): cell is Extract<Cell, { kind: "fact" }> => cell.kind === "fact");
}

describe("the comparison sheet", () => {
	it("has rows to compare", () => {
		expect(COMPARISON_GROUPS.length).toBeGreaterThan(0);
		expect(ALL_ROWS.length).toBeGreaterThan(0);
	});

	it("compares exactly the three named products", () => {
		expect(PRODUCTS.map((product) => product.id)).toEqual(["typelapse", "snappify", "snipcast"]);
	});

	it("gives every row a unique id", () => {
		const ids = ALL_ROWS.map((row) => row.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every group a unique id", () => {
		const ids = COMPARISON_GROUPS.map((group) => group.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("labels every row", () => {
		for (const row of ALL_ROWS) {
			expect(row.label.trim()).not.toBe("");
		}
	});

	/* The rule the whole page rests on: a claim without a link is not a claim. */
	it("sources every stated fact with a resolvable https link", () => {
		for (const row of ALL_ROWS) {
			for (const cell of facts([row.typelapse, ...competitorCells(row)])) {
				expect(cell.value.trim(), `${row.id}: empty value`).not.toBe("");
				expect(cell.source.label.trim(), `${row.id}: unlabelled source`).not.toBe("");
				expect(cell.source.href, `${row.id}: ${cell.source.href}`).toMatch(/^https:\/\/\S+$/);
			}
		}
	});

	/* Our claims cite our own repository: the file that defines the constant, or
	   the commit that measured the number. Anything else is marketing. */
	it("sources our own column to this repository", () => {
		for (const row of ALL_ROWS) {
			for (const cell of facts([row.typelapse])) {
				expect(cell.source.href, `${row.id}: ${cell.source.href}`).toContain(OUR_REPO);
			}
		}
	});

	/* Their claims cite their own public pages. We never source a statement about
	   a competitor to ourselves — not to our repo, not to our own testing. */
	it("never sources a competitor's cell to us", () => {
		for (const row of ALL_ROWS) {
			for (const cell of facts(competitorCells(row))) {
				expect(cell.source.href, `${row.id}: ${cell.source.href}`).not.toContain(OUR_REPO);
			}
		}
	});

	it("states something about ourselves in every row", () => {
		for (const row of ALL_ROWS) {
			expect(row.typelapse.kind, `${row.id}: we must know our own product`).toBe("fact");
		}
	});

	/* "Not documented" is a claim about their pages, so it is sourced like any
	   other: the reader can open what we read and check our reading. */
	it("says where it looked when it found nothing", () => {
		for (const row of ALL_ROWS) {
			for (const cell of [row.typelapse, ...competitorCells(row)]) {
				if (cell.kind !== "undocumented") {
					continue;
				}
				expect(cell.checked.label.trim(), `${row.id}: unlabelled check`).not.toBe("");
				expect(cell.checked.href, `${row.id}: ${cell.checked.href}`).toMatch(/^https:\/\/\S+$/);
				expect(cell.checked.href, `${row.id}: ${cell.checked.href}`).not.toContain(OUR_REPO);
			}
		}
	});

	/* A citation that 404s is worse than no citation: it invites the reader to
	   check, then wastes the click. Renaming a cited file breaks this test rather
	   than the page. */
	it("cites files that exist in this repository", () => {
		const root = resolve(__dirname, "../..");
		const cited = ALL_ROWS.flatMap((row) => facts([row.typelapse]))
			.map((cell) => cell.source.href.split("/blob/main/")[1])
			.filter((path): path is string => path !== undefined);

		expect(cited.length, "no file citations found to check").toBeGreaterThan(0);
		for (const path of cited) {
			expect(existsSync(resolve(root, path)), `cited but missing: ${path}`).toBe(true);
		}
	});

	it("dates the check as an ISO day", () => {
		expect(COMPARISON_CHECKED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
