using System.Text.Json;
using System.Text.Json.Nodes;

/// <summary>
/// Davranış eşdeğerliği (toplu kalıp geçişi 5b-1, Karar 5): bir eski sayfa tanımı ile onun kalıba dönüştürülmüş biçimi arasında
/// yalnız yerleşimin değiştiğini denetler. Dönüştürücüden bağımsız yazılmıştır (ortak yardımcı yok); dönüştürücünün bir hatası
/// burada yakalanmalıdır.
/// <list type="bullet">
/// <item>Kök: yalnız <c>template</c> eklenebilir; <c>schemaVersion</c>, <c>queries</c> (derin eşit) ve öteki alanlar aynı kalır.</item>
/// <item>Var olan her bileşen (çocuklar dahil) kalır; <c>type</c>, <c>name</c>, üst bileşeni ve çocuklarının sırası aynıdır;
/// var olan bileşenlerin göreli sırası değişmez.</item>
/// <item>Özelliklerden yalnız <c>slot</c>, <c>width</c>, <c>margin</c>, <c>padding</c>; bölümde (<c>section</c>) <c>columns</c> ve
/// <c>members</c>; sekme bileşeninde (<c>tabs</c>) etiketleri, sayısı ve her sekmenin taşıdığı var olan bileşenler (bölümlerin
/// <c>members</c> listesi açılarak) aynı kalmak üzere <c>tabs</c> kimlik listeleri değişebilir.
/// <c>widthWhen</c> ve <c>title</c> var olan bileşende hiç değişemez (Karar 5'in katı okuması).</item>
/// <item>Eklenen bileşen yalnız üst düzey, çocuksuz <c>section</c> (slot, columns, members, title, margin, padding) ya da
/// <c>tabs</c> (slot, tabs) olabilir.</item>
/// <item>Sonraki tanım kalıplıysa (5b-2a) işlem çubuğunun her ayarı (<c>slot</c> dışında) kalıpta karşılığı olan ayarlardandır ve
/// görünen Yazdır önceki çubukta bağlıydı (<c>printEnabled: true</c>). Çubuktan yalnız <c>printEnabled</c> silinebilir: önceki
/// değer true ise ya da Yazdır sonrakinde gizliyse.</item>
/// <item>Sonraki tanım Kayıt kartıysa kartın Kaydet / Sil sonrası kuralı hiçbir komuta ya da düğmeye uygulanmaz: çubukta dolu
/// <c>saveQuery</c> / <c>saveSequence</c> (<c>afterSaveAction: "page"</c> olmadan) ya da <c>deleteQuery</c> yok; çubuğun
/// çalıştırmadığı ("⋯" gizliyse menü düğmeleri de sayılır) kayıt dizisi ya da silme sorgulu düğme yok.</item>
/// </list>
/// </summary>
internal static class BehaviorEquivalence
{
    private static readonly HashSet<string> AnyComponentLayout = new(StringComparer.Ordinal) { "slot", "width", "margin", "padding" };
    private static readonly HashSet<string> AddedSectionProps = new(StringComparer.Ordinal) { "slot", "columns", "members", "title", "margin", "padding" };
    private static readonly HashSet<string> AddedTabsProps = new(StringComparer.Ordinal) { "slot", "tabs" };
    private static readonly HashSet<string> ComponentKeys = new(StringComparer.Ordinal) { "id", "type", "name", "props", "children" };

    private sealed record Entry(string Id, JsonObject Node, string? ParentId, int Order);

