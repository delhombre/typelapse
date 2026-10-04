import { useSourceImport } from "@/presentation/hooks/use-source-import";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * A paste is evidence, not prose: its whitespace is part of what was pasted.
 *
 * Reading a paste and importing it are two different jobs and only the first one
 * may trim. `classifySource` has to trim, or a URL with a stray newline around it
 * would not be recognised as one. The import must not, or the studio quietly
 * rewrites the user's code: a snippet that opens on a blank line, a body indented
 * because it was copied out of a method, a file that ends with a newline like
 * every well-formed file does. None of that survives a `.trim()`, and nothing
 * downstream puts it back — `Snippet.create` trims only to check for emptiness
 * and stores the code verbatim, and the editor is bound straight to it.
 */

/** Leading blank line, two-space indent on the first code line, trailing newline. */
const INDENTED_PASTE = "\n  const indented = 1\n    const deeper = 2\n";

describe("useSourceImport preserves the paste", () => {
	it("keeps a snippet's leading blank line, indentation and trailing newline byte for byte", async () => {
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run(INDENTED_PASTE);
		});

		expect(useSnippetStore.getState().snippet.code).toBe(INDENTED_PASTE);
	});

	it("still reads what the paste is from the trimmed form", async () => {
		// The classifier must keep trimming: this is a snippet whatever the padding,
		// and a URL wrapped in newlines is still that URL.
		const { result } = renderHook(() => useSourceImport());

		await act(async () => {
			await result.current.run("  \n\tconst padded = 1\n  \n");
		});

		const { snippet } = useSnippetStore.getState();
		expect(snippet.code).toBe("  \n\tconst padded = 1\n  \n");
		expect(snippet.steps).toHaveLength(0);
	});

	it("still refuses a paste that is only whitespace", async () => {
		const { result } = renderHook(() => useSourceImport());
		const before = useSnippetStore.getState().snippet.code;

		let imported: boolean | undefined;
		await act(async () => {
			imported = await result.current.run("   \n\t\n  ");
		});

		expect(imported).toBe(false);
		expect(useSnippetStore.getState().snippet.code).toBe(before);
	});

	it("refuses a link nothing can read instead of importing the URL as code", async () => {
		const { result } = renderHook(() => useSourceImport());
		const before = useSnippetStore.getState().snippet.code;

		let imported: boolean | undefined;
		await act(async () => {
			imported = await result.current.run("https://gitlab.com/a/b/-/merge_requests/1");
		});

		expect(imported).toBe(false);
		expect(result.current.error).toContain("That link is none of them");
		expect(useSnippetStore.getState().snippet.code).toBe(before);
	});
});
