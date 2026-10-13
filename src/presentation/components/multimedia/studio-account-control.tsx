import type { PlanAllowance } from "@/application/billing/plan-allowance";
import { useScrollEdges } from "@/presentation/hooks/use-scroll-edges";
import {
	type ClientAuthOperation,
	type ClientAuthStatus,
	type PendingSignInCode,
	useAuthStore,
} from "@/presentation/stores/auth.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, HardDrive, Logout, Profile, X } from "reicon-react";
import { initials } from "./account-identity";
import type { StudioBillingControl } from "./account-plan";
import type { StudioCloudProjectState } from "./account-projects";
import { type AccountSection, AccountSheet } from "./account-sheet";
import { AuthForm } from "./auth-form";
import type { StudioApiKeysControl } from "./studio-api-keys";
import type { StudioCloudProjectsControl } from "./studio-cloud-projects";
import "./studio-account-control.css";

type AuthStore = typeof useAuthStore;

export interface StudioAccountControlProps {
	readonly store?: AuthStore;
	readonly cloudProjectState?: StudioCloudProjectState;
	readonly onSaveToCloud?: () => void;
	readonly billing?: StudioBillingControl;
	/** The server's allowance sentence, shown as written; the client holds no numbers. */
	readonly allowance?: string | null;
	/** The ceilings and usage behind that sentence: with them the plan card draws a meter per quota. */
	readonly allowanceDetail?: PlanAllowance | null;
	/** Offered to a signed-in account only; without it the sheet has no API keys tab. */
	readonly apiKeys?: StudioApiKeysControl;
	/** Offered to a signed-in account only; without it the Projects tab holds this project alone. */
	readonly cloudProjects?: StudioCloudProjectsControl;
	/**
	 * Present on the phone: the account is the first section of the More menu
	 * (design audit 2026-10-08, D3), portaled into this element, and null while
	 * the menu is closed. The control stays mounted either way, so the session
	 * check and everything that hangs off it run whether the menu is open or not.
	 */
	readonly menuSection?: HTMLElement | null;
}

/**
 * The tab the sheet opens on: a key made a moment ago and still to be copied is
 * where the person returns to; billing that is not in order is never behind a tab;
 * otherwise this project and the account's others.
 */
export function openingSection({
	keyWaiting,
	billingNotice,
}: {
	readonly keyWaiting: boolean;
	readonly billingNotice: boolean;
}): AccountSection {
	if (keyWaiting) return "keys";
	if (billingNotice) return "plan";
	return "projects";
}

/**
 * One account island for both products: local remains a deliberate private
 * mode, while hosted builds progressively reveal identity and cloud sync.
 * Signed out (or with no cloud to sign in to) the trigger opens a small panel:
 * the sign-in form, under the avatar on a desktop and in place of the More
 * menu's rows on a phone. Signed in, it opens the account sheet (`AccountSheet`).
 */
