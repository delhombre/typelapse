import { ClusterPanel } from "@/presentation/components/controls/cluster-panels";
import { useExportStore } from "@/presentation/stores/export.store";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "This device" greyed out said why only in a tooltip, which a phone never
 * shows and a screen reader does not reach on a disabled button.
 */

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
});

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => false),
}));

const WHY = "This browser cannot encode this format at this size.";

describe("an export this device cannot make", () => {
	beforeEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
	});
	afterEach(() => cleanup());

	it("says why on the panel, in a sentence beside the greyed option", () => {
		useExportStore.setState({ deviceSupported: false });
		render(<ClusterPanel cluster="export" />);

		const device = screen.getByRole("button", { name: "This device" }) as HTMLButtonElement;
		expect(device.disabled).toBe(true);
		expect(screen.getByText(WHY)).toBeTruthy();
	});

	it("says nothing while the device can render", () => {
		useExportStore.setState({ deviceSupported: true });
		render(<ClusterPanel cluster="export" />);

		expect(screen.queryByText(WHY)).toBeNull();
	});
});
