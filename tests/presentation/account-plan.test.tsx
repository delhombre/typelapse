// @vitest-environment jsdom
import { type AccountUsage, planAllowance } from "@/application/billing/plan-allowance";
import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import {
	AccountPlan,
	type StudioBillingControl,
} from "@/presentation/components/multimedia/account-plan";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

/** The account sheet's Plan tab, drawn on its own: the props are what the sheet passes. */
describe("AccountPlan", () => {
	it("shows the allowance sentence the server returned, even without a checkout", () => {
		const sentence = "You are using 1 of 3 cloud projects and 0 MB of 100 MB of media.";
		render(<AccountPlan allowance={sentence} />);

		expect(screen.getByText(sentence)).toBeTruthy();
	});

	describe("the plan meter (#255)", () => {
		const MB = 1024 * 1024;
		const AT = new Date("2026-10-13T09:00:00.000Z");

		function openWith(
			plan: Plan,
			used: Partial<AccountUsage>,
			billingOverrides: Partial<StudioBillingControl> = {},
		) {
			const detail = planAllowance(
				plan,
				{ cloudProjects: 0, mediaBytes: 0, hostedRenderMsThisMonth: 0, activeRenders: 0, ...used },
				AT,
			);
			render(
				<AccountPlan
					allowance={detail.sentence}
					allowanceDetail={detail}
					billing={{
						planLabel: plan.label,
						paid: plan.isPro,
						available: true,
						catalog: {
							creator: { monthly: { currency: "EUR", unitAmount: 1200 } },
						},
						cadence: "monthly",
						busy: false,
						error: null,
						onCadence: vi.fn(),
						onUpgrade: vi.fn(),
						onManageBilling: vi.fn(),
						...billingOverrides,
					}}
				/>,
			);
			return detail;
		}

		const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".mm-meter-row"));

		it("draws a bar and a count per quota, and Hosted renders as a fact on Free", () => {
			openWith(Plan.free(), { cloudProjects: 1, mediaBytes: 12 * MB });

			expect(rows().map((row) => row.textContent)).toEqual([
				"Cloud projects1 of 3",
				"Media12 MB of 100 MB",
				"Hosted renders0 on Free",
			]);
			expect(rows().filter((row) => row.querySelector(".mm-meter-fill"))).toHaveLength(2);
			expect(rows().some((row) => row.hasAttribute("data-warn"))).toBe(false);
		});

		it("keeps the server's sentence as text for a screen reader, and hides the drawn rows", () => {
			const detail = openWith(Plan.free(), { cloudProjects: 1 });

			const sentence = document.querySelector(".mm-meter .sr-only");
			expect(sentence?.textContent).toBe(detail.sentence);
			expect(document.querySelector(".mm-meter-list")?.getAttribute("aria-hidden")).toBe("true");
		});

		it("tells a screen reader the Hosted renders fact and the reset date the sentence leaves out", () => {
			openWith(Plan.free(), { cloudProjects: 1 });
			const free = Array.from(document.querySelectorAll(".mm-meter .sr-only")).map(
				(node) => node.textContent,
			);
			expect(free).toContain("Hosted renders: 0 on Free.");

			cleanup();
			openWith(Plan.pro(), { hostedRenderMsThisMonth: 12 * 60_000 });
			const creator = Array.from(document.querySelectorAll(".mm-meter .sr-only")).map(
				(node) => node.textContent,
			);
			expect(creator).toContain("Hosted render minutes resets Nov 1.");
		});

		it("shows the render minutes and their reset date on Creator", () => {
			openWith(Plan.pro(), { hostedRenderMsThisMonth: 12 * 60_000 });

			expect(rows().map((row) => row.textContent)).toContain(
				"Hosted render minutes12 of 60resets Nov 1",
			);
		});

		it("puts the upgrade under the meter until a quota is near its ceiling, then above it", () => {
			openWith(Plan.free(), { cloudProjects: 1 });
			const upgrade = screen.getByRole("button", { name: "Upgrade to Creator" });
			const meter = document.querySelector(".mm-meter") as HTMLElement;
			expect(
				meter.compareDocumentPosition(upgrade) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();

			cleanup();
			openWith(Plan.free(), { cloudProjects: 3 });
			const nearUpgrade = screen.getByRole("button", { name: "Upgrade to Creator" });
			const nearMeter = document.querySelector(".mm-meter") as HTMLElement;
			expect(
				nearMeter.compareDocumentPosition(nearUpgrade) & Node.DOCUMENT_POSITION_PRECEDING,
			).toBeTruthy();
			expect(rows()[0]?.hasAttribute("data-warn")).toBe(true);
			expect(document.querySelector(".mm-meter .sr-only:last-child")?.textContent).toBe(
				"Close to the limit: cloud projects.",
			);
		});

		it("falls back to the sentence alone when the server sent no numbers", () => {
			render(<AccountPlan allowance="You are using 1 of 3 cloud projects." />);

			expect(document.querySelector(".mm-meter")).toBeNull();
			expect(screen.getByText("You are using 1 of 3 cloud projects.")).toBeTruthy();
		});
	});

	it("offers provider-backed monthly and annual Creator checkout inside the account island", () => {
		const catalog: BillingCatalog = {
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		};
		const onCadence = vi.fn<(cadence: BillingCadence) => void>();
		const onUpgrade = vi.fn<() => void>();
		render(
			<AccountPlan
				billing={{
					planLabel: "Free",
					paid: false,
					available: true,
					catalog,
					cadence: "monthly",
					busy: false,
					error: null,
					onCadence,
					onUpgrade,
					onManageBilling: vi.fn(),
				}}
			/>,
		);

		expect(screen.getByText("€12 / month")).toBeTruthy();
		expect(screen.getByText("€120 / year")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Annual billing" }));
		expect(onCadence).toHaveBeenCalledWith("annual");
		fireEvent.click(screen.getByRole("button", { name: "Upgrade to Creator" }));
		expect(onUpgrade).toHaveBeenCalledOnce();
	});

	it("opens the billing portal for an authenticated Creator instead of selling twice", () => {
		const onManageBilling = vi.fn();
		render(
			<AccountPlan
				billing={{
					planLabel: "Creator",
					paid: true,
					available: true,
					catalog: null,
					cadence: "monthly",
					busy: false,
					error: null,
					onCadence: vi.fn(),
					onUpgrade: vi.fn(),
					onManageBilling,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		expect(onManageBilling).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
	});

	describe("billing that is not in order", () => {
		const catalog: BillingCatalog = {
			creator: {
				monthly: { currency: "USD", unitAmount: 1200 },
				annual: { currency: "USD", unitAmount: 9900 },
			},
		};
		const billing = (notice: BillingNotice, handlers: { onManageBilling?: () => void } = {}) => ({
			planLabel: "Free",
			paid: false,
			available: true,
			catalog,
			cadence: "monthly" as const,
			busy: false,
			error: null,
			notice,
			onCadence: vi.fn(),
			onUpgrade: vi.fn(),
			onManageBilling: handlers.onManageBilling ?? vi.fn(),
		});

		it("tells a past due account why Creator is paused and offers the portal, not a second checkout", () => {
			const onManageBilling = vi.fn();
			const sentence =
				"Your last payment failed and Creator is paused; update your card in Manage billing.";
			render(
				<AccountPlan billing={billing({ kind: "past-due", sentence }, { onManageBilling })} />,
			);

			expect(screen.getByRole("status").textContent).toBe(sentence);
			expect(screen.queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
			fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
			expect(onManageBilling).toHaveBeenCalledOnce();
		});

		it("tells an account whose plan ended how long its renders stay, and still sells Creator", () => {
			const sentence =
				"Your Creator plan has ended; past renders stay downloadable until 5 November 2026.";
			render(<AccountPlan billing={billing({ kind: "ended", sentence })} />);

			expect(screen.getByRole("status").textContent).toBe(sentence);
			expect(screen.getByRole("button", { name: "Upgrade to Creator" })).toBeTruthy();
			expect(screen.queryByRole("button", { name: "Manage billing" })).toBeNull();
		});

		it("shows no status when billing is in order", () => {
			render(
				<AccountPlan billing={{ ...billing({ kind: "ended", sentence: "x" }), notice: null }} />,
			);

			expect(screen.queryByRole("status")).toBeNull();
		});
	});

	describe("test mode", () => {
		const prices = {
			monthly: { currency: "USD", unitAmount: 1200 },
			annual: { currency: "USD", unitAmount: 9900 },
		};
		const billing = (input: { catalog: BillingCatalog | null; paid?: boolean }) => ({
			planLabel: input.paid ? "Creator" : "Free",
			paid: input.paid ?? false,
			available: true,
			catalog: input.catalog,
			cadence: "monthly" as const,
			busy: false,
			error: null,
			onCadence: vi.fn(),
			onUpgrade: vi.fn(),
			onManageBilling: vi.fn(),
		});
		const open = (control: ReturnType<typeof billing>) => {
			render(<AccountPlan billing={control} />);
		};

		it("says nothing is charged when the server points at the sandbox, on a free plan card", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices } }));

			expect(screen.getByText("Test mode: no real charges")).toBeTruthy();
		});

		it("says it on a Creator card too, since the portal is the sandbox's as well", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices }, paid: true }));

			expect(screen.getByText("Test mode: no real charges")).toBeTruthy();
		});

		it("is a line, not a control: nothing in it can be pressed or dismissed", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices } }));

			const line = screen.getByText("Test mode: no real charges");
			expect(within(line).queryByRole("button")).toBeNull();
			expect(line.closest("button")).toBeNull();
			expect(screen.queryByRole("button", { name: /dismiss|close test mode/i })).toBeNull();
			// Not a live region either: it is always there, and the plan's own status stays alone.
			expect(screen.queryByRole("status")).toBeNull();
		});

		it("never draws on a production catalog, an older server, or no catalog", () => {
			for (const catalog of [
				{ environment: "production", creator: prices } satisfies BillingCatalog,
				{ creator: prices } satisfies BillingCatalog,
				null,
			]) {
				cleanup();
				open(billing({ catalog }));
				expect(screen.queryByText(/test mode/i)).toBeNull();
			}
		});
	});

	describe("the way out to the public pages", () => {
		const open = (billing: ComponentProps<typeof AccountPlan>["billing"]) => {
			render(<AccountPlan billing={billing} />);
		};

		it("offers the plans beside About Typelapse where billing is not available", () => {
			open(undefined);

			expect(screen.getByRole("link", { name: "About Typelapse" }).getAttribute("href")).toBe("/");
			expect(screen.getByRole("link", { name: "Plans and pricing" }).getAttribute("href")).toBe(
				"/pricing",
			);
		});

		it("offers the plans where billing is available, and then About is not needed", () => {
			open({
				planLabel: "Free",
				paid: false,
				available: true,
				catalog: null,
				cadence: "monthly",
				busy: false,
				error: null,
				onCadence: vi.fn(),
				onUpgrade: vi.fn(),
				onManageBilling: vi.fn(),
			});

			expect(screen.getByRole("link", { name: "Plans and pricing" }).getAttribute("href")).toBe(
				"/pricing",
			);
			expect(screen.queryByRole("link", { name: "About Typelapse" })).toBeNull();
		});
	});
});
