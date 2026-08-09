import { type SessionReader, betterAuthAdapter } from "@/infrastructure/auth/better-auth.adapter";
import { describe, expect, it } from "vitest";

const EXPIRES = new Date("2026-08-09T13:00:00.000Z");

const readerReturning = (
	result: Awaited<ReturnType<SessionReader["api"]["getSession"]>>,
): SessionReader => ({
	api: { getSession: async () => result },
});

describe("the better-auth adapter", () => {
	it("maps a session onto the domain shape", async () => {
		const port = betterAuthAdapter(
			readerReturning({ session: { userId: "usr_1", expiresAt: EXPIRES } }),
		);

		expect(await port.verify("session=abc")).toEqual({
			accountId: "usr_1",
			expiresAt: EXPIRES,
		});
	});

	it("accepts the serialised date better-auth returns over the wire", async () => {
		const port = betterAuthAdapter(
			readerReturning({
				session: { userId: "usr_1", expiresAt: EXPIRES.toISOString() },
			}),
		);

		const session = await port.verify("session=abc");

		expect(session?.expiresAt).toEqual(EXPIRES);
	});

	it("returns null when there is no session", async () => {
		const port = betterAuthAdapter(readerReturning(null));

		expect(await port.verify("session=nope")).toBeNull();
	});

	it("returns null rather than throwing when the provider fails", async () => {
		const port = betterAuthAdapter({
			api: {
				getSession: async () => {
					throw new Error("provider exploded");
				},
			},
		});

		await expect(port.verify("session=abc")).resolves.toBeNull();
	});

	it("passes the credential through as the cookie header", async () => {
		let seen = "";
		const port = betterAuthAdapter({
			api: {
				getSession: async ({ headers }) => {
					seen = headers.get("cookie") ?? "";
					return null;
				},
			},
		});

		await port.verify("better-auth.session_token=xyz");

		expect(seen).toBe("better-auth.session_token=xyz");
	});
});
