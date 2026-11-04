import {
  ClipboardCheck,
  FileCheck2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { localizedText } from "../../locale";
import type { WorkflowStep } from "../types";

export type WorkflowTemplate = {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  steps: WorkflowStep[];
};

const templates: WorkflowTemplate[] = [
  {
    code: "purchase-approval",
    name: "Satın alma talebi onayı",
    nameEn: "Purchase request approval",
    description:
      "Satın alma taleplerini yönetici onayına yönlendiren başlangıç şablonu.",
    descriptionEn:
      "A starter workflow that routes purchase requests to a company administrator.",
    steps: [{ name: "Yönetici onayı", approverRole: "TenantAdmin" }],
  },
  {
    code: "purchase-two-step-approval",
    name: "İki aşamalı satın alma onayı",
    nameEn: "Two-step purchase approval",
    description: "Talebi önce geliştirici, ardından firma yöneticisi inceler.",
    descriptionEn:
      "A developer reviews the request first, followed by a company administrator.",
    steps: [
      { name: "İlk değerlendirme", approverRole: "TenantDeveloper" },
      { name: "Yönetici onayı", approverRole: "TenantAdmin" },
    ],
  },
  {
    code: "sales-quote-approval",
    name: "Satış teklifi onayı",
    nameEn: "Sales quote approval",
    description: "Satış tekliflerinin yönetici kontrolünden geçmesini sağlar.",
    descriptionEn: "Routes sales quotes through a company administrator review.",
    steps: [{ name: "Teklif onayı", approverRole: "TenantAdmin" }],
  },
];

export function WorkflowTemplateGallery({
  onSelect,
}: {
  onSelect: (template: WorkflowTemplate) => void;
}) {
  return (
    <section
      className="workflow-template-gallery"
      aria-labelledby="workflow-templates-title"
    >
      <div className="workflow-template-heading">
        <span className="workflow-card-symbol"><Sparkles size={17} /></span>
        <div>
          <h2 id="workflow-templates-title">
            {localizedText("Hazır şablonlar", "Starter templates")}
          </h2>
          <p>
            {localizedText(
              "Bir örnek seçin; kaydetmeden önce adımları düzenleyebilirsiniz.",
              "Choose a starting point and edit its steps before saving.",
            )}
          </p>
        </div>
      </div>
      <div className="workflow-template-list">
        {templates.map((template, index) => {
          const Icon = index === 0 ? ShoppingCart : index === 1 ? ClipboardCheck : FileCheck2;
          return (
            <article className="workflow-template" key={template.code}>
              <span className="workflow-card-symbol"><Icon size={17} /></span>
              <div>
                <h3>{localizedText(template.name, template.nameEn)}</h3>
                <p>{localizedText(template.description, template.descriptionEn)}</p>
                <small>
                  {template.steps.length} {localizedText("onay adımı", "approval step(s)")}
                </small>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  onSelect({
                    ...template,
                    name: localizedText(template.name, template.nameEn),
                    description: localizedText(
                      template.description,
                      template.descriptionEn,
                    ),
                    steps: template.steps.map((step) => ({
                      ...step,
                      name: localizedText(
                        step.name,
                        step.name === "İlk değerlendirme"
                          ? "Initial review"
                          : step.name === "Teklif onayı"
                            ? "Quote approval"
                            : "Administrator approval",
                      ),
                    })),
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
