import {
	HostedProjectApiError,
	type HostedProjectApiPort,
	type HostedProjectSummary,
} from "@/application/project/hosted-project-api.port";
import { createCloudProjectsStore } from "@/presentation/stores/cloud-projects.store";
import { describe, expect, it, vi } from "vitest";

type CloudProjectsPort = Pick<HostedProjectApiPort, "list" | "delete">;

function summary(id: string, title = "Launch"): HostedProjectSummary {
	return {
		id,
		title,
		revision: 3,
		sceneCount: 4,
		updatedAt: new Date("2026-10-05T12:00:00.000Z"),
	};
}

function port(overrides: Partial<CloudProjectsPort> = {}): CloudProjectsPort {
	return {
		list: async () => [summary("project_a", "First"), summary("project_b", "Second")],
		delete: async () => true,
		...overrides,
	};
}

/** A call that stays open until the test lets it go. */
function gate<T>() {
	let release: (value: T) => void = () => undefined;
	const promise = new Promise<T>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe("the cloud projects store", () => {
	it("loads the account's projects, and says so while it waits", async () => {
		const pending = gate<readonly HostedProjectSummary[]>();
		const store = createCloudProjectsStore({ port: port({ list: () => pending.promise }) });
		expect(store.getState().status).toBe("idle");
		expect(store.getState().projects).toBeNull();

		const loading = store.getState().load();
		expect(store.getState().status).toBe("loading");
		pending.release([summary("project_a")]);
		await loading;

		expect(store.getState().status).toBe("ready");
		expect(store.getState().projects?.map((project) => project.id)).toEqual(["project_a"]);
		expect(store.getState().error).toBeNull();
	});

	it("says what it could not do, in a sentence of its own, and tries again on the next load", async () => {
		const list = vi
			.fn<CloudProjectsPort["list"]>()
			.mockRejectedValueOnce(
				new HostedProjectApiError(
					"unavailable",
					"The hosted project service is temporarily unavailable.",
				),
			)
			.mockRejectedValueOnce(
				new HostedProjectApiError("unauthorized", "Sign in to sync hosted projects."),
			)
			.mockResolvedValueOnce([summary("project_a")]);
		const store = createCloudProjectsStore({ port: port({ list }) });

		await store.getState().load();
		expect(store.getState().status).toBe("error");
		expect(store.getState().error).toBe(
			"Your cloud projects cannot be read right now. Try again in a moment.",
		);

		await store.getState().load();
		expect(store.getState().error).toBe("Sign in again to see your cloud projects.");

		await store.getState().load();
		expect(store.getState().status).toBe("ready");
		expect(store.getState().error).toBeNull();
	});

	it("drops a deleted project from the list, and says which one is going", async () => {
		const pending = gate<boolean>();
		const remove = vi.fn(() => pending.promise);
		const store = createCloudProjectsStore({ port: port({ delete: remove }) });
		await store.getState().load();

		const deleting = store.getState().remove("project_a");
		expect(store.getState().deleting).toBe("project_a");
		pending.release(true);
		const gone = await deleting;

		expect(gone).toBe(true);
		expect(remove).toHaveBeenCalledWith("project_a");
		expect(store.getState().projects?.map((project) => project.id)).toEqual(["project_b"]);
		expect(store.getState().deleting).toBeNull();
		expect(store.getState().error).toBeNull();
	});

	it("counts a project the server no longer has as gone, since that is what was asked", async () => {
		const store = createCloudProjectsStore({ port: port({ delete: async () => false }) });
		await store.getState().load();

		const gone = await store.getState().remove("project_a");

		expect(gone).toBe(true);
		expect(store.getState().projects?.map((project) => project.id)).toEqual(["project_b"]);
		expect(store.getState().error).toBeNull();
	});

	it("keeps the project and says why when the delete is refused", async () => {
		const refusals = [
			[
				new HostedProjectApiError(
					"unavailable",
					"The hosted project service is temporarily unavailable.",
				),
				"The project could not be deleted. Try again in a moment.",
			],
			[
				new HostedProjectApiError("unauthorized", "Sign in to sync hosted projects."),
				"Sign in again to delete projects.",
			],
			[
				new HostedProjectApiError("render-active", "A render is still running.", 409),
				"A render is still running on this project. Delete it once the render ends.",
			],
		] as const;
		for (const [failure, sentence] of refusals) {
			const store = createCloudProjectsStore({
				port: port({
					delete: async () => {
						throw failure;
					},
				}),
			});
			await store.getState().load();

			const gone = await store.getState().remove("project_a");

			expect(gone).toBe(false);
			expect(store.getState().error).toBe(sentence);
			expect(store.getState().projects?.map((project) => project.id)).toEqual([
				"project_a",
				"project_b",
			]);
			expect(store.getState().deleting).toBeNull();
		}
	});

	it("refuses a second delete while one is in flight", async () => {
		const pending = gate<boolean>();
		const remove = vi.fn(() => pending.promise);
		const store = createCloudProjectsStore({ port: port({ delete: remove }) });
		await store.getState().load();

		const first = store.getState().remove("project_a");
		const second = await store.getState().remove("project_b");
		pending.release(true);
		await first;

		expect(second).toBe(false);
		expect(remove).toHaveBeenCalledTimes(1);
		expect(store.getState().projects?.map((project) => project.id)).toEqual(["project_b"]);
	});

	it("forgets everything on reset, and ignores an answer that comes back after it", async () => {
		const pending = gate<readonly HostedProjectSummary[]>();
		const store = createCloudProjectsStore({ port: port({ list: () => pending.promise }) });
		const loading = store.getState().load();

		store.getState().reset();
		pending.release([summary("project_a")]);
		await loading;

		expect(store.getState().projects).toBeNull();
		expect(store.getState().status).toBe("idle");
	});
});