    /// <summary>Eşdeğerse null; değilse ilk farkın Türkçe açıklaması.</summary>
    public static string? Check(string before, string after)
    {
        JsonObject b, a;
        try
        {
            b = JsonNode.Parse(before) as JsonObject ?? throw new JsonException();
            a = JsonNode.Parse(after) as JsonObject ?? throw new JsonException();
        }
        catch (JsonException) { return "Sayfa tanımı okunamadı."; }

        foreach (var key in b.Select(x => x.Key).Union(a.Select(x => x.Key)).Where(x => x != "components"))
        {
            var hasBefore = b.TryGetPropertyValue(key, out var bv);
            var hasAfter = a.TryGetPropertyValue(key, out var av);
            if (key == "template" && !hasBefore && hasAfter) continue;
            if (hasBefore != hasAfter || !JsonNode.DeepEquals(bv, av))
                return key == "queries" ? "Sorgular değişti." : $"Sayfa kökündeki '{key}' alanı değişti.";
        }

        if (Flatten(b) is not { } bs) return "Önceki tanımın bileşenleri okunamadı.";
        if (Flatten(a) is not { } @as) return "Dönüştürülen tanımın bileşenleri okunamadı.";
        var afterById = @as.ToDictionary(x => x.Id, StringComparer.Ordinal);
        var beforeById = bs.ToDictionary(x => x.Id, StringComparer.Ordinal);
        var beforeIds = bs.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var templated = a.ContainsKey("template");
        if (templated && TemplateBarDifference(@as, beforeById) is { } barDifference) return barDifference;
        if (a["template"] is JsonObject template && (string?)template["name"] == "record" && RecordRuleDifference(a, @as) is { } recordDifference)
            return recordDifference;

        foreach (var entry in bs)
        {
            if (!afterById.TryGetValue(entry.Id, out var next)) return $"'{entry.Id}' bileşeni silindi.";
            foreach (var key in entry.Node.Select(x => x.Key).Union(next.Node.Select(x => x.Key)))
                if (!ComponentKeys.Contains(key) && !JsonNode.DeepEquals(entry.Node[key], next.Node[key]))
                    return $"'{entry.Id}' bileşeninin '{key}' alanı değişti.";
            if (!JsonNode.DeepEquals(entry.Node["type"], next.Node["type"])) return $"'{entry.Id}' bileşeninin türü değişti.";
            if (!JsonNode.DeepEquals(entry.Node["name"], next.Node["name"])) return $"'{entry.Id}' bileşeninin adı değişti.";
            if (entry.ParentId != next.ParentId) return $"'{entry.Id}' bileşeninin yeri (üst bileşeni) değişti.";
            if (!ChildIds(entry.Node).SequenceEqual(ChildIds(next.Node))) return $"'{entry.Id}' bileşeninin iç bileşenleri değişti.";
            var type = (string?)entry.Node["type"];
            if (PropsDifference(entry.Id, type, entry.Node["props"] as JsonObject, next.Node["props"] as JsonObject, templated) is { } difference) return difference;
            if (type == "tabs" && TabContentDifference(entry.Id, entry.Node["props"]?["tabs"], next.Node["props"]?["tabs"], beforeById, afterById) is { } tabDifference)
                return tabDifference;
        }

        var beforeOrder = bs.Select(x => x.Id).ToArray();
        var afterOrder = @as.Where(x => beforeIds.Contains(x.Id)).Select(x => x.Id).ToArray();
        if (!beforeOrder.SequenceEqual(afterOrder, StringComparer.Ordinal)) return "Bileşenlerin sırası değişti.";

        foreach (var added in @as.Where(x => !beforeIds.Contains(x.Id)))
        {
            var type = (string?)added.Node["type"];
            if (type is not ("section" or "tabs")) return $"Eklenen '{added.Id}' bileşeni bölüm ya da sekme değil.";
            if (added.ParentId is not null || ChildIds(added.Node).Count > 0) return $"Eklenen '{added.Id}' bileşeni üst düzeyde ve çocuksuz olmalı.";
            if (added.Node.Any(x => x.Key is not ("id" or "type" or "props"))) return $"Eklenen '{added.Id}' bileşeninde yalnız yerleşim bilgisi olabilir.";
            var allowed = type == "section" ? AddedSectionProps : AddedTabsProps;
            if (added.Node["props"] is JsonObject props && props.FirstOrDefault(x => !allowed.Contains(x.Key)) is { Key: { } extra })
                return $"Eklenen '{added.Id}' bileşeninin '{extra}' özelliği yerleşim özelliği değil.";
        }
        return null;
    }

    /// <summary>
    /// Değişen yerleşim özelliği sayısı (rapor için): var olan bileşenlerde farklı olan (bileşen, özellik) çiftleri ve eklenen
    /// bileşenlerin bütün özellikleri. Okunamayan tanımda 0.
    /// </summary>
    public static int LayoutChanges(string before, string after)
    {
        try
        {
            if (JsonNode.Parse(before) is not JsonObject b || JsonNode.Parse(after) is not JsonObject a) return 0;
            if (Flatten(b) is not { } bs || Flatten(a) is not { } @as) return 0;
            var beforeById = bs.ToDictionary(x => x.Id, StringComparer.Ordinal);
            var count = 0;
            foreach (var entry in @as)
            {
                var props = entry.Node["props"] as JsonObject;
                if (!beforeById.TryGetValue(entry.Id, out var old)) { count += props?.Count ?? 0; continue; }
                var oldProps = old.Node["props"] as JsonObject;
                var keys = (props?.Select(x => x.Key) ?? []).Union(oldProps?.Select(x => x.Key) ?? []);
                count += keys.Count(key => !JsonNode.DeepEquals(props?[key], oldProps?[key]));
            }
            return count;
        }
        catch (JsonException) { return 0; }
    }

