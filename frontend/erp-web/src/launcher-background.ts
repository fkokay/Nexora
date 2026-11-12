import type { CSSProperties } from "react";

/**
 * Launcher dashboard background preference. Stored in browser storage next to the
 * dashboard layout (same per-user, per-tenant key), so it follows the layout's rules.
 */
export type LauncherBackground =
  | { kind: "default" }
  | { kind: "color"; value: string }
  | { kind: "image"; value: string; source: "builtin" | "upload" | "url" };

export const DEFAULT_LAUNCHER_BACKGROUND: LauncherBackground = { kind: "default" };

/** Uploaded images are re-encoded client-side and must stay under this size as a data URL. */
export const MAX_UPLOADED_BACKGROUND_BYTES = 1_200_000;
const MAX_UPLOADED_BACKGROUND_EDGE = 1920;

export type LauncherBackgroundPreset = { id: string; value: string; tr: string; en: string };

export const LAUNCHER_COLOR_PRESETS: LauncherBackgroundPreset[] = [
  { id: "mist", value: "#eef1f8", tr: "Sis", en: "Mist" },
  { id: "lavender", value: "linear-gradient(135deg, #e9e4ff 0%, #f6efff 50%, #e3ecff 100%)", tr: "Lavanta", en: "Lavender" },
  { id: "sunrise", value: "linear-gradient(135deg, #ffe8d6 0%, #fdf0f3 50%, #e6e9ff 100%)", tr: "Gün doğumu", en: "Sunrise" },
  { id: "mint", value: "linear-gradient(135deg, #dff7ee 0%, #eefaf5 50%, #e0f0fb 100%)", tr: "Nane", en: "Mint" },
  { id: "ocean", value: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #0ea5e9 100%)", tr: "Okyanus", en: "Ocean" },
  { id: "midnight", value: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)", tr: "Gece yarısı", en: "Midnight" },
];

export const LAUNCHER_IMAGE_PRESETS: LauncherBackgroundPreset[] = [
  { id: "mountain", value: "/dashboard-mountain-sunrise.png", tr: "Dağ manzarası", en: "Mountain view" },
  { id: "aurora", value: "/launcher-backgrounds/aurora.svg", tr: "Kuzey ışıkları", en: "Aurora" },
  { id: "waves", value: "/launcher-backgrounds/waves.svg", tr: "Dalgalar", en: "Waves" },
  { id: "dunes", value: "/launcher-backgrounds/dunes.svg", tr: "Kum tepeleri", en: "Dunes" },
];

/** UI text for the background picker (Turkish source → English). */
export const LAUNCHER_BACKGROUND_TEXT = {
  open: { tr: "Arka plan", en: "Background" },
  title: { tr: "Ana ekran arka planı", en: "Dashboard background" },
  colors: { tr: "Renk", en: "Colour" },
  customColor: { tr: "Özel renk", en: "Custom colour" },
  images: { tr: "Görsel", en: "Image" },
  upload: { tr: "Görsel yükle", en: "Upload image" },
  urlLabel: { tr: "Görsel bağlantısı", en: "Image link" },
  urlPlaceholder: { tr: "https://…", en: "https://…" },
  apply: { tr: "Uygula", en: "Apply" },
  reset: { tr: "Varsayılana dön", en: "Reset to default" },
  close: { tr: "Kapat", en: "Close" },
  processing: { tr: "Görsel hazırlanıyor…", en: "Preparing image…" },
  uploadHint: { tr: "Görsel bu tarayıcıda saklanır ve en fazla 1920 piksele küçültülür.", en: "The image is stored in this browser and scaled down to at most 1920 pixels." },
  notImage: { tr: "Lütfen bir görsel dosyası seçin.", en: "Please choose an image file." },
  tooLarge: { tr: "Görsel çok büyük. Daha küçük bir dosya deneyin.", en: "The image is too large. Try a smaller file." },
  unreadable: { tr: "Görsel okunamadı.", en: "The image could not be read." },
  invalidUrl: { tr: "Geçerli bir http(s) görsel bağlantısı girin.", en: "Enter a valid http(s) image link." },
  storageFull: { tr: "Arka plan bu tarayıcıya kaydedilemedi; yalnızca bu oturumda geçerli.", en: "The background could not be saved in this browser; it applies to this session only." },
} as const;

export type LauncherBackgroundTextKey = keyof typeof LAUNCHER_BACKGROUND_TEXT;
export const launcherBackgroundText = (key: LauncherBackgroundTextKey, english: boolean) => LAUNCHER_BACKGROUND_TEXT[key][english ? "en" : "tr"];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isSafeImageUrl(value: string) {
  if (value.startsWith("data:image/")) return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value);
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizeImageUrl(input: string): string | null {
  const value = input.trim();
  if (!value || /["'()\\\s]/.test(value)) return null;
  return isSafeImageUrl(value) && !value.startsWith("data:") ? value : null;
}

function isValidBackground(value: unknown): value is LauncherBackground {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "default") return true;
  if (candidate.kind === "color" && typeof candidate.value === "string") {
    return HEX_COLOR.test(candidate.value) || LAUNCHER_COLOR_PRESETS.some((preset) => preset.value === candidate.value);
  }
  if (candidate.kind === "image" && typeof candidate.value === "string" && ["builtin", "upload", "url"].includes(String(candidate.source))) {
    return !/["'()\\\s]/.test(candidate.value) && isSafeImageUrl(candidate.value);
  }
  return false;
}

export const launcherBackgroundKey = (dashboardPreferenceKey: string) => `${dashboardPreferenceKey}:background`;

export function loadLauncherBackground(dashboardPreferenceKey: string): LauncherBackground {
  try {
    const saved = window.localStorage.getItem(launcherBackgroundKey(dashboardPreferenceKey));
    if (!saved) return DEFAULT_LAUNCHER_BACKGROUND;
    const parsed: unknown = JSON.parse(saved);
    return isValidBackground(parsed) ? parsed : DEFAULT_LAUNCHER_BACKGROUND;
  } catch {
    return DEFAULT_LAUNCHER_BACKGROUND;
  }
}

/** Returns false when browser storage refused the value (e.g. quota exceeded). */
export function saveLauncherBackground(dashboardPreferenceKey: string, background: LauncherBackground): boolean {
  try {
    const key = launcherBackgroundKey(dashboardPreferenceKey);
    if (background.kind === "default") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(background));
    return true;
  } catch {
    return false;
  }
}

/** Class name and inline custom properties for `div.module-launcher`; the CSS reads them in both themes. */
export function launcherBackgroundProps(background: LauncherBackground): { className: string; style?: CSSProperties } {
  if (background.kind === "color") {
    const isGradient = background.value.startsWith("linear-gradient");
    return {
      className: "has-custom-background is-color-background",
      style: {
        "--launcher-bg-color": isGradient ? "#e9edf8" : background.value,
        "--launcher-bg-fill": isGradient ? background.value : "none",
      } as CSSProperties,
    };
  }
  if (background.kind === "image") {
    return {
      className: "has-custom-background is-image-background",
      style: { "--launcher-bg-fill": `url("${background.value}")` } as CSSProperties,
    };
  }
  return { className: "" };
}

/** Scales an uploaded image down and re-encodes it as a JPEG data URL small enough for browser storage. */
export async function prepareUploadedBackground(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("notImage");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("unreadable"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, MAX_UPLOADED_BACKGROUND_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("unreadable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_UPLOADED_BACKGROUND_BYTES) return dataUrl;
    }
    throw new Error("tooLarge");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
