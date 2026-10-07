import { studioDocumentTitle } from "@/application/project/document-title";
import { describe, expect, it } from "vitest";

/**
 * The tab says where you are: the landing has its own title, the studio says
 * "Studio" until the project has a name and then says the name, so two studio
 * tabs on two projects can be told apart (ticket #214).
 */
describe("studioDocumentTitle", () => {
	it("says Studio for a project nobody has named", () => {
		expect(studioDocumentTitle("Untitled")).toBe("Studio · Typelapse");
		expect(studioDocumentTitle("Untitled 2")).toBe("Studio · Typelapse");
		expect(studioDocumentTitle("untitled")).toBe("Studio · Typelapse");
		expect(studioDocumentTitle("")).toBe("Studio · Typelapse");
		expect(studioDocumentTitle("   ")).toBe("Studio · Typelapse");
	});

	it("says the project's name once it has one", () => {
		expect(studioDocumentTitle("fix(trie-router): count every slash")).toBe(
			"fix(trie-router): count every slash · Typelapse",
		);
		expect(studioDocumentTitle("  Release notes  ")).toBe("Release notes · Typelapse");
	});

	it("does not mistake a name that merely starts like the default for it", () => {
		expect(studioDocumentTitle("Untitled goose game")).toBe("Untitled goose game · Typelapse");
	});
});
