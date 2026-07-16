import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { beforeEach, describe, expect, it } from "vitest";

const payload = (extra: Record<string, unknown>) =>
	JSON.stringify({
		title: "t",
		code: "const a = 1;",
		language: "typescript",
		themeName: "midnight",
		steps: [],
		...extra,
	});

describe("card margin setting", () => {
	beforeEach(() => {
		useSnippetStore.setState({ cardMargin: 32 });
	});

	it("sets the margin through the setter", () => {
		useSnippetStore.getState().setCardMargin(48);
		expect(useSnippetStore.getState().cardMargin).toBe(48);
	});

	it("round-trips through exportToJson", () => {
		useSnippetStore.getState().setCardMargin(64);
		const data = JSON.parse(useSnippetStore.getState().exportToJson());
		expect(data.cardMargin).toBe(64);
	});

	it("round-trips export → import unchanged", () => {
		useSnippetStore.getState().setCardMargin(16);
		const json = useSnippetStore.getState().exportToJson();
		useSnippetStore.setState({ cardMargin: 32 });
		useSnippetStore.getState().importFromJson(json);
		expect(useSnippetStore.getState().cardMargin).toBe(16);
	});

	it("imports a valid preset", () => {
		useSnippetStore.getState().importFromJson(payload({ cardMargin: 48 }));
		expect(useSnippetStore.getState().cardMargin).toBe(48);
	});

	it("defaults a missing margin to 32", () => {
		useSnippetStore.getState().setCardMargin(64);
		useSnippetStore.getState().importFromJson(payload({}));
		expect(useSnippetStore.getState().cardMargin).toBe(32);
	});

	it("clamps an out-of-set margin to the nearest valid preset", () => {
		// Above the ladder snaps to the max; below it snaps to the min.
		useSnippetStore.getState().importFromJson(payload({ cardMargin: 999 }));
		expect(useSnippetStore.getState().cardMargin).toBe(64);
		useSnippetStore.getState().importFromJson(payload({ cardMargin: -100 }));
		expect(useSnippetStore.getState().cardMargin).toBe(16);
	});

	it("falls back to 32 for a non-numeric margin", () => {
		useSnippetStore.getState().importFromJson(payload({ cardMargin: "wide" }));
		expect(useSnippetStore.getState().cardMargin).toBe(32);
	});
});
