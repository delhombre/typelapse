import { canonicalJson } from "@/application/project/canonical-json";
import type { HostedProjectRecord } from "@/application/project/hosted-project-api.port";
import {
	HostedProjectSyncError,
	type HostedProjectSyncState,
} from "@/application/project/hosted-project-sync";
import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import type {
	AssetMetadataPayload,
	ProjectDocumentV2,
} from "@/application/project/project-document";
import {
	type HostedAssetMapping,
	createHostedProjectSeed,
	remapHostedProjectAssets,
} from "@/application/project/publish-local-project";
import type { HostedProjectReferenceStore } from "@/infrastructure/project/browser-hosted-project-reference";
import type { BrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import type { StudioCloudProjectState } from "@/presentation/components/multimedia/studio-account-control";
import type { ClientAuthStatus } from "@/presentation/stores/auth.store";
import type { CloudSaveResult } from "@/presentation/stores/hosted-render-jobs.store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface StudioCloudRuntime {
	readonly createHostedSync: () => BrowserHostedProjectSyncRuntime;
	readonly references: HostedProjectReferenceStore;
	readonly localLibrary: Pick<LocalProjectLibraryPort, "loadAsset">;
}

/** What the server last confirmed, in the server's own ids. */
interface CloudCopy {
	readonly projectId: string;
	readonly fingerprint: string;
	readonly hostedAssets: readonly AssetMetadataPayload[];
	/** Local asset id to the server-owned asset already holding the same bytes. */
	readonly uploaded: ReadonlyMap<string, AssetMetadataPayload>;
}

function cloudCopy(
	project: HostedProjectRecord,
	uploaded: ReadonlyMap<string, AssetMetadataPayload> = new Map(),
): CloudCopy {
	return {
		projectId: project.id,
		fingerprint: canonicalJson(project.document),
		hostedAssets: project.document.project.assets,
		uploaded,
	};
}

/**
 * Pairs each local asset with a server-owned one: first the uploads made in
 * this session, then an existing cloud asset carrying the same bytes, so a
 * reload never uploads the same media twice. Unpaired assets are left out.
 */
export function pairHostedAssets(
	local: readonly AssetMetadataPayload[],
	copy: Pick<CloudCopy, "hostedAssets" | "uploaded">,
): HostedAssetMapping[] {
	const pairs: HostedAssetMapping[] = [];
	for (const asset of local) {
		const hostedAsset =
			copy.uploaded.get(asset.id) ??
			copy.hostedAssets.find(
				(candidate) =>
					candidate.checksum === asset.checksum &&
					candidate.byteSize === asset.byteSize &&
					candidate.mimeType === asset.mimeType,
			);
		if (hostedAsset) pairs.push({ localAssetId: asset.id, hostedAsset });
	}
	return pairs;
}

/** The local project as the cloud would store it, or null while media is not uploaded yet. */
function hostedView(document: ProjectDocumentV2, copy: CloudCopy): ProjectDocumentV2 | null {
	const assets = pairHostedAssets(document.project.assets, copy);
	if (assets.length !== document.project.assets.length) return null;
	try {
		return remapHostedProjectAssets(document, { projectId: copy.projectId, assets });
	} catch {
		return null;
	}
}

function failure(error: unknown): HostedProjectSyncError {
	return error instanceof HostedProjectSyncError
		? error
		: new HostedProjectSyncError("service-unavailable");
}

/**
 * Cloud save for the Studio. The Studio's local V2 composition stays the
 * authoritative document: the cloud receives a copy remapped to server-owned
 * ids, only when the person asks for it, and nothing is ever loaded back over
 * the local work.
 */
