// @vitest-environment jsdom
import { StudioEditor } from "@/presentation/components/editor/studio-editor";
import { EditorPresence } from "@/presentation/contexts/editor-presence";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Monaco needs a real browser; the stand-in counts mounts.
const editorMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/presentation/components/editor/code-editor", async () => {
	const { useEffect } = await import("react");
	return {
		CodeEditor: () => {
			useEffect(() => {
				editorMounts.count += 1;
			}, []);
			return <div data-testid="code-editor" />;
		},
	};
});

function slot(shown: boolean) {
	return (
		<EditorPresence shown={shown}>
			<StudioEditor />
		</EditorPresence>
	);
}

describe("the code editor is mounted when its slot is shown, not before", () => {
	beforeEach(() => {
		editorMounts.count = 0;
	});
	afterEach(cleanup);

	it("renders no editor while the slot has never been shown", () => {
		render(slot(false));
		expect(screen.queryByTestId("code-editor")).toBeNull();
		expect(editorMounts.count).toBe(0);
	});

	it("mounts it the first time the slot is shown", () => {
		const view = render(slot(false));
		view.rerender(slot(true));
		expect(screen.getByTestId("code-editor")).toBeTruthy();
		expect(editorMounts.count).toBe(1);
	});

	it("opens already mounted when it starts shown", () => {
		render(slot(true));
		expect(screen.getByTestId("code-editor")).toBeTruthy();
		expect(editorMounts.count).toBe(1);
	});

	it("keeps the same editor, and so its text and cursor, across Preview and back", () => {
		const view = render(slot(false));
		view.rerender(slot(true));
		const first = screen.getByTestId("code-editor");
		view.rerender(slot(false));
		expect(screen.getByTestId("code-editor")).toBe(first);
		view.rerender(slot(true));
		expect(screen.getByTestId("code-editor")).toBe(first);
		expect(editorMounts.count).toBe(1);
	});

	it("shows the editor when nothing says otherwise", () => {
		render(<StudioEditor />);
		expect(screen.getByTestId("code-editor")).toBeTruthy();
	});
});
