using System.Text;
using System.Text.Json;

namespace AIERP.AIService.AI;

public static class UiDesignPlanRules
{
    private static readonly HashSet<string> ElementTypes = new(StringComparer.Ordinal)
        { "text", "email", "number", "date", "select", "textarea", "stat", "table" };
    private static readonly HashSet<string> Layouts = new(StringComparer.Ordinal) { "single", "two-column" };
    private static readonly HashSet<string> ActionStyles = new(StringComparer.Ordinal) { "primary", "secondary" };

    public static void Validate(UiDesignPlan plan)
    {
        if (plan is null || string.IsNullOrWhiteSpace(plan.Title) || plan.Title.Length > 120 ||
            plan.Description is null || plan.Description.Length > 500 || plan.Sections is null || plan.Sections.Count is < 1 or > 8 ||
            plan.Actions is null || plan.Actions.Count > 6 || plan.ResponsiveBehaviors is null || plan.ResponsiveBehaviors.Count is < 1 or > 8 ||
            plan.AccessibilityNotes is null || plan.AccessibilityNotes.Count is < 1 or > 8)
            throw new AIProviderResponseException("OpenAI returned a UI design outside the allowed response limits.");

        var totalElements = 0;
        foreach (var section in plan.Sections)
        {
            if (section is null || string.IsNullOrWhiteSpace(section.Title) || section.Title.Length > 100 ||
                section.Description is null || section.Description.Length > 300 || !Layouts.Contains(section.Layout) ||
                section.Elements is null || section.Elements.Count is < 1 or > 12)
                throw new AIProviderResponseException("OpenAI returned a UI section outside the allowed response limits.");
            totalElements += section.Elements.Count;
            foreach (var element in section.Elements)
            {
                if (element is null || !ElementTypes.Contains(element.Type) || string.IsNullOrWhiteSpace(element.Label) ||
                    element.Label.Length > 100 || element.Placeholder?.Length > 180 || element.Options is null || element.Options.Count > 8 ||
                    element.Options.Any(option => string.IsNullOrWhiteSpace(option) || option.Length > 80))
                    throw new AIProviderResponseException("OpenAI returned a UI component outside the allowed response limits.");
                if (element.Type == "table" && element.Options.Count is < 1 or > 8)
                    throw new AIProviderResponseException("A table preview must include 1-8 column labels.");
            }
        }
        if (totalElements > 48 || plan.Actions.Any(action => action is null || string.IsNullOrWhiteSpace(action.Label) ||
                action.Label.Length > 80 || !ActionStyles.Contains(action.Style)) ||
            plan.ResponsiveBehaviors.Any(note => string.IsNullOrWhiteSpace(note) || note.Length > 220) ||
            plan.AccessibilityNotes.Any(note => string.IsNullOrWhiteSpace(note) || note.Length > 220))
            throw new AIProviderResponseException("OpenAI returned a UI design outside the allowed response limits.");
    }

    public static string RenderReactComponent(UiDesignPlan plan)
    {
        Validate(plan);
        var builder = new StringBuilder();
        builder.AppendLine("const styles = ").Append(JsonSerializer.Serialize(Styles)).AppendLine(";");
        builder.AppendLine().AppendLine("export default function DesignedErpScreen() {").AppendLine("  return (")
            .AppendLine("    <main className=\"nexora-designed-screen\">").AppendLine("      <style>{styles}</style>")
            .Append("      <header className=\"nds-header\"><div><p className=\"nds-eyebrow\">ERP ÇALIŞMA ALANI</p><h1>{")
            .Append(JsonSerializer.Serialize(plan.Title)).AppendLine("}</h1><p className=\"nds-description\">{" + JsonSerializer.Serialize(plan.Description) + "}</p></div>")
            .AppendLine("      </header>").AppendLine("      <div className=\"nds-sections\">");
        for (var sectionIndex = 0; sectionIndex < plan.Sections.Count; sectionIndex++)
        {
            var section = plan.Sections[sectionIndex];
            builder.Append("        <section className=\"nds-panel ").Append(section.Layout == "two-column" ? "nds-two-column" : "")
                .AppendLine("\">").Append("          <div className=\"nds-section-head\"><h2>{").Append(JsonSerializer.Serialize(section.Title))
                .AppendLine("}</h2><p>{" + JsonSerializer.Serialize(section.Description) + "}</p></div>");
            foreach (var (element, elementIndex) in section.Elements.Select((item, index) => (item, index)))
                AppendElement(builder, element, sectionIndex, elementIndex);
            builder.AppendLine("        </section>");
        }
        builder.AppendLine("      </div>");
        if (plan.Actions.Count > 0)
        {
            builder.AppendLine("      <div className=\"nds-actions\">");
            foreach (var action in plan.Actions)
                builder.Append("        <button type=\"button\" className=\"nds-button nds-").Append(action.Style)
                    .AppendLine("\">{" + JsonSerializer.Serialize(action.Label) + "}</button>");
            builder.AppendLine("      </div>");
        }
        builder.AppendLine("    </main>").AppendLine("  );").AppendLine("}");
        var content = builder.ToString();
        if (Encoding.UTF8.GetByteCount(content) > 96 * 1024)
            throw new AIProviderResponseException("Generated UI component exceeds the allowed file size.");
        return content;
    }

