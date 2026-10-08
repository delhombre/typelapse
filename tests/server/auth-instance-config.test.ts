import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AuthInstance, authInstance } from "../../server/auth/auth-instance";
import type { CreatorDatabase } from "../../server/db/database";
import { type FakeMail, fakeMail } from "./support/fake-mail";

const DATABASE = {} as CreatorDatabase;
const ORIGIN = "https://typelapse.example";
const ENVIRONMENT = {
	BETTER_AUTH_SECRET: "s".repeat(32),
	BETTER_AUTH_URL: "https://api.typelapse.example",
	CORS_ORIGIN: ORIGIN,
};

/** A real Better Auth over an in-memory store, with a mail server that keeps what it is handed. */
function signInService(
	environment: Record<string, string> = {},
	logger: { warn(message: string): void } = { warn: () => undefined },
): {
	auth: AuthInstance;
	mail: FakeMail;
} {
	const mail = fakeMail();
	const auth = authInstance(DATABASE, { ...ENVIRONMENT, ...environment }, mail, {
		adapter: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
		logger,
	});
	if (!auth) {
		throw new Error("auth should be configured");
	}
	return { auth, mail };
}

// Better Auth's limiter store is one per process and keys on the client address,
// so each test speaks from addresses of its own.
let nextClient = 0;
const client = () => {
	nextClient += 1;
	return `198.51.${Math.floor(nextClient / 250)}.${(nextClient % 250) + 1}`;
};

