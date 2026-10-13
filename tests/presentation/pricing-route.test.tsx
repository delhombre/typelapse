import { AppRoutes } from "@/app-routes";
import { ROUTE_HEADS } from "@/application/routing/route-head";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRICED = {
	environment: "production",
	creator: {
		monthly: { currency: "USD", unitAmount: 1200 },
		annual: { currency: "USD", unitAmount: 12000 },
	},
};

function catalogAnswers(response: Response) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => response),
	);
}

function mountAt(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<AppRoutes />
		</MemoryRouter>,
	);
}

beforeEach(() => {
	window.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		onchange: null,
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	globalThis.IntersectionObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof IntersectionObserver;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	document.head.innerHTML =
		'<meta name="description" content="the landing"><meta property="og:description" content="the landing">';
	document.title = "the landing";
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("the /pricing route", () => {
	it("names the tab and the description for the page, and gives them back on leaving", async () => {
		catalogAnswers(Response.json(PRICED));
		const { unmount } = mountAt("/pricing");
		// The first mount imports the page's chunk, which a cold transform makes slow.
		await screen.findByRole("heading", { level: 1 }, { timeout: 8000 });

		expect(document.title).toBe("Pricing · Typelapse");
		expect(
			document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
		).toMatch(/^Exporting on your own device is free/);
		unmount();
		// The landing's own words, not what the head held at mount: a hard load of
		// /pricing would otherwise hand pricing's words to the landing.
		expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
			ROUTE_HEADS.landing.description,
		);
		expect(document.title).toBe(ROUTE_HEADS.landing.title);
	});

	it("shows the catalog's prices, annual first, once it answers", async () => {
		catalogAnswers(Response.json(PRICED));
		mountAt("/pricing");

		const card = await screen.findByTestId("creator-card");
		await waitFor(() => expect(card.getAttribute("data-price-state")).toBe("priced"));
		const price = within(card).getByTestId("creator-price");
		expect(price.textContent).toMatch(/^\$120 \/ year.*or \$12 \/ month$/);
	});

	it("shows no number when billing answers 503", async () => {
		catalogAnswers(Response.json({ error: "Hosted billing is not configured" }, { status: 503 }));
		mountAt("/pricing");

		const card = await screen.findByTestId("creator-card");
		await waitFor(() => expect(card.getAttribute("data-price-state")).toBe("unpriced"));
		expect(card.textContent).not.toMatch(/\d/);
		expect(card.textContent).not.toMatch(/[$€£]/);
		// Billing is not configured: no hosted render is promised, the link is the same.
		expect(within(card).queryByRole("link", { name: "Start a hosted render" })).toBeNull();
		expect(
			within(card).getByRole("link", { name: "See Creator in the studio" }).getAttribute("href"),
		).toBe("/app");
	});

	it("says test mode beside the price only for the sandbox", async () => {
		catalogAnswers(Response.json({ ...PRICED, environment: "sandbox" }));
		mountAt("/pricing");

		expect(await screen.findByText("Test mode: no real charges")).toBeTruthy();
	});

	it("marks its own entry in the pill as the current page", async () => {
		catalogAnswers(Response.json(PRICED));
		mountAt("/pricing");

		const pill = await screen.findByRole("navigation", { name: "Sections", hidden: true });
		const link = within(pill).getByRole("link", { name: "Pricing", current: "page", hidden: true });
		expect(link.getAttribute("href")).toBe("/pricing");
	});

	it("offers one hosted action, honestly named, and marks the footer's own link", async () => {
		catalogAnswers(Response.json(PRICED));
		mountAt("/pricing");

		const action = await screen.findByRole(
			"link",
			{ name: "Start a hosted render" },
			{ timeout: 5000 },
		);
		expect(action.getAttribute("href")).toBe("/app");
		expect(screen.getByText("Opens the studio; choose Cloud under Where.")).toBeTruthy();
		const footer = screen.getByRole("contentinfo");
		expect(within(footer).getByRole("link", { name: "Pricing" }).getAttribute("aria-current")).toBe(
			"page",
		);
		expect(within(footer).getByRole("link", { name: "Studio" }).hasAttribute("aria-current")).toBe(
			false,
		);
	});

	it("has the questions, one of which is about cancelling", async () => {
		catalogAnswers(Response.json(PRICED));
		mountAt("/pricing");

		expect(await screen.findByText("What happens to my videos if I cancel?")).toBeTruthy();
		expect(screen.getByText("Refunds")).toBeTruthy();
	});
});
