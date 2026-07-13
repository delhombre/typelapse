/**
 * A subtle film-grain layer over a gradient background — the premium texture
 * used by tools like an external reference and a competing tool. Rendered identically in the browser
 * preview and in Remotion's headless Chrome so the exported video matches.
 */
const NOISE =
	'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44IiBudW1PY3RhdmVzPSIzIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI24pIi8+PC9zdmc+")';

export function GrainOverlay({ opacity = 0.28 }: { opacity?: number }) {
	return (
		<div
			aria-hidden="true"
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				backgroundImage: NOISE,
				backgroundSize: "160px 160px",
				opacity,
				mixBlendMode: "soft-light",
			}}
		/>
	);
}
