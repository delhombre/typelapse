export const FIGURES: readonly string[];
export const LINE_LIMIT: number;
export function bridge(name: string, dir?: string): Promise<string>;
export function lineCount(js: string): number;
