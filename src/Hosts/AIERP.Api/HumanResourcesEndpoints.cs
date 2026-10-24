using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static partial class HumanResourcesEndpoints
{
    public static void MapHumanResourcesEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/hr").WithTags("İnsan Kaynakları").RequireAuthorization();
        var employees = group.MapGroup("/employees");
        var leaves = group.MapGroup("/leave-requests");
        var attendance = group.MapGroup("/attendance");
        var payrollRules = group.MapGroup("/payroll/rule-sets");

        group.MapGet("/period-summary", async (DateOnly? from, DateOnly? to, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (!TryValidateReportPeriod(from, to, out var periodError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["period"] = [periodError!] });

            var summary = await BuildPeriodSummary(tenantId, from!.Value, to!.Value, db, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.period-summary.viewed", Resource = $"{from:yyyy-MM-dd}/{to:yyyy-MM-dd}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(summary);
        });

        group.MapGet("/period-summary.csv", async (DateOnly? from, DateOnly? to, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (!TryValidateReportPeriod(from, to, out var periodError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["period"] = [periodError!] });

            var summary = await BuildPeriodSummary(tenantId, from!.Value, to!.Value, db, ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.period-summary.exported", Resource = $"{from:yyyy-MM-dd}/{to:yyyy-MM-dd}" });
            await db.SaveChangesAsync(ct);
            return Results.File(BuildSummaryCsv(summary), "text/csv; charset=utf-8", $"hr-summary-{from:yyyyMMdd}-{to:yyyyMMdd}.csv");
        });

        employees.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var admin = IsTenantAdmin(user);
            return Results.Ok(await db.EmployeeRecords.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    (admin || x.UserId == userId)).OrderBy(x => x.PersonnelCode).Take(500)
                .Select(x => new EmployeeView(x.Id, x.PersonnelCode, x.FullName, x.Department, x.JobTitle, x.WorkEmail,
                    x.HireDate, x.TerminationDate, x.Status.ToString(), x.UserId, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct));
        });

        employees.MapPost("/", async (EmployeeWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var validation = ValidateEmployee(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            var code = request.PersonnelCode!.Trim().ToUpperInvariant();
            if (await db.EmployeeRecords.AnyAsync(x => x.TenantId == tenantId && (x.PersonnelCode == code ||
                    request.UserId != null && x.UserId == request.UserId), ct))
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            var employee = new EmployeeRecord { TenantId = tenantId, PersonnelCode = code, FullName = request.FullName!.Trim(),
                Department = Clean(request.Department), JobTitle = Clean(request.JobTitle), WorkEmail = Clean(request.WorkEmail),
                HireDate = request.HireDate, TerminationDate = request.TerminationDate, UserId = request.UserId,
                Status = request.TerminationDate is null ? EmployeeEmploymentStatus.Active : EmployeeEmploymentStatus.Terminated };
            db.EmployeeRecords.Add(employee);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.employee.created", Resource = code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/hr/employees/{employee.Id}", new EmployeeView(employee.Id, employee.PersonnelCode,
                employee.FullName, employee.Department, employee.JobTitle, employee.WorkEmail, employee.HireDate,
                employee.TerminationDate, employee.Status.ToString(), employee.UserId, Convert.ToBase64String(employee.RowVersion)));
        });

        employees.MapPut("/{id:guid}", async (Guid id, EmployeeWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var validation = ValidateEmployee(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (employee is null) return Results.NotFound();
            if (request.RowVersion is null || !TryDecodeRowVersion(request.RowVersion, out var rowVersion))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rowVersion"] = ["Güncel kayıt sürümü zorunludur."] });
            db.Entry(employee).Property(x => x.RowVersion).OriginalValue = rowVersion;
            var code = request.PersonnelCode!.Trim().ToUpperInvariant();
            if (await db.EmployeeRecords.AnyAsync(x => x.TenantId == tenantId && x.Id != id &&
                    (x.PersonnelCode == code || request.UserId != null && x.UserId == request.UserId), ct))
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            employee.PersonnelCode = code; employee.FullName = request.FullName!.Trim(); employee.Department = Clean(request.Department);
            employee.JobTitle = Clean(request.JobTitle); employee.WorkEmail = Clean(request.WorkEmail); employee.HireDate = request.HireDate;
            employee.TerminationDate = request.TerminationDate; employee.UserId = request.UserId;
            employee.Status = request.TerminationDate is null ? EmployeeEmploymentStatus.Active : EmployeeEmploymentStatus.Terminated;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.employee.updated", Resource = employee.PersonnelCode });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Personel kaydı başka bir kullanıcı tarafından değiştirildi; yenileyip tekrar deneyin." }); }
            return Results.Ok(new EmployeeView(employee.Id, employee.PersonnelCode, employee.FullName, employee.Department,
                employee.JobTitle, employee.WorkEmail, employee.HireDate, employee.TerminationDate, employee.Status.ToString(),
                employee.UserId, Convert.ToBase64String(employee.RowVersion)));
        });

        leaves.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var query = db.EmployeeLeaveRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!IsTenantAdmin(user)) query = query.Where(x => db.EmployeeRecords.Any(e => e.TenantId == tenantId && e.Id == x.EmployeeId && e.UserId == userId));
            var rows = await query.OrderByDescending(x => x.CreatedAt).Take(500).Select(x => new LeaveView(x.Id, x.EmployeeId,
                db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId).Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                x.LeaveType, x.StartDate, x.EndDate, x.RequestedDays, x.Note, x.Status.ToString(), x.RequestedByUserId,
                x.ReviewedByUserId, x.CreatedAt, x.ReviewedAt, x.ReviewNote, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            return Results.Ok(rows);
        });

        leaves.MapPost("/", async (LeaveCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var type = request.LeaveType?.Trim();
            if (request.EmployeeId == Guid.Empty || request.EndDate < request.StartDate || request.RequestedDays is <= 0m or > 366m ||
                string.IsNullOrWhiteSpace(type) || type.Length > 32 || (request.Note?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["leaveRequest"] = ["Çalışan, izin türü, geçerli tarih aralığı ve pozitif izin günü girin."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId && x.Status != EmployeeEmploymentStatus.Terminated, ct);
            if (employee is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeId"] = ["Aktif personel bulunamadı."] });
            if (!WithinEmployment(employee, request.StartDate) || !WithinEmployment(employee, request.EndDate))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["dates"] = ["İzin tarihleri işe giriş ve varsa işten ayrılış tarihleri arasında olmalıdır."] });
            if (!IsTenantAdmin(user) && employee.UserId != userId) return Results.Forbid();
            var overlaps = await db.EmployeeLeaveRequests.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == employee.Id &&
                x.Status != EmployeeLeaveStatus.Rejected && x.Status != EmployeeLeaveStatus.Cancelled &&
                x.StartDate <= request.EndDate && x.EndDate >= request.StartDate, ct);
            if (overlaps) return Results.Conflict(new { error = "Bu tarih aralığı mevcut bir izin talebiyle çakışıyor." });
            var leave = new EmployeeLeaveRequest { TenantId = tenantId, EmployeeId = employee.Id, LeaveType = type!,
                StartDate = request.StartDate, EndDate = request.EndDate, RequestedDays = request.RequestedDays,
                Note = Clean(request.Note), RequestedByUserId = userId };
            db.EmployeeLeaveRequests.Add(leave);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.leave.requested", Resource = employee.PersonnelCode });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/hr/leave-requests/{leave.Id}", new { leave.Id, leave.Status });
        });

        leaves.MapPost("/{id:guid}/review", async (Guid id, LeaveReviewRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if ((request.Note?.Length ?? 0) > 1000) return Results.ValidationProblem(new Dictionary<string, string[]> { ["note"] = ["Not en fazla 1000 karakter olabilir."] });
            var leave = await db.EmployeeLeaveRequests.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (leave is null) return Results.NotFound();
            if (leave.Status != EmployeeLeaveStatus.Requested) return Results.Conflict(new { error = "Yalnız bekleyen izin talepleri karara bağlanabilir." });
            if (leave.RequestedByUserId == userId) return Results.Conflict(new { error = "Talebi oluşturan kullanıcı kendi talebini onaylayamaz." });
            if (!TryDecodeRowVersion(request.RowVersion, out var version)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["rowVersion"] = ["Geçerli kayıt sürümü zorunludur."] });
            db.Entry(leave).Property(x => x.RowVersion).OriginalValue = version;
            leave.Status = request.Approve ? EmployeeLeaveStatus.Approved : EmployeeLeaveStatus.Rejected;
            leave.ReviewedByUserId = userId; leave.ReviewedAt = DateTimeOffset.UtcNow; leave.ReviewNote = Clean(request.Note);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = request.Approve ? "hr.leave.approved" : "hr.leave.rejected", Resource = leave.Id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İzin talebi başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { leave.Id, status = leave.Status.ToString(), leave.ReviewedAt, leave.ReviewNote });
        });

        attendance.MapGet("/", async (DateOnly? from, DateOnly? to, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (from is not null && to is not null && to < from) return Results.BadRequest(new { error = "Bitiş tarihi başlangıç tarihinden önce olamaz." });
            var query = db.EmployeeAttendanceRecords.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!IsTenantAdmin(user)) query = query.Where(x => db.EmployeeRecords.Any(e => e.TenantId == tenantId && e.Id == x.EmployeeId && e.UserId == userId));
            if (from is not null) query = query.Where(x => x.WorkDate >= from);
            if (to is not null) query = query.Where(x => x.WorkDate <= to);
            return Results.Ok(await query.OrderByDescending(x => x.WorkDate).Take(500).Select(x => new AttendanceView(x.Id, x.EmployeeId,
                db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId).Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                x.WorkDate, x.WorkedMinutes, x.OvertimeMinutes, x.Note, x.RecordedByUserId, x.CreatedAt, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct));
        });

        attendance.MapPost("/", async (AttendanceWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.EmployeeId == Guid.Empty || request.WorkedMinutes < 0 || request.OvertimeMinutes < 0 ||
                request.WorkedMinutes + request.OvertimeMinutes > 1440 || (request.Note?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["attendance"] = ["Çalışan ve günlük toplamı 1440 dakikayı aşmayan geçerli süreler girin."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId && x.Status != EmployeeEmploymentStatus.Terminated, ct);
            if (employee is null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeId"] = ["Aktif personel bulunamadı."] });
            if (!WithinEmployment(employee, request.WorkDate))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["workDate"] = ["Puantaj tarihi işe giriş ve varsa işten ayrılış tarihleri arasında olmalıdır."] });
            var existing = await db.EmployeeAttendanceRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.EmployeeId == request.EmployeeId && x.WorkDate == request.WorkDate, ct);
            if (existing is not null) return Results.Conflict(new { error = "Bu personel için tarihte puantaj kaydı var; düzeltme uç noktasını kullanın." });
            var record = new EmployeeAttendanceRecord { TenantId = tenantId, EmployeeId = request.EmployeeId, WorkDate = request.WorkDate,
                WorkedMinutes = request.WorkedMinutes, OvertimeMinutes = request.OvertimeMinutes, Note = Clean(request.Note), RecordedByUserId = userId };
            db.EmployeeAttendanceRecords.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.attendance.recorded", Resource = $"{request.EmployeeId:D}/{request.WorkDate:yyyy-MM-dd}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/hr/attendance/{record.Id}", new { record.Id, record.WorkDate });
        });

        attendance.MapPut("/{id:guid}", async (Guid id, AttendanceWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.WorkedMinutes < 0 || request.OvertimeMinutes < 0 || request.WorkedMinutes + request.OvertimeMinutes > 1440 ||
                (request.Note?.Length ?? 0) > 1000 || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["attendance"] = ["Geçerli süreler ve güncel kayıt sürümü zorunludur."] });
            var record = await db.EmployeeAttendanceRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == record.EmployeeId, ct);
            if (employee is null) return Results.Conflict(new { error = "Puantaj kaydının personeli bulunamadı." });
            if (!WithinEmployment(employee, request.WorkDate))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["workDate"] = ["Puantaj tarihi işe giriş ve varsa işten ayrılış tarihleri arasında olmalıdır."] });
            if (await db.EmployeeAttendanceRecords.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == record.EmployeeId &&
                    x.WorkDate == request.WorkDate && x.Id != record.Id, ct))
                return Results.Conflict(new { error = "Bu personel için hedef tarihte zaten bir puantaj kaydı var." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.WorkDate = request.WorkDate; record.WorkedMinutes = request.WorkedMinutes; record.OvertimeMinutes = request.OvertimeMinutes; record.Note = Clean(request.Note);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.attendance.corrected", Resource = id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Puantaj kaydı başka bir kullanıcı tarafından değiştirildi." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Bu personel için hedef tarihte zaten bir puantaj kaydı var." });
            }
            return Results.Ok(new { record.Id, record.WorkDate, record.WorkedMinutes, record.OvertimeMinutes, rowVersion = Convert.ToBase64String(record.RowVersion) });
        });

        payrollRules.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            return Results.Ok(await db.PayrollRuleSets.AsNoTracking().Where(x => x.TenantId == tenantId && x.JurisdictionCode == "TR")
                .OrderByDescending(x => x.EffectiveFrom).ThenByDescending(x => x.Version)
                .Select(x => new PayrollRuleSetView(x.Id, x.TaxYear, x.EffectiveFrom, x.EffectiveTo, x.Version, x.RulesJson,
                    x.OfficialSourceUrl, x.Status, x.CreatedByUserId, x.ApprovedByUserId, x.CreatedAt, x.ApprovedAt,
                    x.CreatedByUserId != userId, Convert.ToBase64String(x.RowVersion))).Take(100).ToListAsync(ct));
        });

        payrollRules.MapPost("/", async (PayrollRuleSetCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.TaxYear is null || !Regex.IsMatch(request.TaxYear, "^20[0-9]{2}$") || request.EffectiveTo is not null && request.EffectiveTo < request.EffectiveFrom ||
                string.IsNullOrWhiteSpace(request.OfficialSourceUrl) || request.OfficialSourceUrl.Length > 1000 ||
                !Uri.TryCreate(request.OfficialSourceUrl, UriKind.Absolute, out var sourceUri) || sourceUri.Scheme != Uri.UriSchemeHttps ||
                request.Rules is null || request.Rules.Value.ValueKind != JsonValueKind.Object ||
                JsonSerializer.SerializeToUtf8Bytes(request.Rules.Value).Length > 65536)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["ruleSet"] = ["Türkiye kural taslağı için vergi yılı, geçerli tarih aralığı, HTTPS kaynak bağlantısı ve 64 KiB sınırında bir JSON nesnesi zorunludur."] });
            var nextVersion = (await db.PayrollRuleSets.Where(x => x.TenantId == tenantId && x.JurisdictionCode == "TR" && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var ruleSet = new PayrollRuleSet { TenantId = tenantId, JurisdictionCode = "TR", TaxYear = request.TaxYear,
                EffectiveFrom = request.EffectiveFrom, EffectiveTo = request.EffectiveTo, Version = nextVersion,
                RulesJson = JsonSerializer.Serialize(request.Rules), OfficialSourceUrl = request.OfficialSourceUrl,
                Status = "Draft", CreatedByUserId = userId };
            db.PayrollRuleSets.Add(ruleSet);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.payroll-rules.draft-created", Resource = $"TR/{ruleSet.TaxYear}/v{nextVersion}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/hr/payroll/rule-sets/{ruleSet.Id}", new { ruleSet.Id, ruleSet.TaxYear, ruleSet.EffectiveFrom, ruleSet.Version, ruleSet.Status });
        });

        payrollRules.MapPost("/{id:guid}/approve", async (Guid id, PayrollRuleSetApproveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var ruleSet = await db.PayrollRuleSets.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id && x.JurisdictionCode == "TR", ct);
            if (ruleSet is null) return Results.NotFound();
            if (ruleSet.CreatedByUserId == userId) return Results.Conflict(new { error = "Kural setini oluşturan kullanıcı kendi değişikliğini onaylayamaz." });
            if (ruleSet.Status != "Draft" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Taslak kural seti ve güncel kayıt sürümü gerekli." });
            db.Entry(ruleSet).Property(x => x.RowVersion).OriginalValue = version;
            ruleSet.Status = "Approved"; ruleSet.ApprovedByUserId = userId; ruleSet.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.payroll-rules.approved", Resource = $"TR/{ruleSet.TaxYear}/v{ruleSet.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kural seti başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { ruleSet.Id, ruleSet.Status, ruleSet.ApprovedAt });
        });
    }

    private static Dictionary<string, string[]>? ValidateEmployee(EmployeeWriteRequest request)
    {
        var code = request.PersonnelCode?.Trim(); var name = request.FullName?.Trim();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 40 || !Regex.IsMatch(code, "^[A-Za-z0-9._-]+$") ||
            string.IsNullOrWhiteSpace(name) || name.Length > 160 || request.HireDate == default ||
            request.TerminationDate is not null && request.TerminationDate < request.HireDate ||
            (request.Department?.Length ?? 0) > 120 || (request.JobTitle?.Length ?? 0) > 120 ||
            (request.WorkEmail is not null && (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(request.WorkEmail) || request.WorkEmail.Length > 254)) ||
            request.UserId == Guid.Empty)
            return new() { ["employee"] = ["Personel kodu, ad, işe giriş tarihi ve geçerli isteğe bağlı iletişim bilgilerini girin."] };
        return null;
    }

    private static bool TryValidateReportPeriod(DateOnly? from, DateOnly? to, out string? error)
    {
        error = null;
        if (from is null || to is null || to < from)
            error = "Başlangıç ve bitiş tarihi girin; bitiş başlangıçtan önce olamaz.";
        else if (to.Value.DayNumber - from.Value.DayNumber > 365)
            error = "Rapor dönemi en fazla 366 takvim günü olabilir.";
        return error is null;
    }

    private static async Task<HrPeriodSummaryView> BuildPeriodSummary(Guid tenantId, DateOnly from, DateOnly to,
        TenantDbContext db, CancellationToken ct)
    {
        var employeesAtEnd = await db.EmployeeRecords.AsNoTracking().CountAsync(x => x.TenantId == tenantId &&
            x.HireDate <= to && (x.TerminationDate == null || x.TerminationDate > to), ct);
        var attendance = db.EmployeeAttendanceRecords.AsNoTracking().Where(x => x.TenantId == tenantId && x.WorkDate >= from && x.WorkDate <= to);
        var attendanceRows = await attendance.CountAsync(ct);
        var employeesWithAttendance = await attendance.Select(x => x.EmployeeId).Distinct().CountAsync(ct);
        var workedMinutes = await attendance.Select(x => (long?)x.WorkedMinutes).SumAsync(ct) ?? 0L;
        var overtimeMinutes = await attendance.Select(x => (long?)x.OvertimeMinutes).SumAsync(ct) ?? 0L;
        var leaveQuery = db.EmployeeLeaveRequests.AsNoTracking().Where(x => x.TenantId == tenantId && x.StartDate <= to && x.EndDate >= from);
        var leaveCount = await leaveQuery.CountAsync(ct);
        var leaveDays = await leaveQuery.Select(x => (decimal?)x.RequestedDays).SumAsync(ct) ?? 0m;
        var leaveStatusGroups = await leaveQuery.GroupBy(x => x.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Days = g.Sum(x => x.RequestedDays) })
            .ToListAsync(ct);
        var leaveStatuses = leaveStatusGroups.OrderBy(x => x.Status)
            .Select(x => new HrLeaveStatusSummary(x.Status.ToString(), x.Count, x.Days)).ToArray();
        return new HrPeriodSummaryView(from, to, employeesAtEnd, attendanceRows, employeesWithAttendance,
            workedMinutes, overtimeMinutes, leaveCount, leaveDays, leaveStatuses);
    }

    private static byte[] BuildSummaryCsv(HrPeriodSummaryView summary)
    {
        static string Cell(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
        var rows = new List<string> { "\uFEFFmetric,value", $"period,{Cell($"{summary.From:yyyy-MM-dd}/{summary.To:yyyy-MM-dd}")}",
            $"employees_at_period_end,{summary.EmployeesAtPeriodEnd}", $"attendance_records,{summary.AttendanceRecordCount}",
            $"employees_with_attendance,{summary.EmployeesWithAttendance}", $"worked_minutes,{summary.WorkedMinutes}",
            $"overtime_minutes,{summary.OvertimeMinutes}", $"overlapping_leave_requests,{summary.LeaveRequestCount}",
            $"requested_leave_days,{summary.RequestedLeaveDays.ToString(System.Globalization.CultureInfo.InvariantCulture)}" };
        rows.AddRange(summary.LeaveStatuses.Select(x => $"leave_status_{x.Status.ToLowerInvariant()}_count,{x.RequestCount}"));
        rows.AddRange(summary.LeaveStatuses.Select(x => $"leave_status_{x.Status.ToLowerInvariant()}_requested_days,{x.RequestedDays.ToString(System.Globalization.CultureInfo.InvariantCulture)}"));
        return System.Text.Encoding.UTF8.GetBytes(string.Join("\r\n", rows) + "\r\n");
    }

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }
    private static bool IsTenantAdmin(ClaimsPrincipal user) => string.Equals(user.FindFirstValue("role"), "TenantAdmin", StringComparison.OrdinalIgnoreCase);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static bool WithinEmployment(EmployeeRecord employee, DateOnly date) =>
        date >= employee.HireDate && (employee.TerminationDate is null || date <= employee.TerminationDate.Value);
    private static bool TryDecodeRowVersion(string? value, out byte[] bytes)
    {
        try { bytes = string.IsNullOrWhiteSpace(value) ? [] : Convert.FromBase64String(value); return bytes.Length == 8; }
        catch (FormatException) { bytes = []; return false; }
    }
    private static bool IsUniqueConstraintViolation(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException!)
            if (current is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 }) return true;
        return false;
    }
}

