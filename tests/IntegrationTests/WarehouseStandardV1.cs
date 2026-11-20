/// <summary>
/// The Depo Yönetimi standard as it was published at version 1 (one list and its query). The system page tests use it as
/// a small, stable fixture: the embedded envelope grows with every standard version, the behaviour under test does not.
/// </summary>
internal static class WarehouseStandardV1
{
    internal const string ScreenKey = "inventory-warehouses";

    internal const string Json = """
        {
          "screenKey": "inventory-warehouses", "title": "Depo Yönetimi", "description": "Depo tanımlarının listesi.",
          "module": "Stok & Depo", "version": 1, "stage": "preview",
          "items": {
            "component:depoListesi": { "since": 1, "label": "Depo listesi", "requires": ["query:depolar"] },
            "query:depolar": { "since": 1, "label": "Depoları listele" }
          },
          "screenViews": [ { "key": "inventory-warehouses", "component": "depoListesi",
                             "fields": { "code": "code", "name": "name", "status": "isActive" } } ],
          "definition": {
            "schemaVersion": 2,
            "components": [ { "id": "depoListesi", "type": "dataTable", "name": "depoListesi",
              "props": { "title": "Depolar", "query": "depolar", "columns": ["code", "name", "isActive"],
                         "columnFormats": ["code=code", "isActive=status"] } } ],
            "queries": [ { "id": "depolar", "name": "depolar", "kind": "read", "operation": "depo.listele", "parameters": [], "runOn": "load" } ]
          }
        }
        """;

    internal static SystemPageStandard Standard { get; } = SystemPageStandards.Load([(ScreenKey + ".json", Json)])[ScreenKey];

    /// <summary>The embedded standards with Depo Yönetimi replaced by its version 1.</summary>
    internal static ISystemPageStandardSet Set { get; } = new FrozenSet();

    private sealed class FrozenSet : ISystemPageStandardSet
    {
        private readonly IReadOnlyDictionary<string, SystemPageStandard> standards =
            SystemPageStandards.All.Values.Select(x => x.ScreenKey == ScreenKey ? Standard : x).ToDictionary(x => x.ScreenKey, StringComparer.Ordinal);

        public IReadOnlyCollection<SystemPageStandard> All => standards.Values.ToArray();
        public bool TryGet(string screenKey, out SystemPageStandard standard) => standards.TryGetValue(screenKey, out standard!);
    }
}
