import type { BillingCatalog } from "@/domain/ports/billing.port";
import { PricingSection } from "@/presentation/landing/pricing-section";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	class Observer {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	window.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
});

afterEach(cleanup);

function renderPricing(catalog?: BillingCatalog) {
	return render(
		<MemoryRouter>
			<PricingSection catalog={catalog} />
		</MemoryRouter>,
	);
}

function packageCard(name: string): HTMLElement {
	const heading = screen.getByRole("heading", { name });
	const card = heading.closest("article");
	if (!card) {
		throw new Error(`Expected ${name} to be rendered in a package card`);
	}
	return card;
}

describe("PricingSection", () => {
	it("keeps the local studio accountless and honest about its current output", () => {
		renderPricing();

		const local = packageCard("On-device");
		expect(within(local).getByText("Available now")).toBeTruthy();
		expect(local.textContent).toMatch(/no account/i);
		expect(local.textContent).toMatch(/indexeddb/i);
		expect(local.textContent).toMatch(/editable project file/i);
		expect(local.textContent).not.toMatch(/mp4|webm|gif|png|local video/i);
		expect(
			within(local).getByRole("link", { name: "Open local studio" }).getAttribute("href"),
		).toBe("/app");
	});

	it("derives the cloud-render boundary from the Free and Creator plans", () => {
		renderPricing();

		const free = packageCard("Hosted Free");
		expect(free.textContent).toMatch(/cloud video is not included/i);
		expect(free.textContent).not.toMatch(/mp4|webm/i);

		const creator = packageCard("Creator");
		expect(creator.textContent).toMatch(/4K/);
		expect(creator.textContent).toMatch(/60 fps/);
		expect(creator.textContent).toMatch(/private MP4 and WebM/i);
		expect(creator.textContent).toMatch(/signed private download/i);
	});

	it("does not invent a price, checkout, or shipped Studio collaboration", () => {
		const { container } = renderPricing();

		expect(container.textContent).not.toMatch(/[$€£]\s*\d/);
		expect(screen.queryByRole("button", { name: /buy|subscribe|upgrade/i })).toBeNull();
		const studio = packageCard("Studio");
		expect(within(studio).getByText("Later")).toBeTruthy();
		expect(studio.textContent).toMatch(/not for sale/i);
		expect(studio.textContent).toMatch(/planned/i);
	});

	it("shows Stripe-authoritative Creator prices and a studio CTA when a catalog is live", () => {
		renderPricing({
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		});

		const creator = packageCard("Creator");
		expect(within(creator).getByText("€12")).toBeTruthy();
		expect(within(creator).getByText("monthly · €120 annually")).toBeTruthy();
		expect(within(creator).getByRole("link", { name: "Choose Creator" })).toBeTruthy();
	});
});
