import type { BillingCadence, BillingCatalog } from "@/domain/ports/billing.port";
import {
	type ClientAuthOperation,
	type ClientAuthStatus,
	useAuthStore,
} from "@/presentation/stores/auth.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type FormEvent,
	type KeyboardEvent,
	type RefObject,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { ChevronRight, Cloud, HardDrive, Key, Logout, Profile, X } from "reicon-react";
import { StudioApiKeys, type StudioApiKeysControl } from "./studio-api-keys";
import { StudioCloudProjects, type StudioCloudProjectsControl } from "./studio-cloud-projects";
import "./studio-account-control.css";

type AuthStore = typeof useAuthStore;
type FormMode = "sign-in" | "sign-up";
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
}

export interface StudioBillingControl {
	readonly planLabel: string;
	readonly paid: boolean;
	readonly available: boolean;
	readonly catalog: BillingCatalog | null;
	readonly cadence: BillingCadence;
	readonly busy: boolean;
	readonly error: string | null;
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
}: StudioAccountControlProps) {
	const { status, operation, error, refreshSession, signIn, signUp, signOut } = store();
	const reduceMotion = useReducedMotion() === true;
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const openRef = useRef(open);
	openRef.current = open;

	// The panel unmounts under the focus it holds; a keyboard user goes back to
	// the trigger rather than to the top of the page.
	const closeToTrigger = () => {
		setOpen(false);
		triggerRef.current?.focus();
	};
	const [formMode, setFormMode] = useState<FormMode>("sign-in");
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
	}, [status.kind]);

	useEffect(() => {
		if (!open) return;
		const closeOutside = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [open]);

	const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
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
				onClick={() => {
					// Opened, the panel starts at the account, unless a key made a moment ago is
					// still to be copied: that is where the person returns to. Closing leaves the
					// view as it is, so the panel does not change under its own exit.
					if (!open) setView(keyStore?.getState().created ? "keys" : "account");
					setOpen((current) => !current);
				}}
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
						<AccountPanel
							status={status}
							operation={operation}
							error={error}
							formMode={formMode}
							cloudProjectState={cloudProjectState}
							billing={billing}
							allowance={allowance}
							apiKeys={apiKeys}
							view={view}
							cloudProjects={cloudProjects}
							keysEntryRef={keysEntryRef}
							projectsEntryRef={projectsEntryRef}
							onView={(next) => (next === "account" ? showAccount() : setView(next))}
							onFormMode={setFormMode}
							onSaveToCloud={onSaveToCloud}
							onSignIn={(email, password) => signIn({ email, password })}
							onSignUp={(name, email, password) => signUp({ name, email, password })}
							onSignOut={signOut}
						/>
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
	readonly formMode: FormMode;
	readonly cloudProjectState: StudioCloudProjectState;
	readonly billing?: StudioBillingControl;
	readonly allowance?: string | null;
	readonly apiKeys?: StudioApiKeysControl;
	readonly cloudProjects?: StudioCloudProjectsControl;
	readonly view: PanelView;
	readonly keysEntryRef: RefObject<HTMLButtonElement | null>;
	readonly projectsEntryRef: RefObject<HTMLButtonElement | null>;
	readonly onView: (view: PanelView) => void;
	readonly onFormMode: (mode: FormMode) => void;
	readonly onSaveToCloud?: () => void;
	readonly onSignIn: (email: string, password: string) => Promise<void>;
	readonly onSignUp: (name: string, email: string, password: string) => Promise<void>;
	readonly onSignOut: () => Promise<void>;
}

