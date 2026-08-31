import {
	projectCodeLayerVisual,
	projectTextLayerVisual,
} from "@/application/render/scene-layer-visuals";
import { describe, expect, it } from "vitest";

describe("scene layer visual projections", () => {
	it("projects canonical text and code visuals for every renderer", () => {
		expect(
			projectTextLayerVisual({
				typography: {
					fontFamily: "Inter",
					fontSize: 72,
					fontWeight: 700,
					color: "#ffffff",
					align: "right",
				},
			}),
		).toEqual({
			fontFamily: "Inter",
			fontSize: 72,
			fontWeight: 700,
			color: "#ffffff",
			textAlign: "right",
			justifyContent: "flex-end",
			lineHeight: 1.08,
			letterSpacing: "-0.035em",
		});

		expect(
			projectCodeLayerVisual({
				themeName: "frost",
				chrome: "browser",
				fontFamily: "Berkeley Mono",
				borderRadius: 20,
				framePadding: 36,
			}),
		).toEqual({
			themeName: "frost",
			background: "#f0f4f8",
			foreground: "#1a202c",
			chrome: "browser",
			fontFamily: "Berkeley Mono",
			fontSize: 18,
			lineHeight: 1.55,
			borderRadius: 20,
			framePadding: 36,
			boxShadow: "0 24px 64px rgb(0 0 0 / 0.22), 0 2px 10px rgb(0 0 0 / 0.16)",
			lineNumberColor: "#1a202c40",
			lineNumberGap: 18,
		});
	});
});
