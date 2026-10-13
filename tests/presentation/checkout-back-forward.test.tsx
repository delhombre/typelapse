import { BillingReturnBoot } from "@/presentation/components/layout/billing-return-boot";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** jsdom has no PageTransitionEvent: a pageshow with the `persisted` flag set by hand. */
function pageshow(persisted: boolean): Event {
	const event = new Event("pageshow");
	Object.defineProperty(event, "persisted", { value: persisted });
	return event;
}

/**
 * Back from Polar's checkout, Safari and Chrome restore the studio from the
 * back-forward cache with its state intact: Upgrade would say "Opening secure
 * checkout…" for good. The boot that mounts billing frees it on that pageshow.
 */
describe("Back from checkout through the back-forward cache", () => {
	beforeEach(() => {
		usePlanStore.setState({ isUpgrading: true, error: null });
	});

	afterEach(() => {
		cleanup();
		usePlanStore.setState({ isUpgrading: false });
	});

	it("frees the upgrade button when the page is restored from the cache", () => {
		render(<BillingReturnBoot />);

		window.dispatchEvent(pageshow(true));

		expect(usePlanStore.getState().isUpgrading).toBe(false);
		expect(usePlanStore.getState().error).toBeNull();
	});

	it("leaves a fresh load alone: its state is new anyway", () => {
		render(<BillingReturnBoot />);

		window.dispatchEvent(pageshow(false));

		expect(usePlanStore.getState().isUpgrading).toBe(true);
	});

	it("stops listening once the studio is gone", () => {
		const { unmount } = render(<BillingReturnBoot />);
		unmount();

		window.dispatchEvent(pageshow(true));

		expect(usePlanStore.getState().isUpgrading).toBe(true);
	});
});
