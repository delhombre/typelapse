import type { BillingCadence, BillingCatalog } from "@/domain/ports/billing.port";
import {
	type ClientAuthOperation,
	type ClientAuthStatus,
	useAuthStore,
} from "@/presentation/stores/auth.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { CloudCheck, HardDrive, Logout, Profile, X } from "reicon-react";
import "./studio-account-control.css";

type AuthStore = typeof useAuthStore;
type FormMode = "sign-in" | "sign-up";

export type StudioCloudProjectState = "device" | "connecting" | "synced" | "unsaved" | "error";

export interface StudioAccountControlProps {
	readonly store?: AuthStore;
	readonly cloudProjectState?: StudioCloudProjectState;
	readonly onSaveToCloud?: () => void;
	readonly billing?: StudioBillingControl;
	/** The server's allowance sentence, shown as written; the client holds no numbers. */
	readonly allowance?: string | null;
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
}: StudioAccountControlProps) {
	const { status, operation, error, refreshSession, signIn, signUp, signOut } = store();
	const reduceMotion = useReducedMotion() === true;
	const rootRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [formMode, setFormMode] = useState<FormMode>("sign-in");

	useEffect(() => {
		if (status.kind === "checking" && operation === "idle") {
			void refreshSession();
		}
	}, [operation, refreshSession, status.kind]);

	useEffect(() => {
		if (status.kind === "authenticated") setOpen(false);
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
			setOpen(false);
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
				type="button"
				className="mm-account-trigger"
				aria-label={trigger.label}
				aria-haspopup="dialog"
				aria-expanded={open}
				disabled={status.kind === "checking"}
				onClick={() => setOpen((current) => !current)}
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
						exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
						transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
					>
						<button
							type="button"
							className="mm-account-close"
							aria-label="Close account panel"
							onClick={() => setOpen(false)}
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
		return (
			<div className="mm-account-copy">
				<div className="mm-account-symbol mm-account-symbol-cloud">
					<CloudCheck size={20} aria-hidden="true" />
				</div>
				<p className="mm-eyebrow">{syncCopy.eyebrow}</p>
				<h2>{status.session.account.name}</h2>
				<p>{status.session.account.email}</p>
				{billing ? <AccountBilling billing={billing} /> : null}
				{allowance ? <p className="mm-account-allowance">{allowance}</p> : null}
				<p>{syncCopy.body}</p>
				{onSaveToCloud && cloudProjectState !== "connecting" && cloudProjectState !== "synced" ? (
					<button type="button" className="mm-account-primary" onClick={onSaveToCloud}>
						{cloudProjectState === "device" ? "Save this project to cloud" : "Save changes"}
					</button>
				) : null}
				<div className="mm-account-actions">
					{!billing?.available ? <a href="/">About Typelapse</a> : null}
					<button
						type="button"
						disabled={operation === "signing-out"}
						onClick={() => void onSignOut()}
					>
						<Logout size={15} aria-hidden="true" />
						Sign out
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
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		if (mode === "sign-up") {
			void onSignUp(String(data.get("name") ?? "").trim(), email, password);
			return;
		}
		void onSignIn(email, password);
	};
	return (
		<form className="mm-account-form" onSubmit={submit}>
			<p className="mm-eyebrow">Typelapse Cloud</p>
			<h2>{mode === "sign-in" ? "Continue your work." : "Create your workspace."}</h2>
			<p>Sync projects and private media, then render in the background.</p>
			{mode === "sign-up" ? (
				<label>
					Name
					<input name="name" autoComplete="name" required />
				</label>
			) : null}
			<label>
				Email
				<input name="email" type="email" autoComplete="email" required aria-label="Email" />
			</label>
			<label>
				Password
				<input
					name="password"
					type="password"
					autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
					minLength={8}
					required
				/>
			</label>
			{error ? (
				<p role="alert" className="mm-account-error">
					{error}
				</p>
			) : null}
			<button type="submit" className="mm-account-primary" disabled={busy}>
				{busy ? "Working…" : "Continue"}
			</button>
			<button
				type="button"
				className="mm-account-switch"
				onClick={() => onMode(mode === "sign-in" ? "sign-up" : "sign-in")}
			>
				{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
			</button>
		</form>
	);
}
