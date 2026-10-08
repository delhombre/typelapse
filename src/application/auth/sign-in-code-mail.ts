import type { MailMessage } from "../../domain/ports/mail.port";

export interface SignInCodeMailInput {
	readonly to: string;
	readonly code: string;
	readonly expiresInMinutes: number;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * The mail that carries a sign-in code: one sentence, the code, its expiry and
 * what to do if it was not you. Nothing remote, nothing to click and nothing that
 * reports an open, so the mail is the same in every client and tracks no one. The
 * code is the only run of six digits in it.
 */
export function signInCodeMail({ to, code, expiresInMinutes }: SignInCodeMailInput): MailMessage {
	const lead = "Enter this code in Typelapse to sign in:";
	const expiry = `It expires in ${expiresInMinutes} minutes.`;
	const notYou = "If this was not you, ignore this email.";
	const html = [
		"<!doctype html>",
		'<html lang="en">',
		"<body style=\"margin:0;padding:32px 24px;background:#ffffff;color:#1c1b19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;\">",
		`<p style="margin:0 0 16px;">${escapeHtml(lead)}</p>`,
		`<p style="margin:0 0 16px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:0.18em;">${escapeHtml(code)}</p>`,
		`<p style="margin:0;color:#5f5b55;">${escapeHtml(expiry)} ${escapeHtml(notYou)}</p>`,
		"</body>",
		"</html>",
		"",
	].join("\n");

	return {
		to,
		subject: "Your Typelapse sign-in code",
		text: [lead, "", code, "", `${expiry} ${notYou}`, ""].join("\n"),
		html,
	};
}
