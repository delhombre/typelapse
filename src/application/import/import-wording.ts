import type { SourceKind } from "./classify-source";
import { importFailureDetailOf, importFailureOf } from "./import-source";

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

/** The two lines of the banner an import failure raises: what happened, then what to do. */
export interface ImportFailureCopy {
	readonly reason: string;
	readonly nextStep: string;
}

const LINK_KINDS: ReadonlySet<SourceKind> = new Set([
	"pr",
	"commit",
	"release",
	"compare",
	"code-url",
]);

const PASTE_DIFF = "paste the diff instead.";

/** When GitHub's limit lifts, in the words its answer allows; never a time it did not give. */
function retryWhen(detail: string | undefined): string {
	const resetsAt = detail ? /resets at (\d{2}:\d{2} UTC)/.exec(detail)?.[1] : undefined;
	if (resetsAt) {
		return `Try again after ${resetsAt}`;
	}
	const seconds = detail ? /retry after (\d+) seconds/.exec(detail)?.[1] : undefined;
	return seconds ? `Try again in ${seconds} seconds` : "Try again in a few minutes";
}

/**
 * What the banner says after an import failed. The importers' sentences carry
 * their own way out ("paste the diff instead"), which is cut here and said once,
 * under the reason: a wrong link is checked, a limit says when it lifts, being
 * offline says so, and a paste the studio could not read is checked and tried
 * again. A link is only called wrong when the failure is the link itself.
 */
export function importFailureCopy(
	kind: SourceKind,
	message: string,
	options: { readonly online?: boolean } = {},
): ImportFailureCopy {
	if (!LINK_KINDS.has(kind)) {
		return { reason: message, nextStep: "Check what you pasted, then try again." };
	}
	switch (importFailureOf(message)) {
		case "not-found":
			return { reason: message, nextStep: `Check the link, or ${PASTE_DIFF}` };
		case "rate-limit":
			return {
				reason: "GitHub's rate limit was hit",
				nextStep: `${retryWhen(importFailureDetailOf(message))}, or ${PASTE_DIFF}`,
			};
		case "unreachable":
			return options.online === false
				? { reason: "You are offline", nextStep: `Reconnect and try again, or ${PASTE_DIFF}` }
				: {
						reason: "Could not reach GitHub",
						nextStep: `Check your connection and try again, or ${PASTE_DIFF}`,
					};
		case "range-too-large":
			return {
				reason: "GitHub will not compare a range this large",
				nextStep: `Use a smaller range, or ${PASTE_DIFF}`,
			};
		case "too-large":
			return {
				reason: "GitHub will not serve a diff this large",
				nextStep: "Paste a smaller diff instead.",
			};
		case "unfetchable":
			return { reason: "Could not fetch the change", nextStep: `Try again, or ${PASTE_DIFF}` };
		case "timeout":
		case "budget":
			return { reason: message, nextStep: `Try again, or ${PASTE_DIFF}` };
		case "other":
			return { reason: message, nextStep: `Try another link, or ${PASTE_DIFF}` };
	}
}
