import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { BrowserHostedProjectReferenceStore } from "@/infrastructure/project/browser-hosted-project-reference";
import { createBrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import {
	type StudioCloudRuntime,
	useStudioCloudProject,
} from "@/presentation/hooks/use-studio-cloud-project";
import { useApiKeyStore } from "@/presentation/stores/api-key.store";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useCloudProjectsStore } from "@/presentation/stores/cloud-projects.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { liveCodeOf, useSnippetStore } from "@/presentation/stores/snippet.store";
import {
	studioDocumentOf,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { studioLocalLibrary } from "@/presentation/studio-media-runtime";
import { useEffect, useMemo } from "react";
import "./studio-account-island.css";

let browserCloudRuntime: StudioCloudRuntime | null = null;

/**
 * Hosted builds only. The cloud keeps its own source registry: signed cloud
 * URLs never replace the local media the Studio is previewing.
 */
function defaultCloudRuntime(): StudioCloudRuntime | null {
	if (import.meta.env.VITE_TYPELAPSE_DEPLOYMENT_MODE !== "hosted") return null;
	browserCloudRuntime ??= {
		createHostedSync: () =>
			createBrowserHostedProjectSyncRuntime({ registry: createSceneAssetSourceRegistry() }),
		references: new BrowserHostedProjectReferenceStore(),
		localLibrary: studioLocalLibrary,
	};
	return browserCloudRuntime;
}

export interface StudioAccountIslandProps {
	readonly authStore?: typeof useAuthStore;
	readonly planStore?: typeof usePlanStore;
	readonly apiKeyStore?: typeof useApiKeyStore;
	readonly cloudProjectsStore?: typeof useCloudProjectsStore;
	readonly compositionStore?: typeof useStudioCompositionStore;
	/** `undefined` resolves the browser runtime; `null` disables cloud save. */
	readonly cloudRuntime?: StudioCloudRuntime | null;
}

/**
 * The Studio's account island: sign up, sign in, cloud save, billing and API
 * keys. It exists only where accounts do; the local profile renders nothing.
 */
export function StudioAccountIsland({
	authStore = useAuthStore,
	...rest
}: StudioAccountIslandProps) {
	const kind = authStore((state) => state.status.kind);
	if (kind === "local-offline" || kind === "hosted-unconfigured") return null;
	return <HostedAccountIsland authStore={authStore} {...rest} />;
}

function HostedAccountIsland({
	authStore = useAuthStore,
	planStore = usePlanStore,
	apiKeyStore = useApiKeyStore,
	cloudProjectsStore = useCloudProjectsStore,
	compositionStore = useStudioCompositionStore,
	cloudRuntime,
}: StudioAccountIslandProps) {
	const authStatus = authStore((state) => state.status);
	const value = compositionStore((state) => state.value);
	const liveCode = useSnippetStore(liveCodeOf);
	// The document the Studio saves, not the raw composition: the cloud copy is
	// compared with what a reload rebuilds, render settings and live code included.
	const document = useMemo(() => studioDocumentOf(value, liveCode), [value, liveCode]);
	const runtime = cloudRuntime === undefined ? defaultCloudRuntime() : cloudRuntime;
	const { cloudProjectState, saveToCloud, saveRevision, cloudProjectId, forgetCloudProject } =
		useStudioCloudProject({
			authStatus,
			document,
			runtime,
		});
	// A cloud render renders the canonical revision, so it saves through this
	// same cloud copy rather than a second one of its own.
	useEffect(
		() =>
			runtime ? useHostedRenderJobsStore.getState().connectCloudSave(saveRevision) : undefined,
		[runtime, saveRevision],
	);
	const {
		plan,
		catalog,
		billingAvailable,
		allowance,
		notice,
		cadence,
		isUpgrading,
		error: billingError,
		selectCadence,
		refresh: refreshPlan,
		upgrade,
		manageBilling,
	} = planStore();

	useEffect(() => {
		if (authStatus.kind !== "checking") {
			void refreshPlan({ signedIn: authStatus.kind === "authenticated" });
		}
	}, [authStatus.kind, refreshPlan]);

	return (
		<div className="sc-chip sc-account-island">
			<StudioAccountControl
				store={authStore}
				cloudProjectState={cloudProjectState}
				{...(runtime ? { onSaveToCloud: saveToCloud } : {})}
				allowance={allowance}
				apiKeys={{ store: apiKeyStore }}
				cloudProjects={{
					store: cloudProjectsStore,
					openId: cloudProjectId,
					onDeleted: (id) => {
						forgetCloudProject(id);
						// Its renders went with it: a finished one on screen has nothing to offer.
						void useHostedRenderJobsStore.getState().recheck();
						// The allowance says how many projects the account keeps.
						void refreshPlan({ signedIn: true });
					},
				}}
				billing={{
					planLabel: plan.label,
					paid: plan.isPaid,
					available: billingAvailable,
					catalog,
					cadence,
					busy: isUpgrading,
					error: billingError,
					notice,
					onCadence: selectCadence,
					onUpgrade: () => void upgrade(),
					onManageBilling: () => void manageBilling(),
				}}
			/>
		</div>
	);
}
