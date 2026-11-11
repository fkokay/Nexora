using System.Text.Json;

namespace AIERP.IntegrationSDK;

/// <summary>Explicit per-tenant values needed to build a basic Trendyol e-invoice wire body.</summary>
public sealed record TrendyolEInvoiceMappingProfile(
    long CompanyId,
    long UserId,
    string Source,
    bool AutoInvoiceId,
    IReadOnlyDictionary<string, string> UnitCodeMappings);

/// <summary>
/// Builds a basic standard-sale body only. This does not send it, establish provider idempotency,
/// or authorize an account/profile; special tax scenarios require a separate approved mapper.
/// </summary>
public static class TrendyolEInvoiceWirePayloadBuilder
{
    private static readonly HashSet<string> Sources = new(StringComparer.Ordinal) { "PORTAL", "WEB", "MOBILE", "PARTNER" };

    public static JsonElement Build(EDocumentSubmissionRequest request, TrendyolEInvoiceMappingProfile profile, Guid invoiceUuid)
    {
        if (request.DocumentType is not ("e-invoice" or "e-archive"))
            throw new InvalidOperationException("Only outgoing e-invoice and e-archive documents are supported.");
        if (invoiceUuid == Guid.Empty || profile.CompanyId <= 0 || profile.UserId <= 0 || !Sources.Contains(profile.Source) || !profile.AutoInvoiceId)
            throw new InvalidOperationException("A valid tenant mapping profile with automatic provider invoice numbering is required.");
        var readiness = EDocumentSubmissionRules.Validate(request).Concat(TrendyolEInvoiceReadinessRules.Validate(request)).ToArray();
        if (readiness.Length > 0) throw new InvalidOperationException("The source document is not ready for Trendyol mapping.");

        var document = request.Document;
        var customer = document.GetProperty("customer");
        var recipientName = ReadString(customer, "name");
        if (recipientName is null || recipientName.Length is < 2 or > 127)
            throw new InvalidOperationException("A recipient name of at most 127 characters is required.");
        var addresses = customer.GetProperty("addresses").EnumerateArray().Where(IsProviderAddress).ToArray();
        var address = addresses.FirstOrDefault(item => item.TryGetProperty("isDefault", out var isDefault) && isDefault.ValueKind == JsonValueKind.True);
        if (address.ValueKind != JsonValueKind.Object) address = addresses.FirstOrDefault();
        if (address.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("A recipient address is required.");

        var scenario = ReadString(document, "eDocumentScenario");
        var typeCode = ReadString(document, "eDocumentTypeCode");
        if (scenario is not ("EARSIVFATURA" or "TEMELFATURA" or "TICARIFATURA") || typeCode != "SATIS")
            throw new InvalidOperationException("Only standard sales invoice scenarios are mapped.");

        var lines = document.GetProperty("lines").EnumerateArray().Select(line => MapLine(line, profile.UnitCodeMappings)).ToArray();
        var subtotal = Cents(ReadDecimal(document, "subtotal"));
        var discount = Cents(ReadDecimal(document, "discountTotal"));
        var tax = Cents(ReadDecimal(document, "taxTotal"));
        var total = Cents(ReadDecimal(document, "grandTotal"));
        var net = checked(subtotal - discount);
        if (net <= 0 || total != checked(net + tax)) throw new InvalidOperationException("Invoice totals do not reconcile.");
        var taxGroups = lines.GroupBy(line => line.TaxPercent).Select(group => new
        {
            taxableAmount = checked(group.Sum(line => line.TaxableAmount)),
            taxAmount = checked(group.Sum(line => line.TaxAmount)),
            taxType = "KDV",
            percent = group.Key,
            name = "KDV"
        }).ToArray();

        var customerTaxId = ReadString(customer, "taxNumber") ?? ReadString(customer, "identityNumber")
            ?? throw new InvalidOperationException("Recipient tax identity is required.");
        var issuedAt = new DateTimeOffset(new DateTime(request.IssueDate.Year, request.IssueDate.Month,
            request.IssueDate.Day, 0, 0, 0, DateTimeKind.Unspecified), TimeSpan.FromHours(3));
        var payment = document.TryGetProperty("eCommerce", out var eCommerce) &&
            ReadString(eCommerce, "purchaseUrl") is not null ? new
            {
                purchaseUrl = ReadString(eCommerce, "purchaseUrl"),
                paymentAgentName = ReadString(eCommerce, "paymentAgentName"),
                paymentType = ReadString(eCommerce, "paymentType"),
                paymentDate = ReadString(eCommerce, "paymentDate"),
                paymentDueDate = ReadString(eCommerce, "paymentDueDate"),
                paymentMeans = ReadString(eCommerce, "paymentMeans"),
                instructionNote = ReadString(eCommerce, "instructionNote")
            } : null;
        var delivery = document.TryGetProperty("eCommerce", out eCommerce) &&
            ReadString(eCommerce, "carrierTaxId") is not null ? new
            {
                carrierTaxId = ReadString(eCommerce, "carrierTaxId"),
                carrierName = ReadString(eCommerce, "carrierName"),
                carrierSurname = ReadString(eCommerce, "carrierSurname"),
                sentAt = ReadString(eCommerce, "sentAt")
            } : null;
        var intermediary = scenario == "YOLCUBERABERFATURA" && document.TryGetProperty("intermediaryInfo", out var intermediaryInfo)
            ? new
            {
                taxId = ReadString(intermediaryInfo, "taxId"), title = ReadString(intermediaryInfo, "title"),
                alias = ReadString(intermediaryInfo, "alias"), country = ReadString(intermediaryInfo, "country"),
                countryCode = ReadString(intermediaryInfo, "countryCode"), city = ReadString(intermediaryInfo, "city"),
                district = ReadString(intermediaryInfo, "district")
            } : null;

        return JsonSerializer.SerializeToElement(new
        {
            autoInvoiceId = profile.AutoInvoiceId,
            companyId = profile.CompanyId,
            userId = profile.UserId,
            source = profile.Source,
            localReferenceId = request.DocumentId.ToString("D"),
            issuedAt,
            recipientInfo = new
            {
                taxId = customerTaxId,
                countryCode = ReadString(address, "countryCode"),
                city = ReadString(address, "city"),
                district = ReadString(address, "district"),
                address = ReadString(address, "addressLine"),
                postalCode = ReadString(address, "postalCode"),
                name = recipientName
            },
            currencyInfo = new { currency = request.CurrencyCode, hasExchange = false },
            invoiceInfo = new { invoiceType = scenario, invoiceTypeCode = typeCode, invoiceUuid },
            invoiceLines = lines.Select(line => new
            {
                unitCode = line.UnitCode, quantity = line.Quantity, totalAmount = line.TotalAmount, taxAmount = line.TaxAmount,
                taxableAmount = line.TaxableAmount, taxPercent = line.TaxPercent, taxName = "KDV",
                itemName = line.ItemName, unitPriceAmount = line.UnitPriceAmount,
                totalDiscountAmount = line.DiscountAmount,
                totalTax = new { totalTaxAmount = line.TaxAmount, subTotalTaxes = new[] { new
                { taxableAmount = line.TaxableAmount, taxAmount = line.TaxAmount, taxType = "KDV", percent = line.TaxPercent, name = "KDV" } } }
            }),
            totalTax = new { totalTaxAmount = tax, subTotalTaxes = taxGroups },
            invoiceTotal = new { lineExtensionAmount = net, taxExclusiveAmount = net, taxInclusiveAmount = total, payableAmount = total, allowanceTotalAmount = discount },
            targetAlias = ReadString(document, "recipientAlias"),
            paymentInfo = payment,
            deliveryInfo = delivery,
            intermediaryInfo = intermediary
        });
    }

    private static MappedLine MapLine(JsonElement line, IReadOnlyDictionary<string, string> unitMappings)
    {
        var unit = ReadString(line, "unitCode") ?? throw new InvalidOperationException("A source unit code is required.");
        if (!unitMappings.TryGetValue(unit, out var providerUnit) || !TrendyolEInvoiceReadinessRules.IsSupportedUnitCode(providerUnit))
            throw new InvalidOperationException("An explicit supported Trendyol unit-code mapping is required.");
        var subtotal = Cents(ReadDecimal(line, "lineSubtotal"));
        var discount = Cents(ReadDecimal(line, "discountAmount"));
        var tax = Cents(ReadDecimal(line, "taxAmount"));
        var total = Cents(ReadDecimal(line, "lineTotal"));
        var taxable = checked(subtotal - discount);
        var taxPercent = ReadDecimal(line, "vatPercent");
        if (taxable <= 0 || taxPercent <= 0 || taxPercent != decimal.Truncate(taxPercent) || taxPercent > int.MaxValue ||
            total != checked(taxable + tax))
            throw new InvalidOperationException("Only standard positive-rate KDV invoice lines can be mapped.");
        return new MappedLine(providerUnit, ReadDecimal(line, "quantity"), total, tax, taxable,
            decimal.ToInt32(taxPercent), ReadString(line, "stockName") ?? throw new InvalidOperationException("A line description is required."),
            Cents(ReadDecimal(line, "unitPrice")), discount);
    }

    private static int Cents(decimal amount)
    {
        var cents = checked(amount * 100m);
        if (cents != decimal.Truncate(cents) || cents is < int.MinValue or > int.MaxValue)
            throw new InvalidOperationException("The provider requires an exact whole-cent amount within its supported range.");
        return decimal.ToInt32(cents);
    }

    private static string? ReadString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim() is { Length: > 0 } text ? text : null : null;

    private static bool IsProviderAddress(JsonElement address)
    {
        var line = ReadString(address, "addressLine");
        var city = ReadString(address, "city");
        var country = ReadString(address, "countryCode");
        var postalCode = ReadString(address, "postalCode");
        var district = ReadString(address, "district");
        return line is { Length: >= 2 and <= 255 } && city is { Length: >= 2 and <= 255 } &&
            country is { Length: >= 2 and <= 3 } && (postalCode is null || postalCode.Length == 5) &&
            (district is null || district.Length <= 255);
    }

    private static decimal ReadDecimal(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number)
            ? number : throw new InvalidOperationException($"Required numeric source field '{name}' is missing.");

    private sealed record MappedLine(string UnitCode, decimal Quantity, int TotalAmount, int TaxAmount,
        int TaxableAmount, int TaxPercent, string ItemName, int UnitPriceAmount, int DiscountAmount);
}
