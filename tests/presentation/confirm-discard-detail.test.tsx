// @vitest-environment jsdom
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

/**
 * The shared confirmation was written for loading something over the open
 * snippet. A host that asks about something else says its own sentence and names
 * its own safe answer; a host that says nothing keeps the snippet's words.
 */
describe("ConfirmDiscard for a question that is not about the snippet", () => {
	it("says the host's sentence and safe answer instead of the snippet's", () => {
		render(
			<ConfirmDiscard
				message="Delete “Launch”?"
				detail="Its revisions, renders and their share pages go with it."
				keepLabel="Keep project"
				confirmLabel="Delete project"
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(
			screen.getByText("Its revisions, renders and their share pages go with it."),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Keep project" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Delete project" })).toBeTruthy();
		expect(screen.queryByText(/snippet/i)).toBeNull();
	});

	it("keeps the snippet's words when the host says nothing", () => {
		render(
			<ConfirmDiscard
				message="Replace it?"
				confirmLabel="Do it"
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(screen.getByText(/Your snippet has changes only this browser remembers/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Keep my snippet" })).toBeTruthy();
	});

	it("puts the keyboard on the safe answer when the host asks it to, and on nothing otherwise", () => {
		const { rerender } = render(
			<ConfirmDiscard
				message="Replace it?"
				confirmLabel="Do it"
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);
		expect(document.activeElement).toBe(document.body);

		rerender(
			<ConfirmDiscard
				key="focused"
				message="Delete it?"
				keepLabel="Keep it"
				focusKeep
				confirmLabel="Delete"
				onCancel={() => {}}
				onConfirm={() => {}}
			/>,
		);

		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
	});
});
