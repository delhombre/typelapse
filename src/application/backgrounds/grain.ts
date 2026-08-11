/**
 * The film-grain tile: one inline SVG turbulence, shared by every surface.
 *
 * The DOM sets it as a `background-image` and lets `mix-blend-mode` do the
 * rest; a canvas has to decode the same bytes into a pattern and composite them
 * itself. Both read the tile from here, so the texture cannot drift between the
 * preview and an export.
 */

/** A 160×160 fractal-noise tile, inline so nothing is fetched over the network. */
export const GRAIN_TILE_URL =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iMTYwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC44IiBudW1PY3RhdmVzPSIzIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI24pIi8+PC9zdmc+";

/** Tile edge in px: the CSS `background-size`. */
export const GRAIN_TILE_SIZE = 160;

/** Layer opacity: the CSS `opacity` on the soft-light overlay. */
export const GRAIN_OPACITY = 0.28;
