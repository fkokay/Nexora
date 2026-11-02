using System.Globalization;
using System.Text.Json;

internal static class PayrollRuleSetRuntime
{
    public static bool TryBindSnapshotInputs(JsonElement rules, JsonElement employeeSnapshot, string profile,
        DateOnly periodStart, DateOnly periodEnd, decimal? grossCandidate,
        out IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs, out decimal periodMultiplier,
        out string periodMultiplierUnit, out string? error)
    {
        var values = new Dictionary<string, PayrollExpressionRuntimeValue>(StringComparer.OrdinalIgnoreCase);
        inputs = values;
        periodMultiplier = 0m;
        periodMultiplierUnit = "1";
        error = null;
        var requiredInputKeys = ComponentReferences(rules, profile, periodStart, periodEnd).InputKeys;
        var hasDefinitions = TryGetPropertyIgnoreCase(rules, "inputs", out var definitions) && definitions.ValueKind == JsonValueKind.Array;
        if (!hasDefinitions && requiredInputKeys.Count != 0)
            return Fail("Formüllerde kullanılan girdiler için onaylı bordro bağları yok.", out inputs, out error);

        if (!TryGetSelectedCompensation(employeeSnapshot, periodStart, out var selectedCompensation))
            return Fail("Dönem başlangıcında yürürlükte onaylı ücret hedefi yok.", out inputs, out error);

        if (hasDefinitions)
        foreach (var definition in definitions.EnumerateArray())
        {
            if (!TryString(definition, "key", out var candidateKey) || !requiredInputKeys.Contains(candidateKey)) continue;
            if (!TryString(definition, "profile", out var definitionProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, definitionProfile) ||
                !TryDate(definition, "effectiveFrom", out var from) || !TryOptionalDate(definition, "effectiveTo", out var to) ||
                from > periodStart || to is not null && to < periodEnd) continue;
            if (!TryString(definition, "key", out var key) || !TryString(definition, "valueType", out var type) ||
                !TryOptionalString(definition, "unit", out var unit) || !TryString(definition, "sourceBinding", out var source))
                return Fail("Kural girdisi eksik veya okunamıyor.", out inputs, out error);

            switch (source)
            {
                case "compensation.periodAmount":
                case "calculation.grossCandidate":
                    continue;
                case "employee.employmentCategory":
                    if (!TryString(employeeSnapshot, "employmentCategory", out var employmentCategory))
                        return Fail("Çalışanın firma kategorisi eksik; kategoriye bağlı bordro kuralı uygulanamaz.", out inputs, out error);
                    values[key] = new("choice", employmentCategory, null);
                    break;
                case "period.calendarDays":
                    values[key] = new("integer", periodEnd.DayNumber - periodStart.DayNumber + 1m, "day");
                    break;
                case "period.scheduledMinutes":
                    if (!TryGetPropertyIgnoreCase(employeeSnapshot, "scheduledMinutes", out var scheduledMinutes) ||
                        !scheduledMinutes.TryGetInt64(out var scheduledMinuteTotal) || scheduledMinuteTotal < 0)
                        return Fail($"'{key}' için onaylı iş takviminden planlanan dakika toplamı yok.", out inputs, out error);
                    values[key] = new("integer", scheduledMinuteTotal, "min");
                    break;
                case "period.scheduledDays":
                    if (!TryGetPropertyIgnoreCase(employeeSnapshot, "scheduledDays", out var scheduledDays) ||
                        !scheduledDays.TryGetInt32(out var scheduledDayTotal) || scheduledDayTotal < 0)
                        return Fail($"'{key}' için onaylı iş takviminden planlanan gün toplamı yok.", out inputs, out error);
                    values[key] = new("integer", scheduledDayTotal, "day");
                    break;
                case "compensation.amount":
                case "compensation.targetKind":
                case "compensation.currencyCode":
                case "compensation.payBasisCode":
                    if (selectedCompensation.ValueKind != JsonValueKind.Object)
                        return Fail($"'{key}' girdisi için dönem başında yürürlükte onaylı ücret hedefi yok.", out inputs, out error);
                    if (source == "compensation.amount")
                    {
                        if (!TryGetPropertyIgnoreCase(selectedCompensation, "amount", out var amount) || !amount.TryGetDecimal(out var decimalAmount))
                            return Fail($"'{key}' ücret tutarı/ödeme esası eksik.", out inputs, out error);
                        if (!TryGetSelectedPayBasis(rules, selectedCompensation, profile, periodStart, periodEnd, out _, out var basisUnit, out var currency, out var basisError))
                            return Fail(basisError ?? $"'{key}' ücret tutarı/ödeme esası eksik.", out inputs, out error);
                        var rawUnit = basisUnit == "1" ? currency : $"{currency}/{basisUnit}";
                        if (!PayrollExpressionSchemaValidator.UnitsMatch(rawUnit, unit))
                            return Fail($"'{key}' ücret tutarının para birimi/ödeme esası, formül birimiyle uyuşmuyor.", out inputs, out error);
                        values[key] = new("decimal", decimalAmount, rawUnit);
                    }
                    else if (source == "compensation.targetKind" && TryString(selectedCompensation, "targetKind", out var targetKind))
                        values[key] = new("choice", targetKind, null);
                    else if (source == "compensation.currencyCode" && TryString(selectedCompensation, "currencyCode", out var currencyCode))
                        values[key] = new("text", currencyCode, null);
                    else if (source == "compensation.payBasisCode" && TryString(selectedCompensation, "payBasisCode", out var payBasis))
                        values[key] = new("text", payBasis, null);
                    else return Fail($"'{key}' ücret girdisi okunamıyor.", out inputs, out error);
                    break;
                case "attendance.workedMinutes":
                case "attendance.overtimeMinutes":
                    if (!TryGetPropertyIgnoreCase(employeeSnapshot, "attendance", out var attendance) || attendance.ValueKind != JsonValueKind.Array || attendance.GetArrayLength() == 0)
                        return Fail($"'{key}' için döneme ait puantaj kaydı yok; eksik kaydı sıfır varsaymak yasaktır.", out inputs, out error);
                    long total = 0;
                    foreach (var day in attendance.EnumerateArray())
                    {
                        if (!TryGetPropertyIgnoreCase(day, "status", out var approvalStatus) || approvalStatus.ValueKind != JsonValueKind.String ||
                            !StringComparer.Ordinal.Equals(approvalStatus.GetString(), "Approved"))
                            return Fail($"'{key}' bordro girdisinde onaylanmamış puantaj kaydı var.", out inputs, out error);
                        if (!TryDate(day, "workDate", out var workDate) || workDate < periodStart || workDate > periodEnd ||
                            !TryGetPropertyIgnoreCase(day, source == "attendance.workedMinutes" ? "workedMinutes" : "overtimeMinutes", out var minutes) ||
                            !minutes.TryGetInt32(out var dayMinutes) || dayMinutes < 0)
                            return Fail($"'{key}' puantaj girdisi geçersiz.", out inputs, out error);
                        total = checked(total + dayMinutes);
                    }
                    values[key] = new("integer", (decimal)total, "min");
                    break;
                case "leave.requestedDays":
                    if (!TryString(definition, "leaveType", out var leaveType))
                        return Fail($"'{key}' izin türü bağlamı eksik.", out inputs, out error);
                    decimal leaveDays = 0;
                    if (TryGetPropertyIgnoreCase(employeeSnapshot, "leave", out var leaves) && leaves.ValueKind == JsonValueKind.Array)
                    foreach (var leave in leaves.EnumerateArray())
                    {
                        if (!TryString(leave, "leaveType", out var recordType) ||
                            !StringComparer.OrdinalIgnoreCase.Equals(recordType, leaveType) ||
                            !TryString(leave, "status", out var status) || status is "Rejected" or "Cancelled") continue;
                        if (status != "Approved")
                            return Fail($"'{leaveType}' izin girdisi için bekleyen/onaysız karar var.", out inputs, out error);
                        if (!TryDate(leave, "startDate", out var leaveStart) || !TryDate(leave, "endDate", out var leaveEnd))
                            return Fail($"'{leaveType}' izin tarihleri okunamıyor.", out inputs, out error);
                        if (leaveEnd < periodStart || leaveStart > periodEnd) continue;
                        if (leaveStart < periodStart || leaveEnd > periodEnd ||
                            !TryGetPropertyIgnoreCase(leave, "requestedDays", out var requestedDays) || !requestedDays.TryGetDecimal(out var requestedAmount) || requestedAmount < 0)
                            return Fail($"'{leaveType}' izni run dönemine kısmen taşıyor veya gün değeri geçersiz; dağıtım kuralı gereklidir.", out inputs, out error);
                        leaveDays = checked(leaveDays + requestedAmount);
                    }
                    values[key] = new("decimal", leaveDays, "day");
                    break;
                case "priorEmployerTaxBase.amount":
                    if (!TryString(definition, "baseCode", out var baseCode) ||
                        !TryGetPropertyIgnoreCase(employeeSnapshot, "priorEmployerTaxBaseDeclarations", out var declarations) ||
                        declarations.ValueKind != JsonValueKind.Array)
                        return Fail($"'{key}' için onaylı önceki işveren matrah beyanı veya baz kodu yok.", out inputs, out error);
                    var taxYear = periodStart.Year;
                    JsonElement selectedDeclaration = default;
                    foreach (var declaration in declarations.EnumerateArray())
                    {
                        if (!TryString(declaration, "status", out var declarationStatus) || declarationStatus != "Approved" ||
                            !TryGetPropertyIgnoreCase(declaration, "taxYear", out var taxYearNode) || !taxYearNode.TryGetInt32(out var declarationYear) || declarationYear != taxYear)
                            continue;
                        selectedDeclaration = declaration;
                    }
                    if (selectedDeclaration.ValueKind != JsonValueKind.Object ||
                        !TryString(selectedDeclaration, "declarationKind", out var declarationKind) ||
                        !TryGetPropertyIgnoreCase(selectedDeclaration, "baseEntriesJson", out var entriesNode) || entriesNode.ValueKind != JsonValueKind.String)
                        return Fail($"'{key}' için dönemin vergi yılına ait onaylı önceki işveren beyanı yok.", out inputs, out error);
                    if (declarationKind == "NoPriorEmployer")
                    {
                        values[key] = new("decimal", 0m, unit);
                        break;
                    }
                    try
                    {
                        using var entriesDocument = JsonDocument.Parse(entriesNode.GetString()!);
                        var matches = entriesDocument.RootElement.ValueKind == JsonValueKind.Array
                            ? entriesDocument.RootElement.EnumerateArray().Where(entry =>
                                TryString(entry, "code", out var entryCode) && StringComparer.OrdinalIgnoreCase.Equals(baseCode, entryCode) &&
                                TryString(entry, "unit", out var entryUnit) && PayrollExpressionSchemaValidator.UnitsMatch(entryUnit, unit)).ToArray()
                            : [];
                        if (matches.Length != 1 || !matches[0].TryGetProperty("amount", out var amountNode) || !amountNode.TryGetDecimal(out var baseAmount))
                            return Fail($"'{key}' için önceki işveren belgesindeki '{baseCode}' baz kodu/birimi eksik veya belirsiz.", out inputs, out error);
                        values[key] = new("decimal", baseAmount, unit);
                    }
                    catch (JsonException)
                    {
                        return Fail($"'{key}' önceki işveren matrah girdisi okunamıyor.", out inputs, out error);
                    }
                    break;
                case "sameEmployerYtdBase.amount":
                    if (!TryString(definition, "baseCode", out var ytdBaseCode) ||
                        !TryString(definition, "baseType", out var ytdBaseType) ||
                        ytdBaseType is not ("incomeTaxBase" or "socialSecurityBase"))
                        return Fail($"'{key}' aynı işveren YTD matrah kodu/türü eksik veya geçersiz.", out inputs, out error);
                    if (!TryBindSameEmployerYtd(employeeSnapshot, periodStart, ytdBaseType, ytdBaseCode, unit,
                            out var ytdAmount, out var ytdError))
                        return Fail($"'{key}' aynı işveren YTD matrahı bağlanamadı: {ytdError}", out inputs, out error);
                    values[key] = new("decimal", ytdAmount, unit);
                    break;
                default:
                    return Fail($"Desteklenmeyen bordro girdisi kaynağı: {source}.", out inputs, out error);
            }
        }

        if (!TryGetSelectedPayBasis(rules, selectedCompensation, profile, periodStart, periodEnd,
                out var selectedPayBasis, out periodMultiplierUnit, out var targetCurrency, out var payBasisError) ||
            !TryGetPropertyIgnoreCase(selectedPayBasis, "periodMultiplier", out var multiplierExpression) ||
            !TryResolveParametersForExpression(rules, profile, periodStart, periodEnd, values, multiplierExpression,
                out var multiplierParameters, out error) ||
            !PayrollExpressionEvaluator.TryEvaluate(multiplierExpression, values, multiplierParameters, periodMultiplierUnit,
                out var multiplierValue, out error) || multiplierValue.Type is not ("decimal" or "integer") ||
            multiplierValue.Value is not decimal multiplierDecimal || multiplierDecimal < 0m)
            return Fail(error ?? payBasisError ?? "Onaylı ödeme esası dönem çarpanı geçersiz veya negatif.", out inputs, out error);
        periodMultiplier = multiplierDecimal;

        if (hasDefinitions)
        foreach (var definition in definitions.EnumerateArray())
        {
            if (!TryString(definition, "key", out var key) || !requiredInputKeys.Contains(key) ||
                !TryString(definition, "profile", out var definitionProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, definitionProfile) ||
                !TryDate(definition, "effectiveFrom", out var from) || from > periodStart ||
                !TryOptionalDate(definition, "effectiveTo", out var to) || to is not null && to < periodEnd ||
                !TryString(definition, "sourceBinding", out var source) || source is not ("compensation.periodAmount" or "calculation.grossCandidate")) continue;
            if (!TryString(definition, "unit", out var unit) || !PayrollExpressionSchemaValidator.UnitsMatch(targetCurrency, unit))
                return Fail($"'{key}' dönem tutarı birimi, çalışan para birimiyle uyuşmuyor.", out inputs, out error);
            decimal baseAmount;
            if (source == "compensation.periodAmount")
            {
                if (!TryGetPropertyIgnoreCase(selectedCompensation, "amount", out var amountNode) || !amountNode.TryGetDecimal(out baseAmount))
                    return Fail($"'{key}' onaylı ücret tutarı okunamıyor.", out inputs, out error);
            }
            else if (grossCandidate is not null) baseAmount = grossCandidate.Value;
            else return Fail($"'{key}' brüt aday tutarı bulunamadı.", out inputs, out error);
            try { values[key] = new("decimal", checked(baseAmount * periodMultiplier), targetCurrency); }
            catch (OverflowException) { return Fail($"'{key}' dönem tutarı decimal sınırını aştı.", out inputs, out error); }
        }
        return true;
    }

