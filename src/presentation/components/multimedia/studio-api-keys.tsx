import { expiryLabel, lastUsedLabel } from "@/application/auth/api-key-labels";
import { API_KEY_NAME_MAX, MAX_API_KEYS_PER_ACCOUNT } from "@/application/auth/api-key-rules";
import type { ApiKeySummary, CreatedApiKey, NewApiKey } from "@/domain/ports/api-key.port";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import type { useApiKeyStore } from "@/presentation/stores/api-key.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type FormEvent,
	type Ref,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { Check, ChevronLeft, Copy } from "reicon-react";
import "./studio-api-keys.css";

type ApiKeyStore = typeof useApiKeyStore;

export interface StudioApiKeysControl {
	readonly store: ApiKeyStore;
	/** The clock "used 3 min ago" is read against; a test fixes it. */
	readonly now?: () => Date;
}

type Lifetime = "never" | "30" | "365";

const LIFETIMES: ReadonlyArray<{
	readonly value: Lifetime;
	readonly label: string;
	readonly days: number | null;
}> = [
	{ value: "never", label: "Never", days: null },
	{ value: "30", label: "30 days", days: 30 },
	{ value: "365", label: "1 year", days: 365 },
];

const BLANK_NAME = "Name the key, for example GitHub Action.";

/** A programmatic move of focus must never scroll the panel under the person's hand. */
const FOCUS = { preventScroll: true } as const;

/**
 * The account island's second view: the keys that let a script render on
 * Typelapse Cloud without a browser. Every refusal is the server's own sentence;
 * the one copy of a new key is shown until the person says they have it.
 */
export function StudioApiKeys({
	keys: { store, now = () => new Date() },
	onBack,
}: {
	readonly keys: StudioApiKeysControl;
	readonly onBack: () => void;
}) {
	const { keys, status, error, creating, created, revoking, load, create, dismissCreated, revoke } =
		store();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const holdsKey = created !== null;
	const holdsKeyAtOpen = useRef(holdsKey);

	// Entering the view moves focus into it, to the key to copy when one is waiting.
	useEffect(() => {
		void load();
		if (!holdsKeyAtOpen.current) headingRef.current?.focus(FOCUS);
	}, [load]);

	const makeKey = async (input: NewApiKey) => {
		setNotice(null);
		feedback((await create(input)) ? "commit" : "error");
	};

	const done = () => {
		dismissCreated();
		// A phone would raise its keyboard for a field nobody tapped.
		if (!window.matchMedia?.("(pointer: coarse)").matches) {
			requestAnimationFrame(() => nameRef.current?.focus(FOCUS));
		}
	};

	const revokeKey = async (item: ApiKeySummary) => {
		setNotice(null);
		if (await revoke(item.prefix)) {
			feedback("commit");
			setNotice(`Revoked ${item.name}.`);
			headingRef.current?.focus(FOCUS);
		} else {
			feedback("error");
		}
	};

	const atLimit = (keys?.length ?? 0) >= MAX_API_KEYS_PER_ACCOUNT;

	return (
		<div className="mm-account-copy mm-keys">
			<button type="button" className="mm-keys-back" aria-label="Back to account" onClick={onBack}>
				<ChevronLeft size={14} aria-hidden="true" />
				Account
			</button>
			<h2 ref={headingRef} tabIndex={-1}>
				API keys
			</h2>
			<p>Let a script render on Typelapse Cloud without a browser.</p>

			{created ? (
				<SecretCard created={created} onDone={done} />
			) : atLimit ? (
				<p className="mm-keys-note">
					You have {MAX_API_KEYS_PER_ACCOUNT} API keys, the most an account keeps. Revoke one to
					create another.
				</p>
			) : (
				<NewKeyForm busy={creating} nameRef={nameRef} onCreate={makeKey} />
			)}

			{error ? (
				<p role="alert" className="mm-account-error mm-keys-error">
					{error}
				</p>
			) : null}
			{notice ? <output className="mm-keys-note">{notice}</output> : null}
			{status === "error" ? (
				<button type="button" className="mm-keys-quiet" onClick={() => void load()}>
					Try again
				</button>
			) : null}

			{keys === null ? (
				status === "error" ? null : (
					<output className="mm-keys-note">Loading keys…</output>
				)
			) : keys.length === 0 ? (
				<p className="mm-keys-note">No keys yet. Create one above.</p>
			) : (
				<KeyList keys={keys} at={now()} revoking={revoking} onRevoke={revokeKey} />
			)}
		</div>
	);
}

