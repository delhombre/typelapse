import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Hero } from "@/presentation/landing/hero";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
	/* Decision 2026-10-08-landing-pipeline: the headline is the pipeline, a pull
	   request in and a video out, and the lead under it keeps Viability D1's
	   other two facts, sharp as the preview and in the browser. */
	it("says what the product does in its heading, and what it sells in the lead", () => {
		const { container } = renderHero();

		const heading = screen.getByRole("heading", { level: 1 });
		expect(heading.textContent?.replace(/\u00a0/g, " ")).toBe("A pull request in. A video out.");
		// "pull request" never breaks across two lines.
		expect(heading.textContent).toContain("pull\u00a0request");
		const lead = container.querySelector(".lp-hero-lead")?.textContent ?? "";
		expect(lead).toMatch(/as sharp as the preview/i);
		expect(lead).toMatch(/in your browser/i);
		// Viability D1: mixed media is the pitch's second sentence, never the first.
		expect(lead).toMatch(/\. Text, images, video and audio share the same scenes\.$/);
		expect(lead.search(/sharp/i)).toBeLessThan(lead.search(/Text, images/));
		expect(`${heading.textContent} ${lead}`).not.toContain("\u2014");
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

	/* D8: a label that swaps holds the width of its widest. Both are laid out, the
	   one not shown is hidden from the name, so the button never changes width
	   under a keystroke and the field keeps its room. */
	it("lays out both labels so the button holds one width while you type", () => {
		const { container } = renderHero();
		const button = container.querySelector(".lp-field-cta");
		const labels = () =>
			[...(button?.querySelectorAll(".lp-swap > span") ?? [])].map((label) => [
				label.textContent,
				label.getAttribute("aria-hidden"),
			]);

		expect(labels()).toEqual([
			["Open studio", "false"],
			["Import & animate", "true"],
		]);

		fireEvent.change(screen.getByRole("textbox", { name: /paste a pull request/i }), {
			target: { value: "const answer = 42" },
		});

		expect(labels()).toEqual([
			["Open studio", "true"],
			["Import & animate", "false"],
		]);
	});

	/* #272: the examples name the repository and the pull request number, which is
	   what a person recognises, not a URL cut off by its own ellipsis. */
	it("names each example by its repository and pull request number, and opens that change", () => {
		renderHeroWithStudio();
		const links = screen.getAllByRole("link");

		expect(links.map((link) => link.textContent)).toEqual([
			"oven-sh/bun #37643",
			"vercel/next.js #97139",
			"honojs/hono #5189",
		]);
		fireEvent.click(links[2] as HTMLElement);
		expect(screen.getByLabelText("Studio").textContent).toBe(
			`/app${encodeImportIntent({ source: "https://github.com/honojs/hono/pull/5189" })}`,
		);
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

/* #172: on a 390px phone the pull request's address was cut at the field's edge
   and read "https://github.com/o". A placeholder is never wrapped, so it has to
   be short enough to be read whole where the field is narrowest (about 17
   monospace characters at 360px); the e2e journey measures it in the browser. */
describe("landing hero, the placeholders", () => {
	it.each(["pull request", "diff", "snippet"])(
		"keeps the %s placeholder short enough to read whole",
		(mode) => {
			renderHero();
			fireEvent.click(screen.getByRole("radio", { name: mode }));

			const placeholder = (screen.getByRole("textbox") as HTMLTextAreaElement).placeholder;

			expect(placeholder.length).toBeGreaterThan(0);
			expect(placeholder.length).toBeLessThanOrEqual(16);
		},
	);
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
	it("says Open studio once: the field's button, which wears the primary", () => {
		// The island sits inside the hero, so it has no "Open studio" of its own
		// (round 3 of the #248 review): the field's button is the one way in.
		renderHero();
		expect(screen.getAllByText("Open studio")).toHaveLength(1);

		const css = readFileSync(resolve(__dirname, "../../src/app.css"), "utf8");
		const rule = (css.match(/\.landing-root \.lp-field-cta \{[^}]*\}/g) ?? []).join("\n");
		expect(rule).toContain("background: var(--color-cta)");
		expect(rule).toContain("color: var(--color-on-primary)");
	});
});
