import { loadExportFonts } from "@/infrastructure/export/worker-fonts";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Registered {
	family: string;
	source: string;
	weight?: string;
	unicodeRange?: string;
}

/** A FontFace that loads at once and remembers what it was given. */
function stubFontFace(): Registered[] {
	const made: Registered[] = [];
	class FakeFontFace {
		constructor(
			readonly family: string,
			readonly source: string,
			readonly descriptors: { weight?: string; unicodeRange?: string } = {},
		) {
			made.push({
				family,
				source,
				weight: descriptors.weight,
				unicodeRange: descriptors.unicodeRange,
			});
		}
		load() {
			return Promise.resolve(this);
		}
	}
	vi.stubGlobal("FontFace", FakeFontFace);
	return made;
}

describe("loadExportFonts", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("registers the default code font from the app's own files, asking no one", async () => {
		const made = stubFontFace();
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const registry = { add: vi.fn() };

		await loadExportFonts(registry, "JetBrains Mono, monospace");

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(new Set(made.map((face) => face.weight))).toEqual(new Set(["400", "500", "700"]));
		expect(made).toContainEqual(
			expect.objectContaining({
				family: "JetBrains Mono",
				source: "url(/fonts/JetBrainsMono-latin.woff2)",
				weight: "400",
			}),
		);
		expect(registry.add).toHaveBeenCalledTimes(made.length);
	});

	it("registers Geist at the document's four weights", async () => {
		const made = stubFontFace();
		vi.stubGlobal("fetch", vi.fn());

		await loadExportFonts({ add: vi.fn() }, "Geist, ui-sans-serif, system-ui, sans-serif");

		expect(new Set(made.map((face) => face.weight))).toEqual(new Set(["400", "500", "600", "700"]));
		expect(made.every((face) => face.source.startsWith("url(/fonts/Geist-"))).toBe(true);
	});
});
