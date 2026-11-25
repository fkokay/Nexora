import LowCodeDesignerPage from "./erp-src/LowCodeDesignerPage";
import type { CanvasTenant } from "./erp-src/page-designer/ErpCanvasFrame";

type NativeToolId =
  | "custom-forms"
  | "workflows"
  | "business-rules"
  | "reports"
  | "custom-menus"
  | "custom-pages"
  | "custom-data";

type Props = {
  toolId: string;
  token: string;
  role: string;
  platformOrigin?: string;
  tenant?: CanvasTenant;
  /** Aracın üstündeki "geri" bağlantısı; verilmezse tasarımcının varsayılanı (#screens). */
  backHref?: string;
};

export default function NativePlatformTool({ toolId, token, role, platformOrigin, tenant, backHref }: Props) {
  switch (toolId as NativeToolId) {
    case "custom-forms":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "workflows":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "business-rules":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "reports":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "custom-menus":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "custom-pages":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    case "custom-data":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialSection={toolId} backHref={backHref} />;
    default:
      return null;
  }
}
