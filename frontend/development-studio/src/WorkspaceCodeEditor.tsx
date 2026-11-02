import { useEffect, useRef, useState } from "react";
import { Braces, FileText, Search, Save, WrapText } from "lucide-react";
import "./studio.css";

type WorkspaceCodeEditorProps = {
  path: string;
  value: string;
  readOnly?: boolean;
  dirty?: boolean;
  saving?: boolean;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
};

const labelForLanguage = (path: string) =>
  path.split(".").pop()?.toUpperCase() ?? "TEXT";

export function WorkspaceCodeEditor({
  path,
  value,
  readOnly = false,
  dirty = false,
  saving = false,
  onChange,
  onSave,
}: WorkspaceCodeEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [wordWrap, setWordWrap] = useState(true);
  const fileName = path.split("/").filter(Boolean).at(-1) ?? path;
  const byteLength = new TextEncoder().encode(value).length;

  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        !readOnly
      ) {
        event.preventDefault();
        onSave?.(inputRef.current?.value ?? value);
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [onSave, readOnly, value]);

  const updateCursor = () => {
    const input = inputRef.current;
    if (!input) return;
    const before = input.value.slice(0, input.selectionStart);
    const lines = before.split("\n");
    setCursor({ line: lines.length, column: lines.at(-1)!.length + 1 });
  };

  return (
    <section
      className={`studio-vscode ${readOnly ? "is-readonly" : "is-editable"}`}
      aria-label={readOnly ? "Kod dosyası önizlemesi" : "Kod düzenleyicisi"}
    >
      <div
        className="studio-vscode-tabs"
        role="toolbar"
        aria-label="Dosya düzenleyici araçları"
      >
        <div className="studio-vscode-actions">
          <button
            type="button"
            title="Bul (Ctrl+F)"
            aria-label="Kod içinde bul"
            onClick={() => {
              const query = window.prompt("Dosyada ara");
              if (query) {
                const index = value.indexOf(query);
                if (index >= 0) {
                  inputRef.current?.focus();
                  inputRef.current?.setSelectionRange(
                    index,
                    index + query.length,
                  );
                }
              }
            }}
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            title={wordWrap ? "Satır kaydırmayı kapat" : "Satırları kaydır"}
            aria-label="Satır kaydırmayı değiştir"
            className={wordWrap ? "is-on" : ""}
            onClick={() => setWordWrap((v) => !v)}
          >
            <WrapText size={15} />
          </button>
          {!readOnly && (
            <button
              type="button"
              title="Kaydet (Ctrl+S)"
              aria-label="Workspace dosyasını kaydet"
              className="studio-vscode-save"
              disabled={!dirty || saving}
              onClick={() => onSave?.(inputRef.current?.value ?? value)}
            >
              <Save size={14} /> {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          )}
        </div>
      </div>
      <div className="studio-vscode-breadcrumbs">
        <span>
          {path.split("/").filter(Boolean).slice(0, -1).join("  ›  ") ||
            "Proje kökü"}
        </span>
        <span className="studio-vscode-breadcrumb-separator">›</span>
        <b>
          <FileText size={13} />
          {fileName}
        </b>
        <span className="studio-vscode-language">
          <Braces size={13} />
          {labelForLanguage(path)}
        </span>
      </div>
      <div className="studio-vscode-canvas">
        <textarea
          ref={inputRef}
          aria-label={`${fileName} kaynak kodu`}
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          wrap={wordWrap ? "soft" : "off"}
          onChange={(event) => onChange?.(event.target.value)}
          onClick={updateCursor}
          onKeyUp={updateCursor}
          onSelect={updateCursor}
        />
      </div>
      <div className="studio-vscode-statusbar">
        <div className="studio-vscode-status-left">
          <span className={readOnly ? "status-readonly" : "status-workspace"}>
            {readOnly ? "ÖNİZLEME · SALT OKUNUR" : "İZOLE WORKSPACE"}
          </span>
          <span>Sorun yok</span>
        </div>
        <div className="studio-vscode-status-right">
          <span>
            Ln {cursor.line}, Col {cursor.column}
          </span>
          <span>UTF-8</span>
          <span>Spaces: 2</span>
          <span>{byteLength.toLocaleString("tr-TR")} bayt</span>
        </div>
      </div>
    </section>
  );
}

export default WorkspaceCodeEditor;
