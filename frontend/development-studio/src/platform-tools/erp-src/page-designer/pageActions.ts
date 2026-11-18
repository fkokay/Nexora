// erp-web/src/custom-page/pageActions.ts ile aynıdır; biri değişirse diğeri de güncellenmelidir.
import { idList } from "./layoutRefs";

type ActionComponent = { id: string; type: string; props?: Record<string, unknown> };

/** Sayfadaki İşlem Çubuğu (düz diziden ilk `actionBar`); yoksa null. */
export function actionBarOf(components: ActionComponent[]): { id: string; props: Record<string, unknown> } | null {
  const bar = components.find((component) => component.type === "actionBar");
  return bar ? { id: bar.id, props: bar.props ?? {} } : null;
}

/** İşlem Çubuğunun "İşlemler" menüsüne taşınan düğme kimlikleri: bunlar sayfada kendi yerinde çizilmez. */
export function movedButtonIds(components: ActionComponent[]): Set<string> {
  const bar = actionBarOf(components);
  return new Set(bar ? idList(bar.props.moreButtons, 10) : []);
}
