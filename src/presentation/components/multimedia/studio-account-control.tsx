import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import {
	type ClientAuthOperation,
	type ClientAuthStatus,
	type PendingSignInCode,
	useAuthStore,
} from "@/presentation/stores/auth.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type FocusEvent,
	type FormEvent,
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	Cloud,
	HardDrive,
	Key,
	Logout,
	Profile,
	X,
} from "reicon-react";
import { StudioApiKeys, type StudioApiKeysControl } from "./studio-api-keys";
import { StudioCloudProjects, type StudioCloudProjectsControl } from "./studio-cloud-projects";
import "./studio-account-control.css";

type AuthStore = typeof useAuthStore;
type PanelView = "account" | "keys" | "projects";

export type StudioCloudProjectState = "device" | "connecting" | "synced" | "unsaved" | "error";

export interface StudioAccountControlProps {
	readonly store?: AuthStore;
	readonly cloudProjectState?: StudioCloudProjectState;
	readonly onSaveToCloud?: () => void;
	readonly billing?: StudioBillingControl;
	/** The server's allowance sentence, shown as written; the client holds no numbers. */
	readonly allowance?: string | null;
	/** Offered to a signed-in account only; without it the panel has no keys view. */
	readonly apiKeys?: StudioApiKeysControl;
	/** Offered to a signed-in account only; without it the panel has no cloud projects view. */
	readonly cloudProjects?: StudioCloudProjectsControl;
	/**
	 * Present on the phone: the account is the first section of the More menu
	 * (design audit 2026-10-08, D3), portaled into this element, and null while
	 * the menu is closed. The control stays mounted either way, so the session
	 * check and everything that hangs off it run whether the menu is open or not.
	 */
	readonly menuSection?: HTMLElement | null;
}

export interface StudioBillingControl {
	readonly planLabel: string;
	readonly paid: boolean;
	readonly available: boolean;
	readonly catalog: BillingCatalog | null;
	readonly cadence: BillingCadence;
	readonly busy: boolean;
	readonly error: string | null;
	/** Billing that is not in order, in the server's words; null when it is. */
	readonly notice?: BillingNotice | null;
	readonly onCadence: (cadence: BillingCadence) => void;
	readonly onUpgrade: () => void;
	readonly onManageBilling: () => void;
}

function initials(name: string): string {
	const letters = name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
	return letters || "A";
}

/**
 * One account island for both products: local remains a deliberate private
 * mode, while hosted builds progressively reveal identity and cloud sync.
 */
