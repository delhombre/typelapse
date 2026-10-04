import type { SourceKind } from "./classify-source";

const SUBJECTS: Record<Exclude<SourceKind, "empty">, string> = {
	pr: "pull request",
	commit: "commit",
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
