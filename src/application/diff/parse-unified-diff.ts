import type { DiffFile, DiffHunk, DiffLine, ParsedDiff } from "./types";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Strip a `--- ` / `+++ ` path marker down to a repo-relative path.
 *
 * Handles git's `a/` / `b/` prefixes, `/dev/null`, quoted paths, and the
 * trailing `\t<timestamp>` that plain `diff -u` appends.
 */
function parsePathMarker(raw: string): string | null {
	let path = raw.replace(/\t.*$/, "").trim();
	if (path === "/dev/null") {
		return null;
	}
	if (path.startsWith('"') && path.endsWith('"')) {
		path = path.slice(1, -1);
	}
	return path.replace(/^[ab]\//, "");
}

/**
 * Parse unified-diff text (the output of `git diff` / `diff -u`) into a
 * structured, framework-free representation.
 *
 * The parser is count-driven: each hunk header declares how many old-side and
 * new-side lines follow, so content that happens to look like a header
 * (e.g. an added line starting with `---`) is preserved verbatim. Input that
 * isn't a diff simply yields `{ files: [] }` — callers decide how to react.
 */
export function parseUnifiedDiff(text: string): ParsedDiff {
	const lines = text.split(/\r?\n/);
	const files: DiffFile[] = [];

	let current: DiffFile | null = null;
	let pendingNew = false;
	let pendingDeleted = false;

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line === undefined) {
			i++;
			continue;
		}

		// Extended git headers that flag creation / deletion before the ---/+++ pair.
		if (line.startsWith("new file mode")) {
			pendingNew = true;
			i++;
			continue;
		}
		if (line.startsWith("deleted file mode")) {
			pendingDeleted = true;
			i++;
			continue;
		}

		// The `--- old` / `+++ new` pair opens a file section.
		if (line.startsWith("--- ")) {
			const oldPath = parsePathMarker(line.slice(4));
			const next = lines[i + 1];
			let newPath: string | null = null;
			if (next?.startsWith("+++ ")) {
				newPath = parsePathMarker(next.slice(4));
				i += 2;
			} else {
				i += 1;
			}
			current = {
				oldPath,
				newPath,
				isNew: pendingNew || oldPath === null,
				isDeleted: pendingDeleted || newPath === null,
				hunks: [],
			};
			files.push(current);
			pendingNew = false;
			pendingDeleted = false;
			continue;
		}

		const hunkMatch = HUNK_HEADER.exec(line);
		if (hunkMatch) {
			// A stray hunk with no preceding file header: attach it to an anonymous file.
			if (!current) {
				current = {
					oldPath: null,
					newPath: null,
					isNew: false,
					isDeleted: false,
					hunks: [],
				};
				files.push(current);
			}

			const oldLines = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
			const newLines = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
			const hunk: DiffHunk = {
				oldStart: Number(hunkMatch[1]),
				oldLines,
				newStart: Number(hunkMatch[3]),
				newLines,
				heading: (hunkMatch[5] ?? "").trim(),
				lines: [],
			};

			i++;
			i = consumeHunkBody(lines, i, oldLines, newLines, hunk.lines);
			current.hunks.push(hunk);
			continue;
		}

		// `diff --git`, `index`, mode/rename headers, or unrelated text: skip.
		i++;
	}

	return { files };
}

/**
 * Read a hunk body, consuming exactly the declared number of old- and new-side
 * lines. Returns the index of the first line past the hunk.
 */
function consumeHunkBody(
	lines: string[],
	start: number,
	oldLines: number,
	newLines: number,
	out: DiffLine[],
): number {
	let i = start;
	let oldRemaining = oldLines;
	let newRemaining = newLines;

	while (i < lines.length && (oldRemaining > 0 || newRemaining > 0)) {
		const line = lines[i];
		if (line === undefined) {
			break;
		}

		const marker = line[0];
		if (line === "") {
			// A blank context line whose leading space was trimmed in transit.
			out.push({ type: "context", content: "" });
			oldRemaining--;
			newRemaining--;
			i++;
		} else if (marker === " ") {
			out.push({ type: "context", content: line.slice(1) });
			oldRemaining--;
			newRemaining--;
			i++;
		} else if (marker === "+") {
			out.push({ type: "add", content: line.slice(1) });
			newRemaining--;
			i++;
		} else if (marker === "-") {
			out.push({ type: "remove", content: line.slice(1) });
			oldRemaining--;
			i++;
		} else if (marker === "\\") {
			// "\ No newline at end of file" — annotates the previous line, no count.
			i++;
		} else {
			// Anything else (a new header, malformed input): the hunk ends here.
			break;
		}
	}

	return i;
}
