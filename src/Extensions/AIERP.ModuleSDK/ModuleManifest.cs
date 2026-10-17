using System.Collections.Frozen;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;

namespace AIERP.ModuleSDK;

/// <summary>Declarative metadata for a module. It never contains executable plugin code.</summary>
public sealed record ModuleManifest(
    string ModuleCode,
    string DisplayName,
    string Version,
    string Publisher,
    string MinimumPlatformVersion,
    IReadOnlyList<ModuleDependency> Dependencies,
    IReadOnlyList<ModulePermission> Permissions,
    IReadOnlyList<ModuleMenuEntry> MenuEntries,
    IReadOnlyList<ModuleMigration> Migrations,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<ModuleDataCapability>? DataCapabilities = null);

public sealed record ModuleDependency(string ModuleCode, string MinimumVersion);

public sealed record ModulePermission(string Code, string Description);

/// <summary>A fixed host-owned read operation gated by a separately declared module permission.</summary>
public sealed record ModuleDataCapability(string Code, string PermissionCode);

public sealed record ModuleMenuEntry(string Code, string Label, string Route, string PermissionCode,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ModuleMenuView? View = null);

/// <summary>Safe presentation metadata. The host renders these fields; module HTML or scripts are never accepted.</summary>
public sealed record ModuleMenuView(
    string InputMode,
    IReadOnlyList<ModuleUiField> InputFields,
    string ResultMode,
    IReadOnlyList<ModuleUiField> ResultColumns,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<string>? DataCapabilities = null);

public sealed record ModuleUiField(
    string Code,
    string Label,
    string Type,
    bool Required = false,
    IReadOnlyList<string>? Options = null,
    int? MaxLength = null);

public sealed record ModuleMigration(string Version, string Checksum);

