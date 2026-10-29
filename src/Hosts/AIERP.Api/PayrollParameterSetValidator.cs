using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class PayrollParameterSetValidator
{
    private static readonly HashSet<string> ValueTypes = new(StringComparer.Ordinal)
    {
        "decimal", "integer", "boolean", "text", "choice", "date", "json", "expression"
    };
    private static readonly string[] RequiredComponentMappingTypes = ["incomeTaxBase", "socialSecurityBase", "accountingAccount", "declarationField"];

    public static bool HasSchemaVersion(JsonElement rules) =>
        rules.ValueKind == JsonValueKind.Object && rules.TryGetProperty("schemaVersion", out _);

    public static HashSet<string> PayBasesCovering(JsonElement rules, string profile, DateOnly from, DateOnly to)
    {
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!rules.TryGetProperty("payBases", out var payBases) || payBases.ValueKind != JsonValueKind.Array) return codes;
        foreach (var payBasis in payBases.EnumerateArray())
        {
            if (payBasis.ValueKind == JsonValueKind.Object && TryString(payBasis, "code", 40, out var code) &&
                TryString(payBasis, "profile", 40, out var entryProfile) && StringComparer.OrdinalIgnoreCase.Equals(profile, entryProfile) &&
                TryDate(payBasis, "effectiveFrom", out var effectiveFrom) && effectiveFrom <= from &&
                TryOptionalDate(payBasis, "effectiveTo", out var effectiveTo) && (effectiveTo is null || effectiveTo >= to))
                codes.Add(code!);
        }
        return codes;
    }

    public static bool CoversProfile(JsonElement rules, string profile, DateOnly from, DateOnly to)
    {
        static bool Covers(JsonElement item, string selectedProfile, DateOnly start, DateOnly end) =>
            TryString(item, "profile", 40, out var candidate) && StringComparer.OrdinalIgnoreCase.Equals(candidate, selectedProfile) &&
            TryDate(item, "effectiveFrom", out var itemFrom) && itemFrom <= start &&
            TryOptionalDate(item, "effectiveTo", out var itemTo) && (itemTo is null || itemTo >= end);

        if (!rules.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array) return false;
        if (!rules.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array ||
            !components.EnumerateArray().Any(x => Covers(x, profile, from, to))) return false;
        if (!rules.TryGetProperty("mappings", out var mappings) || mappings.ValueKind != JsonValueKind.Array) return false;
        foreach (var mappingType in RequiredComponentMappingTypes)
        {
            if (!mappings.EnumerateArray().Any(x => Covers(x, profile, from, to) &&
                TryString(x, "mappingType", 32, out var kind) && StringComparer.Ordinal.Equals(kind, mappingType))) return false;
        }
        return true;
    }

    public static bool HasKnownDeclarationProfile(JsonElement rules, string profile, DateOnly from, DateOnly to)
    {
        if (!rules.TryGetProperty("declarations", out var declarations) || declarations.ValueKind != JsonValueKind.Array) return false;
        foreach (var declaration in declarations.EnumerateArray())
        {
            if (!TryString(declaration, "profile", 40, out var declarationProfile) ||
                !StringComparer.OrdinalIgnoreCase.Equals(profile, declarationProfile) ||
                !TryDate(declaration, "effectiveFrom", out var effectiveFrom) || effectiveFrom > from ||
                !TryOptionalDate(declaration, "effectiveTo", out var effectiveTo) || effectiveTo is not null && effectiveTo < to ||
                !TryString(declaration, "format", 24, out var format) || !StringComparer.OrdinalIgnoreCase.Equals(format, "XML") ||
                !TryString(declaration, "declarationCode", 80, out var code) ||
                !TryString(declaration, "schemaVersion", 80, out var version)) continue;

            if ((StringComparer.Ordinal.Equals(code, "1003A") && StringComparer.Ordinal.Equals(version, "MUHSGK_21")) ||
                (StringComparer.Ordinal.Equals(code, "1003B") && StringComparer.Ordinal.Equals(version, "MUHSGK2_12")))
                return true;
        }
        return false;
    }

    public static bool TryValidate(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo,
        bool requireParameters, out string? error)
    {
        error = null;
        if (!TryValidateUniquePropertyNames(rules, out error)) return false;
        if (rules.ValueKind != JsonValueKind.Object ||
            !rules.TryGetProperty("schemaVersion", out var schemaVersion) ||
            schemaVersion.ValueKind != JsonValueKind.Number || !schemaVersion.TryGetInt32(out var version) || version != 1)
            return Fail("Parametre şeması için schemaVersion=1 zorunludur.", out error);

        if (!rules.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array || parameters.GetArrayLength() > 512)
            return Fail("Parametreler bir JSON dizisi olmalı ve en fazla 512 kayıt içermelidir.", out error);
        if (!TryValidateInputBindings(rules, envelopeFrom, envelopeTo, requireParameters, out error)) return false;
        if (!TryValidateComponents(rules, envelopeFrom, envelopeTo, requireParameters, out error)) return false;
        if (!TryValidateComponentMappings(rules, envelopeFrom, envelopeTo, requireParameters, out error)) return false;
        if (!TryValidateDeclarationProfiles(rules, envelopeFrom, envelopeTo, out error)) return false;
        if (!TryValidatePayBases(rules, envelopeFrom, envelopeTo, out error)) return false;

        var intervals = new Dictionary<(string Key, string Profile), List<(DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        foreach (var parameter in parameters.EnumerateArray())
        {
            if (parameter.ValueKind != JsonValueKind.Object ||
                !TryString(parameter, "key", 80, out var key) || !Regex.IsMatch(key!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(parameter, "label", 120, out _) ||
                !TryString(parameter, "valueType", 16, out var valueType) || !ValueTypes.Contains(valueType!) ||
                !parameter.TryGetProperty("value", out var value) || !MatchesValueType(valueType!, value) ||
                !TryOptionalString(parameter, "unit", 32, out var unit) ||
                !ParameterUnitMatchesType(valueType!, unit) ||
                !TryString(parameter, "profile", 40, out var profile) ||
                !TryDate(parameter, "effectiveFrom", out var effectiveFrom) ||
                !TryOptionalDate(parameter, "effectiveTo", out var effectiveTo) ||
                effectiveTo is not null && effectiveTo < effectiveFrom ||
                effectiveFrom < envelopeFrom || envelopeTo is not null && (effectiveTo is null || effectiveTo > envelopeTo))
                return Fail("Her parametrede geçerli key, label, valueType/value, unit, profile ve zarf içinde kalan yürürlük tarihleri zorunludur.", out error);

            if (valueType == "expression" && !PayrollExpressionSchemaValidator.IsValid(value, unit))
                return Fail($"'{key}' parametresinin ifadesi geçersiz, birimlerle uyumsuz veya izin verilmeyen bir işlem içeriyor.", out error);

            if (!TryValidateSources(parameter, out var sourceError)) return Fail(sourceError!, out error);

            var identity = (key!, profile!);
            if (!intervals.TryGetValue(identity, out var existing)) intervals[identity] = existing = [];
            if (existing.Any(x => RangesOverlap(x.From, x.To, effectiveFrom, effectiveTo)))
                return Fail($"'{key}' parametresinin '{profile}' profili için yürürlük aralıkları çakışamaz.", out error);
            existing.Add((effectiveFrom, effectiveTo));
        }

        if (requireParameters && !TryValidateParameterReferences(rules, out error)) return false;

        return true;
    }

    public static bool TryValidateUniquePropertyNames(JsonElement value, out string? error)
    {
        error = null;
        return Visit(value, "$", out error);

        static bool Visit(JsonElement node, string path, out string? failure)
        {
            failure = null;
            if (node.ValueKind == JsonValueKind.Object)
            {
                var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var property in node.EnumerateObject())
                {
                    if (!names.Add(property.Name))
                    {
                        failure = $"'{path}' nesnesinde yinelenen '{property.Name}' alanı var.";
                        return false;
                    }
                    if (!Visit(property.Value, $"{path}.{property.Name}", out failure)) return false;
                }
            }
            else if (node.ValueKind == JsonValueKind.Array)
            {
                var index = 0;
                foreach (var item in node.EnumerateArray())
                {
                    if (!Visit(item, $"{path}[{index}]", out failure)) return false;
                    index++;
                }
            }
            return true;
        }
    }

    private static bool TryValidateParameterReferences(JsonElement rules, out string? error)
    {
        error = null;
        if (!rules.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array ||
            !rules.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array) return true;
        var definitions = new Dictionary<(string Key, string Profile), List<(string Type, string? Unit, DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        foreach (var parameter in parameters.EnumerateArray())
        {
            if (!TryString(parameter, "key", 80, out var key) || !TryString(parameter, "profile", 40, out var profile) ||
                !TryString(parameter, "valueType", 16, out var type) || !TryOptionalString(parameter, "unit", 32, out var unit) ||
                !TryDate(parameter, "effectiveFrom", out var from) || !TryOptionalDate(parameter, "effectiveTo", out var to)) continue;
            var identity = (key!, profile!);
            if (!definitions.TryGetValue(identity, out var entries)) definitions[identity] = entries = [];
            entries.Add((type!, unit, from, to));
        }

        foreach (var component in components.EnumerateArray())
        {
            if (!TryString(component, "profile", 40, out var profile) || !TryDate(component, "effectiveFrom", out var from) ||
                !TryOptionalDate(component, "effectiveTo", out var to) || !component.TryGetProperty("formula", out var formula)) continue;
            if (!ValidateParameterReferences(formula, profile!, from, to, definitions, out error)) return false;
        }
        foreach (var parameter in parameters.EnumerateArray())
        {
            if (!TryString(parameter, "profile", 40, out var profile) || !TryDate(parameter, "effectiveFrom", out var from) ||
                !TryOptionalDate(parameter, "effectiveTo", out var to) || !TryString(parameter, "valueType", 16, out var type) || type != "expression" ||
                !parameter.TryGetProperty("value", out var formula)) continue;
            if (!ValidateParameterReferences(formula, profile!, from, to, definitions, out error)) return false;
        }
        return true;
    }

    private static bool ValidateParameterReferences(JsonElement node, string profile, DateOnly from, DateOnly? to,
        IReadOnlyDictionary<(string Key, string Profile), List<(string Type, string? Unit, DateOnly From, DateOnly? To)>> definitions,
        out string? error)
    {
        error = null;
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("op", out var op) && op.ValueKind == JsonValueKind.String && op.GetString() == "parameter")
            {
                if (!TryString(node, "key", 120, out var key) || !TryString(node, "valueType", 16, out var type) ||
                    !TryOptionalString(node, "unit", 32, out var unit) || !definitions.TryGetValue((key!, profile), out var entries) ||
                    !entries.Any(x => (x.Type == type || x.Type == "expression") && PayrollExpressionSchemaValidator.UnitsMatch(x.Unit, unit) && x.From <= from &&
                        (x.To is null || to is not null && x.To >= to)))
                    return Fail($"'{key}' parametresi için formülün tüm yürürlük aralığını kapsayan aynı tür/birimde profil tanımı yok.", out error);
            }
            foreach (var property in node.EnumerateObject())
                if (!ValidateParameterReferences(property.Value, profile, from, to, definitions, out error)) return false;
        }
        else if (node.ValueKind == JsonValueKind.Array)
            foreach (var item in node.EnumerateArray())
                if (!ValidateParameterReferences(item, profile, from, to, definitions, out error)) return false;
        return true;
    }

    private static bool TryValidateInputBindings(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo,
        bool requireBindings, out string? error)
    {
        error = null;
        var bindings = new Dictionary<(string Key, string Profile), List<(string Type, string? Unit, DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        if (rules.TryGetProperty("inputs", out var inputs))
        {
            if (inputs.ValueKind != JsonValueKind.Array || inputs.GetArrayLength() > 256)
                return Fail("inputs alanı JSON dizisi olmalı ve en fazla 256 kayıt içermelidir.", out error);
            foreach (var input in inputs.EnumerateArray())
            {
                if (input.ValueKind != JsonValueKind.Object ||
                    !TryString(input, "key", 120, out var key) || !Regex.IsMatch(key!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                    !TryString(input, "label", 120, out _) ||
                    !TryString(input, "valueType", 16, out var valueType) || !new[] { "decimal", "integer", "boolean", "text", "choice" }.Contains(valueType, StringComparer.Ordinal) ||
                    !TryOptionalString(input, "unit", 32, out var unit) ||
                    (valueType is "decimal" or "integer" ? string.IsNullOrWhiteSpace(unit) || !PayrollExpressionSchemaValidator.IsUnitValid(unit) : !string.IsNullOrWhiteSpace(unit)) ||
                    !TryString(input, "sourceBinding", 64, out var sourceBinding) || !IsSupportedInputBinding(sourceBinding!, valueType!, unit) ||
                    sourceBinding == "leave.requestedDays" && (!TryString(input, "leaveType", 32, out var leaveType) ||
                        !new[] { "Annual", "Health", "Unpaid", "Excuse", "Other" }.Contains(leaveType, StringComparer.Ordinal)) ||
                    sourceBinding is "priorEmployerTaxBase.amount" or "sameEmployerYtdBase.amount" && (!TryString(input, "baseCode", 80, out var baseCode) ||
                        !Regex.IsMatch(baseCode!, "^[A-Za-z0-9][A-Za-z0-9._-]*$")) ||
                    sourceBinding is not ("priorEmployerTaxBase.amount" or "sameEmployerYtdBase.amount") && TryString(input, "baseCode", 80, out _) ||
                    sourceBinding == "sameEmployerYtdBase.amount" && (!TryString(input, "baseType", 32, out var baseType) ||
                        baseType is not ("incomeTaxBase" or "socialSecurityBase")) ||
                    sourceBinding != "sameEmployerYtdBase.amount" && TryString(input, "baseType", 32, out _) ||
                    !TryString(input, "profile", 40, out var profile) ||
                    !TryDate(input, "effectiveFrom", out var from) || !TryOptionalDate(input, "effectiveTo", out var to) ||
                    to is not null && to < from || from < envelopeFrom || envelopeTo is not null && (to is null || to > envelopeTo) ||
                    !TryValidateSources(input, out var sourceError))
                    return Fail("Her giriş bağında key, label, tür/birim, profil, kural zarfı içi yürürlük aralığı ve resmi/işveren politika kaynakları geçerli olmalıdır.", out error);

                var identity = (key!, profile!);
                if (!bindings.TryGetValue(identity, out var ranges)) bindings[identity] = ranges = [];
                if (ranges.Any(x => RangesOverlap(x.From, x.To, from, to)))
                    return Fail($"'{key}' girdisinin '{profile}' profili için yürürlük aralıkları çakışamaz.", out error);
                ranges.Add((valueType!, unit, from, to));
            }
        }

        if (!requireBindings) return true;
        if (!rules.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array ||
            !rules.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array) return true;

        foreach (var node in components.EnumerateArray().Where(x => x.TryGetProperty("formula", out _)))
        {
            if (!TryString(node, "profile", 40, out var profile) || !TryDate(node, "effectiveFrom", out var from) || !TryOptionalDate(node, "effectiveTo", out var to) ||
                !ValidateReferences(node.GetProperty("formula"), profile!, from, to, bindings, out error)) return false;
        }
        foreach (var node in parameters.EnumerateArray().Where(x => x.TryGetProperty("valueType", out var t) && t.ValueKind == JsonValueKind.String && t.GetString() == "expression"))
        {
            if (!TryString(node, "profile", 40, out var profile) || !TryDate(node, "effectiveFrom", out var from) || !TryOptionalDate(node, "effectiveTo", out var to) ||
                !ValidateReferences(node.GetProperty("value"), profile!, from, to, bindings, out error)) return false;
        }
        if (rules.TryGetProperty("payBases", out var payBases) && payBases.ValueKind == JsonValueKind.Array)
        foreach (var node in payBases.EnumerateArray())
        {
            if (!TryString(node, "profile", 40, out var profile) || !TryDate(node, "effectiveFrom", out var from) ||
                !TryOptionalDate(node, "effectiveTo", out var to) || !node.TryGetProperty("periodMultiplier", out var multiplier) ||
                !ValidateReferences(multiplier, profile!, from, to, bindings, out error)) return false;
            var referencedInputs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var referencedParameters = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            CollectRuntimeReferences(multiplier, referencedInputs, referencedParameters);
            if (referencedInputs.Count > 0 && inputs.ValueKind != JsonValueKind.Array)
                return Fail("Ödeme esası dönem çarpanı için onaylı giriş dizisi eksik.", out error);
            foreach (var inputKey in referencedInputs)
            {
                var activeBindings = inputs.EnumerateArray().Where(x => TryString(x, "key", 120, out var key) &&
                    StringComparer.OrdinalIgnoreCase.Equals(key, inputKey) && TryString(x, "profile", 40, out var p) &&
                    StringComparer.OrdinalIgnoreCase.Equals(p, profile) && TryDate(x, "effectiveFrom", out var f) && f <= from &&
                    TryOptionalDate(x, "effectiveTo", out var t) && (t is null || to is not null && t >= to)).ToArray();
                if (activeBindings.Any(x => TryString(x, "sourceBinding", 64, out var source) &&
                    source is "compensation.periodAmount" or "calculation.grossCandidate"))
                    return Fail("Ödeme esası dönem çarpanı kendi hesaplanmış tutarını girdi olarak kullanamaz.", out error);
            }
        }
        return true;
    }

    internal static bool IsSupportedInputBinding(string source, string type, string? unit) => source switch
    {
        "compensation.amount" => type == "decimal" && !string.IsNullOrWhiteSpace(unit),
        "compensation.periodAmount" => type == "decimal" && PayrollExpressionSchemaValidator.IsUnitValid(unit),
        "compensation.targetKind" => type == "choice" && string.IsNullOrWhiteSpace(unit),
        "employee.employmentCategory" => type == "choice" && string.IsNullOrWhiteSpace(unit),
        "compensation.currencyCode" or "compensation.payBasisCode" => type == "text" && string.IsNullOrWhiteSpace(unit),
        "calculation.grossCandidate" => type == "decimal" && PayrollExpressionSchemaValidator.IsUnitValid(unit),
        "period.calendarDays" or "period.scheduledDays" => type == "integer" && PayrollExpressionSchemaValidator.UnitsMatch(unit, "day"),
        "period.scheduledMinutes" => type == "integer" && PayrollExpressionSchemaValidator.UnitsMatch(unit, "min"),
        "attendance.workedMinutes" or "attendance.overtimeMinutes" => type == "integer" && PayrollExpressionSchemaValidator.UnitsMatch(unit, "min"),
        "leave.requestedDays" => type == "decimal" && PayrollExpressionSchemaValidator.UnitsMatch(unit, "day"),
        "priorEmployerTaxBase.amount" or "sameEmployerYtdBase.amount" => type == "decimal" && !string.IsNullOrWhiteSpace(unit),
        _ => false
    };

    public static HashSet<string> EffectiveComponentInputSources(JsonElement rules, string profile, DateOnly from, DateOnly to)
    {
        var referencedInputKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var referencedParameterKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!rules.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array ||
            !rules.TryGetProperty("inputs", out var inputs) || inputs.ValueKind != JsonValueKind.Array) return [];
        foreach (var component in components.EnumerateArray())
        {
            if (!TryString(component, "profile", 40, out var componentProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, componentProfile) ||
                !TryDate(component, "effectiveFrom", out var componentFrom) || componentFrom > from ||
                !TryOptionalDate(component, "effectiveTo", out var componentTo) || componentTo is not null && componentTo < to ||
                !component.TryGetProperty("formula", out var formula)) continue;
            CollectRuntimeReferences(formula, referencedInputKeys, referencedParameterKeys);
        }
        if (rules.TryGetProperty("payBases", out var activePayBases) && activePayBases.ValueKind == JsonValueKind.Array)
        foreach (var payBasis in activePayBases.EnumerateArray())
        {
            if (!TryString(payBasis, "profile", 40, out var basisProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, basisProfile) ||
                !TryDate(payBasis, "effectiveFrom", out var basisFrom) || basisFrom > from ||
                !TryOptionalDate(payBasis, "effectiveTo", out var basisTo) || basisTo is not null && basisTo < to ||
                !payBasis.TryGetProperty("periodMultiplier", out var multiplier)) continue;
            CollectRuntimeReferences(multiplier, referencedInputKeys, referencedParameterKeys);
        }
        if (rules.TryGetProperty("parameters", out var parameters) && parameters.ValueKind == JsonValueKind.Array)
        {
            var byKey = parameters.EnumerateArray().Where(x => TryString(x, "profile", 40, out var p) &&
                    StringComparer.OrdinalIgnoreCase.Equals(profile, p) && TryDate(x, "effectiveFrom", out var f) && f <= from &&
                    TryOptionalDate(x, "effectiveTo", out var t) && (t is null || t >= to))
                .Where(x => TryString(x, "key", 80, out _)).ToDictionary(x => x.GetProperty("key").GetString()!, StringComparer.OrdinalIgnoreCase);
            var resolvedParameterKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            while (referencedParameterKeys.Any(x => !resolvedParameterKeys.Contains(x)))
            {
                var key = referencedParameterKeys.First(x => !resolvedParameterKeys.Contains(x));
                resolvedParameterKeys.Add(key);
                if (!byKey.TryGetValue(key, out var parameter) || !TryString(parameter, "valueType", 16, out var valueType) || valueType != "expression" ||
                    !parameter.TryGetProperty("value", out var expression)) continue;
                CollectRuntimeReferences(expression, referencedInputKeys, referencedParameterKeys);
            }
        }

        var sources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var input in inputs.EnumerateArray())
        {
            if (!TryString(input, "profile", 40, out var inputProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, inputProfile) ||
                !TryDate(input, "effectiveFrom", out var inputFrom) || inputFrom > from ||
                !TryOptionalDate(input, "effectiveTo", out var inputTo) || inputTo is not null && inputTo < to ||
                !TryString(input, "key", 120, out var key) || !referencedInputKeys.Contains(key!) ||
                !TryString(input, "sourceBinding", 64, out var source)) continue;
            if (source == "leave.requestedDays" && TryString(input, "leaveType", 32, out var leaveType))
                sources.Add($"{source}:{leaveType!}");
            else if (source == "priorEmployerTaxBase.amount" && TryString(input, "baseCode", 80, out var baseCode))
                sources.Add($"{source}:{baseCode!}");
            else sources.Add(source!);
        }
        return sources;
    }

    private static void CollectRuntimeReferences(JsonElement node, HashSet<string> inputKeys, HashSet<string> parameterKeys)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (TryString(node, "op", 16, out var op) && TryString(node, "key", 120, out var key))
            {
                if (op == "input") inputKeys.Add(key!);
                else if (op == "parameter") parameterKeys.Add(key!);
            }
            foreach (var property in node.EnumerateObject()) CollectRuntimeReferences(property.Value, inputKeys, parameterKeys);
        }
        else if (node.ValueKind == JsonValueKind.Array)
            foreach (var item in node.EnumerateArray()) CollectRuntimeReferences(item, inputKeys, parameterKeys);
    }

    private static bool ValidateReferences(JsonElement node, string profile, DateOnly from, DateOnly? to,
        IReadOnlyDictionary<(string Key, string Profile), List<(string Type, string? Unit, DateOnly From, DateOnly? To)>> bindings,
        out string? error)
    {
        error = null;
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("op", out var op) && op.ValueKind == JsonValueKind.String && op.GetString() == "input")
            {
                if (!TryString(node, "key", 120, out var key) || !TryString(node, "valueType", 16, out var type) ||
                    !TryOptionalString(node, "unit", 32, out var unit) ||
                    !bindings.TryGetValue((key!, profile), out var ranges) ||
                    !ranges.Any(x => x.Type == type && PayrollExpressionSchemaValidator.UnitsMatch(x.Unit, unit) && x.From <= from &&
                        (x.To is null || to is not null && x.To >= to)))
                    return Fail($"'{key}' girdisi için formülün tüm yürürlük aralığını kapsayan aynı tür/birimde profil bağlamı yok.", out error);
            }
            foreach (var property in node.EnumerateObject())
                if (!ValidateReferences(property.Value, profile, from, to, bindings, out error)) return false;
        }
        else if (node.ValueKind == JsonValueKind.Array)
            foreach (var item in node.EnumerateArray())
                if (!ValidateReferences(item, profile, from, to, bindings, out error)) return false;
        return true;
    }

    private static bool TryValidateComponents(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo,
        bool requireCalculations, out string? error)
    {
        error = null;
        if (!rules.TryGetProperty("components", out var components))
            return !requireCalculations || Fail("Kural seti bordro kalemi içermediği için onaylanamaz.", out error);
        if (components.ValueKind != JsonValueKind.Array || components.GetArrayLength() > 512)
            return Fail("Bordro kalemleri JSON dizisi olmalı ve en fazla 512 kayıt içermelidir.", out error);
        if (requireCalculations && components.GetArrayLength() == 0)
            return Fail("En az bir formüllü bordro kalemi olmadan kural seti onaylanamaz.", out error);

        var identities = new Dictionary<(string Key, string Profile), List<(DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind != JsonValueKind.Object ||
                !TryString(component, "key", 80, out var key) || !Regex.IsMatch(key!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(component, "label", 120, out _) ||
                !TryString(component, "category", 24, out var category) ||
                category is not ("earning" or "deduction" or "employerCost" or "exemption") ||
                !TryString(component, "unit", 32, out var unit) ||
                !TryString(component, "profile", 40, out var profile) ||
                !TryDate(component, "effectiveFrom", out var effectiveFrom) ||
                !TryOptionalDate(component, "effectiveTo", out var effectiveTo) ||
                effectiveTo is not null && effectiveTo < effectiveFrom ||
                effectiveFrom < envelopeFrom || envelopeTo is not null && (effectiveTo is null || effectiveTo > envelopeTo))
                return Fail("Her bordro kalemi için key, label, earning/deduction/employerCost/exemption türü, birim, profil ve zarf içi yürürlük tarihleri zorunludur.", out error);

            if (requireCalculations && (!component.TryGetProperty("formula", out var formula) ||
                !PayrollExpressionSchemaValidator.IsValid(formula, unit)))
                return Fail($"'{key}' bordro kalemi için izin verilen ifade dilinde, kalemin birimiyle eşleşen formula gereklidir.", out error);

            var identity = (key!, profile!);
            if (!identities.TryGetValue(identity, out var existing)) identities[identity] = existing = [];
            if (existing.Any(x => RangesOverlap(x.From, x.To, effectiveFrom, effectiveTo)))
                return Fail($"'{key}' bordro kaleminin '{profile}' profili için yürürlük aralıkları çakışamaz.", out error);
            existing.Add((effectiveFrom, effectiveTo));
            if (!TryValidateSources(component, out var sourceError)) return Fail(sourceError!, out error);
        }

        return true;
    }

    private static bool TryValidateComponentMappings(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo,
        bool requireCompleteMappings, out string? error)
    {
        error = null;
        if (!rules.TryGetProperty("mappings", out var mappings))
            return !requireCompleteMappings || Fail("Her bordro kalemi için vergi, SGK, muhasebe ve beyan eşlemeleri açıkça tanımlanmalıdır.", out error);
        if (mappings.ValueKind != JsonValueKind.Array || mappings.GetArrayLength() > 2048)
            return Fail("Eşlemeler JSON dizisi olmalı ve en fazla 2048 kayıt içermelidir.", out error);

        var components = new List<(string Key, string Profile, DateOnly From, DateOnly? To)>();
        if (rules.TryGetProperty("components", out var componentArray) && componentArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var component in componentArray.EnumerateArray())
            {
                if (!TryString(component, "key", 80, out var key) || !TryString(component, "profile", 40, out var profile) ||
                    !TryDate(component, "effectiveFrom", out var from) || !TryOptionalDate(component, "effectiveTo", out var to))
                    return Fail("Eşleme yapılan kalemin kimliği veya geçerlilik aralığı okunamadı.", out error);
                components.Add((key!, profile!, from, to));
            }
        }

        var identities = new Dictionary<(string Key, string Profile, string Kind), List<(DateOnly From, DateOnly? To)>>(new ComponentMappingIdentityComparer());
        var validatedMappings = new List<(string ComponentKey, string Profile, string Kind, DateOnly From, DateOnly? To, string Target)>();
        foreach (var mapping in mappings.EnumerateArray())
        {
            if (mapping.ValueKind != JsonValueKind.Object ||
                !TryString(mapping, "componentKey", 80, out var componentKey) || !Regex.IsMatch(componentKey!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(mapping, "mappingType", 32, out var mappingType) || !RequiredComponentMappingTypes.Contains(mappingType!, StringComparer.Ordinal) ||
                !TryString(mapping, "targetCode", 120, out var targetCode) || !Regex.IsMatch(targetCode!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(mapping, "profile", 40, out var profile) || !TryDate(mapping, "effectiveFrom", out var effectiveFrom) ||
                !TryOptionalDate(mapping, "effectiveTo", out var effectiveTo) || effectiveTo is not null && effectiveTo < effectiveFrom ||
                effectiveFrom < envelopeFrom || envelopeTo is not null && (effectiveTo is null || effectiveTo > envelopeTo))
                return Fail("Her eşlemede componentKey, incomeTaxBase/socialSecurityBase/accountingAccount/declarationField türü, targetCode, profil ve zarf içi yürürlük aralığı zorunludur.", out error);

            var isBaseMapping = mappingType is "incomeTaxBase" or "socialSecurityBase";
            var hasBaseTreatment = TryString(mapping, "baseTreatment", 16, out var baseTreatment);
            if (isBaseMapping && (!hasBaseTreatment || baseTreatment is not ("add" or "subtract" or "exclude") ||
                    (StringComparer.OrdinalIgnoreCase.Equals(targetCode, "EXCLUDED") != (baseTreatment == "exclude"))) ||
                !isBaseMapping && hasBaseTreatment)
                return Fail("Gelir vergisi/SGK matrah eşlemeleri add, subtract veya exclude kararını açıkça taşımalı; EXCLUDED kodu yalnız exclude ile kullanılmalıdır.", out error);

            var component = components.FirstOrDefault(x => x.Key == componentKey && x.Profile == profile &&
                x.From <= effectiveFrom && (x.To is null || effectiveTo is not null && effectiveTo <= x.To));
            if (component == default)
                return Fail($"'{componentKey}' eşlemesi aynı profil ve yürürlük aralığında tanımlı bir bordro kalemiyle eşleşmelidir.", out error);

            var identity = (componentKey!, profile!, mappingType!);
            if (!identities.TryGetValue(identity, out var existing)) identities[identity] = existing = [];
            if (existing.Any(x => RangesOverlap(x.From, x.To, effectiveFrom, effectiveTo)))
                return Fail($"'{componentKey}' kaleminin '{mappingType}' eşlemeleri aynı profil için çakışamaz.", out error);
            existing.Add((effectiveFrom, effectiveTo));
            if (!TryValidateSources(mapping, out var sourceError)) return Fail(sourceError!, out error);
            validatedMappings.Add((componentKey!, profile!, mappingType!, effectiveFrom, effectiveTo, targetCode!));
        }

        if (requireCompleteMappings)
        {
            foreach (var component in components)
            foreach (var mappingType in RequiredComponentMappingTypes)
            {
                if (!validatedMappings.Any(x => x.ComponentKey == component.Key && x.Profile == component.Profile &&
                    x.Kind == mappingType && x.From <= component.From &&
                    (x.To is null || component.To is not null && x.To >= component.To)))
                    return Fail($"'{component.Key}' bordro kalemi için geçerli aralığın tamamını kapsayan '{mappingType}' eşlemesi yoktur. 'EXCLUDED' de açık bir firma kararı olarak kullanılabilir.", out error);
            }
        }
        return true;
    }

    private static bool TryValidateDeclarationProfiles(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo, out string? error)
    {
        error = null;
        if (!rules.TryGetProperty("declarations", out var declarations)) return true;
        if (declarations.ValueKind != JsonValueKind.Array || declarations.GetArrayLength() > 64)
            return Fail("Beyan profilleri JSON dizisi olmalı ve en fazla 64 kayıt içermelidir.", out error);

        var intervals = new Dictionary<(string Code, string Profile), List<(DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        foreach (var declaration in declarations.EnumerateArray())
        {
            if (declaration.ValueKind != JsonValueKind.Object ||
                !TryString(declaration, "declarationCode", 80, out var code) || !Regex.IsMatch(code!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(declaration, "format", 24, out var format) || !Regex.IsMatch(format!, "^[A-Za-z0-9][A-Za-z0-9._+-]*$") ||
                !TryString(declaration, "schemaVersion", 80, out var schemaVersion) ||
                !TryString(declaration, "profile", 40, out var profile) ||
                !TryString(declaration, "periodRuleRef", 120, out _) ||
                !TryDate(declaration, "effectiveFrom", out var effectiveFrom) ||
                !TryOptionalDate(declaration, "effectiveTo", out var effectiveTo) ||
                effectiveTo is not null && effectiveTo < effectiveFrom ||
                effectiveFrom < envelopeFrom || envelopeTo is not null && (effectiveTo is null || effectiveTo > envelopeTo))
                return Fail("Her beyan profili için kod, format, şema sürümü, profil, dönem kuralı referansı ve zarf içi yürürlük tarihleri zorunludur.", out error);

            if (!TryValidateSources(declaration, out var sourceError)) return Fail(sourceError!, out error);
            if (StringComparer.Ordinal.Equals(code, "1003A") && StringComparer.Ordinal.Equals(schemaVersion, "MUHSGK_21"))
            {
                if (!declaration.TryGetProperty("employerProfile", out var employer) || employer.ValueKind != JsonValueKind.Object ||
                    !TryString(employer, "taxOfficeCode", 6, out var taxOffice) || !Regex.IsMatch(taxOffice!, "^[0-9]{6}$") || taxOffice!.All(x => x == '0') ||
                    !TryString(employer, "taxNumber", 10, out var taxNumber) || !Regex.IsMatch(taxNumber!, "^[0-9]{10}$") || taxNumber!.All(x => x == '0') ||
                    !TryString(employer, "employerTitle", 80, out var title) || string.IsNullOrWhiteSpace(title) || title!.Trim() != title ||
                    !TryString(employer, "phoneAreaCode", 3, out var area) || !Regex.IsMatch(area!, "^[0-9]{3}$") ||
                    !TryString(employer, "phoneNumber", 7, out var phone) || !Regex.IsMatch(phone!, "^[0-9]{7}$") ||
                    !TryString(employer, "branchNumber", 10, out var branch))
                    return Fail("1003A/MUHSGK_21 beyan profili; vergi dairesi, sıfır olmayan VKN, unvan, telefon ve şube alanlarını employerProfile içinde içermelidir.", out error);
            }

            var identity = (code!, profile!);
            if (!intervals.TryGetValue(identity, out var existing)) intervals[identity] = existing = [];
            if (existing.Any(x => RangesOverlap(x.From, x.To, effectiveFrom, effectiveTo)))
                return Fail($"'{code}' beyan türünün '{profile}' profili için yürürlük aralıkları çakışamaz.", out error);
            existing.Add((effectiveFrom, effectiveTo));
        }

        return true;
    }

    private static bool TryValidatePayBases(JsonElement rules, DateOnly envelopeFrom, DateOnly? envelopeTo, out string? error)
    {
        error = null;
        if (!rules.TryGetProperty("payBases", out var payBases)) return true;
        if (payBases.ValueKind != JsonValueKind.Array || payBases.GetArrayLength() > 128)
            return Fail("Ödeme esasları JSON dizisi olmalı ve en fazla 128 kayıt içermelidir.", out error);

        var intervals = new Dictionary<(string Code, string Profile), List<(DateOnly From, DateOnly? To)>>(new ParameterIdentityComparer());
        foreach (var payBasis in payBases.EnumerateArray())
        {
            if (payBasis.ValueKind != JsonValueKind.Object ||
                !TryString(payBasis, "code", 40, out var code) || !Regex.IsMatch(code!, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !TryString(payBasis, "label", 120, out _) ||
                !TryString(payBasis, "unit", 32, out var unit) || !PayrollExpressionSchemaValidator.IsUnitValid(unit) ||
                !payBasis.TryGetProperty("periodMultiplier", out var periodMultiplier) ||
                !PayrollExpressionSchemaValidator.IsValid(periodMultiplier, unit) ||
                !TryString(payBasis, "profile", 40, out var profile) ||
                !TryDate(payBasis, "effectiveFrom", out var effectiveFrom) ||
                !TryOptionalDate(payBasis, "effectiveTo", out var effectiveTo) ||
                effectiveTo is not null && effectiveTo < effectiveFrom ||
                effectiveFrom < envelopeFrom || envelopeTo is not null && (effectiveTo is null || effectiveTo > envelopeTo))
                return Fail("Her ödeme esası için kod, etiket, geçerli birim, profil ve kural seti zarfı içi yürürlük tarihleri zorunludur.", out error);

            if (!TryValidateSources(payBasis, out var sourceError)) return Fail(sourceError!, out error);

            var identity = (code!, profile!);
            if (!intervals.TryGetValue(identity, out var existing)) intervals[identity] = existing = [];
            if (existing.Any(x => RangesOverlap(x.From, x.To, effectiveFrom, effectiveTo)))
                return Fail($"'{code}' ödeme esasının '{profile}' profili için yürürlük aralıkları çakışamaz.", out error);
            existing.Add((effectiveFrom, effectiveTo));
        }

        return true;
    }

    private static bool TryValidateSources(JsonElement parameter, out string? error)
    {
        error = null;
        if (!parameter.TryGetProperty("sources", out var sources) || sources.ValueKind != JsonValueKind.Array ||
            sources.GetArrayLength() is 0 or > 16)
            return Fail("Her parametre/kalem için 1–16 kaynak girdisi zorunludur.", out error);

        var hasOfficialSource = false;
        var hasEmployerPolicySource = false;
        foreach (var source in sources.EnumerateArray())
        {
            if (source.ValueKind != JsonValueKind.Object ||
                !TryString(source, "kind", 24, out var kind) || kind is not ("official" or "employerPolicy") ||
                !TryString(source, "reference", 300, out _) ||
                !TryOptionalString(source, "url", 1000, out var url))
                return Fail("Kaynak türü official veya employerPolicy olmalı; belge/referans girilmeli ve resmi türde HTTPS URL verilmelidir.", out error);

            if (kind == "official" && string.IsNullOrWhiteSpace(url))
                return Fail("Resmi kaynak için HTTPS URL zorunludur.", out error);
            hasOfficialSource |= kind == "official";
            hasEmployerPolicySource |= kind == "employerPolicy";
            if (!string.IsNullOrWhiteSpace(url) &&
                (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps))
                return Fail("Parametre kaynağı URL’si HTTPS olmalıdır.", out error);
        }

        if (!hasOfficialSource || !hasEmployerPolicySource)
            return Fail("Her bordro parametresi, kalemi ve eşlemesi resmi HTTPS kaynağı ile şirket içi politika belge/referansını birlikte içermelidir.", out error);

        return true;
    }

    private static bool MatchesValueType(string type, JsonElement value) => type switch
    {
        "decimal" => value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out _),
        "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _),
        "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
        "text" or "choice" => value.ValueKind == JsonValueKind.String,
        "date" => value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
        "expression" => value.ValueKind == JsonValueKind.Object,
        "json" => value.ValueKind is not (JsonValueKind.Undefined or JsonValueKind.Null),
        _ => false
    };

    private static bool ParameterUnitMatchesType(string type, string? unit) => type switch
    {
        "decimal" or "integer" => !string.IsNullOrWhiteSpace(unit) && PayrollExpressionSchemaValidator.IsUnitValid(unit),
        "expression" => string.IsNullOrWhiteSpace(unit) || PayrollExpressionSchemaValidator.IsUnitValid(unit),
        _ => string.IsNullOrWhiteSpace(unit)
    };

    private static bool TryString(JsonElement element, string property, int maxLength, out string? value)
    {
        value = null;
        return element.TryGetProperty(property, out var item) && item.ValueKind == JsonValueKind.String &&
            !string.IsNullOrWhiteSpace(value = item.GetString()) && value!.Length <= maxLength;
    }

    private static bool TryGetJsonPropertyIgnoreCase(JsonElement element, string property, out JsonElement value)
    {
        value = default;
        if (element.ValueKind != JsonValueKind.Object) return false;
        foreach (var candidate in element.EnumerateObject())
            if (StringComparer.OrdinalIgnoreCase.Equals(candidate.Name, property))
            {
                value = candidate.Value;
                return true;
            }
        return false;
    }

    private static bool TryOptionalString(JsonElement element, string property, int maxLength) =>
        TryOptionalString(element, property, maxLength, out _);

    private static bool TryOptionalString(JsonElement element, string property, int maxLength, out string? value)
    {
        value = null;
        if (!element.TryGetProperty(property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString();
        return value is null || value.Length <= maxLength;
    }

    private static bool TryDate(JsonElement element, string property, out DateOnly value)
    {
        value = default;
        return element.TryGetProperty(property, out var item) && item.ValueKind == JsonValueKind.String &&
            DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }

    private static bool TryOptionalDate(JsonElement element, string property, out DateOnly? value)
    {
        value = null;
        if (!element.TryGetProperty(property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String ||
            !DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return false;
        value = parsed;
        return true;
    }

    private static bool RangesOverlap(DateOnly leftFrom, DateOnly? leftTo, DateOnly rightFrom, DateOnly? rightTo) =>
        leftFrom <= (rightTo ?? DateOnly.MaxValue) && rightFrom <= (leftTo ?? DateOnly.MaxValue);

    private static bool Fail(string message, out string? error)
    {
        error = message;
        return false;
    }

    private sealed class ParameterIdentityComparer : IEqualityComparer<(string Key, string Profile)>
    {
        public bool Equals((string Key, string Profile) x, (string Key, string Profile) y) =>
            StringComparer.OrdinalIgnoreCase.Equals(x.Key, y.Key) && StringComparer.OrdinalIgnoreCase.Equals(x.Profile, y.Profile);

        public int GetHashCode((string Key, string Profile) value) =>
            HashCode.Combine(StringComparer.OrdinalIgnoreCase.GetHashCode(value.Key), StringComparer.OrdinalIgnoreCase.GetHashCode(value.Profile));
    }

    private sealed class ComponentMappingIdentityComparer : IEqualityComparer<(string Key, string Profile, string Kind)>
    {
        public bool Equals((string Key, string Profile, string Kind) x, (string Key, string Profile, string Kind) y) =>
            StringComparer.OrdinalIgnoreCase.Equals(x.Key, y.Key) && StringComparer.OrdinalIgnoreCase.Equals(x.Profile, y.Profile) &&
            StringComparer.Ordinal.Equals(x.Kind, y.Kind);

        public int GetHashCode((string Key, string Profile, string Kind) value) => HashCode.Combine(
            StringComparer.OrdinalIgnoreCase.GetHashCode(value.Key), StringComparer.OrdinalIgnoreCase.GetHashCode(value.Profile),
            StringComparer.Ordinal.GetHashCode(value.Kind));
    }
}
