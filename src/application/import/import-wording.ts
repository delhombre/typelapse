import type { SourceKind } from "./classify-source";

const SUBJECTS: Record<Exclude<SourceKind, "empty">, string> = {
	pr: "pull request",
	commit: "commit",
	release: "release",
	compare: "comparison",
	diff: "diff",
	"code-url": "file",
	snippet: "code",
};

/** What an import is called in the question that precedes it. */
export function importSubject(kind: SourceKind): string {
	return kind === "empty" ? "code" : SUBJECTS[kind];
}

/** The question asked before an import replaces work: it names what comes in. */
export function importReplaceQuestion(kind: SourceKind): string {
	return `Replace what you have with this ${importSubject(kind)}?`;
}

/** The confirm button: "Import the pull request", never a bare "OK". */
export function importConfirmLabel(kind: SourceKind): string {
	return `Import the ${importSubject(kind)}`;
}

/**
 * What to do after an import failed, under the reason. A link can be wrong, or
 * private, or over GitHub's limit, and a pasted diff answers all three, so the
 * link kinds say that; a paste the studio could not read is checked and tried again.
 */
export function importNextStep(kind: SourceKind): string {
	const isLink =
		kind === "pr" ||
		kind === "commit" ||
		kind === "release" ||
		kind === "compare" ||
		kind === "code-url";
	return isLink
		? "Check the link, or paste the diff instead."
		: "Check what you pasted, then try again.";
}
