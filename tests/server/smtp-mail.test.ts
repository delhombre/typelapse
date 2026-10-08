import { mailSettings } from "../../server/config/hosted-readiness";
import { smtpMail, smtpMailConfigFrom, smtpMailFromEnv } from "../../server/mail/smtp-mail";
import { describe, expect, it } from "vitest";

describe("SMTP configuration", () => {
	it("reads one SMTP_URL and the MAIL_FROM sender", () => {
		expect(
			smtpMailConfigFrom({
				SMTP_URL: " smtps://resend:re_key@smtp.resend.com:465 ",
				MAIL_FROM: "Typelapse <code@typelapse.com>",
			}),
		).toEqual({
			url: "smtps://resend:re_key@smtp.resend.com:465",
			from: "Typelapse <code@typelapse.com>",
		});
		expect(
			smtpMailConfigFrom({ SMTP_URL: "smtp://127.0.0.1:1025", MAIL_FROM: "code@typelapse.test" }),
		).toEqual({ url: "smtp://127.0.0.1:1025", from: "code@typelapse.test" });
	});

	it("is no mail at all when either half is missing, which hosted:check then names", () => {
		expect(smtpMailConfigFrom({})).toBeNull();
		expect(smtpMailConfigFrom({ SMTP_URL: "smtp://127.0.0.1:1025" })).toBeNull();
		expect(smtpMailConfigFrom({ SMTP_URL: "  ", MAIL_FROM: "code@typelapse.test" })).toBeNull();
		expect(smtpMailFromEnv({})).toBeNull();
	});

	it("refuses a value that cannot be a mail server or a sender, before anything is sent", () => {
		expect(() =>
			smtpMailConfigFrom({ SMTP_URL: "https://smtp.example.com", MAIL_FROM: "code@typelapse.test" }),
		).toThrow("SMTP_URL must be an smtp:// or smtps:// URL");
		expect(() =>
			smtpMailConfigFrom({ SMTP_URL: "not a url", MAIL_FROM: "code@typelapse.test" }),
		).toThrow("SMTP_URL must be an smtp:// or smtps:// URL");
		expect(() =>
			smtpMailConfigFrom({ SMTP_URL: "smtp://127.0.0.1:1025", MAIL_FROM: "Typelapse" }),
		).toThrow("MAIL_FROM must be an address");
	});

	it("names what is missing by variable, never by value", () => {
		expect(mailSettings({})).toEqual(["SMTP_URL", "MAIL_FROM"]);
		expect(mailSettings({ SMTP_URL: "smtp://u:secret@host:25" })).toEqual(["MAIL_FROM"]);
		expect(mailSettings({ SMTP_URL: "smtp://host:25", MAIL_FROM: "code@typelapse.test" })).toEqual(
			[],
		);
	});
});

describe("the SMTP mail adapter", () => {
	it("hands the transport the sender, the address, and both the text and the HTML", async () => {
		const sent: unknown[] = [];
		const mail = smtpMail(
			{ url: "smtp://127.0.0.1:1025", from: "Typelapse <code@typelapse.test>" },
			{
				sendMail: async (message) => {
					sent.push(message);
				},
			},
		);

		await mail.send({
			to: "ada@example.com",
			subject: "Your Typelapse sign-in code",
			text: "plain",
			html: "<p>rich</p>",
		});

		expect(sent).toEqual([
			{
				from: "Typelapse <code@typelapse.test>",
				to: "ada@example.com",
				subject: "Your Typelapse sign-in code",
				text: "plain",
				html: "<p>rich</p>",
			},
		]);
	});

	it("lets a transport failure through, so the sign-in says the service is unavailable", async () => {
		const mail = smtpMail(
			{ url: "smtp://127.0.0.1:1025", from: "code@typelapse.test" },
			{
				sendMail: async () => {
					throw new Error("ECONNREFUSED");
				},
			},
		);

		await expect(
			mail.send({ to: "ada@example.com", subject: "s", text: "t", html: "h" }),
		).rejects.toThrow("ECONNREFUSED");
	});
});
