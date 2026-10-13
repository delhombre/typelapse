// @vitest-environment jsdom
import { AccountTabs } from "@/presentation/components/multimedia/account-tabs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

type Id = "projects" | "plan" | "keys";

function Harness({ initial = "projects" as Id }: { initial?: Id }) {
	const [active, setActive] = useState<Id>(initial);
	return (
		<AccountTabs
			label="Account sections"
			active={active}
			onActive={setActive}
			tabs={[
				{ id: "projects", label: "Projects", content: <button type="button">Save</button> },
				{
					id: "plan",
					label: "Plan",
					content: (
						<>
							<p>Current plan</p>
							<button type="button">Manage billing</button>
						</>
					),
				},
				{ id: "keys", label: "API keys", content: <input aria-label="Name" /> },
			]}
		/>
	);
}

const tab = (name: string) => screen.getByRole("tab", { name });
const panelOf = (name: string) => {
	const id = tab(name).getAttribute("aria-controls");
	const panel = id ? document.getElementById(id) : null;
	if (!panel) throw new Error(`No panel for ${name}`);
	return panel;
};

/** Scroll a panel by hand: jsdom has no layout, so the offset is set and announced. */
function scrollPanel(panel: HTMLElement, top: number) {
	panel.scrollTop = top;
	fireEvent.scroll(panel);
}

describe("AccountTabs", () => {
	it("is a tablist: one tab selected and in the tab order, each tab naming its panel", () => {
		render(<Harness />);

		expect(screen.getByRole("tablist", { name: "Account sections" })).toBeTruthy();
		expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual([
			"Projects",
			"Plan",
			"API keys",
		]);
		expect(tab("Projects").getAttribute("aria-selected")).toBe("true");
		expect(tab("Plan").getAttribute("aria-selected")).toBe("false");
		expect(tab("Projects").tabIndex).toBe(0);
		expect(tab("Plan").tabIndex).toBe(-1);
		const panel = screen.getByRole("tabpanel");
		expect(panel.getAttribute("aria-labelledby")).toBe(tab("Projects").id);
		expect(tab("Projects").getAttribute("aria-controls")).toBe(panel.id);
	});

	it("moves between tabs with the arrow keys, Home and End, and wraps at the ends", () => {
		render(<Harness />);
		tab("Projects").focus();

		fireEvent.keyDown(tab("Projects"), { key: "ArrowRight" });
		expect(tab("Plan").getAttribute("aria-selected")).toBe("true");
		expect(document.activeElement).toBe(tab("Plan"));

		fireEvent.keyDown(tab("Plan"), { key: "End" });
		expect(document.activeElement).toBe(tab("API keys"));
		fireEvent.keyDown(tab("API keys"), { key: "ArrowRight" });
		expect(document.activeElement).toBe(tab("Projects"));
		fireEvent.keyDown(tab("Projects"), { key: "ArrowLeft" });
		expect(document.activeElement).toBe(tab("API keys"));
		fireEvent.keyDown(tab("API keys"), { key: "Home" });
		expect(document.activeElement).toBe(tab("Projects"));
		expect(tab("Projects").tabIndex).toBe(0);
		expect(tab("API keys").tabIndex).toBe(-1);
	});

	it("draws a panel the first time its tab is chosen and keeps it, hidden, after", () => {
		render(<Harness />);
		expect(screen.queryByText("Current plan")).toBeNull();

		fireEvent.click(tab("Plan"));
		expect(screen.getByText("Current plan")).toBeTruthy();
		fireEvent.click(tab("Projects"));

		// Still there, so whatever it held (a half-typed name, a question) is kept, but hidden.
		expect(panelOf("Plan").hidden).toBe(true);
		expect(panelOf("Projects").hidden).toBe(false);
		expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
	});

	it("gives each tab back the scroll it was left at", () => {
		render(<Harness />);
		fireEvent.click(tab("Plan"));
		scrollPanel(panelOf("Plan"), 140);
		fireEvent.click(tab("Projects"));
		scrollPanel(panelOf("Projects"), 30);

		fireEvent.click(tab("Plan"));
		expect(panelOf("Plan").scrollTop).toBe(140);
		fireEvent.click(tab("Projects"));
		expect(panelOf("Projects").scrollTop).toBe(30);
	});

	it("gives each tab back the control that had focus when it is pressed again", () => {
		render(<Harness />);
		fireEvent.click(tab("Plan"));
		screen.getByRole("button", { name: "Manage billing" }).focus();
		fireEvent.click(tab("Projects"));
		tab("Projects").focus();

		fireEvent.click(tab("Plan"));
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Manage billing" }));
	});

	it("keeps focus on the tab while the arrows walk, and Tab goes where the panel was left", () => {
		render(<Harness />);
		fireEvent.click(tab("Plan"));
		screen.getByRole("button", { name: "Manage billing" }).focus();
		tab("Plan").focus();
		fireEvent.keyDown(tab("Plan"), { key: "ArrowLeft" });
		fireEvent.keyDown(tab("Projects"), { key: "ArrowRight" });
		expect(document.activeElement).toBe(tab("Plan"));

		fireEvent.keyDown(tab("Plan"), { key: "Tab" });
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Manage billing" }));
	});

	it("does not raise a phone's keyboard for a field it gives focus back to", () => {
		vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)" }));
		render(<Harness />);
		fireEvent.click(tab("API keys"));
		screen.getByRole("textbox", { name: "Name" }).focus();
		fireEvent.click(tab("Projects"));
		tab("Projects").focus();

		fireEvent.click(tab("API keys"));
		expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Name" }));
	});
});
