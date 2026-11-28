import { useEffect, useRef, useState } from "react";
import { previewDocument, type DocumentBinding, type OrderPreview } from "./documentApi";

export const CALCULATION_DELAY_MS = 400;

/** Hesap ucunun gövdesi (bağın `previewBody` ürünü); gövde yoksa (müşteri ya da geçerli satır yok) null. */
export type CalculationInput = Record<string, unknown> | null;

/**
 * Sunucu hesabı (`POST {belge kökü}/preview`): girdi değiştikten {@link CALCULATION_DELAY_MS} sonra gönderilir. Yeni bir değişiklik
 * bekleyen ya da süren isteği iptal eder; sıra numarası daha eski bir yanıtın yenisinin üstüne yazılmasını önler.
 * `input` null ise (müşteri ya da geçerli satır yok) istek gönderilmez ve son sonuç silinir.
 */
export function useDocumentCalculation(binding: DocumentBinding, input: CalculationInput, token: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<OrderPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const sequence = useRef(0);
  const key = enabled && input ? JSON.stringify(input) : "";

  useEffect(() => {
    const mine = ++sequence.current;
    if (!key) { setResult(null); setError(""); setPending(false); return; }
    const controller = new AbortController();
    setPending(true);
    const timer = window.setTimeout(() => {
      previewDocument(binding, JSON.parse(key), token, controller.signal)
        .then((preview) => { if (mine === sequence.current) { setResult(preview); setError(""); } })
        .catch((failure: unknown) => {
          if (mine !== sequence.current || controller.signal.aborted) return;
          setError(failure instanceof Error ? failure.message : "Tutarlar hesaplanamadı.");
        })
        .finally(() => { if (mine === sequence.current) setPending(false); });
    }, CALCULATION_DELAY_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [binding, key, token]);

  return { result, error, pending };
}