function NewKeyForm({
	busy,
	nameRef,
	onCreate,
}: {
	readonly busy: boolean;
	readonly nameRef: RefObject<HTMLInputElement | null>;
	readonly onCreate: (input: NewApiKey) => Promise<void>;
}) {
	const messageId = useId();
	const [name, setName] = useState("");
	const [lifetime, setLifetime] = useState<Lifetime>("never");
	// Empty until the first submit: a name is never flagged while it is being typed.
	const [problem, setProblem] = useState<string | null>(null);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (busy) return;
		if (name.trim() === "") {
			setProblem(BLANK_NAME);
			nameRef.current?.focus();
			return;
		}
		const days = LIFETIMES.find((option) => option.value === lifetime)?.days ?? null;
		void onCreate({ name: name.trim(), expiresInDays: days });
	};

	return (
		<form className="mm-account-form mm-keys-form" onSubmit={submit} noValidate>
			<div className="mm-account-field">
				<label>
					Name
					<input
						ref={nameRef}
						name="name"
						value={name}
						maxLength={API_KEY_NAME_MAX}
						placeholder="GitHub Action"
						autoComplete="off"
						spellCheck={false}
						data-1p-ignore
						data-lpignore="true"
						aria-invalid={problem ? true : undefined}
						aria-describedby={problem ? messageId : undefined}
						onChange={(event) => {
							setName(event.target.value);
							if (problem && event.target.value.trim() !== "") setProblem(null);
						}}
					/>
				</label>
				{problem ? (
					<span id={messageId} className="mm-account-field-error">
						{problem}
					</span>
				) : null}
			</div>
			<fieldset className="mm-keys-lifetime">
				<legend>Expires</legend>
				<div className="mm-keys-lifetime-options">
					{LIFETIMES.map((option) => (
						<label key={option.value}>
							<input
								type="radio"
								name="lifetime"
								value={option.value}
								checked={lifetime === option.value}
								onChange={() => setLifetime(option.value)}
							/>
							<span>{option.label}</span>
						</label>
					))}
				</div>
			</fieldset>
			<button type="submit" className="mm-account-primary" disabled={busy}>
				{busy ? "Creating…" : "Create key"}
			</button>
		</form>
	);
}

