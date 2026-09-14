import type {
	LocalSceneAssetSourceFactoryPort,
	SceneAssetSourceRegistryPort,
} from "@/application/assets/scene-asset-source.port";
import {
	deleteAudioCue,
	selectAudioCue,
	updateAudioCue,
} from "@/application/project/audio-cue-authoring";
import {
	HostedProjectSyncError,
	type HostedProjectSyncState,
} from "@/application/project/hosted-project-sync";
import type { LocalProjectLibraryPort } from "@/application/project/local-project-library.port";
import {
	addCodeLayer,
	addEmptyScene,
	addMediaAsset,
	addTextLayer,
	placeRegisteredMediaAsset,
} from "@/application/project/multimedia-authoring";
import {
	createHostedProjectSeed,
	remapHostedProjectAssets,
} from "@/application/project/publish-local-project";
import {
	moveSceneNext,
	moveScenePrevious,
	moveSceneToIndex,
	updateSceneDuration,
	updateSceneTransition,
} from "@/application/project/scene-authoring";
import { serializeProjectDocument } from "@/application/project/serialize-project-document";
import type { HostedRenderClientPort } from "@/application/render/hosted-render-client.port";
import type { LocalMultimediaRenderClientPort } from "@/application/render/local-multimedia-render-client.port";
import type { CanvasSettings, Project } from "@/domain/entities/project";
import {
	type BrowserLocalMediaImporter,
	BrowserObjectUrlSceneAssetSourceFactory,
	createBrowserLocalMediaImporter,
} from "@/infrastructure/assets/browser-local-media-importer";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { HostedRenderHttpAdapter } from "@/infrastructure/export/hosted-render-http.adapter";
import { LocalMultimediaRenderHttpAdapter } from "@/infrastructure/export/local-multimedia-render-http.adapter";
import {
	BrowserHostedProjectReferenceStore,
	type HostedProjectReferenceStore,
} from "@/infrastructure/project/browser-hosted-project-reference";
import {
	type BrowserHostedProjectSyncRuntime,
	createBrowserHostedProjectSyncRuntime,
} from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { IndexedDbLocalProjectAdapter } from "@/infrastructure/project/indexeddb-local-project.adapter";
import { trigger } from "@/presentation/haptics";
import { useMultimediaPlayback } from "@/presentation/hooks/use-multimedia-playback";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { type createProjectStore, useProjectStore } from "@/presentation/stores/project.store";
import { useThemeModeStore } from "@/presentation/stores/theme-mode.store";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
	Add,
	Code,
	HardDrive,
	Image,
	Moon,
	Music,
	Redo,
	Sun,
	TextInputFocus,
	Undo,
} from "reicon-react";
import { Logomark } from "../ui/logomark";
import { StudioTooltip, StudioTooltipProvider } from "../ui/studio-tooltip";
import { MultimediaAudioInspector } from "./multimedia-audio-inspector";
import { type MultimediaDeploymentMode, MultimediaExportPanel } from "./multimedia-export-panel";
import { MultimediaInspector } from "./multimedia-inspector";
import { MultimediaSceneInspector } from "./multimedia-scene-inspector";
import { MultimediaSceneThumbnail } from "./multimedia-scene-thumbnail";
import { MultimediaStage } from "./multimedia-stage";
import { MultimediaTimeline } from "./multimedia-timeline";
import { MultimediaToolbar } from "./multimedia-toolbar";
import { StudioAccountControl } from "./studio-account-control";
import "./multimedia-studio.css";
import "./multimedia-camera-skin.css";

const DEFAULT_FPS = 30;

export interface MultimediaStudioRuntime {
	readonly registry: SceneAssetSourceRegistryPort;
	readonly importer: BrowserLocalMediaImporter;
	readonly deploymentMode: MultimediaDeploymentMode;
	readonly sourceFactory?: LocalSceneAssetSourceFactoryPort;
	readonly localLibrary?: LocalProjectLibraryPort;
	readonly localRender?: LocalMultimediaRenderClientPort;
	readonly hostedRender?: HostedRenderClientPort;
	readonly projectRevision?: number;
	readonly createHostedSync?: () => BrowserHostedProjectSyncRuntime;
	readonly hostedProjectReferences?: HostedProjectReferenceStore;
}

export interface MultimediaStudioProps {
	readonly store?: ReturnType<typeof createProjectStore>;
	readonly runtime?: MultimediaStudioRuntime;
	readonly authStore?: typeof useAuthStore;
	readonly planStore?: typeof usePlanStore;
}

const defaultRegistry = createSceneAssetSourceRegistry();
const defaultSourceFactory = new BrowserObjectUrlSceneAssetSourceFactory();
const defaultDeploymentMode: MultimediaDeploymentMode =
	import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE === "hosted" ? "hosted" : "local";
const defaultLocalLibrary = new IndexedDbLocalProjectAdapter();
const defaultRuntime: MultimediaStudioRuntime = {
	registry: defaultRegistry,
	deploymentMode: defaultDeploymentMode,
	sourceFactory: defaultSourceFactory,
	localLibrary: defaultLocalLibrary,
	importer: createBrowserLocalMediaImporter({
		registry: defaultRegistry,
		sourceFactory: defaultSourceFactory,
	}),
	...(defaultDeploymentMode === "hosted"
		? {
				hostedRender: new HostedRenderHttpAdapter(),
				createHostedSync: () =>
					createBrowserHostedProjectSyncRuntime({ registry: defaultRegistry }),
				hostedProjectReferences: new BrowserHostedProjectReferenceStore(),
			}
		: { localRender: new LocalMultimediaRenderHttpAdapter(defaultLocalLibrary) }),
};

