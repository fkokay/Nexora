// Görsel panelinin saf modeli (alt proje 5a, Karar 5; dosya yükleme yok). Her işlev yeni bir tanım döner, girdiyi değiştirmez.
import type { ModelComponent, ModelDefinition } from "./listPanelModel";

export type ImageSize = "small" | "medium" | "large";
export type ImageInfo = { from: "address" | "record"; address: string; column: string | null; height: ImageSize | null; description: string };
export const IMAGE_ADDRESS_INVALID = "Adres http:// ya da https:// ile başlamalı.";
export const IMAGE_HEIGHTS: Record<ImageSize, number> = { small: 96, medium: 160, large: 280 };

const RECORD_BINDING = /^\{\{\s*[^{}.]+\.seciliSatir\.([^{}\s]+)\s*\}\}$/;
const str = (value: unknown) => (typeof value === "string" ? value : "");

export function imageOf(c: ModelComponent): ImageInfo {
  const value = str(c.props.value);
  const record = RECORD_BINDING.exec(value.trim());
  const height = (Object.entries(IMAGE_HEIGHTS).find(([, px]) => px === c.props.height)?.[0] ?? null) as ImageSize | null;
  return { from: record ? "record" : "address", address: record ? "" : value, column: record ? record[1] : null, height, description: str(c.props.title) };
}

/** Boş adres (henüz yazılmadı) sorun sayılmaz; doluysa yalnız http ya da https kabul edilir. */
export function imageAddressProblem(url: string): string | null {
  const text = url.trim();
  if (!text) return null;
  return /^https?:\/\/\S+$/i.test(text) ? null : IMAGE_ADDRESS_INVALID;
}

function setProp<D extends ModelDefinition>(def: D, id: string, key: string, value: string | number): D {
  return { ...def, components: def.components.map((c) => (c.id === id ? { ...c, props: { ...c.props, [key]: value } } : c)) };
}

/**
 * Adres kutusuna yazılanı olduğu gibi saklar (sorun panelde görünür). İzin listesi: denetim karakterleri ve boşluklar atılarak bakılır;
 * hiç ":" yoksa (hâlâ yazılıyor) ya da `http:`/`https:` ile başlıyorsa saklanır, öteki şemalar (javascript: …) saklanmaz.
 */
export function setImageAddress<D extends ModelDefinition>(def: D, id: string, url: string): D {
  const probe = url.replace(/[\u0000-\u001f\u007f\s]/g, "");
  if (probe.includes(":") && !/^https?:/i.test(probe)) return def;
  return setProp(def, id, "value", url);
}

/** `binding` süslü parantezsizdir: `liste.seciliSatir.Logo`. */
export function setImageFromRecord<D extends ModelDefinition>(def: D, id: string, binding: string): D {
  return setProp(def, id, "value", `{{${binding}}}`);
}

export function setImageHeight<D extends ModelDefinition>(def: D, id: string, size: ImageSize): D {
  return setProp(def, id, "height", IMAGE_HEIGHTS[size]);
}

export function setImageDescription<D extends ModelDefinition>(def: D, id: string, text: string): D {
  return setProp(def, id, "title", text);
}
