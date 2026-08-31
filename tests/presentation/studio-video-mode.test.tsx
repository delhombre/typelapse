import {
	StudioVideoModeProvider,
	useStudioVideoMode,
} from "@/presentation/contexts/studio-video-mode";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

function ModeProbe() {
	return <span>{useStudioVideoMode() ? "video" : "code"}</span>;
}

describe("studio video mode context", () => {
	it("leaves previews in their existing code presentation by default", () => {
		expect(renderToStaticMarkup(<ModeProbe />)).toContain("code");
	});

	it("lets the desktop shell ask the preview for an export-aspect canvas", () => {
		expect(
			renderToStaticMarkup(
				<StudioVideoModeProvider active>
					<ModeProbe />
				</StudioVideoModeProvider>,
			),
		).toContain("video");
	});
});
