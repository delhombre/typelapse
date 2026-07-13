import {
	MESH_LOOP_PERIOD,
	MESH_PRESETS,
	isMeshBackground,
	meshGradientCss,
	parseMeshBackground,
	resolveBackgroundCss,
} from "@/application/backgrounds/mesh-gradient";
import { describe, expect, it } from "vitest";

describe("mesh background parsing", () => {
	it("recognizes mesh backgrounds by their id", () => {
		expect(isMeshBackground("mesh:aurora")).toBe(true);
		expect(parseMeshBackground("mesh:aurora")?.id).toBe("aurora");
	});

	it("treats plain CSS as non-mesh", () => {
		expect(isMeshBackground("linear-gradient(#000, #111)")).toBe(false);
		expect(parseMeshBackground("transparent")).toBeUndefined();
	});

	it("ignores unknown mesh ids", () => {
		expect(parseMeshBackground("mesh:does-not-exist")).toBeUndefined();
	});
});

describe("meshGradientCss", () => {
	const preset = MESH_PRESETS[0];

	it("emits one radial-gradient layer per blob plus the base", () => {
		if (!preset) {
			throw new Error("expected a preset");
		}
		const css = meshGradientCss(preset, 0);
		const layers = css.match(/radial-gradient/g) ?? [];
		expect(layers).toHaveLength(preset.blobs.length);
		expect(css).toContain(preset.base);
	});

	it("loops seamlessly — t=0 and t=period produce the same CSS", () => {
		if (!preset) {
			throw new Error("expected a preset");
		}
		expect(meshGradientCss(preset, 0)).toBe(meshGradientCss(preset, MESH_LOOP_PERIOD));
	});

	it("moves the gradient over time", () => {
		if (!preset) {
			throw new Error("expected a preset");
		}
		expect(meshGradientCss(preset, 0)).not.toBe(meshGradientCss(preset, MESH_LOOP_PERIOD / 4));
	});
});

describe("resolveBackgroundCss", () => {
	it("passes static backgrounds through untouched", () => {
		expect(resolveBackgroundCss("transparent", 3)).toBe("transparent");
	});

	it("renders mesh backgrounds at the given time", () => {
		expect(resolveBackgroundCss("mesh:aurora", 0)).toContain("radial-gradient");
	});
});
