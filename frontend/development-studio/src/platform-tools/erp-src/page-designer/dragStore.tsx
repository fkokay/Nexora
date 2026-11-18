import { useSyncExternalStore, type ReactNode } from "react";

/** Katmanlar'da sürüklenen satırın bırakılacağı kenar. */
export type LayerDropTarget = { index: number; edge: "before" | "after" } | null;

/**
 * Sürükle-bırak durumu: sürüklenen şey (bileşen kimliği ya da palet türü), tuvaldeki yer tutucunun sırası ve Katmanlar'daki
 * hedef. Sayfa tasarımcısının büyük bileşeninin dışında tutulur; dragover başına yalnız ona abone olan küçük parçalar
 * (tuval ızgarası, sekme kabı, Katmanlar) yeniden çizilir, müfettiş ve önizlemeler çizilmez.
 */
export type DragState = { dragging: string | null; canvasDrop: number | null; dropTarget: LayerDropTarget };

export type DragStore = {
  get: () => DragState;
  /** Değişen alan yoksa abonelere haber verilmez. */
  set: (patch: Partial<DragState>) => void;
  subscribe: (listener: () => void) => () => void;
  /** Sürükleme yoksa hemen, varsa bitince çözülür (arka plan işleri sürükleme sırasında sayfayı yeniden çizmesin). */
  whenIdle: () => Promise<void>;
};

export function createDragStore(): DragStore {
  let state: DragState = { dragging: null, canvasDrop: null, dropTarget: null };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  return {
    get: () => state,
    whenIdle: () => state.dragging === null ? Promise.resolve() : new Promise<void>((resolve) => {
      const stop = subscribe(() => { if (state.dragging === null) { stop(); resolve(); } });
    }),
    set: (patch) => {
      let changed = false;
      for (const key of Object.keys(patch) as (keyof DragState)[]) if (patch[key] !== undefined && patch[key] !== state[key]) changed = true;
      if (!changed) return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe,
  };
}

/** Seçici ilkel ya da kimliği kararlı bir değer döndürmelidir (yalnız o değer değişince yeniden çizilir). */
export function useDragSelect<T>(store: DragStore, select: (state: DragState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}

/** Büyük bileşenin içinde yalnız bu parçanın sürükleme durumuyla yeniden çizilmesi için. */
export function DragSelect<T>({ store, select, children }: { store: DragStore; select: (state: DragState) => T; children: (value: T) => ReactNode }) {
  return <>{children(useDragSelect(store, select))}</>;
}
