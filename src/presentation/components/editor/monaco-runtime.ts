/**
 * Monaco from the app's own bundle. `@monaco-editor/react` fetches Monaco from
 * cdn.jsdelivr.net unless it is handed an instance, which left the code editor
 * on "Loading editor…" for good without a network, and local mode makes no
 * network call. This module is the one place that hands it over: imported
 * lazily by the code editor, so the editor and its workers stay out of the
 * studio's first chunk.
 */

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string): Worker {
		switch (label) {
			case "typescript":
			case "javascript":
				return new TypeScriptWorker();
			case "json":
				return new JsonWorker();
			case "css":
			case "scss":
			case "less":
				return new CssWorker();
			case "html":
			case "handlebars":
			case "razor":
				return new HtmlWorker();
			default:
				return new EditorWorker();
		}
	},
};

loader.config({ monaco });

export { default } from "@monaco-editor/react";
