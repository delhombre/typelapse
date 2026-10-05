import type { CaptureRecord } from "@/application/captures/capture-record";
import {
	CAPTURES_CHANGED_EVENT,
	browserCaptureLibrary,
} from "@/infrastructure/captures/browser-capture-library";
import { CaptureLibrary } from "@/presentation/components/layout/capture-library";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** What the empty state says: what a capture is and how to make one, in one sentence. */
const EMPTY_SENTENCE = "Export a PNG, GIF, MP4 or WebM and it is kept here as a capture.";

function capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
	return {
		id: "capture-a",
		createdAt: Date.UTC(2026, 9, 5, 14, 2),
		projectId: null,
		projectTitle: "Ship the diff",
		filename: "ship-the-diff.mp4",
		mimeType: "video/mp4",
		bytes: 1_638_950,
		blob: new Blob(["x"], { type: "video/mp4" }),
		...overrides,
	};
}

async function openLibrary() {
	fireEvent.click(screen.getByRole("button", { name: "Library" }));
	return screen.findByRole("dialog", { name: "Capture library" });
}

describe("CaptureLibrary", () => {
	it("opens as a real bottom sheet and says where its captures live", async () => {
		render(<CaptureLibrary />);
		const dialog = await openLibrary();

		expect(dialog).toBeTruthy();
		expect(within(dialog).getByText(/Exports stay on this device/)).toBeTruthy();
	});

	it("says what a capture is and how to make one, in one sentence and one action", async () => {
		render(<CaptureLibrary />);
		const dialog = await openLibrary();

		const sentence = await within(dialog).findByText(EMPTY_SENTENCE);
		expect(sentence.tagName).toBe("P");
		expect(within(dialog).getByRole("button", { name: "Export" })).toBeTruthy();
		// The old label said the state, not what to do about it.
		expect(within(dialog).queryByText("No captures yet")).toBeNull();
	});

	it("hands over to the export panel once the sheet is gone", async () => {
		const opener = vi.fn();
		render(
			<>
				<button type="button" data-island-opener="export" onClick={opener}>
					Export · MP4 · 1080p
				</button>
				<CaptureLibrary />
			</>,
		);
		const dialog = await openLibrary();

		fireEvent.click(within(dialog).getByRole("button", { name: "Export" }));

		// The page behind a modal dialog is inert, so a panel opened now could not take
		// focus: it is asked for after the sheet has closed.
		expect(opener).not.toHaveBeenCalled();
		await waitFor(() => expect(opener).toHaveBeenCalledTimes(1));
		expect(dialog.hasAttribute("open")).toBe(false);
	});

	it("closes on Escape even when another layer has claimed the key", async () => {
		// The phone's drawer claims Escape on the document, and a key whose default is
		// prevented raises no native cancel, so the sheet answers the key itself.
		const claim = (event: KeyboardEvent) => {
			if (event.key === "Escape") event.preventDefault();
		};
		document.addEventListener("keydown", claim, true);
		try {
			render(<CaptureLibrary />);
			const dialog = await openLibrary();

			fireEvent.keyDown(dialog, { key: "Escape" });

			await waitFor(() => expect(dialog.hasAttribute("open")).toBe(false));
		} finally {
			document.removeEventListener("keydown", claim, true);
		}
	});

	it("lists its captures newest first, each with a download", async () => {
		vi.spyOn(browserCaptureLibrary, "list").mockResolvedValue([
			capture({
				id: "capture-b",
				projectTitle: "Rate limiter",
				filename: "rate-limiter.png",
				mimeType: "image/png",
				bytes: 105_200,
			}),
			capture(),
		]);
		render(<CaptureLibrary />);
		const dialog = await openLibrary();

		const cards = await within(dialog).findAllByRole("article");
		expect(cards.map((card) => card.querySelector("strong")?.textContent)).toEqual([
			"Rate limiter",
			"Ship the diff",
		]);
		expect(within(dialog).getByRole("button", { name: "Download rate-limiter.png" })).toBeTruthy();
		expect(within(dialog).getByRole("button", { name: "Download ship-the-diff.mp4" })).toBeTruthy();
		// The action belongs to the empty state: with captures there is nothing to start.
		expect(within(dialog).queryByRole("button", { name: "Export" })).toBeNull();
	});

	it("reads a thumbnail lazily and decodes it off the main thread", async () => {
		// A capture is the whole export (a 4K PNG, a GIF of megabytes), and up to twenty-four
		// are listed: none may be decoded on the main thread before the sheet has settled.
		const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:capture");
		vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
		vi.spyOn(browserCaptureLibrary, "list").mockResolvedValue([
			capture({ id: "capture-b", filename: "frame.png", mimeType: "image/png" }),
			capture(),
		]);
		render(<CaptureLibrary />);
		const dialog = await openLibrary();

		const cards = await within(dialog).findAllByRole("article");
		await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
		const image = cards[0]?.querySelector("img");
		expect(image?.getAttribute("loading")).toBe("lazy");
		expect(image?.getAttribute("decoding")).toBe("async");
		expect(cards[1]?.querySelector("video")?.getAttribute("preload")).toBe("metadata");
	});

	it("goes back to the empty state when its last capture goes", async () => {
		const list = vi.spyOn(browserCaptureLibrary, "list").mockResolvedValue([capture()]);
		render(<CaptureLibrary />);
		const dialog = await openLibrary();
		await within(dialog).findByRole("article");

		list.mockResolvedValue([]);
		act(() => {
			window.dispatchEvent(new Event(CAPTURES_CHANGED_EVENT));
		});

		expect(await within(dialog).findByText(EMPTY_SENTENCE)).toBeTruthy();
		expect(within(dialog).queryByRole("article")).toBeNull();
	});
});
