import { type CSSProperties, useEffect, useState } from "react";

export const IMAGE_MISSING = "Görsel yok";
export const IMAGE_FAILED = "Görsel yüklenemedi";

/** Yalnız mutlak http:/https: adresleri çizilir; diğer her değer (javascript:, data:, göreli yol, boş) çizilmez. */
export function safeImageUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Görsel bileşeni: güvenli adres yoksa "Görsel yok", yükleme hatasında "Görsel yüklenemedi" gösterir. */
export function PageImage({ url, alt, height, fit, style }: { url: string; alt: string; height: number; fit: "contain" | "cover"; style: CSSProperties }) {
  const safe = safeImageUrl(url);
  const [failed, setFailed] = useState(false);
  // Bağlı adres değişince (ör. başka satır seçildi) önceki hata sıfırlanır.
  useEffect(() => { setFailed(false); }, [safe]);
  const placeholder = !safe ? IMAGE_MISSING : failed ? IMAGE_FAILED : null;
  return <figure className="tenant-page-image" style={{ ...style, height }}>
    {placeholder
      ? <div className="tenant-page-image-placeholder" role="img" aria-label={alt || placeholder}><span>{placeholder}</span></div>
      : <img src={safe!} alt={alt} referrerPolicy="no-referrer" loading="lazy" style={{ objectFit: fit }} onError={() => setFailed(true)} />}
  </figure>;
}
