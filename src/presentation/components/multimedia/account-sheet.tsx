import type { PlanAllowance } from "@/application/billing/plan-allowance";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Logout, X } from "reicon-react";
import { AccountIdentity } from "./account-identity";
import { AccountPlan, type StudioBillingControl } from "./account-plan";
import { AccountProjects, type StudioCloudProjectState } from "./account-projects";
import { type AccountTab, AccountTabs } from "./account-tabs";
import { StudioApiKeys, type StudioApiKeysControl } from "./studio-api-keys";
import type { StudioCloudProjectsControl } from "./studio-cloud-projects";
import "./account-sheet.css";

export type AccountSection = "projects" | "plan" | "keys";

export interface AccountSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** Called once the sheet has slid out and the page behind it is no longer inert. */
	readonly onClosed: () => void;
	readonly account: { readonly name: string; readonly email: string };
	readonly section: AccountSection;
	readonly onSection: (section: AccountSection) => void;
	readonly cloudProjectState: StudioCloudProjectState;
	readonly onSaveToCloud?: () => void;
	readonly cloudProjects?: StudioCloudProjectsControl;
	readonly billing?: StudioBillingControl;
	readonly allowance?: string | null;
	readonly allowanceDetail?: PlanAllowance | null;
	/** Without it the sheet has no API keys tab. */
	readonly apiKeys?: StudioApiKeysControl;
	readonly signingOut: boolean;
	readonly onSignOut: () => void;
}

/**
 * The signed-in account (ux-waves UX 12, Polar's sidebar groups, Dub's plan and
 * usage page): a bottom sheet with three sections, Projects, Plan and API keys,
 * under the person's name, and Sign out in a foot that never scrolls away. It is
 * the studio's bottom sheet, as the hosted render sheet is (DECISIONS D1: a sheet
 * rises over the island, never a side panel): a native modal dialog, focus held
 * inside, Escape closes it and focus goes back to what opened it (`onClosed`).
 * It is portaled to the body, out of the account chip and the More menu, and reads
 * the paper's tokens there.
 */
export function AccountSheet({
	open,
	onClose,
	onClosed,
	account,
	section,
	onSection,
	cloudProjectState,
	onSaveToCloud,
	cloudProjects,
	billing,
	allowance,
	allowanceDetail,
	apiKeys,
	signingOut,
	onSignOut,
}: AccountSheetProps) {
	const titleId = useId();
	const bodyRef = useRef<HTMLDivElement>(null);

	// Opened, focus goes to the chosen tab, so the arrows work at once; or to a key
	// still to be copied, which is the next thing to do. A frame later: the sheet is
	// shown modal first, and its panel does not take the focus back from either.
	useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() => {
			const body = bodyRef.current;
			// A press that got there first (a fast hand, a test) keeps its focus.
			if (!body || body.contains(document.activeElement)) return;
			const target =
				body.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) [data-autofocus]') ??
				body.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
			target?.focus({ preventScroll: true });
		});
		return () => cancelAnimationFrame(frame);
	}, [open]);

	// The studio closes what is open on a document Escape: this one is the sheet's.
	const keepEscape = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.stopPropagation();
		}
	};

	const tabs: AccountTab<AccountSection>[] = [
		{
			id: "projects",
			label: "Projects",
			content: (
				<AccountProjects
					cloudProjectState={cloudProjectState}
					{...(onSaveToCloud ? { onSaveToCloud } : {})}
					{...(cloudProjects ? { cloudProjects } : {})}
					active={section === "projects"}
				/>
			),
		},
		{
			id: "plan",
			label: "Plan",
			content: (
				<AccountPlan
					{...(billing ? { billing } : {})}
					allowance={allowance ?? null}
					allowanceDetail={allowanceDetail ?? null}
				/>
			),
		},
		...(apiKeys
			? [
					{
						id: "keys" as const,
						label: "API keys",
						content: <StudioApiKeys keys={apiKeys} active={section === "keys"} />,
					},
				]
			: []),
	];

	if (typeof document === "undefined") return null;

	return createPortal(
		<div className="studio-root sc-tokens" onKeyDown={keepEscape}>
			<StudioBottomSheet
				open={open}
				onClose={onClose}
				onClosed={onClosed}
				labelledBy={titleId}
				className="account-sheet"
			>
				<div ref={bodyRef} className="account-sheet-body">
					<header className="studio-sheet-header account-sheet-header">
						<span id={titleId} className="sr-only">
							Typelapse account
						</span>
						<AccountIdentity name={account.name} email={account.email} />
						<button type="button" onClick={onClose} aria-label="Close account">
							<X size={14} strokeWidth={1.7} aria-hidden="true" />
						</button>
					</header>
					<AccountTabs label="Account sections" tabs={tabs} active={section} onActive={onSection} />
					<footer className="account-sheet-foot">
						<button
							type="button"
							className="account-sheet-sign-out"
							// Busy, it keeps its focus (a disabled button drops it) and says what it does.
							aria-disabled={signingOut || undefined}
							onClick={() => {
								if (!signingOut) onSignOut();
							}}
						>
							<Logout size={14} aria-hidden="true" />
							{signingOut ? "Signing out…" : "Sign out"}
						</button>
					</footer>
				</div>
			</StudioBottomSheet>
		</div>,
		document.body,
	);
}