function AccountPanel({
	status,
	operation,
	error,
	formMode,
	cloudProjectState,
	billing,
	allowance,
	apiKeys,
	cloudProjects,
	view,
	keysEntryRef,
	projectsEntryRef,
	onView,
	onFormMode,
	onSaveToCloud,
	onSignIn,
	onSignUp,
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
			mode={formMode}
			busy={operation === "signing-in" || operation === "signing-up"}
			error={error}
			onMode={onFormMode}
			onSignIn={onSignIn}
			onSignUp={onSignUp}
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

type AuthField = "name" | "email" | "password";
type AuthErrors = Partial<Record<AuthField, string>>;

const MIN_PASSWORD = 8;

/** What is wrong with each field, said as the fix. The server still has the last word. */
function authErrors(mode: FormMode, values: Record<AuthField, string>): AuthErrors {
	const errors: AuthErrors = {};
	if (mode === "sign-up" && values.name.trim() === "") errors.name = "Add your name.";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
		errors.email = "Enter an email address like ada@example.com.";
	}
	if (values.password.length < MIN_PASSWORD) {
		errors.password = `Use at least ${MIN_PASSWORD} characters.`;
	}
	return errors;
}

function AuthForm({
	mode,
	busy,
	error,
	onMode,
	onSignIn,
	onSignUp,
}: {
	readonly mode: FormMode;
	readonly busy: boolean;
	readonly error: string | null;
	readonly onMode: (mode: FormMode) => void;
	readonly onSignIn: (email: string, password: string) => Promise<void>;
	readonly onSignUp: (name: string, email: string, password: string) => Promise<void>;
}) {
	const formId = useId();
	const [values, setValues] = useState<Record<AuthField, string>>({
		name: "",
		email: "",
		password: "",
	});
	// Empty until the first submit: a first attempt is never flagged mid-word.
	// After it, each field is checked as it changes, so a fixed one clears at once.
	const [errors, setErrors] = useState<AuthErrors | null>(null);
	const formRef = useRef<HTMLFormElement>(null);

	const change = (field: AuthField, value: string) => {
		const next = { ...values, [field]: value };
		setValues(next);
		if (errors) setErrors(authErrors(mode, next));
	};

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (busy) return;
		const found = authErrors(mode, values);
		const first = (["name", "email", "password"] as const).find((field) => found[field]);
		if (first) {
			setErrors(found);
			formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
			return;
		}
		const email = values.email.trim();
		if (mode === "sign-up") {
			void onSignUp(values.name.trim(), email, values.password);
			return;
		}
		void onSignIn(email, values.password);
	};

	const switchMode = () => {
		setErrors(null);
		onMode(mode === "sign-in" ? "sign-up" : "sign-in");
	};

	const field = (name: AuthField, label: string, input: Record<string, string>) => {
		const message = mode === "sign-in" && name === "name" ? undefined : errors?.[name];
		const messageId = `${formId}-${name}`;
		// The message sits outside the label, so it describes the field instead of
		// becoming part of its name.
		return (
			<div className="mm-account-field">
				<label>
					{label}
					<input
						name={name}
						value={values[name]}
						onChange={(event) => change(name, event.target.value)}
						aria-invalid={message ? true : undefined}
						aria-describedby={message ? messageId : undefined}
						{...input}
					/>
				</label>
				{message ? (
					<span id={messageId} className="mm-account-field-error">
						{message}
					</span>
				) : null}
			</div>
		);
	};

	const submitLabel = mode === "sign-in" ? "Sign in" : "Create account";
	return (
		// The checks are ours, beside each field and in the studio's voice; the
		// browser's bubbles pointed at one field at a time and disappeared.
		<form ref={formRef} className="mm-account-form" onSubmit={submit} noValidate>
			<p className="mm-eyebrow">Typelapse Cloud</p>
			<h2>{mode === "sign-in" ? "Continue your work." : "Create your workspace."}</h2>
			<p>Sync projects and private media, then render in the background.</p>
			{mode === "sign-up" ? field("name", "Name", { autoComplete: "name" }) : null}
			{field("email", "Email", { type: "email", autoComplete: "email", spellCheck: "false" })}
			{field("password", "Password", {
				type: "password",
				autoComplete: mode === "sign-in" ? "current-password" : "new-password",
			})}
			{error ? (
				<p role="alert" className="mm-account-error">
					{error}
				</p>
			) : null}
			<button type="submit" className="mm-account-primary" disabled={busy}>
				{busy ? (mode === "sign-in" ? "Signing in…" : "Creating account…") : submitLabel}
			</button>
			<button type="button" className="mm-account-switch" onClick={switchMode}>
				{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
			</button>
		</form>
	);
}
