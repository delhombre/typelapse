import type { AssetMetadata } from "../../domain/entities/asset";
import type { AccountId } from "../../domain/ports/auth.port";

export type AssetUploadStatus = "pending" | "ready" | "failed";
export type AssetFailureCode =
	| "object-missing"
	| "checksum-mismatch"
	| "content-type-mismatch"
	| "size-mismatch"
	| "media-type-mismatch";

/** Hosted metadata for media whose bytes live exclusively in object storage. */
export interface AssetRecord {
	readonly id: string;
	readonly ownerId: AccountId;
	readonly projectId: string;
	readonly objectKey: string;
	readonly metadata: AssetMetadata;
	readonly status: AssetUploadStatus;
	readonly reserveIdempotencyKey: string;
	readonly finalizeIdempotencyKey: string | null;
	readonly verifiedChecksum: string | null;
	readonly failureCode: AssetFailureCode | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly readyAt: Date | null;
}

export interface ReservePendingAssetCommand {
	readonly id: string;
	readonly ownerId: AccountId;
	readonly projectId: string;
	readonly objectKey: string;
	readonly metadata: AssetMetadata;
	readonly idempotencyKey: string;
	readonly maxOwnerStorageBytes: number;
	readonly now: Date;
}

/**
 * Ownership, quota accounting and idempotency must be checked atomically by
 * the adapter. A foreign project deliberately has the same outcome as a
 * missing project.
 */
export type ReservePendingAssetResult =
	| { readonly outcome: "created"; readonly asset: AssetRecord }
	| { readonly outcome: "replayed"; readonly asset: AssetRecord }
	| { readonly outcome: "not-found" }
	| {
			readonly outcome: "quota-exceeded";
			readonly usedBytes: number;
			readonly limitBytes: number;
	  }
	| { readonly outcome: "idempotency-conflict" };

export interface FinalizeReadyAssetCommand {
	readonly ownerId: AccountId;
	readonly id: string;
	readonly idempotencyKey: string;
	readonly verifiedChecksum: string;
	readonly now: Date;
}

/**
 * The adapter owns the final compare-and-set so concurrent finalizers cannot
 * overwrite another idempotency key or revive failed media.
 */
export type FinalizeAssetResult =
	| { readonly outcome: "ready"; readonly asset: AssetRecord; readonly replayed: boolean }
	| { readonly outcome: "not-found" }
	| { readonly outcome: "idempotency-conflict" }
	| { readonly outcome: "invalid-state"; readonly status: AssetUploadStatus };

export interface MarkAssetFailedCommand {
	readonly ownerId: AccountId;
	readonly id: string;
	readonly idempotencyKey: string;
	readonly failureCode: AssetFailureCode;
	readonly now: Date;
}

export type MarkAssetFailedResult =
	| { readonly outcome: "failed"; readonly asset: AssetRecord; readonly replayed: boolean }
	| { readonly outcome: "not-found" }
	| { readonly outcome: "idempotency-conflict" }
	| { readonly outcome: "invalid-state"; readonly status: AssetUploadStatus };

export type DeleteOwnedAssetResult =
	| { readonly outcome: "deleted" }
	| { readonly outcome: "referenced" }
	| { readonly outcome: "not-found" };

export interface AssetRepositoryPort {
	reservePending(input: ReservePendingAssetCommand): Promise<ReservePendingAssetResult>;
	findOwnedById(ownerId: AccountId, id: string): Promise<AssetRecord | null>;
	listByOwner(ownerId: AccountId, projectId?: string): Promise<readonly AssetRecord[]>;
	finalizeReady(input: FinalizeReadyAssetCommand): Promise<FinalizeAssetResult>;
	markFailed(input: MarkAssetFailedCommand): Promise<MarkAssetFailedResult>;
	/**
	 * Ownership, reference detection, deletion and durable object-cleanup enqueue
	 * are one atomic persistence operation.
	 * Foreign ids must return not-found to preserve BOLA resistance.
	 */
	deleteOwnedIfUnreferenced(ownerId: AccountId, id: string): Promise<DeleteOwnedAssetResult>;
}
