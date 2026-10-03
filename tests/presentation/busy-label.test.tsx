import { BusyLabel } from "@/presentation/components/ui/busy-label";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Fetch and Apply swapped their word for a 13px spinner, so the button shrank
 * to the spinner's width the moment it was pressed. The word stays and only
 * stops being seen, which keeps the button as wide as it was.
 */
describe("a button label that waits", () => {
	afterEach(() => cleanup());

	it("keeps its word in place, unseen, while the spinner shows", () => {
		render(
			<button type="button">
				<BusyLabel busy>Fetch</BusyLabel>
			</button>,
		);

		const word = screen.getByText("Fetch");
		expect(word.className).toContain("invisible");
		expect(screen.getByRole("button", { name: "Loading" })).toBeTruthy();
	});

	it("is just the word when idle", () => {
		render(
			<button type="button">
				<BusyLabel busy={false}>Apply</BusyLabel>
			</button>,
		);

		expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
		expect(screen.queryByRole("img", { name: "Loading" })).toBeNull();
	});
});
