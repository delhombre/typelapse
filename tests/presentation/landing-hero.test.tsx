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
	/* Viability D1: sharp, in the browser, from a pull request first; mixed
	   media is the second sentence, not the first. */
	it("says what the product sells in its heading, and mixed media second", () => {
		renderHero();

		const heading = screen.getByRole("heading", { level: 1 });
		const text = heading.textContent ?? "";
		expect(text).toMatch(/as sharp as their preview/i);
		expect(text).toMatch(/in your browser from a pull request/i);
		expect(text).toMatch(/text, images, video and audio/i);
		expect(text.search(/sharp/i)).toBeLessThan(text.search(/text, images/i));
		expect(text).not.toContain("\u2014");
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

	/* #40: the drawn block is a sibling after the field, so it can only stand at
	   the end of the text. It holds the empty field alone, where the end is the
	   only place the caret can be; with content the native caret takes over, the
	   one caret that follows selectionStart through arrows, Home and End. */
	it("hands the caret to the native one the moment the field has content", () => {
		const { container } = renderHero();
		const field = container.querySelector(".lp-field");
		const input = screen.getByRole("textbox", { name: /paste a pull request/i });

		expect(field?.hasAttribute("data-empty")).toBe(true);
		expect(container.querySelector(".lp-caret")).toBeTruthy();

		fireEvent.change(input, { target: { value: "https://github.com/honojs/hono/pull/5189" } });
		fireEvent.keyDown(input, { key: "Home" });

		expect(field?.hasAttribute("data-empty")).toBe(false);
		expect((input as HTMLTextAreaElement).style.caretColor).toBe("");
	});
});
