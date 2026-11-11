using System.Text.Json;
using AIERP.Platform.Domain;

namespace AIERP.Platform.Application;

public sealed record AccountingTaxBreakdownLine(string Code, string Name, decimal Rate, string Treatment,
    string CalculationBase, decimal TaxableAmount, decimal Amount);

public sealed record AccountingTaxAssessment(string ProfileCode, decimal TaxTotal, decimal GrandTotal,
    string TaxBreakdownJson);

/// <summary>Applies profile-configured additional taxes while preserving the stock/order VAT rate.</summary>
public static class AccountingRuleTaxCalculator
{
    private const decimal MaxAmount = 9999999999999999.99m;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static string Aggregate(IEnumerable<string> breakdowns)
    {
        var rows = new Dictionary<string, (string Name, decimal Rate, string Treatment, string CalculationBase, decimal TaxableAmount, decimal Amount)>(StringComparer.OrdinalIgnoreCase);
        foreach (var json in breakdowns)
        {
            using var document = JsonDocument.Parse(json);
            foreach (var item in document.RootElement.EnumerateArray())
            {
                var code = item.GetProperty("code").GetString()!;
                var entry = (item.GetProperty("name").GetString()!, item.GetProperty("rate").GetDecimal(),
                    item.GetProperty("treatment").GetString()!, item.GetProperty("calculationBase").GetString()!,
                    item.GetProperty("taxableAmount").GetDecimal(), item.GetProperty("amount").GetDecimal());
                if (rows.TryGetValue(code, out var old))
                    rows[code] = (old.Name, old.Rate, old.Treatment, old.CalculationBase, old.TaxableAmount + entry.Item5, old.Amount + entry.Item6);
                else rows[code] = entry;
            }
        }
        return JsonSerializer.Serialize(rows.Select(row => new AccountingTaxBreakdownLine(row.Key, row.Value.Name,
            row.Value.Rate, row.Value.Treatment, row.Value.CalculationBase, row.Value.TaxableAmount, row.Value.Amount)), JsonOptions);
    }

    public static decimal SumWithholding(string? breakdownJson)
    {
        if (string.IsNullOrWhiteSpace(breakdownJson)) return 0m;
        return ReadBreakdown(breakdownJson).Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
    }

