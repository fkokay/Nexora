using System.Text.Json;
using AIERP.Api.DocumentModels;

/// <summary>
/// Rules of a page that carries a root <c>template</c>: <c>list</c> (sub-project 3), <c>record</c> (Kayıt kartı, sub-project 4) or
/// <c>free</c> (Serbest gövde, sub-project 5c).
/// Every top-level component names its place with <c>props.slot</c>. Pages without <c>template</c> never reach this class.
/// </summary>
internal static class PageTemplateRules
{
    /// <summary>The slot of a templated page's only action bar (5b-2a): the commands (Yeni, Düzenle, Kaydet, Sil…) the shell draws.</summary>
    internal const string CommandsSlot = "commands";

    /// <summary>
    /// The action bar settings a list, record or free page's <c>commands</c> bar may carry: the legacy bar's settings that have a
    /// meaning in the template shell, with the same names, values and validation. Everything else (<c>barLook</c>, <c>formDialog</c>,
    /// <c>printEnabled</c>, <c>exportCsv</c>, <c>visibleWhen</c>, <c>disabledWhen</c>…) is rejected with <see cref="KomutAyari"/>.
    /// </summary>
    internal static readonly IReadOnlySet<string> TemplateBarProps = new HashSet<string>(StringComparer.Ordinal)
    {
        "hiddenCommands", "commandWhen", "newAction", "newPageCode", "newTarget", "newInputs", "newButton", "openAction", "openPageCode",
        "openTarget", "openTable", "openParams", "openButton", "saveQuery", "saveSequence", "sequenceWhen", "stopOnError", "afterSaveAction",
        "afterSavePageCode", "afterSaveTarget", "afterSaveRefresh", "afterSaveButton", "saveAndNew", "deleteQuery", "deleteConfirmText",
        "exportTable", "titleCount", "focusInput", "moreButtons", "slot"
    };

    /// <summary>The bar settings that name a button the commands run (the button lives in <c>actions</c> and is not drawn there again).</summary>
    internal static readonly string[] BarButtonProps = ["moreButtons", "newButton", "openButton", "afterSaveButton"];

    internal const string KomutYeri = "Kalıplı sayfada işlem çubuğu yalnız üst düzeyde, 'commands' yerinde ve bir kez kullanılır; düğmeler 'actions' yerine konur.";
    internal static string KomutAyari(string key) => $"Kalıplı sayfanın komutlarında '{key}' kullanılamaz.";
    internal static string KomutDugmesi(string id) => $"Komutların bağladığı düğme 'actions' yerinde olmalı: {id}.";
    internal const string IkiKaydet = "Kayıt kartında Kaydet ya Komutlar'da ya da Kaydet düğmesinde tanımlanır; ikisi birden olamaz.";
    internal const string IkiSil = "Kayıt kartında Sil ya Komutlar'da ya da Sil düğmesinde tanımlanır; ikisi birden olamaz.";
    internal const string KayitSayisi = "Kayıt kartında başlıkta kayıt sayısı (titleCount) kullanılmaz.";
    internal const string BelgeKomut = "Belge kalıbında komutlar belge modelinden gelir; işlem çubuğu (actionBar) kullanılamaz.";
    internal const string YeniSayfaKalipli = "Yeni sayfa bir kalıpla (Liste, Kayıt kartı, Belge ya da Serbest) oluşturulmalıdır.";

    /// <summary>The id of the top-level action bar in the <c>commands</c> slot, or null.</summary>
    internal static string? CommandBarId(JsonElement components) => CommandBar(components) is { } bar ? Id(bar) : null;

    private static JsonElement? CommandBar(JsonElement components)
    {
        if (components.ValueKind != JsonValueKind.Array) return null;
        foreach (var component in components.EnumerateArray())
            if (IsCommandBar(component)) return component;
        return null;
    }

    private static bool IsCommandBar(JsonElement component) =>
        component.ValueKind == JsonValueKind.Object
        && component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "actionBar"
        && component.TryGetProperty("props", out var props) && StringProp(props, "slot") == CommandsSlot;

