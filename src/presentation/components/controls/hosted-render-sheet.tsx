import { AuthForm } from "@/presentation/components/multimedia/studio-account-control";
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

/** What a hosted render adds over this device, and nothing it cannot prove (viability D2). */
export const HOSTED_RENDER_ADDS = [
	"Captions and audio baked into the video.",
	"Rendered on our servers, not on your laptop.",
	"Kept in your private cloud storage.",
] as const;

/**
 * The paid side, said at the press (ux-waves D3, Dub's upgrade-required toast
 * without its exclamation). Cloud under Where opens it for a visitor whose plan
 * does not render there yet, and so does the captions caveat's link:
 *
 * - signed out: what a hosted render adds, then Sign in, which swaps the body for
 *   the account's own code form, the same one the account panel shows;
 * - Free: the same three lines, the server's allowance sentence, and one
 *   Upgrade to Creator, the account panel's checkout;
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
	const [signingIn, setSigningIn] = useState(false);

	// The words stay on screen while the sheet slides out.
	const live = gate === "sign-in" && signingIn ? "code" : gate;
	const shown = useRef(live);
	if (open) {
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

	// The body changed under the focus (the code form gave way to the upgrade):
	// the heading takes it, so a keyboard user is still in the sheet, at its top.
	const previous = useRef(view);
	useEffect(() => {
		if (open && previous.current === "code" && view === "upgrade") {
			headingRef.current?.focus();
		}
		previous.current = view;
	}, [open, view]);

	const onClosed = () => {
		setSigningIn(false);
		// Back to what opened it; a caveat link that chose Cloud is gone with its
		// caveat, so Cloud under Where takes the focus instead.
		const { opener } = useHostedRenderSheetStore.getState();
		const back = opener?.isConnected ? opener : cloudChip();
		back?.focus({ preventScroll: true });
	};

	// The island closes its panel on a document Escape: this one is the sheet's.
	const keepEscape = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.stopPropagation();
		}
	};

	if (typeof document === "undefined") return null;

	return createPortal(
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
						{/* On the code step the account's form brings its own heading; this one
						    stays the dialog's name for a screen reader. */}
						<h2
							id={titleId}
							ref={headingRef}
							tabIndex={-1}
							className={view === "code" ? "sr-only" : undefined}
						>
							Render on Typelapse Cloud
						</h2>
						{view === "code" ? null : (
							<p>This device keeps rendering for free. A hosted render adds:</p>
						)}
					</div>
					<button type="button" onClick={close} aria-label="Close">
						<X size={14} strokeWidth={1.7} aria-hidden="true" />
					</button>
				</header>
				<div className="hosted-render-body">
					{view === "code" ? (
						<SignInStep />
					) : (
						<>
							<ul className="hosted-render-adds">
								{HOSTED_RENDER_ADDS.map((line) => (
									<li key={line}>{line}</li>
								))}
							</ul>
							{view === "upgrade" ? (
								<UpgradeStep />
							) : (
								<OfferSignIn onSignIn={() => setSigningIn(true)} />
							)}
						</>
					)}
				</div>
			</StudioBottomSheet>
		</div>,
		document.body,
	);
}

function cloudChip(): HTMLButtonElement | null {
	const group = document.querySelector('[role="group"][aria-label="Where"]');
	const chips = group ? Array.from(group.querySelectorAll<HTMLButtonElement>("button")) : [];
	return chips.find((chip) => chip.textContent?.trim() === "Cloud") ?? null;
}

function OfferSignIn({ onSignIn }: { onSignIn: () => void }) {
	const checking = useAuthStore((state) => state.status.kind === "checking");
	return (
		<>
			<p className="hosted-render-note">Hosted renders come with Creator. Sign in to start.</p>
			<button
				type="button"
				className="hosted-render-action"
				disabled={checking}
				onClick={() => {
					feedback("commit");
					onSignIn();
				}}
			>
				{checking ? "Checking account…" : "Sign in"}
			</button>
		</>
	);
}

/** The account panel's code form, the same store and the same steps. */
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
					disabled={busy}
					aria-busy={busy || undefined}
					onClick={() => {
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