export function StudioAccountControl({
	store = useAuthStore,
	cloudProjectState = "device",
	onSaveToCloud,
	billing,
	allowance,
	allowanceDetail,
	apiKeys,
	cloudProjects,
	menuSection,
}: StudioAccountControlProps) {
	const inMenu = menuSection !== undefined;
	const {
		status,
		operation,
		error,
		pendingCode,
		refreshSession,
		sendCode,
		signInWithCode,
		forgetCode,
		signOut,
	} = store();
	const reduceMotion = useReducedMotion() === true;
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	/* The desktop panel ends above the timeline and scrolls inside that room; its foot
	   fades while there is more to scroll to (studio-account-control.css). */
	const dialogRef = useRef<HTMLDialogElement>(null);
	const { edges: dialogEdges, measure: measureDialog } = useScrollEdges(dialogRef);
	const [open, setOpen] = useState(false);
	const openRef = useRef(open);
	openRef.current = open;
	const signedIn = status.kind === "authenticated" ? status.session.account : null;

	// The signed-in account's sheet. It keeps the account it was opened for while it
	// slides out, so signing out does not empty it under its own exit.
	const [sheetOpen, setSheetOpen] = useState(false);
	const [section, setSection] = useState<AccountSection>("projects");
	const sheetAccount = useRef(signedIn);
	if (signedIn) sheetAccount.current = signedIn;
	// What gets focus back once the sheet has closed: the trigger, or on the phone the
	// More menu's button, since the row that opened it went with the menu.
	const sheetOpener = useRef<HTMLElement | null>(null);

	// The panel unmounts under the focus it holds; a keyboard user goes back to
	// the trigger rather than to the top of the page. In the menu the trigger is a
	// row the panel replaced, so it is focused once it is back.
	const refocusTrigger = useRef(false);
	const closeToTrigger = () => {
		refocusTrigger.current = true;
		setOpen(false);
	};
	// Signing out from the menu's row swaps the rows under the focus too: the Sign
	// in row that comes back takes it, once the status says signed out.
	const statusKind = status.kind;
	useEffect(() => {
		if (!open && refocusTrigger.current && statusKind !== "checking") {
			refocusTrigger.current = false;
			triggerRef.current?.focus();
		}
	}, [open, statusKind]);
	// In the menu the panel takes the rows' place, so focus goes into it: to the
	// way back, the first thing in it.
	const backRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		// The sign-in form's field may have taken focus already (children's effects run first).
		if (inMenu && open && !rootRef.current?.contains(document.activeElement)) {
			backRef.current?.focus();
		}
	}, [inMenu, open]);
	// The menu closing takes the panel with it: it opens on the rows next time.
	useEffect(() => {
		if (menuSection === null) setOpen(false);
	}, [menuSection]);
	const keyStore = apiKeys?.store;
	const cloudProjectsStore = cloudProjects?.store;

	// Signing out takes the sheet, the keys and any key still on screen with it.
	useEffect(() => {
		if (status.kind !== "authenticated") {
			setSheetOpen(false);
			keyStore?.getState().reset();
			cloudProjectsStore?.getState().reset();
		}
	}, [status.kind, keyStore, cloudProjectsStore]);

	useEffect(() => {
		if (status.kind === "checking" && operation === "idle") {
			void refreshSession();
		}
	}, [operation, refreshSession, status.kind]);

	useEffect(() => {
		if (status.kind !== "authenticated") return;
		const signedInFromPanel = openRef.current;
		if (inMenu && signedInFromPanel) refocusTrigger.current = true;
		setOpen(false);
		// Signed in from the panel: focus was on Continue, which is going away. A
		// session found at page load leaves focus where it is.
		const active = document.activeElement;
		if (
			signedInFromPanel &&
			(active === document.body || (active && rootRef.current?.contains(active)))
		) {
			triggerRef.current?.focus();
		}
	}, [status.kind, inMenu]);

	useEffect(() => {
		// In the menu, a press outside closes the menu, and the panel with it.
		if (!open || inMenu) return;
		const closeOutside = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [open, inMenu]);

	const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
		// In the menu, Escape on the rows is the menu's: it closes the menu.
		if (event.key === "Escape" && (open || !inMenu)) {
			event.stopPropagation();
			closeToTrigger();
		}
	};

	const trigger = (() => {
		if (status.kind === "local-offline") {
			return { label: "On this device", icon: <HardDrive size={15} aria-hidden="true" /> };
		}
		if (signedIn) {
			return {
				label: `Account for ${signedIn.name}`,
				icon: <span className="mm-account-avatar">{initials(signedIn.name)}</span>,
			};
		}
		if (status.kind === "checking") {
			return { label: "Checking account", icon: <Profile size={15} aria-hidden="true" /> };
		}
		return { label: "Sign in", icon: <Profile size={15} aria-hidden="true" /> };
	})();

	const openSheet = (opener: HTMLElement | null) => {
		sheetOpener.current = opener;
		setSection(
			openingSection({
				keyWaiting: Boolean(keyStore?.getState().created),
				billingNotice: Boolean(billing?.notice),
			}),
		);
		setSheetOpen(true);
	};

	const openPanel = () => {
		if (signedIn) {
			openSheet(triggerRef.current);
			return;
		}
		setOpen((current) => !current);
	};

	const sheet = (
		<AccountSheet
			open={sheetOpen && signedIn !== null}
			onClose={() => setSheetOpen(false)}
			onClosed={() => {
				const opener = sheetOpener.current;
				const back = opener?.isConnected ? opener : triggerRef.current;
				back?.focus({ preventScroll: true });
			}}
			account={sheetAccount.current ?? { name: "", email: "" }}
			section={section}
			onSection={setSection}
			cloudProjectState={cloudProjectState}
			{...(onSaveToCloud ? { onSaveToCloud } : {})}
			{...(cloudProjects ? { cloudProjects } : {})}
			{...(billing ? { billing } : {})}
			allowance={allowance ?? null}
			allowanceDetail={allowanceDetail ?? null}
			{...(apiKeys ? { apiKeys } : {})}
			signingOut={operation === "signing-out"}
			onSignOut={() => void signOut()}
		/>
	);

	const panel = (
		<AccountPanel
			status={status}
			operation={operation}
			error={error}
			pendingCode={pendingCode}
			onSendCode={sendCode}
			onSignInWithCode={signInWithCode}
			onForgetCode={forgetCode}
		/>
	);

	if (inMenu) {
		return (
			<>
				{menuSection
					? createPortal(
							<div
								ref={rootRef}
								className="mm-account mm-account-section"
								data-open={open ? "" : undefined}
								onKeyDown={closeOnEscape}
							>
								{open ? (
									<section
										className="mm-account-popover mm-account-inline"
										aria-label="Sign in to Typelapse"
									>
										<button
											ref={backRef}
											type="button"
											className="mm-keys-back"
											onClick={closeToTrigger}
										>
											<ChevronLeft size={14} aria-hidden="true" />
											More
										</button>
										{panel}
									</section>
								) : (
									<>
										{/* Who is signed in and on which plan, one press from the sheet; or
										    the way in. The rows are the menu's own (44px, the same ink). The
										    sheet is modal and portaled: the menu closes first
										    (data-dismiss-menu), and focus comes back to its button. */}
										<button
											ref={triggerRef}
											type="button"
											className="mm-account-row"
											aria-label={trigger.label}
											aria-haspopup={signedIn ? "dialog" : undefined}
											data-dismiss-menu={signedIn ? "" : undefined}
											disabled={status.kind === "checking"}
											onClick={(event) => {
												if (!signedIn) {
													openPanel();
													return;
												}
												openSheet(
													event.currentTarget
														.closest(".sc-utilities")
														?.querySelector<HTMLElement>("[data-menu-trigger]") ?? null,
												);
											}}
										>
											{trigger.icon}
											<span>{signedIn ? signedIn.name : trigger.label}</span>
											{signedIn && billing ? <small>{billing.planLabel}</small> : null}
										</button>
										{signedIn ? (
											<button
												type="button"
												className="mm-account-row"
												disabled={operation === "signing-out"}
												onClick={() => {
													refocusTrigger.current = true;
													// Refused, the row stays: focus stays where it is.
													const keepFocus = () => {
														refocusTrigger.current = false;
													};
													void signOut().then(() => {
														if (store.getState().status.kind === "authenticated") {
															keepFocus();
														}
													}, keepFocus);
												}}
											>
												<Logout size={14} aria-hidden="true" />
												<span>{operation === "signing-out" ? "Signing out…" : "Sign out"}</span>
											</button>
										) : null}
									</>
								)}
							</div>,
							menuSection,
						)
					: null}
				{sheet}
			</>
		);
	}

	return (
		<>
			<div ref={rootRef} className="mm-account" onKeyDown={closeOnEscape}>
				<button
					ref={triggerRef}
					type="button"
					className="mm-account-trigger"
					aria-label={trigger.label}
					aria-haspopup="dialog"
					aria-expanded={signedIn ? sheetOpen : open}
					disabled={status.kind === "checking"}
					onClick={openPanel}
				>
					{trigger.icon}
				</button>

				<AnimatePresence initial={false}>
					{open ? (
						<motion.dialog
							ref={dialogRef}
							open
							className="mm-account-popover"
							data-more-above={dialogEdges.above}
							data-more-below={dialogEdges.below}
							onScroll={measureDialog}
							aria-label={status.kind === "local-offline" ? "Local project" : "Typelapse account"}
							initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.985 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={
								reduceMotion
									? { opacity: 0 }
									: {
											opacity: 0,
											y: -3,
											scale: 0.99,
											transition: { duration: 0.11, ease: [0.4, 0, 1, 1] },
										}
							}
							transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
						>
							<button
								type="button"
								className="mm-account-close"
								aria-label="Close account panel"
								onClick={closeToTrigger}
							>
								<X size={15} aria-hidden="true" />
							</button>
							{panel}
						</motion.dialog>
					) : null}
				</AnimatePresence>
			</div>
			{sheet}
		</>
	);
}

