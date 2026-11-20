import {
  Activity, AlertTriangle, Archive, Ban, Banknote, BarChart3, Barcode, Bell, Box, Boxes, Briefcase, Building, Building2, Calculator,
  Calendar, CalendarClock, CalendarX, CheckCircle2, ClipboardList, Clock, Coins, CreditCard, Factory, FileText, Files, Flag, Globe, Handshake,
  Hourglass, Inbox, Info, Landmark, Layers, LineChart, Lock, Mail, MapPin, Package, Percent, Phone, PieChart, PiggyBank, Receipt,
  RefreshCw, ScanLine, Settings, Shield, ShoppingBag, ShoppingCart, Star, Store, Tag, Target, Timer, TrendingDown, TrendingUp, Truck,
  User, UserCheck, Users, Wallet, Warehouse, Wrench, XCircle, type LucideIcon,
} from "lucide-react";

/**
 * Göstergenin (metric) `icon` anahtarları → simge. Sunucudaki `TenantCustomPageSchema.MetricIcons` ve Studio'daki
 * `page-designer/metricIcons.ts` ile aynı anahtarları taşır; `metricIcons.test.ts` üçünü karşılaştırır.
 */
export const METRIC_ICONS: Record<string, LucideIcon> = {
  box: Box, users: Users, receipt: Receipt, wallet: Wallet, chart: BarChart3, clock: Clock, check: CheckCircle2, alert: AlertTriangle,
  package: Package, boxes: Boxes, warehouse: Warehouse, truck: Truck, factory: Factory, layers: Layers, barcode: Barcode, scan: ScanLine,
  tag: Tag, "shopping-cart": ShoppingCart, "shopping-bag": ShoppingBag, store: Store, building: Building, "building-2": Building2,
  landmark: Landmark, banknote: Banknote, "credit-card": CreditCard, coins: Coins, "piggy-bank": PiggyBank, calculator: Calculator,
  percent: Percent, "trending-up": TrendingUp, "trending-down": TrendingDown, "line-chart": LineChart, "pie-chart": PieChart,
  activity: Activity, target: Target, calendar: Calendar, "calendar-clock": CalendarClock, hourglass: Hourglass, timer: Timer,
  "file-text": FileText, files: Files, "clipboard-list": ClipboardList, inbox: Inbox, archive: Archive, mail: Mail, phone: Phone,
  user: User, "user-check": UserCheck, briefcase: Briefcase, handshake: Handshake, globe: Globe, "map-pin": MapPin, settings: Settings,
  wrench: Wrench, shield: Shield, lock: Lock, bell: Bell, star: Star, flag: Flag, info: Info, "x-circle": XCircle, ban: Ban,
  "refresh-cw": RefreshCw, "calendar-x": CalendarX,
};
