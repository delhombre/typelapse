import { Hero } from "@/presentation/landing/hero";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/presentation/landing/instrument", () => ({
	Instrument: ({ quietCta }: { quietCta?: boolean }) => (
		<div aria-label="Product preview" data-quiet-cta={quietCta ? "" : undefined} />
	),
}));

vi.mock("@/presentation/haptics", () => ({ trigger: vi.fn() }));

function renderHero() {
	return render(
		<MemoryRouter>
			<Hero />
		</MemoryRouter>,
	);
}

/** Where the studio would open, and with what: the path and the hash the hero sent. */
function Studio() {
	const location = useLocation();
	return <output aria-label="Studio">{`${location.pathname}${location.hash}`}</output>;
}

function renderHeroWithStudio() {
	return render(
		<MemoryRouter>
			<Routes>
				<Route path="/" element={<Hero />} />
				<Route path="/app" element={<Studio />} />
			</Routes>
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

	/* #124: a release or a compare link is a link like a pull request, so Enter
	   carries it into the studio, which imports it the way its own URL import
	   does, and the pastille stops calling it a snippet. */
	it.each([
		"https://github.com/honojs/hono/releases/tag/v4.6.0",
		"https://github.com/honojs/hono/compare/v4.5.0...v4.6.0",
	])("carries %s into the studio on Enter", (url) => {
		renderHeroWithStudio();
		fireEvent.click(screen.getByRole("radio", { name: "snippet" }));
		const input = screen.getByRole("textbox", { name: /paste a snippet/i });

		fireEvent.change(input, { target: { value: url } });
		expect((screen.getByRole("radio", { name: "pull request" }) as HTMLInputElement).checked).toBe(
			true,
		);
		fireEvent.keyDown(input, { key: "Enter" });

		expect(screen.getByRole("status", { name: "Studio" }).textContent).toBe(
			`/app${encodeImportIntent({ source: url })}`,
		);
	});
});

describe("landing hero, the meta line", () => {
	it("keeps each fact whole when the line wraps", () => {
		const { container } = renderHero();
		const meta = container.querySelector(".lp-hero-meta");
		const facts = Array.from(meta?.querySelectorAll(":scope > span:not([aria-hidden])") ?? []);
		// At 375 the line broke inside "MP4, WebM, GIF and PNG"; a fact is the unit
		// that may move to the next line, never half of one.
		expect(facts.map((fact) => fact.textContent)).toEqual([
			"Local by default",
			"Preview matches export",
			"MP4, WebM, GIF and PNG",
		]);
		for (const fact of facts) {
			expect(fact.className).toContain("whitespace-nowrap");
		}
	});
});

describe("landing hero, one filled call to action", () => {
	it("keeps the field's button as the primary and quiets the instrument's own", () => {
		// The island sits inside the hero, so whenever it is on screen the field's
		// "Open studio" is too: two filled buttons with the same words.
		renderHero();
		expect(screen.getByLabelText("Product preview").hasAttribute("data-quiet-cta")).toBe(true);
	});
});
