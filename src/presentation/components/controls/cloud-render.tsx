import { type CloudAccount, type CloudGate, cloudGate } from "@/application/billing/cloud-gate";
import { type AuthStoreState, useAuthStore } from "@/presentation/stores/auth.store";
import { type ExportTarget, useExportStore } from "@/presentation/stores/export.store";
import {
	type CloudRenderPhase,
	isCloudRenderBusy,
	isHostedBuild,
	useHostedRenderJobsStore,
} from "@/presentation/stores/hosted-render-jobs.store";
import {
	type CloudSurface,
	useHostedRenderSheetStore,
} from "@/presentation/stores/hosted-render-sheet.store";
import { usePlanStore } from "@/presentation/stores/plan.store";
import { useCallback, useEffect } from "react";

/**
 * A hosted build with a signed-in account: the only visitor who makes a cloud
 * call. A local build and a signed-out visitor never do, whatever Where lists.
 */
export function useCloudRenderAvailable(): boolean {
	const signedIn = useAuthStore((state) => state.status.kind === "authenticated");
	return isHostedBuild() && signedIn;
}

function accountOf(kind: AuthStoreState["status"]["kind"]): CloudAccount {
	switch (kind) {
		case "authenticated":
			return "signed-in";
		case "anonymous":
			return "signed-out";
		case "checking":
			return "checking";
		default:
			// Local, or a hosted server whose accounts are off or not answering: no way in.
			return "none";
	}
}

/**
 * What Cloud under Where is for this visitor (ux-waves D3): absent in a local
 * build, and in a hosted one listed for everyone and gated only at the press.
 */
export function useCloudGate(): CloudGate {
	const kind = useAuthStore((state) => state.status.kind);
	const plan = usePlanStore((state) => state.plan);
	const planKnown = usePlanStore((state) => state.accountPlanKnown);
	return cloudGate({ hosted: isHostedBuild(), account: accountOf(kind), plan, planKnown });
}

/** Whether a press on Cloud opens the hosted render sheet rather than choosing it. */
export function isGated(gate: CloudGate): boolean {
	return gate === "sign-in" || gate === "pending" || gate === "upgrade";
}

/**
 * What a press on a Where option does. Cloud, for a visitor whose plan does not
 * render on it yet, opens the sheet that says what it adds and the one step to
 * it; every other press chooses, as before.
 */
export function useWhereSelect(surface: CloudSurface): (target: ExportTarget) => void {
	const gate = useCloudGate();
	const setTarget = useExportStore((state) => state.setTarget);
	const show = useHostedRenderSheetStore((state) => state.show);
	return useCallback(
		(target: ExportTarget) => {
			if (target === "cloud" && isGated(gate)) {
				show(surface, focusedElement());
				return;
			}
			setTarget(target);
		},
		[gate, setTarget, show, surface],
	);
}

/** The element a sheet gives focus back to; Safari does not focus a clicked button. */
export function focusedElement(): HTMLElement | null {
	const active = document.activeElement;
	return active instanceof HTMLElement && active !== document.body ? active : null;
}

export const CLOUD_TARGET_TITLE =
	"Saves this project to your private cloud and renders it on Typelapse servers.";

/**
 * The Where option for Cloud, or null where it does not exist (a local build).
 * Chosen, it reads the allowance, so the account sees what its plan includes
 * before it presses Render; signing out puts Where back on this device.
 */
/** What Cloud's tooltip says, which is what a press on it does in this state. */
export function cloudTargetTitle(gate: CloudGate): string {
	switch (gate) {
		case "sign-in":
			return "Renders on Typelapse servers, with captions and audio. Sign in to start.";
		case "upgrade":
			return "Hosted renders come with Creator.";
		case "pending":
			return "Checking your plan.";
		default:
			return CLOUD_TARGET_TITLE;
	}
}

export function useCloudTarget(): {
	value: "cloud";
	label: string;
	title: string;
	haspopup?: "dialog";
} | null {
	const gate = useCloudGate();
	const available = useCloudRenderAvailable();
	const target = useExportStore((state) => state.target);
	const setTarget = useExportStore((state) => state.setTarget);
	const refreshAllowance = useHostedRenderJobsStore((state) => state.refreshAllowance);

	useEffect(() => {
		if (target !== "cloud") return;
		if (!available) {
			setTarget("device");
			return;
		}
		void refreshAllowance();
	}, [available, target, setTarget, refreshAllowance]);

	if (gate === "absent") return null;
	// Gated, the press opens a dialog and chooses nothing: it is announced as such,
	// not as a toggle that stays off.
	return {
		value: "cloud",
		label: "Cloud",
		title: cloudTargetTitle(gate),
		...(isGated(gate) ? { haspopup: "dialog" as const } : {}),
	};
}

