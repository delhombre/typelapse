import {
	PLATFORM_LABELS,
	SOCIAL_PLATFORMS,
	occludedRegions,
} from "@/application/social/safe-zones";
import { SocialPreviewOverlay } from "@/presentation/components/preview/social-preview-overlay";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	// jsdom ships no matchMedia; motion's useReducedMotion needs it.
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("SocialPreviewOverlay", () => {
	it.each(SOCIAL_PLATFORMS)("renders %s chrome tagged with its platform name", (platform) => {
		render(<SocialPreviewOverlay platform={platform} showGuides={false} radius={16} />);
		expect(screen.getByText(PLATFORM_LABELS[platform])).toBeTruthy();
	});

	it("labels every occluded region when guides are on", () => {
		render(<SocialPreviewOverlay platform="reels" showGuides radius={16} />);
		for (const region of occludedRegions("reels")) {
			expect(screen.getByText(region.label)).toBeTruthy();
		}
	});

	it("drops the guide labels when guides are off", () => {
		render(<SocialPreviewOverlay platform="reels" showGuides={false} radius={16} />);
		// A guide-only label: the chrome furniture carries no such text.
		expect(screen.queryByText("caption & audio")).toBeNull();
	});
});
