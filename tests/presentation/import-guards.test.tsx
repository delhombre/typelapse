import { DiffImportMenu } from "@/presentation/components/layout/diff-import-menu";
import { StudioSourceHub } from "@/presentation/components/layout/studio-source-hub";
import { UrlImportMenu } from "@/presentation/components/layout/url-import-menu";
import { BackgroundPicker } from "@/presentation/components/preview/background-picker";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { useStudioCompositionStore } from "@/presentation/stores/studio-composition.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Every path that replaces the whole studio asks first when there is work to
 * lose: the template gallery always did, and the diff paste, the URL fetch and
 * the JSON file now walk the same confirm. Failures that used to die in the
 * console surface as notices instead.
 */

// Hoisted above the imports: the theme-mode store reads matchMedia the moment
// its module loads, before any beforeAll could run. jsdom ships none; report
// reduced motion so nothing animates forever under the test clock.
vi.hoisted(() => {
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

	// jsdom 26 parses <dialog> but implements none of its behaviour. Shim the
	// two calls the confirm makes; what the real top layer buys — escaping the
	// top bar's backdrop-filter containing block — is asserted on the tag below,
	// because no DOM emulator can show it.
	window.HTMLDialogElement.prototype.showModal = function showModal() {
		this.open = true;
	};
	window.HTMLDialogElement.prototype.close = function close() {
		this.open = false;
	};
});

afterEach(() => {
	cleanup();
	for (const notice of useNoticeStore.getState().notices) {
		useNoticeStore.getState().dismiss(notice.id);
	}
});

const VALID_DIFF = [
	"diff --git a/src/greet.ts b/src/greet.ts",
	"index 1234567..89abcde 100644",
	"--- a/src/greet.ts",
	"+++ b/src/greet.ts",
	"@@ -1,3 +1,3 @@",
	" function greet(name) {",
	'-  return "Hello " + name;',
	"+  return `Hello, ${name}!`;",
	" }",
].join("\n");

let dirtySerial = 0;

/** Give the studio work the user would mourn: an edit past the baseline. */
function makeDirty(): void {
	dirtySerial += 1;
	useSnippetStore.getState().setCode(`const mine = ${dirtySerial};`);
	expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(true);
}

/** Re-baseline the studio: whatever it holds now counts as loaded, not edited. */
function makePristine(): void {
	const store = useSnippetStore.getState();
	store.importFromJson(JSON.stringify(store.toProjectPayload()));
	expect(useSnippetStore.getState().hasUnsavedEdits()).toBe(false);
}

describe("ConfirmDiscard", () => {
	it("shows the message and routes both buttons", () => {
		const onCancel = vi.fn();
		const onConfirm = vi.fn();
		render(
			<ConfirmDiscard
				message="Replace what you have with this?"
				confirmLabel="Do it"
				onCancel={onCancel}
				onConfirm={onConfirm}
			/>,
		);

		expect(screen.getByText("Replace what you have with this?")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Keep my snippet" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Do it" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});

describe("DiffImportMenu guard", () => {
	function openAndPaste(text: string): void {
		fireEvent.click(screen.getByRole("button", { name: "Import a git diff" }));
		fireEvent.change(
			screen.getByRole("textbox", { name: "Git diff or GitHub pull request link" }),
			{
				target: { value: text },
			},
		);
	}

	it("asks before a diff paste replaces edited work, and cancel keeps it", () => {
		makeDirty();
		const codeBefore = useSnippetStore.getState().snippet.code;
		render(<DiffImportMenu />);
		openAndPaste(VALID_DIFF);

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(screen.getByText(/Replace what you have/)).toBeTruthy();
		expect(useSnippetStore.getState().snippet.code).toBe(codeBefore);

		fireEvent.click(screen.getByRole("button", { name: "Keep my snippet" }));
		expect(screen.queryByText(/Replace what you have/)).toBeNull();
		// The paste survives the cancel: nothing was thrown away on either side.
		expect(
			screen.getByRole("textbox", { name: "Git diff or GitHub pull request link" }),
		).toBeTruthy();
		expect(useSnippetStore.getState().snippet.code).toBe(codeBefore);
	});

	it("imports once the replacement is confirmed", async () => {
		makeDirty();
		render(<DiffImportMenu />);
		openAndPaste(VALID_DIFF);

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));
		fireEvent.click(screen.getByRole("button", { name: "Import the diff" }));

		await waitFor(() => {
			expect(useSnippetStore.getState().snippet.steps.length).toBeGreaterThan(0);
		});
		expect(useSnippetStore.getState().snippet.title).toBe("greet.ts");
	});

	it("imports straight away when the studio is pristine", async () => {
		makePristine();
		render(<DiffImportMenu />);
		openAndPaste(VALID_DIFF);

		fireEvent.click(screen.getByRole("button", { name: "Apply" }));

		expect(screen.queryByText(/Replace what you have/)).toBeNull();
		await waitFor(() => {
			expect(useSnippetStore.getState().snippet.title).toBe("greet.ts");
		});
	});
});

describe("UrlImportMenu guard", () => {
	const GIST_URL = "https://gist.github.com/someone/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

	it("asks before a fetched file replaces edited work, without fetching yet", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(() => Promise.reject(new Error("offline")));
		makeDirty();
		render(<UrlImportMenu />);

		fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Gist or GitHub link" }), {
			target: { value: GIST_URL },
		});
		fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

		expect(screen.getByText(/Replace what you have/)).toBeTruthy();
		expect(fetchSpy).not.toHaveBeenCalled();

		// Confirming hands over to the ordinary fetch path.
		fireEvent.click(screen.getByRole("button", { name: "Import the file" }));
		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalled();
		});
		fetchSpy.mockRestore();
	});
});