    /// <summary>
    /// Kalıplı sonraki tanımda işlem çubuğu (5b-2a): her ayarı (<c>slot</c> dışında) kalıpta karşılığı olan ayarlardandır
    /// (<see cref="PageTemplateRules.TemplateBarProps"/>); kalıpta görünen Yazdır yazdırdığından Yazdır gizli değilse önceki çubukta
    /// <c>printEnabled</c> açık olmalıydı. Ayarların kendisinin değişmemesi genel özellik kuralındadır.
    /// </summary>
    private static string? TemplateBarDifference(List<Entry> after, Dictionary<string, Entry> beforeById)
    {
        foreach (var bar in after.Where(x => (string?)x.Node["type"] == "actionBar"))
        {
            var props = bar.Node["props"] as JsonObject;
            if (props?.FirstOrDefault(x => x.Key != "slot" && !PageTemplateRules.TemplateBarProps.Contains(x.Key)) is { Key: { } key })
                return $"İşlem çubuğunun '{key}' ayarının kalıpta karşılığı yok.";
            var printHidden = props?["hiddenCommands"] is JsonArray hidden && hidden.OfType<JsonValue>().Any(x => x.TryGetValue<string>(out var id) && id == "print");
            var printBound = beforeById.TryGetValue(bar.Id, out var old) && old.Node["props"]?["printEnabled"] is JsonValue enabled
                && enabled.TryGetValue<bool>(out var on) && on;
            if (!printHidden && !printBound) return "Kalıpta görünen Yazdır yazdırır; önceki sayfada bağlı değildi.";
        }
        return null;
    }

    /// <summary>
    /// Sonraki Kayıt kartında kartın Kaydet / Sil sonrası kuralına giren komut ya da düğme (dönüştürücüden bağımsız yazıldı).
    /// </summary>
    private static string? RecordRuleDifference(JsonObject root, List<Entry> after)
    {
        const string RecordRule = "Kayıt kartının kayıt/silme sonrası kuralı eski sayfadaki davranışı değiştirir.";
        static bool NonEmpty(JsonNode? node) =>
            node is JsonArray list ? list.Count > 0 : node is JsonValue value && value.TryGetValue<string>(out var text) && !string.IsNullOrEmpty(text);
        static string? Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
        var runByBar = new HashSet<string>(StringComparer.Ordinal);
        foreach (var bar in after.Where(x => x.ParentId is null && Text(x.Node["type"]) == "actionBar"))
        {
            var props = bar.Node["props"] as JsonObject;
            if ((NonEmpty(props?["saveQuery"]) || NonEmpty(props?["saveSequence"])) && Text(props?["afterSaveAction"]) != "page") return RecordRule;
            if (NonEmpty(props?["deleteQuery"])) return RecordRule;
            var moreHidden = props?["hiddenCommands"] is JsonArray hidden && hidden.Any(x => Text(x) == "more");
            foreach (var key in new[] { "newButton", "openButton", "afterSaveButton", "moreButtons" })
            {
                if (key == "moreButtons" && moreHidden) continue;
                if (props?[key] is JsonArray ids) foreach (var id in ids) { if (Text(id) is { } one) runByBar.Add(one); }
                else if (Text(props?[key]) is { } single) runByBar.Add(single);
            }
        }
        var kinds = new Dictionary<string, string?>(StringComparer.Ordinal);
        if (root["queries"] is JsonArray queries)
            foreach (var query in queries.OfType<JsonObject>()) if (Text(query["id"]) is { } queryId) kinds[queryId] = Text(query["kind"]);
        foreach (var button in after.Where(x => x.ParentId is null && Text(x.Node["type"]) == "button" && !runByBar.Contains(x.Id)))
        {
            var props = button.Node["props"] as JsonObject;
            var action = Text(props?["actionType"]);
            if (action == "sequence") return RecordRule;
            if (action == "query" && Text(props?["queryId"]) is { } target && kinds.TryGetValue(target, out var kind) && kind == "delete") return RecordRule;
        }
        return null;
    }

