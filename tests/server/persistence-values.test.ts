import { describe, expect, it } from "vitest";
import {
	canTransitionAssetUpload,
	mapStripeSubscriptionProjection,
	renderOptionsFingerprint,
	shouldRefreshStripeProjection,
	stableJsonStringify,
	webhookPayloadFingerprint,
} from "../../server/db/persistence-values";

describe("hosted persistence values", () => {
	it("serialises nested JSON independently of object insertion order", () => {
		const left = {
			format: "mp4",
			canvas: { height: 1080, width: 1920 },
			layers: [{ opacity: 1, id: "hero" }],
		};
		const right = {
			layers: [{ id: "hero", opacity: 1 }],
			canvas: { width: 1920, height: 1080 },
			format: "mp4",
		};

		expect(stableJsonStringify(left)).toBe(stableJsonStringify(right));
		expect(renderOptionsFingerprint(left)).toBe(renderOptionsFingerprint(right));
		expect(renderOptionsFingerprint(left)).toMatch(/^[a-f0-9]{64}$/);
		expect(stableJsonStringify({ ä: 2, z: 1, a: 3 })).toBe('{"a":3,"z":1,"ä":2}');
	});

	it("keeps array order significant and rejects values JSON cannot represent safely", () => {
		expect(renderOptionsFingerprint({ layers: ["a", "b"] })).not.toBe(
			renderOptionsFingerprint({ layers: ["b", "a"] }),
		);
		expect(() => stableJsonStringify({ fps: Number.POSITIVE_INFINITY })).toThrow(
			"finite JSON number",
		);
		expect(() => stableJsonStringify({ format: undefined })).toThrow("Unsupported JSON value");
		const circular: { self?: unknown } = {};
		circular.self = circular;
		expect(() => stableJsonStringify(circular)).toThrow("Circular JSON value");
	});

	it("fingerprints the exact raw Stripe webhook bytes", () => {
		expect(webhookPayloadFingerprint('{"id":"evt_1"}')).toMatch(/^[a-f0-9]{64}$/);
		expect(webhookPayloadFingerprint('{"id":"evt_1"}')).not.toBe(
			webhookPayloadFingerprint('{ "id": "evt_1" }'),
		);
	});

	it("allows only forward asset upload lifecycle transitions", () => {
		expect(canTransitionAssetUpload("pending", "uploaded")).toBe(true);
		expect(canTransitionAssetUpload("uploaded", "ready")).toBe(true);
		expect(canTransitionAssetUpload("uploaded", "failed")).toBe(true);
		expect(canTransitionAssetUpload("failed", "pending")).toBe(true);
		expect(canTransitionAssetUpload("ready", "deleted")).toBe(true);

		expect(canTransitionAssetUpload("pending", "ready")).toBe(false);
		expect(canTransitionAssetUpload("ready", "uploaded")).toBe(false);
		expect(canTransitionAssetUpload("deleted", "pending")).toBe(false);
		expect(canTransitionAssetUpload("ready", "ready")).toBe(false);
	});

	it("projects Creator only for an entitled Stripe snapshot on the configured price", () => {
		const common = {
			stripeCustomerId: "cus_123",
			stripeSubscriptionId: "sub_123",
			stripePriceId: "price_creator_monthly",
			currentPeriodEnd: new Date("2026-09-30T00:00:00.000Z"),
			cancelAtPeriodEnd: false,
			event: { id: "evt_2", createdAt: new Date("2026-08-30T22:00:00.000Z") },
		};
		const creatorPrices = new Set(["price_creator_monthly"]);

		expect(
			mapStripeSubscriptionProjection({ ...common, status: "active" }, creatorPrices),
		).toMatchObject({ planTier: "creator", stripeStatus: "active" });
		expect(
			mapStripeSubscriptionProjection({ ...common, status: "past_due" }, creatorPrices),
		).toMatchObject({ planTier: "free", stripeStatus: "past_due" });
		expect(
			mapStripeSubscriptionProjection(
				{ ...common, status: "active", stripePriceId: "price_unknown" },
				creatorPrices,
			),
		).toMatchObject({ planTier: "free" });
	});

	it("refreshes from Stripe for a new event but never regresses to an older cursor", () => {
		const current = { id: "evt_2", createdAt: new Date("2026-08-30T22:00:00.000Z") };

		expect(
			shouldRefreshStripeProjection(current, {
				id: "evt_3",
				createdAt: new Date("2026-08-30T22:00:01.000Z"),
			}),
		).toBe(true);
		expect(
			shouldRefreshStripeProjection(current, {
				id: "evt_same_second",
				createdAt: current.createdAt,
			}),
		).toBe(true);
		expect(shouldRefreshStripeProjection(current, current)).toBe(false);
		expect(
			shouldRefreshStripeProjection(current, {
				id: "evt_1",
				createdAt: new Date("2026-08-30T21:59:59.000Z"),
			}),
		).toBe(false);
	});
});
