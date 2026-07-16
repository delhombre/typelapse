import { type RefObject, useCallback, useEffect, useState } from "react";

/**
 * RefObject-based observer. The effect's deps are stable, so it only looks at
 * `.current` once, on mount — fine when the measured element renders
 * unconditionally (AnimatedSizeContainer), but it will silently never attach if
 * the first render shows a placeholder and the element mounts later. For that
 * case use `useResizeObserverNode` with a callback-ref-fed node instead.
 */
export function useResizeObserver(
	elementRef: RefObject<Element | null>,
): ResizeObserverEntry | undefined {
	const [entry, setEntry] = useState<ResizeObserverEntry>();

	const updateEntry = useCallback(([newEntry]: ResizeObserverEntry[]): void => {
		setEntry(newEntry);
	}, []);

	useEffect(() => {
		const node = elementRef?.current;
		if (!node) {
			return;
		}

		const observer = new ResizeObserver(updateEntry);
		observer.observe(node);

		return () => observer.disconnect();
	}, [elementRef, updateEntry]);

	return entry;
}

/**
 * Node-based observer: pass the element itself (from a callback ref feeding
 * state), not a RefObject. Depending on the node makes the effect re-run the
 * moment the element actually mounts — even when the first render was a
 * placeholder — observing it then and disconnecting on change/unmount. A
 * `.current` mutation never re-runs an effect, which is exactly the trap the
 * RefObject variant falls into behind a conditional first render.
 */
export function useResizeObserverNode(node: Element | null): ResizeObserverEntry | undefined {
	const [entry, setEntry] = useState<ResizeObserverEntry>();

	useEffect(() => {
		if (!node) {
			return;
		}

		const observer = new ResizeObserver(([newEntry]) => {
			setEntry(newEntry);
		});
		observer.observe(node);

		return () => observer.disconnect();
	}, [node]);

	return entry;
}
