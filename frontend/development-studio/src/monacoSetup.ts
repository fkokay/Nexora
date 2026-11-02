import * as monaco from '../node_modules/monaco-editor/esm/vs/editor/editor.api.js'
import { loader } from '@monaco-editor/react'
import EditorWorker from '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker'
import JsonWorker from '../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker'
import CssWorker from '../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker'
import HtmlWorker from '../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker'
import TypeScriptWorker from '../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'

type MonacoWorkerGlobal = typeof globalThis & {
  MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker }
}

const workerGlobal = globalThis as MonacoWorkerGlobal
workerGlobal.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  },
}

monaco.editor.defineTheme('nexora-vscode-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0d1725',
    'editorGutter.background': '#0d1725',
    'editorLineNumber.foreground': '#586b80',
    'editorLineNumber.activeForeground': '#d6e5f5',
    'editor.lineHighlightBackground': '#17263a',
    'editorIndentGuide.background1': '#233449',
    'editorIndentGuide.activeBackground1': '#46627f',
    'editor.selectionBackground': '#245c8a80',
    'editorOverviewRuler.border': '#0d1725',
    'minimap.background': '#0d1725',
  },
})

loader.config({ monaco })
