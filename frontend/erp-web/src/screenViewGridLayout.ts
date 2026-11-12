import type { ScreenColumnPin } from "./erp-types";

type GridLayoutField = {
  key: string;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};

/**
 * Converts the tenant's published column layout (already filtered to the visible,
 * ordered columns the grid renders) into AdvancedDataGrid defaults. Viewers can still
 * resize or unpin columns locally; the tenant layout only supplies the starting point.
 */
export function screenViewGridDefaults(
  fields: GridLayoutField[],
  fallbackWidths?: (field: GridLayoutField) => number | undefined,
) {
  const initialPinned: Record<number, ScreenColumnPin> = {};
  fields.forEach((field, index) => {
    if (field.pinned === "left" || field.pinned === "right")
      initialPinned[index] = field.pinned;
  });
  return {
    initialColumnWidths: fields.map(
      (field) => field.width || fallbackWidths?.(field) || 0,
    ),
    initialPinned,
  };
}
