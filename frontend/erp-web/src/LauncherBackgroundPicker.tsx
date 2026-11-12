import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Paintbrush, RotateCcw, X } from "lucide-react";
import {
  LAUNCHER_COLOR_PRESETS,
  LAUNCHER_IMAGE_PRESETS,
  launcherBackgroundText,
  normalizeImageUrl,
  prepareUploadedBackground,
  type LauncherBackground,
  type LauncherBackgroundTextKey,
} from "./launcher-background";
import "./launcher-background.css";

type LauncherBackgroundPickerProps = {
  english: boolean;
  background: LauncherBackground;
  /** Applies and stores the choice; returns false when browser storage refused it. */
  onChange: (background: LauncherBackground) => boolean;
};

export function LauncherBackgroundPicker({ english, background, onChange }: LauncherBackgroundPickerProps) {
  const [open, setOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState(background.kind === "image" && background.source === "url" ? background.value : "");
  const [message, setMessage] = useState<LauncherBackgroundTextKey | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = (key: LauncherBackgroundTextKey) => launcherBackgroundText(key, english);
  const customColor = background.kind === "color" && background.value.startsWith("#") ? background.value : "#eef1f8";

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (next: LauncherBackground) => {
    setMessage(onChange(next) ? null : "storageFull");
  };
  const isSelected = (kind: LauncherBackground["kind"], value?: string) =>
    background.kind === kind && (kind === "default" || (background.kind !== "default" && background.value === value));

  const uploadFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage("processing");
    try {
      const dataUrl = await prepareUploadedBackground(file);
      choose({ kind: "image", value: dataUrl, source: "upload" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setMessage(reason === "notImage" || reason === "tooLarge" ? reason : "unreadable");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyUrl = () => {
    const url = normalizeImageUrl(urlDraft);
    if (!url) { setMessage("invalidUrl"); return; }
    choose({ kind: "image", value: url, source: "url" });
  };

  return (
    <div className="launcher-background-picker" ref={rootRef}>
      <button
        type="button"
        className="launcher-background-toggle"
        aria-expanded={open}
        aria-controls="launcher-background-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Paintbrush size={13} />{t("open")}
      </button>
      {open && (
        <div className="launcher-background-panel" id="launcher-background-panel" role="dialog" aria-label={t("title")}>
          <header>
            <strong>{t("title")}</strong>
            <button type="button" className="launcher-background-close" aria-label={t("close")} onClick={() => setOpen(false)}><X size={14} /></button>
          </header>
          <section aria-label={t("colors")}>
            <span className="launcher-background-label">{t("colors")}</span>
            <div className="launcher-background-swatches">
              {LAUNCHER_COLOR_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="launcher-background-swatch"
                  style={{ background: preset.value }}
                  aria-pressed={isSelected("color", preset.value)}
                  title={english ? preset.en : preset.tr}
                  aria-label={english ? preset.en : preset.tr}
                  onClick={() => choose({ kind: "color", value: preset.value })}
                >
                  {isSelected("color", preset.value) && <Check size={14} />}
                </button>
              ))}
              <label className="launcher-background-swatch launcher-background-custom" title={t("customColor")} data-selected={background.kind === "color" && background.value.startsWith("#") && !LAUNCHER_COLOR_PRESETS.some((preset) => preset.value === background.value)}>
                <input
                  type="color"
                  value={customColor}
                  aria-label={t("customColor")}
                  onChange={(event) => choose({ kind: "color", value: event.target.value.toLowerCase() })}
                />
              </label>
            </div>
          </section>
          <section aria-label={t("images")}>
            <span className="launcher-background-label">{t("images")}</span>
            <div className="launcher-background-images">
              {LAUNCHER_IMAGE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className="launcher-background-thumb"
                  style={{ backgroundImage: `url("${preset.value}")` }}
                  aria-pressed={isSelected("image", preset.value)}
                  title={english ? preset.en : preset.tr}
                  aria-label={english ? preset.en : preset.tr}
                  onClick={() => choose({ kind: "image", value: preset.value, source: "builtin" })}
                >
                  {isSelected("image", preset.value) && <Check size={14} />}
                </button>
              ))}
            </div>
            <button type="button" className="launcher-background-upload" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImagePlus size={14} />{t("upload")}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => void uploadFile(event.target.files?.[0])} />
            <small className="launcher-background-hint">{t("uploadHint")}</small>
            <form className="launcher-background-url" onSubmit={(event) => { event.preventDefault(); applyUrl(); }}>
              <input
                type="url"
                value={urlDraft}
                placeholder={t("urlPlaceholder")}
                aria-label={t("urlLabel")}
                onChange={(event) => setUrlDraft(event.target.value)}
              />
              <button type="submit">{t("apply")}</button>
            </form>
          </section>
          {message && <p className="launcher-background-message" role="status">{t(message)}</p>}
          <button type="button" className="launcher-background-reset" aria-pressed={isSelected("default")} onClick={() => { setUrlDraft(""); choose({ kind: "default" }); }}>
            <RotateCcw size={13} />{t("reset")}
          </button>
        </div>
      )}
    </div>
  );
}