describe("StudioSourceHub import guard", () => {
	function LocationProbe() {
		return <output aria-label="Current route">{useLocation().pathname}</output>;
	}

	function renderNav() {
		return render(
			<MemoryRouter>
				<StudioSourceHub />
				<LocationProbe />
			</MemoryRouter>,
		);
	}

	function openSourceMenu(): void {
		fireEvent.click(screen.getByRole("button", { name: "Add source" }));
	}

	function chooseFile(container: HTMLElement, file: File): void {
		const input = container.querySelector('input[type="file"]');
		expect(input).not.toBeNull();
		fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
	}

	const OPENED_PROJECT = JSON.stringify({
		title: "opened.ts",
		code: "const opened = 1;",
		language: "typescript",
		themeName: "nord",
		background: "mesh:ocean",
		steps: [],
	});

	it("adds a text layer inside the code studio instead of navigating to another shell", async () => {
		makePristine();
		renderNav();
		const composition = useStudioCompositionStore.getState();
		const sceneId = composition.selectedSceneId;
		if (!sceneId) {
			throw new Error("The Studio composition must select a scene");
		}
		const before = composition.value.project.scenes.find((scene) => scene.id === sceneId)?.blocks
			.length;

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Add text" }));

		await waitFor(() => {
			expect(screen.getByLabelText("Current route").textContent).toBe("/");
			expect(
				useStudioCompositionStore
					.getState()
					.value.project.scenes.find((scene) => scene.id === sceneId)?.blocks.length,
			).toBe((before ?? 0) + 1);
		});
	});

	it("switches between the two import popovers in one press", async () => {
		makePristine();
		renderNav();

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Import from URL" }));
		expect(screen.getByRole("dialog", { name: "Import from URL" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Add source" }));
		fireEvent.click(screen.getByRole("menuitem", { name: "Import a git diff" }));
		expect(screen.getByRole("dialog", { name: "Import a git diff" })).toBeTruthy();
		await waitFor(() => {
			expect(screen.queryByRole("dialog", { name: "Import from URL" })).toBeNull();
		});
	});

	it("asks before an opened file replaces edited work", async () => {
		makeDirty();
		const codeBefore = useSnippetStore.getState().snippet.code;
		const { container } = renderNav();

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Open project file" }));
		chooseFile(container, new File([OPENED_PROJECT], "opened.json", { type: "application/json" }));

		expect(await screen.findByText(/Replace what you have/)).toBeTruthy();
		expect(useSnippetStore.getState().snippet.code).toBe(codeBefore);

		fireEvent.click(screen.getByRole("button", { name: "Open the file" }));
		await waitFor(() => {
			expect(useSnippetStore.getState().snippet.title).toBe("opened.ts");
		});
	});

	it("asks from the top layer, not from inside the blurred top bar", async () => {
		makeDirty();
		const { container } = renderNav();

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Open project file" }));
		chooseFile(container, new File([OPENED_PROJECT], "opened.json", { type: "application/json" }));
		const question = await screen.findByText(/Replace what you have/);

		// The top bar carries `backdrop-blur`, which makes it the containing block
		// for every `fixed` descendant: a scrim rendered there would cover the
		// 56px bar and nothing else. Only a modal <dialog> escapes to the top layer.
		const dialog = question.closest("dialog");
		expect(dialog).not.toBeNull();
		expect(dialog?.open).toBe(true);
		// And it is labelled by the question it is asking.
		expect(dialog?.getAttribute("aria-labelledby")).toBe(question.id);
		expect(container.contains(dialog)).toBe(true);
	});

	it("opens straight away when the studio is pristine", async () => {
		makePristine();
		const { container } = renderNav();

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Open project file" }));
		chooseFile(
			container,
			new File([OPENED_PROJECT.replace("opened.ts", "direct.ts")], "direct.json", {
				type: "application/json",
			}),
		);

		await waitFor(() => {
			expect(useSnippetStore.getState().snippet.title).toBe("direct.ts");
		});
		expect(screen.queryByText(/Replace what you have/)).toBeNull();
	});

	it("surfaces a broken file as a notice instead of a console line", async () => {
		makePristine();
		const { container } = renderNav();

		openSourceMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: "Open project file" }));
		chooseFile(container, new File(["{broken"], "broken.json", { type: "application/json" }));

		await waitFor(() => {
			expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0);
		});
		const notice = useNoticeStore.getState().notices[0];
		expect(notice?.tone).toBe("error");
		expect(notice?.message).toBe("That file is not valid JSON, so it is not a Typelapse project.");
		expect(notice?.detail).toBe("broken.json");
	});
});

describe("BackgroundPicker oversized image", () => {
	it("refuses with a notice that names the file, keeping the backdrop", () => {
		const onSelect = vi.fn();
		const { container } = render(<BackgroundPicker selected="mesh:aurora" onSelect={onSelect} />);

		const input = container.querySelector('input[aria-label="Upload background image"]');
		expect(input).not.toBeNull();
		const huge = new File([new Uint8Array(5 * 1024 * 1024)], "huge.png", { type: "image/png" });
		fireEvent.change(input as HTMLInputElement, { target: { files: [huge] } });

		const notice = useNoticeStore.getState().notices[0];
		expect(notice?.tone).toBe("error");
		expect(notice?.detail).toContain("huge.png");
		expect(onSelect).not.toHaveBeenCalled();
	});
});