    private static string? PropsDifference(string id, string? type, JsonObject? before, JsonObject? after, bool templated)
    {
        var keys = (before?.Select(x => x.Key) ?? []).Union(after?.Select(x => x.Key) ?? []).ToArray();
        foreach (var key in keys)
        {
            JsonNode? bv = null, av = null;
            var hasBefore = before?.TryGetPropertyValue(key, out bv) == true;
            var hasAfter = after?.TryGetPropertyValue(key, out av) == true;
            if (hasBefore == hasAfter && JsonNode.DeepEquals(bv, av)) continue;
            if (AnyComponentLayout.Contains(key)) continue;
            if (key is "columns" or "members" && type == "section") continue;
            if (key == "tabs" && type == "tabs" && SameTabLabels(bv, av)) continue;
            // Kalıplı çubuktan printEnabled silinebilir: önceki true idiyse ya da Yazdır sonrakinde gizliyse (kalıpta görünen Yazdır yazdırır).
            if (key == "printEnabled" && type == "actionBar" && templated && hasBefore && !hasAfter
                && (bv is JsonValue was && was.TryGetValue<bool>(out var on) && on
                    || after?["hiddenCommands"] is JsonArray hidden && hidden.OfType<JsonValue>().Any(x => x.TryGetValue<string>(out var command) && command == "print")))
                continue;
            return $"'{id}' bileşeninin '{key}' özelliği değişti.";
        }
        return null;
    }

    /// <summary>İki <c>tabs</c> değeri aynı sayıda ve aynı sırada aynı etiketleri taşıyor mu (kimlik listeleri serbest).</summary>
    private static bool SameTabLabels(JsonNode? before, JsonNode? after)
    {
        if (before is not JsonArray b || after is not JsonArray a || b.Count != a.Count) return false;
        for (var i = 0; i < b.Count; i++)
        {
            if (b[i] is not JsonValue bv || a[i] is not JsonValue av || !bv.TryGetValue<string>(out var bs) || !av.TryGetValue<string>(out var @as)) return false;
            var bl = bs.IndexOf('=');
            var al = @as.IndexOf('=');
            if (bl < 0 || al < 0 || !string.Equals(bs[..bl], @as[..al], StringComparison.Ordinal)) return false;
        }
        return true;
    }

    /// <summary>
    /// Her sekme etiketi için önce/sonra taşıdığı var olan bileşen kümesi aynı mı. Bir kimlik bölümse (<c>section</c>) onun
    /// <c>members</c> listesi de açılır; yalnız dönüşümde eklenen (önceki tanımda olmayan) kimlikler kümeye girmez.
    /// </summary>
    private static string? TabContentDifference(string id, JsonNode? before, JsonNode? after, Dictionary<string, Entry> beforeById, Dictionary<string, Entry> afterById)
    {
        if (before is not JsonArray b || after is not JsonArray a || b.Count != a.Count) return null; // label check reports this
        for (var i = 0; i < b.Count; i++)
        {
            if (b[i] is not JsonValue bv || a[i] is not JsonValue av || !bv.TryGetValue<string>(out var bs) || !av.TryGetValue<string>(out var @as)) continue;
            var bl = bs.IndexOf('=');
            var al = @as.IndexOf('=');
            if (bl < 0 || al < 0) continue;
            var beforeSet = TabMembers(bs[(bl + 1)..], beforeById, beforeById);
            var afterSet = TabMembers(@as[(al + 1)..], afterById, beforeById);
            if (!beforeSet.SetEquals(afterSet)) return $"'{id}' bileşeninin '{bs[..bl]}' sekmesindeki bileşenler değişti.";
        }
        return null;
    }

    private static HashSet<string> TabMembers(string ids, Dictionary<string, Entry> nodes, Dictionary<string, Entry> existing)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var id in ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (existing.ContainsKey(id)) result.Add(id);
            if (!nodes.TryGetValue(id, out var node) || (string?)node.Node["type"] != "section" || node.Node["props"]?["members"] is not JsonArray members) continue;
            foreach (var member in members.OfType<JsonValue>())
                if (member.TryGetValue<string>(out var memberId) && existing.ContainsKey(memberId)) result.Add(memberId);
        }
        return result;
    }

    private static List<string> ChildIds(JsonObject component) =>
        component["children"] is JsonArray children ? children.Select(x => x is JsonObject o ? (string?)o["id"] ?? "" : "").ToList() : [];

    /// <summary>Bütün bileşenler (çocuklar dahil) ön sırayla; kimliği olmayan ya da yinelenen bileşen varsa null.</summary>
    private static List<Entry>? Flatten(JsonObject root)
    {
        if (root["components"] is not JsonArray components) return null;
        var result = new List<Entry>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        bool Walk(JsonArray array, string? parent)
        {
            foreach (var item in array)
            {
                if (item is not JsonObject obj || obj["id"] is not JsonValue idValue || !idValue.TryGetValue<string>(out var id) || !seen.Add(id)) return false;
                result.Add(new Entry(id, obj, parent, result.Count));
                if (obj["children"] is JsonArray children && !Walk(children, id)) return false;
            }
            return true;
        }
        return Walk(components, null) ? result : null;
    }
}
