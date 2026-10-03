/**
 * Exit codes are an interface: the GitHub Action and the agent skill branch on
 * them, so each one means one thing and the README lists them.
 *
 *   0  the file was written
 *   2  the arguments or a local file were wrong: fix the command
 *   3  the source could not be read from GitHub: private, missing, rate-limited, offline
 *   4  the render itself failed
 */
export type FailureCode = 2 | 3 | 4;

export const EXIT_USAGE = 2;
export const EXIT_SOURCE = 3;
export const EXIT_RENDER = 4;

/** A failure the CLI owns: a message a person can act on, in one sentence, and its exit code. */
export class CliError extends Error {
	constructor(
		message: string,
		readonly exitCode: FailureCode,
	) {
		super(sentence(message));
		this.name = "CliError";
	}
}

/** Trim and end on a full stop, so messages from other layers read as the CLI's own. */
export function sentence(message: string): string {
	const text = message.trim().replace(/\s+/g, " ");
	return /[.?]$/.test(text) ? text : `${text}.`;
}
