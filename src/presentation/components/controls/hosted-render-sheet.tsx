import { hostedOutputGraceDays } from "@/application/billing/plan-allowance";
import { priceLabel } from "@/application/billing/price-label";
import type { BillingCatalog } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { TestModeLine } from "@/presentation/components/billing/test-mode-line";
import { AuthForm } from "@/presentation/components/multimedia/auth-form";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { feedback } from "@/presentation/haptics";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useExportStore } from "@/presentation/stores/export.store";
import {
	type CloudSurface,
	useHostedRenderSheetStore,
} from "@/presentation/stores/hosted-render-sheet.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "reicon-react";
import { useCloudGate } from "./cloud-render";
import "./hosted-render-sheet.css";

/**
 * What a hosted render adds over this device, and nothing the plan rules do not
 * say (viability D2, D4): the third line is Creator's own entitlement, read from
 * the Plan value object, since a free account already has private storage.
 */
export const HOSTED_RENDER_ADDS = [
	"Captions and audio baked into the video.",
	"Rendered on our servers, not on your device.",
	`Renders stay downloadable while you are on Creator, and ${hostedOutputGraceDays(Plan.free())} days after.`,
] as const;

/** Creator's prices as the public catalog states them; null when it states none. */
export function creatorPriceLine(catalog: BillingCatalog | null): string | null {
	const monthly = catalog?.creator.monthly;
	const annual = catalog?.creator.annual;
	const prices = [
		annual ? priceLabel(annual, "annual") : null,
		monthly ? priceLabel(monthly, "monthly") : null,
	].filter((price): price is string => price !== null);
	return prices.length === 0 ? null : `Creator is ${prices.join(", or ")}.`;
}

type SheetView = "offer" | "code" | "pending" | "upgrade";

const SUBTITLES: Record<SheetView, string> = {
	offer: "This device keeps rendering for free. A hosted render adds:",
	code: "Sign in with a code we email you.",
	pending: "This device keeps rendering for free. A hosted render adds:",
	upgrade: "This device keeps rendering for free. A hosted render adds:",
};

/**
 * The paid side, said at the press (ux-waves D3, Dub's upgrade-required toast
 * without its exclamation). Cloud under Where opens it for a visitor whose plan
 * does not render there yet, and so does the captions caveat's link:
 *
 * - signed out: what a hosted render adds and Creator's price, then Sign in,
 *   which swaps the body for the account's own code form, without its pitch;
 * - signed in, plan not read yet: the same lines and "Checking your plan…", so a
 *   Creator is never offered Creator while the server answers;
 * - Free: the same lines, the server's allowance sentence, and one Upgrade to
 *   Creator, the account panel's checkout;
 * - Creator: never opens; if the plan arrives while it is open, it chooses Cloud
 *   and closes, because there is nothing left to explain.
 *
 * A native modal dialog (the studio's bottom sheet: focus held inside, Escape
 * closes), a centred panel on a desktop and a sheet on a phone. It is portaled to
 * the body, out of the island's dark plate, and marked as the island's companion
 * so a press inside it does not close the export panel it came from.
 */
export function HostedRenderSheet({ surface }: { surface: CloudSurface }) {
	const open = useHostedRenderSheetStore((state) => state.openFor === surface);
	const close = useHostedRenderSheetStore((state) => state.close);
	const gate = useCloudGate();
	const setTarget = useExportStore((state) => state.setTarget);
	const titleId = useId();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	// Beside the surface's own controls in the page, so focus can find its Cloud.
	const anchorRef = useRef<HTMLSpanElement>(null);
	const [signingIn, setSigningIn] = useState(false);

	// The words stay on screen while the sheet slides out.
	const live: SheetView | null = viewOf(gate, signingIn);
	const shown = useRef<SheetView>(live ?? "offer");
	if (open && live) {
		shown.current = live;
	}
	const view = shown.current;

	// Nothing left to gate: the account it waited for renders on Cloud, or the
	// build lost its accounts. Cloud is chosen in the first case, never in the second.
	useEffect(() => {
		if (!open) return;
		if (gate === "open") {
			setTarget("cloud");
			feedback("commit");
			close();
		} else if (gate === "absent") {
			close();
		}
	}, [open, gate, setTarget, close]);

	// The body changed under the focus: Sign in gave way to the form (whose address
	// takes the focus only under a cursor: a finger's keyboard is not raised for a
	// field nobody tapped), or the form gave way to the upgrade. Whatever is left
	// without focus, the heading takes it, so a person is still in the sheet, at its
	// top. This runs after the form's own effects, so a focused address stays focused.
	const previous = useRef(view);
	useEffect(() => {
		const changed = previous.current !== view;
		previous.current = view;
		if (!open || !changed) return;
		const active = document.activeElement;
		if (!panelRef.current?.contains(active) || active === panelRef.current) {
			headingRef.current?.focus();
		}
	}, [open, view]);

	const onClosed = () => {
		setSigningIn(false);
		// Back to what opened it; a caveat link that chose Cloud is gone with its
		// caveat, so this surface's Cloud under Where takes the focus instead.
		const { opener } = useHostedRenderSheetStore.getState();
		const back =
			opener?.isConnected && !opener.closest("[inert]") ? opener : focusFallback(anchorRef.current);
		back?.focus({ preventScroll: true });
	};

	// The island closes its panel on a document Escape: this one is the sheet's.
	const keepEscape = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.stopPropagation();
		}
	};

	if (typeof document === "undefined") return null;

	return (
		<>
			<span ref={anchorRef} hidden />
			{createPortal(
				<div className="studio-root sc-tokens" data-island-companion="" onKeyDown={keepEscape}>
					<StudioBottomSheet
						open={open}
						onClose={close}
						onClosed={onClosed}
						labelledBy={titleId}
						className="hosted-render-sheet"
					>
						<header className="studio-sheet-header">
							<div>
								<h2 id={titleId} ref={headingRef} tabIndex={-1}>
									Render on Typelapse Cloud
								</h2>
								<p>{SUBTITLES[view]}</p>
							</div>
							<button type="button" onClick={close} aria-label="Close">
								<X size={14} strokeWidth={1.7} aria-hidden="true" />
							</button>
						</header>
						<div ref={panelRef} className="hosted-render-body">
							{view === "code" ? <SignInStep /> : <SheetBody view={view} onSignIn={setSigningIn} />}
						</div>
					</StudioBottomSheet>
				</div>,
				document.body,
			)}
		</>
	);
}