    private static bool TryGetSelectedPayBasis(JsonElement rules, JsonElement selectedCompensation, string profile,
        DateOnly periodStart, DateOnly periodEnd, out JsonElement selected, out string basisUnit,
        out string currency, out string? error)
    {
        selected = default;
        basisUnit = "";
        currency = "";
        error = null;
        if (!TryString(selectedCompensation, "payBasisCode", out var code) ||
            !TryString(selectedCompensation, "currencyCode", out currency) ||
            !TryGetPropertyIgnoreCase(rules, "payBases", out var payBases) || payBases.ValueKind != JsonValueKind.Array)
            return Fail("Onaylı ödeme esası veya ücret para birimi yok.", out error);
        var matches = payBases.EnumerateArray().Where(x =>
            TryString(x, "code", out var candidateCode) && StringComparer.OrdinalIgnoreCase.Equals(code, candidateCode) &&
            TryString(x, "profile", out var candidateProfile) && StringComparer.OrdinalIgnoreCase.Equals(profile, candidateProfile) &&
            TryDate(x, "effectiveFrom", out var from) && from <= periodStart &&
            TryOptionalDate(x, "effectiveTo", out var to) && (to is null || to >= periodEnd)).ToArray();
        if (matches.Length != 1 || !TryString(matches[0], "unit", out basisUnit) ||
            !TryGetPropertyIgnoreCase(matches[0], "periodMultiplier", out _))
            return Fail($"'{code}' ödeme esası bu profil ve dönemi tek başına kapsamıyor veya çarpanı eksik.", out error);
        selected = matches[0];
        return true;
    }

