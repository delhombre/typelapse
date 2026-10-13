import { exportFilename } from "@/application/export/export-filename";
import { describe, expect, it } from "vitest";

describe("exportFilename", () => {
	it("names a pull request's title without a run of underscores", () => {
		expect(exportFilename("fix(trie-router): count every slash a pattern consumes")).toBe(
			"fix_trie-router_count_every_slash_a_pattern_consumes",
		);
	});

	it("keeps a hyphen inside a word and drops one that stands between spaces", () => {
		expect(exportFilename("Snake_case and kebab-case - together")).toBe(
			"Snake_case_and_kebab-case_together",
		);
	});

	it("starts and ends on a letter or a digit", () => {
		expect(exportFilename("  [WIP] feat: add (a thing)!  ")).toBe("WIP_feat_add_a_thing");
	});

	it("keeps the letter under an accent instead of cutting a word in two", () => {
		expect(exportFilename("Café déjà vu")).toBe("Cafe_deja_vu");
		expect(exportFilename("Ångström crème brûlée")).toBe("Angstrom_creme_brulee");
	});

	it("falls back to the product's name when nothing usable is left", () => {
		expect(exportFilename("")).toBe("typelapse");
		expect(exportFilename("???")).toBe("typelapse");
	});
});
