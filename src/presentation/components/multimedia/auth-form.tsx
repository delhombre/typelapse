import type { ClientAuthOperation, PendingSignInCode } from "@/presentation/stores/auth.store";
import {
	type FocusEvent,
	type FormEvent,
	type PointerEvent as ReactPointerEvent,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { AlertCircle } from "reicon-react";
import "./studio-account-control.css";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
/** How long the code step waits before it offers another code. */
const RESEND_AFTER_SECONDS = 60;

/**
 * Sign-in is one flow for a new address and a known one: the address, then the
 * six-digit code mailed to it. Which step shows is the store's pending code, so
 * closing the panel, or reading the mail on another device, keeps the step.
 */
export function AuthForm({
	operation,
	error,
	pendingCode,
	onSendCode,
	onSignInWithCode,
	onForgetCode,
	embedded = false,
	checkScope = ".mm-account-popover",
}: {
	readonly operation: ClientAuthOperation;
	readonly error: string | null;
	readonly pendingCode: PendingSignInCode | null;
	readonly onSendCode: (email: string) => Promise<void>;
	readonly onSignInWithCode: (code: string) => Promise<void>;
	readonly onForgetCode: () => void;
	/**
	 * Drawn inside another surface that has its own title (the hosted render sheet):
	 * the form leaves out its eyebrow, its title and its pitch, and the code step's
	 * heading is one level down.
	 */
	readonly embedded?: boolean;
	/** The surface a field is left inside of for its check to run (useCheckOnLeave). */
	readonly checkScope?: string;
}) {
	return (
		<AuthFormSurface.Provider value={{ embedded, checkScope }}>
			<AuthFormSteps
				operation={operation}
				error={error}
				pendingCode={pendingCode}
				onSendCode={onSendCode}
				onSignInWithCode={onSignInWithCode}
				onForgetCode={onForgetCode}
			/>
		</AuthFormSurface.Provider>
	);
}

/** Where the form is drawn, read by its steps and by the check on leaving a field. */
const AuthFormSurface = createContext({ embedded: false, checkScope: ".mm-account-popover" });

function AuthFormSteps({
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
	const { checkScope } = useContext(AuthFormSurface);
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
			const panel = event.currentTarget.closest(checkScope);
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
	const { embedded } = useContext(AuthFormSurface);
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
			{embedded ? null : (
				<>
					<p className="mm-eyebrow">Typelapse Cloud</p>
					<h2>Continue your work.</h2>
					{/* The two paths side by side, so a visitor who can already export for free sees
					    what signing in adds. Both claims are the plan rules (viability D2, D4): the
					    device renders every format with nothing uploaded, a free account keeps a few
					    private cloud copies, and hosted renders (the only path that bakes captions and
					    audio) are Creator's. The device line names its ceiling because no plan clamps
					    or watermarks a device export (device-exports-free D1, #265). */}
					<div className="mm-account-value">
						<p>
							<strong>On this device:</strong> every format up to 4K and 60 fps, no watermark,
							nothing uploaded, no account.
						</p>
						<p>
							<strong>With an account:</strong> private cloud copies, and hosted renders with
							captions and audio on Creator.
						</p>
					</div>
				</>
			)}
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
					<output id={messageId} className="mm-account-field-error">
						<ErrorMark />
						Enter an email address like ada@example.com.
					</output>
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
	const { embedded } = useContext(AuthFormSurface);
	const Heading = embedded ? "h3" : "h2";
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

	// A refused code is cleared on purpose (three tries, and a wrong code is not worth editing)
	// and the field is ready again, the refusal under the button.
	const wasSigningIn = useRef(false);
	useEffect(() => {
		if (wasSigningIn.current && !signingIn && error) {
			setCode("");
			inputRef.current?.focus();
		}
		wasSigningIn.current = signingIn;
	}, [signingIn, error]);

	const signIn = (value: string) => {
		// A spent code is not tried again: the refusal says to ask for another, and a fourth
		// try against it would only be refused too.
		if (busy || pending.spent) return;
		if (value.length !== CODE_LENGTH) {
			setShort(true);
			inputRef.current?.focus();
			return;
		}
		void onSignIn(value);
	};

	const leave = useCheckOnLeave(() => {
		if (!pending.spent && code.length > 0 && code.length < CODE_LENGTH) setShort(true);
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
			{embedded ? null : <p className="mm-eyebrow">Typelapse Cloud</p>}
			<Heading ref={headingRef} tabIndex={-1}>
				Check your email.
			</Heading>
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
					<output id={shortId} className="mm-account-field-error">
						<ErrorMark />
						Enter the six digits from the email.
					</output>
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
			{/* One message at a time. Six digits go as they are typed, so by the time a finger
			    reaches Sign in the refusal has come back and emptied the field, and the press
			    on it is a newer thing to say than the refusal: the short-code line takes the
			    refusal's place instead of standing beside it (#272, DECISIONS D4 of the
			    passwordless-auth log). The refusal returns with the next wrong code. Only
			    that one: "this code no longer works" is what to do next and stays. */}
			<AlertSlot error={short ? null : error} />
		</form>
	);
}