public sealed record EmployeeWriteRequest(string? PersonnelCode, string? FullName, string? Department, string? JobTitle,
    string? WorkEmail, DateOnly HireDate, DateOnly? TerminationDate, Guid? UserId = null, string? RowVersion = null);
public sealed record EmployeeView(Guid Id, string PersonnelCode, string FullName, string? Department, string? JobTitle,
    string? WorkEmail, DateOnly HireDate, DateOnly? TerminationDate, string Status, Guid? UserId, string RowVersion);
public sealed record LeaveCreateRequest(Guid EmployeeId, string? LeaveType, DateOnly StartDate, DateOnly EndDate, decimal RequestedDays, string? Note = null);
public sealed record LeaveReviewRequest(bool Approve, string? Note, string? RowVersion);
public sealed record LeaveView(Guid Id, Guid EmployeeId, string Employee, string LeaveType, DateOnly StartDate, DateOnly EndDate,
    decimal RequestedDays, string? Note, string Status, Guid RequestedByUserId, Guid? ReviewedByUserId, DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt, string? ReviewNote, string RowVersion);
public sealed record AttendanceWriteRequest(Guid EmployeeId, DateOnly WorkDate, int WorkedMinutes, int OvertimeMinutes,
    string? Note = null, string? RowVersion = null);
