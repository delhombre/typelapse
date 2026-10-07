import { NotFound } from "@/presentation/components/ui/not-found";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The SPA answers an unknown address with its own 404 page under whatever
 * status the host sends (the host's, #112). Whatever that status is, a crawler
 * that reaches this page must not index it, so the page says so itself for as
 * long as it is mounted.
 */

const robots = () => document.head.querySelectorAll('meta[name="robots"]');

describe("the 404 route and search engines", () => {
	afterEach(cleanup);

	it("asks not to be indexed while it is mounted", () => {
		render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);

		expect(robots()).toHaveLength(1);
		expect(robots()[0]?.getAttribute("content")).toBe("noindex");
	});

	it("leaves the head as it found it once the reader moves on", () => {
		const view = render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);

		view.unmount();

		expect(robots()).toHaveLength(0);
	});

	it("does not stack a second tag when it is mounted twice in a row", () => {
		const first = render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);
		first.unmount();
		render(
			<MemoryRouter>
				<NotFound />
			</MemoryRouter>,
		);

		expect(robots()).toHaveLength(1);
	});
});
