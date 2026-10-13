// @vitest-environment jsdom
import { CHANGELOG_ENTRIES, WHATS_NEW_COUNT, latestEntries } from "@/application/changelog/entries";
import { STUDIO_SHORTCUTS } from "@/application/shortcuts/studio-shortcuts";
import { StudioUtilities } from "@/presentation/components/layout/studio-utilities";
import { StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { useChangelogStore } from "@/presentation/stores/changelog.store";
import { useHelpRequestStore } from "@/presentation/stores/help-request.store";
import { CHANGELOG_DISMISSED_STORAGE_KEY } from "@/presentation/utils/changelog-dismissals";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const studio = (compact: boolean) =>
	render(
		<MemoryRouter>
			<StudioTooltipProvider>
				<StudioUtilities compact={compact} />
			</StudioTooltipProvider>
		</MemoryRouter>,
	);

const shown = latestEntries(CHANGELOG_ENTRIES, WHATS_NEW_COUNT);

beforeEach(() => {
	window.localStorage.clear();
	useChangelogStore.setState({ dismissed: new Set() });
	useHelpRequestStore.setState({ requested: false, opener: null });
});

afterEach(cleanup);

async function openHelpFromIsland() {
	studio(false);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Help" }));
	});
	return screen.findByRole("dialog", { name: "Help" });
}

describe("Help, from the desktop island", () => {
	it("opens a sheet with the three sections and a link to the docs", async () => {
		const dialog = await openHelpFromIsland();
		for (const name of ["How scenes work", "Focus lines", "Keyboard shortcuts"]) {
			expect(within(dialog).getByRole("heading", { name })).toBeTruthy();
		}
		const link = within(dialog).getByRole("link", { name: "How it works" });
		expect(link.getAttribute("href")).toBe("/#how-it-works");
		expect(within(dialog).getByText("2-4, 7", { selector: "code" })).toBeTruthy();
		expect(dialog.textContent).toContain("Example: 2-4, 7 keeps lines 2, 3, 4 and 7 bright.");
	});

	it("lists every shortcut of the table the hook reads, keys as kbd elements", async () => {
		const dialog = await openHelpFromIsland();
		const rows = [...dialog.querySelectorAll(".help-shortcuts li")];
		expect(rows).toHaveLength(STUDIO_SHORTCUTS.length);
		for (const [index, shortcut] of STUDIO_SHORTCUTS.entries()) {
			expect(rows[index]?.textContent).toContain(shortcut.label);
			expect(rows[index]?.querySelectorAll("kbd").length).toBeGreaterThan(0);
		}
		const undo = rows[STUDIO_SHORTCUTS.findIndex((s) => s.id === "undo")] as HTMLElement;
		// jsdom reports no Apple platform: the modifier is Ctrl.
		expect([...undo.querySelectorAll("kbd")].map((k) => k.textContent)).toEqual(["Ctrl", "Z"]);
	});

	it("closes with Escape and gives focus back to the button that asked", async () => {
		await openHelpFromIsland();
		const button = screen.getByRole("button", { name: "Help" });
		fireEvent.keyDown(screen.getByRole("dialog", { name: "Help" }), { key: "Escape" });
		await waitFor(() => expect(document.querySelector("dialog[open]")).toBeNull());
		expect(document.activeElement).toBe(button);
	});
});

describe("Help, from the phone's More menu", () => {
	it("sits after Showcase and Library's place and before the file actions", async () => {
		studio(true);
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));
		const menu = document.querySelector(".sc-utility-overflow-menu") as HTMLElement;
		const rows = [...menu.querySelectorAll(":scope > :is(button, a)")].map((el) =>
			el.textContent?.trim(),
		);
		const help = rows.findIndex((row) => row?.startsWith("Help"));
		expect(help).toBeGreaterThanOrEqual(0);
		expect(rows.findIndex((row) => row?.startsWith("Export project file"))).toBeGreaterThan(help);
		await act(async () => {
			fireEvent.click(within(menu).getByRole("button", { name: "Help" }));
		});
		expect(await screen.findByRole("dialog", { name: "Help" })).toBeTruthy();
		await waitFor(() => expect(document.querySelector(".sc-utility-overflow-menu")).toBeNull());
		expect(useHelpRequestStore.getState().requested).toBe(false);
	});
});

describe("What's new", () => {
	it("tops the sheet with the latest three entries, newest first, and a dot says so", async () => {
		const dialog = await openHelpFromIsland();
		const card = within(dialog).getByRole("region", { name: "What's new" });
		const titles = [...card.querySelectorAll("li strong")].map((el) => el.textContent);
		expect(titles).toEqual(shown.map((entry) => entry.title));
		expect(shown).toHaveLength(WHATS_NEW_COUNT);
		expect(
			screen.getByRole("button", { name: "Help" }).querySelector(".sc-new-dot"),
		).not.toBeNull();
	});

	it("is put away by Dismiss, which clears the dot and is remembered", async () => {
		const dialog = await openHelpFromIsland();
		fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss" }));
		expect(within(dialog).queryByRole("region", { name: "What's new" })).toBeNull();
		expect(screen.getByRole("button", { name: "Help" }).querySelector(".sc-new-dot")).toBeNull();
		const stored = JSON.parse(
			window.localStorage.getItem(CHANGELOG_DISMISSED_STORAGE_KEY) ?? "{}",
		) as { ids: string[] };
		expect(stored.ids.sort()).toEqual(shown.map((entry) => entry.id).sort());
	});

	it("leaves the rest of the sheet when the card is gone, and the dot off the More button", async () => {
		useChangelogStore.getState().dismiss(shown.map((entry) => entry.id));
		const dialog = await openHelpFromIsland();
		expect(within(dialog).queryByRole("region", { name: "What's new" })).toBeNull();
		expect(within(dialog).getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
		cleanup();
		studio(true);
		expect(
			screen.getByRole("button", { name: "More actions" }).querySelector(".sc-new-dot"),
		).toBeNull();
	});

	it("shows the dot on More while something is unread", () => {
		studio(true);
		expect(
			screen.getByRole("button", { name: "More actions" }).querySelector(".sc-new-dot"),
		).not.toBeNull();
	});
});
