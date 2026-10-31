using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static partial class HumanResourcesEndpoints
{
    public static void MapPayrollVoucherDraftEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/hr/payroll/runs").WithTags("İnsan Kaynakları").RequireAuthorization();
        group.MapPost("/{id:guid}/calculations/{calculationId:guid}/post-voucher", async (
            Guid id, Guid calculationId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!Guid.TryParse(user.FindFirstValue("tenant_id"), out var tenantId) ||
                !Guid.TryParse(user.FindFirstValue("sub"), out var userId)) return Results.Forbid();
            if (!string.Equals(user.FindFirstValue("role"), "TenantAdmin", StringComparison.Ordinal)) return Results.Forbid();

            const string sourceType = "PayrollCalculation";
            var run = await db.PayrollRunSnapshots.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var calculation = await db.PayrollRunCalculations.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || calculation is null) return Results.NotFound();
            var prior = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == calculationId, ct);
            if (prior is not null) return Results.Ok(ToPostedVoucherView(prior));
            if (calculation.Status != "Finalized")
                return Results.Conflict(new { error = "Yevmiye kaydı için bordro hesabı önce ikinci yetkili onayından geçip kesinleşmelidir." });
            if (calculation.RunSnapshotSha256 != run.SnapshotSha256 ||
                !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) ||
                !PayrollSnapshotHashMatches(calculation.ResultJson, calculation.ResultSha256))
                return Results.Conflict(new { error = "Bordro girdisi veya sonuç özeti doğrulanamadı." });

            PayrollFormulaResultEnvelope? envelope;
            try { envelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(calculation.ResultJson); }
            catch (JsonException) { envelope = null; }
            if (envelope is null || envelope.RunId != run.Id || envelope.RunSnapshotSha256 != run.SnapshotSha256 ||
                envelope.IsOfficialPayrollResult || envelope.Employees.Count == 0)
                return Results.Conflict(new { error = "Deftere aktarılabilir, doğrulanmış bir iç bordro sonucu bulunamadı." });

            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(ct)
                : null;
            if (!await FiscalYearCloseEndpoints.LockTenantForPostingAsync(db, tenantId, ct)) return Results.NotFound();
            prior = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == calculationId, ct);
            if (prior is not null)
            {
                if (transaction is not null) await transaction.CommitAsync(ct);
                return Results.Ok(ToPostedVoucherView(prior));
            }

            var closedPeriod = await FiscalYearCloseEndpoints.FindClosedPeriodAsync(db, tenantId, run.PeriodEnd, ct);
            if (closedPeriod is { } closed)
                return Results.Conflict(new { error = $"{closed.FromDate:yyyy-MM-dd}–{closed.ToDate:yyyy-MM-dd} dönemi kapalı; bordro yevmiyesi kaydedilmedi." });

            var accounts = await db.LedgerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
                .ToDictionaryAsync(x => x.Code, StringComparer.OrdinalIgnoreCase, ct);
            var mappedNetPayId = await db.LedgerAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.MappingKey == LedgerMappingKeys.PayrollNetPayPayable)
                .Select(x => (Guid?)x.AccountId).SingleOrDefaultAsync(ct);
            var netPayAccount = mappedNetPayId is { } netPayId
                ? await db.LedgerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == netPayId && x.IsActive, ct)
                : null;
            if (netPayAccount is null || netPayAccount.StatementSection != LedgerAccountStatementSection.Liability)
                return Results.Conflict(new { error = "Aktif borç hesabı sınıfındaki net ücret ödeme borcu eşlemesi eksik." });

            var journalEntryId = Guid.NewGuid();
            var lines = new List<JournalEntryLine>();
            decimal debits = 0m, credits = 0m;
            foreach (var employee in envelope.Employees)
            {
                if (employee.Components.Any(x => x.Amount < 0m || x.Amount > 1_000_000_000_000m || x.Unit != "TRY"))
                    return Results.Conflict(new { error = "Bordro satırlarında geçersiz tutar veya TRY dışı birim var." });
                var earnings = employee.Components.Where(x => x.Category == "earning").ToArray();
                var deductions = employee.Components.Where(x => x.Category == "deduction").ToArray();
                var employerCosts = employee.Components.Where(x => x.Category == "employerCost").ToArray();
                var gross = Money(earnings.Sum(x => x.Amount));
                var withheld = Money(deductions.Sum(x => x.Amount));
                var net = Money(gross - withheld);
                if (Money(employee.GrossEarnings) != gross || Money(employee.EmployeeDeductions) != withheld ||
                    Money(employee.NetPay) != net || net < 0m)
                    return Results.Conflict(new { error = "Çalışan brüt, kesinti ve net tutarları bordro kalemleriyle mutabık değil." });

                foreach (var component in earnings)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Expense, out var account))
                        return Results.Conflict(new { error = $"'{component.Label}' kazanç kalemi için etkin gider hesabı eşlemesi eksik veya geçersiz." });
                    Add(account, employee.PersonnelCode, component.Label, Money(component.Amount), 0m);
                }
                foreach (var component in deductions)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Liability, out var account))
                        return Results.Conflict(new { error = $"'{component.Label}' çalışan kesintisi için etkin borç hesabı eşlemesi eksik veya geçersiz." });
                    Add(account, employee.PersonnelCode, component.Label, 0m, Money(component.Amount));
                }
                foreach (var component in employerCosts)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Expense, out var expense) ||
                        !TryMappedAccount(component, "employerLiabilityAccount", LedgerAccountStatementSection.Liability, out var liability))
                        return Results.Conflict(new { error = $"'{component.Label}' işveren maliyeti için etkin gider ve borç hesabı eşlemeleri eksik veya geçersiz." });
                    Add(expense, employee.PersonnelCode, component.Label + " · işveren gideri", Money(component.Amount), 0m);
                    Add(liability, employee.PersonnelCode, component.Label + " · işveren borcu", 0m, Money(component.Amount));
                }
                Add(netPayAccount, employee.PersonnelCode, "Net ücret ödeme borcu", 0m, net);
            }

            if (debits <= 0m || debits != credits)
                return Results.Conflict(new { error = $"Bordro fişi dengelenmedi (borç {debits:N2}, alacak {credits:N2}); hesap eşlemelerini ve formül kalemlerini inceleyin." });

            var entry = new JournalEntry
            {
                Id = journalEntryId,
                TenantId = tenantId,
                Code = $"PAY-{calculation.Id:N}",
                EntryDate = run.PeriodEnd,
                Description = $"İç bordro yevmiyesi · {run.PeriodStart:yyyy-MM}",
                SourceType = sourceType,
                SourceId = calculation.Id,
                CreatedByUserId = userId,
                Lines = lines
            };
            db.JournalEntries.Add(entry);
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.accounting-voucher-posted",
                Resource = $"{run.Id:D}/{calculation.Id:D}/{calculation.ResultSha256}/{entry.Id:D}"
            });
            try
            {
                await db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);
            }
            catch (DbUpdateException)
            {
                if (transaction is not null) await transaction.RollbackAsync(ct);
                var raced = await db.JournalEntries.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.SourceType == sourceType && x.SourceId == calculationId, ct);
                if (raced is not null) return Results.Ok(ToPostedVoucherView(raced));
                throw;
            }
            return Results.Created($"/api/finance/general-ledger/entries/{entry.Id:D}", ToPostedVoucherView(entry, idempotent: false));

            bool TryMappedAccount(PayrollFormulaComponentResult component, string mappingType,
                LedgerAccountStatementSection section, out LedgerAccount account)
            {
                account = null!;
                return component.MappingCodes.TryGetValue(mappingType, out var code) &&
                    !string.IsNullOrWhiteSpace(code) && !StringComparer.OrdinalIgnoreCase.Equals(code, "EXCLUDED") &&
                    accounts.TryGetValue(code, out account!) && account.StatementSection == section;
            }

            void Add(LedgerAccount account, string personnelCode, string description, decimal debit, decimal credit)
            {
                if (debit == 0m && credit == 0m) return;
                debits += debit;
                credits += credit;
                lines.Add(new JournalEntryLine
                {
                    TenantId = tenantId, JournalEntryId = journalEntryId, AccountId = account.Id,
                    LineNumber = lines.Count + 1, Description = $"{personnelCode} · {description}"[..Math.Min(240, personnelCode.Length + description.Length + 3)],
                    Debit = debit, Credit = credit
                });
            }
        });

        group.MapGet("/{id:guid}/calculations/{calculationId:guid}/voucher-draft", async (
            Guid id, Guid calculationId, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();

            var run = await db.PayrollRunSnapshots.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var calculation = await db.PayrollRunCalculations.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || calculation is null) return Results.NotFound();
            if (calculation.Status != "Finalized")
                return Results.Conflict(new { error = "Yevmiye taslağı yalnızca iç sonucu kesinleştirilmiş bordro hesabından üretilebilir." });
            if (calculation.RunSnapshotSha256 != run.SnapshotSha256 ||
                !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) ||
                !PayrollSnapshotHashMatches(calculation.ResultJson, calculation.ResultSha256))
                return Results.Conflict(new { error = "Bordro girdisi veya sonuç özeti doğrulanamadı." });

            PayrollFormulaResultEnvelope? envelope;
            try { envelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(calculation.ResultJson); }
            catch (JsonException) { envelope = null; }
            if (envelope is null || envelope.RunId != run.Id || envelope.RunSnapshotSha256 != run.SnapshotSha256 ||
                envelope.IsOfficialPayrollResult || envelope.Employees.Count == 0)
                return Results.Conflict(new { error = "Doğrulanmış, resmi olmayan iç bordro sonucu bulunamadı." });

            var mapping = await db.LedgerAccountMappings.AsNoTracking()
                .Where(x => x.TenantId == tenantId)
                .Select(x => new { x.MappingKey, Account = db.LedgerAccounts.Where(a => a.TenantId == tenantId && a.Id == x.AccountId && a.IsActive).FirstOrDefault() })
                .ToListAsync(ct);
            var activeAccounts = await db.LedgerAccounts.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive)
                .ToDictionaryAsync(x => x.Code, StringComparer.OrdinalIgnoreCase, ct);
            var netPayCode = mapping.FirstOrDefault(x => x.MappingKey == LedgerMappingKeys.PayrollNetPayPayable)?.Account?.Code;
            if (string.IsNullOrWhiteSpace(netPayCode) || !activeAccounts.TryGetValue(netPayCode, out var netPayAccount) ||
                netPayAccount.StatementSection != LedgerAccountStatementSection.Liability)
                return Results.Conflict(new { error = "Firma ayarlarında aktif ve borç hesabı sınıfındaki net ücret ödeme borcu hesabını eşleyin." });

            static string Csv(string value) => "\"" + value.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
            static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
            var lines = new List<string>
            {
                "Status,Date,EmployeeCode,EmployeeName,Description,AccountCode,Debit,Credit,Currency,Notice",
                "DRAFT,,,,,,,,,\"Taslak dosya; resmi bordro değildir ve yevmiyeye kaydedilmez.\""
            };
            decimal debits = 0m, credits = 0m;
            foreach (var employee in envelope.Employees)
            {
                if (employee.Components.Any(x => x.Amount < 0m || x.Amount > 1_000_000_000_000m || x.Unit != "TRY"))
                    return Results.Conflict(new { error = "Bordro satırlarında geçersiz tutar veya TRY dışı birim var." });
                var earnings = employee.Components.Where(x => x.Category == "earning").ToArray();
                var deductions = employee.Components.Where(x => x.Category == "deduction").ToArray();
                var employerCosts = employee.Components.Where(x => x.Category == "employerCost").ToArray();
                var expectedGross = Money(earnings.Sum(x => x.Amount));
                var expectedDeductions = Money(deductions.Sum(x => x.Amount));
                var expectedNet = Money(expectedGross - expectedDeductions);
                if (Money(employee.GrossEarnings) != expectedGross || Money(employee.EmployeeDeductions) != expectedDeductions ||
                    Money(employee.NetPay) != expectedNet || expectedNet < 0m)
                    return Results.Conflict(new { error = "Çalışan brüt, kesinti ve net tutarları bordro satırlarıyla mutabık değil." });

                foreach (var component in earnings)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Expense, out var account))
                        return Results.Conflict(new { error = $"'{component.Label}' kazanç kalemi için aktif gider hesabı eşlemesi eksik veya geçersiz." });
                    Add(employee.PersonnelCode, employee.FullName, component.Label, account.Code, Money(component.Amount), 0m);
                }
                foreach (var component in deductions)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Liability, out var account))
                        return Results.Conflict(new { error = $"'{component.Label}' çalışan kesintisi için aktif borç hesabı eşlemesi eksik veya geçersiz." });
                    Add(employee.PersonnelCode, employee.FullName, component.Label, account.Code, 0m, Money(component.Amount));
                }
                foreach (var component in employerCosts)
                {
                    if (!TryMappedAccount(component, "accountingAccount", LedgerAccountStatementSection.Expense, out var expense) ||
                        !TryMappedAccount(component, "employerLiabilityAccount", LedgerAccountStatementSection.Liability, out var liability))
                        return Results.Conflict(new { error = $"'{component.Label}' işveren maliyeti için aktif gider ve borç hesabı eşlemeleri eksik veya geçersiz." });
                    Add(employee.PersonnelCode, employee.FullName, component.Label + " · işveren gideri", expense.Code, Money(component.Amount), 0m);
                    Add(employee.PersonnelCode, employee.FullName, component.Label + " · işveren borcu", liability.Code, 0m, Money(component.Amount));
                }
                Add(employee.PersonnelCode, employee.FullName, "Net ücret ödeme borcu", netPayAccount.Code, 0m, expectedNet);
            }

            if (debits <= 0m || debits != credits)
                return Results.Conflict(new { error = $"Taslak fiş dengelenmedi (borç {debits:N2}, alacak {credits:N2}); hesap eşlemelerini ve bileşen kurallarını inceleyin." });

            var csv = "\uFEFF" + string.Join("\r\n", lines) + "\r\n";
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.voucher-draft-generated", Resource = $"{run.Id:D}/{calculation.Id:D}/{calculation.ResultSha256}" });
            await db.SaveChangesAsync(ct);
            return Results.File(Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8",
                $"bordro-yevmiye-taslagi-{run.PeriodStart:yyyy-MM}.csv");

            bool TryMappedAccount(PayrollFormulaComponentResult component, string mappingType,
                LedgerAccountStatementSection section, out LedgerAccount account)
            {
                account = null!;
                return component.MappingCodes.TryGetValue(mappingType, out var code) &&
                    !string.IsNullOrWhiteSpace(code) && !StringComparer.OrdinalIgnoreCase.Equals(code, "EXCLUDED") &&
                    activeAccounts.TryGetValue(code, out account!) && account.StatementSection == section;
            }

            void Add(string employeeCode, string employeeName, string description, string accountCode, decimal debit, decimal credit)
            {
                if (debit == 0m && credit == 0m) return;
                debits += debit;
                credits += credit;
                lines.Add(string.Join(",", new[] { "DRAFT", Csv(run.PeriodEnd.ToString("yyyy-MM-dd")), Csv(employeeCode), Csv(employeeName),
                    Csv(description), Csv(accountCode), debit.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture),
                    credit.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture), Csv("TRY"), "" }));
            }
        });
    }

    private static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static object ToPostedVoucherView(JournalEntry entry, bool idempotent = true) => new
    {
        journalEntryId = entry.Id,
        entry.Code,
        entry.EntryDate,
        entry.Description,
        entry.SourceType,
        entry.SourceId,
        totalDebit = entry.Lines.Sum(x => x.Debit),
        totalCredit = entry.Lines.Sum(x => x.Credit),
        lineCount = entry.Lines.Count,
        idempotent,
        officialPayrollResult = false
    };
}