    private static bool TryResolveParametersForExpression(JsonElement rules, string profile, DateOnly periodStart,
        DateOnly periodEnd, IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs, JsonElement expression,
        out IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> resolved, out string? error)
    {
        error = null;
        resolved = new Dictionary<string, PayrollExpressionRuntimeValue>(StringComparer.OrdinalIgnoreCase);
        var inputKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var requiredKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        CollectRuntimeReferences(expression, inputKeys, requiredKeys);
        if (requiredKeys.Count == 0) return true;
        if (!TryGetPropertyIgnoreCase(rules, "parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array)
            return Fail("Ödeme esası dönem çarpanı için başvurulan parametreler yok.", out error);
        var definitions = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in parameters.EnumerateArray())
        {
            if (!TryString(parameter, "profile", out var parameterProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, parameterProfile) ||
                !TryDate(parameter, "effectiveFrom", out var from) || from > periodStart ||
                !TryOptionalDate(parameter, "effectiveTo", out var to) || to is not null && to < periodEnd) continue;
            if (from > periodStart || to is not null && to < periodEnd)
                return Fail("Ödeme esası parametresi run döneminin tamamını kapsamıyor.", out error);
            if (!TryString(parameter, "key", out var key) || !definitions.TryAdd(key, parameter))
                return Fail("Ödeme esası için dönem ve profil kapsamında parametre belirsizliği var.", out error);
        }
        var values = new Dictionary<string, PayrollExpressionRuntimeValue>(StringComparer.OrdinalIgnoreCase);
        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var done = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in requiredKeys)
            if (!ResolveParameter(key, definitions, inputs, values, visiting, done, 0, out error)) return false;
        resolved = values;
        return true;
    }