    private static void AppendElement(StringBuilder builder, UiDesignElement element, int sectionIndex, int elementIndex)
    {
        var label = JsonSerializer.Serialize(element.Label);
        var id = $"nds-field-{sectionIndex}-{elementIndex}";
        switch (element.Type)
        {
            case "stat":
                builder.Append("          <article className=\"nds-stat\"><span>{").Append(label).Append("}</span><strong>{")
                    .Append(JsonSerializer.Serialize(element.Placeholder ?? "—")).AppendLine("}</strong></article>");
                break;
            case "table":
                builder.AppendLine("          <div className=\"nds-table-wrap\"><table><caption>{" + label + "}</caption><thead><tr>");
                foreach (var option in element.Options) builder.Append("            <th scope=\"col\">{").Append(JsonSerializer.Serialize(option)).AppendLine("}</th>");
                builder.Append("          </tr></thead><tbody><tr><td colSpan={").Append(element.Options.Count)
                    .Append("}>Henüz kayıt yok</td></tr></tbody></table></div>").AppendLine();
                break;
            case "select":
                builder.Append("          <label className=\"nds-field\" htmlFor={").Append(JsonSerializer.Serialize(id)).Append("}>{")
                    .Append(label).AppendLine("}<select id={" + JsonSerializer.Serialize(id) + "}>");
                foreach (var option in element.Options) builder.Append("            <option>{").Append(JsonSerializer.Serialize(option)).AppendLine("}</option>");
                builder.AppendLine("          </select></label>");
                break;
            case "textarea":
                builder.Append("          <label className=\"nds-field\" htmlFor={").Append(JsonSerializer.Serialize(id)).Append("}>{")
                    .Append(label).Append("}<textarea id={").Append(JsonSerializer.Serialize(id)).Append("} placeholder={")
                    .Append(JsonSerializer.Serialize(element.Placeholder ?? "")).AppendLine("} rows={3} /></label>");
                break;
            default:
                builder.Append("          <label className=\"nds-field\" htmlFor={").Append(JsonSerializer.Serialize(id)).Append("}>{")
                    .Append(label).Append("}<input id={").Append(JsonSerializer.Serialize(id)).Append("} type=\"").Append(element.Type)
                    .Append("\" placeholder={").Append(JsonSerializer.Serialize(element.Placeholder ?? "")).AppendLine("} /></label>");
                break;
        }
    }

    private const string Styles = ".nexora-designed-screen{font-family:'DM Sans',Inter,system-ui,sans-serif;color:#182032;background:#f7f8fb;min-height:100vh;padding:28px;box-sizing:border-box}.nexora-designed-screen *{box-sizing:border-box}.nds-header{display:flex;align-items:flex-start;justify-content:space-between;margin:0 auto 20px;max-width:1200px}.nds-eyebrow{margin:0 0 6px;color:#7865e9;font-size:10px;font-weight:800;letter-spacing:1px}.nds-header h1{margin:0;font:700 26px/1.2 Manrope,sans-serif;letter-spacing:-.5px}.nds-description{margin:7px 0 0;color:#81889a;font-size:12px}.nds-sections{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:1200px;margin:auto}.nds-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:12px;padding:18px;border:1px solid #e8eaf1;border-radius:13px;background:#fff;box-shadow:0 5px 20px #26345a08}.nds-panel:first-child{grid-column:1/-1}.nds-panel.nds-two-column{grid-template-columns:repeat(2,minmax(0,1fr))}.nds-section-head{grid-column:1/-1}.nds-section-head h2{margin:0;color:#28334b;font-size:14px}.nds-section-head p{margin:5px 0 0;color:#8992a3;font-size:10px}.nds-field{display:grid;align-content:start;gap:6px;color:#59667c;font-size:10px;font-weight:650}.nds-field input,.nds-field textarea,.nds-field select{width:100%;min-height:38px;padding:9px 10px;border:1px solid #dfe4ed;border-radius:8px;background:#fff;color:#2b3850;font:400 11px 'DM Sans',Inter,system-ui,sans-serif}.nds-stat{display:grid;gap:9px;padding:14px;border:1px solid #eceef3;border-radius:10px;background:#fbfcff}.nds-stat span{color:#7c879a;font-size:10px}.nds-stat strong{color:#26334b;font:700 20px Manrope,sans-serif}.nds-table-wrap{grid-column:1/-1;overflow:auto;border:1px solid #e7eaf1;border-radius:9px}.nds-table-wrap table{width:100%;border-collapse:collapse;font-size:10px}.nds-table-wrap caption{text-align:left;padding:11px 12px;color:#3b4860;font-weight:700}.nds-table-wrap th,.nds-table-wrap td{padding:10px 12px;border-top:1px solid #edf0f5;text-align:left}.nds-table-wrap th{background:#f8f9fc;color:#66738a}.nds-table-wrap td{color:#9aa2b0;text-align:center}.nds-actions{display:flex;justify-content:flex-end;gap:8px;max-width:1200px;margin:16px auto 0}.nds-button{min-height:36px;padding:0 14px;border:1px solid #e2e5ed;border-radius:8px;background:#fff;color:#535f74;font:600 11px 'DM Sans',Inter,system-ui,sans-serif}.nds-primary{border-color:#7060df;background:#7665df;color:#fff;box-shadow:0 4px 12px #7665df2d}@media(max-width:720px){.nexora-designed-screen{padding:18px}.nds-sections{grid-template-columns:1fr}.nds-panel:first-child{grid-column:auto}.nds-panel,.nds-panel.nds-two-column{grid-template-columns:1fr}.nds-actions{justify-content:stretch}.nds-actions .nds-button{flex:1}}@media(max-width:420px){.nds-header h1{font-size:21px}.nds-panel{padding:14px}}";
}
