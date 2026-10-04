import type { SubscriptionPort } from "../../domain/ports/subscription.port";
import type { ObjectStoragePort } from "../assets/object-storage.port";
import { projectV2ToV1 } from "../project/migrate-v1-project";
import type { ProjectDocumentV2 } from "../project/project-document";
import type { HostedRenderOptions } from "./hosted-render-job";

/**
 * How long a signed media URL handed out by a public page stays valid. The
 * page itself only ever links its own stable addresses (`/v/<id>/video`),
 * which re-sign on every request, so an hour only has to outlast one viewing
 * and the range requests a player makes while seeking.
 */
export const PUBLIC_RENDER_SIGNED_SECONDS = 60 * 60;

/** A share link longer than this stays out of the page; the studio link opens empty instead. */
const MAX_STUDIO_SHARE_CHARACTERS = 16_000;

/** A succeeded render whose owner made it public, as the page needs it. */
export interface PublishedRenderRecord {
	readonly jobId: string;
	readonly ownerId: string;
	readonly title: string;
	readonly document: ProjectDocumentV2;
	readonly renderOptions: HostedRenderOptions;
	readonly durationMs: number | null;
	readonly completedAt: Date;
	readonly output: {
		readonly objectKey: string;
		readonly mimeType: string;
		readonly byteSize: number;
	};
	readonly posterObjectKey: string | null;
}

export interface HostedRenderPageRepositoryPort {
	/** Only a succeeded render with its public flag on; anything else is null. */
	findPublished(jobId: string): Promise<PublishedRenderRecord | null>;
	/** Owner-scoped; null when the owner has no such render. */
	isPublic(ownerId: string, jobId: string): Promise<boolean | null>;
	/** Owner-scoped and succeeded only; false when nothing matched. */
	setPublic(ownerId: string, jobId: string, value: boolean): Promise<boolean>;
}

/** What a public page shows. Object keys stay behind the service. */
export interface PublicRenderPage {
	readonly jobId: string;
	readonly title: string;
	readonly mimeType: string;
	readonly codec: "H.264" | "VP8";
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly durationMs: number | null;
	readonly byteSize: number;
	readonly hasPoster: boolean;
	/** `#share=` payload of the rendered revision, or null when it cannot travel in a link. */
	readonly studioShare: string | null;
}

export interface HostedRenderPageService {
	page(jobId: string): Promise<PublicRenderPage | null>;
	/** A fresh signed URL for the page's video or poster, or null when there is no page. */
	media(jobId: string, kind: "video" | "poster"): Promise<string | null>;
	isPublic(ownerId: string, jobId: string): Promise<boolean | null>;
	setPublic(ownerId: string, jobId: string, value: boolean): Promise<boolean>;
}

/**
 * The same encoding `encodeShareLink` writes (src/presentation/utils/share-link.ts):
 * base64 of the UTF-8 JSON payload. Only a code-only revision rolls back to that
 * payload; a project with media or audio has nothing a link could carry.
 */
function studioShareOf(document: ProjectDocumentV2): string | null {
	try {
		let binary = "";
		for (const byte of new TextEncoder().encode(JSON.stringify(projectV2ToV1(document)))) {
			binary += String.fromCharCode(byte);
		}
		const encoded = btoa(binary);
		return encoded.length <= MAX_STUDIO_SHARE_CHARACTERS ? encoded : null;
	} catch {
		return null;
	}
}

/**
 * Public pages for Cloud renders (decision log 2026-10-04 D4.1). A page exists
 * while the owner keeps it public and the owner's plan still keeps the output,
 * the same grace rule the owner's own download follows; a free account has no
 * Cloud render, so no page.
 */
export function createHostedRenderPageService(input: {
	readonly pages: HostedRenderPageRepositoryPort;
	readonly storage: Pick<ObjectStoragePort, "signGet">;
	readonly subscriptions: SubscriptionPort;
	readonly now?: () => Date;
}): HostedRenderPageService {
	const now = input.now ?? (() => new Date());

	const published = async (jobId: string): Promise<PublishedRenderRecord | null> => {
		const record = await input.pages.findPublished(jobId);
		if (!record) {
			return null;
		}
		const plan = await input.subscriptions.planFor(record.ownerId);
		const downgradedAt = (await input.subscriptions.downgradedAt?.(record.ownerId)) ?? null;
		return plan.keepsHostedOutput({ completedAt: record.completedAt, downgradedAt, now: now() })
			? record
			: null;
	};

	return {
		async page(jobId) {
			const record = await published(jobId);
			if (!record) {
				return null;
			}
			return {
				jobId: record.jobId,
				title: record.title,
				mimeType: record.output.mimeType,
				codec: record.renderOptions.format === "mp4" ? "H.264" : "VP8",
				width: record.renderOptions.width,
				height: record.renderOptions.height,
				fps: record.renderOptions.fps,
				durationMs: record.durationMs,
				byteSize: record.output.byteSize,
				hasPoster: record.posterObjectKey !== null,
				studioShare: studioShareOf(record.document),
			};
		},

		async media(jobId, kind) {
			const record = await published(jobId);
			const objectKey = kind === "video" ? record?.output.objectKey : record?.posterObjectKey;
			if (!objectKey) {
				return null;
			}
			const access = await input.storage.signGet({
				objectKey,
				expiresInSeconds: PUBLIC_RENDER_SIGNED_SECONDS,
			});
			return access.url;
		},

		isPublic: (ownerId, jobId) => input.pages.isPublic(ownerId, jobId),
		setPublic: (ownerId, jobId, value) => input.pages.setPublic(ownerId, jobId, value),
	};
}

/** The page's public address on the app's origin. */
export function publicRenderPageUrl(appUrl: string, jobId: string): string {
	return `${new URL(appUrl).origin}/v/${encodeURIComponent(jobId)}`;
}
