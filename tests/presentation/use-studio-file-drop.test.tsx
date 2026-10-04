import { useStudioFileDrop } from "@/presentation/hooks/use-studio-file-drop";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const imports = vi.hoisted(() => ({ importStudioMediaFiles: vi.fn() }));
vi.mock("@/presentation/utils/studio-media-import", () => imports);

function Probe() {
	const dragging = useStudioFileDrop();
	return <output>{dragging ? "dragging" : "idle"}</output>;
}

function dragEvent(type: string, types: readonly string[], files: readonly File[] = []) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: { types, files, dropEffect: "none" },
	});
	return event;
}

describe("useStudioFileDrop", () => {
	afterEach(() => {
		cleanup();
		imports.importStudioMediaFiles.mockReset();
	});

	it("keeps a dropped file in the studio and imports it instead of navigating to it", async () => {
		imports.importStudioMediaFiles.mockResolvedValue(1);
		render(<Probe />);
		const still = new File(["png"], "still.png", { type: "image/png" });

		const over = dragEvent("dragover", ["Files"]);
		act(() => {
			window.dispatchEvent(over);
		});
		expect(over.defaultPrevented).toBe(true);
		expect(screen.getByRole("status").textContent).toBe("dragging");

		const drop = dragEvent("drop", ["Files"], [still]);
		await act(async () => {
			window.dispatchEvent(drop);
		});

		expect(drop.defaultPrevented).toBe(true);
		expect(imports.importStudioMediaFiles).toHaveBeenCalledWith([still]);
		expect(screen.getByRole("status").textContent).toBe("idle");
	});

	it("leaves drags of text and timeline rows alone", () => {
		render(<Probe />);
		const over = dragEvent("dragover", ["text/plain"]);
		const drop = dragEvent("drop", ["text/plain"]);

		act(() => {
			window.dispatchEvent(over);
			window.dispatchEvent(drop);
		});

		expect(over.defaultPrevented).toBe(false);
		expect(drop.defaultPrevented).toBe(false);
		expect(imports.importStudioMediaFiles).not.toHaveBeenCalled();
	});
});
