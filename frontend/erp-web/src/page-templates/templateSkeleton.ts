// Kalıplı sayfada pencere ve grup iskeleti (taslak 12): yerleşim sabittir, genişlik ayarı yoktur. Saf TypeScript.

/**
 * Pencere içeriğinin sırası: kayıt özeti (`recordHeader`) başa, sekmeler (`tabs`) sona; pencerenin üst düzey düğmeleri gövdede
 * değil alt satırda (`footer`, Kaydet/Vazgeç'in solunda). Diğerleri `contains` sırasıyla. Türü bilinmeyen kimlik gövdede kalır.
 */
export function orderDialogParts(ids: string[], typeOf: (id: string) => string | undefined): { body: string[]; footer: string[] } {
  const of = (type: string) => ids.filter((id) => typeOf(id) === type);
  const rest = ids.filter((id) => { const type = typeOf(id); return type !== "recordHeader" && type !== "tabs" && type !== "button"; });
  return { body: [...of("recordHeader"), ...rest, ...of("tabs")], footer: of("button") };
}

/** Grubun çocukları: rozetler ilk satırda, düğmeler son satırda, kalanlar arada; her biri kendi sırasıyla. */
export function orderGroupChildren<T extends { type: string }>(children: T[]): { badges: T[]; body: T[]; buttons: T[] } {
  return {
    badges: children.filter((child) => child.type === "badge"),
    body: children.filter((child) => child.type !== "badge" && child.type !== "button"),
    buttons: children.filter((child) => child.type === "button"),
  };
}
