import CustomFormsPage from "./erp-src/CustomFormsPage";
import WorkflowPage from "./erp-src/WorkflowPage";
import BusinessRulesPage from "./erp-src/BusinessRulesPage";
import ReportsPage from "./erp-src/ReportsPage";
import BuiltInScreenViewsPage from "./erp-src/BuiltInScreenViewsPage";
import CustomMenusPage from "./erp-src/CustomMenusPage";
import CustomPagesPage from "./erp-src/CustomPagesPage";

type NativeToolId =
  | "custom-forms"
  | "workflows"
  | "business-rules"
  | "reports"
  | "custom-lists"
  | "screen-views"
  | "custom-menus"
  | "custom-pages";

type Props = {
  toolId: string;
  token: string;
  role: string;
};

export default function NativePlatformTool({ toolId, token, role }: Props) {
  switch (toolId as NativeToolId) {
    case "custom-forms":
      return <CustomFormsPage token={token} role={role} />;
    case "workflows":
      return <WorkflowPage token={token} role={role} />;
    case "business-rules":
      return <BusinessRulesPage token={token} role={role} />;
    case "reports":
      return <ReportsPage token={token} role={role} />;
    case "custom-lists":
      return <ReportsPage token={token} role={role} mode="list" />;
    case "screen-views":
      return <BuiltInScreenViewsPage token={token} role={role} />;
    case "custom-menus":
      return <CustomMenusPage token={token} role={role} />;
    case "custom-pages":
      return <CustomPagesPage token={token} role={role} />;
    default:
      return null;
  }
}
