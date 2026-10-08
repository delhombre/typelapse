import type { CodeUrlKind } from "./code-url";

/**
 * What a failed fetch of a gist or a GitHub file says (DECISIONS D13: what
 * happened, then what to do). GitHub answers 404 for a repository the visitor
 * cannot see as well as for one that does not exist, so the way out names both.
 */
export function codeUrlFailure(status: number, kind: CodeUrlKind): string {
	if (status === 404) {
		return kind === "gist-api"
			? "That gist was not found. Check the link, and that it is public."
			: "That file was not found. Check the link, and that the repository is public.";
	}
	if (status === 403 || status === 429) {
		return "GitHub's rate limit is reached. Try again in a few minutes, or paste the code.";
	}
	return `Could not fetch (HTTP ${status}). Try again in a moment.`;
}