    private static bool TryBindSameEmployerYtd(JsonElement employeeSnapshot, DateOnly periodStart, string mappingType,
        string baseCode, string? unit, out decimal amount, out string error)
    {
        amount = 0m;
        error = "önceki onaylı dönem girdisi yok.";
        var taxYearStart = new DateOnly(periodStart.Year, 1, 1);
        var coverageStart = taxYearStart;
        if (TryGetPropertyIgnoreCase(employeeSnapshot, "hireDate", out var hireNode) &&
            DateOnly.TryParse(hireNode.ToString(), CultureInfo.InvariantCulture, out var hireDate) && hireDate > coverageStart)
            coverageStart = hireDate;
        if (coverageStart >= periodStart) return true;
        if (!TryGetPropertyIgnoreCase(employeeSnapshot, "sameEmployerYtdPeriods", out var periods) || periods.ValueKind != JsonValueKind.Array)
            return false;

        var applicable = new List<(DateOnly Start, DateOnly End, JsonElement Aggregates)>();
        foreach (var period in periods.EnumerateArray())
        {
            if (!TryDate(period, "periodStart", out var start) || !TryDate(period, "periodEnd", out var end) ||
                end < coverageStart || start >= periodStart || end >= periodStart ||
                !TryGetPropertyIgnoreCase(period, "baseAggregates", out var aggregates) || aggregates.ValueKind != JsonValueKind.Array)
                continue;
            applicable.Add((start, end, aggregates));
        }
        applicable.Sort((a, b) => a.Start.CompareTo(b.Start));
        var expectedStart = coverageStart;
        foreach (var priorPeriod in applicable)
        {
            var clippedStart = priorPeriod.Start < coverageStart ? coverageStart : priorPeriod.Start;
            if (clippedStart != expectedStart || priorPeriod.End < clippedStart)
            { error = "önceki onaylı dönemlerde boşluk veya çakışma var."; return false; }
            var matches = priorPeriod.Aggregates.EnumerateArray().Where(x =>
                TryString(x, "mappingType", out var type) && StringComparer.Ordinal.Equals(type, mappingType) &&
                TryString(x, "targetCode", out var code) && StringComparer.OrdinalIgnoreCase.Equals(code, baseCode) &&
                TryString(x, "unit", out var aggregateUnit) && PayrollExpressionSchemaValidator.UnitsMatch(aggregateUnit, unit)).ToArray();
            if (matches.Length != 1 || !TryGetPropertyIgnoreCase(matches[0], "amount", out var amountNode) || !amountNode.TryGetDecimal(out var periodAmount))
            { error = $"'{baseCode}' kodu '{priorPeriod.Start:yyyy-MM-dd}'–'{priorPeriod.End:yyyy-MM-dd}' döneminde eksik veya belirsiz."; return false; }
            try { amount = checked(amount + periodAmount); }
            catch (OverflowException) { error = "birikimli matrah decimal sınırını aştı."; return false; }
            expectedStart = priorPeriod.End.AddDays(1);
        }
        if (expectedStart != periodStart)
        { error = $"'{expectedStart:yyyy-MM-dd}'–'{periodStart.AddDays(-1):yyyy-MM-dd}' aralığını kapsayan onaylı aynı işveren bordro dönemi yok."; return false; }
        return true;
    }

