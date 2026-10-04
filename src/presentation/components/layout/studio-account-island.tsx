import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { BrowserHostedProjectReferenceStore } from "@/infrastructure/project/browser-hosted-project-reference";
import { createBrowserHostedProjectSyncRuntime } from "@/infrastructure/project/browser-hosted-project-sync.runtime";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import {
	type StudioCloudRuntime,
	useStudioCloudProject,
} from "@/presentation/hooks/use-studio-cloud-project";
import { useAuthStore } from "@/presentation/stores/auth.store";
import { useHostedRenderJobsStore } from "@/presentation/stores/hosted-render-jobs.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
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
	readonly compositionStore?: typeof useStudioCompositionStore;
	/** `undefined` resolves the browser runtime; `null` disables cloud save. */
	readonly cloudRuntime?: StudioCloudRuntime | null;
}

/**
 * The Studio's account island: sign up, sign in, cloud save and billing. It
 * exists only where accounts do; the local profile renders nothing at all.
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
	compositionStore = useStudioCompositionStore,
	cloudRuntime,
}: StudioAccountIslandProps) {
	const authStatus = authStore((state) => state.status);
	const value = compositionStore((state) => state.value);
	const liveCode = useSnippetStore((state) => state.snippet.code);
	// The document the Studio saves, not the raw composition: the cloud copy is
	// compared with what a reload rebuilds, render settings and live code included.
	const document = useMemo(() => studioDocumentOf(value, liveCode), [value, liveCode]);
	const runtime = cloudRuntime === undefined ? defaultCloudRuntime() : cloudRuntime;
	const { cloudProjectState, saveToCloud, saveRevision } = useStudioCloudProject({
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
		</div>
	);
}
