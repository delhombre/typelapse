import { createTransport } from "nodemailer";
import type { MailMessage, MailPort } from "../../src/domain/ports/mail.port";

type MailEnvironment = Readonly<Record<string, string | undefined>>;

export interface SmtpMailConfig {
	/** `smtp://user:pass@host:port`, or `smtps://` for implicit TLS. */
	readonly url: string;
	/** The sender, `code@typelapse.com` or `Typelapse <code@typelapse.com>`. */
	readonly from: string;
}

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
	let protocol: string;
	try {
		protocol = new URL(url).protocol;
	} catch {
		throw new Error("SMTP_URL must be an smtp:// or smtps:// URL");
	}
	if (protocol !== "smtp:" && protocol !== "smtps:") {
		throw new Error("SMTP_URL must be an smtp:// or smtps:// URL");
	}
	if (!ADDRESS.test(from) && !NAMED_ADDRESS.test(from)) {
		throw new Error("MAIL_FROM must be an address, like Typelapse <code@typelapse.com>");
	}
	return { url, from };
}

/**
 * Mail over SMTP. One adapter for maildev on a laptop, a provider's relay on
 * staging and production alike: the provider is a URL, not a dependency.
 */
export function smtpMail(
	config: SmtpMailConfig,
	transport: MailTransport = createTransport(config.url),
): MailPort {
	return {
		async send(message) {
			await transport.sendMail({
				from: config.from,
				to: message.to,
				subject: message.subject,
				text: message.text,
				html: message.html,
			});
		},
	};
}

/** The deployment's mail, or none. Nodemailer connects on the first send, not here. */
export function smtpMailFromEnv(env: MailEnvironment = process.env): MailPort | null {
	const config = smtpMailConfigFrom(env);
	return config ? smtpMail(config) : null;
}
