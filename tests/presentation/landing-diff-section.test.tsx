import { ImportProductShot } from "@/presentation/landing/diff-section";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("landing paste stage: the import picture", () => {
	it("shows the import as a believable product slice instead of a generic diagram", () => {
		render(<ImportProductShot />);

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

	it("leaves no tab stop on the highlighted code inside the picture", async () => {
		const { container } = render(<ImportProductShot />);

		// Shiki emits <pre tabindex="0">; the frame is aria-hidden decoration, so a
		// keyboard user would land on code they are told is not there.
		const pre = await waitFor(
			() => {
				const found = container.querySelector("pre");
				expect(found).not.toBeNull();
				return found as HTMLPreElement;
			},
			{ timeout: 10_000 },
		);
		expect(pre.closest("[aria-hidden='true']")).not.toBeNull();
		expect(container.querySelector("[tabindex]")).toBeNull();
	});

	it("writes its copy without em-dashes", () => {
		const { container } = render(<ImportProductShot />);

		expect(container.textContent).not.toContain("\u2014");
	});
});