public sealed record AttendanceView(Guid Id, Guid EmployeeId, string Employee, DateOnly WorkDate, int WorkedMinutes,
    int OvertimeMinutes, string? Note, Guid RecordedByUserId, DateTimeOffset CreatedAt, string RowVersion);
public sealed record PayrollRuleSetCreateRequest(string? TaxYear, DateOnly EffectiveFrom, DateOnly? EffectiveTo,
    string? OfficialSourceUrl, JsonElement? Rules);
public sealed record PayrollRuleSetApproveRequest(string? RowVersion);
public sealed record PayrollRuleSetView(Guid Id, string TaxYear, DateOnly EffectiveFrom, DateOnly? EffectiveTo,
    int Version, string RulesJson, string OfficialSourceUrl, string Status, Guid CreatedByUserId,
    Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt, bool CanApprove, string RowVersion);
public sealed record HrLeaveStatusSummary(string Status, int RequestCount, decimal RequestedDays);
public sealed record HrPeriodSummaryView(DateOnly From, DateOnly To, int EmployeesAtPeriodEnd, int AttendanceRecordCount,
    int EmployeesWithAttendance, long WorkedMinutes, long OvertimeMinutes, int LeaveRequestCount,
    decimal RequestedLeaveDays, IReadOnlyList<HrLeaveStatusSummary> LeaveStatuses);