function sceneStartFrame(
	document: ReturnType<typeof serializeProjectDocument>,
	sceneId: string,
): number {
	let cursorMs = 0;
	for (const scene of document.project.scenes) {
		if (scene.id === sceneId) return Math.round((cursorMs / 1_000) * DEFAULT_FPS);
		cursorMs += scene.durationMs + (scene.transitionOut?.durationMs ?? 0);
	}
	return 0;
}

function FormatPanel({
	canvas,
	onChange,
}: {
	readonly canvas: CanvasSettings;
	readonly onChange: (canvas: CanvasSettings) => void;
}) {
	const presets = [
		{ label: "16:9", width: 1920, height: 1080 },
		{ label: "1:1", width: 1080, height: 1080 },
		{ label: "9:16", width: 1080, height: 1920 },
		{ label: "4:5", width: 1080, height: 1350 },
	] as const;
	return (
		<div className="mm-panel-content mm-format-options">
			<p className="mm-eyebrow">Canvas</p>
			{presets.map((preset) => (
				<button
					type="button"
					key={preset.label}
					aria-pressed={canvas.width === preset.width && canvas.height === preset.height}
					onClick={() => onChange({ ...canvas, width: preset.width, height: preset.height })}
				>
					<span
						className="mm-ratio-glyph"
						style={{ aspectRatio: `${preset.width}/${preset.height}` }}
					/>
					{preset.label}
				</button>
			))}
		</div>
	);
}

function MotionPanel({
	project,
	sceneId,
	onTransact,
}: {
	readonly project: Project;
	readonly sceneId: string;
	readonly onTransact: (edit: (project: Project) => Project) => void;
}) {
	const scene = project.scenes.find((candidate) => candidate.id === sceneId);
	if (!scene) return null;
	return (
		<div className="mm-panel-content mm-motion-options">
			<p className="mm-eyebrow">Between scenes</p>
			{(["cut", "crossfade", "magic-move"] as const).map((kind) => (
				<button
					type="button"
					key={kind}
					aria-pressed={(scene.transitionOut?.kind ?? "cut") === kind}
					onClick={() =>
						onTransact((current) =>
							current.replaceScene(
								scene.withTransition({
									kind,
									durationMs: kind === "cut" ? 0 : 450,
								}),
							),
						)
					}
				>
					<span className={`mm-motion-glyph mm-motion-${kind}`} aria-hidden="true" />
					{kind === "magic-move" ? "Morph" : kind[0]?.toUpperCase() + kind.slice(1)}
				</button>
			))}
		</div>
	);
}

function LookPanel({
	canvas,
	onChange,
}: {
	readonly canvas: CanvasSettings;
	readonly onChange: (canvas: CanvasSettings) => void;
}) {
	const looks = [
		{ label: "Sunset", value: "mesh:ember" },
		{ label: "Aurora", value: "mesh:aurora" },
		{ label: "Ocean", value: "mesh:ocean" },
		{ label: "Ink", value: "#121318" },
		{ label: "Paper", value: "#f3f1eb" },
	] as const;
	return (
		<div className="mm-panel-content mm-look-options">
			<p className="mm-eyebrow">Background</p>
			{looks.map((look) => (
				<button
					type="button"
					key={look.value}
					aria-label={look.label}
					aria-pressed={canvas.background === look.value}
					onClick={() => onChange({ ...canvas, background: look.value })}
				>
					<span className="mm-look-swatch" data-look={look.label.toLowerCase()} />
					{look.label}
				</button>
			))}
		</div>
	);
}