    public static IReadOnlyList<AccountingTaxBreakdownLine> ReadBreakdown(string? breakdownJson)
    {
        if (string.IsNullOrWhiteSpace(breakdownJson)) return [];
        using var document = JsonDocument.Parse(breakdownJson);
        if (document.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("Fatura vergi anlık görüntüsü dizi biçiminde değil.");
        var rows = new List<AccountingTaxBreakdownLine>();
        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("code", out var code) || code.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("rate", out var rate) || !rate.TryGetDecimal(out var rateValue) ||
                !item.TryGetProperty("treatment", out var treatment) || treatment.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("calculationBase", out var calculationBase) || calculationBase.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("taxableAmount", out var taxableAmount) || !taxableAmount.TryGetDecimal(out var taxableAmountValue) ||
                !item.TryGetProperty("amount", out var amount) || !amount.TryGetDecimal(out var amountValue) || amountValue < 0)
                throw new InvalidOperationException("Fatura vergi anlık görüntüsündeki satır geçersiz.");
            rows.Add(new AccountingTaxBreakdownLine(code.GetString()!, name.GetString()!, rateValue,
                treatment.GetString()!, calculationBase.GetString()!, taxableAmountValue, amountValue));
        }
        return rows;
    }

    public static IReadOnlyList<AccountingTaxBreakdownLine> CalculateIncrementalReturnBreakdown(string? sourceBreakdownJson,
        decimal sourceQuantity, decimal alreadyReturnedQuantity, decimal returnQuantity, decimal expectedAdditiveTaxAmount,
        decimal expectedWithholdingAmount)
    {
        if (sourceQuantity <= 0 || alreadyReturnedQuantity < 0 || returnQuantity <= 0 || alreadyReturnedQuantity + returnQuantity > sourceQuantity
            || expectedAdditiveTaxAmount < 0 || expectedWithholdingAmount < 0)
            throw new ArgumentOutOfRangeException(nameof(returnQuantity), "Vergi kırılımı için iade miktarları kaynak satır miktarıyla tutarlı olmalıdır.");
        var sourceRows = ReadBreakdown(sourceBreakdownJson);
        var additiveSourceRows = sourceRows.Where(x => x.Treatment != "Withholding").ToArray();
        if (additiveSourceRows.Length == 0 && expectedAdditiveTaxAmount > 0)
        {
            if (expectedWithholdingAmount > 0)
                throw new InvalidOperationException("Kaynak fatura vergi anlık görüntüsünde tevkifat satırı bulunamadı.");
            return [new AccountingTaxBreakdownLine("VAT", "KDV / VAT", 0, "Additive", "Net", 0, expectedAdditiveTaxAmount)];
        }

        decimal Increment(decimal amount)
        {
            var before = alreadyReturnedQuantity == 0 ? 0m : alreadyReturnedQuantity == sourceQuantity
                ? amount : decimal.Round(amount * alreadyReturnedQuantity / sourceQuantity, 2, MidpointRounding.AwayFromZero);
            var cumulativeQuantity = alreadyReturnedQuantity + returnQuantity;
            var after = cumulativeQuantity == sourceQuantity ? amount
                : decimal.Round(amount * cumulativeQuantity / sourceQuantity, 2, MidpointRounding.AwayFromZero);
            return after - before;
        }

        var rows = sourceRows.Select(row => row with
        {
            TaxableAmount = Increment(row.TaxableAmount),
            Amount = Increment(row.Amount)
        }).ToArray();
        var additiveTotal = rows.Where(x => x.Treatment != "Withholding").Sum(x => x.Amount);
        var residual = expectedAdditiveTaxAmount - additiveTotal;
        if (residual != 0)
        {
            var targetIndex = Array.FindIndex(rows, x => x.Treatment != "Withholding");
            if (targetIndex < 0 || rows[targetIndex].Amount + residual < 0)
                throw new InvalidOperationException("Kaynak faturanın vergi kırılımı iade vergileriyle tutarlı değil.");
            rows[targetIndex] = rows[targetIndex] with { Amount = rows[targetIndex].Amount + residual };
        }
        var withholdingTotal = rows.Where(x => x.Treatment == "Withholding").Sum(x => x.Amount);
        var withholdingResidual = expectedWithholdingAmount - withholdingTotal;
        if (withholdingResidual != 0)
        {
            var targetIndex = Array.FindIndex(rows, x => x.Treatment == "Withholding");
            if (targetIndex < 0 || rows[targetIndex].Amount + withholdingResidual < 0)
                throw new InvalidOperationException("Kaynak faturanın tevkifat kırılımı iade tevkifatıyla tutarlı değil.");
            rows[targetIndex] = rows[targetIndex] with { Amount = rows[targetIndex].Amount + withholdingResidual };
        }
        return rows;
    }

    public static AccountingTaxAssessment Calculate(AccountingRuleProfile? profile, decimal taxableAmount,
        decimal vatPercent, DateOnly documentDate, string operationType)
    {
        var vatAmount = decimal.Round(taxableAmount * vatPercent / 100m, 2, MidpointRounding.AwayFromZero);
        var lines = new List<AccountingTaxBreakdownLine>
        {
            new("VAT", "KDV", vatPercent, "Additive", "Net", taxableAmount, vatAmount)
        };
        var due = taxableAmount + vatAmount;
        var additive = 0m;
        var withholding = 0m;
        foreach (var rule in ReadRules(profile).Where(x => x.Active && (x.OperationType == "Both" || x.OperationType == operationType) &&
                     (x.EffectiveFrom is null || x.EffectiveFrom <= documentDate) &&
                     (x.EffectiveTo is null || x.EffectiveTo >= documentDate)))
        {
            // KDV remains sourced from the item/order line, where separate purchase and sales rates are maintained.
            if (rule.Code is "VAT" or "KDV") continue;
            var basis = rule.CalculationBase == "PreviousTaxInclusive" ? due : taxableAmount;
            var amount = decimal.Round(basis * rule.Rate / 100m, 2, MidpointRounding.AwayFromZero);
            if (basis > MaxAmount || amount > MaxAmount) throw new OverflowException("Vergi tutarı decimal(18,2) sınırını aşıyor.");
            lines.Add(new AccountingTaxBreakdownLine(rule.Code, rule.Name, rule.Rate, rule.Treatment,
                rule.CalculationBase, basis, amount));
            if (rule.Treatment == "Withholding") withholding += amount;
            else { additive += amount; due += amount; }
            if (due > MaxAmount || additive > MaxAmount || withholding > MaxAmount) throw new OverflowException("Vergi toplamı decimal(18,2) sınırını aşıyor.");
        }
        var taxTotal = vatAmount + additive;
        var grandTotal = taxableAmount + taxTotal - withholding;
        if (taxTotal > MaxAmount || grandTotal > MaxAmount) throw new OverflowException("Fatura satır toplamı decimal(18,2) sınırını aşıyor.");
        return new AccountingTaxAssessment(profile?.ProfileCode ?? "", taxTotal, grandTotal,
            JsonSerializer.Serialize(lines, JsonOptions));
    }

    private static IReadOnlyList<TaxRule> ReadRules(AccountingRuleProfile? profile)
    {
        if (profile is null) return [];
        using var document = JsonDocument.Parse(profile.ParametersJson);
        if (!document.RootElement.TryGetProperty("taxRules", out var rules) || rules.ValueKind != JsonValueKind.Array) return [];
        return rules.EnumerateArray().Select(item => new TaxRule(
            item.GetProperty("code").GetString()!.Trim().ToUpperInvariant(),
            item.GetProperty("name").GetString()!.Trim(),
            item.GetProperty("rate").GetDecimal(),
            item.TryGetProperty("operationType", out var operation) ? operation.GetString() ?? "Both" : "Both",
            item.TryGetProperty("treatment", out var treatment) ? treatment.GetString() ?? "Additive" : "Additive",
            item.TryGetProperty("calculationBase", out var calculationBase) ? calculationBase.GetString() ?? "Net" : "Net",
            !item.TryGetProperty("active", out var active) || active.ValueKind == JsonValueKind.True,
            ReadDate(item, "effectiveFrom"), ReadDate(item, "effectiveTo"))).ToArray();
    }

    private static DateOnly? ReadDate(JsonElement item, string key) =>
        item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String &&
        DateOnly.TryParse(value.GetString(), out var date) ? date : null;

    private sealed record TaxRule(string Code, string Name, decimal Rate, string OperationType,
        string Treatment, string CalculationBase, bool Active, DateOnly? EffectiveFrom, DateOnly? EffectiveTo);
}
