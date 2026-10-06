import { createHash } from "node:crypto";

export const ASSET_KINDS = ["image", "video", "audio"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_UPLOAD_STATUSES = ["pending", "uploaded", "ready", "failed", "deleted"] as const;
export type AssetUploadStatus = (typeof ASSET_UPLOAD_STATUSES)[number];

export const CREATOR_PLAN_TIERS = ["free", "creator"] as const;
export type CreatorPlanTier = (typeof CREATOR_PLAN_TIERS)[number];

export const BILLING_SUBSCRIPTION_STATUSES = [
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
export type BillingSubscriptionStatus = (typeof BILLING_SUBSCRIPTION_STATUSES)[number];

export const BILLING_WEBHOOK_EVENT_STATUSES = [
	"processing",
	"processed",
	"failed",
	"ignored",
] as const;
export type BillingWebhookEventStatus = (typeof BILLING_WEBHOOK_EVENT_STATUSES)[number];

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