    public static bool TryEvaluateTarget(JsonElement rules, DateOnly rulesEffectiveFrom, DateOnly? rulesEffectiveTo,
        string profile, DateOnly periodStart, DateOnly periodEnd, JsonElement employeeSnapshot,
        out PayrollTargetRuntimeResult result, out string? error)
    {
        result = default!;
        error = null;
        if (!TryGetSelectedCompensation(employeeSnapshot, periodStart, out var compensation) ||
            !TryString(compensation, "targetKind", out var targetKind) || targetKind is not ("Gross" or "Net") ||
            !TryGetPropertyIgnoreCase(compensation, "amount", out var amountNode) || !amountNode.TryGetDecimal(out var targetAmount) || targetAmount <= 0m)
            return Fail("Brüt/net hedefi dönem başındaki onaylı ücret kaydından okunamadı.", out error);

        var candidate = targetAmount;
        if (!TryBindSnapshotInputs(rules, employeeSnapshot, profile, periodStart, periodEnd, targetAmount,
                out _, out var targetMultiplier, out _, out error)) return false;
        decimal periodTargetAmount;
        try { periodTargetAmount = decimal.Round(checked(targetAmount * targetMultiplier), 2, MidpointRounding.AwayFromZero); }
        catch (OverflowException) { return Fail("Brüt/net hedefinin dönem tutarı decimal sınırını aştı.", out error); }
        if (targetKind == "Net" && periodTargetAmount <= 0m)
            return Fail("Net hedefin dönem çarpanı sıfır veya negatif; dönem tutarı çözülemedi.", out error);
        if (targetKind == "Net")
        {
            if (!TryCalculateCandidate(0m, out var low, out var lowNet, out _, out _, out error)) return false;
            if (lowNet > periodTargetAmount)
                return Fail("Sıfır brüt adayında dahi formül net hedefi aşıyor; net hedef çözülemedi.", out error);

            var high = Math.Max(targetAmount, 1m);
            IReadOnlyList<PayrollComponentRuntimeResult> highComponents = [];
            decimal highNet = 0m, highGross = 0m, highDeductions = 0m;
            var previousNet = lowNet;
            var bracketFound = false;
            for (var expansion = 0; expansion < 64; expansion++)
            {
                if (!TryCalculateCandidate(high, out highComponents, out highNet, out highGross, out highDeductions, out error)) return false;
                if (highNet < previousNet)
                    return Fail("Net hesap formülü brüt aday arttıkça azalıyor; net hedef için monoton çözüm bulunamadı.", out error);
                if (highNet >= periodTargetAmount) { bracketFound = true; break; }
                previousNet = highNet;
                if (high > decimal.MaxValue / 2m) break;
                high *= 2m;
            }
            if (!bracketFound) return Fail("Onaylı formüller için net hedefi sınırlı aralıkta çözülemedi.", out error);

            var lower = 0m;
            var lowerNet = lowNet;
            var upperNet = highNet;
            IReadOnlyList<PayrollComponentRuntimeResult> bestComponents = highComponents;
            decimal bestGross = highGross, bestDeductions = highDeductions, bestNet = highNet;
            for (var iteration = 0; iteration < 96; iteration++)
            {
                var midpoint = lower + (high - lower) / 2m;
                if (midpoint == lower || midpoint == high) break;
                if (!TryCalculateCandidate(midpoint, out var midpointComponents, out var midpointNet,
                        out var midpointGross, out var midpointDeductions, out error)) return false;
                if (midpointNet < lowerNet || midpointNet > upperNet)
                    return Fail("Brüt aday ile net sonuç arasında monoton olmayan formül davranışı saptandı; net hedef çözülemedi.", out error);
                bestComponents = midpointComponents;
                bestGross = midpointGross;
                bestDeductions = midpointDeductions;
                bestNet = midpointNet;
                candidate = midpoint;
                if (Math.Abs(midpointNet - periodTargetAmount) <= 0.01m) break;
                if (midpointNet < periodTargetAmount) { lower = midpoint; lowerNet = midpointNet; }
                else { high = midpoint; upperNet = midpointNet; }
            }
            if (Math.Abs(bestNet - periodTargetAmount) > 0.01m)
                return Fail("Onaylı formüller net hedefi bir kuruş hassasiyetinde sağlayamıyor.", out error);
            if (!TryAggregatePayrollBases(bestComponents, out var bestBases, out error)) return false;
            result = new(targetKind, targetAmount, periodTargetAmount, candidate, bestGross, bestDeductions, bestNet, bestComponents, bestBases);
            return true;
        }

        if (!TryCalculateCandidate(candidate, out var components, out var netPay, out var grossPay,
                out var employeeDeductions, out error)) return false;
        if (!TryAggregatePayrollBases(components, out var bases, out error)) return false;
        result = new(targetKind, targetAmount, periodTargetAmount, candidate, grossPay, employeeDeductions, netPay, components, bases);
        return true;

        bool TryCalculateCandidate(decimal grossCandidate, out IReadOnlyList<PayrollComponentRuntimeResult> components,
            out decimal netPay, out decimal grossPay, out decimal employeeDeductions, out string? candidateError)
        {
            components = [];
            netPay = grossPay = employeeDeductions = 0m;
            candidateError = null;
            if (!TryBindSnapshotInputs(rules, employeeSnapshot, profile, periodStart, periodEnd, grossCandidate,
                    out var inputs, out _, out _, out candidateError) ||
                !TryEvaluateComponents(rules, rulesEffectiveFrom, rulesEffectiveTo, profile, periodStart, periodEnd,
                    inputs, out components, out candidateError)) return false;
            string? moneyUnit = null;
            foreach (var component in components)
            {
                if (component.Category is not ("earning" or "deduction")) continue;
                if (moneyUnit is null) moneyUnit = component.Unit;
                else if (!PayrollExpressionSchemaValidator.UnitsMatch(moneyUnit, component.Unit))
                    return Fail("Kazanç ve çalışan kesintisi kalemlerinin para birimleri eşleşmiyor.", out candidateError);
                if (component.Category == "earning") grossPay = checked(grossPay + component.Amount);
                else employeeDeductions = checked(employeeDeductions + component.Amount);
            }
            if (moneyUnit is null) return Fail("Brüt/net çözümü için kazanç veya çalışan kesintisi kalemi yok.", out candidateError);
            netPay = checked(grossPay - employeeDeductions);
            return true;
        }
    }

