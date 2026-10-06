import { randomBytes } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BillingProjection, NormalizedBillingEvent } from "../../server/billing/billing-service";
import { createBillingProjectionStore } from "../../server/db/billing-projection.store";
import { createDatabase } from "../../server/db/database";
import { user } from "../../server/db/schema";

/**
 * The durable half of billing, against a real PostgreSQL: the event ledger that
 * makes a webhook idempotent and the projection that only ever moves forward.
 * Runs when TYPELAPSE_TEST_DATABASE_URL names a database, for example the one
 * `tests/e2e/hosted/services.sh up` starts. It applies the migrations, makes its
 * own accounts and removes them.
 */
const DATABASE_URL = process.env.TYPELAPSE_TEST_DATABASE_URL;

const T0 = new Date("2026-10-06T10:00:00.000Z");
const minutesAfter = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe.skipIf(!DATABASE_URL)("billing projection store (PostgreSQL)", () => {
	const db = createDatabase(DATABASE_URL ?? "postgres://unused");
	const store = createBillingProjectionStore({ db });
	const suffix = randomBytes(4).toString("hex");
	const accountId = `billing-contract-${suffix}`;
	const eventIds: string[] = [];

	const eventId = (label: string) => {
		const id = `wh_${label}_${suffix}`;
		eventIds.push(id);
		return id;
	};
	const event = (id: string, payloadHash = "a".repeat(64)): NormalizedBillingEvent => ({
		id,
		type: "subscription.active",
		createdAt: T0,
		livemode: false,
		payloadHash,
	});
	const projection = (overrides: Partial<BillingProjection>): BillingProjection => ({
		userId: accountId,
		planTier: "creator",
		providerStatus: "active",
		providerCustomerId: `cus_${suffix}`,
		providerSubscriptionId: `sub_${suffix}`,
		providerProductId: "prod_monthly",
		currentPeriodEnd: minutesAfter(60 * 24 * 30),
		cancelAtPeriodEnd: false,
		lastEventId: "wh_first",
		lastEventCreatedAt: T0,
		...overrides,
	});

	beforeAll(async () => {
		await migrate(db, { migrationsFolder: "server/db/migrations" });
		await db.insert(user).values({
			id: accountId,
			name: "Billing contract",
			email: `${accountId}@typelapse.test`,
		});
	});

	afterAll(async () => {
		await db.$client.query('DELETE FROM "user" WHERE id = $1', [accountId]);
		await db.$client.query("DELETE FROM billing_webhook_events WHERE id = ANY($1)", [eventIds]);
		await db.$client.end();
	});

	it("claims an event once, and hands a failed one back for a retry", async () => {
		const id = eventId("claim");

		expect(await store.claimEvent(event(id))).toBe(true);
		expect(await store.claimEvent(event(id))).toBe(false);

		await store.finishEvent(id, "failed", "Temporary outage");
		expect(await store.claimEvent(event(id))).toBe(true);

		await store.finishEvent(id, "processed");
		expect(await store.claimEvent(event(id))).toBe(false);
	});

	it("does not reopen a failed event for a body that differs from the one first claimed", async () => {
		const id = eventId("tampered");
		await store.claimEvent(event(id));
		await store.finishEvent(id, "failed", "boom");

		expect(await store.claimEvent(event(id, "b".repeat(64)))).toBe(false);
	});

	it("applies a projection only when its event is newer than the one it holds", async () => {
		expect(await store.applyProjectionIfNewer(projection({ lastEventId: "wh_first" }))).toBe(true);

		const older = projection({
			planTier: "free",
			providerStatus: "canceled",
			lastEventId: "wh_older",
			lastEventCreatedAt: minutesAfter(-5),
		});
		expect(await store.applyProjectionIfNewer(older)).toBe(false);
		expect((await store.findByUserId(accountId))?.planTier).toBe("creator");

		const newer = projection({
			planTier: "free",
			providerStatus: "past_due",
			lastEventId: "wh_newer",
			lastEventCreatedAt: minutesAfter(5),
		});
		expect(await store.applyProjectionIfNewer(newer)).toBe(true);
		expect(await store.findByUserId(accountId)).toMatchObject({
			planTier: "free",
			providerStatus: "past_due",
			providerProductId: "prod_monthly",
		});
	});

	it("finds the account by the provider's customer id", async () => {
		expect(await store.findUserIdByCustomerId(`cus_${suffix}`)).toBe(accountId);
		expect(await store.findUserIdByCustomerId("cus_unknown")).toBeNull();
	});

	it("runs its provider-neutral migration again on a migrated database, and changes nothing", async () => {
		const { readFileSync } = await import("node:fs");
		const migration = readFileSync(
			"server/db/migrations/0009_billing_provider_neutral.sql",
			"utf8",
		);
		await store.applyProjectionIfNewer(projection({ lastEventId: "wh_replay" }));

		for (const statement of migration.split("--> statement-breakpoint")) {
			await db.$client.query(statement);
		}

		expect((await store.findByUserId(accountId))?.providerProductId).toBe("prod_monthly");
	});
});
