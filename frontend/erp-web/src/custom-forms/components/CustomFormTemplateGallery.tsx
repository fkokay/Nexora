import { ClipboardCheck, ContactRound, ReceiptText, Sparkles } from "lucide-react";
import { localizedText } from "../../locale";
import type { Field } from "../types";

export type CustomFormTemplate = {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  icon: "purchase" | "customer" | "expense";
  fields: Field[];
};

const templates: CustomFormTemplate[] = [
  {
    code: "purchase-request-form",
    name: "Satın alma talep formu",
    nameEn: "Purchase request form",
    description: "İhtiyaç tarihi, gerekçe ve talep bilgilerini toplayın.",
    descriptionEn: "Collect the requested date, business reason, and request details.",
    icon: "purchase",
    fields: [
      { code: "needed_by", label: "İhtiyaç tarihi", dataType: "Date", isRequired: true, maxLength: 0, options: [] },
      { code: "line_count", label: "Ürün satırı sayısı", dataType: "Decimal", isRequired: true, maxLength: 0, options: [] },
      { code: "business_reason", label: "İş gerekçesi", dataType: "Text", isRequired: true, maxLength: 500, options: [] },
      { code: "urgency", label: "Öncelik", dataType: "Choice", isRequired: true, maxLength: 0, options: ["Normal", "Yüksek", "Acil"] },
    ],
  },
  {
    code: "customer-onboarding-form",
    name: "Müşteri kayıt formu",
    nameEn: "Customer onboarding form",
    description: "Yeni müşteri ve iletişim bilgileri için başlangıç formu.",
    descriptionEn: "A starter form for new customer and contact information.",
    icon: "customer",
    fields: [
      { code: "legal_name", label: "Firma unvanı", dataType: "Text", isRequired: true, maxLength: 250, options: [] },
      { code: "tax_number", label: "Vergi numarası", dataType: "Text", isRequired: true, maxLength: 50, options: [] },
      { code: "contact_name", label: "Yetkili kişi", dataType: "Text", isRequired: true, maxLength: 150, options: [] },
      { code: "contact_email", label: "E-posta", dataType: "Text", isRequired: false, maxLength: 250, options: [] },
    ],
  },
  {
    code: "expense-claim-form",
    name: "Masraf bildirim formu",
    nameEn: "Expense claim form",
    description: "Masraf tarihi, tutarı, türü ve açıklamasını kaydedin.",
    descriptionEn: "Capture the expense date, amount, category, and description.",
    icon: "expense",
    fields: [
      { code: "expense_date", label: "Masraf tarihi", dataType: "Date", isRequired: true, maxLength: 0, options: [] },
      { code: "amount", label: "Tutar", dataType: "Decimal", isRequired: true, maxLength: 0, options: [] },
      { code: "category", label: "Masraf türü", dataType: "Choice", isRequired: true, maxLength: 0, options: ["Ulaşım", "Konaklama", "Yemek", "Diğer"] },
      { code: "description", label: "Açıklama", dataType: "Text", isRequired: true, maxLength: 500, options: [] },
    ],
  },
];

const englishFieldLabels: Record<string, string> = {
  needed_by: "Needed by",
  line_count: "Number of item lines",
  business_reason: "Business reason",
  urgency: "Priority",
  legal_name: "Legal company name",
  tax_number: "Tax number",
  contact_name: "Contact person",
  contact_email: "Email",
  expense_date: "Expense date",
  amount: "Amount",
  category: "Expense category",
  description: "Description",
};

const englishOptions: Record<string, string> = {
  Normal: "Normal",
  Yüksek: "High",
  Acil: "Urgent",
  Ulaşım: "Transport",
  Konaklama: "Accommodation",
  Yemek: "Meals",
  Diğer: "Other",
};

export function CustomFormTemplateGallery({
  onSelect,
}: {
  onSelect: (template: CustomFormTemplate) => void;
}) {
  return (
    <section className="forms-template-gallery" aria-labelledby="forms-templates-title">
      <div className="forms-template-heading">
        <span className="forms-template-sparkle"><Sparkles size={17} /></span>
        <div>
          <h2 id="forms-templates-title">{localizedText("Hazır form şablonları", "Form templates")}</h2>
          <p>{localizedText("Bir örnek seçin; alanları tasarımcıda değiştirebilirsiniz.", "Choose a starting point and customize its fields in the designer.")}</p>
        </div>
      </div>
      <div className="forms-template-list">
        {templates.map((template) => {
          const Icon = template.icon === "purchase" ? ClipboardCheck : template.icon === "customer" ? ContactRound : ReceiptText;
          return (
            <article className="forms-template-card" key={template.code}>
              <span className="forms-template-icon"><Icon size={17} /></span>
              <div>
                <h3>{localizedText(template.name, template.nameEn)}</h3>
                <p>{localizedText(template.description, template.descriptionEn)}</p>
                <small>{template.fields.length} {localizedText("alan", "fields")}</small>
              </div>
              <button className="secondary" type="button" onClick={() => onSelect({
                ...template,
                name: localizedText(template.name, template.nameEn),
                description: localizedText(template.description, template.descriptionEn),
                fields: template.fields.map((field) => ({
                  ...field,
                  label: localizedText(
                    field.label,
                    englishFieldLabels[field.code] ?? field.label,
                  ),
                  options:
                    field.options?.map((option) =>
                      localizedText(option, englishOptions[option] ?? option),
                    ) ?? [],
                })),
              })}>
                {localizedText("Şablonu kullan", "Use template")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
