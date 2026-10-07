// @vitest-environment jsdom
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
		document.title = "Typelapse: the landing";
	});
	afterEach(cleanup);

	it("sets the title while the page is mounted and hands the old one back when it goes", () => {
		const view = render(<Page title="Studio · Typelapse" />);
		expect(document.title).toBe("Studio · Typelapse");
		view.unmount();
		expect(document.title).toBe("Typelapse: the landing");
	});

	it("follows the title, and still restores the one from before the page, not the last", () => {
		const view = render(<Page title="Studio · Typelapse" />);
		view.rerender(<Page title="Release notes · Typelapse" />);
		expect(document.title).toBe("Release notes · Typelapse");
		view.unmount();
		expect(document.title).toBe("Typelapse: the landing");
	});

	it("survives StrictMode's second run of every effect", () => {
		const view = render(
			<StrictMode>
				<Page title="Studio · Typelapse" />
			</StrictMode>,
		);
		expect(document.title).toBe("Studio · Typelapse");
		view.unmount();
		expect(document.title).toBe("Typelapse: the landing");
	});
});
