import type { SceneAssetSourceLease } from "@/application/assets/scene-asset-source.port";
import { createSceneAssetSourceRegistry } from "@/infrastructure/assets/scene-asset-source.registry";
import { describe, expect, it, vi } from "vitest";

function lease(
	assetId: string,
	src: string,
): SceneAssetSourceLease & { release: ReturnType<typeof vi.fn> } {
	return {
		source: { assetId, src },
		release: vi.fn(),
	};
}

describe("scene asset source registry", () => {
	it("registers an ephemeral source behind the resolver contract used by the scene frame", () => {
		const registry = createSceneAssetSourceRegistry();
		const source = lease("asset-1", "blob:asset-1");

		registry.register(source);

		expect(registry.resolve("asset-1")).toEqual({ assetId: "asset-1", src: "blob:asset-1" });
	});

	it("releases the previous lease when an asset source is replaced", () => {
		const registry = createSceneAssetSourceRegistry();
		const previous = lease("asset-1", "blob:previous");
		const replacement = lease("asset-1", "blob:replacement");
		registry.register(previous);

		registry.register(replacement);

		expect(previous.release).toHaveBeenCalledOnce();
		expect(replacement.release).not.toHaveBeenCalled();
		expect(registry.resolve("asset-1")).toEqual({
			assetId: "asset-1",
			src: "blob:replacement",
		});
	});

	it("revokes one source exactly once and removes it from resolution", () => {
		const registry = createSceneAssetSourceRegistry();
		const source = lease("asset-1", "blob:asset-1");
		registry.register(source);

		expect(registry.revoke("asset-1")).toBe(true);
		expect(registry.revoke("asset-1")).toBe(false);
		expect(source.release).toHaveBeenCalledOnce();
		expect(registry.resolve("asset-1")).toBeNull();
	});

	it("revokeAll releases every remaining source without leaking replaced URLs", () => {
		const registry = createSceneAssetSourceRegistry();
		const first = lease("asset-1", "blob:first");
		const replaced = lease("asset-1", "blob:replaced");
		const second = lease("asset-2", "blob:second");
		registry.register(first);
		registry.register(replaced);
		registry.register(second);

		registry.revokeAll();
		registry.revokeAll();

		expect(first.release).toHaveBeenCalledOnce();
		expect(replaced.release).toHaveBeenCalledOnce();
		expect(second.release).toHaveBeenCalledOnce();
		expect(registry.resolve("asset-1")).toBeNull();
		expect(registry.resolve("asset-2")).toBeNull();
	});
});