export function StudioAccountControl({
	store = useAuthStore,
	cloudProjectState = "device",
	onSaveToCloud,
	billing,
	allowance,
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
	const [open, setOpen] = useState(false);
	const openRef = useRef(open);
	openRef.current = open;

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
	const [view, setView] = useState<PanelView>("account");
	const keysEntryRef = useRef<HTMLButtonElement>(null);
	const projectsEntryRef = useRef<HTMLButtonElement>(null);
	// The view the person is coming back from, so focus returns to the row that led there.
	const backFrom = useRef<PanelView | null>(null);
	const keyStore = apiKeys?.store;
	const cloudProjectsStore = cloudProjects?.store;

	const showAccount = () => {
		backFrom.current = view;
		setView("account");
	};
	// Back from a view, focus returns to the row that led there.
	useEffect(() => {
		if (view === "account" && backFrom.current) {
			(backFrom.current === "projects" ? projectsEntryRef : keysEntryRef).current?.focus();
			backFrom.current = null;
		}
	}, [view]);
	// Signing out takes the keys and any key still on screen with it.
	useEffect(() => {
		if (status.kind !== "authenticated") {
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
		if (status.kind === "authenticated") {
			return {
				label: `Account for ${status.session.account.name}`,
				icon: <span className="mm-account-avatar">{initials(status.session.account.name)}</span>,
			};
		}
		if (status.kind === "checking") {
			return { label: "Checking account", icon: <Profile size={15} aria-hidden="true" /> };
		}
		return { label: "Sign in", icon: <Profile size={15} aria-hidden="true" /> };
	})();

	const panel = (
		<AccountPanel
			status={status}
			operation={operation}
			error={error}
			pendingCode={pendingCode}
			cloudProjectState={cloudProjectState}
			billing={billing}
			allowance={allowance}
			apiKeys={apiKeys}
			view={view}
			cloudProjects={cloudProjects}
			keysEntryRef={keysEntryRef}
			projectsEntryRef={projectsEntryRef}
			onView={(next) => (next === "account" ? showAccount() : setView(next))}
			onSaveToCloud={onSaveToCloud}
			onSendCode={sendCode}
			onSignInWithCode={signInWithCode}
			onForgetCode={forgetCode}
			onSignOut={signOut}
		/>
	);

	const openPanel = () => {
		// Opened, the panel starts at the account, unless a key made a moment ago is
		// still to be copied: that is where the person returns to. Closing leaves the
		// view as it is, so the panel does not change under its own exit.
		if (!open) setView(keyStore?.getState().created ? "keys" : "account");
		setOpen((current) => !current);
	};

	if (inMenu) {
		if (!menuSection) return null;
		const signedIn = status.kind === "authenticated" ? status.session.account : null;
		return createPortal(
			<div
				ref={rootRef}
				className="mm-account mm-account-section"
				data-open={open ? "" : undefined}
				onKeyDown={closeOnEscape}
			>
				{open ? (
					<section
						className="mm-account-popover mm-account-inline"
						aria-label={signedIn ? "Typelapse account" : "Sign in to Typelapse"}
					>
						<button ref={backRef} type="button" className="mm-keys-back" onClick={closeToTrigger}>
							<ChevronLeft size={14} aria-hidden="true" />
							More
						</button>
						{panel}
					</section>
				) : (
					<>
						{/* Who is signed in and on which plan, one press from the panel; or
						    the way in. The rows are the menu's own (44px, the same ink). */}
						<button
							ref={triggerRef}
							type="button"
							className="mm-account-row"
							aria-label={signedIn ? `Account for ${signedIn.name}` : trigger.label}
							disabled={status.kind === "checking"}
							onClick={openPanel}
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
		);
	}

	return (
		<div ref={rootRef} className="mm-account" onKeyDown={closeOnEscape}>
			<button
				ref={triggerRef}
				type="button"
				className="mm-account-trigger"
				aria-label={trigger.label}
				aria-haspopup="dialog"
				aria-expanded={open}
				disabled={status.kind === "checking"}
				onClick={openPanel}
			>
				{trigger.icon}
			</button>

			<AnimatePresence initial={false}>
				{open ? (
					<motion.dialog
						open
						className="mm-account-popover"
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
	);
}

interface AccountPanelProps {
	readonly status: ClientAuthStatus;
	readonly operation: ClientAuthOperation;
	readonly error: string | null;
	readonly pendingCode: PendingSignInCode | null;
	readonly cloudProjectState: StudioCloudProjectState;
	readonly billing?: StudioBillingControl;
	readonly allowance?: string | null;
	readonly apiKeys?: StudioApiKeysControl;
	readonly cloudProjects?: StudioCloudProjectsControl;
	readonly view: PanelView;
	readonly keysEntryRef: RefObject<HTMLButtonElement | null>;
	readonly projectsEntryRef: RefObject<HTMLButtonElement | null>;
	readonly onView: (view: PanelView) => void;
	readonly onSaveToCloud?: () => void;
	readonly onSendCode: (email: string) => Promise<void>;
	readonly onSignInWithCode: (code: string) => Promise<void>;
	readonly onForgetCode: () => void;
	readonly onSignOut: () => Promise<void>;
}

function AccountPanel({
	status,
	operation,
	error,
	pendingCode,
	cloudProjectState,
	billing,
	allowance,
	apiKeys,
	cloudProjects,
	view,
	keysEntryRef,
	projectsEntryRef,
	onView,
	onSaveToCloud,
	onSendCode,
	onSignInWithCode,
	onForgetCode,
	onSignOut,
}: AccountPanelProps) {
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
	if (status.kind === "authenticated") {
		if (apiKeys && view === "keys") {
			return <StudioApiKeys keys={apiKeys} onBack={() => onView("account")} />;
		}
		if (cloudProjects && view === "projects") {
			return <StudioCloudProjects projects={cloudProjects} onBack={() => onView("account")} />;
		}
		const syncCopy = (() => {
			switch (cloudProjectState) {
				case "connecting":
					return {
						eyebrow: "Connecting privately",
						body: "Opening your account-scoped project in Typelapse Cloud…",
					};
				case "synced":
					return {
						eyebrow: "Cloud copy saved",
						body: "This project has a private copy in Typelapse Cloud.",
					};
				case "unsaved":
					return {
						eyebrow: "Cloud copy out of date",
						body: "Your latest edits are still only on this device.",
					};
				case "error":
					return {
						eyebrow: "Cloud copy needs attention",
						body: "Nothing new was uploaded. Review the Studio status before trying again.",
					};
				case "device":
					return {
						eyebrow: "On this device",
						body: "Save privately to Typelapse Cloud when you want project metadata and media uploaded.",
					};
			}
		})();
		const { name, email } = status.session.account;
		return (
			<div className="mm-account-copy">
				{/* Who first, then what the plan allows, then this project's cloud copy
				    with the one action that changes it: the sync state used to sit above
				    the name, where "On this device" read as a fact about the person. */}
				<div className="mm-account-identity">
					<span className="mm-account-avatar" aria-hidden="true">
						{initials(name)}
					</span>
					<div>
						<h2>{name}</h2>
						<p>{email}</p>
					</div>
				</div>
				{billing ? <AccountBilling billing={billing} /> : null}
				{allowance ? <p className="mm-account-allowance">{allowance}</p> : null}
				{cloudProjects ? (
					<button
						ref={projectsEntryRef}
						type="button"
						className="mm-keys-entry mm-projects-entry"
						onClick={() => onView("projects")}
					>
						<Cloud size={14} aria-hidden="true" />
						Cloud projects
						<ChevronRight size={14} aria-hidden="true" />
					</button>
				) : null}
				{apiKeys ? (
					<button
						ref={keysEntryRef}
						type="button"
						className="mm-keys-entry"
						onClick={() => onView("keys")}
					>
						<Key size={14} aria-hidden="true" />
						API keys
						<ChevronRight size={14} aria-hidden="true" />
					</button>
				) : null}
				<div className="mm-account-sync">
					<p className="mm-eyebrow">{syncCopy.eyebrow}</p>
					<p>{syncCopy.body}</p>
					{onSaveToCloud && cloudProjectState !== "connecting" && cloudProjectState !== "synced" ? (
						<button type="button" className="mm-account-primary" onClick={onSaveToCloud}>
							{cloudProjectState === "device" ? "Save this project to cloud" : "Save changes"}
						</button>
					) : null}
				</div>
				<div className="mm-account-actions">
					{!billing?.available ? <a href="/">About Typelapse</a> : null}
					<button
						type="button"
						disabled={operation === "signing-out"}
						onClick={() => void onSignOut()}
					>
						<Logout size={14} aria-hidden="true" />
						{operation === "signing-out" ? "Signing out…" : "Sign out"}
					</button>
				</div>
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

function priceLabel(
	price: NonNullable<BillingCatalog["creator"][BillingCadence]>,
	cadence: BillingCadence,
): string {
	const amount = price.unitAmount / 100;
	const formatted = new Intl.NumberFormat("en", {
		style: "currency",
		currency: price.currency,
		minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
		maximumFractionDigits: 2,
	}).format(amount);
	return `${formatted} / ${cadence === "monthly" ? "month" : "year"}`;
}

function AccountNotice({ notice }: { readonly notice: BillingNotice }) {
	return (
		<output className="mm-account-notice" data-kind={notice.kind}>
			{notice.sentence}
		</output>
	);
}

function AccountBilling({ billing }: { readonly billing: StudioBillingControl }) {
	if (!billing.available) return null;
	if (billing.paid) {
		return (
			<div className="mm-account-plan-card" data-plan="paid">
				<div>
					<span>Current plan</span>
					<strong>{billing.planLabel}</strong>
				</div>
				<button type="button" disabled={billing.busy} onClick={billing.onManageBilling}>
					Manage billing
				</button>
				{billing.error ? <p role="alert">{billing.error}</p> : null}
			</div>
		);
	}

	// A payment that failed is fixed in the portal; a second checkout would start
	// a second subscription beside the one that is behind.
	if (billing.notice?.kind === "past-due") {
		return (
			<div className="mm-account-plan-card" data-plan="past-due">
				<div className="mm-account-plan-heading">
					<div>
						<span>Current plan</span>
						<strong>{billing.planLabel}</strong>
					</div>
				</div>
				<AccountNotice notice={billing.notice} />
				<button
					type="button"
					className="mm-account-primary"
					disabled={billing.busy}
					onClick={billing.onManageBilling}
				>
					Manage billing
				</button>
				{billing.error ? <p role="alert">{billing.error}</p> : null}
			</div>
		);
	}

	const monthly = billing.catalog?.creator.monthly;
	const annual = billing.catalog?.creator.annual;
	const selectedPrice = billing.catalog?.creator[billing.cadence];
	return (
		<div className="mm-account-plan-card" data-plan="free">
			<div className="mm-account-plan-heading">
				<div>
					<span>Current plan</span>
					<strong>{billing.planLabel}</strong>
				</div>
				<span>Private cloud + render compute</span>
			</div>
			{billing.notice ? <AccountNotice notice={billing.notice} /> : null}
			{monthly && annual ? (
				<div className="mm-account-cadence" aria-label="Creator billing cadence">
					<button
						type="button"
						aria-label="Monthly billing"
						aria-pressed={billing.cadence === "monthly"}
						onClick={() => billing.onCadence("monthly")}
					>
						{priceLabel(monthly, "monthly")}
					</button>
					<button
						type="button"
						aria-label="Annual billing"
						aria-pressed={billing.cadence === "annual"}
						onClick={() => billing.onCadence("annual")}
					>
						{priceLabel(annual, "annual")}
					</button>
				</div>
			) : null}
			{selectedPrice ? (
				<button
					type="button"
					className="mm-account-primary"
					disabled={billing.busy}
					onClick={billing.onUpgrade}
				>
					{billing.busy ? "Opening secure checkout…" : "Upgrade to Creator"}
				</button>
			) : null}
			{billing.error ? <p role="alert">{billing.error}</p> : null}
		</div>
	);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
/** How long the code step waits before it offers another code. */
const RESEND_AFTER_SECONDS = 60;

/**
 * Sign-in is one flow for a new address and a known one: the address, then the
 * six-digit code mailed to it. Which step shows is the store's pending code, so
 * closing the panel, or reading the mail on another device, keeps the step.
 */
function AuthForm({
	operation,
	error,
	pendingCode,
	onSendCode,
	onSignInWithCode,
	onForgetCode,
}: {
	readonly operation: ClientAuthOperation;
	readonly error: string | null;
	readonly pendingCode: PendingSignInCode | null;
	readonly onSendCode: (email: string) => Promise<void>;
	readonly onSignInWithCode: (code: string) => Promise<void>;
	readonly onForgetCode: () => void;
}) {
	const [email, setEmail] = useState(pendingCode?.email ?? "");
	// Back from the code step, focus returns to the address, whatever the pointer.
	const cameBack = useRef(false);
	// The address step has been on screen in this form: the code step is the answer to its
	// button, not a panel that was opened on it.
	const sawAddress = useRef(false);
	useEffect(() => {
		if (!pendingCode) sawAddress.current = true;
	}, [pendingCode]);
	if (pendingCode) {
		return (
			<CodeStep
				pending={pendingCode}
				arrived={sawAddress.current}
				signingIn={operation === "signing-in"}
				sending={operation === "sending-code"}
				error={error}
				onSignIn={onSignInWithCode}
				onResend={() => onSendCode(pendingCode.email)}
				onUseAnotherEmail={() => {
					cameBack.current = true;
					onForgetCode();
				}}
			/>
		);
	}
	return (
		<EmailStep
			email={email}
			busy={operation === "sending-code"}
			error={error}
			// A cursor goes in the address when the form opens; a finger's keyboard is not raised
			// for a field nobody tapped.
			focusOnMount={cameBack.current || !onTouch()}
			onEmail={setEmail}
			onSend={onSendCode}
		/>
	);
}

/** A finger, not a cursor: the primary pointer is imprecise and the keyboard is on screen. */
function onTouch(): boolean {
	return window.matchMedia?.("(pointer: coarse)").matches === true;
}

/**
 * A field is checked when it is left, not while it is typed (reward early, punish late).
 * Two leavings are not that: a press on one of the form's buttons, where a message that
 * arrives above the button would move it between the press and the release and lose the
 * click (the submit checks anyway); and a leaving to nowhere in the panel, a press outside
 * that is closing it or another window coming forward.
 */
function useCheckOnLeave(check: () => void) {
	const pressing = useRef(false);
	return {
		holdWhilePressing: (event: ReactPointerEvent<HTMLFormElement>) => {
			if (!(event.target as Element).closest("button")) return;
			pressing.current = true;
			const release = () => {
				pressing.current = false;
			};
			document.addEventListener("pointerup", release, { once: true });
			document.addEventListener("pointercancel", release, { once: true });
		},
		onBlur: (event: FocusEvent<HTMLInputElement>) => {
			const to = event.relatedTarget;
			const panel = event.currentTarget.closest(".mm-account-popover");
			if (pressing.current || !(to instanceof Node) || !panel?.contains(to)) return;
			check();
		},
	};
}

function ErrorMark() {
	return <AlertCircle size={13} aria-hidden="true" />;
}

function EmailStep({
	email,
	busy,
	error,
	focusOnMount,
	onEmail,
	onSend,
}: {
	readonly email: string;
	readonly busy: boolean;
	readonly error: string | null;
	readonly focusOnMount: boolean;
	readonly onEmail: (email: string) => void;
	readonly onSend: (email: string) => Promise<void>;
}) {
	const messageId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	// Empty until the first submit: a first attempt is never flagged mid-word.
	// After it, the field is checked as it changes, so a fixed address clears at once.
	const [checked, setChecked] = useState(false);
	const invalid = checked && !EMAIL.test(email.trim());
	const leave = useCheckOnLeave(() => {
		if (email.trim()) setChecked(true);
	});

	useEffect(() => {
		if (focusOnMount) inputRef.current?.focus();
	}, [focusOnMount]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (busy) return;
		setChecked(true);
		if (!EMAIL.test(email.trim())) {
			inputRef.current?.focus();
			return;
		}
		void onSend(email.trim());
	};

	return (
		// The checks are ours, beside the field and in the studio's voice; the
		// browser's bubbles disappeared.
		<form
			className="mm-account-form"
			onSubmit={submit}
			onPointerDownCapture={leave.holdWhilePressing}
			aria-busy={busy}
			noValidate
		>
			<p className="mm-eyebrow">Typelapse Cloud</p>
			<h2>Continue your work.</h2>
			<p>Sync projects and private media, then render in the background.</p>
			<div className="mm-account-field">
				{/* The message sits outside the label, so it describes the field instead of
				    becoming part of its name. */}
				<label>
					Email
					<input
						ref={inputRef}
						name="email"
						type="email"
						inputMode="email"
						autoComplete="email"
						autoCapitalize="off"
						spellCheck="false"
						enterKeyHint="send"
						placeholder="you@company.com"
						value={email}
						onChange={(event) => onEmail(event.target.value)}
						onBlur={leave.onBlur}
						aria-invalid={invalid ? true : undefined}
						aria-describedby={invalid ? messageId : undefined}
					/>
				</label>
				{invalid ? (
					<span id={messageId} className="mm-account-field-error">
						<ErrorMark />
						Enter an email address like ada@example.com.
					</span>
				) : null}
			</div>
			{/* Busy is `aria-disabled`, not `disabled`: a disabled button drops the focus it
			    holds to the page, and the press is ignored in `submit` all the same. */}
			<button type="submit" className="mm-account-primary" aria-disabled={busy ? true : undefined}>
				{busy ? "Sending code…" : "Email me a code"}
			</button>
			{/* The refusal's room is here before the refusal is, under the button that was
			    pressed, so nothing the person is looking at moves when it arrives. */}
			<AlertSlot error={error} />
		</form>
	);
}

function AlertSlot({ error }: { readonly error: string | null }) {
	return (
		<div className="mm-account-alert">
			{error ? (
				<p role="alert" className="mm-account-error">
					<ErrorMark />
					{error}
				</p>
			) : null}
		</div>
	);
}

/** Whole seconds until another code may be asked for, counted from when the last one was sent. */
function useResendWait(sentAt: Date): number {
	const until = sentAt.getTime() + RESEND_AFTER_SECONDS * 1000;
	const remaining = useCallback(
		() => Math.min(RESEND_AFTER_SECONDS, Math.max(0, Math.ceil((until - Date.now()) / 1000))),
		[until],
	);
	const [wait, setWait] = useState(remaining);
	useEffect(() => {
		setWait(remaining());
		const timer = window.setInterval(() => {
			const next = remaining();
			setWait(next);
			if (next === 0) window.clearInterval(timer);
		}, 1000);
		return () => window.clearInterval(timer);
	}, [remaining]);
	return wait;
}

function CodeStep({
	pending,
	arrived,
	signingIn,
	sending,
	error,
	onSignIn,
	onResend,
	onUseAnotherEmail,
}: {
	readonly pending: PendingSignInCode;
	/** Opened by the address step's button, rather than the panel opening on the code. */
	readonly arrived: boolean;
	readonly signingIn: boolean;
	readonly sending: boolean;
	readonly error: string | null;
	readonly onSignIn: (code: string) => Promise<void>;
	readonly onResend: () => Promise<void>;
	readonly onUseAnotherEmail: () => void;
}) {
	const hintId = useId();
	const shortId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const [code, setCode] = useState("");
	// Pressed with fewer than six digits: said beside the field, cleared as digits arrive.
	const [short, setShort] = useState(false);
	const wait = useResendWait(pending.sentAt);
	const busy = signingIn || sending;

	// The button that led here is gone: focus goes to the field the person types into
	// next, which reads out where the code went. A new code is a fresh field. A finger
	// types where it taps, so its keyboard is not raised for it; the heading takes the
	// focus the button held, so a screen reader lands on what changed.
	const first = useRef(true);
	// biome-ignore lint/correctness/useExhaustiveDependencies: refocus on each code sent
	useEffect(() => {
		setCode("");
		const opening = first.current;
		first.current = false;
		if (!onTouch()) inputRef.current?.focus();
		else if (opening && arrived) headingRef.current?.focus();
	}, [pending.sentAt]);

	// A refused code is cleared and the field is ready again, the refusal under the button.
	const wasSigningIn = useRef(false);
	useEffect(() => {
		if (wasSigningIn.current && !signingIn && error) {
			setCode("");
			inputRef.current?.focus();
		}
		wasSigningIn.current = signingIn;
	}, [signingIn, error]);

	const signIn = (value: string) => {
		if (busy) return;
		if (value.length !== CODE_LENGTH) {
			setShort(true);
			inputRef.current?.focus();
			return;
		}
		void onSignIn(value);
	};

	const leave = useCheckOnLeave(() => {
		if (code.length > 0 && code.length < CODE_LENGTH) setShort(true);
	});

	const change = (raw: string) => {
		// A pasted "042 917" or "Code: 042917" still reads as the six digits.
		const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
		setCode(digits);
		if (short && digits.length === CODE_LENGTH) setShort(false);
		// Six digits is the whole code: it goes as soon as it is there.
		if (digits.length === CODE_LENGTH && digits !== code) signIn(digits);
	};

	const resendLabel = (() => {
		if (sending) return "Sending a new code…";
		if (wait > 0) {
			return `Send a new code in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}`;
		}
		return "Send a new code";
	})();

	return (
		<form
			className="mm-account-form"
			onSubmit={(event) => {
				event.preventDefault();
				signIn(code);
			}}
			onPointerDownCapture={leave.holdWhilePressing}
			aria-busy={busy}
			noValidate
		>
			<p className="mm-eyebrow">Typelapse Cloud</p>
			<h2 ref={headingRef} tabIndex={-1}>
				Check your email.
			</h2>
			<p id={hintId}>
				Enter the six-digit code sent to <strong>{pending.email}</strong>. It expires in 10 minutes.
			</p>
			<div className="mm-account-field">
				<label>
					Code
					<input
						ref={inputRef}
						name="code"
						className="mm-account-code"
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]*"
						spellCheck="false"
						enterKeyHint="go"
						placeholder="123456"
						// A code is typed once and never remembered: no manager offers to fill or save it.
						data-1p-ignore
						data-lpignore="true"
						value={code}
						onChange={(event) => change(event.target.value)}
						onBlur={leave.onBlur}
						aria-describedby={short ? `${hintId} ${shortId}` : hintId}
						aria-invalid={short || error ? true : undefined}
					/>
				</label>
				{short ? (
					<span id={shortId} className="mm-account-field-error">
						<ErrorMark />
						Enter the six digits from the email.
					</span>
				) : null}
			</div>
			<button type="submit" className="mm-account-primary" aria-disabled={busy ? true : undefined}>
				{signingIn ? "Signing in…" : "Sign in"}
			</button>
			{/* Another code or another address sit right under Sign in; the refusal's room is
			    under them, so its arrival moves nothing the person is looking at. */}
			<div className="mm-account-code-actions">
				<button
					type="button"
					className="mm-account-switch mm-account-resend"
					aria-disabled={wait > 0 || busy ? true : undefined}
					onClick={() => {
						if (wait > 0 || busy) return;
						void onResend();
					}}
				>
					{resendLabel}
				</button>
				<button type="button" className="mm-account-switch" onClick={onUseAnotherEmail}>
					Use another email
				</button>
			</div>
			<AlertSlot error={error} />
		</form>
	);
}
