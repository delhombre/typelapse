/**
 * A screen-reader announcement that is in the page before it has anything to
 * say. Regions that mount together with their text are mostly not read: a
 * screen reader watches a region for changes, and one that did not exist a
 * moment ago has none. Render it unconditionally and change `message`.
 */
export function LiveRegion({ message, urgent = false }: { message: string; urgent?: boolean }) {
	return (
		<span role={urgent ? "alert" : "status"} className="sr-only">
			{message}
		</span>
	);
}
