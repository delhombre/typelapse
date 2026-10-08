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

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,Menlo,Consolas,monospace";

/**
 * The mail that carries a sign-in code: the wordmark, one sentence, the code in a
 * light bordered box, its expiry and what to do if it was not you. Nothing remote,
 * nothing to click and nothing that reports an open, so the mail is the same in
 * every client and tracks no one. The code is the only run of six digits in it.
 *
 * The HTML is a table with inline styles, which every client keeps; the head's
 * dark-scheme rules are for the clients that read them, and the light colours
 * still read when a client inverts them on its own.
 */
export function signInCodeMail({ to, code, expiresInMinutes }: SignInCodeMailInput): MailMessage {
	const lead = "Enter this code in Typelapse to sign in:";
	const expiry = `It expires in ${expiresInMinutes} minutes.`;
	const notYou = "If this was not you, ignore this email.";
	const html = [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="color-scheme" content="light dark">',
		'<meta name="supported-color-schemes" content="light dark">',
		"<style>",
		"@media (prefers-color-scheme: dark) {",
		"  .tl-page { background: #1e1c1a !important; color: #f2efe9 !important; }",
		"  .tl-muted { color: #a8a29a !important; }",
		"  .tl-code { background: #2a2725 !important; border-color: #3d3935 !important; color: #f2efe9 !important; }",
		"}",
		"</style>",
		"</head>",
		`<body class="tl-page" style="margin:0;padding:0;background:#ffffff;color:#1c1b19;font-family:${SANS};">`,
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
		'<tr><td style="padding:40px 24px;">',
		'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">',
		`<tr><td style="padding:0 0 32px;font-size:17px;font-weight:700;letter-spacing:-0.01em;">Typelapse</td></tr>`,
		`<tr><td style="padding:0 0 16px;font-size:15px;line-height:1.5;">${escapeHtml(lead)}</td></tr>`,
		'<tr><td style="padding:0 0 20px;">',
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="tl-code" style="padding:14px 22px;border:1px solid #e4e0da;border-radius:10px;background:#f7f5f2;font-family:${MONO};font-size:32px;font-weight:600;letter-spacing:0.18em;color:#1c1b19;">${escapeHtml(code)}</td></tr></table>`,
		"</td></tr>",
		`<tr><td class="tl-muted" style="font-size:14px;line-height:1.5;color:#5f5b55;">${escapeHtml(expiry)} ${escapeHtml(notYou)}</td></tr>`,
		"</table>",
		"</td></tr>",
		"</table>",
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
