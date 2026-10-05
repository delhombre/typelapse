import { TemplateGallery } from "@/presentation/components/layout/template-gallery";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/presentation/components/preview/looping-frames", () => ({
	LoopingFrames: ({ frames, playing }: { frames: string[]; playing?: boolean }) => (
		<div className="test-looping-frames" data-playing={playing ? "true" : "false"}>
			{frames[0]}
		</div>
	),
}));

afterEach(cleanup);

describe("TemplateGallery previews", () => {
	it("paints a real static poster immediately and mounts only the explored animation", async () => {
		render(<TemplateGallery />);
		fireEvent.click(screen.getByRole("button", { name: "Showcase" }));

		const card = await screen.findByRole("button", { name: /Extract a custom hook/ });
		const preview = within(card).getByRole("img", {
			name: /Real Typelapse preview of Extract a custom hook/,
		});

		expect(preview.textContent).toContain("export function Profile");
		expect(card.querySelector(".test-looping-frames")).toBeNull();
		expect(document.querySelector(".showcase-preview-status")).toBeNull();
		expect(document.querySelector(".showcase-progress")).toBeNull();

		fireEvent.pointerEnter(card);
		expect(card.querySelector(".test-looping-frames")?.getAttribute("data-playing")).toBe("true");
		expect(document.querySelectorAll(".test-looping-frames")).toHaveLength(1);

		fireEvent.pointerLeave(card);
		expect(card.querySelector(".test-looping-frames")).toBeNull();
		expect(document.querySelectorAll(".test-looping-frames")).toHaveLength(0);
	});

	it("uses a media-first gallery built from six real project renders", async () => {
		render(<TemplateGallery />);
		fireEvent.click(screen.getByRole("button", { name: "Showcase" }));

		const cards = await screen.findAllByRole("button", { name: /Open Showcase project/ });
		expect(cards).toHaveLength(6);

		const renders = screen.getAllByRole("img", { name: /Real Typelapse preview/ });
		expect(renders).toHaveLength(6);
	});

	it("draws its trigger's glyph at the header's 14px", () => {
		render(<TemplateGallery />);
		const glyph = screen.getByRole("button", { name: "Showcase" }).querySelector("svg");
		expect(glyph?.getAttribute("width")).toBe("14");
		expect(glyph?.getAttribute("height")).toBe("14");
	});
});