const BUSY_LABELS: Partial<Record<CloudRenderPhase["kind"], string>> = {
	saving: "Saving…",
	submitting: "Sending…",
	queued: "Rendering…",
	running: "Rendering…",
	reconnecting: "Rendering…",
};

/**
 * What the Render button says while a cloud render is on its way. It waits for
 * that render instead of queueing a second one, and only while Cloud is chosen:
 * this device can still render in the meantime.
 */
export function useCloudRenderCta(target: ExportTarget): { busy: boolean; label: string | null } {
	const phase = useHostedRenderJobsStore((state) => state.phase);
	if (target !== "cloud" || !isCloudRenderBusy(phase)) {
		return { busy: false, label: null };
	}
	return { busy: true, label: BUSY_LABELS[phase.kind] ?? "Rendering…" };
}

/** Every word the Render button can say while busy, the device render's included. */
export const RENDER_BUSY_LABELS: readonly string[] = [...new Set(Object.values(BUSY_LABELS))];

export interface CloudStatusAction {
	readonly label: string;
	readonly run: () => void;
}

export interface CloudStatusView {
	readonly key: string;
	readonly kind: "progress" | "note" | "done" | "problem";
	readonly text: string;
	readonly action?: CloudStatusAction;
	/** The public page's controls, after the main action. */
	readonly extra?: readonly CloudStatusAction[];
	readonly dismiss?: () => void;
}

const PROGRESS_TEXT: Partial<Record<CloudRenderPhase["kind"], string>> = {
	saving: "Saving the project to your cloud…",
	submitting: "Sending the render to Typelapse Cloud…",
	queued: "Waiting for a render slot on Typelapse Cloud…",
	running: "Rendering on Typelapse Cloud…",
	reconnecting: "Reconnecting to Typelapse Cloud…",
};

function megabytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The floating status line's cloud row. A job left running when the page was
 * closed is asked about again on the next load: the id is all the browser kept.
 */
export function useCloudStatusView(): CloudStatusView | null {
	const available = useCloudRenderAvailable();
	const target = useExportStore((state) => state.target);
	const phase = useHostedRenderJobsStore((state) => state.phase);
	const allowance = useHostedRenderJobsStore((state) => state.allowance);
	const resume = useHostedRenderJobsStore((state) => state.resume);
	const download = useHostedRenderJobsStore((state) => state.download);
	const copyPublicLink = useHostedRenderJobsStore((state) => state.copyPublicLink);
	const makePrivate = useHostedRenderJobsStore((state) => state.makePrivate);
	const dismiss = useHostedRenderJobsStore((state) => state.dismiss);
	const billingAvailable = usePlanStore((state) => state.billingAvailable);
	const upgrade = usePlanStore((state) => state.upgrade);

	useEffect(() => {
		if (available) resume();
	}, [available, resume]);

	if (!available) return null;

	const upgradeAction = (upgradeTo: string | null) =>
		upgradeTo === "creator" && billingAvailable
			? { label: "Upgrade to Creator", run: () => void upgrade() }
			: undefined;

	switch (phase.kind) {
		case "idle":
			return target === "cloud" && allowance
				? { key: "cloud-note", kind: "note", text: allowance.sentence }
				: null;
		case "succeeded": {
			// Same shape as this device's receipt: what, how big, then anything to add.
			const notice = phase.notice ? ` · ${phase.notice}` : "";
			// The page exists only where the server lets this account switch it (Creator).
			const extra: CloudStatusAction[] = !phase.page
				? []
				: phase.page.public
					? [
							{ label: "Copy link", run: () => void copyPublicLink() },
							{ label: "Make private", run: () => void makePrivate() },
						]
					: [{ label: "Copy public link", run: () => void copyPublicLink() }];
			return {
				key: "cloud-done",
				kind: "done",
				text: `Rendered on Typelapse Cloud · ${megabytes(phase.download.byteSize)}${notice}`,
				action: { label: "Download", run: () => void download() },
				...(extra.length > 0 ? { extra } : {}),
				dismiss,
			};
		}
		case "expired":
		case "failed": {
			const action = upgradeAction(phase.upgradeTo);
			return {
				key: `cloud-${phase.kind}`,
				kind: "problem",
				text: phase.message,
				...(action ? { action } : {}),
				dismiss,
			};
		}
		default:
			return {
				key: "cloud-progress",
				kind: "progress",
				text: PROGRESS_TEXT[phase.kind] ?? "Rendering on Typelapse Cloud…",
			};
	}
}
