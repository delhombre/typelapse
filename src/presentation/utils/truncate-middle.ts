/**
 * Truncates a string in the middle, preserving the start and end.
 * e.g. "gouvernement" → "gouv…ment" at maxLength 8
 */
export function truncateMiddle(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	const ellipsis = "…";
	const available = maxLength - ellipsis.length;
	const startLen = Math.ceil(available / 2);
	const endLen = Math.floor(available / 2);

	return `${text.slice(0, startLen)}${ellipsis}${text.slice(-endLen)}`;
}