/** Scene-first editor: the canvas is the object, tools float around it, timeline owns sequence. */
export function MultimediaStudio({
	store = useProjectStore,
	runtime = defaultRuntime,
	authStore = useAuthStore,
	planStore = usePlanStore,
}: MultimediaStudioProps) {
	const state = store();
	const document = useMemo(() => serializeProjectDocument(state.value), [state.value]);
	const [loopPlayback, setLoopPlayback] = useState(false);
	const playback = useMultimediaPlayback(document, { fps: DEFAULT_FPS, loop: loopPlayback });
	const frame = playback.timeline.frameAt(playback.currentFrame);
	const reduceMotion = useReducedMotion() === true;
	const authStatus = authStore((current) => current.status);
	const {
		plan,
		catalog,
		billingAvailable,
		cadence,
		isUpgrading,
		error: billingError,
		selectCadence,
		refresh: refreshPlan,
		upgrade,
		manageBilling,
	} = planStore();
	const [mode, setMode] = useState<"edit" | "preview">("preview");
	const [activePanel, setActivePanel] = useState<"look" | "motion" | "format" | null>(null);
	const [topMenu, setTopMenu] = useState<"source" | "library" | null>(null);
	const [inspectorOpen, setInspectorOpen] = useState(false);
	const [selectedAudioCueId, setSelectedAudioCueId] = useState<string | null>(null);
	const [exportOpen, setExportOpen] = useState(false);
	const [importStatus, setImportStatus] = useState<string | null>(null);
	const [localReady, setLocalReady] = useState(runtime.localLibrary === undefined);
	const [localSaveState, setLocalSaveState] = useState<
		"disabled" | "loading" | "saved" | "saving" | "error"
	>(runtime.localLibrary ? "loading" : "disabled");
	const [unavailableLocalAssets, setUnavailableLocalAssets] = useState(0);
	const [hostedSyncState, setHostedSyncState] = useState<HostedProjectSyncState>({
		kind: "disconnected",
	});
	const [hostedProjectId, setHostedProjectId] = useState<string | null>(null);
	const [cloudSavedSignature, setCloudSavedSignature] = useState<string | null>(null);
	const [importAccept, setImportAccept] = useState("image/*,video/*,audio/*");
	const [titleDraft, setTitleDraft] = useState(document.project.title);
	const { mode: themeMode, toggle: toggleTheme } = useThemeModeStore();
	const fileInput = useRef<HTMLInputElement>(null);
	const importController = useRef<AbortController | null>(null);
	const hostedSync = useRef<BrowserHostedProjectSyncRuntime | null>(null);
	const hostedSyncUnsubscribe = useRef<(() => void) | null>(null);
	const lastSavedSignature = useRef<string | null>(null);
	const selectedSceneId = state.selectedSceneId ?? document.project.scenes[0]?.id ?? null;
	const selectedSceneStartFrame = selectedSceneId ? sceneStartFrame(document, selectedSceneId) : 0;
	const selectedScene = selectedSceneId
		? state.value.project.scenes.find((scene) => scene.id === selectedSceneId)
		: undefined;
	const selectedSceneIndex = selectedScene
		? state.value.project.scenes.findIndex((scene) => scene.id === selectedScene.id)
		: -1;
	const selectedAudioSelection = useMemo(() => {
		if (!selectedAudioCueId) return null;
		if (!state.value.project.audioCues.some((cue) => cue.id === selectedAudioCueId)) return null;
		return selectAudioCue(state.value.project, selectedAudioCueId);
	}, [selectedAudioCueId, state.value.project]);

	useEffect(() => setTitleDraft(document.project.title), [document.project.title]);
	useEffect(() => {
		if (selectedAudioCueId && !selectedAudioSelection) {
			setSelectedAudioCueId(null);
			setInspectorOpen(Boolean(selectedSceneId));
		}
	}, [selectedAudioCueId, selectedAudioSelection, selectedSceneId]);
	useEffect(() => {
		if (runtime.deploymentMode === "hosted" && authStatus.kind !== "checking") {
			void refreshPlan();
		}
	}, [authStatus.kind, refreshPlan, runtime.deploymentMode]);
	useEffect(() => {
		const createSync = runtime.createHostedSync;
		const references = runtime.hostedProjectReferences;
		const stopCurrentSync = () => {
			hostedSyncUnsubscribe.current?.();
			hostedSyncUnsubscribe.current = null;
			hostedSync.current?.stop();
			hostedSync.current = null;
		};
		if (
			runtime.deploymentMode !== "hosted" ||
			!createSync ||
			!references ||
			authStatus.kind !== "authenticated"
		) {
			stopCurrentSync();
			setHostedProjectId(null);
			setCloudSavedSignature(null);
			setHostedSyncState({ kind: "disconnected" });
			return;
		}

		const accountId = authStatus.session.account.id;
		const referencedProjectId = references.load(accountId);
		if (!referencedProjectId) {
			stopCurrentSync();
			setHostedProjectId(null);
			setCloudSavedSignature(null);
			setHostedSyncState({ kind: "disconnected" });
			return;
		}

		let active = true;
		const coordinator = createSync();
		hostedSync.current = coordinator;
		setHostedProjectId(null);
		setCloudSavedSignature(null);
		setHostedSyncState({ kind: "connecting" });
		const unsubscribe = coordinator.subscribe((next) => {
			if (active) setHostedSyncState(next);
		});
		hostedSyncUnsubscribe.current = unsubscribe;
		void coordinator
			.connect({
				session: authStatus.session,
				localDocument: state.toDocument(),
				...(referencedProjectId ? { hostedProjectId: referencedProjectId } : {}),
			})
			.then(({ project }) => {
				if (!active) return;
				references.save(accountId, project.id);
				state.loadDocument(project.document);
				setHostedProjectId(project.id);
				setCloudSavedSignature(JSON.stringify(project.document));
			})
			.catch(() => undefined);

		return () => {
			active = false;
			unsubscribe();
			if (hostedSyncUnsubscribe.current === unsubscribe) {
				hostedSyncUnsubscribe.current = null;
			}
			if (hostedSync.current === coordinator) hostedSync.current = null;
			coordinator.stop();
		};
	}, [
		authStatus,
		runtime.createHostedSync,
		runtime.deploymentMode,
		runtime.hostedProjectReferences,
		state.loadDocument,
		state.toDocument,
	]);
	useEffect(() => {
		const library = runtime.localLibrary;
		if (!library) {
			setLocalReady(true);
			setLocalSaveState("disabled");
			return;
		}
		let cancelled = false;
		const restore = async () => {
			setLocalReady(false);
			setLocalSaveState("loading");
			setUnavailableLocalAssets(0);
			try {
				const saved = await library.loadCurrent();
				if (cancelled) return;
				if (saved) {
					runtime.registry.revokeAll();
					let unavailable = 0;
					for (const asset of saved.project.assets) {
						if (cancelled) return;
						try {
							const content = await library.loadAsset({
								projectId: saved.project.id,
								assetId: asset.id,
							});
							if (!content || !runtime.sourceFactory) {
								unavailable += 1;
								continue;
							}
							const lease = runtime.sourceFactory.create(
								asset.id,
								{
									name: asset.fileName,
									mimeType: content.mimeType,
									byteSize: content.byteSize,
									opaqueHandle: content.opaqueHandle,
								},
								{},
							);
							try {
								runtime.registry.register(lease);
							} catch (error) {
								lease.release();
								throw error;
							}
						} catch {
							unavailable += 1;
						}
					}
					if (cancelled) return;
					state.loadDocument(saved);
					lastSavedSignature.current = JSON.stringify(saved);
					setUnavailableLocalAssets(unavailable);
				} else {
					const initial = state.toDocument();
					await library.saveProject(initial);
					if (cancelled) return;
					lastSavedSignature.current = JSON.stringify(initial);
				}
				setLocalSaveState("saved");
				setLocalReady(true);
			} catch {
				if (cancelled) return;
				setLocalSaveState("error");
				setLocalReady(false);
			}
		};
		void restore();
		return () => {
			cancelled = true;
		};
	}, [
		runtime.localLibrary,
		runtime.registry,
		runtime.sourceFactory,
		state.loadDocument,
		state.toDocument,
	]);

	useEffect(() => {
		const library = runtime.localLibrary;
		if (!library || !localReady) return;
		const signature = JSON.stringify(document);
		if (lastSavedSignature.current === signature) return;
		setLocalSaveState("saving");
		let cancelled = false;
		const timer = window.setTimeout(() => {
			void library
				.saveProject(document)
				.then(() => {
					if (cancelled) return;
					lastSavedSignature.current = signature;
					setLocalSaveState("saved");
				})
				.catch(() => {
					if (!cancelled) setLocalSaveState("error");
				});
		}, 350);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [document, localReady, runtime.localLibrary]);
	useEffect(
		() => () => {
			importController.current?.abort();
			hostedSyncUnsubscribe.current?.();
			hostedSyncUnsubscribe.current = null;
			hostedSync.current?.stop();
			hostedSync.current = null;
			runtime.registry.revokeAll();
		},
		[runtime],
	);
	useEffect(() => {
		if (!selectedSceneId) return;
		playback.seekFrame(selectedSceneStartFrame);
	}, [playback.seekFrame, selectedSceneId, selectedSceneStartFrame]);

	const selectScene = (sceneId: string | null) => {
		if (sceneId) setMode("edit");
		state.selectScene(sceneId);
		setSelectedAudioCueId(null);
		setInspectorOpen(Boolean(sceneId));
		setActivePanel(null);
	};

	const addLayer = (kind: "text" | "code") => {
		if (!selectedSceneId) return;
		setMode("edit");
		setTopMenu(null);
		const blockId = crypto.randomUUID();
		state.transact((project) =>
			kind === "text"
				? addTextLayer(project, selectedSceneId, { id: blockId })
				: addCodeLayer(project, selectedSceneId, { id: blockId }),
		);
		state.selectBlock(selectedSceneId, blockId);
		setSelectedAudioCueId(null);
		setActivePanel(null);
		setInspectorOpen(true);
		trigger("selection");
	};

	const openMediaPicker = (accept: string) => {
		setMode("edit");
		setTopMenu(null);
		setImportAccept(accept);
		requestAnimationFrame(() => fileInput.current?.click());
	};

	const reuseAsset = (assetId: string) => {
		if (!selectedSceneId) return;
		const asset = state.value.project.assets.find((candidate) => candidate.id === assetId);
		if (!asset) return;
		const blockId = crypto.randomUUID();
		const cueId = crypto.randomUUID();
		state.transact((project) =>
			placeRegisteredMediaAsset(project, selectedSceneId, assetId, { blockId, cueId }),
		);
		setMode("edit");
		setTopMenu(null);
		setActivePanel(null);
		setInspectorOpen(true);
		if (asset.kind === "audio") {
			state.selectBlock(selectedSceneId, null);
			setSelectedAudioCueId(cueId);
		} else {
			state.selectBlock(selectedSceneId, blockId);
			setSelectedAudioCueId(null);
		}
		trigger("selection");
	};

	const importFile = async (file: File) => {
		if (!selectedSceneId) return;
		setMode("edit");
		importController.current?.abort();
		const controller = new AbortController();
		importController.current = controller;
		setImportStatus(`Reading ${file.name}…`);
		let pendingAssetId: string | null = null;
		try {
			const result = await runtime.importer.importFile(file, { signal: controller.signal });
			pendingAssetId = result.asset.id;
			if (runtime.localLibrary) {
				await runtime.localLibrary.saveAsset({
					projectId: document.project.id,
					assetId: result.asset.id,
					mimeType: result.asset.metadata.mimeType,
					byteSize: result.asset.metadata.byteSize,
					opaqueHandle: file,
				});
			}
			const blockId = crypto.randomUUID();
			const cueId = crypto.randomUUID();
			state.transact((project) =>
				addMediaAsset(project, selectedSceneId, result.asset, { blockId, cueId }),
			);
			pendingAssetId = null;
			if (result.asset.kind === "audio") {
				state.selectBlock(selectedSceneId, null);
				setSelectedAudioCueId(cueId);
				setInspectorOpen(true);
			} else {
				state.selectBlock(selectedSceneId, blockId);
				setSelectedAudioCueId(null);
				setInspectorOpen(true);
			}
			setImportStatus(`${result.asset.metadata.fileName} added`);
			trigger("selection");
		} catch (error) {
			if (pendingAssetId) runtime.registry.revoke(pendingAssetId);
			if (error instanceof Error && error.name === "AbortError") return;
			setImportStatus(error instanceof Error ? error.message : "This media could not be added.");
		} finally {
			if (importController.current === controller) importController.current = null;
		}
	};

	const canDeleteSelectedScene = selectedSceneId
		? document.project.audioCues.length > 0 ||
			document.project.scenes.some(
				(scene) => scene.id !== selectedSceneId && scene.blocks.length > 0,
			)
		: false;
	const aspectLabel = (() => {
		const { width, height } = document.project.canvas;
		const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b));
		const common = divisor(width, height);
		return `${width / common}:${height / common}`;
	})();
	const cloudProjectState = (() => {
		if (hostedSyncState.kind === "connecting" || hostedSyncState.kind === "saving") {
			return "connecting" as const;
		}
		if (
			hostedSyncState.kind === "conflict" ||
			hostedSyncState.kind === "missing" ||
			hostedSyncState.kind === "error"
		) {
			return "error" as const;
		}
		if (hostedProjectId !== document.project.id || cloudSavedSignature === null) {
			return "device" as const;
		}
		return cloudSavedSignature === JSON.stringify(document)
			? ("synced" as const)
			: ("unsaved" as const);
	})();
	const saveLabel = (() => {
		if (importStatus) return importStatus;
		if (runtime.deploymentMode === "hosted") {
			if (authStatus.kind === "checking") return "Checking account…";
			if (authStatus.kind !== "authenticated") return "Sign in to save";
			if (cloudProjectState === "connecting") return "Saving…";
			if (cloudProjectState === "error") return "Cloud copy needs attention";
			if (cloudProjectState === "synced") return "Saved to cloud";
			if (cloudProjectState === "unsaved") return "Unsaved cloud changes";
			return "On this device";
		}
		if (localSaveState === "loading") return "Opening…";
		if (localSaveState === "saving") return "Saving…";
		if (localSaveState === "error") return "Not saved";
		if (unavailableLocalAssets > 0) {
			return `${unavailableLocalAssets} media unavailable`;
		}
		if (localSaveState === "saved") return "Saved on device";
		return "Ready";
	})();
	const saveToCloud = async () => {
		if (
			runtime.deploymentMode !== "hosted" ||
			authStatus.kind !== "authenticated" ||
			!runtime.createHostedSync ||
			!runtime.hostedProjectReferences
		) {
			return;
		}

		const localDocument = state.toDocument();
		const references = runtime.hostedProjectReferences;
		const accountId = authStatus.session.account.id;
		const existing = hostedSync.current;
		if (existing && hostedProjectId) {
			try {
				existing.scheduleSave(localDocument);
				const result = await existing.flush();
				if (result.outcome === "saved" || result.outcome === "noop") {
					setHostedProjectId(result.project.id);
					setCloudSavedSignature(JSON.stringify(result.project.document));
				}
			} catch (error) {
				const current = existing.getState();
				setHostedSyncState(
					current.kind === "error"
						? current
						: {
								kind: "error",
								error:
									error instanceof HostedProjectSyncError
										? error
										: new HostedProjectSyncError("service-unavailable"),
							},
				);
			}
			return;
		}

		const coordinator = runtime.createHostedSync();
		hostedSync.current?.stop();
		hostedSyncUnsubscribe.current?.();
		hostedSync.current = coordinator;
		setHostedSyncState({ kind: "connecting" });
		const unsubscribe = coordinator.subscribe(setHostedSyncState);
		hostedSyncUnsubscribe.current = unsubscribe;
		try {
			const connected = await coordinator.connect({
				session: authStatus.session,
				localDocument: createHostedProjectSeed(localDocument),
			});
			const mappings = [];
			for (const asset of localDocument.project.assets) {
				const localAsset = await runtime.localLibrary?.loadAsset({
					projectId: localDocument.project.id,
					assetId: asset.id,
				});
				if (!localAsset || !(localAsset.opaqueHandle instanceof Blob)) {
					throw new HostedProjectSyncError("invalid-document");
				}
				const file = new File([localAsset.opaqueHandle], asset.fileName, {
					type: asset.mimeType,
				});
				const imported = await coordinator.importFile(file);
				if (imported.outcome !== "imported") {
					throw new HostedProjectSyncError(
						imported.outcome === "conflict" ? "project-conflict" : "project-not-found",
					);
				}
				const hostedAsset = {
					id: imported.uploaded.asset.id,
					...imported.uploaded.asset.metadata,
				};
				mappings.push({ localAssetId: asset.id, hostedAsset });
				await runtime.localLibrary?.saveAsset({
					projectId: connected.project.id,
					assetId: hostedAsset.id,
					mimeType: hostedAsset.mimeType,
					byteSize: hostedAsset.byteSize,
					opaqueHandle: localAsset.opaqueHandle,
				});
			}
			const hostedDocument = remapHostedProjectAssets(localDocument, {
				projectId: connected.project.id,
				assets: mappings,
			});
			coordinator.scheduleSave(hostedDocument);
			const result = await coordinator.flush();
			if (result.outcome !== "saved" && result.outcome !== "noop") {
				throw new HostedProjectSyncError(
					result.outcome === "conflict" ? "project-conflict" : "project-not-found",
				);
			}
			references.save(accountId, result.project.id);
			state.loadDocument(result.project.document);
			setHostedProjectId(result.project.id);
			setCloudSavedSignature(JSON.stringify(result.project.document));
			setHostedSyncState({
				kind: "ready",
				projectId: result.project.id,
				revision: result.project.revision,
			});
		} catch (error) {
			const current = coordinator.getState();
			setHostedSyncState(
				current.kind === "error"
					? current
					: {
							kind: "error",
							error:
								error instanceof HostedProjectSyncError
									? error
									: new HostedProjectSyncError("service-unavailable"),
						},
			);
		}
	};
	const canonicalHostedRevision =
		hostedSyncState.kind === "ready" &&
		hostedSyncState.projectId === document.project.id &&
		cloudProjectState === "synced"
			? hostedSyncState.revision
			: null;

	return (
		<div className="studio-root studio-camera-root mm-studio" data-mode={mode}>
			<a href="#mm-stage" className="mm-skip-link">
				Skip to canvas
			</a>
			<header className="mm-top">
				<h1 className="sr-only">{document.project.title} — Typelapse studio</h1>
				<div className="mm-top-left">
					<div className="mm-project-island">
						<Link to="/" className="mm-mark" aria-label="Back to Typelapse home">
							<Logomark />
						</Link>
						<input
							className="mm-project-title"
							aria-label="Project title"
							value={titleDraft}
							onChange={(event) => setTitleDraft(event.currentTarget.value)}
							onBlur={() => {
								const title = titleDraft.trim();
								if (title && title !== document.project.title)
									state.transact((project) => project.rename(title));
								if (!title) setTitleDraft(document.project.title);
							}}
						/>
						<span>
							{document.project.scenes.length}{" "}
							{document.project.scenes.length === 1 ? "scene" : "scenes"}
						</span>
					</div>
					<button
						type="button"
						className="mm-add-media"
						aria-haspopup="menu"
						aria-expanded={topMenu === "source"}
						onClick={() => setTopMenu((current) => (current === "source" ? null : "source"))}
					>
						<Add size={17} aria-hidden="true" />
						Add source
					</button>
					<button
						type="button"
						className="mm-add-media mm-library-button"
						aria-haspopup="dialog"
						aria-expanded={topMenu === "library"}
						onClick={() => setTopMenu((current) => (current === "library" ? null : "library"))}
					>
						<HardDrive size={16} aria-hidden="true" />
						Library
					</button>
					<AnimatePresence initial={false}>
						{topMenu === "source" ? (
							<motion.div
								className="mm-top-popover mm-source-popover"
								role="menu"
								aria-label="Add source"
								initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.985 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
								transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
							>
								<button
									type="button"
									role="menuitem"
									aria-label="Text"
									onClick={() => addLayer("text")}
								>
									<TextInputFocus size={17} aria-hidden="true" />
									<span>
										<strong>Text</strong>
										<small>Titles, captions and callouts</small>
									</span>
								</button>
								<button
									type="button"
									role="menuitem"
									aria-label="Code"
									onClick={() => addLayer("code")}
								>
									<Code size={17} aria-hidden="true" />
									<span>
										<strong>Code</strong>
										<small>Highlighted, editable snippets</small>
									</span>
								</button>
								<button
									type="button"
									role="menuitem"
									aria-label="Image or video"
									onClick={() => openMediaPicker("image/*,video/*")}
								>
									<Image size={17} aria-hidden="true" />
									<span>
										<strong>Image or video</strong>
										<small>Use files from this device</small>
									</span>
								</button>
								<button
									type="button"
									role="menuitem"
									aria-label="Audio"
									onClick={() => openMediaPicker("audio/*")}
								>
									<Music size={17} aria-hidden="true" />
									<span>
										<strong>Audio</strong>
										<small>Music, voice and sound effects</small>
									</span>
								</button>
							</motion.div>
						) : topMenu === "library" ? (
							<motion.dialog
								className="mm-top-popover mm-library-popover"
								open
								aria-label="Library"
								initial={reduceMotion ? false : { opacity: 0, y: -5, scale: 0.985 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
								transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
							>
								<header>
									<strong>Library</strong>
									<span>{document.project.assets.length}</span>
								</header>
								{document.project.assets.length > 0 ? (
									<div className="mm-library-list">
										{document.project.assets.map((asset) => (
											<button type="button" key={asset.id} onClick={() => reuseAsset(asset.id)}>
												<span>{asset.fileName}</span>
												<small>{asset.kind}</small>
											</button>
										))}
									</div>
								) : (
									<p>No media yet. Add a file and it will stay available here.</p>
								)}
								<button
									type="button"
									className="mm-library-upload"
									onClick={() => openMediaPicker("image/*,video/*,audio/*")}
								>
									<Add size={15} aria-hidden="true" /> Add media
								</button>
							</motion.dialog>
						) : null}
					</AnimatePresence>
				</div>

				<fieldset className="mm-mode-island">
					<legend className="sr-only">Studio mode</legend>
					{(["preview", "edit"] as const).map((value) => (
						<button
							type="button"
							key={value}
							aria-pressed={mode === value}
							onClick={() => {
								setMode(value);
								if (value === "preview") {
									setInspectorOpen(false);
									setActivePanel(null);
								}
							}}
						>
							{value[0]?.toUpperCase()}
							{value.slice(1)}
						</button>
					))}
				</fieldset>

				<div className="mm-top-right">
					<Link to="/app" className="mm-showcase-link">
						Code studio
					</Link>
					<StudioTooltipProvider>
						<div className="mm-utility-island">
							<StudioAccountControl
								store={authStore}
								cloudProjectState={cloudProjectState}
								onSaveToCloud={() => void saveToCloud()}
								billing={{
									planLabel: plan.label,
									paid: plan.isPaid,
									available: billingAvailable,
									catalog,
									cadence,
									busy: isUpgrading,
									error: billingError,
									onCadence: selectCadence,
									onUpgrade: () => void upgrade(),
									onManageBilling: () => void manageBilling(),
								}}
							/>
							<StudioTooltip
								content={themeMode === "dark" ? "Use light appearance" : "Use dark appearance"}
								side="bottom"
							>
								<button
									type="button"
									className="mm-icon-button"
									aria-label={themeMode === "dark" ? "Light mode" : "Dark mode"}
									onClick={toggleTheme}
								>
									{themeMode === "dark" ? (
										<Sun size={16} aria-hidden="true" />
									) : (
										<Moon size={16} aria-hidden="true" />
									)}
								</button>
							</StudioTooltip>
							<span className="mm-save-state" aria-live="polite">
								{saveLabel}
							</span>
							<StudioTooltip content="Undo last change" side="bottom">
								<button
									type="button"
									className="mm-icon-button"
									aria-label="Undo"
									disabled={!state.canUndo}
									onClick={state.undo}
								>
									<Undo size={17} aria-hidden="true" />
								</button>
							</StudioTooltip>
							<StudioTooltip content="Redo last change" side="bottom">
								<button
									type="button"
									className="mm-icon-button"
									aria-label="Redo"
									disabled={!state.canRedo}
									onClick={state.redo}
								>
									<Redo size={17} aria-hidden="true" />
								</button>
							</StudioTooltip>
						</div>
					</StudioTooltipProvider>
				</div>
			</header>

			<main className="mm-workspace">
				<section id="mm-stage" className="mm-stage-area" aria-label="Canvas">
					<MultimediaStage
						document={document}
						frame={frame}
						playing={playback.playing}
						resolveAsset={(assetId) => runtime.registry.resolve(assetId)}
						selectedBlockId={mode === "edit" ? state.selectedBlockId : null}
						onSelectLayer={
							mode === "edit"
								? (sceneId, blockId) => {
										state.selectBlock(sceneId, blockId);
										setSelectedAudioCueId(null);
										setActivePanel(null);
										setInspectorOpen(true);
									}
								: undefined
						}
						onClearSelection={() => {
							if (selectedSceneId) state.selectBlock(selectedSceneId, null);
							setSelectedAudioCueId(null);
							setInspectorOpen(Boolean(selectedSceneId));
						}}
					/>
				</section>

				{mode === "edit" && inspectorOpen && selectedAudioSelection ? (
					<MultimediaAudioInspector
						className="mm-floating-inspector"
						cue={selectedAudioSelection.cue}
						asset={selectedAudioSelection.asset}
						timelineDurationMs={state.value.project.durationMs}
						canDelete={
							state.value.project.audioCues.length > 1 ||
							state.value.project.scenes.some((scene) => scene.blocks.length > 0)
						}
						onPatch={(patch) =>
							state.transact((project) =>
								updateAudioCue(project, selectedAudioSelection.cue.id, patch),
							)
						}
						onDelete={() => {
							state.transact((project) => deleteAudioCue(project, selectedAudioSelection.cue.id));
							setSelectedAudioCueId(null);
							setInspectorOpen(Boolean(selectedSceneId));
							trigger("selection");
						}}
						onClose={() => {
							setSelectedAudioCueId(null);
							setInspectorOpen(Boolean(selectedSceneId));
						}}
					/>
				) : mode === "edit" && inspectorOpen && selectedSceneId && state.selectedBlockId ? (
					<MultimediaInspector
						project={state.value.project}
						sceneId={selectedSceneId}
						blockId={state.selectedBlockId}
						onTransact={state.transact}
						onClose={() => setInspectorOpen(false)}
					/>
				) : mode === "edit" && inspectorOpen && selectedScene && selectedSceneIndex >= 0 ? (
					<MultimediaSceneInspector
						className="mm-floating-inspector"
						scene={selectedScene}
						sceneIndex={selectedSceneIndex}
						sceneCount={state.value.project.scenes.length}
						onDurationChange={(durationMs) =>
							state.transact((project) =>
								updateSceneDuration(project, selectedScene.id, durationMs),
							)
						}
						onTransitionChange={(transition) =>
							state.transact((project) =>
								updateSceneTransition(project, selectedScene.id, transition),
							)
						}
						onMovePrevious={() =>
							state.transact((project) => moveScenePrevious(project, selectedScene.id))
						}
						onMoveNext={() => state.transact((project) => moveSceneNext(project, selectedScene.id))}
						onClose={() => setInspectorOpen(false)}
					/>
				) : null}

				<div className="mm-dock">
					<AnimatePresence initial={false} mode="wait">
						{activePanel ? (
							<motion.section
								key={activePanel}
								className="mm-context-panel"
								aria-label={
									activePanel === "format"
										? "Canvas format"
										: activePanel === "look"
											? "Project look"
											: "Scene motion"
								}
								initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
								transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
							>
								{activePanel === "format" ? (
									<FormatPanel
										canvas={state.value.project.canvas}
										onChange={(canvas) => state.transact((project) => project.updateCanvas(canvas))}
									/>
								) : activePanel === "look" ? (
									<LookPanel
										canvas={state.value.project.canvas}
										onChange={(canvas) => state.transact((project) => project.updateCanvas(canvas))}
									/>
								) : selectedSceneId ? (
									<MotionPanel
										project={state.value.project}
										sceneId={selectedSceneId}
										onTransact={state.transact}
									/>
								) : null}
							</motion.section>
						) : null}
					</AnimatePresence>

					<div className="mm-dock-row">
						<MultimediaToolbar
							onOpenScene={() => {
								if (!selectedSceneId) return;
								setMode("edit");
								state.selectBlock(selectedSceneId, null);
								setSelectedAudioCueId(null);
								setActivePanel(null);
								setInspectorOpen(true);
							}}
							onAddAudio={() => openMediaPicker("audio/*")}
							onOpenLook={() => {
								setMode("edit");
								setActivePanel((current) => (current === "look" ? null : "look"));
							}}
							onOpenMotion={() => {
								setMode("edit");
								setActivePanel((current) => (current === "motion" ? null : "motion"));
							}}
							onOpenFormat={() => {
								setMode("edit");
								setActivePanel((current) => (current === "format" ? null : "format"));
							}}
							onToggleLoop={() => setLoopPlayback((current) => !current)}
							onExport={() => setExportOpen(true)}
							activePanel={activePanel}
							loop={loopPlayback}
							aspectLabel={aspectLabel}
							exportDisabled={false}
						/>
					</div>
				</div>
			</main>

			<div className="mm-timeline-shell">
				<MultimediaTimeline
					document={document}
					playheadProgress={
						playback.timeline.totalFrames <= 1
							? 0
							: playback.currentFrame / (playback.timeline.totalFrames - 1)
					}
					onSeekProgress={playback.seekProgress}
					selected={selectedSceneId}
					onSelect={selectScene}
					onMoveScene={(sceneId, targetIndex) =>
						state.transact((project) => moveSceneToIndex(project, sceneId, targetIndex))
					}
					selectedAudioCueId={selectedAudioCueId}
					onSelectAudioCue={(cueId) => {
						setSelectedAudioCueId(cueId);
						if (selectedSceneId) state.selectBlock(selectedSceneId, null);
						setActivePanel(null);
						setInspectorOpen(true);
						trigger("selection");
					}}
					onAdd={() => {
						const sceneId = crypto.randomUUID();
						state.transact((project) => addEmptyScene(project, { id: sceneId }));
						selectScene(sceneId);
					}}
					onDelete={(sceneId) => {
						if (!canDeleteSelectedScene) return;
						const index = document.project.scenes.findIndex((scene) => scene.id === sceneId);
						const fallback =
							document.project.scenes[index + 1] ?? document.project.scenes[index - 1];
						state.transact((project) => project.removeScene(sceneId));
						selectScene(fallback?.id ?? null);
					}}
					onUndo={state.undo}
					onRedo={state.redo}
					canUndo={state.canUndo}
					canRedo={state.canRedo}
					playing={playback.playing}
					onTogglePlayback={playback.toggle}
					onReturnToSelected={() =>
						selectedSceneId && playback.seekFrame(sceneStartFrame(document, selectedSceneId))
					}
					canDelete={canDeleteSelectedScene}
					disabled={false}
					renderSceneThumbnail={(scene) => (
						<MultimediaSceneThumbnail
							document={document}
							sceneId={scene.id}
							resolveAsset={(assetId) => runtime.registry.resolve(assetId)}
						/>
					)}
				/>
			</div>

			<input
				ref={fileInput}
				type="file"
				className="mm-file-input"
				accept={importAccept}
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file) void importFile(file);
				}}
			/>
			<MultimediaExportPanel
				open={exportOpen}
				onClose={() => setExportOpen(false)}
				document={document}
				revision={
					runtime.deploymentMode === "hosted"
						? (canonicalHostedRevision ?? 0)
						: (runtime.projectRevision ?? 1)
				}
				deploymentMode={runtime.deploymentMode}
				{...(runtime.hostedRender
					? {
							cloud: {
								client: runtime.hostedRender,
								available:
									authStatus.kind === "authenticated" &&
									plan.capabilities.allowsCloudExport &&
									canonicalHostedRevision !== null,
								reason:
									authStatus.kind !== "authenticated"
										? "Sign in to use the hosted renderer."
										: !plan.capabilities.allowsCloudExport
											? "Creator plan required for cloud video export."
											: canonicalHostedRevision === null
												? "Save this project to cloud before rendering."
												: undefined,
								upgrade: {
									available:
										authStatus.kind === "authenticated" && billingAvailable && !plan.isPaid,
									busy: isUpgrading,
									error: billingError,
									onRequest: () => void upgrade(),
								},
							},
						}
					: {})}
				{...(runtime.localRender
					? {
							local: {
								client: runtime.localRender,
								available:
									runtime.deploymentMode === "local" && localReady && localSaveState !== "error",
								reason: "The local media library must be ready before video rendering.",
							},
						}
					: {})}
			/>
		</div>
	);
}
