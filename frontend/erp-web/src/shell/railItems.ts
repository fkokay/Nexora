import {
  BarChart3,
  Boxes,
  Building2,
  Factory,
  Globe,
  Home,
  Landmark,
  Package,
  ShoppingCart,
  UserRoundPlus,
  UsersRound,
  Warehouse,
} from "lucide-react";

/** Icon rail entries. The ids are stored in the user's rail preferences
 * (`/api/user-preferences/workspace-rail`), so they must never be renamed. */
export const workbenchRailItems = [
  { id: "dashboard", page: "launcher", label: ["Ana Sayfa", "Home"], icon: Home },
  { id: "customers", page: "customers", label: ["Cari", "Customers"], icon: Building2 },
  { id: "customer-create", page: "customer-create", label: ["Cari Ekle", "New Customer"], icon: UserRoundPlus },
  { id: "inventory", page: "inventory-stock", label: ["Stok", "Stock"], icon: Package },
  { id: "sales", page: "sales-invoices", label: ["Satış", "Sales"], icon: ShoppingCart },
  { id: "purchasing", page: "sales-purchase-invoices", label: ["Satın Alma", "Purchasing"], icon: Boxes },
  { id: "finance", page: "finance-accounts", label: ["Finans", "Finance"], icon: Landmark },
  { id: "warehouse", page: "inventory-warehouses", label: ["Depo", "Warehousing"], icon: Package },
  { id: "manufacturing", page: "manufacturing-orders", label: ["Üretim", "Production"], icon: Factory },
  { id: "human-resources", page: "hr-employees", label: ["İK", "HR"], icon: UsersRound },
  { id: "fixed-assets", page: "fixed-assets", label: ["Duran Varlık", "Fixed Assets"], icon: Warehouse },
  { id: "foreign-trade", page: "foreign-trade", label: ["Dış Ticaret", "Foreign Trade"], icon: Globe },
  { id: "reports", page: "reports", label: ["Raporlar", "Reports"], icon: BarChart3 },
  // id stays "modules" so saved rail order/visibility preferences keep matching; the module marketplace
  // remains reachable from the top bar. Definition pages are TenantAdmin-only, so the item is too.
  { id: "modules", page: "location-definitions", label: ["Tanımlar", "Definitions"], icon: Boxes, adminOnly: true },
];

export type WorkbenchRailItem = (typeof workbenchRailItems)[number];
