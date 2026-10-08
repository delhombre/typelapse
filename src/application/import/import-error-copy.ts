/**
 * The importers' sentences say what failed; the popover that shows one says
 * what to do next (DECISIONS D13). The infrastructure sentences are pinned by
 * the CLI, the render API and their tests, so the way out is added here, at the
 * edge that shows them to a person, and never in the adapters.
 */

const SUBJECTS: Record<string, string> = {
	PR: "That pull request",
	Commit: "That commit",
	Release: "That release",
	Comparison: "That comparison",
};

const NOT_FOUND = /^(PR|Commit|Release|Comparison) not found \(or the repository is private\)$/;

/** The sentence a popover shows for an importer's failure. Anything unrecognised passes through. */
export function importErrorCopy(message: string): string {
	const match = NOT_FOUND.exec(message.trim());
	const subject = match?.[1] ? SUBJECTS[match[1]] : undefined;
	if (!subject) {
		return message;
	}
	return `${subject} was not found, or its repository is private. Check the link, or paste the diff.`;
}