/** What the small panel holds: the local mode, a cloud that is not there, or the sign-in form. */
function AccountPanel({
	status,
	operation,
	error,
	pendingCode,
	onSendCode,
	onSignInWithCode,
	onForgetCode,
}: {
	readonly status: ClientAuthStatus;
	readonly operation: ClientAuthOperation;
	readonly error: string | null;
	readonly pendingCode: PendingSignInCode | null;
	readonly onSendCode: (email: string) => Promise<void>;
	readonly onSignInWithCode: (code: string) => Promise<void>;
	readonly onForgetCode: () => void;
}) {
	// Signed in, the account is the sheet; the panel only fades out while it closes.
	if (status.kind === "authenticated") return null;
	if (status.kind === "local-offline") {
		return (
			<div className="mm-account-copy">
				<div className="mm-account-symbol mm-account-symbol-local">
					<HardDrive size={20} aria-hidden="true" />
				</div>
				<p className="mm-eyebrow">Local project</p>
				<h2>Private by default.</h2>
				<p>No account required. Your editing session and media stay on this device.</p>
				<a href="/">About Typelapse</a>
			</div>
		);
	}
	if (status.kind === "hosted-unconfigured" || status.kind === "hosted-unavailable") {
		return (
			<div className="mm-account-copy">
				<p className="mm-eyebrow">Cloud unavailable</p>
				<h2>Keep creating locally.</h2>
				<p>
					Your project is still editable here. Cloud sync will return when the service is ready.
				</p>
			</div>
		);
	}

	return (
		<AuthForm
			operation={operation}
			error={error}
			pendingCode={pendingCode}
			onSendCode={onSendCode}
			onSignInWithCode={onSignInWithCode}
			onForgetCode={onForgetCode}
		/>
	);
}
