// @vitest-environment jsdom
import type { ClientSession } from "@/application/auth/client-auth.port";
import {
	HostedProjectApiError,
	type HostedProjectApiPort,
	type HostedProjectSummary,
} from "@/application/project/hosted-project-api.port";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { feedback } from "@/presentation/haptics";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { createCloudProjectsStore } from "@/presentation/stores/cloud-projects.store";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The studio's sound and touch cues: replaced, so the test hears intents, not speakers.
vi.mock("@/presentation/haptics", () => ({ feedback: vi.fn() }));

const NOW = new Date("2026-10-06T12:00:00.000Z");
const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-10-07T12:00:00.000Z"),
};

function summary(id: string, title: string, overrides: Partial<HostedProjectSummary> = {}) {
	return {
		id,
		title,
		revision: 2,
		sceneCount: 4,
		updatedAt: new Date(NOW.getTime() - 3 * 60_000),
		...overrides,
	} satisfies HostedProjectSummary;
}

const LAUNCH = summary("project_a", "Launch");
const CHANGELOG = summary("project_b", "Changelog", {
	sceneCount: 1,
	updatedAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000),
});

type Port = Pick<HostedProjectApiPort, "list" | "delete">;

function port(projects: readonly HostedProjectSummary[], overrides: Partial<Port> = {}): Port {
	return { list: async () => projects, delete: vi.fn(async () => true), ...overrides };
}

function signedIn() {
	const store = createAuthStore({ kind: "local-offline" });
	store.setState({
		status: { kind: "authenticated", session: SESSION },
		operation: "idle",
		canSync: true,
		error: null,
	});
	return store;
}

function renderControl(
	cloudPort: Port,
	options: { openId?: string | null; onDeleted?: (id: string) => void; withList?: boolean } = {},
) {
	const store = createCloudProjectsStore({ port: cloudPort });
	const view = render(
		<StudioAccountControl
			store={signedIn()}
			{...(options.withList === false
				? {}
				: {
						cloudProjects: {
							store,
							openId: options.openId ?? null,
							onDeleted: options.onDeleted ?? (() => {}),
							now: () => NOW,
						},
					})}
		/>,
	);
	return { ...view, store };
}

async function openList() {
	fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
	fireEvent.click(screen.getByRole("button", { name: "Cloud projects" }));
	await screen.findByRole("heading", { name: "Cloud projects" });
}

const rowOf = (title: string) =>
	screen.getByRole("button", { name: `Delete ${title}` }).closest("li") as HTMLElement;

