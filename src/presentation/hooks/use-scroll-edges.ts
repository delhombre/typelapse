import { type RefObject, useCallback, useEffect, useState } from "react";

/**
 * Which edges of a scroller have more to show. The edge with more fades, so a
 * row cut in half reads as more to come; the edge with nothing further stays
 * sharp, so the last row is never half hidden. Re-measured after every render,
 * since rows come and go.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
	const [edges, setEdges] = useState({ above: false, below: false });
	const measure = useCallback(() => {
		const node = ref.current;
		if (!node) return;
		const above = node.scrollTop > 1;
		const below = node.scrollTop + node.clientHeight < node.scrollHeight - 1;
		setEdges((now) => (now.above === above && now.below === below ? now : { above, below }));
	}, [ref]);
	useEffect(() => {
		measure();
	});
	return { edges, measure };
}
