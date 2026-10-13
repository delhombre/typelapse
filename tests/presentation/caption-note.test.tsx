import { Plan } from "@/domain/value-objects/plan";
import { CaptionNote } from "@/presentation/components/preview/caption-note";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import { useHostedRenderSheetStore } from "@/presentation/stores/hosted-render-sheet.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #271: the line under the frame where Where does not bake captions. Its link is
 * the export caveat's own component, so a press answers as the caveat does.
 */

const SESSION = {
	account: { id: "usr_1", name: "Ada", email: "ada@example.com" },
	expiresAt: new Date(Date.now() + 60_000),
};

const LINK = { name: "Keep them with Cloud" };

beforeEach(() => {
	useExportStore.setState(useExportStore.getInitialState(), true);
	useHostedRenderSheetStore.setState({ openFor: null, opener: null });
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ error: "Not found" }, { status: 404 })),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

function note() {
	return render(<CaptionNote text="Why this line" opacity={1} playing={false} />);
}

describe("the caption note under the frame", () => {
	it("tags the caption Cloud only and links to Cloud on a hosted build", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useAuthStore.setState({ status: { kind: "anonymous" } });
		note();

		expect(screen.getByText("Cloud only")).toBeTruthy();
		expect(screen.getByText("Why this line")).toBeTruthy();
		expect(screen.getByRole("button", LINK)).toBeTruthy();
	});

	it("opens the sheet that explains Cloud for a visitor whose plan does not render there", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useAuthStore.setState({ status: { kind: "anonymous" } });
		note();

		fireEvent.click(screen.getByRole("button", LINK));

		expect(useHostedRenderSheetStore.getState().openFor).toBe("stage");
		expect(useExportStore.getState().target).toBe("device");
	});

	it("chooses Cloud outright for a plan that renders there", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "hosted");
		useAuthStore.setState({ status: { kind: "authenticated", session: SESSION } });
		usePlanStore.setState({ plan: Plan.pro(), accountPlanKnown: true });
		note();

		fireEvent.click(screen.getByRole("button", LINK));

		expect(useExportStore.getState().target).toBe("cloud");
	});

	it("says Server only without a link where there is no Cloud to name", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		note();

		expect(screen.getByText("Server only")).toBeTruthy();
		expect(screen.queryByRole("button", LINK)).toBeNull();
	});

	it("shows no line for a step with no caption: it is inert and hidden from readers, even while playing", () => {
		vi.stubEnv("VITE_TYPELAPSE_DEPLOYMENT_MODE", "local");
		const { container, rerender } = render(<CaptionNote text="" opacity={0} playing={false} />);
		const line = () => container.querySelector("[data-testid=caption-note]");
		expect(line()?.hasAttribute("inert")).toBe(true);
		expect(line()?.getAttribute("aria-hidden")).toBe("true");
		expect(
			Number(
				line()
					?.getAttribute("style")
					?.match(/opacity: ([\d.]+)/)?.[1] ?? 0,
			),
		).toBe(0);

		rerender(<CaptionNote text="" opacity={0} playing />);
		expect(line()?.hasAttribute("inert")).toBe(true);
	});
});
