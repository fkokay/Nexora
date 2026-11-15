import { useEffect, useRef, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { Braces, FileText, Save, Search, WrapText } from "lucide-react";
import "./workspace-code-editor.css";

type WorkspaceCodeEditorProps = {
  path: string;
  value: string;
  readOnly?: boolean;
  dirty?: boolean;
  saving?: boolean;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
};

type MonacoApi = typeof import("monaco-editor");
type CodeEditor = Parameters<OnMount>[0];

const THEME_NAME = "nexora-studio-dark";

// Dosya uzantısı → Monaco dil kimliği ve durum çubuğunda gösterilen ad.
const LANGUAGES: Record<string, { id: string; label: string }> = {
  cs: { id: "csharp", label: "C#" },
  ts: { id: "typescript", label: "TypeScript" },
  tsx: { id: "typescript", label: "TypeScript JSX" },
  js: { id: "javascript", label: "JavaScript" },
  jsx: { id: "javascript", label: "JavaScript JSX" },
  mjs: { id: "javascript", label: "JavaScript" },
  cjs: { id: "javascript", label: "JavaScript" },
  json: { id: "json", label: "JSON" },
  css: { id: "css", label: "CSS" },
  html: { id: "html", label: "HTML" },
  htm: { id: "html", label: "HTML" },
  sql: { id: "sql", label: "SQL" },
  md: { id: "markdown", label: "Markdown" },
  xml: { id: "xml", label: "XML" },
  csproj: { id: "xml", label: "XML" },
  props: { id: "xml", label: "XML" },
  yaml: { id: "yaml", label: "YAML" },
  yml: { id: "yaml", label: "YAML" },
};

const PLAIN_TEXT = { id: "plaintext", label: "Düz metin" };

function languageForPath(path: string) {
  const name = path.split("/").filter(Boolean).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return PLAIN_TEXT;
  return LANGUAGES[name.slice(dot + 1).toLowerCase()] ?? PLAIN_TEXT;
}

// Model URI'si dosya uzantısını taşır; TypeScript çalışanı .tsx/.jsx dosyalarını
// JSX olarak ancak böyle ayrıştırır.
function modelPathFor(path: string) {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return clean ? `file:///workspace/${clean}` : undefined;
}

type MonacoWorkerGlobal = typeof globalThis & {
  MonacoEnvironment?: { getWorker: (moduleId: string, label: string) => Worker };
};

function readToken(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : fallback;
}

function defineStudioTheme(monaco: MonacoApi) {
  // defineTheme yalnız hex kabul eder; --ns-code-* token'ları okunur,
  // bulunamazsa tokens.css'teki değerler kullanılır.
  const bg = readToken("--ns-code-bg", "#1e1e2a");
  const panel = readToken("--ns-code-panel", "#262636");
  const line = readToken("--ns-code-line", "#34344a");
  const text = readToken("--ns-code-text", "#d4d7e3");
  const muted = readToken("--ns-code-muted", "#8b8fa6");
  const accent = "#6844df";

  monaco.editor.defineTheme(THEME_NAME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7f849c", fontStyle: "italic" },
      { token: "keyword", foreground: "b4a1ff" },
      { token: "string", foreground: "a6d189" },
      { token: "number", foreground: "f5a97f" },
      { token: "type", foreground: "8bd5ca" },
    ],
    colors: {
      "editor.background": bg,
      "editor.foreground": text,
      "editorGutter.background": bg,
      "editorLineNumber.foreground": muted,
      "editorLineNumber.activeForeground": text,
      "editor.lineHighlightBackground": panel,
      "editor.lineHighlightBorder": panel,
      "editorCursor.foreground": "#b4a1ff",
      "editor.selectionBackground": `${accent}66`,
      "editor.inactiveSelectionBackground": `${accent}33`,
      "editor.selectionHighlightBackground": `${accent}2e`,
      "editor.findMatchBackground": `${accent}88`,
      "editor.findMatchHighlightBackground": `${accent}40`,
      "editorIndentGuide.background1": line,
      "editorIndentGuide.activeBackground1": muted,
      "editorWhitespace.foreground": line,
      "editorBracketMatch.background": `${accent}33`,
      "editorBracketMatch.border": accent,
      "editorOverviewRuler.border": bg,
      "editorWidget.background": panel,
      "editorWidget.border": line,
      "editorSuggestWidget.background": panel,
      "editorSuggestWidget.border": line,
      "editorSuggestWidget.selectedBackground": `${accent}55`,
      "editorHoverWidget.background": panel,
      "editorHoverWidget.border": line,
      "input.background": bg,
      "input.border": line,
      "inputOption.activeBorder": accent,
      "inputOption.activeBackground": `${accent}55`,
      focusBorder: accent,
      "scrollbarSlider.background": `${line}aa`,
      "scrollbarSlider.hoverBackground": `${muted}88`,
      "scrollbarSlider.activeBackground": `${accent}99`,
      "minimap.background": bg,
    },
  });
}

