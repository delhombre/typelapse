import { NotFound } from "@/presentation/components/ui/not-found";
import { ROUTE_STATE, RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 404 and the route error face are the product saying "not this page", and
 * they keep the landing's share card tags that index.html wrote for `/`: a link
 * unfurled from the live document (an extension, a share sheet) would describe
 * the landing under a page that says it does not exist. They drop those tags for
 * as long as they are on screen, like `robots`, and give them back when the
 * reader leaves. Both faces also carry the mark, so a lost visitor still sees whose
 * page it is.
 */

function Broken(): never {
	throw new Error("Failed to fetch dynamically imported module");
}

function addShareTags() {
	for (const [attribute, name] of [
		["property", "og:title"],
		["property", "og:image"],
		["name", "twitter:card"],
		["name", "twitter:title"],
	] as const) {
		const meta = document.createElement("meta");
		meta.setAttribute(attribute, name);
		meta.content = "the landing";
		document.head.append(meta);
	}
	const description = document.createElement("meta");
	description.name = "description";
	description.content = "the landing";
	document.head.append(description);
}

const shareTags = () =>
	document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]');

describe("the faces that say this is not a page", () => {
	beforeEach(addShareTags);
	afterEach(() => {
		cleanup();
		for (const meta of document.head.querySelectorAll("meta")) {
			meta.remove();
		}
		vi.restoreAllMocks();
	});

	it("drops the landing's share tags while the 404 is on screen, and puts them back", () => {
		expect(shareTags()).toHaveLength(4);
		const view = render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);
		expect(shareTags()).toHaveLength(0);

		view.unmount();
		expect(shareTags()).toHaveLength(4);
	});

	it("leaves the description alone: only the share card is wrong here", () => {
		render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);
		expect(document.head.querySelector('meta[name="description"]')).not.toBeNull();
	});

	it("drops them under the route error face too, without asking not to be indexed", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const view = render(
			<RouteErrorBoundary>
				<Broken />
			</RouteErrorBoundary>,
		);
		expect(screen.getByRole("alert")).toBeTruthy();
		expect(shareTags()).toHaveLength(0);
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();

		view.unmount();
		expect(shareTags()).toHaveLength(4);
	});

	it("puts the mark above the heading on the 404 and on the error face", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const notFound = render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);
		expect(screen.getByRole("img", { name: "Typelapse" })).toBeTruthy();
		notFound.unmount();

		render(
			<RouteErrorBoundary>
				<Broken />
			</RouteErrorBoundary>,
		);
		expect(screen.getByRole("img", { name: "Typelapse" })).toBeTruthy();
	});

	it("stacks the actions under 380px, where two side by side leave neither a clear target", () => {
		expect(ROUTE_STATE.actions).toContain("max-[379px]:flex-col");
		expect(ROUTE_STATE.actions).toContain("max-[379px]:items-stretch");
	});
});
