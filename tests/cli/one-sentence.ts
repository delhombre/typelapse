import { expect } from "vitest";

/** One sentence: no line break, and the only full stop that ends a clause is the last character. */
export function expectOneSentence(message: string): void {
	expect(message).not.toContain("\n");
	expect(message.endsWith(".")).toBe(true);
	expect(message.slice(0, -1)).not.toMatch(/[.!?]\s/);
}
