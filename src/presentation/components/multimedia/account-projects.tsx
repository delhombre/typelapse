import { useEffect, useRef } from "react";
import { StudioCloudProjects, type StudioCloudProjectsControl } from "./studio-cloud-projects";
import "./studio-account-control.css";

export type StudioCloudProjectState = "device" | "connecting" | "synced" | "unsaved" | "error";

/** What this project's cloud copy is, said as a short label and one sentence. */
export function cloudCopyStatus(state: StudioCloudProjectState): {
	readonly eyebrow: string;
	readonly body: string;
} {
	switch (state) {
		case "connecting":
			return {
				eyebrow: "Connecting privately",
				body: "Opening your account-scoped project in Typelapse Cloud…",
			};
		case "synced":
			return {
				eyebrow: "Cloud copy saved",
				body: "This project has a private copy in Typelapse Cloud.",
			};
		case "unsaved":
			return {
				eyebrow: "Cloud copy out of date",
				body: "Your latest edits are still only on this device.",
			};
		case "error":
			return {
				eyebrow: "Cloud copy needs attention",
				body: "Nothing new was uploaded. Review the Studio status before trying again.",
			};
		case "device":
			return {
				eyebrow: "On this device",
				body: "Save privately to Typelapse Cloud when you want project metadata and media uploaded.",
			};
	}
}

/**
 * The account sheet's Projects tab: this project's cloud copy with the one action
 * that changes it, then every project the account keeps in Typelapse Cloud. Saving
 * is consent: nothing is uploaded until the button is pressed.
 */
export function AccountProjects({
	cloudProjectState,
	onSaveToCloud,
	cloudProjects,
	active,
}: {
	readonly cloudProjectState: StudioCloudProjectState;
	readonly onSaveToCloud?: () => void;
	/** Offered to a signed-in account only; without it the tab holds this project alone. */
	readonly cloudProjects?: StudioCloudProjectsControl;
	readonly active: boolean;
}) {
	const { eyebrow, body } = cloudCopyStatus(cloudProjectState);
	// The list sits under the save: a copy that has just landed is read into it.
	const listStore = cloudProjects?.store;
	const was = useRef(cloudProjectState);
	useEffect(() => {
		const landed = cloudProjectState === "synced" && was.current !== "synced";
		was.current = cloudProjectState;
		if (landed) void listStore?.getState().load();
	}, [cloudProjectState, listStore]);
	const canSave =
		onSaveToCloud !== undefined &&
		cloudProjectState !== "connecting" &&
		cloudProjectState !== "synced";
	return (
		<>
			<div className="mm-account-sync">
				<p className="mm-eyebrow">{eyebrow}</p>
				<p>{body}</p>
				{canSave ? (
					<button type="button" className="mm-account-primary" onClick={onSaveToCloud}>
						{cloudProjectState === "device" ? "Save this project to cloud" : "Save changes"}
					</button>
				) : null}
			</div>
			{cloudProjects ? <StudioCloudProjects projects={cloudProjects} active={active} /> : null}
		</>
	);
}
