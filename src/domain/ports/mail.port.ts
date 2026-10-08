/**
 * Mail: one message leaving for one address.
 *
 * The domain says what a mail holds, never how it travels: SMTP, a provider or a
 * test double is the adapter's business. Plain text comes first and is the mail;
 * the HTML says the same words for a client that prefers it.
 *
 * Pure domain: no I/O, no framework.
 */
export interface MailMessage {
	readonly to: string;
	readonly subject: string;
	readonly text: string;
	readonly html: string;
}

export interface MailPort {
	/** Resolves once the mail server has accepted the message; rejects when it has not. */
	send(message: MailMessage): Promise<void>;
}
