import { financePageTitles } from "../financeCatalog";
import {
  inventoryPageTitles,
  manufacturingPageTitles,
  purchasingNavigationPages,
  salesNavigationPages,
} from "../workspace-navigation";

/** One rail module and the screens listed in its sub-menu. `railId` is a `workbenchRailItems` id. */
export type ModuleMenu = { railId: string; title: [tr: string, en: string]; pages: string[] };

/** Create/edit screens that belong to a module but are not sub-menu rows; the parent row stays highlighted. */
export const SUBROUTE_PARENTS: Record<string, string> = {
  "customer-create": "customers",
  "customer-edit": "customers",
  "crm-opportunity-create": "crm-opportunities",
  "hr-employee-create": "hr-employees",
  "foreign-trade-case": "foreign-trade",
  "inventory-stock-create": "inventory-stock",
  "sales-quote-create": "sales-quotes",
  "sales-order-create": "sales-orders",
  "sales-order-document": "sales-orders",
  "finance-journal-voucher-document": "finance-journal-ledger",
  "sales-quote-document": "sales-quotes",
  'purchase-order-document': 'sales-purchasing',
  'purchase-invoice-document': 'sales-purchase-invoices',
  "inventory-transfer-document": "inventory-transfers",
  "sales-invoice-document": "sales-invoices",
  "sales-delivery-document": "sales-deliveries",
  "sales-delivery-create": "sales-deliveries",
  "finance-account-create": "finance-accounts",
  "finance-credit-facility-create": "finance-credit-facilities",
  "finance-credit-schedule-create": "finance-credit-facilities",
  "finance-credit-movement-create": "finance-credit-facilities",
  "finance-credit-repayment-create": "finance-credit-facilities",
  "finance-credit-security-create": "finance-credit-facilities",
  "manufacturing-recipe-create": "manufacturing-recipes", "manufacturing-recipe-document": "manufacturing-recipes",
  "manufacturing-work-center-create": "manufacturing-work-centers",
  "manufacturing-order-create": "manufacturing-orders",
  "fixed-asset-create": "fixed-assets",
  "fixed-asset-card": "fixed-assets",
};

/** Screens outside every module: home, assistant, settings and platform/customization tools. */
export const STANDALONE_PAGES: string[] = [
  // Eski oluşturma sayfaları: Belge ekranına yönlendirir, menüde yer almaz.
  "sales-invoice-create",
  "finance-journal-vouchers",
  "launcher",
  "dashboard",
  "erp-assistant",
  "settings",
  "ai-settings",
  "company-settings",
  "license-settings",
  "modules",
  "audit",
  "access",
  "integrations",
  "projects",
  "workflows",
  "custom-forms",
  "custom-lists",
  "custom-menus",
  "business-rules",
  "screen-views",
  "sales-purchase-order-create",
  "sales-purchase-invoice-entry",
];

const warehousePages = ["inventory-warehouses", "inventory-transfers", "inventory-transfer-document", "inventory-locations"];

export const moduleMenus: ModuleMenu[] = [
  {
    railId: "customers",
    title: ["Cari Hesaplar", "Customer accounts"],
    pages: ["customers", "customer-create", "customer-edit", "customer-ledger", "customer-groups", "crm-opportunities", "crm-opportunity-create"],
  },
  {
    railId: "inventory",
    title: ["Stok", "Inventory"],
    pages: Object.keys(inventoryPageTitles).filter((page) => !warehousePages.includes(page)),
  },
  {
    railId: "warehouse",
    title: ["Depo", "Warehousing"],
    pages: warehousePages,
  },
  {
    railId: "sales",
    title: ["Satış", "Sales"],
    pages: [...salesNavigationPages, "sales-quote-create", "sales-order-create", "sales-order-document", "sales-quote-document", "sales-invoice-document", "sales-delivery-document", "sales-delivery-create"],
  },
  {
    railId: "purchasing",
    title: ["Satın Alma", "Purchasing"],
    pages: purchasingNavigationPages,
  },
  {
    railId: "finance",
    title: ["Finans", "Finance"],
    pages: [...Object.keys(financePageTitles), "finance-account-create", "finance-journal-voucher-document"],
  },
  {
    railId: "manufacturing",
    title: ["Üretim", "Production"],
    pages: Object.keys(manufacturingPageTitles),
  },
  {
    railId: "human-resources",
    title: ["İnsan Kaynakları", "Human resources"],
    pages: ["hr-employees", "hr-employee-create", "hr-leave-requests", "hr-attendance", "hr-period-summary", "human-resources"],
  },
  { railId: "fixed-assets", title: ["Duran Varlıklar", "Fixed assets"], pages: ["fixed-assets", "fixed-asset-create", "fixed-asset-card"] },
  { railId: "foreign-trade", title: ["Dış Ticaret", "Foreign trade"], pages: ["foreign-trade", "foreign-trade-case"] },
  { railId: "reports", title: ["Raporlar", "Reports"], pages: ["reports"] },
  { railId: "modules", title: ["Tanımlar", "Definitions"], pages: ["location-definitions", "address-definitions"] },
];

const menuByPage = new Map(moduleMenus.flatMap((menu) => menu.pages.map((page) => [page, menu] as const)));

export function moduleForPage(page: string): ModuleMenu | undefined {
  return menuByPage.get(page);
}

/** The sub-menu row that represents `page` (its parent for create/edit screens). */
export function subNavRowForPage(page: string): string {
  return SUBROUTE_PARENTS[page] ?? page;
}
