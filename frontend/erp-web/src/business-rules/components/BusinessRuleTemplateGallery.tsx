import { FileCheck2, PackageCheck, ShoppingCart, Sparkles } from "lucide-react";
import { localizedText } from "../../locale";
import type { Condition, Trigger } from "../types";

export type BusinessRuleTemplate = {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  trigger: string;
  conditions: Condition[];
  icon: "purchase" | "order" | "quote";
};

const templates: BusinessRuleTemplate[] = [
  {
    code: "large-purchase-request",
    name: "Büyük satın alma talebi",
    nameEn: "Large purchase request",
    description: "Satır sayısı belirlenen eşiği aşan talepleri onaya yönlendirir.",
    descriptionEn:
      "Routes purchase requests with more lines than the chosen threshold for approval.",
    trigger: "purchase-request.submitted",
    conditions: [{ field: "lineCount", operator: "GreaterThan", value: "5" }],
    icon: "purchase",
  },
  {
    code: "high-value-purchase-order",
    name: "Yüksek tutarlı satın alma siparişi",
    nameEn: "High-value purchase order",
    description: "Sipariş tutarı belirlenen limiti aşınca onay akışını başlatır.",
    descriptionEn:
      "Starts an approval workflow when an order exceeds the configured amount.",
    trigger: "purchase-order.created",
    conditions: [{ field: "grandTotal", operator: "GreaterThan", value: "10000" }],
    icon: "order",
  },
  {
    code: "high-value-sales-quote",
    name: "Yüksek tutarlı satış teklifi",
    nameEn: "High-value sales quote",
    description: "Kabul edilen tekliflerden yalnızca limit üstündekileri onaya gönderir.",
    descriptionEn:
      "Routes accepted sales quotes above the configured amount for approval.",
    trigger: "sales-quote.accepted",
    conditions: [{ field: "grandTotal", operator: "GreaterThan", value: "10000" }],
    icon: "quote",
  },
];

export function BusinessRuleTemplateGallery({
  triggerCatalog,
  hasPublishedWorkflow,
  onSelect,
}: {
  triggerCatalog: Trigger[];
  hasPublishedWorkflow: boolean;
  onSelect: (template: BusinessRuleTemplate) => void;
}) {
  const available = templates.filter((item) =>
    triggerCatalog.some((trigger) => trigger.code === item.trigger),
  );
  if (available.length === 0) return null;

  return (
    <section
      className="rules-template-gallery"
      aria-labelledby="rules-templates-title"
    >
      <div className="rules-template-heading">
        <span className="rules-template-sparkle">
          <Sparkles size={17} />
        </span>
        <div>
          <h2 id="rules-templates-title">
            {localizedText("Hazır otomasyon şablonları", "Automation templates")}
          </h2>
          <p>
            {localizedText(
              "Örneği seçin, eşik değerini düzenleyin ve taslak olarak kaydedin.",
              "Choose a template, adjust its threshold, and save it as a draft.",
            )}
          </p>
        </div>
      </div>
      {!hasPublishedWorkflow && (
        <p className="rules-template-hint" role="note">
          {localizedText(
            "Şablon kullanmak için önce en az bir iş akışını yayımlayın.",
            "Publish at least one workflow before using a template.",
          )}
        </p>
      )}
      <div className="rules-template-list">
        {available.map((template) => {
          const Icon =
            template.icon === "purchase"
              ? ShoppingCart
              : template.icon === "order"
                ? PackageCheck
                : FileCheck2;
          return (
            <article className="rules-template-card" key={template.code}>
              <span className="rules-template-icon">
                <Icon size={17} />
              </span>
              <div>
                <h3>{localizedText(template.name, template.nameEn)}</h3>
                <p>{localizedText(template.description, template.descriptionEn)}</p>
                <small>
                  {triggerCatalog.find((trigger) => trigger.code === template.trigger)?.label ??
                    template.trigger}
                </small>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={!hasPublishedWorkflow}
                onClick={() =>
                  onSelect({
                    ...template,
                    name: localizedText(template.name, template.nameEn),
                    description: localizedText(
                      template.description,
                      template.descriptionEn,
                    ),
                  })
                }
              >
                {localizedText("Şablonu kullan", "Use template")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