let monacoReady: Promise<MonacoApi> | null = null;

// Monaco ve çalışanları yerel paketten, ayrı parçalar halinde yüklenir.
// CDN kullanılmaz; Editor bileşeni bu söz tamamlanmadan bağlanmaz.
function loadMonaco() {
  monacoReady ??= (async () => {
    // Çalışanlar Vite'ın `new Worker(new URL(...))` kalıbıyla ayrı dosyalar
    // olarak paketlenir ve aynı kaynaktan yüklenir. `?worker` modüllerinin
    // dinamik importu Monaco parça grubunda yanlış dışa aktarıma çözülüyor.
    (globalThis as MonacoWorkerGlobal).MonacoEnvironment = {
      getWorker: (_moduleId, label) => {
        if (label === "json")
          return new Worker(
            new URL("../node_modules/monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url),
            { type: "module", name: label },
          );
        if (label === "css" || label === "scss" || label === "less")
          return new Worker(
            new URL("../node_modules/monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url),
            { type: "module", name: label },
          );
        if (label === "html" || label === "handlebars" || label === "razor")
          return new Worker(
            new URL("../node_modules/monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url),
            { type: "module", name: label },
          );
        if (label === "typescript" || label === "javascript")
          return new Worker(
            new URL("../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url),
            { type: "module", name: label },
          );
        return new Worker(
          new URL("../node_modules/monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
          { type: "module", name: label },
        );
      },
    };
    // Bul/değiştir gibi yerleşik arayüz metinleri için Türkçe ileti paketi.
    await import("monaco-editor/nls/lang/tr.js");
    const monaco = await import("monaco-editor");

    // Tek dosya proje bağlamı olmadan açıldığı için anlamsal denetim sahte
    // hatalar üretir; yalnız sözdizimi denetimi açık kalır.
    for (const defaults of [
      monaco.typescript.typescriptDefaults,
      monaco.typescript.javascriptDefaults,
    ]) {
      defaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
      defaults.setCompilerOptions({
        ...defaults.getCompilerOptions(),
        jsx: monaco.typescript.JsxEmit.Preserve,
        allowJs: true,
        allowNonTsExtensions: true,
        target: monaco.typescript.ScriptTarget.ESNext,
      });
    }

    defineStudioTheme(monaco);
    loader.config({ monaco });
    return monaco;
  })().catch((error) => {
    monacoReady = null;
    throw error;
  });
  return monacoReady;
}

function EditorSkeleton() {
  return (
    <div className="ns-code-editor__skeleton" role="status" aria-live="polite">
      <span className="ns-code-editor__sr">Kod düzenleyicisi yükleniyor…</span>
      {[72, 48, 86, 60, 34, 78, 52, 66, 40, 70].map((width, index) => (
        <div key={index} className="ns-code-editor__skeleton-row" aria-hidden="true">
          <i />
          <b style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceCodeEditor({
  path,
  value,
  readOnly = false,
  dirty = false,
  saving = false,
  onChange,
  onSave,
}: WorkspaceCodeEditorProps) {
  const editorRef = useRef<CodeEditor | null>(null);
  const valueRef = useRef(value);
  const onSaveRef = useRef(onSave);
  const readOnlyRef = useRef(readOnly);
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [wordWrap, setWordWrap] = useState(true);

  valueRef.current = value;
  onSaveRef.current = onSave;
  readOnlyRef.current = readOnly;

  const fileName = path.split("/").filter(Boolean).at(-1) ?? path;
  const folders = path.split("/").filter(Boolean).slice(0, -1);
  const language = languageForPath(path);

  useEffect(() => {
    let cancelled = false;
    loadMonaco().then(
      () => {
        if (!cancelled) setMonacoLoaded(true);
      },
      (error: unknown) => {
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const currentValue = () => editorRef.current?.getValue() ?? valueRef.current;

  // Ctrl+S (Mac: ⌘S) önceki davranış gibi pencere düzeyinde dinlenir.
  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        !readOnlyRef.current
      ) {
        event.preventDefault();
        onSaveRef.current?.(currentValue());
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, []);

  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? "on" : "off" });
  }, [wordWrap]);

  // Yol değişince (ör. yeni dosya oluştururken yol yazılırken) Editor yeni bir
  // modele geçer. Eski model bırakılır ve aynı yola dönülürse bayat içerik
  // görünmesin diye yeni modelin metni her zaman güncel value ile eşitlenir.
  const modelPath = modelPathFor(path);
  const previousModelRef = useRef<ReturnType<CodeEditor["getModel"]>>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    const previous = previousModelRef.current;
    if (previous && previous !== model && !previous.isDisposed()) previous.dispose();
    previousModelRef.current = model;
    if (model && model.getValue() !== valueRef.current) model.setValue(valueRef.current);
  }, [modelPath]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    previousModelRef.current = editor.getModel();
    const position = editor.getPosition();
    if (position) setCursor({ line: position.lineNumber, column: position.column });
    editor.onDidChangeCursorPosition((event) => {
      setCursor({
        line: event.position.lineNumber,
        column: event.position.column,
      });
    });
    editor.onDidDispose(() => {
      if (editorRef.current === editor) editorRef.current = null;
    });
  };

  const openFind = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void editor.getAction("actions.find")?.run();
  };

  return (
    <section
      className={`studio-vscode ns-code-editor ${readOnly ? "is-readonly" : "is-editable"}`}
      aria-label={readOnly ? "Kod dosyası önizlemesi" : "Kod düzenleyicisi"}
    >
      <header className="ns-code-editor__bar">
        <nav className="ns-code-editor__crumbs" aria-label="Dosya yolu">
          <span className="ns-code-editor__folders" title={path}>
            {folders.length ? folders.join(" › ") : "Proje kökü"}
          </span>
          <span className="ns-code-editor__sep" aria-hidden="true">
            ›
          </span>
          <b className="ns-code-editor__file">
            <FileText size={13} aria-hidden="true" />
            {fileName || "Yeni dosya"}
          </b>
        </nav>
        <div
          className="ns-code-editor__actions"
          role="toolbar"
          aria-label="Dosya düzenleyici araçları"
        >
          <button
            type="button"
            className="ns-code-editor__icon-btn"
            title="Dosyada bul (Ctrl+F)"
            aria-label="Dosyada bul"
            disabled={!monacoLoaded}
            onClick={openFind}
          >
            <Search size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`ns-code-editor__icon-btn ${wordWrap ? "is-on" : ""}`}
            title={wordWrap ? "Satır kaydırmayı kapat" : "Satırları kaydır"}
            aria-label="Satır kaydırma"
            aria-pressed={wordWrap}
            onClick={() => setWordWrap((on) => !on)}
          >
            <WrapText size={15} aria-hidden="true" />
          </button>
          {!readOnly && (
            <button
              type="button"
              className="ns-code-editor__save"
              title="Kaydet (Ctrl+S)"
              disabled={!dirty || saving}
              onClick={() => onSave?.(currentValue())}
            >
              <Save size={14} aria-hidden="true" />
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          )}
        </div>
      </header>

      <div className="ns-code-editor__canvas">
        {loadError ? (
          <div className="ns-code-editor__error" role="alert">
            <b>Kod düzenleyicisi yüklenemedi.</b>
            <span>{loadError}</span>
          </div>
        ) : !monacoLoaded ? (
          <EditorSkeleton />
        ) : (
          <Editor
            path={modelPath}
            language={language.id}
            value={value}
            theme={THEME_NAME}
            loading={<EditorSkeleton />}
            onMount={handleMount}
            onChange={(next) => onChange?.(next ?? "")}
            options={{
              readOnly,
              domReadOnly: readOnly,
              readOnlyMessage: {
                value: "Bu dosya salt okunur önizlemede açık.",
              },
              ariaLabel: `${fileName || "Yeni dosya"} kaynak kodu`,
              wordWrap: wordWrap ? "on" : "off",
              automaticLayout: true,
              fontFamily:
                "'JetBrains Mono', 'Cascadia Code', Consolas, 'Courier New', monospace",
              fontSize: 13,
              lineHeight: 21,
              tabSize: 2,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              renderLineHighlight: "all",
              padding: { top: 12, bottom: 12 },
              fixedOverflowWidgets: true,
              stickyScroll: { enabled: false },
              unicodeHighlight: { ambiguousCharacters: false },
            }}
          />
        )}
      </div>

      <footer className="ns-code-editor__status" aria-label="Düzenleyici durumu">
        <div className="ns-code-editor__status-group">
          {readOnly ? (
            <span className="ns-code-editor__pill is-readonly">Salt okunur</span>
          ) : saving ? (
            <span className="ns-code-editor__pill is-saving">Kaydediliyor…</span>
          ) : dirty ? (
            <span className="ns-code-editor__pill is-dirty">Kaydedilmedi</span>
          ) : null}
        </div>
        <div className="ns-code-editor__status-group">
          <span aria-live="off">
            Satır {cursor.line}, Sütun {cursor.column}
          </span>
          <span className="ns-code-editor__language">
            <Braces size={12} aria-hidden="true" />
            {language.label}
          </span>
        </div>
      </footer>
    </section>
  );
}

export default WorkspaceCodeEditor;