export function useStudioCloudProject({
	authStatus,
	document,
	runtime,
}: {
	readonly authStatus: ClientAuthStatus;
	readonly document: ProjectDocumentV2;
	readonly runtime: StudioCloudRuntime | null;
}): {
	readonly cloudProjectState: StudioCloudProjectState;
	readonly saveToCloud: () => void;
	/** The same save, answering with the canonical revision a cloud render needs. */
	readonly saveRevision: () => Promise<CloudSaveResult>;
} {
	const [syncState, setSyncState] = useState<HostedProjectSyncState>({ kind: "disconnected" });
	const [copy, setCopy] = useState<CloudCopy | null>(null);
	const coordinator = useRef<BrowserHostedProjectSyncRuntime | null>(null);
	const unsubscribe = useRef<(() => void) | null>(null);
	const copyRef = useRef<CloudCopy | null>(null);
	const ignoreReference = useRef(false);
	const documentRef = useRef(document);
	documentRef.current = document;
	const session = authStatus.kind === "authenticated" ? authStatus.session : null;
	const accountId = session?.account.id ?? null;
	const sessionRef = useRef(session);
	sessionRef.current = session;

	const remember = useCallback((next: CloudCopy | null) => {
		copyRef.current = next;
		setCopy(next);
	}, []);

	const stop = useCallback(() => {
		unsubscribe.current?.();
		unsubscribe.current = null;
		coordinator.current?.stop();
		coordinator.current = null;
	}, []);

	const start = useCallback((): BrowserHostedProjectSyncRuntime | null => {
		if (!runtime) return null;
		stop();
		const next = runtime.createHostedSync();
		coordinator.current = next;
		unsubscribe.current = next.subscribe((state) => {
			if (coordinator.current === next) setSyncState(state);
		});
		return next;
	}, [runtime, stop]);

	// Reopen the account's existing cloud project to know whether it is current.
	// This only reads the cloud copy; nothing local is uploaded or replaced.
	useEffect(() => {
		ignoreReference.current = false;
		remember(null);
		setSyncState({ kind: "disconnected" });
		const live = sessionRef.current;
		const referenced = runtime && accountId ? runtime.references.load(accountId) : null;
		if (!runtime || !accountId || !live || !referenced) {
			stop();
			return;
		}
		const active = start();
		if (!active) return;
		setSyncState({ kind: "connecting" });
		void active
			.connect({
				session: live,
				localDocument: createHostedProjectSeed(documentRef.current),
				hostedProjectId: referenced,
			})
			.then(({ project }) => {
				if (coordinator.current === active) remember(cloudCopy(project));
			})
			.catch((error: unknown) => {
				if (coordinator.current !== active) return;
				if (error instanceof HostedProjectSyncError && error.code === "project-not-found") {
					// The cloud copy was deleted elsewhere: the next save starts a new one.
					ignoreReference.current = true;
					stop();
					setSyncState({ kind: "disconnected" });
				}
			});
		return stop;
	}, [accountId, remember, runtime, start, stop]);

	const saveToCloud = useCallback(async (): Promise<CloudSaveResult> => {
		const live = sessionRef.current;
		if (!runtime || !live) {
			return { kind: "failed", message: "Sign in to save this project to the cloud." };
		}
		const local = documentRef.current;
		let active = coordinator.current;
		let current = copyRef.current;
		try {
			if (!active || !current) {
				active = start();
				if (!active) return { kind: "failed", message: failure(null).message };
				setSyncState({ kind: "connecting" });
				const referenced = ignoreReference.current
					? null
					: runtime.references.load(live.account.id);
				const connected = await active.connect({
					session: live,
					localDocument: createHostedProjectSeed(local),
					...(referenced ? { hostedProjectId: referenced } : {}),
				});
				current = cloudCopy(connected.project);
				ignoreReference.current = false;
				runtime.references.save(live.account.id, connected.project.id);
			}
			const uploaded = new Map(current.uploaded);
			const assets = pairHostedAssets(local.project.assets, current);
			for (const asset of local.project.assets) {
				if (assets.some((pair) => pair.localAssetId === asset.id)) continue;
				const content = await runtime.localLibrary.loadAsset({
					projectId: local.project.id,
					assetId: asset.id,
				});
				if (!content || !(content.opaqueHandle instanceof Blob)) {
					throw new HostedProjectSyncError("invalid-document");
				}
				const imported = await active.importFile(
					new File([content.opaqueHandle], asset.fileName, { type: asset.mimeType }),
				);
				if (imported.outcome !== "imported") {
					throw new HostedProjectSyncError(
						imported.outcome === "conflict" ? "project-conflict" : "project-not-found",
					);
				}
				const hostedAsset = {
					id: imported.uploaded.asset.id,
					...imported.uploaded.asset.metadata,
				};
				uploaded.set(asset.id, hostedAsset);
				assets.push({ localAssetId: asset.id, hostedAsset });
			}
			active.scheduleSave(
				remapHostedProjectAssets(local, { projectId: current.projectId, assets }),
			);
			const result = await active.flush();
			if (result.outcome !== "saved" && result.outcome !== "noop") {
				throw new HostedProjectSyncError(
					result.outcome === "conflict" ? "project-conflict" : "project-not-found",
				);
			}
			remember(cloudCopy(result.project, uploaded));
			setSyncState({
				kind: "ready",
				projectId: result.project.id,
				revision: result.project.revision,
			});
			return { kind: "saved", projectId: result.project.id, revision: result.project.revision };
		} catch (error) {
			const state = active?.getState();
			const settled =
				state?.kind === "error" ? state : { kind: "error" as const, error: failure(error) };
			setSyncState(settled);
			// A failed coordinator refuses further writes; the next attempt reconnects.
			stop();
			return { kind: "failed", message: settled.error.message };
		}
	}, [remember, runtime, start, stop]);

	const view = useMemo(() => (copy ? hostedView(document, copy) : null), [copy, document]);
	const cloudProjectState: StudioCloudProjectState = (() => {
		if (
			syncState.kind === "connecting" ||
			syncState.kind === "saving" ||
			syncState.kind === "uploading"
		) {
			return "connecting";
		}
		if (
			syncState.kind === "conflict" ||
			syncState.kind === "missing" ||
			syncState.kind === "error"
		) {
			return "error";
		}
		if (!copy) return "device";
		return view && canonicalJson(view) === copy.fingerprint ? "synced" : "unsaved";
	})();

	return { cloudProjectState, saveToCloud: () => void saveToCloud(), saveRevision: saveToCloud };
}
