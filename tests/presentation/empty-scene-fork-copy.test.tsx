// @vitest-environment jsdom
import { EmptySceneFork } from "@/presentation/components/editor/empty-scene-fork";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("the empty scene's fork", () => {
	// It shows on the phone's scenes stop, where no editor is drawn, and in the desktop's Edit:
	// its lead must be true in both, so it names no editor (#270).
	it("says what the primary action does without naming an editor", () => {
		render(<EmptySceneFork onCapture={() => undefined} />);
		expect(
			screen.getByText("Capture this code as your first scene, or start from something else."),
		).toBeTruthy();
		expect(screen.queryByText(/in the editor/i)).toBeNull();
	});
});
