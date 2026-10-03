// @vitest-environment node
import "fake-indexeddb/auto";
import {
	createProjectHistory,
	decodeProjectHistory,
	encodeProjectHistory,
	presentProjectDocument,
	recordProjectEdit,
} from "@/application/project/project-history";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { IndexedDbProjectHistoryAdapter } from "@/infrastructure/project/indexeddb-project-history.adapter";
import { afterEach, describe, expect, it } from "vitest";

const adapters: IndexedDbProjectHistoryAdapter[] = [];

function adapter() {
	const instance = new IndexedDbProjectHistoryAdapter({
		databaseName: `typelapse-history-test-${crypto.randomUUID()}`,
	});
	adapters.push(instance);
	return instance;
}

afterEach(async () => {
	await Promise.all(adapters.splice(0).map((instance) => instance.destroy()));
});

describe("IndexedDbProjectHistoryAdapter", () => {
	it("keeps one history per local project", async () => {
		const storage = adapter();
		const a = createStarterMultimediaProject({ projectId: "a" });
		const renamed = { ...a, project: { ...a.project, title: "Renamed" } };
		await storage.save(
			encodeProjectHistory(recordProjectEdit(createProjectHistory(a), renamed, 0)),
		);
		await storage.save(
			encodeProjectHistory(
				createProjectHistory(createStarterMultimediaProject({ projectId: "b" })),
			),
		);

		const restored = decodeProjectHistory(await storage.load("a"));

		expect(restored && presentProjectDocument(restored).project.title).toBe("Renamed");
		expect(await storage.load("missing")).toBeNull();
	});
});
