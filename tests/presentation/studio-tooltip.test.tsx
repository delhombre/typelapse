import { StudioTooltip, StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("StudioTooltip", () => {
	it("reveals concise help to pointer and keyboard users without a native title", async () => {
		render(
			<StudioTooltipProvider>
				<StudioTooltip content="Sound & haptics · On" side="bottom">
					<button type="button" aria-label="Mute interface feedback">
						Sound
					</button>
				</StudioTooltip>
			</StudioTooltipProvider>,
		);

		const trigger = screen.getByRole("button", { name: "Mute interface feedback" });
		expect(trigger.getAttribute("title")).toBeNull();
		fireEvent.focus(trigger);

		await waitFor(() => {
			expect(screen.getByRole("tooltip", { name: "Sound & haptics · On" })).toBeTruthy();
		});
		expect(trigger.getAttribute("data-state")).toBe("instant-open");
	});
});
