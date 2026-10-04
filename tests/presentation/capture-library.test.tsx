import { CaptureLibrary } from "@/presentation/components/layout/capture-library";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("CaptureLibrary", () => {
	it("opens as a real bottom sheet and explains the local empty state", async () => {
		render(<CaptureLibrary />);
		fireEvent.click(screen.getByRole("button", { name: "Library" }));

		expect(await screen.findByRole("dialog", { name: "Capture library" })).toBeTruthy();
		expect(await screen.findByText("No captures yet")).toBeTruthy();
		expect(screen.getByText(/Exports stay on this device/)).toBeTruthy();
	});
});