    /// <summary>The bar's button ids, in the order of <see cref="BarButtonProps"/>.</summary>
    private static IEnumerable<string> BarButtons(JsonElement bar)
    {
        var props = bar.GetProperty("props");
        foreach (var key in BarButtonProps)
        {
            if (!props.TryGetProperty(key, out var value)) continue;
            if (value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } one) yield return one;
            else if (value.ValueKind == JsonValueKind.Array)
                foreach (var item in value.EnumerateArray())
                    if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } id) yield return id;
        }
    }

    /// <summary>The ids of the buttons the commands bar runs (<see cref="BarButtonProps"/>); empty without a commands bar.</summary>
    internal static IReadOnlySet<string> BarButtonIds(JsonElement components) =>
        CommandBar(components) is { } bar ? BarButtons(bar).ToHashSet(StringComparer.Ordinal) : new HashSet<string>(StringComparer.Ordinal);

    /// <summary>
    /// The buttons the commands bar draws itself (not as page buttons): <see cref="BarButtonIds"/>, except the "⋯" menu buttons
    /// (<c>moreButtons</c>) while "more" is in <c>hiddenCommands</c> — then the shell draws them as page buttons.
    /// </summary>
    internal static IReadOnlySet<string> BarDrawnButtonIds(JsonElement components)
    {
        if (CommandBar(components) is not { } bar) return new HashSet<string>(StringComparer.Ordinal);
        var ids = BarButtons(bar).ToHashSet(StringComparer.Ordinal);
        var props = bar.GetProperty("props");
        if (props.TryGetProperty("hiddenCommands", out var hidden) && hidden.ValueKind == JsonValueKind.Array
            && hidden.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String && x.GetString() == "more")
            && props.TryGetProperty("moreButtons", out var more) && more.ValueKind == JsonValueKind.Array)
        {
            var otherKeys = BarButtonProps.Where(x => x != "moreButtons").ToArray();
            var stillRun = otherKeys.Where(key => props.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String)
                .Select(key => props.GetProperty(key).GetString()).ToHashSet(StringComparer.Ordinal);
            foreach (var item in more.EnumerateArray())
                if (item.ValueKind == JsonValueKind.String && !stillRun.Contains(item.GetString())) ids.Remove(item.GetString()!);
        }
        return ids;
    }

    /// <summary>
    /// Every button the commands bar runs is a top-level component in the <c>actions</c> slot — on Liste also <c>rowActions</c>
    /// (rows draw from there; the shell removes the bar's buttons from the page) — null when valid. Called once the component
    /// loop resolved the references (they exist and are buttons).
    /// </summary>
    internal static string? ValidateBarButtons(JsonElement components, string? template = null)
    {
        if (CommandBar(components) is not { } bar) return null;
        var allowed = template == "list" ? new[] { "actions", "rowActions" } : ["actions"];
        var placed = components.EnumerateArray()
            .Where(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("props", out var p) && allowed.Contains(StringProp(p, "slot")))
            .Select(Id).ToHashSet(StringComparer.Ordinal);
        return BarButtons(bar).FirstOrDefault(id => !placed.Contains(id)) is { } wrong ? KomutDugmesi(wrong) : null;
    }

    /// <summary>The slot of a templated page's top-level windows (5b-2 adım 2): legacy <c>dialog</c> components, settings unchanged.</summary>
    internal const string DialogsSlot = "dialogs";

    /// <summary>The slot of a window's contents: the components its <c>contains</c> and its own <c>tabs</c> point at.</summary>
    internal const string DialogSlot = "dialog";

    /// <summary>The component types a window may hold (top-level, in the <c>dialog</c> slot).</summary>
    internal static readonly IReadOnlySet<string> DialogPartTypes = new HashSet<string>(StringComparer.Ordinal)
    { "recordHeader", "section", "card", "formCard", "input", "text", "alert", "metric", "button", "dataTable", "tabs", "customFieldsBlock", "editableGrid" };

    /// <summary>The component types a one-level group (<c>section</c>/<c>card</c> + <c>children</c>) may hold.</summary>
    internal static readonly IReadOnlySet<string> GroupChildTypes = new HashSet<string>(StringComparer.Ordinal)
    { "badge", "heading", "text", "metric", "alert", "button", "formCard", "dataTable", "contextPanel", "tabs" };

    internal const string PencereYeri = "Kalıplı sayfada pencere (dialog) yalnız üst düzeyde, 'dialogs' yerinde durur.";
    internal const string PencereBelge = "Belge kalıbında pencere (dialog) kullanılamaz.";
    internal const string PencereSunum = "Kalıplı sayfada pencere yalnız 'dialog' sunumuyla ve sm, md, lg ya da xl boyutunda olur.";
    internal static string PencereIcerigi(string id) => $"Pencerenin içeriği tam bir pencereye ait olmalı ve 'dialog' yerinde durmalı: {id}.";
    internal static string PencereTuru(string type) => $"{type} pencerenin içinde kullanılamaz.";
    internal const string PencereOzet = "Bir pencerede en fazla bir kayıt özeti (recordHeader) olabilir.";
    internal const string PencereSekme = "Bir pencerede en fazla bir sekme bileşeni (tabs) olabilir.";
    internal const string GrupYeri = "İç içe bileşenler (children) yalnız pencerenin içindeki ya da Liste detayındaki bölüm ve kartta olabilir.";
    internal const string GrupIcIce = "Grubun içine grup ya da pencere konamaz.";
    internal static string GrupTuru(string type) => $"{type} grubun içinde kullanılamaz.";
    internal const string OzelAlanYeri = "Özel alan bloğu yalnız Kayıt kartında 'customFields' yerinde ve pencerenin içinde durabilir.";
    internal const string OzelAlanIki = "Bir sayfada ve bir pencerede en fazla bir özel alan bloğu olabilir.";
    internal static string OzelAlanKayit(string name) => $"Özel alan bloğunun değerleri kaydedilmiyor: kayıt adımlarından birinde '{{{{{name}.degerler}}}}' bağlanmalı.";
    internal const string SatirYeri = "Satır tablosu (editableGrid) yalnız pencerenin içinde kullanılabilir.";
    internal const string SatirIki = "Bir pencerede en fazla bir satır tablosu olabilir.";
    internal const string SatirKip = "Pencerede satır tablosu yalnız 'list' kipinde kullanılabilir.";
    internal static string SatirSutunu(string column) => $"Pencerede satır tablosu yalnız metin, sayı, tarih, onay kutusu ve seçim (lookup) sütunlarını alır: {column}.";
    internal static string SatirAyari(string key) => $"'{key}' pencerede satır tablosunda kullanılamaz.";
    internal const string SatirSutunSayisi = "Pencerede satır tablosu en fazla 8 sütun alır.";
    internal const string SatirSinir = "Pencerede satır tablosu için 'maxRows' 1–200 olmalıdır.";
    internal static string SatirKayit(string name) => $"Satır tablosunun satırları kaydedilmiyor: pencerenin kayıt adımlarından birinde '{{{{{name}.satirlar}}}}' bağlanmalı.";
    internal const string SatirEylem = "Satır tablosu olan pencerenin bir kayıt eylemi olmalı.";
    private const int MaxWindowGridRows = 200;
    private static readonly HashSet<string> WindowGridProps = new(StringComparer.Ordinal)
    { "slot", "gridMode", "title", "description", "gridColumns", "minRows", "maxRows", "addLabel", "disabledWhen", "disabledReason", "visibleWhen",
      "columnOptionsWhen", "columnStaticOptions", "fillQuery", "fillColumns", "skipWhenZero" };
    internal static string SatirEylemYeri(string id) => $"Satır işlemi düğmesi pencerenin içindeki bir veri listesinin 'rowActions' listesinde olmalı: {id}.";
    internal const string TekDetay = "Liste kalıbında detay yerinde en fazla bir bileşen (detay paneli ya da kart) olabilir.";

    /// <summary>
    /// Window ownership, independent of slots: component id → window id for every id a top-level <c>dialog</c>'s <c>contains</c>
    /// lists, plus the ids the tabs inside that window (a contained <c>tabs</c>, or a <c>tabs</c> child of a contained group) point at,
    /// plus the <c>inputs</c> of every form card among those (or a form card child of such a group).
    /// An id two windows claim is left out.
    /// </summary>
    internal static IReadOnlyDictionary<string, string> DialogOwners(JsonElement components) => DialogOwners(components, out _);

    /// <inheritdoc cref="DialogOwners(JsonElement)"/>
    /// <param name="error"><see cref="PencereIcerigi"/> of the first id two windows claim, else null.</param>
    internal static IReadOnlyDictionary<string, string> DialogOwners(JsonElement components, out string? error)
    {
        error = null;
        var owners = new Dictionary<string, string>(StringComparer.Ordinal);
        if (components.ValueKind != JsonValueKind.Array) return owners;
        var byId = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var component in components.EnumerateArray())
            if (component.ValueKind == JsonValueKind.Object && Id(component) is { } id) byId.TryAdd(id, component);

        var shared = new List<string>();
        foreach (var dialog in components.EnumerateArray().Where(x => TypeOf(x) == "dialog"))
        {
            if (Id(dialog) is not { } dialogId) continue;
            var owned = new List<string>();
            foreach (var id in StringArray(dialog, "contains"))
            {
                owned.Add(id);
                if (!byId.TryGetValue(id, out var part)) continue;
                if (TypeOf(part) == "tabs") owned.AddRange(TabIds(part));
                foreach (var child in Children(part).Where(x => TypeOf(x) == "tabs")) owned.AddRange(TabIds(child));
            }
            // The inputs of every form card in the window (a content form card or a form card child of a content group).
            foreach (var id in owned.ToArray())
            {
                if (!byId.TryGetValue(id, out var part)) continue;
                foreach (var card in Children(part).Prepend(part).Where(x => TypeOf(x) == "formCard"))
                    owned.AddRange(StringArray(card, "inputs"));
            }
            foreach (var id in owned.Distinct(StringComparer.Ordinal))
                if (!owners.TryAdd(id, dialogId) && owners[id] != dialogId && !shared.Contains(id)) shared.Add(id);
        }
        foreach (var id in shared) owners.Remove(id);
        if (shared.Count > 0) error = PencereIcerigi(shared[0]);
        return owners;
    }

    private static string? TypeOf(JsonElement component) =>
        component.ValueKind == JsonValueKind.Object && component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String ? type.GetString() : null;

    private static IEnumerable<JsonElement> Children(JsonElement component) =>
        component.ValueKind == JsonValueKind.Object && component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array
            ? children.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Object).ToArray()
            : [];

    private static bool HasChildren(JsonElement component) =>
        component.ValueKind == JsonValueKind.Object && component.TryGetProperty("children", out var children)
        && children.ValueKind == JsonValueKind.Array && children.GetArrayLength() > 0;

    /// <summary>The ids a tabs component's <c>Etiket=id1,id2</c> items point at.</summary>
    private static IEnumerable<string> TabIds(JsonElement tabs) =>
        StringArray(tabs, "tabs").SelectMany(item => item.Split('=', 2) is [_, var ids] && ids.Length > 0 ? ids.Split(',') : []);

    internal static readonly IReadOnlySet<string> Slots = new HashSet<string>(StringComparer.Ordinal)
    { "indicators", "filters", "list", "actions", "rowActions", "detail", "above", "below", CommandsSlot, DialogsSlot, DialogSlot };

    internal static readonly IReadOnlySet<string> RecordSlots = new HashSet<string>(StringComparer.Ordinal)
    { "summary", "actions", "tabs", "section", "field", "lines", "note", CustomFieldsSlot, "above", "below", "rowActions", CommandsSlot, DialogsSlot, DialogSlot };

    /// <summary>The Kayıt kartı slot of its custom fields block (in exactly one tab).</summary>
    internal const string CustomFieldsSlot = "customFields";

    internal static readonly IReadOnlySet<string> FreeSlots = new HashSet<string>(StringComparer.Ordinal)
    { "actions", "tabs", "block", "item", "rowActions", CommandsSlot, DialogsSlot, DialogSlot };

    private static readonly Dictionary<string, string> SlotTypes = new(StringComparer.Ordinal)
    {
        ["indicators"] = "metric", ["filters"] = "filterBar", ["list"] = "dataTable", ["actions"] = "button",
        ["rowActions"] = "button", [CommandsSlot] = "actionBar"
    };

    /// <summary>Liste's detail: one context panel or one card group.</summary>
    private static readonly string[] DetailTypes = ["contextPanel", "card"];

    private static readonly Dictionary<string, string> RecordSlotTypes = new(StringComparer.Ordinal)
    {
        ["summary"] = "recordHeader", ["actions"] = "button", ["tabs"] = "tabs", ["section"] = "formCard",
        ["field"] = "input", ["lines"] = "dataTable", ["note"] = "text", [CustomFieldsSlot] = "customFieldsBlock", ["rowActions"] = "button", [CommandsSlot] = "actionBar"
    };

    internal static readonly IReadOnlySet<string> BelgeSlots = new HashSet<string>(StringComparer.Ordinal)
    { "fields", "lines", "summary", "actions", "above", "below" };

    /// <summary>The Belge parts: each lives only in its own slot, exactly once.</summary>
    internal static readonly IReadOnlyDictionary<string, string> BelgeParts = new Dictionary<string, string>(StringComparer.Ordinal)
    { ["documentFields"] = "fields", ["documentLines"] = "lines", ["documentSummary"] = "summary" };

        private const string UnknownDocument = "Belge kalıbı bilinen bir belge ister (ör. \"satis.siparis\").";
    private const string MaxLabelLength = "Belge etiketleri en fazla 60 karakter olabilir.";
    private static readonly string[] FreeItemTypes =
        ["heading", "text", "label", "section", "alert", "card", "list", "metric", "progress", "badge", "image", "dataTable"];

    private static readonly Dictionary<string, string> FreeSlotTypes = new(StringComparer.Ordinal)
    {
        ["actions"] = "button", ["tabs"] = "tabs", ["block"] = "section", ["item"] = string.Join(", ", FreeItemTypes), ["rowActions"] = "button", [CommandsSlot] = "actionBar"
    };

    private const string UnknownTemplate = "Kalıp yalnız \"list\", \"record\", \"belge\" ya da \"free\" olabilir.";
    private const string NeedBlock = "Serbest gövdede en az bir bölüm (section) olmalı.";
    private const string TooManyTabs = "Serbest gövdede en fazla bir sekme bileşeni (tabs) olabilir.";
    private const string ItemOutsideBlock = "Serbest gövdede her bileşen tam bir bölüme ait olmalı.";
    private const string FreeBlockOutsideTab = "Serbest gövdede sekme varsa her bölüm tam bir sekmede yer almalı.";
    private const string FreeBlockTooFull = "Serbest gövdede bir bölüm en fazla 12 bileşen içerebilir.";
    private const string FreeInlineCode = "Serbest gövdede yalnız katalogdan seçilen yazılımcı bileşeni kullanılabilir.";
    private static bool HasCatalogComponent(JsonElement component) =>
        component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object && props.TryGetProperty("catalogComponent", out _);
    private const string FreeNoChildren = "Serbest gövdede iç içe bileşen (children) kullanılmaz; bileşenler bölümün üyeleri olarak eklenir.";
    private const string FreeEmptyTab = "Serbest gövdede boş sekme olamaz; her sekmede en az bir bölüm bulunmalı.";
    private const string FreeTabOnlyBlocks = "Serbest gövdede sekmeler yalnız bölümleri içerebilir.";
    private const string FreeTooManyBlocks = "Serbest gövdede en fazla 20 bölüm olabilir.";
    private const string FreeTooManyActions = "Serbest gövdede en fazla 8 düğme olabilir.";
    private const string FreeNeedReadTable = "Serbest gövdede veri listesi (dataTable) okuma (read) türünde bir sorguya bağlı olmalı.";
    private const string FreeNoPanelCard = "Serbest gövdede panel görünümlü bilgi kartı (panel) kullanılmaz.";
    private const string MissingSlot = "Kalıplı sayfada her bileşenin bir yeri (slot) olmalı.";
    private const string NeedList = "Liste kalıbında tam bir liste (dataTable) olmalı.";
    private const string NeedSummary = "Kayıt kartında tam bir kayıt özeti (recordHeader) olmalı.";
    private const string NeedTabs = "Kayıt kartında tam bir sekme bileşeni (tabs) olmalı.";
    private const string BlockOutsideTab = "Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı.";
    private const string FieldOutsideSection = "Kayıt kartında her alan tam bir bölüme ait olmalı.";
    private const string NoWidth = "Kalıplı sayfada genişlik ayarı kullanılmaz.";
    private const string NoSpacer = "Kalıplı sayfada boşluk ve ayırıcı bileşenleri kullanılmaz.";

    /// <summary>
    /// The template's <c>name</c> when it is "list" or "record", ignoring extra keys (those are rejected by
    /// <see cref="ValidateTemplate"/> after the component loop); otherwise null. Used during the component loop.
    /// </summary>
    internal static string? DeclaredName(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("template", out var template) && template.ValueKind == JsonValueKind.Object
        && template.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String && name.GetString() is "list" or "record" or "belge" or "free"
            ? name.GetString() : null;

    /// <summary>The template name ("list" or "record") when <paramref name="root"/> carries a well-formed template; otherwise null.</summary>
    internal static string? TemplateName(JsonElement root) =>
        DeclaredName(root) is { } name && root.GetProperty("template").EnumerateObject().All(x => x.Name == "name" || name == "belge" && x.Name == "document")
            ? name : null;

    /// <summary>The Belge page's document code (<c>template.document</c>), or null.</summary>
    internal static string? DocumentCode(JsonElement root) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty("template", out var template) && template.ValueKind == JsonValueKind.Object
        && template.TryGetProperty("document", out var document) && document.ValueKind == JsonValueKind.String ? document.GetString() : null;

    /// <summary>The error text, or null when the template page is valid. <paramref name="queries"/> may be undefined.</summary>
    internal static string? ValidateTemplate(JsonElement root, JsonElement components, JsonElement queries) => TemplateName(root) switch
    {
        "list" => ValidateList(components, queries),
        "record" => ValidateRecord(components, queries),
        "belge" => ValidateBelge(root, components),
        "free" => ValidateFree(components, queries),
        _ => UnknownTemplate
    };

    private static string? ValidateList(JsonElement components, JsonElement queries)
    {
        if (components.ValueKind != JsonValueKind.Array) return NeedList;
        if (PlaceWithDialogs(components, Slots, "list", queries, out var placed) is { } placeError) return placeError;

        foreach (var (_, slot, type) in placed)
        {
            if (SlotTypes.TryGetValue(slot, out var expected) && type != expected) return WrongPart(slot, type, expected);
            if (slot == "detail" && !DetailTypes.Contains(type)) return WrongPart(slot, type, string.Join(", ", DetailTypes));
        }
        if (placed.Count(x => x.Slot == "detail") > 1) return TekDetay;

        var lists = placed.Where(x => x.Slot == "list").ToArray();
        if (lists.Length != 1) return NeedList;
        var queryId = lists[0].Component.TryGetProperty("props", out var tableProps) && tableProps.TryGetProperty("query", out var q)
            && q.ValueKind == JsonValueKind.String ? q.GetString() : null;
        if (queryId is null || queries.ValueKind != JsonValueKind.Array) return NeedList;
        var bound = queries.EnumerateArray().FirstOrDefault(x => x.ValueKind == JsonValueKind.Object
            && x.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() == queryId);
        if (bound.ValueKind != JsonValueKind.Object
            || !(bound.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kind.GetString() == "read"))
            return NeedList;
        return null;
    }

    /// <summary>
    /// Kayıt kartı: one summary, one tabs component listing every section, lines table and note exactly once, and every field in
    /// exactly one section's <c>inputs</c>. Tab and section ownership themselves are the schema's usual tabs/formCard rules.
    /// </summary>
    private static string? ValidateRecord(JsonElement components, JsonElement queries)
    {
        if (components.ValueKind != JsonValueKind.Array) return NeedSummary;
        if (PlaceWithDialogs(components, RecordSlots, "record", queries, out var placed) is { } placeError) return placeError;

        foreach (var (_, slot, type) in placed)
            if (RecordSlotTypes.TryGetValue(slot, out var expected) && type != expected) return WrongPart(slot, type, expected);
        if (placed.Count(x => x.Slot == "summary") != 1) return NeedSummary;
        var tabs = placed.Where(x => x.Slot == "tabs").ToArray();
        if (tabs.Length != 1) return NeedTabs;

        var tabbed = StringArray(tabs[0].Component, "tabs")
            .SelectMany(item => item.Split('=', 2) is [_, var ids] && ids.Length > 0 ? ids.Split(',') : [])
            .ToList();
        if (placed.Count(x => x.Slot == CustomFieldsSlot) > 1) return OzelAlanIki;
        foreach (var (component, _, _) in placed.Where(x => x.Slot is "section" or "lines" or "note" or CustomFieldsSlot))
            if (tabbed.Count(x => x == Id(component)) != 1) return BlockOutsideTab;

        var sectionInputs = placed.Where(x => x.Slot == "section").SelectMany(x => StringArray(x.Component, "inputs")).ToList();
        foreach (var (component, _, _) in placed.Where(x => x.Slot == "field"))
            if (sectionInputs.Count(x => x == Id(component)) != 1) return FieldOutsideSection;
        return ValidateRecordCommands(components, placed, queries) ?? ValidateRecordCustomFields(components, placed, queries);
    }

    /// <summary>The record's custom fields block needs a save step (the commands bar's, or a sequence button's) that binds its values.</summary>
    private static string? ValidateRecordCustomFields(JsonElement components, List<(JsonElement Component, string Slot, string Type)> placed, JsonElement queries)
    {
        var blocks = placed.Where(x => x.Slot == CustomFieldsSlot).ToArray();
        if (blocks.Length == 0) return null;
        var steps = new List<string>();
        if (CommandBar(components) is { } bar) steps.AddRange(SaveSteps(bar.GetProperty("props")));
        foreach (var (component, slot, type) in placed)
            if (slot == "actions" && type == "button" && component.TryGetProperty("props", out var buttonProps) && StringProp(buttonProps, "actionType") == "sequence")
                steps.AddRange(SaveSteps(buttonProps));
        var name = NameOf(blocks[0].Component);
        return Binds(queries, steps, name, "degerler") ? null : OzelAlanKayit(name);
    }

    private static string NameOf(JsonElement component) => StringProp(component, "name") ?? Id(component) ?? "";

    /// <summary>The ids of the write queries a <c>saveQuery</c> / <c>saveSequence</c> owner runs.</summary>
    private static IEnumerable<string> SaveSteps(JsonElement props)
    {
        if (props.ValueKind != JsonValueKind.Object) return [];
        var steps = new List<string>();
        if (StringProp(props, "saveQuery") is { Length: > 0 } one) steps.Add(one);
        if (props.TryGetProperty("saveSequence", out var sequence) && sequence.ValueKind == JsonValueKind.Array)
            steps.AddRange(sequence.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!));
        return steps;
    }

    /// <summary>True when one of the queries (by id) binds one of its parameters exactly to <c>{{name.segment}}</c>.</summary>
    private static bool Binds(JsonElement queries, IEnumerable<string> queryIds, string name, string segment)
    {
        if (queries.ValueKind != JsonValueKind.Array) return false;
        var ids = queryIds.ToHashSet(StringComparer.Ordinal);
        foreach (var query in queries.EnumerateArray())
        {
            if (query.ValueKind != JsonValueKind.Object || StringProp(query, "id") is not { } id || !ids.Contains(id)) continue;
            if (!query.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array) continue;
            foreach (var parameter in parameters.EnumerateArray())
                if (StringProp(parameter, "binding") is { } binding && TenantCustomPageQueries.TryParseBinding(binding, out var path) && path == $"{name}.{segment}")
                    return true;
        }
        return false;
    }

    /// <summary>The window's custom fields block and row table rules (at most one each; saved by the window's own save step).</summary>
    private static string? ValidateWindowExtras(JsonElement dialog, (JsonElement Component, string Slot, string Type)[] parts, JsonElement queries)
    {
        var blocks = parts.Where(x => x.Type == "customFieldsBlock").ToArray();
        var grids = parts.Where(x => x.Type == "editableGrid").ToArray();
        if (blocks.Length > 1) return OzelAlanIki;
        if (grids.Length > 1) return SatirIki;
        var steps = dialog.TryGetProperty("props", out var dialogProps) ? SaveSteps(dialogProps).ToArray() : [];
        if (blocks.Length == 1)
        {
            var name = NameOf(blocks[0].Component);
            if (!Binds(queries, steps, name, "degerler")) return OzelAlanKayit(name);
        }
        if (grids.Length == 1)
        {
            if (WindowGridError(grids[0].Component) is { } gridError) return gridError;
            if (steps.Length == 0) return SatirEylem;
            var name = NameOf(grids[0].Component);
            if (!Binds(queries, steps, name, "satirlar")) return SatirKayit(name);
        }
        return null;
    }

    /// <summary>The small row table set a window allows: list mode, text / number / date / checkbox columns, no engine settings.</summary>
    private static string? WindowGridError(JsonElement grid)
    {
        if (!grid.TryGetProperty("props", out var props) || props.ValueKind != JsonValueKind.Object) return null;
        if (StringProp(props, "gridMode") != "list") return SatirKip;
        if (props.TryGetProperty("gridColumns", out var columns) && columns.ValueKind == JsonValueKind.Array)
        {
            if (columns.GetArrayLength() is < 1 or > 8) return SatirSutunSayisi;
            foreach (var item in columns.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String))
            {
                var parts = item.GetString()!.Split('|');
                if (parts.Length >= 3 && parts[2].StartsWith("calc:", StringComparison.Ordinal))
                    return SatirSutunu(parts[0]);
                if (parts.Length == 4 && parts[3].Split(',').FirstOrDefault(x => x.StartsWith("step:", StringComparison.Ordinal)) is not null)
                    return SatirAyari("step");
            }
        }
        foreach (var prop in props.EnumerateObject())
            if (!WindowGridProps.Contains(prop.Name)) return SatirAyari(prop.Name);
        var max = props.TryGetProperty("maxRows", out var maxRows) && maxRows.ValueKind == JsonValueKind.Number && maxRows.TryGetInt32(out var value) ? value : 0;
        return max is < 1 or > MaxWindowGridRows ? SatirSinir : null;
    }

    /// <summary>
    /// Kayıt kartı commands: Kaydet is either the bar's (<c>saveQuery</c>/<c>saveSequence</c>) or the record's sequence button, Sil
    /// either the bar's <c>deleteQuery</c> or the record's delete-query button, never both; no <c>titleCount</c>. Buttons the bar runs
    /// (its "⋯" menu and command buttons) are not the record's Kaydet / Sil.
    /// </summary>
    private static string? ValidateRecordCommands(JsonElement components, List<(JsonElement Component, string Slot, string Type)> placed, JsonElement queries)
    {
        if (CommandBar(components) is not { } bar) return null;
        var props = bar.GetProperty("props");
        if (props.TryGetProperty("titleCount", out _)) return KayitSayisi;
        var owned = BarButtonIds(components);
        var buttons = placed.Where(x => x.Slot == "actions" && x.Type == "button" && !owned.Contains(Id(x.Component) ?? ""))
            .Select(x => x.Component.TryGetProperty("props", out var p) ? p : default).ToArray();
        // The bar owns Kaydet / Sil only with a non-empty value (the schema rejects empty ones before this rule runs).
        if ((StringProp(props, "saveQuery") is { Length: > 0 } || NonEmptyArray(props, "saveSequence"))
            && buttons.Any(x => StringProp(x, "actionType") == "sequence")) return IkiKaydet;
        if (StringProp(props, "deleteQuery") is { Length: > 0 }
            && buttons.Any(x => StringProp(x, "actionType") == "query" && QueryKind(queries, StringProp(x, "queryId")) == "delete")) return IkiSil;
        return null;
    }

    private static bool NonEmptyArray(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array && value.GetArrayLength() > 0;

    private static string? StringProp(JsonElement element, string key) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static string? QueryKind(JsonElement queries, string? queryId) =>
        queryId is null || queries.ValueKind != JsonValueKind.Array ? null
        : queries.EnumerateArray().Where(x => StringProp(x, "id") == queryId).Select(x => StringProp(x, "kind")).FirstOrDefault();

    /// <summary>
    /// Belge: a known document; exactly one documentFields, documentLines and documentSummary, each in its own slot; their codes come
    /// from the document model, are unique, and keep every required field and column. No grid, formula or fill settings anywhere:
    /// lines, amounts and fills come from the model.
    /// </summary>
    private static string? ValidateBelge(JsonElement root, JsonElement components)
    {
        if (components.ValueKind == JsonValueKind.Array && components.EnumerateArray().Any(HasActionBar)) return BelgeKomut;
        if (components.ValueKind == JsonValueKind.Array && components.EnumerateArray().Any(HasDialog)) return PencereBelge;
        if (DocumentModelRegistry.Find(DocumentCode(root)) is not { } model) return UnknownDocument;
        if (components.ValueKind != JsonValueKind.Array) return Need("documentFields");
        if (Place(components, BelgeSlots, out var placed) is { } placeError) return placeError;
        foreach (var (component, slot, type) in placed)
        {
            if (slot == "actions" && type != "button") return WrongPart(slot, type, "button");
            var slotPart = BelgeParts.FirstOrDefault(x => x.Value == slot).Key;
            if (slotPart is not null && type != slotPart) return WrongPart(slot, type, slotPart);
            if (slotPart is null && BelgeParts.ContainsKey(type)) return $"'{type}' yalnız '{BelgeParts[type]}' yerine konabilir.";
            if (ScanBelge(component) is { } scanError) return scanError;
        }
        foreach (var part in BelgeParts.Keys)
            if (placed.Count(x => x.Type == part) != 1) return Need(part);

        var fields = placed.Single(x => x.Type == "documentFields").Component;
        var lines = placed.Single(x => x.Type == "documentLines").Component;
        return Codes(fields, "fields", model.Fields.Select(x => (x.Code, x.Label, x.Required)).ToList(), "alanı")
            ?? Codes(lines, "columns", model.LineColumns.Select(x => (x.Code, x.Label, x.Required)).ToList(), "kolonu");
    }

    private static bool HasActionBar(JsonElement component) =>
        component.ValueKind == JsonValueKind.Object
        && (component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "actionBar"
            || component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array && children.EnumerateArray().Any(HasActionBar));

    private static bool HasDialog(JsonElement component) => TypeOf(component) == "dialog" || Children(component).Any(HasDialog);

    private static string Need(string part) => $"Belge kalıbında tam bir '{part}' bileşeni olmalı.";

    private static string? Codes(JsonElement component, string key, IReadOnlyList<(string Code, string Label, bool Required)> known, string kind)
    {
        var chosen = StringArray(component, key).ToList();
        if (chosen.FirstOrDefault(x => known.All(k => k.Code != x)) is { } unknown) return $"'{unknown}' bu belgenin {kind} değil.";
        if (chosen.GroupBy(x => x).FirstOrDefault(g => g.Count() > 1) is { } twice) return $"'{twice.Key}' iki kez seçilmiş.";
        foreach (var required in known.Where(k => k.Required))
            if (!chosen.Contains(required.Code)) return $"'{required.Label}' zorunlu, gizlenemez.";
        if (component.GetProperty("props").TryGetProperty("labels", out var labels) && labels.ValueKind == JsonValueKind.Object)
            foreach (var label in labels.EnumerateObject())
            {
                if (!chosen.Contains(label.Name)) return $"'{label.Name}' etiketi seçili olmayan bir {kind} için.";
                if (label.Value.ValueKind != JsonValueKind.String || label.Value.GetString()!.Trim().Length is 0 or > 60) return MaxLabelLength;
            }
        return null;
    }

    /// <summary>Belge also forbids the grid (and with it every fill, formula and calculated-column setting) anywhere in the tree.</summary>
    private static string? ScanBelge(JsonElement component)
    {
        if (component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "editableGrid")
            return "Belge sayfasında 'editableGrid' kullanılamaz; satırlar ve hesap modelden gelir.";
        if (TypeOf(component) == "customFieldsBlock") return OzelAlanYeri;
        if (component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            foreach (var child in children.EnumerateArray())
                if (ScanBelge(child) is { } error) return error;
        return null;
    }

    /// <summary>
    /// The props a Belge part may carry, checked in the component loop (the codes themselves are checked by <see cref="ValidateBelge"/>).
    /// </summary>
    internal static string? ValidateBelgePartProps(string type, JsonElement props)
    {
        string[] allowed = type switch
        {
            "documentFields" => ["slot", "fields", "labels"],
            "documentLines" => ["slot", "columns", "labels", "density"],
            _ => ["slot", "vatBreakdown", "activity"]
        };
        foreach (var prop in props.EnumerateObject())
        {
            if (!allowed.Contains(prop.Name)) return $"'{type}' bileşeninde '{prop.Name}' kullanılamaz.";
            var ok = prop.Name switch
            {
                "slot" => prop.Value.ValueKind == JsonValueKind.String,
                "fields" or "columns" => prop.Value.ValueKind == JsonValueKind.Array && prop.Value.GetArrayLength() <= 40
                    && prop.Value.EnumerateArray().All(x => x.ValueKind == JsonValueKind.String),
                "labels" => prop.Value.ValueKind == JsonValueKind.Object,
                "density" => prop.Value.ValueKind == JsonValueKind.String && prop.Value.GetString() is "dense" or "normal" or "comfy",
                _ => prop.Value.ValueKind is JsonValueKind.True or JsonValueKind.False
            };
            if (!ok) return $"'{type}' bileşeninin '{prop.Name}' değeri geçersiz.";
        }
        return null;
    }

    /// <summary>
    /// Serbest gövde: optional actions buttons, at most one tabs component, 1..20 blocks (<c>section</c>, slot block) whose <c>members</c> list
    /// every item exactly once. With tabs every block is in exactly one tab and no tab is empty. Nothing is nested.
    /// </summary>
    private static string? ValidateFree(JsonElement components, JsonElement queries)
    {
        if (components.ValueKind != JsonValueKind.Array) return NeedBlock;
        // Groups live only in a window's contents (slot dialog); PlaceWithDialogs checks them there.
        foreach (var component in components.EnumerateArray())
            if (HasChildren(component) && !(component.TryGetProperty("props", out var childProps) && StringProp(childProps, "slot") == DialogSlot))
                return FreeNoChildren;
        if (PlaceWithDialogs(components, FreeSlots, "free", queries, out var placed) is { } placeError) return placeError;

        foreach (var (component, slot, type) in placed)
        {
            if (slot is DialogsSlot or DialogSlot) continue;
            // A developer component (code + catalogComponent) may be an item; inline code may not.
            if (slot == "item" && type == "code")
            {
                if (!HasCatalogComponent(component)) return FreeInlineCode;
                continue;
            }
            var allowed = slot == "item" ? FreeItemTypes.Contains(type) : FreeSlotTypes[slot] == type;
            if (!allowed) return WrongPart(slot, type, FreeSlotTypes[slot]);
        }
        var blocks = placed.Where(x => x.Slot == "block").ToArray();
        if (blocks.Length == 0) return NeedBlock;
        if (blocks.Length > 20) return FreeTooManyBlocks;
        // Buttons the commands bar runs are drawn by its commands and "⋯" menu, not as page buttons; with "⋯" hidden the menu
        // buttons are page buttons again and count.
        var owned = BarDrawnButtonIds(components);
        if (placed.Count(x => x.Slot == "actions" && !owned.Contains(Id(x.Component) ?? "")) > 8) return FreeTooManyActions;
        var tabs = placed.Where(x => x.Slot == "tabs").ToArray();
        if (tabs.Length > 1) return TooManyTabs;

        if (blocks.Any(x => StringArray(x.Component, "members").Count() > 12)) return FreeBlockTooFull;
        var members = blocks.SelectMany(x => StringArray(x.Component, "members")).ToList();
        var items = placed.Where(x => x.Slot == "item").ToArray();
        foreach (var (component, _, _) in items)
            if (members.Count(x => x == Id(component)) != 1) return ItemOutsideBlock;
        var itemIds = items.Select(x => Id(x.Component)).ToHashSet();
        if (members.Any(x => !itemIds.Contains(x))) return ItemOutsideBlock;

        if (tabs.Length == 1)
        {
            var tabEntries = StringArray(tabs[0].Component, "tabs")
                .Select(item => item.Split('=', 2) is [_, var ids] && ids.Length > 0 ? ids.Split(',') : [])
                .ToList();
            if (tabEntries.Any(x => x.Length == 0)) return FreeEmptyTab;
            var tabbed = tabEntries.SelectMany(x => x).ToList();
            var blockIds = blocks.Select(x => Id(x.Component)).ToHashSet();
            if (tabbed.Any(x => !blockIds.Contains(x))) return FreeTabOnlyBlocks;
            foreach (var (component, _, _) in blocks)
                if (tabbed.Count(x => x == Id(component)) != 1) return FreeBlockOutsideTab;
        }

        foreach (var (component, _, type) in items)
        {
            if (type == "card" && component.TryGetProperty("props", out var cardProps) && cardProps.TryGetProperty("variant", out var variant)
                && variant.ValueKind == JsonValueKind.String && variant.GetString() == "panel") return FreeNoPanelCard;
            if (type == "dataTable" && !IsReadQuery(component, queries)) return FreeNeedReadTable;
        }
        return null;
    }

    private static bool IsReadQuery(JsonElement table, JsonElement queries)
    {
        var queryId = table.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
            && props.TryGetProperty("query", out var q) && q.ValueKind == JsonValueKind.String ? q.GetString() : null;
        if (queryId is null || queries.ValueKind != JsonValueKind.Array) return false;
        return queries.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.Object
            && x.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() == queryId
            && x.TryGetProperty("kind", out var kind) && kind.ValueKind == JsonValueKind.String && kind.GetString() == "read");
    }

    /// <summary>Every top-level component's slot (one of <paramref name="slots"/>), then the forbidden-thing scan.</summary>
    private static string? Place(JsonElement components, IReadOnlySet<string> slots, out List<(JsonElement Component, string Slot, string Type)> placed)
    {
        placed = [];
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind != JsonValueKind.Object) return MissingSlot;
            var slot = component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
                && props.TryGetProperty("slot", out var slotValue) && slotValue.ValueKind == JsonValueKind.String ? slotValue.GetString() : null;
            var type = component.TryGetProperty("type", out var typeValue) && typeValue.ValueKind == JsonValueKind.String ? typeValue.GetString() ?? "" : "";
            if (type == "customFieldsBlock" && slot == CustomFieldsSlot && !slots.Contains(slot)) return OzelAlanYeri;
            if (slot is null || !slots.Contains(slot)) return MissingSlot;
            placed.Add((component, slot, type));
        }

        foreach (var (component, _, _) in placed)
            if (Scan(component, topLevel: true) is { } scanError) return scanError;
        if (placed.Count(x => x.Type == "actionBar") > 1) return KomutYeri;
        return null;
    }

    /// <summary>
    /// <see cref="Place"/> for Liste, Kayıt kartı and Serbest, then the window and group rules: a <c>dialog</c> only in <c>dialogs</c>
    /// with the <c>dialog</c> presentation and an sm–xl size; every window content (<see cref="DialogOwners"/>) in the <c>dialog</c> slot
    /// and nothing else there; at most one summary and one tabs per window; groups only in window contents and Liste's detail, one level.
    /// </summary>
    private static string? PlaceWithDialogs(JsonElement components, IReadOnlySet<string> slots, string template, JsonElement queries,
        out List<(JsonElement Component, string Slot, string Type)> placed)
    {
        if (Place(components, slots, out placed) is { } placeError) return placeError;
        foreach (var (_, slot, type) in placed)
        {
            // The custom fields block lives in a record's customFields slot and in windows; the row table only in windows.
            if (type == "editableGrid" && slot != DialogSlot) return SatirYeri;
            if (type == "customFieldsBlock" && !(slot == DialogSlot || template == "record" && slot == CustomFieldsSlot)) return OzelAlanYeri;
        }
        foreach (var (component, slot, type) in placed)
        {
            if (type == "dialog" && slot != DialogsSlot) return PencereYeri;
            if (slot == DialogsSlot && type != "dialog") return WrongPart(slot, type, "dialog");
            if (type == "dialog" && component.TryGetProperty("props", out var props)
                && (props.TryGetProperty("presentation", out _) && StringProp(props, "presentation") != "dialog"
                    || props.TryGetProperty("size", out _) && StringProp(props, "size") is not ("sm" or "md" or "lg" or "xl")))
                return PencereSunum;
        }

        var owners = DialogOwners(components, out var sharedError);
        if (sharedError is not null) return sharedError;
        foreach (var (component, slot, type) in placed)
        {
            var id = Id(component) ?? "";
            if (owners.ContainsKey(id) != (slot == DialogSlot)) return PencereIcerigi(id);
            if (slot == DialogSlot && !DialogPartTypes.Contains(type)) return PencereTuru(type);
        }
        // Record and free pages have no list body: a rowActions button belongs to a table inside a window.
        if (template != "list")
        {
            var windowTables = placed.Where(x => x.Type == "dataTable" && owners.ContainsKey(Id(x.Component) ?? "")).ToArray();
            var wired = windowTables.SelectMany(x => StringArray(x.Component, "rowActions")).ToHashSet(StringComparer.Ordinal);
            foreach (var (component, slot, _) in placed)
                if (slot == "rowActions" && !wired.Contains(Id(component) ?? "")) return SatirEylemYeri(Id(component) ?? "");
        }
        foreach (var window in owners.GroupBy(x => x.Value, x => x.Key))
        {
            var parts = placed.Where(x => window.Contains(Id(x.Component) ?? "")).ToArray();
            if (parts.Count(x => x.Type == "recordHeader") > 1) return PencereOzet;
            if (parts.Count(x => x.Type == "tabs") + parts.SelectMany(x => Children(x.Component)).Count(x => TypeOf(x) == "tabs") > 1) return PencereSekme;
            if (placed.FirstOrDefault(x => Id(x.Component) == window.Key) is { Component.ValueKind: JsonValueKind.Object } owner
                && ValidateWindowExtras(owner.Component, parts, queries) is { } extrasError) return extrasError;
        }

        foreach (var (component, slot, type) in placed)
        {
            if (!HasChildren(component)) continue;
            if (!(slot == DialogSlot || template == "list" && slot == "detail")) return template == "free" ? FreeNoChildren : GrupYeri;
            // Only a section or a card is a group (the base schema refuses others too; this keeps the rules complete on their own).
            if (type is not ("section" or "card")) return GrupYeri;
            foreach (var child in Children(component))
            {
                var childType = TypeOf(child) ?? "";
                if (childType is "section" or "card" or "dialog" || child.TryGetProperty("children", out _)) return GrupIcIce;
                if (childType == "editableGrid") return SatirYeri;
                if (!GroupChildTypes.Contains(childType)) return GrupTuru(childType);
            }
        }
        return null;
    }

    private static string WrongPart(string slot, string type, string expected) =>
        $"'{slot}' yerine '{type}' bileşeni konamaz; bu yere yalnız '{expected}' konabilir.";

    private static string? Id(JsonElement component) =>
        component.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String ? id.GetString() : null;

    private static IEnumerable<string> StringArray(JsonElement component, string key) =>
        component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
        && props.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray()
            : [];

    /// <summary>
    /// Forbidden things anywhere in the component tree: width settings, spacer, divider, and an action bar anywhere but a top-level
    /// component in the <c>commands</c> slot.
    /// </summary>
    private static string? Scan(JsonElement component, bool topLevel = false)
    {
        if (component.ValueKind != JsonValueKind.Object) return null;
        if (component.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String)
            switch (type.GetString())
            {
                case "actionBar" when !(topLevel && IsCommandBar(component)): return KomutYeri;
                case "spacer" or "divider": return NoSpacer;
            }
        if (component.TryGetProperty("props", out var props) && props.ValueKind == JsonValueKind.Object
            && (props.TryGetProperty("width", out _) || props.TryGetProperty("widthWhen", out _))) return NoWidth;
        if (component.TryGetProperty("children", out var children) && children.ValueKind == JsonValueKind.Array)
            foreach (var child in children.EnumerateArray())
                if (Scan(child) is { } error) return error;
        return null;
    }
}
