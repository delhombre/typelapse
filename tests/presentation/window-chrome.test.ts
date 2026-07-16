import { isWindowChrome } from "@/presentation/components/preview/frame-chrome";
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

describe("isWindowChrome", () => {
	it("accepts the four known chromes", () => {
		for (const chrome of ["macos", "browser", "terminal", "none"]) {
			expect(isWindowChrome(chrome)).toBe(true);
		}
	});

	it("rejects unknown or non-string values", () => {
		expect(isWindowChrome("aqua")).toBe(false);
		expect(isWindowChrome(null)).toBe(false);
		expect(isWindowChrome(3)).toBe(false);
	});
});

describe("windowChrome serialization", () => {
	beforeEach(() => {
		useSnippetStore.setState({ windowChrome: "macos" });
	});

	it("round-trips through exportToJson", () => {
		useSnippetStore.getState().setWindowChrome("terminal");
		const json = useSnippetStore.getState().exportToJson();
		expect(JSON.parse(json).windowChrome).toBe("terminal");
	});

	it("imports a valid chrome", () => {
		useSnippetStore.getState().importFromJson(payload({ windowChrome: "browser" }));
		expect(useSnippetStore.getState().windowChrome).toBe("browser");
	});

	it("defaults a missing chrome to macos", () => {
		useSnippetStore.getState().setWindowChrome("browser");
		useSnippetStore.getState().importFromJson(payload({}));
		expect(useSnippetStore.getState().windowChrome).toBe("macos");
	});

	it("defaults a bogus chrome to macos", () => {
		useSnippetStore.getState().importFromJson(payload({ windowChrome: "bogus" }));
		expect(useSnippetStore.getState().windowChrome).toBe("macos");
	});
});
