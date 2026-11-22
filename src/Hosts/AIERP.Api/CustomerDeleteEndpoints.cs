using System.Linq.Expressions;
using System.Reflection;
using System.Security.Claims;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

/// <summary>
/// <c>DELETE /api/customers/{id}</c>: removes a customer card that has no related records ("Hiç kaydı olmayan silinsin").
/// Only a TenantAdmin deletes; any other card is deactivated instead (Pasife al). Every foreign key in the tenant model
/// that points at <see cref="CustomerAccount"/> blocks the delete (ledger entries, custom field value history, sales and
/// purchase documents, CRM opportunities, contracts, payment instruments, fixed assets, projects, subsidiaries…), so a key
/// added later blocks it as well. The card's own addresses and current custom field values carry no history of their own
/// and are removed with it. The checks are explicit because some keys cascade in SQL (ledger entries, custom field values)
/// and the InMemory test provider enforces none; a SQL foreign key violation (547) still answers 409.
/// </summary>
public static class CustomerDeleteEndpoints
{
    public const string RelatedRecordsError = "İlişkili kayıt bulunan cari kart silinemez; bunun yerine pasife alın.";

    /// <summary>Dependents removed together with the card: they hold no movement or history of their own.</summary>
    private static readonly HashSet<Type> OwnedDependents = [typeof(CustomerAddress), typeof(CustomerCustomFieldValue)];

    private static readonly MethodInfo AnyReferenceMethod = typeof(CustomerDeleteEndpoints)
        .GetMethod(nameof(AnyReferenceAsync), BindingFlags.NonPublic | BindingFlags.Static)!;

    private static readonly MethodInfo PropertyMethod = typeof(EF).GetMethod(nameof(EF.Property))!;

    public static RouteGroupBuilder MapCustomerDeleteEndpoint(this RouteGroupBuilder customers)
    {
        customers.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TenantDbContext db, PlatformDbContext platformDb,
            CancellationToken cancellationToken) =>
        {
            if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
            var userId = TryGetUserId(principal);
            if (userId is null) return Results.Forbid();
            var role = principal.FindFirstValue("role") ?? string.Empty;
            // Row visibility first: a card the caller cannot see is "not found", never "forbidden".
            var visible = db.CustomerAccounts.Where(x => x.TenantId == tenantId && x.Id == id);
            visible = await CustomerCollectionPermissionFilter.ApplyAsync(platformDb, tenantId, userId.Value, role, visible, cancellationToken);
            var customer = await visible.SingleOrDefaultAsync(cancellationToken);
            if (customer is null) return Results.NotFound();
            if (role != "TenantAdmin") return Results.Forbid();
            if (await HasRelatedRecordsAsync(db, tenantId, id, cancellationToken))
                return Results.Conflict(new { error = RelatedRecordsError });

            db.CustomerAddresses.RemoveRange(await db.CustomerAddresses.Where(x => x.TenantId == tenantId && x.CustomerId == id).ToListAsync(cancellationToken));
            db.CustomerCustomFieldValues.RemoveRange(await db.CustomerCustomFieldValues.Where(x => x.TenantId == tenantId && x.CustomerId == id).ToListAsync(cancellationToken));
            db.CustomerAccounts.Remove(customer);
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = userId, Action = "customer.deleted",
                Resource = AuditResourceSanitizer.Sanitize($"{customer.Code} {customer.Name}")
            });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 547 })
            { return Results.Conflict(new { error = RelatedRecordsError }); }
            catch (DbUpdateConcurrencyException)
            { return Results.Conflict(new { error = "Cari kart başka bir işlemle değişti; listeyi yenileyip tekrar deneyin." }); }
            return Results.NoContent();
        });
        return customers;
    }

    /// <summary>
    /// The foreign keys that point at a customer card and block its delete: every key in the model whose principal is
    /// <see cref="CustomerAccount"/>, except the card's own addresses and current custom field values.
    /// </summary>
    internal static IReadOnlyList<IForeignKey> BlockingForeignKeys(DbContext db)
    {
        var principal = db.Model.FindEntityType(typeof(CustomerAccount))
            ?? throw new InvalidOperationException("CustomerAccount is not mapped.");
        return principal.GetReferencingForeignKeys()
            .Where(fk => !OwnedDependents.Contains(fk.DeclaringEntityType.ClrType) && !fk.DeclaringEntityType.IsOwned())
            .OrderBy(fk => fk.DeclaringEntityType.Name, StringComparer.Ordinal).ToArray();
    }

    internal static async Task<bool> HasRelatedRecordsAsync(DbContext db, Guid tenantId, Guid id, CancellationToken cancellationToken)
    {
        var principalValues = new Dictionary<string, Guid>(StringComparer.Ordinal) { ["TenantId"] = tenantId, ["Id"] = id };
        foreach (var fk in BlockingForeignKeys(db))
        {
            var filters = new List<(string Property, Type Type, Guid Value)>();
            for (var index = 0; index < fk.Properties.Count; index++)
            {
                var principalName = fk.PrincipalKey.Properties[index].Name;
                if (!principalValues.TryGetValue(principalName, out var value))
                    throw new InvalidOperationException($"Unexpected principal key '{principalName}' on {fk.DeclaringEntityType.Name}.");
                filters.Add((fk.Properties[index].Name, fk.Properties[index].ClrType, value));
            }
            var task = (Task<bool>)AnyReferenceMethod.MakeGenericMethod(fk.DeclaringEntityType.ClrType)
                .Invoke(null, [db, filters, cancellationToken])!;
            if (await task) return true;
        }
        return false;
    }

    private static Task<bool> AnyReferenceAsync<TEntity>(DbContext db, List<(string Property, Type Type, Guid Value)> filters,
        CancellationToken cancellationToken) where TEntity : class
    {
        var row = Expression.Parameter(typeof(TEntity), "row");
        Expression? body = null;
        foreach (var (property, type, value) in filters)
        {
            var column = Expression.Call(PropertyMethod.MakeGenericMethod(type), row, Expression.Constant(property));
            var equals = Expression.Equal(column, Expression.Convert(Expression.Constant(value), type));
            body = body is null ? equals : Expression.AndAlso(body, equals);
        }
        return db.Set<TEntity>().AsNoTracking().AnyAsync(Expression.Lambda<Func<TEntity, bool>>(body!, row), cancellationToken);
    }

    private static Guid? TryGetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) && userId != Guid.Empty
            ? userId
            : Guid.TryParse(principal.FindFirstValue("sub"), out userId) && userId != Guid.Empty ? userId : null;
}
