import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @vitest-environment jsdom
import { LANDING_DOCUMENT_TITLE } from "@/application/project/document-title";
import { useDocumentTitle } from "@/presentation/hooks/use-document-title";
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function Page({ title }: { title: string }) {
	useDocumentTitle(title);
	return null;
}

describe("useDocumentTitle", () => {
	beforeEach(() => {
		document.title = LANDING_DOCUMENT_TITLE;
	});
	afterEach(cleanup);

	it("says the same title as index.html, which cannot import it", () => {
		const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
		expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(LANDING_DOCUMENT_TITLE);
	});

	it("sets the title while the page is mounted and hands the landing's back when it goes", () => {
		const view = render(<Page title="Studio · Typelapse" />);
		expect(document.title).toBe("Studio · Typelapse");
		view.unmount();
		expect(document.title).toBe(LANDING_DOCUMENT_TITLE);
	});

	it("follows the title", () => {
		const view = render(<Page title="Studio · Typelapse" />);
		view.rerender(<Page title="Release notes · Typelapse" />);
		expect(document.title).toBe("Release notes · Typelapse");
		view.unmount();
		expect(document.title).toBe(LANDING_DOCUMENT_TITLE);
	});

	it("gives the landing's title back even when the tab was already named before it mounted", () => {
		// A hard load of /app: index.html's script named the tab "Studio" first.
		document.title = "Studio · Typelapse";
		const view = render(<Page title="Studio · Typelapse" />);
		view.unmount();
		expect(document.title).toBe(LANDING_DOCUMENT_TITLE);
	});

	it("survives StrictMode's second run of every effect", () => {
		const view = render(
			<StrictMode>
				<Page title="Studio · Typelapse" />
			</StrictMode>,
		);
		expect(document.title).toBe("Studio · Typelapse");
		view.unmount();
		expect(document.title).toBe(LANDING_DOCUMENT_TITLE);
	});
});
