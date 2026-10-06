import { Hero } from "@/presentation/landing/hero";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

/* #172: Chromium's `insertText` command is quadratic in the number of lines it
   inserts (a bare <textarea> takes 0.9 s for 1,500 lines, 61 s for 8,000), and it
   is the command typing, an input method and automation all go through. A real
   paste is a different command and is not slow. The field takes a long
   `insertText` itself, in one assignment. */
describe("landing hero, a long insertion", () => {
	const LONG = Array.from({ length: 600 }, (_, i) => `const a${i} = ${i};`).join("\n");

	function beforeInput(field: HTMLElement, inputType: string, data: string): InputEvent {
		const event = new InputEvent("beforeinput", {
			inputType,
			data,
			bubbles: true,
			cancelable: true,
		});
		act(() => {
			field.dispatchEvent(event);
		});
		return event;
	}

	function pullRequestField(): HTMLTextAreaElement {
		return screen.getByRole("textbox", { name: /paste a pull request/i }) as HTMLTextAreaElement;
	}

	it("takes a long insertText in one assignment and answers like any other change", () => {
		renderHero();
		const field = pullRequestField();

		const event = beforeInput(field, "insertText", LONG);

		expect(event.defaultPrevented).toBe(true);
		expect(field.value).toBe(LONG);
		expect(field.selectionStart).toBe(LONG.length);
		expect(screen.getByRole("button", { name: "Import & animate" })).toBeTruthy();
	});

	it("inserts at the selection, like the command it replaces", () => {
		renderHero();
		const field = pullRequestField();
		fireEvent.change(field, { target: { value: "head TAIL" } });
		field.setSelectionRange(5, 9);

		beforeInput(field, "insertText", LONG);

		expect(field.value).toBe(`head ${LONG}`);
	});

	it("leaves a short insertion, a paste and a deletion to the browser", () => {
		renderHero();
		const field = pullRequestField();

		expect(beforeInput(field, "insertText", "a\nb").defaultPrevented).toBe(false);
		// A real paste is not slow, and keeps its native undo.
		expect(beforeInput(field, "insertFromPaste", LONG).defaultPrevented).toBe(false);
		expect(beforeInput(field, "deleteContentBackward", "").defaultPrevented).toBe(false);
	});

	it("can be emptied again after it took a long insertion", () => {
		renderHero();
		const field = pullRequestField();
		beforeInput(field, "insertText", LONG);

		fireEvent.change(field, { target: { value: "" } });

		expect(screen.getByRole("button", { name: "Open studio" })).toBeTruthy();
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
