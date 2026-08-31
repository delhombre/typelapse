import { DiffSection } from "@/presentation/landing/diff-section";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing diff section", () => {
	it("shows the import as a believable product slice instead of a generic diagram", () => {
		render(<DiffSection />);

		expect(
			screen.getByRole("img", {
				name: /pull request 1247 becoming three editable scenes/i,
			}),
		).toBeTruthy();
		expect(screen.getByText("Imported from GitHub")).toBeTruthy();
		expect(screen.getByText("3 scenes ready")).toBeTruthy();
		expect(screen.getByText("Add scene")).toBeTruthy();
		expect(screen.queryByText("Generated timeline")).toBeNull();
	});
});