function post(
	auth: AuthInstance,
	path: string,
	body: unknown,
	from: string,
	headers: Record<string, string> = {},
): Promise<Response> {
	return auth.handler(
		new Request(`https://api.typelapse.example/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				"x-forwarded-for": from,
				...headers,
			},
			body: JSON.stringify(body),
		}),
	);
}

const sendCode = (auth: AuthInstance, email: string, from = client()) =>
	post(auth, "/email-otp/send-verification-otp", { email, type: "sign-in" }, from);
const signInWithCode = (auth: AuthInstance, email: string, otp: string, from = client()) =>
	post(auth, "/sign-in/email-otp", { email, otp }, from);

/** Any six digits but these. */
const wrong = (code: string) => (code === "000000" ? "111111" : "000000");

afterEach(() => {
	vi.useRealTimers();
});

describe("authInstance configuration", () => {
	it("keeps local mode backend-free when no database exists", () => {
		expect(authInstance(null, {}, fakeMail())).toBeNull();
	});

	it("fails closed when hosted auth configuration is incomplete", () => {
		expect(authInstance(DATABASE, {}, fakeMail())).toBeNull();
		expect(
			authInstance(
				DATABASE,
				{
					BETTER_AUTH_SECRET: "s".repeat(32),
					BETTER_AUTH_URL: "https://api.typelapse.example",
				},
				fakeMail(),
			),
		).toBeNull();
	});

	it("fails closed without mail: a code that cannot leave is a sign-in nobody can finish", () => {
		expect(authInstance(DATABASE, ENVIRONMENT, null)).toBeNull();
	});

	it("rejects weak secrets and non-http origins before constructing auth", () => {
		expect(() =>
			authInstance(
				DATABASE,
				{ ...ENVIRONMENT, BETTER_AUTH_SECRET: "too-short" },
				fakeMail(),
			),
		).toThrow("at least 32");
		expect(() =>
			authInstance(DATABASE, { ...ENVIRONMENT, BETTER_AUTH_URL: "file:///tmp/auth" }, fakeMail()),
		).toThrow("HTTP");
	});

	it("constructs auth only from a complete explicit configuration", () => {
		expect(authInstance(DATABASE, ENVIRONMENT, fakeMail())).not.toBeNull();
	});
});

describe("passwordless sign-in", () => {
	it("refuses the password sign-up and sign-in routes", async () => {
		const { auth } = signInService();

		const signUp = await post(
			auth,
			"/sign-up/email",
			{ name: "Ada", email: "ada@example.com", password: "correct horse battery" },
			client(),
		);
		const signIn = await post(
			auth,
			"/sign-in/email",
			{ email: "ada@example.com", password: "correct horse battery" },
			client(),
		);

		expect(signUp.status).toBe(400);
		expect(signIn.status).toBe(400);
	});

	it("mounts no password reset or email change by code", async () => {
		const { auth, mail } = signInService();

		for (const path of [
			"/email-otp/request-password-reset",
			"/forget-password/email-otp",
			"/email-otp/reset-password",
			"/email-otp/request-email-change",
			"/email-otp/change-email",
			// Codes of other types are never sent, so nothing is left to check or verify.
			"/email-otp/check-verification-otp",
			"/email-otp/verify-email",
		]) {
			const response = await post(auth, path, { email: "ada@example.com" }, client());
			expect(response.status, path).toBe(404);
		}
		expect(mail.sent).toEqual([]);
	});

	it("mails a six-digit code, and the code opens a session for a new address", async () => {
		const { auth, mail } = signInService();

		const sent = await sendCode(auth, "Ada.Lovelace@Example.com");
		expect(sent.status).toBe(200);
		expect(await sent.json()).toEqual({ success: true });
		expect(mail.sent.map((message) => message.to)).toEqual(["ada.lovelace@example.com"]);
		expect(mail.sent[0]?.subject).toBe("Your Typelapse sign-in code");
		const code = mail.codeFor("ada.lovelace@example.com");
		expect(code).toMatch(/^\d{6}$/);

		const signedIn = await signInWithCode(auth, "ada.lovelace@example.com", code);
		expect(signedIn.status).toBe(200);
		expect(signedIn.headers.get("set-cookie")).toContain("better-auth.session_token=");
		const { user } = (await signedIn.json()) as { user: { email: string; name: string } };
		// No name step: the account is named after its address until it says otherwise.
		expect(user).toMatchObject({ email: "ada.lovelace@example.com", name: "ada.lovelace" });
	});

	it("signs an existing account back in with a new code, as the same account", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");
		const first = await signInWithCode(auth, "ada@example.com", mail.codeFor("ada@example.com"));
		const { user: created } = (await first.json()) as { user: { id: string } };

		await sendCode(auth, "ada@example.com");
		const again = await signInWithCode(auth, "ada@example.com", mail.codeFor("ada@example.com"));

		expect(again.status).toBe(200);
		expect(((await again.json()) as { user: { id: string } }).user.id).toBe(created.id);
	});

	it("takes a code once", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");
		const code = mail.codeFor("ada@example.com");

		expect((await signInWithCode(auth, "ada@example.com", code)).status).toBe(200);
		expect((await signInWithCode(auth, "ada@example.com", code)).status).toBe(400);
	});

	it("allows three tries per code: after three wrong ones the right one no longer works", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");
		const code = mail.codeFor("ada@example.com");
		const from = client();

		const refusals: string[] = [];
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const response = await signInWithCode(auth, "ada@example.com", wrong(code), from);
			expect(response.status).toBe(400);
			refusals.push(((await response.json()) as { code: string }).code);
		}
		const late = await signInWithCode(auth, "ada@example.com", code, from);

		expect(refusals).toEqual(["INVALID_OTP", "INVALID_OTP", "INVALID_OTP"]);
		expect(late.status).toBe(403);
		expect(((await late.json()) as { code: string }).code).toBe("TOO_MANY_ATTEMPTS");
	});

	it("lets a code expire ten minutes after it was sent", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");
		const code = mail.codeFor("ada@example.com");

		vi.setSystemTime(new Date("2026-10-08T12:10:01.000Z"));
		const late = await signInWithCode(auth, "ada@example.com", code);

		expect(late.status).toBe(400);
		expect(((await late.json()) as { code: string }).code).toBe("OTP_EXPIRED");
	});

	it("still takes a code nine minutes in", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");

		vi.setSystemTime(new Date("2026-10-08T12:09:00.000Z"));
		const inTime = await signInWithCode(auth, "ada@example.com", mail.codeFor("ada@example.com"));

		expect(inTime.status).toBe(200);
	});

	it("answers a known and an unknown address alike, so no answer says which exists", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "known@example.com");
		await signInWithCode(auth, "known@example.com", mail.codeFor("known@example.com"));
		mail.sent.length = 0;

		const known = await sendCode(auth, "known@example.com");
		const unknown = await sendCode(auth, "unknown@example.com");
		expect([known.status, unknown.status]).toEqual([200, 200]);
		expect(await known.json()).toEqual(await unknown.json());
		expect(mail.sent.map((message) => message.to)).toEqual([
			"known@example.com",
			"unknown@example.com",
		]);
		expect(mail.sent[0]?.text.replace(/\d{6}/, "")).toBe(mail.sent[1]?.text.replace(/\d{6}/, ""));

		const knownWrong = await signInWithCode(
			auth,
			"known@example.com",
			wrong(mail.codeFor("known@example.com")),
		);
		const unknownWrong = await signInWithCode(
			auth,
			"unknown@example.com",
			wrong(mail.codeFor("unknown@example.com")),
		);
		expect(knownWrong.status).toBe(unknownWrong.status);
		expect(await knownWrong.json()).toEqual(await unknownWrong.json());
	});

	it("refuses to send any code but a sign-in code, and keeps none", async () => {
		// Better Auth keeps the code of another type for a known address and drops it for an
		// unknown one, mail or not: four wrong tries at it would then tell the two apart.
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");
		await signInWithCode(auth, "ada@example.com", mail.codeFor("ada@example.com"));
		mail.sent.length = 0;

		for (const type of ["email-verification", "forget-password", "change-email"]) {
			const response = await post(
				auth,
				"/email-otp/send-verification-otp",
				{ email: "ada@example.com", type },
				client(),
			);
			expect(response.status, type).toBe(400);
		}

		expect(mail.sent).toEqual([]);
	});

	it("answers a known and an unknown address alike on every code route left", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "known@example.com");
		await signInWithCode(auth, "known@example.com", mail.codeFor("known@example.com"));

		const answers = async (email: string) => {
			const from = client();
			const seen: unknown[] = [];
			const record = async (response: Promise<Response>) => {
				const answer = await response;
				const body = await answer.json().catch(() => null);
				seen.push([answer.status, body]);
			};
			for (const type of ["email-verification", "forget-password"]) {
				await record(post(auth, "/email-otp/send-verification-otp", { email, type }, from));
			}
			for (const path of ["/email-otp/check-verification-otp", "/email-otp/verify-email"]) {
				for (const type of ["email-verification", "sign-in"]) {
					await record(post(auth, path, { email, type, otp: "123456" }, from));
				}
			}
			// No code sent: four tries at one are the same refusal for both.
			for (let attempt = 0; attempt < 4; attempt += 1) {
				await record(signInWithCode(auth, email, "123456", from));
			}
			await record(sendCode(auth, email, from));
			const code = mail.codeFor(email);
			for (let attempt = 0; attempt < 4; attempt += 1) {
				await record(signInWithCode(auth, email, wrong(code), from));
			}
			return seen;
		};

		expect(await answers("known@example.com")).toEqual(await answers("unknown@example.com"));
	});

	it("takes neither a name nor an image from the caller: the account is named after its address", async () => {
		const { auth, mail } = signInService();
		await sendCode(auth, "ada@example.com");

		const signedIn = await post(
			auth,
			"/sign-in/email-otp",
			{
				email: "ada@example.com",
				otp: mail.codeFor("ada@example.com"),
				name: "<img src=x onerror=alert(1)>",
				image: "https://tracker.example/pixel.gif",
			},
			client(),
		);

		expect(signedIn.status).toBe(200);
		const { user } = (await signedIn.json()) as { user: { name: string; image: unknown } };
		expect(user.name).toBe("ada");
		expect(user.image ?? null).toBeNull();
	});

	it("mails no code to a string that is not an address", async () => {
		const { auth, mail } = signInService();

		const response = await sendCode(auth, "not-an-address");

		expect(response.status).toBe(400);
		expect(mail.sent).toEqual([]);
	});
});

describe("the limits on sending a code", () => {
	it("sends one address ten codes an hour, from however many clients", async () => {
		const { auth, mail } = signInService();

		const statuses: number[] = [];
		for (let index = 0; index < 11; index += 1) {
			statuses.push((await sendCode(auth, "ada@example.com", client())).status);
		}

		expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
		expect(statuses[10]).toBe(429);
		expect(mail.sent).toHaveLength(10);
	});

	it("names the wait of a refused send, in whole seconds, in X-Retry-After", async () => {
		const { auth } = signInService();
		for (let index = 0; index < 10; index += 1) {
			await sendCode(auth, "ada@example.com", client());
		}

		const refused = await sendCode(auth, "ADA@example.com", client());

		expect(refused.status).toBe(429);
		const wait = Number(refused.headers.get("x-retry-after"));
		expect(Number.isInteger(wait)).toBe(true);
		expect(wait).toBeGreaterThan(3500);
		expect(wait).toBeLessThanOrEqual(3600);
	});

	it("sends one client ten codes in ten minutes, whatever the addresses", async () => {
		// Better Auth only rate limits when NODE_ENV is "production", and nothing in
		// the hosted start path sets it; configured auth is hosted auth, so the limit
		// is always on, and it is the one that stops a script mailing many addresses.
		const { auth, mail } = signInService();
		const from = client();

		const statuses: number[] = [];
		for (let index = 0; index < 11; index += 1) {
			statuses.push((await sendCode(auth, `person${index}@example.com`, from)).status);
		}

		expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
		expect(statuses[10]).toBe(429);
		expect(mail.sent).toHaveLength(10);
		const refused = await sendCode(auth, "someone@example.com", from);
		const wait = Number(refused.headers.get("x-retry-after"));
		expect(wait).toBeGreaterThanOrEqual(1);
		expect(wait).toBeLessThanOrEqual(600);
	});

	it("an invalid address costs nothing: two hundred of them leave the instance's hour whole", async () => {
		const { auth, mail } = signInService();

		for (let index = 0; index < 200; index += 1) {
			const junk = await sendCode(auth, `not-an-address-${index}`, client());
			expect(junk.status).toBe(400);
		}
		const real = await sendCode(auth, "ada@example.com", client());

		expect(real.status).toBe(200);
		expect(mail.sent.map((message) => message.to)).toEqual(["ada@example.com"]);
	});

	it("counts an address as Better Auth does: any case is one address, a padded one is none", async () => {
		const { auth, mail } = signInService();
		const padded = await sendCode(auth, " ada@example.com ", client());
		expect(padded.status).toBe(400);
		for (let index = 0; index < 10; index += 1) {
			await sendCode(auth, index % 2 ? "ADA@example.com" : "ada@Example.com", client());
		}

		const refused = await sendCode(auth, "ada@example.com", client());

		expect(refused.status).toBe(429);
		expect(mail.sent).toHaveLength(10);
	});

	it("warns in the pod log when the instance's hour is spent, naming no address", async () => {
		const warnings: string[] = [];
		const { auth } = signInService({}, { warn: (message) => warnings.push(message) });
		for (let index = 0; index < 200; index += 1) {
			await sendCode(auth, `person${index}@example.com`, client());
		}
		expect(warnings).toEqual([]);

		const refused = await sendCode(auth, "secret.person@example.com", client());

		expect(refused.status).toBe(429);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("200");
		expect(warnings[0]).not.toContain("secret.person");
		expect(warnings[0]).not.toContain("example.com");
	});

	it("sends one address twenty codes a day, however they are spread over the hours", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"));
		const { auth, mail } = signInService();
		for (let hour = 0; hour < 2; hour += 1) {
			vi.setSystemTime(new Date(`2026-10-08T0${hour}:00:00.000Z`));
			for (let index = 0; index < 10; index += 1) {
				expect((await sendCode(auth, "ada@example.com")).status).toBe(200);
			}
		}
		vi.setSystemTime(new Date("2026-10-08T02:00:00.000Z"));

		const refused = await sendCode(auth, "ada@example.com");

		expect(refused.status).toBe(429);
		expect(Number(refused.headers.get("x-retry-after"))).toBe(22 * 60 * 60);
		expect(mail.sent).toHaveLength(20);
	});

	it("reads the client from the header the deployment trusts, when it names one", async () => {
		// Behind Cloudflare, X-Forwarded-For is whatever the caller wrote; cf-connecting-ip
		// is the address Cloudflare saw. Ten addresses in X-Forwarded-For are one client.
		const { auth } = signInService({ TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip" });
		const seen = client();

		const statuses: number[] = [];
		for (let index = 0; index < 11; index += 1) {
			const response = await post(
				auth,
				"/email-otp/send-verification-otp",
				{ email: `person${index}@example.com`, type: "sign-in" },
				client(),
				{ "cf-connecting-ip": seen },
			);
			statuses.push(response.status);
		}

		expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
		expect(statuses[10]).toBe(429);
	});

	it("refuses a trusted client header that is not a header name", () => {
		expect(() =>
			authInstance(DATABASE, { ...ENVIRONMENT, TRUSTED_CLIENT_IP_HEADER: "cf connecting ip" }, fakeMail()),
		).toThrow("TRUSTED_CLIENT_IP_HEADER");
	});

	it("limits tries at codes per client too, and names the wait", async () => {
		const { auth } = signInService();
		const from = client();

		const statuses: number[] = [];
		for (let index = 0; index < 11; index += 1) {
			statuses.push((await signInWithCode(auth, `person${index}@example.com`, "123456", from)).status);
		}

		expect(statuses.slice(0, 10)).not.toContain(429);
		expect(statuses[10]).toBe(429);
	});
});