    private static bool TryAggregatePayrollBases(IReadOnlyList<PayrollComponentRuntimeResult> components,
        out IReadOnlyList<PayrollBaseAggregateRuntimeResult> aggregates, out string? error)
    {
        error = null;
        var values = new Dictionary<(string MappingType, string Code), (string Unit, decimal Amount)>();
        foreach (var component in components)
        foreach (var mappingType in new[] { "incomeTaxBase", "socialSecurityBase" })
        {
            if (!component.MappingCodes.TryGetValue(mappingType, out var code) ||
                StringComparer.OrdinalIgnoreCase.Equals(code, "EXCLUDED")) continue;
            if (!component.MappingTreatments.TryGetValue(mappingType, out var treatment) || treatment is not ("add" or "subtract"))
            { aggregates = []; error = $"'{component.Key}' kaleminin '{mappingType}' matrah etkisi tanımlı değil."; return false; }
            var key = (mappingType, code);
            try
            {
                var contribution = treatment == "add" ? component.Amount : checked(-component.Amount);
                if (values.TryGetValue(key, out var current))
                {
                    if (!PayrollExpressionSchemaValidator.UnitsMatch(current.Unit, component.Unit))
                    { aggregates = []; error = $"'{code}' matrah koduna farklı birimler bağlanmış."; return false; }
                    values[key] = (current.Unit, checked(current.Amount + contribution));
                }
                else values[key] = (component.Unit, contribution);
            }
            catch (OverflowException)
            { aggregates = []; error = $"'{code}' matrah toplamı decimal sınırını aştı."; return false; }
        }
        aggregates = values.Select(x => new PayrollBaseAggregateRuntimeResult(x.Key.MappingType, x.Key.Code,
            x.Value.Amount, x.Value.Unit)).ToArray();
        return true;
    }

    private static bool TryGetSelectedCompensation(JsonElement employeeSnapshot, DateOnly periodStart, out JsonElement selected)
    {
        selected = default;
        if (!TryGetPropertyIgnoreCase(employeeSnapshot, "compensation", out var compensation) || compensation.ValueKind != JsonValueKind.Array)
            return false;
        foreach (var item in compensation.EnumerateArray())
        {
            if (!TryDate(item, "effectiveFrom", out var from) || from > periodStart) continue;
            if (selected.ValueKind == JsonValueKind.Undefined ||
                TryDate(selected, "effectiveFrom", out var selectedFrom) && from > selectedFrom)
                selected = item;
        }
        return selected.ValueKind == JsonValueKind.Object;
    }

    public static bool TryEvaluateComponents(JsonElement rules, DateOnly rulesEffectiveFrom, DateOnly? rulesEffectiveTo,
        string profile, DateOnly periodStart, DateOnly periodEnd,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs,
        out IReadOnlyList<PayrollComponentRuntimeResult> results, out string? error)
    {
        results = [];
        error = null;
        if (!PayrollParameterSetValidator.TryValidate(rules, rulesEffectiveFrom, rulesEffectiveTo, true, out error)) return false;
        if (!TryResolveParameters(rules, profile, periodStart, periodEnd, inputs, out var parameters, out error)) return false;

        if (!rules.TryGetProperty("components", out var components) || components.ValueKind != JsonValueKind.Array)
            return Fail("Onaylı kural setinde bordro kalemleri yok.", out results, out error);

        var applicable = new List<JsonElement>();
        foreach (var component in components.EnumerateArray())
        {
            if (!TryString(component, "profile", out var componentProfile) ||
                !StringComparer.OrdinalIgnoreCase.Equals(componentProfile, profile) ||
                !TryDate(component, "effectiveFrom", out var from) || !TryOptionalDate(component, "effectiveTo", out var to) ||
                from > periodEnd || to is not null && to < periodStart) continue;

            if (from > periodStart || to is not null && to < periodEnd)
                return Fail("Bordro kalemi yürürlük değişikliği run dönemi içinden geçiyor.", out results, out error);
            applicable.Add(component);
        }
        if (applicable.Count == 0) return Fail("Seçilen profil ve dönemi kapsayan bordro kalemi yok.", out results, out error);

        var output = new List<PayrollComponentRuntimeResult>(applicable.Count);
        foreach (var component in applicable)
        {
            if (!TryString(component, "key", out var key) || !TryString(component, "label", out var label) ||
                !TryString(component, "category", out var category) || !TryString(component, "unit", out var unit) ||
                !component.TryGetProperty("formula", out var formula) ||
                !PayrollExpressionEvaluator.TryEvaluate(formula, inputs, parameters, unit, out var amount, out error) ||
                amount.Type is not ("decimal" or "integer") || amount.Value is not decimal decimalAmount)
                return Fail(error ?? "Bordro kalemi formülü geçerli bir tutar üretmedi.", out results, out error);

            var mappingCodes = new Dictionary<string, string>(StringComparer.Ordinal);
            var mappingTreatments = new Dictionary<string, string>(StringComparer.Ordinal);
            if (rules.TryGetProperty("mappings", out var mappings) && mappings.ValueKind == JsonValueKind.Array)
            {
                foreach (var mapping in mappings.EnumerateArray())
                {
                    if (TryString(mapping, "componentKey", out var mappedKey) && mappedKey == key &&
                        TryString(mapping, "profile", out var mappedProfile) && StringComparer.OrdinalIgnoreCase.Equals(mappedProfile, profile) &&
                        TryString(mapping, "mappingType", out var mappingType) && TryString(mapping, "targetCode", out var targetCode) &&
                        TryDate(mapping, "effectiveFrom", out var mappingFrom) && mappingFrom <= periodStart &&
                        TryOptionalDate(mapping, "effectiveTo", out var mappingTo) && (mappingTo is null || mappingTo >= periodEnd))
                    {
                        mappingCodes[mappingType] = targetCode;
                        if (mappingType is "incomeTaxBase" or "socialSecurityBase" && TryString(mapping, "baseTreatment", out var treatment))
                            mappingTreatments[mappingType] = treatment;
                    }
                }
            }
            // Payroll amounts are rounded per component/line before gross, deductions,
            // net pay and statutory bases are aggregated. This is an owner-approved
            // product rule; it does not imply statutory calculation approval.
            output.Add(new(key, label, category, decimal.Round(decimalAmount, 2, MidpointRounding.AwayFromZero), unit,
                mappingCodes, mappingTreatments));
        }

        results = output;
        return true;
    }

