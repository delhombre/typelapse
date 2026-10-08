import type { MailMessage, MailPort } from "../../../src/domain/ports/mail.port";

export interface FakeMail extends MailPort {
	readonly sent: MailMessage[];
	/** The six-digit code of the newest mail to this address; throws when none came. */
	codeFor(address: string): string;
}

/** A mail server that keeps every message it is handed, for tests to read back. */
export function fakeMail(): FakeMail {
	const sent: MailMessage[] = [];
	return {
		sent,
		async send(message) {
			sent.push(message);
		},
		codeFor(address) {
			const mail = [...sent].reverse().find((message) => message.to === address);
			const code = mail?.text.match(/\b\d{6}\b/)?.[0];
			if (!code) {
				throw new Error(`no code was mailed to ${address}`);
			}
			return code;
		},
	};
}
