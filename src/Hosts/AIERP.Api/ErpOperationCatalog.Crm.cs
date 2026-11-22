namespace AIERP.Api;

internal static partial class ErpOperationCatalog
{
    private const string CrmModule = "CRM";

    /// <summary>
    /// CRM Fırsatları and the fırsat kartı (new and edit). Stage changes are one fixed-body operation per target stage, so a
    /// page never binds the stage value; the API keeps the transition rules (Won needs a customer, closed ones are final).
    /// <c>nextActivityAt</c> is declared <c>datetime</c> on writes (date and time with offset); the reflected
    /// <c>DateTimeOffset</c> type would be <c>date</c>, which the runtime truncates to the day.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildCrm(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string opportunitiesRoute = "/api/crm/opportunities";
        const string opportunityRoute = opportunitiesRoute + "/{id}";
        const string opportunityRead = "crm.firsat.getir";
        var id = Route("id");
        var columns = Columns<CrmOpportunityView>();
        // Shared labels belong to other screens ("totalCount" = Cari kartı); the summary record names its own.
        var summaryColumns = Columns<CrmOpportunitySummary>()
            .Select(x => x.Code == "totalCount" ? x with { Label = "Fırsat" } : x).ToArray();
        static IReadOnlyList<ErpOperationParameter> WriteParameters(bool sourceBacked) =>
            BodyParameters<CrmOpportunityWriteRequest>(sourceBacked)
                .Select(x => x.Name == "nextActivityAt" ? x with { Type = "datetime" } : x).ToArray();

        yield return Read(CrmModule, "crm.firsat.listele", "CRM fırsatlarını listele", opportunitiesRoute,
            [Query("q", "text"), Query("stage", "text"), Query("closeFrom", "date"), Query("closeTo", "date"),
                Query("valueFrom", "decimal"), Query("valueTo", "decimal"), .. paging],
            List(columns, "items") with { MetaPaths = ["page", "pageSize", "totalCount"] });
        yield return Read(CrmModule, opportunityRead, "CRM fırsatı getir", opportunityRoute, [id], Record(columns));
        yield return Read(CrmModule, "crm.firsat.ozet", "CRM fırsat özeti", opportunitiesRoute + "/summary", [Query("q", "text")],
            Record(summaryColumns));
        yield return Write(CrmModule, "crm.firsat.olustur", "CRM fırsatı oluştur", "insert", "POST", opportunitiesRoute,
            WriteParameters(sourceBacked: false), Record(columns), null, null);
        yield return Write(CrmModule, "crm.firsat.guncelle", "CRM fırsatı güncelle", "update", "PUT", opportunityRoute,
            [id, .. WriteParameters(sourceBacked: true)], Record(columns), opportunityRead, null);
        foreach (var (name, label, stage) in new[]
                 {
                     ("crm.firsat.nitelikliYap", "CRM fırsatını Nitelikli aşamasına taşı", "Qualified"),
                     ("crm.firsat.teklifeGecir", "CRM fırsatını Teklif aşamasına taşı", "Proposal"),
                     ("crm.firsat.muzakereyeGecir", "CRM fırsatını Müzakere aşamasına taşı", "Negotiation"),
                     ("crm.firsat.kazanildi", "CRM fırsatını kazanıldı olarak işaretle", "Won"),
                     ("crm.firsat.kaybedildi", "CRM fırsatını kaybedildi olarak işaretle", "Lost"),
                 })
            yield return Write(CrmModule, name, label, "update", "POST", opportunityRoute + "/stage", [id], Record(columns), null,
                new Dictionary<string, object?>(StringComparer.Ordinal) { ["stage"] = stage });
        yield return Write(CrmModule, "crm.firsat.sil", "CRM fırsatını sil", "delete", "DELETE", opportunityRoute, [id],
            new ErpOperationResult("none", null, []), null, null);
    }
}
