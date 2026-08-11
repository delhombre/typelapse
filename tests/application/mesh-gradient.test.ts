import {
	MESH_LOOP_PERIOD,
	MESH_PRESETS,
	isImageBackground,
	isMeshBackground,
	isSafeBackground,
	isSolidBackground,
	meshBlobsAt,
	meshGradientCss,
	parseImageBackground,
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

	it("loops seamlessly: t=0 and t=period produce the same CSS", () => {
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

describe("meshBlobsAt", () => {
	const preset = MESH_PRESETS[0];

	function requirePreset() {
		if (!preset) {
			throw new Error("expected a preset");
		}
		return preset;
	}

	it("places every blob at its base position when the drift is at rest", () => {
		const p = requirePreset();
		const blobs = meshBlobsAt(p, 0);
		expect(blobs).toHaveLength(p.blobs.length);
		for (const [i, blob] of blobs.entries()) {
			const source = p.blobs[i];
			if (!source) {
				throw new Error("expected a source blob");
			}
			// At t=0 the drift is sin(phase) / cos(phase) around the base position.
			const TAU = Math.PI * 2;
			expect(blob.x).toBeCloseTo(source.x + source.ax * Math.sin(TAU * source.phase), 10);
			expect(blob.y).toBeCloseTo(source.y + source.ay * Math.cos(TAU * source.phase), 10);
			expect(blob.color).toBe(source.color);
			expect(blob.radius).toBe(source.radius);
		}
	});

	it("loops seamlessly: t=0 and t=period land on the same positions", () => {
		const p = requirePreset();
		expect(meshBlobsAt(p, MESH_LOOP_PERIOD)).toEqual(meshBlobsAt(p, 0));
	});

	it("drifts the blobs over time", () => {
		const p = requirePreset();
		expect(meshBlobsAt(p, MESH_LOOP_PERIOD / 4)).not.toEqual(meshBlobsAt(p, 0));
	});

	it("is the single source of the positions the CSS renders", () => {
		const p = requirePreset();
		const css = meshGradientCss(p, 3.7);
		for (const blob of meshBlobsAt(p, 3.7)) {
			expect(css).toContain(`circle at ${blob.x.toFixed(2)}% ${blob.y.toFixed(2)}%`);
		}
	});
});

describe("resolveBackgroundCss", () => {
	it("passes static backgrounds through untouched", () => {
		expect(resolveBackgroundCss("transparent", 3)).toBe("transparent");
	});

	it("renders mesh backgrounds at the given time", () => {
		expect(resolveBackgroundCss("mesh:aurora", 0)).toContain("radial-gradient");
	});

	it("passes a solid hex through untouched", () => {
		expect(resolveBackgroundCss("#1e293b", 2)).toBe("#1e293b");
	});

	it("resolves an image background to a cover CSS value", () => {
		const url = "data:image/png;base64,AAAA";
		expect(resolveBackgroundCss(`image:${url}`, 0)).toBe(
			`url("${url}") center center / cover no-repeat`,
		);
	});
});

describe("solid backgrounds", () => {
	it("recognizes plain 3- and 6-digit hex", () => {
		expect(isSolidBackground("#1e293b")).toBe(true);
		expect(isSolidBackground("#abc")).toBe(true);
	});

	it("rejects non-solid backgrounds", () => {
		expect(isSolidBackground("transparent")).toBe(false);
		expect(isSolidBackground("mesh:aurora")).toBe(false);
		expect(isSolidBackground("linear-gradient(#000, #111)")).toBe(false);
		expect(isSolidBackground("image:data:image/png;base64,AAAA")).toBe(false);
	});
});

describe("image backgrounds", () => {
	const url = "data:image/png;base64,AAAA";

	it("parses the data URL out of the image: scheme", () => {
		expect(parseImageBackground(`image:${url}`)).toBe(url);
	});

	it("returns null for non-image backgrounds", () => {
		expect(parseImageBackground("mesh:aurora")).toBeNull();
		expect(parseImageBackground("#1e293b")).toBeNull();
	});

	it("recognizes image backgrounds", () => {
		expect(isImageBackground(`image:${url}`)).toBe(true);
		expect(isImageBackground("#1e293b")).toBe(false);
	});

	it("only honors inline data-image payloads, never a remote or other-scheme URL", () => {
		// SSRF guard: a non-data payload would make the renderer fetch it, so it is
		// rejected at the parse boundary (returns null, and is not an image background).
		expect(parseImageBackground("image:http://169.254.169.254/latest")).toBeNull();
		expect(parseImageBackground("image:https://evil.example/a.png")).toBeNull();
		expect(parseImageBackground("image:javascript:alert(1)")).toBeNull();
		expect(parseImageBackground("image:data:text/html,<script>")).toBeNull();
		expect(isImageBackground("image:http://internal/x")).toBe(false);
	});
});

describe("isSafeBackground", () => {
	it("accepts backgrounds that can never trigger a network fetch", () => {
		expect(isSafeBackground("mesh:aurora")).toBe(true);
		expect(isSafeBackground("mesh:whatever")).toBe(true);
		expect(isSafeBackground("#1e293b")).toBe(true);
		expect(isSafeBackground("#abc")).toBe(true);
		expect(isSafeBackground("transparent")).toBe(true);
		expect(isSafeBackground("linear-gradient(#000, #111)")).toBe(true);
		expect(isSafeBackground("radial-gradient(circle at 50% 50%, #000, #fff)")).toBe(true);
		expect(isSafeBackground("image:data:image/png;base64,AAAA")).toBe(true);
	});

	it("rejects anything that would make the server fetch a remote resource", () => {
		expect(isSafeBackground("image:http://169.254.169.254/latest/meta-data")).toBe(false);
		expect(isSafeBackground("image:https://evil.example/a.png")).toBe(false);
		expect(isSafeBackground("image:javascript:alert(1)")).toBe(false);
		expect(isSafeBackground("url(http://internal/secret)")).toBe(false);
		expect(isSafeBackground("linear-gradient(#000, url(http://evil))")).toBe(false);
		expect(isSafeBackground("http://evil.example/x.png")).toBe(false);
		expect(isSafeBackground("")).toBe(false);
	});
});
