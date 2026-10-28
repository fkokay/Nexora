import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import { Braces, Check, Columns2, FileCode2, FileText, Search, Save, WrapText } from 'lucide-react'
import './monacoSetup'

type WorkspaceCodeEditorProps = {
  path: string
  value: string
  readOnly?: boolean
  dirty?: boolean
  saving?: boolean
  onChange?: (value: string) => void
  onSave?: (value: string) => void
}

const languageForPath = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const languages: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html', razor: 'razor',
    json: 'json', jsonc: 'json', md: 'markdown', mdx: 'markdown', py: 'python', sql: 'sql',
    xml: 'xml', svg: 'xml', yaml: 'yaml', yml: 'yaml', cs: 'csharp', java: 'java', go: 'go',
    rs: 'rust', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp', sh: 'shell', bash: 'shell',
    ps1: 'powershell', psd1: 'powershell', dockerfile: 'dockerfile',
  }
  return languages[extension] ?? 'plaintext'
}

const labelForLanguage = (language: string) => ({
  typescript: 'TypeScript React', javascript: 'JavaScript', csharp: 'C#',
  plaintext: 'Düz metin', powershell: 'PowerShell',
}[language] ?? language.toUpperCase())

export function WorkspaceCodeEditor({ path, value, readOnly = false, dirty = false, saving = false, onChange, onSave }: WorkspaceCodeEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const disposablesRef = useRef<IDisposable[]>([])
  const saveRef = useRef(onSave)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [diagnostics, setDiagnostics] = useState(0)
  const [wordWrap, setWordWrap] = useState(false)
  const [minimap, setMinimap] = useState(true)
  const language = languageForPath(path)
  const fileName = path.split('/').filter(Boolean).at(-1) ?? path
  const byteLength = new TextEncoder().encode(value).length

  saveRef.current = onSave

  const onMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor
    const updateCursor = () => {
      const position = editor.getPosition()
      if (position) setCursor({ line: position.lineNumber, column: position.column })
    }
    const updateDiagnostics = () => {
      const model = editor.getModel()
      setDiagnostics(model ? monaco.editor.getModelMarkers({ resource: model.uri }).filter((marker: MonacoEditor.IMarker) => marker.severity === monaco.MarkerSeverity.Error).length : 0)
    }
    disposablesRef.current = [
      editor.onDidChangeCursorPosition(updateCursor),
      monaco.editor.onDidChangeMarkers(updateDiagnostics),
      editor.onDidChangeModel(updateDiagnostics),
    ]
    if (!readOnly) editor.focus()
    editor.addAction({
      id: 'nexora-save-workspace-file',
      label: 'Workspace dosyasını kaydet',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => { saveRef.current?.(editor.getValue()) },
    })
    updateCursor()
    updateDiagnostics()
  }, [])

  useEffect(() => () => {
    disposablesRef.current.forEach(disposable => disposable.dispose())
    disposablesRef.current = []
    editorRef.current = null
  }, [])

  const runFind = () => {
    const editor = editorRef.current
    if (editor) void editor.getAction('actions.find')?.run()
  }
  const toggleWordWrap = () => {
    const editor = editorRef.current
    if (!editor) return
    const next = !wordWrap
    setWordWrap(next)
    editor.updateOptions({ wordWrap: next ? 'on' : 'off' })
  }
  const toggleMinimap = () => {
    const editor = editorRef.current
    if (!editor) return
    const next = !minimap
    setMinimap(next)
    editor.updateOptions({ minimap: { enabled: next } })
  }

  return <section className={`studio-vscode ${readOnly ? 'is-readonly' : 'is-editable'}`} aria-label={readOnly ? 'Kod dosyası önizlemesi' : 'Kod düzenleyicisi'}>
    <div className="studio-vscode-tabs">
      <div className="studio-vscode-tab is-active"><FileCode2 size={15}/><span>{fileName}</span>{dirty ? <i className="studio-vscode-unsaved" title="Kaydedilmemiş değişiklik"/> : <Check size={12} className="studio-vscode-saved"/>}</div>
      <span className="studio-vscode-tab-spacer"/>
      <div className="studio-vscode-actions">
        <button type="button" title="Bul (Ctrl+F)" aria-label="Kod içinde bul" onClick={runFind}><Search size={15}/></button>
        <button type="button" title={wordWrap ? 'Satır kaydırmayı kapat' : 'Satırları kaydır'} aria-label="Satır kaydırmayı değiştir" className={wordWrap ? 'is-on' : ''} onClick={toggleWordWrap}><WrapText size={15}/></button>
        <button type="button" title={minimap ? 'Minimap’i kapat' : 'Minimap’i aç'} aria-label="Minimap görünümünü değiştir" className={minimap ? 'is-on' : ''} onClick={toggleMinimap}><Columns2 size={15}/></button>
        {!readOnly && <button type="button" title="Kaydet (Ctrl+S)" aria-label="Workspace dosyasını kaydet" className="studio-vscode-save" disabled={!dirty || saving} onClick={() => onSave?.(editorRef.current?.getValue() ?? value)}><Save size={14}/> {saving ? 'Kaydediliyor…' : 'Kaydet'}</button>}
      </div>
    </div>
    <div className="studio-vscode-breadcrumbs"><span>{path.split('/').filter(Boolean).slice(0,-1).join('  ›  ') || 'Proje kökü'}</span><span className="studio-vscode-breadcrumb-separator">›</span><b><FileText size={13}/>{fileName}</b><span className="studio-vscode-language"><Braces size={13}/>{labelForLanguage(language)}</span></div>
    <div className="studio-vscode-canvas">
      <Editor
        height="100%"
        path={`workspace://${path}`}
        language={language}
        value={value}
        theme="nexora-vscode-dark"
        onChange={next => onChange?.(next ?? '')}
        onMount={onMount}
        options={{
          readOnly,
          automaticLayout: true,
          fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
          fontSize: 13,
          lineHeight: 21,
          fontLigatures: true,
          minimap: { enabled: minimap, side: 'right', size: 'fit', showSlider: 'mouseover' },
          lineNumbers: 'on',
          renderLineHighlight: 'all',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: 'on',
          cursorBlinking: 'smooth',
          bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
          guides: { indentation: true, bracketPairs: true, highlightActiveIndentation: true },
          matchBrackets: 'always',
          folding: true,
          stickyScroll: { enabled: true },
          wordWrap: wordWrap ? 'on' : 'off',
          tabSize: 2,
          insertSpaces: true,
          padding: { top: 12, bottom: 18 },
          contextmenu: true,
          mouseWheelZoom: true,
          overviewRulerBorder: false,
          scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12, alwaysConsumeMouseWheel: false },
          unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true },
          quickSuggestions: !readOnly,
          suggestOnTriggerCharacters: !readOnly,
          parameterHints: { enabled: !readOnly },
          'semanticHighlighting.enabled': true,
        }}
      />
    </div>
    <div className="studio-vscode-statusbar"><div className="studio-vscode-status-left"><span className={readOnly ? 'status-readonly' : 'status-workspace'}>{readOnly ? 'ÖNİZLEME · SALT OKUNUR' : 'İZOLE WORKSPACE'}</span><span>{diagnostics ? `${diagnostics} hata` : 'Sorun yok'}</span></div><div className="studio-vscode-status-right"><span>Ln {cursor.line}, Col {cursor.column}</span><span>UTF-8</span><span>Spaces: 2</span><span>{byteLength.toLocaleString('tr-TR')} bayt</span></div></div>
  </section>
}