    public static bool TryResolveParameters(JsonElement rules, string profile, DateOnly periodStart, DateOnly periodEnd,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs,
        out IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> resolved, out string? error)
    {
        error = null;
        var definitions = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        var resolvedValues = new Dictionary<string, PayrollExpressionRuntimeValue>(StringComparer.OrdinalIgnoreCase);
        resolved = resolvedValues;
        if (!rules.TryGetProperty("parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array)
            return Fail("Parametre dizisi bulunamadı.", out resolved, out error);

        foreach (var parameter in parameters.EnumerateArray())
        {
            if (!TryString(parameter, "profile", out var parameterProfile) ||
                !StringComparer.OrdinalIgnoreCase.Equals(parameterProfile, profile) ||
                !TryDate(parameter, "effectiveFrom", out var from) || !TryOptionalDate(parameter, "effectiveTo", out var to) ||
                from > periodEnd || to is not null && to < periodStart) continue;

            if (from > periodStart || to is not null && to < periodEnd)
                return Fail("Parametre yürürlük değişikliği run dönemi içinden geçiyor; dönem sınırında kural sürümü ayrılmalı.", out resolved, out error);
            if (!TryString(parameter, "key", out var key) || !definitions.TryAdd(key, parameter))
                return Fail("Run dönemi ve profil için aynı parametre anahtarı birden fazla tanımlı.", out resolved, out error);
        }

        var visiting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var done = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var requiredParameterKeys = ComponentReferences(rules, profile, periodStart, periodEnd).ParameterKeys;
        foreach (var key in requiredParameterKeys)
        {
            if (!definitions.ContainsKey(key)) return Fail($"Kullanılan onaylı parametre bulunamadı: {key}.", out resolved, out error);
            if (!TryString(definitions[key], "valueType", out var type) || type is "date" or "json")
                return Fail($"Kullanılan parametrenin yürütülebilir türü desteklenmiyor: {key}.", out resolved, out error);
            if (!ResolveParameter(key, definitions, inputs, resolvedValues, visiting, done, 0, out error))
            {
                resolved = new Dictionary<string, PayrollExpressionRuntimeValue>(StringComparer.OrdinalIgnoreCase);
                return false;
            }
        }
        return true;
    }

    private static (HashSet<string> InputKeys, HashSet<string> ParameterKeys) ComponentReferences(
        JsonElement rules, string profile, DateOnly periodStart, DateOnly periodEnd)
    {
        var inputKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var parameterKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (TryGetPropertyIgnoreCase(rules, "components", out var components) && components.ValueKind == JsonValueKind.Array)
        foreach (var component in components.EnumerateArray())
        {
            if (!TryString(component, "profile", out var componentProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, componentProfile) ||
                !TryDate(component, "effectiveFrom", out var from) || from > periodStart ||
                !TryOptionalDate(component, "effectiveTo", out var to) || to is not null && to < periodEnd ||
                !TryGetPropertyIgnoreCase(component, "formula", out var formula)) continue;
            CollectRuntimeReferences(formula, inputKeys, parameterKeys);
        }

        if (TryGetPropertyIgnoreCase(rules, "payBases", out var payBases) && payBases.ValueKind == JsonValueKind.Array)
        foreach (var payBasis in payBases.EnumerateArray())
        {
            if (!TryString(payBasis, "profile", out var basisProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, basisProfile) ||
                !TryDate(payBasis, "effectiveFrom", out var basisFrom) || basisFrom > periodStart ||
                !TryOptionalDate(payBasis, "effectiveTo", out var basisTo) || basisTo is not null && basisTo < periodEnd ||
                !TryGetPropertyIgnoreCase(payBasis, "periodMultiplier", out var multiplier)) continue;
            CollectRuntimeReferences(multiplier, inputKeys, parameterKeys);
        }

        if (!TryGetPropertyIgnoreCase(rules, "parameters", out var parameters) || parameters.ValueKind != JsonValueKind.Array)
            return (inputKeys, parameterKeys);
        var activeParameters = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in parameters.EnumerateArray())
        {
            if (!TryString(parameter, "profile", out var parameterProfile) || !StringComparer.OrdinalIgnoreCase.Equals(profile, parameterProfile) ||
                !TryDate(parameter, "effectiveFrom", out var from) || from > periodStart ||
                !TryOptionalDate(parameter, "effectiveTo", out var to) || to is not null && to < periodEnd ||
                !TryString(parameter, "key", out var key)) continue;
            activeParameters.TryAdd(key, parameter);
        }

        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (parameterKeys.Any(x => !visited.Contains(x)))
        {
            var key = parameterKeys.First(x => !visited.Contains(x));
            visited.Add(key);
            if (!activeParameters.TryGetValue(key, out var parameter) || !TryString(parameter, "valueType", out var valueType) || valueType != "expression" ||
                !TryGetPropertyIgnoreCase(parameter, "value", out var expression)) continue;
            CollectRuntimeReferences(expression, inputKeys, parameterKeys);
        }
        return (inputKeys, parameterKeys);
    }

    private static void CollectRuntimeReferences(JsonElement node, HashSet<string> inputKeys, HashSet<string> parameterKeys)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (TryString(node, "op", out var operation) && TryString(node, "key", out var key))
            {
                if (operation == "input") inputKeys.Add(key);
                else if (operation == "parameter") parameterKeys.Add(key);
            }
            foreach (var property in node.EnumerateObject()) CollectRuntimeReferences(property.Value, inputKeys, parameterKeys);
        }
        else if (node.ValueKind == JsonValueKind.Array)
            foreach (var item in node.EnumerateArray()) CollectRuntimeReferences(item, inputKeys, parameterKeys);
    }

    private static bool ResolveParameter(string key, IReadOnlyDictionary<string, JsonElement> definitions,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs,
        Dictionary<string, PayrollExpressionRuntimeValue> resolved,
        HashSet<string> visiting, HashSet<string> done, int depth, out string? error)
    {
        error = null;
        if (done.Contains(key)) return true;
        if (depth > 32 || !visiting.Add(key)) return Fail($"Parametre bağımlılığı döngülü veya çok derin: {key}.", out error);
        if (!definitions.TryGetValue(key, out var parameter) || !TryString(parameter, "valueType", out var valueType) ||
            !parameter.TryGetProperty("value", out var rawValue) || !TryOptionalString(parameter, "unit", out var unit))
            return Fail($"Parametre okunamadı: {key}.", out error);

        PayrollExpressionRuntimeValue value;
        if (valueType == "expression")
        {
            var dependencies = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            CollectParameterReferences(rawValue, dependencies);
            foreach (var dependency in dependencies)
            {
                if (!definitions.ContainsKey(dependency)) return Fail($"Onaylı parametre bulunamadı: {dependency}.", out error);
                if (!ResolveParameter(dependency, definitions, inputs, resolved, visiting, done, depth + 1, out error)) return false;
            }
            if (!PayrollExpressionEvaluator.TryEvaluate(rawValue, inputs, resolved, unit, out value, out error)) return false;
        }
        else if (!TryReadLiteral(valueType, rawValue, unit, out value))
            return Fail($"Parametre değeri yürütme için desteklenmeyen veya geçersiz türde: {key}.", out error);

        resolved[key] = value;
        visiting.Remove(key);
        done.Add(key);
        return true;
    }

    private static bool TryReadLiteral(string type, JsonElement raw, string? unit, out PayrollExpressionRuntimeValue value)
    {
        value = default!;
        switch (type)
        {
            case "decimal" when raw.ValueKind == JsonValueKind.Number && raw.TryGetDecimal(out var number):
                value = new("decimal", number, unit); return true;
            case "integer" when raw.ValueKind == JsonValueKind.Number && raw.TryGetInt64(out var integer):
                value = new("integer", (decimal)integer, unit); return true;
            case "boolean" when raw.ValueKind is JsonValueKind.True or JsonValueKind.False:
                value = new("boolean", raw.GetBoolean(), null); return true;
            case "text" or "choice" when raw.ValueKind == JsonValueKind.String:
                value = new(type, raw.GetString() ?? "", null); return true;
            default: return false;
        }
    }

    private static void CollectParameterReferences(JsonElement node, HashSet<string> keys)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (TryString(node, "op", out var op) && op == "parameter" && TryString(node, "key", out var key)) keys.Add(key);
            foreach (var property in node.EnumerateObject()) CollectParameterReferences(property.Value, keys);
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in node.EnumerateArray()) CollectParameterReferences(item, keys);
        }
    }

    private static bool TryString(JsonElement element, string property, out string value)
    {
        value = "";
        if (!TryGetPropertyIgnoreCase(element, property, out var item) || item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString() ?? "";
        return value.Length > 0;
    }

    private static bool TryOptionalString(JsonElement element, string property, out string? value)
    {
        value = null;
        if (!TryGetPropertyIgnoreCase(element, property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString();
        return true;
    }

    private static bool TryDate(JsonElement element, string property, out DateOnly value)
    {
        value = default;
        return TryGetPropertyIgnoreCase(element, property, out var item) && item.ValueKind == JsonValueKind.String &&
            DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }

    private static bool TryOptionalDate(JsonElement element, string property, out DateOnly? value)
    {
        value = null;
        if (!TryGetPropertyIgnoreCase(element, property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String ||
            !DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) return false;
        value = parsed;
        return true;
    }

    private static bool Fail(string message, out string? error) { error = message; return false; }
    private static bool Fail(string message, out IReadOnlyList<PayrollComponentRuntimeResult> result, out string? error)
    { result = []; error = message; return false; }
    private static bool Fail(string message, out IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> result, out string? error)
    { result = new Dictionary<string, PayrollExpressionRuntimeValue>(); error = message; return false; }

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string property, out JsonElement value)
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
}

internal sealed record PayrollComponentRuntimeResult(string Key, string Label, string Category, decimal Amount,
    string Unit, IReadOnlyDictionary<string, string> MappingCodes, IReadOnlyDictionary<string, string> MappingTreatments);
internal sealed record PayrollTargetRuntimeResult(string TargetKind, decimal TargetAmount, decimal PeriodTargetAmount, decimal GrossCandidate,
    decimal GrossEarnings, decimal EmployeeDeductions, decimal NetPay,
    IReadOnlyList<PayrollComponentRuntimeResult> Components, IReadOnlyList<PayrollBaseAggregateRuntimeResult> BaseAggregates);
internal sealed record PayrollBaseAggregateRuntimeResult(string MappingType, string TargetCode, decimal Amount, string Unit);
