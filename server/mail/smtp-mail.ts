import { createTransport } from "nodemailer";
import type { MailMessage, MailPort } from "../../src/domain/ports/mail.port";

type MailEnvironment = Readonly<Record<string, string | undefined>>;

export interface SmtpMailConfig {
	/** `smtp://user:pass@host:port`, or `smtps://` for implicit TLS. */
	readonly url: string;
	/** The sender, `code@typelapse.com` or `Typelapse <code@typelapse.com>`. */
	readonly from: string;
	/**
	 * `smtp://` to anything but this machine must upgrade to TLS (STARTTLS) or fail:
	 * a sign-in code is a credential and does not cross a network in the clear.
	 * `smtps://` is TLS from the first byte; maildev on loopback has no TLS at all.
	 */
	readonly requireTLS: boolean;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** The one call this adapter makes of nodemailer, kept injectable for its tests. */
export interface MailTransport {
	sendMail(message: MailMessage & { readonly from: string }): Promise<unknown>;
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.?[^\s@<>]*$/;
const NAMED_ADDRESS = /^[^<>]*<([^\s@<>]+@[^\s@<>]+)>$/;

/**
 * The SMTP settings, or null when either half is absent: hosted:check then names
 * `mail` missing. A value that is present but cannot work throws, as a malformed
 * BETTER_AUTH_URL does: an operator typo must stop the boot, not the first sign-in.
 */
export function smtpMailConfigFrom(env: MailEnvironment): SmtpMailConfig | null {
	const url = env.SMTP_URL?.trim();
	const from = env.MAIL_FROM?.trim();
	if (!url || !from) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("SMTP_URL must be an smtp:// or smtps:// URL");
	}
	const { protocol, hostname } = parsed;
	if (protocol !== "smtp:" && protocol !== "smtps:") {
		throw new Error("SMTP_URL must be an smtp:// or smtps:// URL");
	}
	if (!ADDRESS.test(from) && !NAMED_ADDRESS.test(from)) {
		throw new Error("MAIL_FROM must be an address, like Typelapse <code@typelapse.com>");
	}
	return { url, from, requireTLS: protocol === "smtp:" && !LOOPBACK.has(hostname) };
}

/**
 * Mail over SMTP. One adapter for maildev on a laptop, a provider's relay on
 * staging and production alike: the provider is a URL, not a dependency.
 */
export function smtpMail(
	config: SmtpMailConfig,
	transport: MailTransport = createTransport({ url: config.url, requireTLS: config.requireTLS }),
): MailPort {
	return {
		async send(message) {
			try {
				await transport.sendMail({
					from: config.from,
					to: message.to,
					subject: message.subject,
					text: message.text,
					html: message.html,
				});
			} catch (error) {
				// The server's own words can echo the login or the address; the log gets the
				// error code alone, enough to tell a refused login from a refused connection.
				const code =
					error && typeof error === "object" && "code" in error && typeof error.code === "string"
						? ` (${error.code})`
						: "";
				throw new Error(`The mail server did not take the message${code}`);
			}
		},
	};
}

/** The deployment's mail, or none. Nodemailer connects on the first send, not here. */
export function smtpMailFromEnv(env: MailEnvironment = process.env): MailPort | null {
	const config = smtpMailConfigFrom(env);
	return config ? smtpMail(config) : null;
}
