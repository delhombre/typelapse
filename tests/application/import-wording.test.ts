import { importConfirmLabel, importReplaceQuestion } from "@/application/import/import-wording";
import { describe, expect, it } from "vitest";

describe("import wording", () => {
	it("names what is imported on the confirm button", () => {
		expect(importConfirmLabel("pr")).toBe("Import the pull request");
		expect(importConfirmLabel("diff")).toBe("Import the diff");
		expect(importConfirmLabel("commit")).toBe("Import the commit");
		expect(importConfirmLabel("code-url")).toBe("Import the file");
		expect(importConfirmLabel("snippet")).toBe("Import the code");
		expect(importConfirmLabel("release")).toBe("Import the release");
		expect(importConfirmLabel("compare")).toBe("Import the comparison");
	});

	it("asks one question that names it too", () => {
		expect(importReplaceQuestion("pr")).toBe("Replace what you have with this pull request?");
	});
});
