/**
 * Hand a project file to the browser's downloads, named after its title
 * ("My Project" saves as `my-project.json`). The studio's "Export project
 * file" and the recovery's "Download it" both save through here.
 */
export function saveJsonFile(json: string, title: string): void {
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.json`;
	a.click();
	URL.revokeObjectURL(url);
}
