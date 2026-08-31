import { Hero } from "@/presentation/landing/hero";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/presentation/landing/instrument", () => ({
	Instrument: () => <div aria-label="Product preview" />,
}));

vi.mock("@/presentation/haptics", () => ({ trigger: vi.fn() }));

function renderHero() {
	return render(
		<MemoryRouter>
			<Hero />
		</MemoryRouter>,
	);
}

describe("landing hero", () => {
	it("uses a visible product promise as the page heading", () => {
		renderHero();

		expect(
			screen.getByRole("heading", { level: 1, name: /turn a code change into a video/i }),
		).toBeTruthy();
	});

	it("presents source kinds as one mutually exclusive choice", () => {
		renderHero();

		const group = screen.getByRole("radiogroup", { name: /what you are pasting/i });
		expect(group).toBeTruthy();
		expect(screen.getAllByRole("radio")).toHaveLength(3);
		expect((screen.getByRole("radio", { name: "pull request" }) as HTMLInputElement).checked).toBe(
			true,
		);
	});

	it("names the action honestly for an empty field and a real import", () => {
		renderHero();

		expect(screen.getByRole("button", { name: "Open studio" })).toBeTruthy();

		fireEvent.change(screen.getByRole("textbox", { name: /paste a pull request/i }), {
			target: { value: "const answer = 42" },
		});

		expect(screen.getByRole("button", { name: "Import & animate" })).toBeTruthy();
	});
});
