using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class SalesInvoiceCustomFieldSupport
{
    internal sealed record PreparedField(SalesInvoiceCustomFieldDefinition Definition, string Value);
    internal sealed record Preparation(IReadOnlyList<PreparedField> Values, Dictionary<string, string[]> Errors);

    internal static async Task<Preparation> PrepareAsync(TenantDbContext db, Guid tenantId,
        IReadOnlyDictionary<string, string?>? inputs, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (inputs is { Count: > 40 })
        {
            errors["customFields"] = ["En fazla 40 fatura özel alanı gönderilebilir."];
            return new([], errors);
        }

        var definitions = db.Database.IsSqlServer()
            ? await db.SalesInvoiceCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoiceCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync(cancellationToken)
            : await db.SalesInvoiceCustomFieldDefinitions.Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(cancellationToken);
        var normalized = new Dictionary<Guid, PreparedField>();
        if (inputs is not null)
        {
            foreach (var pair in inputs)
            {
                var definition = definitions.FirstOrDefault(x => string.Equals(x.Code, pair.Key, StringComparison.OrdinalIgnoreCase));
                if (definition is null)
                {
                    errors[$"customFields.{pair.Key}"] = ["Alan kodu tenant içinde etkin değil."];
                    continue;
                }
                if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, pair.Value, out var value))
                {
                    errors[$"customFields.{pair.Key}"] = [$"'{definition.Label}' alanı veri türü veya uzunluk sınırına uymuyor."];
                    continue;
                }
                if (value.Length > 0) normalized[definition.Id] = new(definition, value);
            }
        }
        foreach (var definition in definitions.Where(x => x.IsRequired && !normalized.ContainsKey(x.Id)))
            errors[$"customFields.{definition.Code}"] = [$"'{definition.Label}' alanı zorunludur."];
        return new(normalized.Values.ToArray(), errors);
    }

    internal static void AddValues(TenantDbContext db, Guid tenantId, Guid invoiceId,
        IReadOnlyList<PreparedField> values, Guid? userId)
    {
        foreach (var field in values)
        {
            db.SalesInvoiceCustomFieldValues.Add(new SalesInvoiceCustomFieldValue
            {
                TenantId = tenantId,
                InvoiceId = invoiceId,
                DefinitionId = field.Definition.Id,
                Value = field.Value,
                DefinitionVersion = field.Definition.Version
            });
            db.SalesInvoiceCustomFieldValueRevisions.Add(new SalesInvoiceCustomFieldValueRevision
            {
                TenantId = tenantId,
                InvoiceId = invoiceId,
                DefinitionId = field.Definition.Id,
                NewValue = field.Value,
                DefinitionVersion = field.Definition.Version,
                ChangedByUserId = userId
            });
        }
    }
}
