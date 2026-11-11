import LowCodeDesignerPage from "./erp-src/LowCodeDesignerPage";

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
};

export default function NativePlatformTool({ toolId, token, role, platformOrigin }: Props) {
  switch (toolId as NativeToolId) {
    case "custom-forms":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "workflows":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "business-rules":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "reports":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "custom-menus":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "custom-pages":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    case "custom-data":
      return <LowCodeDesignerPage token={token} role={role} platformOrigin={platformOrigin} initialSection={toolId} />;
    default:
      return null;
  }
}
