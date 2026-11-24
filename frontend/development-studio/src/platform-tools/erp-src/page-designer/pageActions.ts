// erp-web/src/custom-page/pageActions.ts ile aynıdır; biri değişirse diğeri de güncellenmelidir.
import { idList } from "./layoutRefs";

type ActionComponent = { id: string; type: string; props?: Record<string, unknown> };

/** Sayfadaki İşlem Çubuğu (düz diziden ilk `actionBar`); yoksa null. */
export function actionBarOf(components: ActionComponent[]): { id: string; props: Record<string, unknown> } | null {
  const bar = components.find((component) => component.type === "actionBar");
  return bar ? { id: bar.id, props: bar.props ?? {} } : null;
}

/** İşlem Çubuğu'nun düğme çalıştıran özellikleri: Yeni, Aç ve başarılı kayıttan sonra. */
const BAR_BUTTON_KEYS = ["newButton", "openButton", "afterSaveButton"] as const;

/**
 * İşlem Çubuğu'na taşınan düğme kimlikleri: bunlar sayfada kendi yerinde çizilmez. "İşlemler" menüsündekiler ve
 * Yeni / Aç / kayıttan sonra komutuna bağlı düğmeler (komutun kendisidir; ERP de ayrıca çizmez).
 */
export function movedButtonIds(components: ActionComponent[]): Set<string> {
  const bar = actionBarOf(components);
  if (!bar) return new Set();
  // İşlemler menüsü gizliyse (hiddenCommands "more") menü düğmeleri ERP'de olduğu gibi sayfada kendi yerinde çizilir.
  const moreHidden = Array.isArray(bar.props.hiddenCommands) && bar.props.hiddenCommands.includes("more");
  const moved = moreHidden ? [] : idList(bar.props.moreButtons, 10);
  const buttonIds = new Set(components.filter((component) => component.type === "button").map((component) => component.id));
  for (const key of BAR_BUTTON_KEYS) {
    const id = typeof bar.props[key] === "string" ? (bar.props[key] as string).trim() : "";
    if (id && buttonIds.has(id)) moved.push(id);
  }
  return new Set(moved);
}