function SecretCard({
	created,
	onDone,
}: {
	readonly created: CreatedApiKey;
	readonly onDone: () => void;
}) {
	const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
	const copyRef = useRef<HTMLButtonElement>(null);
	const keyRef = useRef<HTMLElement>(null);
	const reduceMotion = useReducedMotion() === true;

	// The next thing to do is copy it: Enter does.
	useEffect(() => copyRef.current?.focus(FOCUS), []);
	useEffect(() => {
		if (copy !== "copied") return;
		const timer = setTimeout(() => setCopy("idle"), 1600);
		return () => clearTimeout(timer);
	}, [copy]);

	const copyKey = async () => {
		try {
			await navigator.clipboard.writeText(created.key);
			setCopy("copied");
			feedback("success");
		} catch {
			// Without clipboard access the key is selected for the person's own copy.
			const node = keyRef.current;
			const selection = window.getSelection();
			if (node && selection) {
				const range = document.createRange();
				range.selectNodeContents(node);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			setCopy("failed");
		}
	};

	return (
		<section className="mm-keys-secret" aria-label="Your new key">
			<h3>Copy your key now</h3>
			<p>It is shown once. Anyone who has it can render on your account.</p>
			<code ref={keyRef} className="mm-keys-key">
				{created.key}
			</code>
			<button
				ref={copyRef}
				type="button"
				className="mm-account-primary mm-keys-copy"
				onClick={() => void copyKey()}
			>
				{/* Copy to check: the old icon blurs out as the new one sharpens in. */}
				<span className="mm-keys-icon" aria-hidden="true">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.span
							key={copy === "copied" ? "check" : "copy"}
							initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
							animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
							exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
							transition={reduceMotion ? { duration: 0 } : springs.snappy}
						>
							{copy === "copied" ? <Check size={14} /> : <Copy size={14} />}
						</motion.span>
					</AnimatePresence>
				</span>
				{copy === "copied" ? "Copied" : "Copy key"}
			</button>
			<output className="sr-only">{copy === "copied" ? "Key copied" : ""}</output>
			{copy === "failed" ? (
				<p role="alert" className="mm-keys-note" data-tone="danger">
					Copy failed. The key is selected, so copy it by hand.
				</p>
			) : null}
			<button type="button" className="mm-keys-quiet" onClick={onDone}>
				Done
			</button>
		</section>
	);
}

function KeyList({
	keys,
	at,
	revoking,
	onRevoke,
}: {
	readonly keys: readonly ApiKeySummary[];
	readonly at: Date;
	readonly revoking: string | null;
	readonly onRevoke: (key: ApiKeySummary) => Promise<void>;
}) {
	const [confirming, setConfirming] = useState<string | null>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const [edges, setEdges] = useState({ above: false, below: false });

	// The edge with more to scroll fades, so a row cut in half reads as more to come;
	// the edge with nothing further stays sharp, so the last row is never half hidden.
	const measure = useCallback(() => {
		const list = listRef.current;
		if (!list) return;
		const above = list.scrollTop > 1;
		const below = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
		setEdges((now) => (now.above === above && now.below === below ? now : { above, below }));
	}, []);
	useEffect(() => {
		measure();
	});

	return (
		<ul
			ref={listRef}
			className="mm-keys-list"
			aria-label="Your API keys"
			data-more-above={edges.above}
			data-more-below={edges.below}
			onScroll={measure}
		>
			<AnimatePresence initial={false} mode="popLayout">
				{keys.map((key) => (
					<KeyRow
						key={key.prefix}
						item={key}
						at={at}
						confirming={confirming === key.prefix}
						busy={revoking === key.prefix}
						onAsk={() => setConfirming(key.prefix)}
						onCancel={() => setConfirming(null)}
						onConfirm={async () => {
							await onRevoke(key);
							setConfirming(null);
						}}
					/>
				))}
			</AnimatePresence>
		</ul>
	);
}

function KeyRow({
	item,
	at,
	confirming,
	busy,
	onAsk,
	onCancel,
	onConfirm,
	ref,
}: {
	readonly item: ApiKeySummary;
	readonly at: Date;
	readonly confirming: boolean;
	readonly busy: boolean;
	readonly onAsk: () => void;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
	/** AnimatePresence hands the leaving row its ref, to lift it out of the flow. */
	readonly ref?: Ref<HTMLLIElement>;
}) {
	const askRef = useRef<HTMLButtonElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const wasConfirming = useRef(false);
	const reduceMotion = useReducedMotion() === true;

	// Asking lands on the safe answer; backing out lands where the person was.
	useEffect(() => {
		if (confirming) cancelRef.current?.focus(FOCUS);
		else if (wasConfirming.current) askRef.current?.focus(FOCUS);
		wasConfirming.current = confirming;
	}, [confirming]);

	const expiry = expiryLabel(item.expiresAt, at);
	return (
		// A new key settles in from above and a revoked one leaves faster than it came,
		// without travel; the rows beneath glide up on transforms, not on their height.
		<motion.li
			ref={ref}
			className="mm-keys-row"
			data-confirming={confirming ? "true" : undefined}
			layout="position"
			initial={reduceMotion ? false : { opacity: 0, y: -6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{
				opacity: 0,
				transition: reduceMotion ? { duration: 0 } : { duration: 0.12, ease: [0.4, 0, 1, 1] },
			}}
			transition={reduceMotion ? { duration: 0 } : springs.snappy}
		>
			{confirming ? (
				<>
					<p className="mm-keys-confirm">
						Revoke {item.name}? Anything using it stops working at once.
					</p>
					<div className="mm-keys-actions">
						<button
							ref={cancelRef}
							type="button"
							className="mm-keys-quiet"
							disabled={busy}
							onClick={onCancel}
						>
							Cancel
						</button>
						<button type="button" className="mm-keys-danger" disabled={busy} onClick={onConfirm}>
							{busy ? "Revoking…" : "Revoke key"}
						</button>
					</div>
				</>
			) : (
				<>
					<div className="mm-keys-main">
						<p className="mm-keys-name">{item.name}</p>
						<p className="mm-keys-meta">
							<code>{item.prefix}</code>
							<span>{lastUsedLabel(item.lastUsedAt, at)}</span>
						</p>
						{expiry ? (
							<p className="mm-keys-meta" data-tone={expiry === "Expired" ? "danger" : undefined}>
								{expiry}
							</p>
						) : null}
					</div>
					<button
						ref={askRef}
						type="button"
						className="mm-keys-quiet mm-keys-revoke"
						aria-label={`Revoke ${item.name}`}
						onClick={onAsk}
					>
						Revoke
					</button>
				</>
			)}
		</motion.li>
	);
}
