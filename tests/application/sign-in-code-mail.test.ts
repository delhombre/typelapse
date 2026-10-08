import { signInCodeMail } from "@/application/auth/sign-in-code-mail";
import { describe, expect, it } from "vitest";

describe("the sign-in code mail", () => {
	const mail = signInCodeMail({ to: "ada@example.com", code: "042917", expiresInMinutes: 10 });

	it("goes to the address that asked, in English, and names what it is", () => {
		expect(mail.to).toBe("ada@example.com");
		expect(mail.subject).toBe("Your Typelapse sign-in code");
	});

	it("says in plain text the code, how long it lasts and what to do if it was not you", () => {
		expect(mail.text).toBe(
			[
				"Enter this code in Typelapse to sign in:",
				"",
				"042917",
				"",
				"It expires in 10 minutes. If this was not you, ignore this email.",
				"",
			].join("\n"),
		);
	});

	it("holds one run of six digits, the code, so nothing else reads as one", () => {
		expect(mail.text.match(/\d{6}/g)).toEqual(["042917"]);
		expect(mail.html.match(/\d{6}/g)).toEqual(["042917"]);
	});

	it("says the same in sober HTML: the code large, nothing remote, nothing to click", () => {
		expect(mail.html).toContain("042917");
		expect(mail.html).toContain("It expires in 10 minutes.");
		expect(mail.html).toContain("If this was not you, ignore this email.");
		expect(mail.html).toMatch(/font-size:\s*32px/);
		// No image, no stylesheet, no link and no pixel: the mail loads nothing and tracks nothing.
		expect(mail.html).not.toMatch(/<img|<link|<a\s|https?:|url\(/i);
	});

	it("opens on a text wordmark and sets the code in a light bordered box", () => {
		const wordmark = mail.html.indexOf(">Typelapse</");
		const code = mail.html.indexOf("042917");
		expect(wordmark).toBeGreaterThan(-1);
		expect(wordmark).toBeLessThan(code);
		const box = mail.html.slice(mail.html.lastIndexOf("<td", code), code);
		expect(box).toMatch(/border:\s*1px solid/);
		expect(box).toMatch(/border-radius/);
	});

	it("reads in a dark client: it says it supports both schemes and gives the dark one its colours", () => {
		expect(mail.html).toContain('<meta name="color-scheme" content="light dark">');
		expect(mail.html).toContain('<meta name="supported-color-schemes" content="light dark">');
		expect(mail.html).toMatch(/@media \(prefers-color-scheme: dark\)/);
	});

	it("escapes what it writes into the HTML", () => {
		const odd = signInCodeMail({ to: "x@example.com", code: "<b>1", expiresInMinutes: 10 });
		expect(odd.html).toContain("&lt;b&gt;1");
		expect(odd.html).not.toContain("<b>1");
	});
});