function viewOf(gate: ReturnType<typeof useCloudGate>, signingIn: boolean): SheetView | null {
	switch (gate) {
		case "sign-in":
			return signingIn ? "code" : "offer";
		case "pending":
			return "pending";
		case "upgrade":
			return "upgrade";
		default:
			return null;
	}
}

/**
 * Where focus goes when the control that opened the sheet is gone: this surface's
 * Cloud under Where, or, on the stage (no Where group beside it), the island's
 * Export trigger, which is where the person's next step is.
 */
function focusFallback(anchor: HTMLElement | null): HTMLElement | null {
	return (
		cloudChipNear(anchor) ??
		document.querySelector<HTMLElement>('[data-island-opener="export"]') ??
		document.querySelector<HTMLElement>(".sc-loupe-target")
	);
}

/** The Where group's Cloud on the surface the sheet belongs to. */
function cloudChipNear(anchor: HTMLElement | null): HTMLButtonElement | null {
	const group = anchor?.parentElement?.querySelector('[role="group"][aria-label="Where"]');
	const chips = group ? Array.from(group.querySelectorAll<HTMLButtonElement>("button")) : [];
	return chips.find((chip) => chip.textContent?.trim() === "Cloud") ?? null;
}

function SheetBody({
	view,
	onSignIn,
}: {
	view: Exclude<SheetView, "code">;
	onSignIn: (signingIn: boolean) => void;
}) {
	const catalog = usePlanStore((state) => state.catalog);
	const price = creatorPriceLine(catalog);
	return (
		<>
			<ul className="hosted-render-adds">
				{HOSTED_RENDER_ADDS.map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
			{price ? <p className="hosted-render-price">{price}</p> : null}
			{/* Beside the price, before any action: test money never looks like real money. */}
			<TestModeLine environment={catalog?.environment} />
			{view === "upgrade" ? <UpgradeStep /> : null}
			{view === "pending" ? (
				<p className="hosted-render-note" aria-busy="true">
					Checking your plan…
				</p>
			) : null}
			{view === "offer" ? <OfferSignIn onSignIn={() => onSignIn(true)} /> : null}
		</>
	);
}

function OfferSignIn({ onSignIn }: { onSignIn: () => void }) {
	const checking = useAuthStore((state) => state.status.kind === "checking");
	return (
		<>
			<p className="hosted-render-note">Hosted renders come with Creator. Sign in to start.</p>
			<button
				type="button"
				className="hosted-render-action"
				aria-disabled={checking || undefined}
				onClick={() => {
					if (checking) return;
					feedback("commit");
					onSignIn();
				}}
			>
				{checking ? "Checking account…" : "Sign in"}
			</button>
		</>
	);
}

/** The account panel's code form, the same store and the same steps, without its pitch. */
function SignInStep() {
	const operation = useAuthStore((state) => state.operation);
	const error = useAuthStore((state) => state.error);
	const pendingCode = useAuthStore((state) => state.pendingCode);
	const sendCode = useAuthStore((state) => state.sendCode);
	const signInWithCode = useAuthStore((state) => state.signInWithCode);
	const forgetCode = useAuthStore((state) => state.forgetCode);
	return (
		<div className="hosted-render-sign-in">
			<AuthForm
				embedded
				checkScope=".hosted-render-sheet"
				operation={operation}
				error={error}
				pendingCode={pendingCode}
				onSendCode={sendCode}
				onSignInWithCode={signInWithCode}
				onForgetCode={forgetCode}
			/>
		</div>
	);
}

function UpgradeStep() {
	const allowance = usePlanStore((state) => state.allowance);
	const billingAvailable = usePlanStore((state) => state.billingAvailable);
	const busy = usePlanStore((state) => state.isUpgrading);
	const error = usePlanStore((state) => state.error);
	const upgrade = usePlanStore((state) => state.upgrade);
	return (
		<>
			{allowance ? <p className="hosted-render-note">{allowance}</p> : null}
			{error ? (
				<p className="hosted-render-error" role="alert">
					{error}
				</p>
			) : null}
			{billingAvailable ? (
				<button
					type="button"
					className="hosted-render-action"
					// Busy, it stays focusable (a disabled button drops a keyboard user's focus)
					// and says what it is doing; a second press starts nothing.
					aria-disabled={busy || undefined}
					aria-busy={busy || undefined}
					onClick={() => {
						if (busy) return;
						feedback("commit");
						void upgrade();
					}}
				>
					{busy ? "Opening secure checkout…" : "Upgrade to Creator"}
				</button>
			) : null}
		</>
	);
}
