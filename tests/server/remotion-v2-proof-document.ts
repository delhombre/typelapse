import type { ProjectDocumentV2 } from "../../src/application/project/project-document";

/**
 * The 3-scene proof project of #93 and #100: a title card whose card is hidden
 * (two texts over it), an image under the card, then code alone.
 */
export function proofDocument(): ProjectDocumentV2 {
	return {
	"schemaVersion": 2,
	"project": {
		"id": "proof-93",
		"title": "greet.ts",
		"canvas": {
			"width": 1920,
			"height": 1080,
			"background": "mesh:aurora"
		},
		"settings": {
			"progressStyle": "none",
			"transitionMs": 1000,
			"typewriter": false,
			"focusZoom": false,
			"watermark": "@typelapse",
			"fps": 60
		},
		"assets": [
			{
				"id": "asset-proof-photo",
				"kind": "image",
				"fileName": "proof.png",
				"mimeType": "image/png",
				"byteSize": 12743,
				"checksum": "661e2053b6e152e99e28e1ac0157b7f07cb46f2c174c8c657e990fcf25b0b159",
				"width": 1600,
				"height": 900
			}
		],
		"audioCues": [],
		"scenes": [
			{
				"id": "scene-title",
				"durationMs": 1500,
				"transitionOut": {
					"kind": "magic-move",
					"durationMs": 1000
				},
				"blocks": [
					{
						"id": "scene-title::primary-code",
						"kind": "code",
						"code": "const greet = (name: string) => {\n  return `Hello, ${name}`;\n};",
						"language": "typescript",
						"themeName": "midnight",
						"fontFamily": "JetBrains Mono, monospace",
						"borderRadius": 12,
						"chrome": "macos",
						"showLineNumbers": true,
						"lineNumberStart": 1,
						"framePadding": 24,
						"cardMargin": 32,
						"continuityKey": "primary-code",
						"opacity": 0,
						"placement": {
							"x": 0,
							"y": 0,
							"width": 1,
							"height": 1
						}
					},
					{
						"id": "headline",
						"kind": "text",
						"text": "Ship the greeting",
						"opacity": 1,
						"placement": {
							"x": 0.1,
							"y": 0.3,
							"width": 0.8,
							"height": 0.18
						},
						"typography": {
							"fontFamily": "Geist, ui-sans-serif, system-ui, sans-serif",
							"fontSize": 96,
							"fontWeight": 650,
							"color": "#fffaf0",
							"align": "center"
						}
					},
					{
						"id": "byline",
						"kind": "text",
						"text": "in three scenes, on this device",
						"opacity": 1,
						"placement": {
							"x": 0.1,
							"y": 0.52,
							"width": 0.8,
							"height": 0.18
						},
						"typography": {
							"fontFamily": "Geist, ui-sans-serif, system-ui, sans-serif",
							"fontSize": 48,
							"fontWeight": 500,
							"color": "#fffaf0",
							"align": "center"
						}
					}
				]
			},
			{
				"id": "scene-image",
				"durationMs": 1500,
				"transitionOut": {
					"kind": "magic-move",
					"durationMs": 1000
				},
				"blocks": [
					{
						"id": "photo",
						"kind": "image",
						"assetId": "asset-proof-photo",
						"fit": "cover",
						"focalPoint": {
							"x": 0.8,
							"y": 0.3
						},
						"borderRadius": 48,
						"opacity": 1,
						"placement": {
							"x": 0.6,
							"y": 0.12,
							"width": 0.34,
							"height": 0.76
						}
					},
					{
						"id": "scene-image::primary-code",
						"kind": "code",
						"code": "const greet = (name: string) => {\n  const message = `Hello, ${name}`;\n  console.log(message);\n  return message;\n};",
						"language": "typescript",
						"themeName": "midnight",
						"fontFamily": "JetBrains Mono, monospace",
						"borderRadius": 12,
						"chrome": "macos",
						"showLineNumbers": true,
						"lineNumberStart": 1,
						"framePadding": 24,
						"cardMargin": 32,
						"continuityKey": "primary-code",
						"opacity": 1,
						"placement": {
							"x": 0,
							"y": 0,
							"width": 1,
							"height": 1
						}
					}
				]
			},
			{
				"id": "scene-code",
				"durationMs": 1500,
				"blocks": [
					{
						"id": "scene-code::primary-code",
						"kind": "code",
						"code": "export const greet = (name: string) =>\n  `Hello, ${name}`;",
						"language": "typescript",
						"themeName": "midnight",
						"fontFamily": "JetBrains Mono, monospace",
						"borderRadius": 12,
						"chrome": "macos",
						"showLineNumbers": true,
						"lineNumberStart": 1,
						"framePadding": 24,
						"cardMargin": 32,
						"continuityKey": "primary-code",
						"opacity": 1,
						"placement": {
							"x": 0,
							"y": 0,
							"width": 1,
							"height": 1
						}
					}
				]
			}
		]
	}
};
}