public sealed record ModuleManifestValidationResult(IReadOnlyList<string> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public static partial class ModuleManifestValidator
{
    public static IReadOnlySet<string> SupportedDataCapabilities { get; } = new[]
    {
        "customers.search",
        "customers.balance.read",
        "suppliers.search",
        "inventory.availability.search"
    }.ToFrozenSet(StringComparer.Ordinal);
    private static readonly Regex IdentifierPattern = IdentifierRegex();
    private static readonly Regex SemVersionPattern = SemVersionRegex();
    private static readonly Regex Sha256Pattern = Sha256Regex();

    public static bool IsValidModuleCode(string? value) => IdentifierPattern.IsMatch(value ?? string.Empty);
    public static bool IsValidSemVersion(string? value) => SemVersionPattern.IsMatch(value ?? string.Empty);
    public static bool IsValidSha256(string? value) => Sha256Pattern.IsMatch(value ?? string.Empty);

    public static ModuleManifestValidationResult Validate(ModuleManifest? manifest)
    {
        var errors = new List<string>();
        if (manifest is null)
        {
            errors.Add("Module manifest is required.");
            return new(errors);
        }

        if (!IdentifierPattern.IsMatch(manifest.ModuleCode ?? string.Empty) || (manifest.ModuleCode?.Length ?? 0) > 60) errors.Add("ModuleCode must use lowercase letters, digits, and dots, start with a letter, and be at most 60 characters.");
        Required(manifest.DisplayName, "DisplayName", errors);
        if (manifest.DisplayName?.Length > 100) errors.Add("DisplayName must be at most 100 characters.");
        Required(manifest.Publisher, "Publisher", errors);
        Version(manifest.Version, "Version", errors);
        Version(manifest.MinimumPlatformVersion, "MinimumPlatformVersion", errors);

        var dependencies = manifest.Dependencies ?? [];
        var duplicateDependencies = Duplicates(dependencies.Select(x => x.ModuleCode));
        if (duplicateDependencies.Count > 0) errors.Add($"Duplicate dependencies: {string.Join(", ", duplicateDependencies)}.");
        foreach (var dependency in dependencies)
        {
            if (!IdentifierPattern.IsMatch(dependency.ModuleCode ?? string.Empty) || dependency.ModuleCode == manifest.ModuleCode)
                errors.Add($"Dependency '{dependency.ModuleCode}' is invalid or self-referencing.");
            Version(dependency.MinimumVersion, $"Dependency {dependency.ModuleCode} minimum version", errors);
        }

        var permissions = manifest.Permissions ?? [];
        if (permissions.Count > 64) errors.Add("A module may declare at most 64 permissions.");
        var permissionCodes = permissions.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        if (Duplicates(permissions.Select(x => x.Code)).Count > 0) errors.Add("Permission codes must be unique.");
        foreach (var permission in permissions)
        {
            if (!IdentifierPattern.IsMatch(permission.Code ?? string.Empty) || (permission.Code?.Length ?? 0) > 40) errors.Add($"Permission code '{permission.Code}' is invalid or exceeds 40 characters.");
            Required(permission.Description, $"Permission {permission.Code} description", errors);
            if (permission.Description?.Length > 120) errors.Add($"Permission {permission.Code} description must be at most 120 characters.");
        }

        var dataCapabilities = manifest.DataCapabilities ?? [];
        if (dataCapabilities.Count > 16) errors.Add("A module may declare at most 16 data capabilities.");
        if (dataCapabilities.Any(x => x is null)) errors.Add("Data capability entries cannot be null.");
        if (Duplicates(dataCapabilities.Where(x => x is not null).Select(x => x.Code ?? string.Empty)).Count > 0) errors.Add("Data capability codes must be unique.");
        foreach (var capability in dataCapabilities)
        {
            if (capability is null) continue;
            if (!SupportedDataCapabilities.Contains(capability.Code ?? string.Empty)) errors.Add($"Data capability '{capability.Code}' is unsupported.");
            if (!permissionCodes.Contains(capability.PermissionCode)) errors.Add($"Data capability {capability.Code} references an undeclared permission.");
        }

        if ((manifest.MenuEntries ?? []).Count > 64) errors.Add("A module may declare at most 64 menu entries.");
        var menuCodes = Duplicates((manifest.MenuEntries ?? []).Select(x => x.Code));
        if (menuCodes.Count > 0) errors.Add($"Duplicate menu entry codes: {string.Join(", ", menuCodes)}.");
        foreach (var entry in manifest.MenuEntries ?? [])
        {
            if (!IdentifierPattern.IsMatch(entry.Code ?? string.Empty) || (entry.Code?.Length ?? 0) > 80) errors.Add($"Menu entry code '{entry.Code}' is invalid or exceeds 80 characters.");
            Required(entry.Label, $"Menu entry {entry.Code} label", errors);
            var route = entry.Route ?? string.Empty;
            if (!route.StartsWith("/", StringComparison.Ordinal) || route.StartsWith("//", StringComparison.Ordinal) || route.Contains("..", StringComparison.Ordinal))
                errors.Add($"Menu entry {entry.Code} route must be a local absolute path.");
            if (!permissionCodes.Contains(entry.PermissionCode)) errors.Add($"Menu entry {entry.Code} references an undeclared permission.");
            if (entry.View is { } view) ValidateView(entry.Code ?? string.Empty, view, dataCapabilities, errors);
        }

        var migrationVersions = Duplicates((manifest.Migrations ?? []).Select(x => x.Version));
        if (migrationVersions.Count > 0) errors.Add($"Duplicate migration versions: {string.Join(", ", migrationVersions)}.");
        foreach (var migration in manifest.Migrations ?? [])
        {
            Version(migration.Version, "Migration version", errors);
            if (!Sha256Pattern.IsMatch(migration.Checksum ?? string.Empty)) errors.Add($"Migration {migration.Version} must include a lowercase SHA-256 checksum.");
        }

        return new(errors);
    }

    private static void ValidateView(string entryCode, ModuleMenuView view, IReadOnlyList<ModuleDataCapability> dataCapabilities, List<string> errors)
    {
        var inputFields = view.InputFields ?? [];
        var resultColumns = view.ResultColumns ?? [];
        if (view.InputMode is not ("json" or "form")) errors.Add($"Menu entry {entryCode} input mode must be json or form.");
        if (view.ResultMode is not ("json" or "table")) errors.Add($"Menu entry {entryCode} result mode must be json or table.");
        if (inputFields.Count > 32) errors.Add($"Menu entry {entryCode} may declare at most 32 input fields.");
        if (resultColumns.Count > 32) errors.Add($"Menu entry {entryCode} may declare at most 32 result columns.");
        if (view.InputMode == "form" && inputFields.Count == 0) errors.Add($"Menu entry {entryCode} form input requires at least one field.");
        if (view.InputMode == "json" && inputFields.Count != 0) errors.Add($"Menu entry {entryCode} json input cannot declare form fields.");
        if (view.ResultMode == "table" && resultColumns.Count == 0) errors.Add($"Menu entry {entryCode} table result requires at least one column.");
        if (view.ResultMode == "json" && resultColumns.Count != 0) errors.Add($"Menu entry {entryCode} json result cannot declare table columns.");

        var viewCapabilities = view.DataCapabilities ?? [];
        if (viewCapabilities.Count > 4) errors.Add($"Menu entry {entryCode} may request at most four data capabilities.");
        if (viewCapabilities.Any(x => x is null)) errors.Add($"Menu entry {entryCode} data capability entries cannot be null.");
        if (Duplicates(viewCapabilities.Where(x => x is not null).Select(x => x ?? string.Empty)).Count > 0) errors.Add($"Menu entry {entryCode} data capability codes must be unique.");
        if (viewCapabilities.Count > 0 && view.InputMode != "form") errors.Add($"Menu entry {entryCode} data capabilities require form input mode.");
        foreach (var capability in viewCapabilities.Where(x => x is not null))
        {
            if (!SupportedDataCapabilities.Contains(capability) || !dataCapabilities.Any(x => x is not null && x.Code == capability))
            {
                errors.Add($"Menu entry {entryCode} requests a data capability not declared by its module.");
                continue;
            }
            if (capability == "customers.balance.read")
            {
                if (!inputFields.Any(field => field.Code == "customer-code" && field.Type == "text" && field.Required))
                    errors.Add($"Menu entry {entryCode} data capability {capability} requires a required text field named customer-code.");
            }
            else
            {
                if (!inputFields.Any(field => field.Code == "term" && field.Type == "text" && field.Required))
                    errors.Add($"Menu entry {entryCode} data capability {capability} requires a required text field named term.");
                var limitField = inputFields.SingleOrDefault(field => field.Code == "limit");
                if (limitField is not null && limitField.Type != "number")
                    errors.Add($"Menu entry {entryCode} data capability limit field must be numeric.");
            }
        }

        ValidateFields(entryCode, "input", inputFields, errors);
        ValidateFields(entryCode, "result", resultColumns, errors);
    }

    private static void ValidateFields(string entryCode, string section, IReadOnlyList<ModuleUiField> fields, List<string> errors)
    {
        if (Duplicates(fields.Select(x => x.Code ?? string.Empty)).Count > 0) errors.Add($"Menu entry {entryCode} {section} field codes must be unique.");
        foreach (var field in fields)
        {
            if (!IdentifierPattern.IsMatch(field.Code ?? string.Empty) || (field.Code?.Length ?? 0) > 60)
                errors.Add($"Menu entry {entryCode} {section} field code '{field.Code}' is invalid.");
            Required(field.Label, $"Menu entry {entryCode} {section} field {field.Code} label", errors);
            if (field.Label?.Length > 100) errors.Add($"Menu entry {entryCode} {section} field {field.Code} label must be at most 100 characters.");
            if (field.Type is not ("text" or "number" or "boolean" or "date" or "select"))
                errors.Add($"Menu entry {entryCode} {section} field {field.Code} type is unsupported.");
            var options = field.Options ?? [];
            if (field.Type == "select")
            {
                if (options.Count is < 1 or > 50 || options.Any(string.IsNullOrWhiteSpace) || options.Any(x => x.Length > 100) || Duplicates(options).Count > 0)
                    errors.Add($"Menu entry {entryCode} {section} select field {field.Code} must have 1–50 unique options of at most 100 characters.");
            }
            else if (options.Count != 0) errors.Add($"Menu entry {entryCode} {section} field {field.Code} can declare options only for select type.");
            if (field.MaxLength is < 1 or > 4000) errors.Add($"Menu entry {entryCode} {section} field {field.Code} maxLength must be between 1 and 4000.");
            if (field.Type != "text" && field.MaxLength is not null)
                errors.Add($"Menu entry {entryCode} {section} field {field.Code} maxLength is supported only for text fields.");
        }
    }

    private static void Required(string? value, string name, List<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add($"{name} is required.");
    }

    private static void Version(string? value, string name, List<string> errors)
    {
        if (!SemVersionPattern.IsMatch(value ?? string.Empty)) errors.Add($"{name} must be a valid SemVer 2 version.");
    }

    private static IReadOnlyList<string> Duplicates(IEnumerable<string> values) => values
        .GroupBy(value => value, StringComparer.Ordinal)
        .Where(group => group.Count() > 1)
        .Select(group => group.Key)
        .ToArray();

    [GeneratedRegex("^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex IdentifierRegex();

    [GeneratedRegex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$", RegexOptions.CultureInvariant)]
    private static partial Regex SemVersionRegex();

    [GeneratedRegex("^[a-f0-9]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex Sha256Regex();
}
