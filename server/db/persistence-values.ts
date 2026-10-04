import { createHash } from "node:crypto";

export const ASSET_KINDS = ["image", "video", "audio"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_UPLOAD_STATUSES = ["pending", "uploaded", "ready", "failed", "deleted"] as const;
export type AssetUploadStatus = (typeof ASSET_UPLOAD_STATUSES)[number];

export const CREATOR_PLAN_TIERS = ["free", "creator"] as const;
export type CreatorPlanTier = (typeof CREATOR_PLAN_TIERS)[number];

export const STRIPE_SUBSCRIPTION_STATUSES = [
	"none",
	"incomplete",
	"incomplete_expired",
	"trialing",
	"active",
	"past_due",
	"canceled",
	"unpaid",
	"paused",
] as const;
export type StripeSubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

export const STRIPE_WEBHOOK_EVENT_STATUSES = [
	"processing",
	"processed",
	"failed",
	"ignored",
] as const;
export type StripeWebhookEventStatus = (typeof STRIPE_WEBHOOK_EVENT_STATUSES)[number];

export const RENDER_JOB_STATUSES = [
	"queued",
	"running",
	"succeeded",
	"failed",
	"canceled",
] as const;
export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };
export type RenderOptions = Readonly<Record<string, JsonValue>>;

const ASSET_UPLOAD_TRANSITIONS: Readonly<
	Record<AssetUploadStatus, ReadonlySet<AssetUploadStatus>>
> = {
	pending: new Set(["uploaded", "failed", "deleted"]),
	uploaded: new Set(["ready", "failed", "deleted"]),
	ready: new Set(["deleted"]),
	failed: new Set(["pending", "deleted"]),
	deleted: new Set(),
};

/**
 * The upload lifecycle is deliberately explicit: an object cannot become
 * renderable until the server has observed the upload and verified its bytes.
 */
export function canTransitionAssetUpload(from: AssetUploadStatus, to: AssetUploadStatus): boolean {
	return ASSET_UPLOAD_TRANSITIONS[from].has(to);
}

function canonicaliseJson(value: unknown, ancestors: ReadonlySet<object>): string {
	if (value === null) {
		return "null";
	}
	if (typeof value === "string" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error("Expected a finite JSON number");
		}
		return JSON.stringify(value);
	}
	if (typeof value !== "object") {
		throw new Error(`Unsupported JSON value: ${typeof value}`);
	}
	if (ancestors.has(value)) {
		throw new Error("Circular JSON value");
	}

	const nextAncestors = new Set(ancestors).add(value);
	if (Array.isArray(value)) {
		return `[${value.map((entry) => canonicaliseJson(entry, nextAncestors)).join(",")}]`;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new Error("Unsupported JSON object prototype");
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => {
			if (left < right) {
				return -1;
			}
			return left > right ? 1 : 0;
		})
		.map(([key, entry]) => `${JSON.stringify(key)}:${canonicaliseJson(entry, nextAncestors)}`);
	return `{${entries.join(",")}}`;
}

/** Stable JSON is the identity boundary for render options and their dedupe key. */
export function stableJsonStringify(value: JsonValue | unknown): string {
	return canonicaliseJson(value, new Set());
}

function sha256Hex(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex");
}

/** SHA-256 keeps the unique index fixed-width without trusting caller keys. */
export function renderOptionsFingerprint(options: RenderOptions): string {
	return sha256Hex(stableJsonStringify(options));
}

/** Hash the verified raw request body, not a parsed/re-serialised webhook. */
export function webhookPayloadFingerprint(payload: string | Uint8Array): string {
	return sha256Hex(payload);
}

export interface StripeEventCursor {
	readonly id: string;
	readonly createdAt: Date;
}

/**
 * Reject events from an older Stripe second and duplicate event ids. Different
 * events from the same second still trigger a refresh of Stripe's current
 * subscription snapshot; their delivery order must never be treated as truth.
 */
export function shouldRefreshStripeProjection(
	current: StripeEventCursor | null,
	incoming: StripeEventCursor,
): boolean {
	if (!current) {
		return true;
	}
	if (incoming.id === current.id) {
		return false;
	}
	return incoming.createdAt.getTime() >= current.createdAt.getTime();
}

export interface StripeSubscriptionSnapshot {
	readonly stripeCustomerId: string;
	readonly stripeSubscriptionId: string;
	readonly stripePriceId: string;
	readonly status: Exclude<StripeSubscriptionStatus, "none">;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
	readonly event: StripeEventCursor;
}

export interface StripeSubscriptionProjection {
	readonly planTier: CreatorPlanTier;
	readonly stripeStatus: Exclude<StripeSubscriptionStatus, "none">;
	readonly stripeCustomerId: string;
	readonly stripeSubscriptionId: string;
	readonly stripePriceId: string;
	readonly currentPeriodEnd: Date | null;
	readonly cancelAtPeriodEnd: boolean;
	readonly lastEventId: string;
	readonly lastEventCreatedAt: Date;
}

/**
 * Only a configured Creator price in an active/trialing Stripe state grants
 * hosted entitlement. Billing adapters may later add an explicit grace policy;
 * persistence defaults fail closed.
 */
export function mapStripeSubscriptionProjection(
	snapshot: StripeSubscriptionSnapshot,
	creatorPriceIds: ReadonlySet<string>,
): StripeSubscriptionProjection {
	const hasCreatorPrice = creatorPriceIds.has(snapshot.stripePriceId);
	const isEntitled = snapshot.status === "active" || snapshot.status === "trialing";
	return {
		planTier: hasCreatorPrice && isEntitled ? "creator" : "free",
		stripeStatus: snapshot.status,
		stripeCustomerId: snapshot.stripeCustomerId,
		stripeSubscriptionId: snapshot.stripeSubscriptionId,
		stripePriceId: snapshot.stripePriceId,
		currentPeriodEnd: snapshot.currentPeriodEnd,
		cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
		lastEventId: snapshot.event.id,
		lastEventCreatedAt: snapshot.event.createdAt,
	};
}
