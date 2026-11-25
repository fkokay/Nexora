import { useEffect, useRef, useState } from "react";

type Options = {
  /** canEdit && ad && kod */
  enabled: boolean;
  /** Tanım nesnesi: referans değişimi bir değişiklik sayılır; ilk değer kayıt tetiklemez. */
  changeKey: unknown;
  delayMs?: number;
  save: () => Promise<boolean>;
};

/**
 * Değişiklikten `delayMs` sonra taslağı sessizce kaydeder. Kayıtlar paralel çalışmaz: bir kayıt sürerken gelen değişiklik,
 * o kayıt bitince yeniden bekleme süresiyle kaydedilir. `revision` yalnız başarılı kayıtta artar (ERP tuvali yeniden yüklenir).
 */
export function useDraftAutosave({ enabled, changeKey, delayMs = 800, save }: Options): { revision: number; saving: boolean } {
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;
  const lastKey = useRef(changeKey);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const alive = useRef(true);

  const schedule = useRef(() => {});
  schedule.current = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (!enabledRef.current) return;
      if (inFlight.current) { pending.current = true; return; }
      inFlight.current = true;
      setSaving(true);
      void saveRef.current().catch(() => false).then((ok) => {
        inFlight.current = false;
        if (!alive.current) return;
        setSaving(false);
        if (ok) setRevision((value) => value + 1);
        if (pending.current) { pending.current = false; schedule.current(); }
      });
    }, delayRef.current);
  };

  useEffect(() => {
    if (Object.is(lastKey.current, changeKey)) return;
    lastKey.current = changeKey;
    if (!enabled) return;
    if (inFlight.current) { pending.current = true; return; }
    schedule.current();
  }, [changeKey, enabled]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, []);

  return { revision, saving };
}
