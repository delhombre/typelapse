import { BillingReturnBoot } from "@/presentation/components/layout/billing-return-boot";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { takeBillingReturn } from "@/presentation/utils/billing-return";
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function land(search: string, hash = "") {
	window.history.replaceState(null, "", `/app${search}${hash}`);
}

describe("the billing return address", () => {
	beforeEach(() => land(""));

	it("reads a finished checkout", () => {
		land("?billing=success");
		expect(takeBillingReturn()).toBe("success");
	});

	it("reads a checkout that was left", () => {
		land("?billing=cancelled");
		expect(takeBillingReturn()).toBe("cancelled");
	});

	it("reads nothing from an unknown value or no value", () => {
		land("?billing=maybe");
		expect(takeBillingReturn()).toBeNull();
		land("");
		expect(takeBillingReturn()).toBeNull();
	});

	it("drops the parameter, and only that one, in the same breath", () => {
		land("?ref=hn&billing=success&x=1", "#share=abc");
		expect(takeBillingReturn()).toBe("success");
		expect(window.location.search).toBe("?ref=hn&x=1");
		expect(window.location.hash).toBe("#share=abc");
		expect(window.location.pathname).toBe("/app");
	});

	it("scrubs an unknown value too, so it is not read on the next mount", () => {
		land("?billing=maybe");
		takeBillingReturn();
		expect(window.location.search).toBe("");
	});

	it("is read once: a second look finds nothing", () => {
		land("?billing=cancelled");
		takeBillingReturn();
		expect(takeBillingReturn()).toBeNull();
	});
});

describe("the notice a billing return raises", () => {
	const refresh = vi.fn(async () => undefined);

	beforeEach(() => {
		land("");
		useNoticeStore.setState({ notices: [] });
		refresh.mockClear();
		usePlanStore.setState({ refresh });
	});
	afterEach(() => cleanup());

	const messages = () => useNoticeStore.getState().notices.map((notice) => notice.message);

	it("says Creator is on and asks the plan again after a payment", () => {
		land("?billing=success");
		render(<BillingReturnBoot />);
		expect(messages()).toEqual(["Creator is on."]);
		expect(refresh).toHaveBeenCalledWith({ signedIn: true });
		expect(window.location.search).toBe("");
	});

	it("says nothing was charged after a cancelled checkout, without asking the plan", () => {
		land("?billing=cancelled");
		render(<BillingReturnBoot />);
		expect(messages()).toEqual(["Checkout cancelled, nothing was charged."]);
		expect(useNoticeStore.getState().notices[0]?.tone).toBe("info");
		expect(refresh).not.toHaveBeenCalled();
	});

	it("announces once under StrictMode's double mount", () => {
		land("?billing=success");
		render(
			<StrictMode>
				<BillingReturnBoot />
			</StrictMode>,
		);
		expect(messages()).toEqual(["Creator is on."]);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("stays silent on an ordinary visit", () => {
		render(<BillingReturnBoot />);
		expect(messages()).toEqual([]);
		expect(refresh).not.toHaveBeenCalled();
	});
});