beforeEach(() => {
	vi.mocked(feedback).mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("cloud projects in the account island", () => {
	it("are offered to a signed-in account that has the list, and to nobody else", () => {
		renderControl(port([]), { withList: false });
		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

		expect(screen.queryByRole("button", { name: "Cloud projects" })).toBeNull();
	});

	it("list each project by title, scenes and last save, newest as the server sent them", async () => {
		renderControl(port([LAUNCH, CHANGELOG]));

		await openList();

		const rows = await screen.findAllByRole("listitem");
		expect(rows).toHaveLength(2);
		expect(within(rows[0] as HTMLElement).getByText("Launch")).toBeTruthy();
		expect(within(rows[0] as HTMLElement).getByText("4 scenes")).toBeTruthy();
		expect(within(rows[0] as HTMLElement).getByText("Edited 3 min ago")).toBeTruthy();
		expect(within(rows[1] as HTMLElement).getByText("1 scene")).toBeTruthy();
		expect(within(rows[1] as HTMLElement).getByText("Edited 3 days ago")).toBeTruthy();
	});

	it("say which one is the cloud copy of the project that is open", async () => {
		renderControl(port([LAUNCH, CHANGELOG]), { openId: "project_b" });

		await openList();

		expect(
			within(await screen.findByText("Changelog").then(() => rowOf("Changelog"))).getByText(
				"Open now",
			),
		).toBeTruthy();
		expect(within(rowOf("Launch")).queryByText("Open now")).toBeNull();
	});

	it("say so when there are none, and when they cannot be read, and read them again on request", async () => {
		const empty = renderControl(port([]));
		await openList();
		expect(await screen.findByText(/No cloud projects yet/)).toBeTruthy();
		empty.unmount();

		const list = vi
			.fn<Port["list"]>()
			.mockRejectedValueOnce(
				new HostedProjectApiError(
					"unavailable",
					"The hosted project service is temporarily unavailable.",
				),
			)
			.mockResolvedValueOnce([LAUNCH]);
		renderControl(port([], { list }));
		await openList();
		expect((await screen.findByRole("alert")).textContent).toBe(
			"Your cloud projects cannot be read right now. Try again in a moment.",
		);

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Launch")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("deleting a cloud project from the island", () => {
	it("asks first, with the shared question and one sentence on what goes with it, and deletes nothing yet", async () => {
		const cloud = port([LAUNCH, CHANGELOG]);
		renderControl(cloud);
		await openList();
		await screen.findByText("Launch");

		fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));

		const question = document.querySelector("[data-confirm-discard]") as HTMLElement;
		expect(question).toBeTruthy();
		expect(within(question).getByText("Delete “Launch”?")).toBeTruthy();
		expect(
			within(question).getByText("Its revisions, media, renders and their share pages go with it."),
		).toBeTruthy();
		expect(document.activeElement).toBe(
			within(question).getByRole("button", { name: "Keep project" }),
		);
		expect(cloud.delete).not.toHaveBeenCalled();
		// The other project is not asked about.
		expect(screen.getByRole("button", { name: "Delete Changelog" })).toBeTruthy();
	});

	it("keeps the project, and puts the keyboard back where it was, when the person keeps it", async () => {
		const cloud = port([LAUNCH]);
		renderControl(cloud);
		await openList();
		await screen.findByText("Launch");
		fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));

		fireEvent.click(screen.getByRole("button", { name: "Keep project" }));

		expect(document.querySelector("[data-confirm-discard]")).toBeNull();
		expect(cloud.delete).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete Launch" })),
		);
	});

	it("takes Escape as keeping the project, and leaves the panel open", async () => {
		renderControl(port([LAUNCH]));
		await openList();
		await screen.findByText("Launch");
		fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));

		fireEvent.keyDown(screen.getByRole("button", { name: "Keep project" }), { key: "Escape" });

		expect(document.querySelector("[data-confirm-discard]")).toBeNull();
		expect(screen.getByRole("heading", { name: "Cloud projects" })).toBeTruthy();
	});

	it("deletes the project, tells the studio, and says so", async () => {
		const cloud = port([LAUNCH, CHANGELOG]);
		const onDeleted = vi.fn();
		renderControl(cloud, { onDeleted, openId: "project_a" });
		await openList();
		await screen.findByText("Launch");
		fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));

		fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

		await waitFor(() => expect(screen.queryByText("Launch")).toBeNull());
		expect(cloud.delete).toHaveBeenCalledWith("project_a");
		expect(onDeleted).toHaveBeenCalledWith("project_a");
		expect(screen.getByText("Changelog")).toBeTruthy();
		expect(screen.getByText("Deleted Launch.")).toBeTruthy();
		expect(feedback).toHaveBeenCalledWith("commit");
		expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Cloud projects" }));
	});

	it("keeps the project and says why when the server refuses, without telling the studio", async () => {
		const onDeleted = vi.fn();
		const cloud = port([LAUNCH], {
			delete: async () => {
				throw new HostedProjectApiError("unavailable", "down");
			},
		});
		renderControl(cloud, { onDeleted });
		await openList();
		await screen.findByText("Launch");
		fireEvent.click(screen.getByRole("button", { name: "Delete Launch" }));

		fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"The project could not be deleted. Try again in a moment.",
		);
		expect(screen.getByText("Launch")).toBeTruthy();
		expect(onDeleted).not.toHaveBeenCalled();
		expect(feedback).toHaveBeenCalledWith("error");
	});
});
