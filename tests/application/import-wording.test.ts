import {
	importConfirmLabel,
	importFailureCopy,
	importReplaceQuestion,
} from "@/application/import/import-wording";
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

describe("what the banner says when an import failed", () => {
	const PR_LINK = "pr" as const;

	it("sends a link that is not there to the link, or to a pasted diff", () => {
		expect(importFailureCopy(PR_LINK, "PR not found (or the repository is private)")).toEqual({
			reason: "PR not found (or the repository is private)",
			nextStep: "Check the link, or paste the diff instead.",
		});
	});

	it("says when to retry after GitHub's limit, not that the link is wrong", () => {
		const message =
			"GitHub rate limit hit (0 of 60 requests left, resets at 04:00 UTC): paste the diff instead";
		expect(importFailureCopy(PR_LINK, message)).toEqual({
			reason: "GitHub's rate limit was hit",
			nextStep: "Try again after 04:00 UTC, or paste the diff instead.",
		});
	});

	it("says how long to wait when GitHub asked for a wait", () => {
		const message = "GitHub rate limit hit (retry after 45 seconds): paste the diff instead";
		expect(importFailureCopy("commit", message).nextStep).toBe(
			"Try again in 45 seconds, or paste the diff instead.",
		);
	});

	it("does not invent a time GitHub did not give", () => {
		expect(
			importFailureCopy(PR_LINK, "GitHub rate limit hit: paste the diff instead").nextStep,
		).toBe("Try again in a few minutes, or paste the diff instead.");
	});

	it("says it is offline when the browser is", () => {
		const message = "Could not reach GitHub: check your connection, or paste the diff instead";
		expect(importFailureCopy(PR_LINK, message, { online: false })).toEqual({
			reason: "You are offline",
			nextStep: "Reconnect and try again, or paste the diff instead.",
		});
	});

	it("says GitHub could not be reached when the browser is online", () => {
		const message = "Could not reach GitHub: check your connection, or paste the diff instead";
		expect(importFailureCopy(PR_LINK, message)).toEqual({
			reason: "Could not reach GitHub",
			nextStep: "Check your connection and try again, or paste the diff instead.",
		});
	});

	it("keeps the reason once and the way out once for a change too large", () => {
		expect(
			importFailureCopy(
				"compare",
				"GitHub will not compare a range this large: pass a smaller range",
			),
		).toEqual({
			reason: "GitHub will not compare a range this large",
			nextStep: "Use a smaller range, or paste the diff instead.",
		});
		expect(
			importFailureCopy(
				PR_LINK,
				"GitHub will not serve a diff this large: paste a smaller diff instead",
			),
		).toEqual({
			reason: "GitHub will not serve a diff this large",
			nextStep: "Paste a smaller diff instead.",
		});
	});

	it("asks for a retry, not a new link, when a fetch failed or ran out of time", () => {
		expect(
			importFailureCopy(PR_LINK, "Could not fetch the change: paste the diff instead"),
		).toEqual({
			reason: "Could not fetch the change",
			nextStep: "Try again, or paste the diff instead.",
		});
		expect(importFailureCopy(PR_LINK, "Request timed out").nextStep).toBe(
			"Try again, or paste the diff instead.",
		);
	});

	it("does not blame a link that read fine for what its change holds", () => {
		expect(importFailureCopy(PR_LINK, "This change has no file differences to animate")).toEqual({
			reason: "This change has no file differences to animate",
			nextStep: "Try another link, or paste the diff instead.",
		});
	});

	it("sends a bad paste back to the paste", () => {
		for (const kind of ["diff", "snippet", "empty"] as const) {
			expect(importFailureCopy(kind, "Paste a diff first.").nextStep).toBe(
				"Check what you pasted, then try again.",
			);
		}
	});
});
