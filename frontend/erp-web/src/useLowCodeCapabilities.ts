import { useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";

export type LowCodeResourceCapabilities = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canPublish: boolean;
  canDelete: boolean;
};

export type LowCodeCapabilities = {
  customForms: LowCodeResourceCapabilities;
  businessRules: LowCodeResourceCapabilities;
  workflows: LowCodeResourceCapabilities;
  customMenus: LowCodeResourceCapabilities;
  screenViews: LowCodeResourceCapabilities;
  customizationPackages: LowCodeResourceCapabilities;
};

const denied: LowCodeResourceCapabilities = {
  canRead: false,
  canCreate: false,
  canUpdate: false,
  canPublish: false,
  canDelete: false,
};

export function useLowCodeCapabilities(token: string) {
  const [loading, setLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<LowCodeCapabilities>({
    customForms: denied,
    businessRules: denied,
    workflows: denied,
    customMenus: denied,
    screenViews: denied,
    customizationPackages: denied,
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    void authenticatedFetch("/api/low-code/capabilities", token)
      .then(async (response) => {
        if (!response.ok) throw new Error("Low-code permissions unavailable");
        return (await response.json()) as LowCodeCapabilities;
      })
      .then((value) => {
        if (active) {
          setCapabilities(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setCapabilities({
            customForms: denied,
            businessRules: denied,
            workflows: denied,
            customMenus: denied,
            screenViews: denied,
            customizationPackages: denied,
          });
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  return { ...capabilities, loading };
}
