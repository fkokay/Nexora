using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Personal agenda entries for the ERP home launcher. Every query is scoped to the
/// verified tenant claim and to the signed-in user; users never see each other's entries.
/// </summary>
public static class AgendaEndpoints
{
    private const int TitleMaxLength = 160;
    private const int NotesMaxLength = 1000;
    private const int MaximumRangeDays = 92;
    private const int MaximumItems = 200;

    public static void MapAgendaEndpoints(this WebApplication app)
    {
        var agenda = app.MapGroup("/api/agenda").WithTags("Ajanda").RequireAuthorization();

        agenda.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, DateTimeOffset? from, DateTimeOffset? to,
            CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var rangeStart = (from ?? DateTimeOffset.UtcNow.Date).ToUniversalTime();
            var rangeEnd = (to ?? rangeStart.AddDays(7)).ToUniversalTime();
            if (rangeEnd <= rangeStart || rangeEnd - rangeStart > TimeSpan.FromDays(MaximumRangeDays))
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["range"] = [$"Tarih aralığı geçersiz; bitiş başlangıçtan sonra ve en fazla {MaximumRangeDays} gün olmalıdır."]
                });

            var items = await db.AgendaItems.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.UserId == userId && x.StartsAt >= rangeStart && x.StartsAt < rangeEnd)
                .OrderBy(x => x.StartsAt).ThenBy(x => x.CreatedAt)
                .Take(MaximumItems)
                .Select(x => new AgendaItemView(x.Id, x.Title, x.StartsAt, x.Notes, x.IsCompleted, x.CompletedAt, x.CreatedAt, x.UpdatedAt))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        agenda.MapPost("/", async (AgendaItemCreateRequest body, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var title = body.Title?.Trim();
            var notes = string.IsNullOrWhiteSpace(body.Notes) ? null : body.Notes.Trim();
            var errors = new Dictionary<string, string[]>();
            if (string.IsNullOrEmpty(title)) errors["title"] = ["Başlık zorunludur."];
            else if (title.Length > TitleMaxLength) errors["title"] = [$"Başlık en fazla {TitleMaxLength} karakter olabilir."];
            if (body.StartsAt is null || body.StartsAt == default) errors["startsAt"] = ["Tarih ve saat zorunludur."];
            if (notes is not null && notes.Length > NotesMaxLength) errors["notes"] = [$"Not en fazla {NotesMaxLength} karakter olabilir."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var now = DateTimeOffset.UtcNow;
            var item = new AgendaItem
            {
                TenantId = tenantId, UserId = userId, Title = title!, StartsAt = body.StartsAt!.Value.ToUniversalTime(),
                Notes = notes, CreatedAt = now, UpdatedAt = now
            };
            db.AgendaItems.Add(item);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.agenda-item.created", Resource = item.Id.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/agenda/{item.Id}", ToView(item));
        });

        agenda.MapPatch("/{id:guid}/completion", async (Guid id, AgendaItemCompletionRequest body, ClaimsPrincipal user,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var item = await db.AgendaItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            if (item.IsCompleted != body.IsCompleted)
            {
                var now = DateTimeOffset.UtcNow;
                item.IsCompleted = body.IsCompleted;
                item.CompletedAt = body.IsCompleted ? now : null;
                item.UpdatedAt = now;
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                    Action = body.IsCompleted ? "erp.agenda-item.completed" : "erp.agenda-item.reopened", Resource = item.Id.ToString() });
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(ToView(item));
        });

        agenda.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var item = await db.AgendaItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId && x.Id == id, ct);
            if (item is null) return Results.NotFound();
            db.AgendaItems.Remove(item);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "erp.agenda-item.deleted", Resource = item.Id.ToString() });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static AgendaItemView ToView(AgendaItem x) =>
        new(x.Id, x.Title, x.StartsAt, x.Notes, x.IsCompleted, x.CompletedAt, x.CreatedAt, x.UpdatedAt);

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var tenantValid = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var userClaim = user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
        var userValid = Guid.TryParse(userClaim, out userId);
        return tenantValid && userValid;
    }
}

public sealed record AgendaItemCreateRequest(string? Title, DateTimeOffset? StartsAt, string? Notes);
public sealed record AgendaItemCompletionRequest(bool IsCompleted);
public sealed record AgendaItemView(Guid Id, string Title, DateTimeOffset StartsAt, string? Notes, bool IsCompleted,
    DateTimeOffset? CompletedAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
