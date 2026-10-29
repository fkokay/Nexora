using System.Globalization;
using System.IO.Compression;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
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
        var payrollCompensation = group.MapGroup("/payroll/compensation");
        var payrollWorkplaceAssignments = group.MapGroup("/payroll/workplace-assignments");
        var workplaceDefinitions = app.MapGroup("/api/definitions/workplaces").WithTags("Tanımlamalar").RequireAuthorization();
        var payrollWorkplaceCalendars = group.MapGroup("/payroll/workplace-calendars");
        var payrollEmployeeCalendarOverrides = group.MapGroup("/payroll/employee-calendar-overrides");
        var payrollRuns = group.MapGroup("/payroll/runs");

        workplaceDefinitions.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _) || !IsTenantAdmin(user)) return Results.Forbid();
            var rows = await db.WorkplaceDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Kind).ThenBy(x => x.Code)
                .Select(x => new WorkplaceDefinitionView(x.Id, x.Code, x.Name, x.Kind, x.IsActive, x.RowVersion)).ToListAsync(ct);
            return Results.Ok(rows);
        });
        workplaceDefinitions.MapPost("/", async (WorkplaceDefinitionWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var errors = ValidateWorkplaceDefinition(request.Code, request.Name, request.Kind);
            if (errors is not null) return Results.ValidationProblem(errors);
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.WorkplaceDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu kod firma içinde zaten kullanılıyor." });
            var record = new WorkplaceDefinition { TenantId = tenantId, Code = code, Name = request.Name!.Trim(), Kind = request.Kind! };
            db.WorkplaceDefinitions.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "workplace-definition.created", Resource = $"{record.Kind}/{record.Code}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/definitions/workplaces/{record.Id}", new WorkplaceDefinitionView(record.Id, record.Code, record.Name, record.Kind, record.IsActive, record.RowVersion));
        });
        workplaceDefinitions.MapPut("/{id:guid}", async (Guid id, WorkplaceDefinitionUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var errors = ValidateWorkplaceDefinition(request.Code, request.Name, request.Kind);
            if (errors is not null) return Results.ValidationProblem(errors);
            if (request.RowVersion is not { Length: > 0 }) return Results.ValidationProblem(new Dictionary<string, string[]> { ["rowVersion"] = ["Güncel kayıt sürümü zorunludur."] });
            var record = await db.WorkplaceDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (!record.RowVersion.SequenceEqual(request.RowVersion)) return Results.Conflict(new { error = "Kayıt başka bir işlemde değiştirildi. Yenileyip tekrar deneyin." });
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.WorkplaceDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code && x.Id != id, ct))
                return Results.Conflict(new { error = "Bu kod firma içinde zaten kullanılıyor." });
            record.Code = code; record.Name = request.Name!.Trim(); record.Kind = request.Kind!;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "workplace-definition.updated", Resource = $"{record.Kind}/{record.Code}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kayıt eşzamanlı olarak değiştirildi. Yenileyip tekrar deneyin." }); }
            return Results.Ok(new WorkplaceDefinitionView(record.Id, record.Code, record.Name, record.Kind, record.IsActive, record.RowVersion));
        });
        workplaceDefinitions.MapPost("/{id:guid}/status", async (Guid id, WorkplaceDefinitionStateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.WorkplaceDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.IsActive == request.IsActive) return Results.Conflict(new { error = request.IsActive ? "Tanım zaten etkin." : "Tanım zaten devre dışı." });
            record.IsActive = request.IsActive;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = request.IsActive ? "workplace-definition.activated" : "workplace-definition.deactivated", Resource = $"{record.Kind}/{record.Code}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new WorkplaceDefinitionView(record.Id, record.Code, record.Name, record.Kind, record.IsActive, record.RowVersion));
        });

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
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(await db.EmployeeRecords.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    (admin || x.UserId == userId)).OrderBy(x => x.PersonnelCode).Take(500)
                .Select(x => new EmployeeView(x.Id, x.PersonnelCode, x.FullName, x.Department, x.JobTitle, x.EmploymentCategory, x.WorkEmail,
                    x.HireDate, x.TerminationDate, x.TerminationDate == null || x.TerminationDate >= today ? "Active" : "Terminated",
                    x.UserId, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct));
        });

        employees.MapPost("/", async (EmployeeWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var validation = ValidateEmployee(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            var code = request.PersonnelCode!.Trim().ToUpperInvariant();
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (await db.EmployeeRecords.AnyAsync(x => x.TenantId == tenantId && (x.PersonnelCode == code ||
                    request.UserId != null && x.UserId == request.UserId), ct))
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            var employee = new EmployeeRecord { TenantId = tenantId, PersonnelCode = code, FullName = request.FullName!.Trim(),
                Department = Clean(request.Department), JobTitle = Clean(request.JobTitle), EmploymentCategory = Clean(request.EmploymentCategory), WorkEmail = Clean(request.WorkEmail),
                HireDate = request.HireDate, TerminationDate = request.TerminationDate, UserId = request.UserId,
                Status = request.TerminationDate is null || request.TerminationDate >= today ? EmployeeEmploymentStatus.Active : EmployeeEmploymentStatus.Terminated };
            db.EmployeeRecords.Add(employee);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.employee.created", Resource = code });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            }
            return Results.Created($"/api/hr/employees/{employee.Id}", new EmployeeView(employee.Id, employee.PersonnelCode,
                employee.FullName, employee.Department, employee.JobTitle, employee.EmploymentCategory, employee.WorkEmail, employee.HireDate,
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
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (await db.EmployeeRecords.AnyAsync(x => x.TenantId == tenantId && x.Id != id &&
                    (x.PersonnelCode == code || request.UserId != null && x.UserId == request.UserId), ct))
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            employee.PersonnelCode = code; employee.FullName = request.FullName!.Trim(); employee.Department = Clean(request.Department);
            employee.JobTitle = Clean(request.JobTitle); employee.EmploymentCategory = Clean(request.EmploymentCategory); employee.WorkEmail = Clean(request.WorkEmail); employee.HireDate = request.HireDate;
            employee.TerminationDate = request.TerminationDate; employee.UserId = request.UserId;
            employee.Status = request.TerminationDate is null || request.TerminationDate >= today ? EmployeeEmploymentStatus.Active : EmployeeEmploymentStatus.Terminated;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.employee.updated", Resource = employee.PersonnelCode });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Personel kaydı başka bir kullanıcı tarafından değiştirildi; yenileyip tekrar deneyin." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Personel kodu veya kullanıcı eşlemesi bu firmada zaten kullanılıyor." });
            }
            return Results.Ok(new EmployeeView(employee.Id, employee.PersonnelCode, employee.FullName, employee.Department,
                employee.JobTitle, employee.EmploymentCategory, employee.WorkEmail, employee.HireDate, employee.TerminationDate, employee.Status.ToString(),
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
                x.ReviewedByUserId, x.CreatedAt, x.ReviewedAt, x.ReviewNote, Convert.ToBase64String(x.RowVersion),
                x.Status == EmployeeLeaveStatus.Requested && x.RequestedByUserId == userId)).ToListAsync(ct);
            return Results.Ok(rows);
        });

        leaves.MapPost("/", async (LeaveCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var type = request.LeaveType?.Trim();
            if (request.EmployeeId == Guid.Empty || request.EndDate < request.StartDate || request.RequestedDays is <= 0m or > 366m ||
                request.EndDate >= request.StartDate && request.RequestedDays > request.EndDate.DayNumber - request.StartDate.DayNumber + 1 ||
                type is not ("Annual" or "Health" or "Unpaid" or "Excuse" or "Other") || (request.Note?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["leaveRequest"] = ["Çalışan, standart izin türü (Annual/Health/Unpaid/Excuse/Other), geçerli tarih aralığı ve pozitif izin günü girin; gün sayısı tarih aralığındaki takvim gününü aşamaz."] });
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId &&
                (x.TerminationDate == null || x.TerminationDate >= today), ct);
            if (employee is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeId"] = ["Aktif personel bulunamadı."] });
            if (!WithinEmployment(employee, request.StartDate) || !WithinEmployment(employee, request.EndDate))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["dates"] = ["İzin tarihleri işe giriş ve varsa işten ayrılış tarihleri arasında olmalıdır."] });
            if (!IsTenantAdmin(user) && employee.UserId != userId) return Results.Forbid();
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct)
                : null;
            var leave = new EmployeeLeaveRequest { TenantId = tenantId, EmployeeId = employee.Id, LeaveType = type!,
                StartDate = request.StartDate, EndDate = request.EndDate, RequestedDays = request.RequestedDays,
                Note = Clean(request.Note), RequestedByUserId = userId };
            try
            {
                var overlaps = await db.EmployeeLeaveRequests.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == employee.Id &&
                    x.Status != EmployeeLeaveStatus.Rejected && x.Status != EmployeeLeaveStatus.Cancelled &&
                    x.StartDate <= request.EndDate && x.EndDate >= request.StartDate, ct);
                if (overlaps) return Results.Conflict(new { error = "Bu tarih aralığı mevcut bir izin talebiyle çakışıyor." });
                db.EmployeeLeaveRequests.Add(leave);
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.leave.requested", Resource = employee.PersonnelCode });
                await db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);
            }
            catch (Exception ex) when (IsSqlServerDeadlock(ex))
            {
                return Results.Conflict(new { error = "İzin tarihleri eşzamanlı güncellendi; listeyi yenileyip tekrar deneyin." });
            }
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
            if (request.Approve && await db.EmployeeLeaveRequests.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == leave.EmployeeId && x.Id != leave.Id &&
                    x.Status != EmployeeLeaveStatus.Rejected && x.Status != EmployeeLeaveStatus.Cancelled &&
                    x.StartDate <= leave.EndDate && x.EndDate >= leave.StartDate, ct))
                return Results.Conflict(new { error = "Bu izin talebi başka bir bekleyen veya onaylı izinle çakışıyor; çakışan talebi önce karara bağlayın." });
            db.Entry(leave).Property(x => x.RowVersion).OriginalValue = version;
            leave.Status = request.Approve ? EmployeeLeaveStatus.Approved : EmployeeLeaveStatus.Rejected;
            leave.ReviewedByUserId = userId; leave.ReviewedAt = DateTimeOffset.UtcNow; leave.ReviewNote = Clean(request.Note);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = request.Approve ? "hr.leave.approved" : "hr.leave.rejected", Resource = leave.Id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İzin talebi başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { leave.Id, status = leave.Status.ToString(), leave.ReviewedAt, leave.ReviewNote });
        });

        leaves.MapPost("/{id:guid}/cancel", async (Guid id, LeaveCancelRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var leave = await db.EmployeeLeaveRequests.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (leave is null) return Results.NotFound();
            if (leave.RequestedByUserId != userId) return Results.Forbid();
            if (leave.Status != EmployeeLeaveStatus.Requested)
                return Results.Conflict(new { error = "Yalnız bekleyen izin talepleri iptal edilebilir." });
            if (!TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rowVersion"] = ["Geçerli kayıt sürümü zorunludur."] });
            db.Entry(leave).Property(x => x.RowVersion).OriginalValue = version;
            leave.Status = EmployeeLeaveStatus.Cancelled;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.leave.cancelled", Resource = leave.Id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İzin talebi başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { leave.Id, status = leave.Status.ToString() });
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
                x.WorkDate, x.WorkedMinutes, x.OvertimeMinutes, x.Note, x.RecordedByUserId, x.ApprovalStatus, x.ApprovedByUserId, x.ApprovedAt,
                x.CreatedAt, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct));
        });

        attendance.MapPost("/", async (AttendanceWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (request.EmployeeId == Guid.Empty || request.WorkedMinutes < 0 || request.OvertimeMinutes < 0 ||
                request.WorkedMinutes + request.OvertimeMinutes > 1440 || (request.Note?.Length ?? 0) > 1000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["attendance"] = ["Çalışan ve günlük toplamı 1440 dakikayı aşmayan geçerli süreler girin."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId, ct);
            if (employee is null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeId"] = ["Personel bulunamadı."] });
            if (!WithinEmployment(employee, request.WorkDate))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["workDate"] = ["Puantaj tarihi işe giriş ve varsa işten ayrılış tarihleri arasında olmalıdır."] });
            var existing = await db.EmployeeAttendanceRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.EmployeeId == request.EmployeeId && x.WorkDate == request.WorkDate, ct);
            if (existing is not null) return Results.Conflict(new { error = "Bu personel için tarihte puantaj kaydı var; düzeltme uç noktasını kullanın." });
            var record = new EmployeeAttendanceRecord { TenantId = tenantId, EmployeeId = request.EmployeeId, WorkDate = request.WorkDate,
                WorkedMinutes = request.WorkedMinutes, OvertimeMinutes = request.OvertimeMinutes, Note = Clean(request.Note), RecordedByUserId = userId };
            db.EmployeeAttendanceRecords.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.attendance.recorded", Resource = $"{request.EmployeeId:D}/{request.WorkDate:yyyy-MM-dd}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Bu personel için tarihte puantaj kaydı var; listeyi yenileyip düzeltme uç noktasını kullanın." });
            }
            return Results.Created($"/api/hr/attendance/{record.Id}", new { record.Id, record.WorkDate });
        });

        attendance.MapPost("/{id:guid}/approve", async (Guid id, AttendanceApproveRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            if (!TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rowVersion"] = ["Güncel puantaj kayıt sürümü zorunludur."] });
            var record = await db.EmployeeAttendanceRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.RecordedByUserId == userId)
                return Results.Conflict(new { error = "Puantajı kaydeden yönetici aynı kaydı onaylayamaz." });
            if (record.ApprovalStatus != "PendingApproval")
                return Results.Conflict(new { error = "Yalnız bekleyen puantaj kayıtları onaylanabilir." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.ApprovalStatus = "Approved";
            record.ApprovedByUserId = userId;
            record.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.attendance.approved", Resource = id.ToString("D") });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Puantaj kaydı başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { record.Id, status = record.ApprovalStatus, record.ApprovedByUserId, record.ApprovedAt,
                rowVersion = Convert.ToBase64String(record.RowVersion) });
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
            record.ApprovalStatus = "PendingApproval"; record.ApprovedByUserId = null; record.ApprovedAt = null;
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
            if (!PayrollParameterSetValidator.TryValidateUniquePropertyNames(request.Rules.Value, out var duplicatePropertyError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["ruleSet"] = [duplicatePropertyError!] });
            if (PayrollParameterSetValidator.HasSchemaVersion(request.Rules.Value) &&
                !PayrollParameterSetValidator.TryValidate(request.Rules.Value, request.EffectiveFrom, request.EffectiveTo, false, out var parameterError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["ruleSet"] = [parameterError!] });
            var nextVersion = (await db.PayrollRuleSets.Where(x => x.TenantId == tenantId && x.JurisdictionCode == "TR" && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var ruleSet = new PayrollRuleSet { TenantId = tenantId, JurisdictionCode = "TR", TaxYear = request.TaxYear,
                EffectiveFrom = request.EffectiveFrom, EffectiveTo = request.EffectiveTo, Version = nextVersion,
                RulesJson = JsonSerializer.Serialize(request.Rules), OfficialSourceUrl = request.OfficialSourceUrl,
                Status = "Draft", CreatedByUserId = userId };
            db.PayrollRuleSets.Add(ruleSet);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.payroll-rules.draft-created", Resource = $"TR/{ruleSet.TaxYear}/v{nextVersion}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Aynı yürürlük tarihi için başka bir taslak eşzamanlı kaydedildi; listeyi yenileyip tekrar deneyin." });
            }
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
            using (var rulesDocument = JsonDocument.Parse(ruleSet.RulesJson))
            {
                if (!PayrollParameterSetValidator.TryValidate(rulesDocument.RootElement, ruleSet.EffectiveFrom, ruleSet.EffectiveTo, true, out var parameterError))
                    return Results.Conflict(new { error = parameterError });
            }
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct)
                : null;
            try
            {
                var effectiveTo = ruleSet.EffectiveTo ?? DateOnly.MaxValue;
                var overlappingApproval = await db.PayrollRuleSets.AnyAsync(x =>
                    x.TenantId == tenantId && x.JurisdictionCode == ruleSet.JurisdictionCode && x.TaxYear == ruleSet.TaxYear &&
                    x.Id != ruleSet.Id && x.Status == "Approved" && x.EffectiveFrom <= effectiveTo &&
                    (x.EffectiveTo == null || x.EffectiveTo >= ruleSet.EffectiveFrom), ct);
                if (overlappingApproval)
                    return Results.Conflict(new { error = "Aynı vergi yılı için onaylı kural setinin yürürlük tarihleriyle çakışma var. Önce dönemleri ayırın." });
                db.Entry(ruleSet).Property(x => x.RowVersion).OriginalValue = version;
                ruleSet.Status = "Approved"; ruleSet.ApprovedByUserId = userId; ruleSet.ApprovedAt = DateTimeOffset.UtcNow;
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.payroll-rules.approved", Resource = $"TR/{ruleSet.TaxYear}/v{ruleSet.Version}" });
                await db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);
            }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kural seti başka bir kullanıcı tarafından değiştirildi." }); }
            catch (Exception ex) when (IsSqlServerDeadlock(ex))
            {
                return Results.Conflict(new { error = "Kural seti eşzamanlı onaylandı; listeyi yenileyip tekrar deneyin." });
            }
            return Results.Ok(new { ruleSet.Id, ruleSet.Status, ruleSet.ApprovedAt });
        });

        payrollCompensation.MapGet("/", async (Guid? employeeId, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var query = db.PayrollCompensationRecords.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (employeeId is not null) query = query.Where(x => x.EmployeeId == employeeId.Value);
            var rows = await query.OrderByDescending(x => x.EffectiveFrom).ThenByDescending(x => x.Version).Take(500)
                .Select(x => new PayrollCompensationView(x.Id, x.EmployeeId,
                    db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId)
                        .Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                    x.TargetKind, x.Amount, x.CurrencyCode, x.PayBasisCode, x.EffectiveFrom, x.Version, x.Status,
                    x.CreatedByUserId, x.ApprovedByUserId, x.CreatedAt, x.ApprovedAt,
                    x.Status == "PendingApproval" && x.CreatedByUserId != userId, Convert.ToBase64String(x.RowVersion)))
                .ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "hr.payroll-compensation.viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollCompensation.MapGet("/capabilities", async (ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            var canView = await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct);
            var canChange = await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "change", ct);
            var canApprove = await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct);
            return Results.Ok(new { view = canView, change = canChange, approve = canApprove });
        });

        payrollCompensation.MapGet("/employees", async (ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var rows = await db.EmployeeRecords.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.PersonnelCode).Take(500)
                .Select(x => new PayrollCompensationEmployeeOption(x.Id, x.PersonnelCode, x.FullName))
                .ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-compensation.employee-options.viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollCompensation.MapPost("/", async (PayrollCompensationCreateRequest request, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "change", ct)) return Results.Forbid();
            if (request.EmployeeId == Guid.Empty || request.TargetKind is not ("Gross" or "Net") ||
                request.Amount <= 0 || request.Amount > 99_999_999_999_999.9999m || decimal.Round(request.Amount, 4) != request.Amount ||
                request.CurrencyCode is null || !Regex.IsMatch(request.CurrencyCode, "^[A-Z]{3}$") ||
                request.PayBasisCode is null || !Regex.IsMatch(request.PayBasisCode, "^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$") ||
                request.EffectiveFrom == default)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["compensation"] = ["Personel, Gross/Net hedefi, 0,0001 ile 99.999.999.999.999,9999 arasında dört ondalık basamaklı tutar, üç harfli para birimi, ödeme esası kodu ve yürürlük başlangıcı zorunludur."] });

            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId, ct);
            if (employee is null) return Results.NotFound();
            if (request.EffectiveFrom < employee.HireDate || employee.TerminationDate is not null && request.EffectiveFrom > employee.TerminationDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["effectiveFrom"] = ["Ücret yürürlük tarihi personelin kayıtlı istihdam aralığı dışında olamaz."] });

            var nextVersion = (await db.PayrollCompensationRecords.Where(x => x.TenantId == tenantId &&
                    x.EmployeeId == request.EmployeeId && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var record = new PayrollCompensationRecord
            {
                TenantId = tenantId, EmployeeId = request.EmployeeId, TargetKind = request.TargetKind,
                Amount = request.Amount, CurrencyCode = request.CurrencyCode, PayBasisCode = request.PayBasisCode,
                EffectiveFrom = request.EffectiveFrom, Version = nextVersion, Status = "PendingApproval", CreatedByUserId = userId
            };
            db.PayrollCompensationRecords.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-compensation.change-requested", Resource = $"{record.Id:D}/v{nextVersion}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için eşzamanlı bir ücret değişikliği kaydedildi; listeyi yenileyin." });
            }
            return Results.Created($"/api/hr/payroll/compensation/{record.Id}", new PayrollCompensationView(record.Id,
                record.EmployeeId, employee.PersonnelCode + " · " + employee.FullName, record.TargetKind, record.Amount,
                record.CurrencyCode, record.PayBasisCode, record.EffectiveFrom, record.Version, record.Status,
                record.CreatedByUserId, null, record.CreatedAt, null, false, Convert.ToBase64String(record.RowVersion)));
        });

        payrollCompensation.MapPost("/{id:guid}/approve", async (Guid id, PayrollCompensationApproveRequest request,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var record = await db.PayrollCompensationRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Ücret değişikliğini oluşturan kullanıcı kendi değişikliğini onaylayamaz." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var rowVersion))
                return Results.Conflict(new { error = "Bekleyen ücret değişikliği ve güncel kayıt sürümü gerekli." });
            if (await db.PayrollCompensationRecords.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == record.EmployeeId &&
                    x.EffectiveFrom == record.EffectiveFrom && x.Status == "Approved", ct))
                return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için onaylı ücret kaydı zaten var; yeni sürümün yürürlük tarihini seçin." });

            db.Entry(record).Property(x => x.RowVersion).OriginalValue = rowVersion;
            record.Status = "Approved"; record.ApprovedByUserId = userId; record.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-compensation.approved", Resource = $"{record.Id:D}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Ücret değişikliği başka bir kullanıcı tarafından değiştirildi; yenileyip tekrar deneyin." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            {
                return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için başka bir ücret sürümü onaylandı." });
            }
            return Results.Ok(new { record.Id, record.Status, record.ApprovedAt });
        });

        payrollCompensation.MapPost("/{id:guid}/reject", async (Guid id, PayrollCompensationApproveRequest request,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var record = await db.PayrollCompensationRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Ücret değişikliğini oluşturan kullanıcı kendi değişikliğini reddedemez." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var rowVersion))
                return Results.Conflict(new { error = "Bekleyen ücret değişikliği ve güncel kayıt sürümü gerekli." });

            db.Entry(record).Property(x => x.RowVersion).OriginalValue = rowVersion;
            record.Status = "Rejected"; record.RejectedByUserId = userId; record.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-compensation.rejected", Resource = $"{record.Id:D}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Ücret değişikliği başka bir kullanıcı tarafından değiştirildi; yenileyip tekrar deneyin." }); }
            return Results.Ok(new { record.Id, record.Status, record.RejectedAt });
        });

        payrollCompensation.MapGet("/prior-employer-tax-bases", async (int? taxYear, Guid? employeeId, ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var query = db.PayrollPriorEmployerTaxBaseDeclarations.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (taxYear is not null) query = query.Where(x => x.TaxYear == taxYear.Value);
            if (employeeId is not null) query = query.Where(x => x.EmployeeId == employeeId.Value);
            var rows = await query.OrderByDescending(x => x.TaxYear).ThenBy(x => x.EmployeeId).ThenByDescending(x => x.Version)
                .Take(1000).Select(x => new PayrollPriorEmployerTaxBaseView(x.Id, x.EmployeeId,
                    db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId)
                        .Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                    x.TaxYear, x.DeclarationKind, x.BaseEntriesJson, x.EvidenceReference, x.Version, x.Status,
                    x.CreatedByUserId, x.ApprovedByUserId, x.CreatedAt, x.ApprovedAt,
                    x.Status == "PendingApproval" && x.CreatedByUserId != userId, Convert.ToBase64String(x.RowVersion)))
                .ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-prior-employer-tax-base.viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollCompensation.MapPost("/prior-employer-tax-bases", async (PayrollPriorEmployerTaxBaseCreateRequest request,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "change", ct)) return Results.Forbid();
            var kind = request.DeclarationKind?.Trim();
            var evidence = request.EvidenceReference?.Trim();
            if (request.EmployeeId == Guid.Empty || request.TaxYear is < 2000 or > 2100 ||
                kind is not ("HasPriorEmployer" or "NoPriorEmployer") ||
                string.IsNullOrWhiteSpace(evidence) || evidence.Length > 300 || request.BaseEntries.ValueKind != JsonValueKind.Array ||
                !ValidatePriorEmployerTaxBaseEntries(request.BaseEntries, kind == "HasPriorEmployer"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["declaration"] = ["Personel, 2000–2100 vergi yılı, beyan türü, belge/beyan referansı ve türe uygun JSON matrah kalemleri gereklidir. Matrah kodları ve birimleri firma tarafından tanımlanır; bu uç yasal sınıflama yapmaz."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId, ct);
            if (employee is null) return Results.NotFound();
            var nextVersion = (await db.PayrollPriorEmployerTaxBaseDeclarations.Where(x => x.TenantId == tenantId &&
                    x.EmployeeId == request.EmployeeId && x.TaxYear == request.TaxYear)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var declaration = new PayrollPriorEmployerTaxBaseDeclaration
            {
                TenantId = tenantId, EmployeeId = employee.Id, TaxYear = request.TaxYear, DeclarationKind = kind,
                BaseEntriesJson = request.BaseEntries.GetRawText(), EvidenceReference = evidence, Version = nextVersion,
                Status = "PendingApproval", CreatedByUserId = userId
            };
            db.PayrollPriorEmployerTaxBaseDeclarations.Add(declaration);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-prior-employer-tax-base.submitted", Resource = $"{declaration.Id:D}/v{nextVersion}/{request.TaxYear}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu personel ve vergi yılı için eşzamanlı bir beyan kaydedildi; listeyi yenileyin." }); }
            return Results.Created($"/api/hr/payroll/compensation/prior-employer-tax-bases/{declaration.Id}",
                new PayrollPriorEmployerTaxBaseView(declaration.Id, declaration.EmployeeId,
                    employee.PersonnelCode + " · " + employee.FullName, declaration.TaxYear, declaration.DeclarationKind,
                    declaration.BaseEntriesJson, declaration.EvidenceReference, declaration.Version, declaration.Status,
                    declaration.CreatedByUserId, null, declaration.CreatedAt, null, false, Convert.ToBase64String(declaration.RowVersion)));
        });

        payrollCompensation.MapPost("/prior-employer-tax-bases/{id:guid}/approve", async (Guid id,
            PayrollCompensationApproveRequest request, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var declaration = await db.PayrollPriorEmployerTaxBaseDeclarations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (declaration is null) return Results.NotFound();
            if (declaration.CreatedByUserId == userId) return Results.Conflict(new { error = "Beyanı oluşturan kullanıcı kendi beyanını onaylayamaz." });
            if (declaration.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen beyan ve güncel kayıt sürümü gerekli." });
            db.Entry(declaration).Property(x => x.RowVersion).OriginalValue = version;
            declaration.Status = "Approved"; declaration.ApprovedByUserId = userId; declaration.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-prior-employer-tax-base.approved", Resource = $"{declaration.Id:D}/v{declaration.Version}/{declaration.TaxYear}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Beyan eşzamanlı değiştirildi; listeyi yenileyin." }); }
            return Results.Ok(new { declaration.Id, declaration.Status, declaration.ApprovedAt });
        });

        payrollCompensation.MapPost("/prior-employer-tax-bases/{id:guid}/reject", async (Guid id,
            PayrollCompensationApproveRequest request, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var declaration = await db.PayrollPriorEmployerTaxBaseDeclarations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (declaration is null) return Results.NotFound();
            if (declaration.CreatedByUserId == userId) return Results.Conflict(new { error = "Beyanı oluşturan kullanıcı kendi beyanını reddedemez." });
            if (declaration.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen beyan ve güncel kayıt sürümü gerekli." });
            db.Entry(declaration).Property(x => x.RowVersion).OriginalValue = version;
            declaration.Status = "Rejected"; declaration.RejectedByUserId = userId; declaration.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-prior-employer-tax-base.rejected", Resource = $"{declaration.Id:D}/v{declaration.Version}/{declaration.TaxYear}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Beyan eşzamanlı değiştirildi; listeyi yenileyin." }); }
            return Results.Ok(new { declaration.Id, declaration.Status, declaration.RejectedAt });
        });

        payrollWorkplaceAssignments.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var rows = await db.PayrollEmployeeWorkplaceAssignments.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.EffectiveFrom).ThenBy(x => x.EmployeeId).ThenByDescending(x => x.Version).Take(1000)
                .Select(x => new PayrollEmployeeWorkplaceAssignmentView(x.Id, x.EmployeeId,
                    db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId)
                        .Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                    x.WorkplaceCode, x.EffectiveFrom, x.Version, x.Status, x.CreatedByUserId, x.ApprovedByUserId,
                    x.CreatedAt, x.ApprovedAt, x.Status == "PendingApproval" && x.CreatedByUserId != userId,
                    Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-assignment.list-viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollWorkplaceAssignments.MapPost("/", async (PayrollEmployeeWorkplaceAssignmentCreateRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var workplaceCode = request.WorkplaceCode?.Trim().ToUpperInvariant();
            if (request.EmployeeId == Guid.Empty || string.IsNullOrWhiteSpace(workplaceCode) ||
                !Regex.IsMatch(workplaceCode, "^[A-Z0-9][A-Z0-9._-]{0,39}$") || request.EffectiveFrom == default)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["assignment"] = ["Personel, geçerli işyeri kodu ve yürürlük tarihi zorunludur."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId, ct);
            if (employee is null) return Results.NotFound();
            if (request.EffectiveFrom < employee.HireDate || employee.TerminationDate is not null && request.EffectiveFrom > employee.TerminationDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["effectiveFrom"] = ["İşyeri ataması personelin çalışma aralığı içinde olmalıdır."] });
            var nextVersion = (await db.PayrollEmployeeWorkplaceAssignments.Where(x => x.TenantId == tenantId &&
                    x.EmployeeId == request.EmployeeId && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var record = new PayrollEmployeeWorkplaceAssignment { TenantId = tenantId, EmployeeId = request.EmployeeId,
                WorkplaceCode = workplaceCode, EffectiveFrom = request.EffectiveFrom, Version = nextVersion, CreatedByUserId = userId };
            db.PayrollEmployeeWorkplaceAssignments.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-assignment.change-requested", Resource = $"{record.EmployeeId:D}/{record.WorkplaceCode}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için eşzamanlı başka bir atama taslağı oluşturuldu." }); }
            return Results.Created($"/api/hr/payroll/workplace-assignments/{record.Id}",
                new { record.Id, record.EmployeeId, record.WorkplaceCode, record.EffectiveFrom, record.Version, record.Status });
        });

        payrollWorkplaceAssignments.MapPost("/{id:guid}/approve", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollEmployeeWorkplaceAssignments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Atama değişikliğini oluşturan kullanıcı kendi kaydını onaylayamaz." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen işyeri ataması ve güncel kayıt sürümü gerekli." });
            if (await db.PayrollEmployeeWorkplaceAssignments.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == record.EmployeeId &&
                    x.EffectiveFrom == record.EffectiveFrom && x.Status == "Approved", ct))
                return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için onaylı işyeri ataması zaten var." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Approved"; record.ApprovedByUserId = userId; record.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-assignment.approved", Resource = $"{record.EmployeeId:D}/{record.WorkplaceCode}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İşyeri ataması başka bir kullanıcı tarafından değiştirildi." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için başka bir atama onaylandı." }); }
            return Results.Ok(new { record.Id, record.Status, record.ApprovedAt });
        });

        payrollWorkplaceAssignments.MapPost("/{id:guid}/reject", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollEmployeeWorkplaceAssignments.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Atama değişikliğini oluşturan kullanıcı kendi kaydını reddedemez." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen işyeri ataması ve güncel kayıt sürümü gerekli." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Rejected"; record.RejectedByUserId = userId; record.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-assignment.rejected", Resource = $"{record.EmployeeId:D}/{record.WorkplaceCode}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İşyeri ataması başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { record.Id, record.Status, record.RejectedAt });
        });

        payrollWorkplaceCalendars.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var rows = await db.PayrollWorkplaceCalendars.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.WorkplaceCode).ThenByDescending(x => x.EffectiveFrom).ThenByDescending(x => x.Version).Take(1000)
                .Select(x => new PayrollWorkplaceCalendarView(x.Id, x.WorkplaceCode, x.EffectiveFrom, x.Version,
                    x.WeeklyMinutesJson, x.DateOverridesJson, x.PolicyReference, x.Status, x.CreatedByUserId,
                    x.ApprovedByUserId, x.CreatedAt, x.ApprovedAt,
                    x.Status == "PendingApproval" && x.CreatedByUserId != userId, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-calendar.list-viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollWorkplaceCalendars.MapPost("/", async (PayrollWorkplaceCalendarCreateRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var code = request.WorkplaceCode?.Trim().ToUpperInvariant();
            string? scheduleError = null;
            if (string.IsNullOrWhiteSpace(code) || !Regex.IsMatch(code, "^[A-Z0-9][A-Z0-9._-]{0,39}$") ||
                request.EffectiveFrom == default || string.IsNullOrWhiteSpace(request.PolicyReference) || request.PolicyReference.Length > 200 ||
                request.WeeklyMinutesJson is null || request.WeeklyMinutesJson.Length > 4096 ||
                request.DateOverridesJson is null || request.DateOverridesJson.Length > 32768 ||
                !PayrollWorkCalendarSchedule.TryParse(request.WeeklyMinutesJson, request.DateOverridesJson, request.EffectiveFrom, out _, out scheduleError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["calendar"] = [scheduleError ?? "İşyeri kodu, yürürlük tarihi, haftalık çizelge, tarih istisnaları ve şirket politika referansı geçerli olmalıdır."] });
            var nextVersion = (await db.PayrollWorkplaceCalendars.Where(x => x.TenantId == tenantId && x.WorkplaceCode == code && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var record = new PayrollWorkplaceCalendar { TenantId = tenantId, WorkplaceCode = code,
                EffectiveFrom = request.EffectiveFrom, Version = nextVersion, WeeklyMinutesJson = request.WeeklyMinutesJson,
                DateOverridesJson = request.DateOverridesJson, PolicyReference = request.PolicyReference.Trim(), CreatedByUserId = userId };
            db.PayrollWorkplaceCalendars.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-calendar.draft-created", Resource = $"{record.WorkplaceCode}/{record.EffectiveFrom:yyyy-MM-dd}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu işyeri ve yürürlük tarihi için eşzamanlı başka bir takvim taslağı oluşturuldu." }); }
            return Results.Created($"/api/hr/payroll/workplace-calendars/{record.Id}",
                new { record.Id, record.WorkplaceCode, record.EffectiveFrom, record.Version, record.Status });
        });

        payrollWorkplaceCalendars.MapPost("/{id:guid}/approve", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollWorkplaceCalendars.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Takvim taslağını oluşturan kullanıcı kendi kaydını onaylayamaz." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen takvim taslağı ve güncel kayıt sürümü gerekli." });
            if (!PayrollWorkCalendarSchedule.TryParse(record.WeeklyMinutesJson, record.DateOverridesJson, record.EffectiveFrom, out _, out var scheduleError))
                return Results.Conflict(new { error = scheduleError });
            if (await db.PayrollWorkplaceCalendars.AnyAsync(x => x.TenantId == tenantId && x.WorkplaceCode == record.WorkplaceCode &&
                    x.EffectiveFrom == record.EffectiveFrom && x.Status == "Approved", ct))
                return Results.Conflict(new { error = "Bu işyeri ve yürürlük tarihi için onaylı takvim zaten var." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Approved"; record.ApprovedByUserId = userId; record.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-calendar.approved", Resource = $"{record.WorkplaceCode}/{record.EffectiveFrom:yyyy-MM-dd}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İşyeri takvimi başka bir kullanıcı tarafından değiştirildi." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu işyeri ve yürürlük tarihi için başka bir takvim onaylandı." }); }
            return Results.Ok(new { record.Id, record.Status, record.ApprovedAt });
        });

        payrollWorkplaceCalendars.MapPost("/{id:guid}/reject", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollWorkplaceCalendars.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Takvim taslağını oluşturan kullanıcı kendi kaydını reddedemez." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen takvim taslağı ve güncel kayıt sürümü gerekli." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Rejected"; record.RejectedByUserId = userId; record.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-workplace-calendar.rejected", Resource = $"{record.WorkplaceCode}/{record.EffectiveFrom:yyyy-MM-dd}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "İşyeri takvimi başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { record.Id, record.Status, record.RejectedAt });
        });

        payrollEmployeeCalendarOverrides.MapGet("/", async (Guid? employeeId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var query = db.PayrollEmployeeWorkCalendarOverrides.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (employeeId is not null) query = query.Where(x => x.EmployeeId == employeeId.Value);
            var rows = await query.OrderBy(x => x.EmployeeId).ThenByDescending(x => x.EffectiveFrom).ThenByDescending(x => x.Version).Take(1000)
                .Select(x => new PayrollEmployeeCalendarOverrideView(x.Id, x.EmployeeId,
                    db.EmployeeRecords.Where(e => e.TenantId == tenantId && e.Id == x.EmployeeId)
                        .Select(e => e.PersonnelCode + " · " + e.FullName).FirstOrDefault() ?? "",
                    x.EffectiveFrom, x.Version, x.WeeklyMinutesJson, x.DateOverridesJson, x.PolicyReference,
                    x.Status, x.CreatedByUserId, x.ApprovedByUserId, x.CreatedAt, x.ApprovedAt,
                    x.Status == "PendingApproval" && x.CreatedByUserId != userId, Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-employee-calendar-override.list-viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollEmployeeCalendarOverrides.MapPost("/", async (PayrollEmployeeCalendarOverrideCreateRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            string? scheduleError = null;
            if (request.EmployeeId == Guid.Empty || request.EffectiveFrom == default || string.IsNullOrWhiteSpace(request.PolicyReference) ||
                request.PolicyReference.Length > 200 || request.WeeklyMinutesJson is null || request.WeeklyMinutesJson.Length > 4096 ||
                request.DateOverridesJson is null || request.DateOverridesJson.Length > 32768 ||
                !PayrollWorkCalendarSchedule.TryParse(request.WeeklyMinutesJson, request.DateOverridesJson, request.EffectiveFrom, out _, out scheduleError))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["calendar"] = [scheduleError ?? "Personel, yürürlük tarihi, haftalık çizelge, tarih istisnaları ve şirket politika referansı geçerli olmalıdır."] });
            var employee = await db.EmployeeRecords.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId, ct);
            if (employee is null) return Results.NotFound();
            if (request.EffectiveFrom < employee.HireDate || employee.TerminationDate is not null && request.EffectiveFrom > employee.TerminationDate)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["effectiveFrom"] = ["Kişi takvimi personelin çalışma aralığı içinde olmalıdır."] });
            var nextVersion = (await db.PayrollEmployeeWorkCalendarOverrides.Where(x => x.TenantId == tenantId &&
                    x.EmployeeId == request.EmployeeId && x.EffectiveFrom == request.EffectiveFrom)
                .Select(x => (int?)x.Version).MaxAsync(ct) ?? 0) + 1;
            var record = new PayrollEmployeeWorkCalendarOverride { TenantId = tenantId, EmployeeId = request.EmployeeId,
                EffectiveFrom = request.EffectiveFrom, Version = nextVersion, WeeklyMinutesJson = request.WeeklyMinutesJson,
                DateOverridesJson = request.DateOverridesJson, PolicyReference = request.PolicyReference.Trim(), CreatedByUserId = userId };
            db.PayrollEmployeeWorkCalendarOverrides.Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-employee-calendar-override.draft-created", Resource = $"{record.EmployeeId:D}/{record.EffectiveFrom:yyyy-MM-dd}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için eşzamanlı başka bir istisna taslağı oluşturuldu." }); }
            return Results.Created($"/api/hr/payroll/employee-calendar-overrides/{record.Id}",
                new { record.Id, record.EmployeeId, record.EffectiveFrom, record.Version, record.Status });
        });

        payrollEmployeeCalendarOverrides.MapPost("/{id:guid}/approve", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollEmployeeWorkCalendarOverrides.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Kişi takvimi istisnasını oluşturan kullanıcı kendi kaydını onaylayamaz." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen kişi takvimi istisnası ve güncel kayıt sürümü gerekli." });
            if (!PayrollWorkCalendarSchedule.TryParse(record.WeeklyMinutesJson, record.DateOverridesJson, record.EffectiveFrom, out _, out var scheduleError))
                return Results.Conflict(new { error = scheduleError });
            if (await db.PayrollEmployeeWorkCalendarOverrides.AnyAsync(x => x.TenantId == tenantId && x.EmployeeId == record.EmployeeId &&
                    x.EffectiveFrom == record.EffectiveFrom && x.Status == "Approved", ct))
                return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için onaylı takvim istisnası zaten var." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Approved"; record.ApprovedByUserId = userId; record.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-employee-calendar-override.approved", Resource = $"{record.EmployeeId:D}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kişi takvimi istisnası başka bir kullanıcı tarafından değiştirildi." }); }
            catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
            { return Results.Conflict(new { error = "Bu personel ve yürürlük tarihi için başka bir istisna onaylandı." }); }
            return Results.Ok(new { record.Id, record.Status, record.ApprovedAt });
        });

        payrollEmployeeCalendarOverrides.MapPost("/{id:guid}/reject", async (Guid id, PayrollRuleSetApproveRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId) || !IsTenantAdmin(user)) return Results.Forbid();
            var record = await db.PayrollEmployeeWorkCalendarOverrides.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.CreatedByUserId == userId) return Results.Conflict(new { error = "Kişi takvimi istisnasını oluşturan kullanıcı kendi kaydını reddedemez." });
            if (record.Status != "PendingApproval" || !TryDecodeRowVersion(request.RowVersion, out var version))
                return Results.Conflict(new { error = "Bekleyen kişi takvimi istisnası ve güncel kayıt sürümü gerekli." });
            db.Entry(record).Property(x => x.RowVersion).OriginalValue = version;
            record.Status = "Rejected"; record.RejectedByUserId = userId; record.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-employee-calendar-override.rejected", Resource = $"{record.EmployeeId:D}/v{record.Version}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Kişi takvimi istisnası başka bir kullanıcı tarafından değiştirildi." }); }
            return Results.Ok(new { record.Id, record.Status, record.RejectedAt });
        });

        payrollRuns.MapGet("/", async (ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var rows = await db.PayrollRunSnapshots.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.CreatedAt).Take(100)
                .Select(x => new PayrollRunView(x.Id, x.PeriodKind, x.PeriodStart, x.PeriodEnd, x.ProfileCode,
                    x.Status, x.EmployeeCount, x.SnapshotSha256, x.BlockersJson, x.CreatedAt, x.CreatedByUserId))
                .ToListAsync(ct);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.list-viewed", Resource = $"rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows);
        });

        payrollRuns.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (run is null) return Results.NotFound();
            if (!PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256))
                return Results.Conflict(new { error = "Bordro snapshot bütünlük özeti doğrulanamadı; kayıt incelenmeli." });
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.snapshot-viewed", Resource = $"{run.Id:D}/{run.SnapshotSha256}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new PayrollRunSnapshotDetail(run.Id, run.PeriodKind, run.PeriodStart, run.PeriodEnd,
                run.ProfileCode, run.Status, run.EmployeeCount, run.SnapshotSha256, run.BlockersJson,
                run.SnapshotJson, run.CreatedAt, run.CreatedByUserId));
        });

        payrollRuns.MapPost("/{id:guid}/component-preview", async (Guid id, ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != "Blocked") return Results.Conflict(new { error = "Yalnız bloke iç taslaklarda kalem önizlemesi yapılabilir." });
            if (!PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256))
                return Results.Conflict(new { error = "Bordro snapshot bütünlük özeti doğrulanamadı; kayıt incelenmeli." });

            string[] permittedPreviewBlockers = [
                "calculation-engine-not-enabled",
                "employer-declaration-profile-not-approved",
                "declaration-business-validation-not-configured"
            ];
            string[] blockers;
            try
            {
                blockers = JsonSerializer.Deserialize<string[]>(run.BlockersJson) ?? [];
            }
            catch (JsonException)
            {
                return Results.Conflict(new { error = "Bordro taslağı engel kaydı okunamıyor." });
            }
            if (blockers.Any(x => !permittedPreviewBlockers.Contains(x, StringComparer.Ordinal)))
                return Results.Conflict(new { error = "Bordro taslağında girdiye veya onaylı firma kuralına ilişkin çözülmemiş engeller var; kalem önizlemesi yapılamaz." });

            try
            {
                using var snapshotDocument = JsonDocument.Parse(run.SnapshotJson);
                var snapshot = snapshotDocument.RootElement;
                if (!TryGetJsonPropertyIgnoreCase(snapshot, "ruleSets", out var ruleSets) || ruleSets.ValueKind != JsonValueKind.Array ||
                    !TryGetJsonPropertyIgnoreCase(snapshot, "employees", out var employees) || employees.ValueKind != JsonValueKind.Array)
                    return Results.Conflict(new { error = "Bordro snapshot içinde kural sürümleri veya çalışan girdileri bulunamadı." });
                var employeeCount = employees.GetArrayLength();

                var applicableRules = new List<(JsonDocument Document, DateOnly From, DateOnly? To)>();
                foreach (var ruleSet in ruleSets.EnumerateArray())
                {
                    if (!IsApprovedPayrollRuleSnapshot(ruleSet) ||
                        !TryGetJsonDate(ruleSet, "effectiveFrom", out var ruleFrom) ||
                        !TryGetJsonOptionalDate(ruleSet, "effectiveTo", out var ruleTo) ||
                        ruleFrom > run.PeriodStart || ruleTo is not null && ruleTo < run.PeriodEnd ||
                        !TryGetJsonPropertyIgnoreCase(ruleSet, "rulesJson", out var rulesNode) || rulesNode.ValueKind != JsonValueKind.String) continue;
                    var rulesDocument = JsonDocument.Parse(rulesNode.GetString()!);
                    applicableRules.Add((rulesDocument, ruleFrom, ruleTo));
                }
                if (applicableRules.Count != 1)
                {
                    foreach (var entry in applicableRules) entry.Document.Dispose();
                    return Results.Conflict(new { error = "Snapshot içinde dönemi tek başına kapsayan onaylı kural sürümü yok veya birden fazla sürüm var." });
                }

                using var approvedRules = applicableRules[0].Document;
                if (!PayrollParameterSetValidator.TryValidate(approvedRules.RootElement, applicableRules[0].From,
                        applicableRules[0].To, true, out var validationError) ||
                    !PayrollParameterSetValidator.CoversProfile(approvedRules.RootElement, run.ProfileCode, run.PeriodStart, run.PeriodEnd))
                    return Results.Conflict(new { error = validationError ?? "Onaylı firma kuralı bu bordro profili ve dönemini kapsamıyor." });
                if (!TryGetJsonPropertyIgnoreCase(approvedRules.RootElement, "components", out var configuredComponents) ||
                    configuredComponents.ValueKind != JsonValueKind.Array || (long)employeeCount * configuredComponents.GetArrayLength() > 5000)
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["preview"] = ["Kalem önizlemesi en fazla 5.000 çalışan-kalem çifti hesaplar; grubu daha küçük run taslaklarına bölün."] });

                var previewEmployees = new List<object>();
                foreach (var employee in employees.EnumerateArray())
                {
                    if (!TryGetJsonPropertyIgnoreCase(employee, "id", out var idNode) || idNode.ValueKind != JsonValueKind.String ||
                        !Guid.TryParse(idNode.GetString(), out var employeeId) ||
                        !TryGetJsonPropertyIgnoreCase(employee, "personnelCode", out var codeNode) || codeNode.ValueKind != JsonValueKind.String ||
                        !TryGetJsonPropertyIgnoreCase(employee, "fullName", out var nameNode) || nameNode.ValueKind != JsonValueKind.String)
                        return Results.Conflict(new { error = "Snapshot içindeki çalışan kimliği eksik veya geçersiz." });
                    if (!PayrollRuleSetRuntime.TryEvaluateTarget(approvedRules.RootElement, applicableRules[0].From,
                            applicableRules[0].To, run.ProfileCode, run.PeriodStart, run.PeriodEnd, employee,
                            out var targetResult, out var formulaError))
                        return Results.Conflict(new { error = $"{codeNode.GetString()}: {formulaError}" });
                    previewEmployees.Add(new
                    {
                        employeeId,
                        personnelCode = codeNode.GetString(),
                        fullName = nameNode.GetString(),
                        targetKind = targetResult.TargetKind,
                        targetAmount = targetResult.TargetAmount,
                        periodTargetAmount = targetResult.PeriodTargetAmount,
                        grossCandidate = targetResult.GrossCandidate,
                        grossEarnings = targetResult.GrossEarnings,
                        employeeDeductions = targetResult.EmployeeDeductions,
                        netPay = targetResult.NetPay,
                        baseAggregates = targetResult.BaseAggregates,
                        components = targetResult.Components.Select(x => new
                        {
                            x.Key, x.Label, x.Category, x.Amount, x.Unit, x.MappingCodes, x.MappingTreatments
                        }).ToArray()
                    });
                }

                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                    Action = "hr.payroll-run.component-preview", Resource = $"{run.Id:D}/{run.SnapshotSha256}/employees:{previewEmployees.Count}" });
                await db.SaveChangesAsync(ct);
                return Results.Ok(new
                {
                    runId = run.Id,
                    stage = "FormulaTargetPreviewOnly",
                    payrollResultCreated = false,
                    warning = "Onaylı firma formülleriyle brüt/net hedef önizlemesidir; saklanan/tahakkuk etmiş bordro sonucu, vergi-SGK uygunluk onayı veya resmî beyan sonucu değildir.",
                    employees = previewEmployees
                });
            }
            catch (JsonException)
            {
                return Results.Conflict(new { error = "Bordro snapshot içindeki kural veya çalışan girdileri geçerli JSON değil." });
            }
        });

        payrollRuns.MapPost("/{id:guid}/calculate", async (Guid id, ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "change", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (run is null) return Results.NotFound();
            if (run.Status != "Blocked") return Results.Conflict(new { error = "Yalnız bloke iç taslak için formül sonucu oluşturulabilir." });
            if (!TryBuildPayrollFormulaResult(run, out var formulaResult, out var error))
                return Results.Conflict(new { error });

            var existing = await db.PayrollRunCalculations.Where(x => x.TenantId == tenantId && x.RunId == id).ToListAsync(ct);
            if (existing.Any(x => x.Status is "PendingApproval" or "Approved" or "Finalized"))
                return Results.Conflict(new { error = "Bu bordro taslağı için bekleyen veya onaylanmış formül sonucu zaten var." });
            var json = JsonSerializer.Serialize(formulaResult);
            var result = new PayrollRunCalculation
            {
                TenantId = tenantId,
                RunId = run.Id,
                Version = existing.Count == 0 ? 1 : existing.Max(x => x.Version) + 1,
                RunSnapshotSha256 = run.SnapshotSha256,
                ResultJson = json,
                ResultSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))),
                Status = "PendingApproval",
                CreatedByUserId = userId
            };
            db.PayrollRunCalculations.Add(result);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.formula-result-created", Resource = $"{run.Id:D}/{result.Id:D}/{result.ResultSha256}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { return Results.Conflict(new { error = "Aynı bordro taslağı için eşzamanlı bir formül sonucu kaydedildi; taslak listesini yenileyin." }); }
            return Results.Created($"/api/hr/payroll/runs/{run.Id}/calculations/{result.Id}", new PayrollRunCalculationView(
                result.Id, result.RunId, result.Version, result.RunSnapshotSha256, result.ResultSha256,
                result.Status, result.ResultJson, result.CreatedByUserId, result.CreatedAt, result.ApprovedByUserId, result.ApprovedAt));
        });

        payrollRuns.MapGet("/{id:guid}/calculations", async (Guid id, ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (run is null) return Results.NotFound();
            var rows = await db.PayrollRunCalculations.AsNoTracking().Where(x => x.TenantId == tenantId && x.RunId == id)
                .OrderByDescending(x => x.Version).ToListAsync(ct);
            if (!PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) || rows.Any(x =>
                    x.RunSnapshotSha256 != run.SnapshotSha256 || !PayrollSnapshotHashMatches(x.ResultJson, x.ResultSha256)))
                return Results.Conflict(new { error = "Bordro girdisi veya formül sonucu bütünlük özeti doğrulanamadı." });
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.formula-results-viewed", Resource = $"{id:D}/rows:{rows.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(rows.Select(x => new PayrollRunCalculationView(x.Id, x.RunId, x.Version,
                x.RunSnapshotSha256, x.ResultSha256, x.Status, x.ResultJson, x.CreatedByUserId, x.CreatedAt,
                x.ApprovedByUserId, x.ApprovedAt)).ToArray());
        });

        payrollRuns.MapPost("/{id:guid}/calculations/{calculationId:guid}/approve", async (Guid id, Guid calculationId,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var result = await db.PayrollRunCalculations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || result is null) return Results.NotFound();
            if (result.Status != "PendingApproval") return Results.Conflict(new { error = "Yalnız bekleyen formül sonucu onaylanabilir." });
            if (result.CreatedByUserId == userId) return Results.Conflict(new { error = "Formül sonucunu oluşturan kullanıcı kendi sonucunu onaylayamaz." });
            if (run.Status != "Blocked" || result.RunSnapshotSha256 != run.SnapshotSha256 ||
                !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) || !PayrollSnapshotHashMatches(result.ResultJson, result.ResultSha256))
                return Results.Conflict(new { error = "Girdi veya sonuç özeti değişmiş ya da doğrulanamıyor; onay reddedildi." });
            result.Status = "Approved"; result.ApprovedByUserId = userId; result.ApprovedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.formula-result-approved", Resource = $"{run.Id:D}/{result.Id:D}/{result.ResultSha256}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Formül sonucu eşzamanlı değişti; listeyi yenileyin." }); }
            return Results.Ok(new PayrollRunCalculationView(result.Id, result.RunId, result.Version,
                result.RunSnapshotSha256, result.ResultSha256, result.Status, result.ResultJson, result.CreatedByUserId,
                result.CreatedAt, result.ApprovedByUserId, result.ApprovedAt));
        });

        payrollRuns.MapPost("/{id:guid}/calculations/{calculationId:guid}/reject", async (Guid id, Guid calculationId,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var result = await db.PayrollRunCalculations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (result is null) return Results.NotFound();
            if (result.Status != "PendingApproval") return Results.Conflict(new { error = "Yalnız bekleyen formül sonucu reddedilebilir." });
            if (result.CreatedByUserId == userId) return Results.Conflict(new { error = "Formül sonucunu oluşturan kullanıcı kendi sonucunu reddedemez." });
            if (!PayrollSnapshotHashMatches(result.ResultJson, result.ResultSha256))
                return Results.Conflict(new { error = "Formül sonucu bütünlük özeti doğrulanamadı." });
            result.Status = "Rejected"; result.RejectedByUserId = userId; result.RejectedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.formula-result-rejected", Resource = $"{id:D}/{result.Id:D}/{result.ResultSha256}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Formül sonucu eşzamanlı değişti; listeyi yenileyin." }); }
            return Results.Ok(new PayrollRunCalculationView(result.Id, result.RunId, result.Version,
                result.RunSnapshotSha256, result.ResultSha256, result.Status, result.ResultJson, result.CreatedByUserId,
                result.CreatedAt, result.ApprovedByUserId, result.ApprovedAt));
        });

        payrollRuns.MapPost("/{id:guid}/calculations/{calculationId:guid}/finalize", async (Guid id, Guid calculationId,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var result = await db.PayrollRunCalculations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || result is null) return Results.NotFound();
            if (result.Status != "Approved") return Results.Conflict(new { error = "Yalnız ikinci kişi tarafından onaylanmış sonuç kesinleştirilebilir." });
            if (result.ApprovedByUserId == userId) return Results.Conflict(new { error = "Onaylayan kullanıcı sonucu kesinleştiremez; görev ayrılığı gereklidir." });
            if (run.Status != "Blocked" || result.RunSnapshotSha256 != run.SnapshotSha256 ||
                !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) || !PayrollSnapshotHashMatches(result.ResultJson, result.ResultSha256))
                return Results.Conflict(new { error = "Girdi veya sonuç özeti doğrulanamadı; kesinleştirme reddedildi." });
            PayrollFormulaResultEnvelope? finalizedEnvelope;
            try { finalizedEnvelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(result.ResultJson); }
            catch (JsonException) { finalizedEnvelope = null; }
            if (finalizedEnvelope is null || finalizedEnvelope.RunId != run.Id || finalizedEnvelope.RunSnapshotSha256 != run.SnapshotSha256 ||
                finalizedEnvelope.IsOfficialPayrollResult)
                return Results.Conflict(new { error = "Kesinleştirilecek kayıt doğrulanmış iç bordro sonucu zarfı değil." });
            result.Status = "Finalized"; result.FinalizedByUserId = userId; result.FinalizedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.internal-result-finalized", Resource = $"{run.Id:D}/{result.Id:D}/{result.ResultSha256}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Sonuç eşzamanlı değişti; listeyi yenileyin." }); }
            return Results.Ok(new { calculationId = result.Id, status = result.Status, finalizedAt = result.FinalizedAt,
                officialPayrollResult = false, notice = "İç bordro sonucu kesinleştirildi. Firma beyan profili/alan eşlemesi ve resmî doğrulama tanımlı olmadığından bu işlem resmî beyan veya tahakkuk değildir." });
        });

        payrollRuns.MapGet("/{id:guid}/calculations/{calculationId:guid}/manual-package", async (Guid id, Guid calculationId,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var result = await db.PayrollRunCalculations.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || result is null) return Results.NotFound();
            if (result.Status != "Finalized") return Results.Conflict(new { error = "Manuel paket yalnız kesinleştirilmiş iç sonuçtan üretilebilir." });
            if (result.RunSnapshotSha256 != run.SnapshotSha256 || !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) ||
                !PayrollSnapshotHashMatches(result.ResultJson, result.ResultSha256))
                return Results.Conflict(new { error = "Paket üretimi öncesi girdi ve sonuç özetleri doğrulanamadı." });
            var envelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(result.ResultJson);
            if (envelope is null || envelope.RunId != run.Id || envelope.RunSnapshotSha256 != run.SnapshotSha256 || envelope.IsOfficialPayrollResult)
                return Results.Conflict(new { error = "Beyan üretimi için uygun iç sonuç zarfı bulunamadı." });
            var packageBytes = BuildPayrollManualPackage(run, result, envelope);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.manual-package-generated", Resource = $"{run.Id:D}/{result.Id:D}/{result.ResultSha256}" });
            await db.SaveChangesAsync(ct);
            return Results.File(packageBytes, "application/zip", $"bordro-manuel-paket-{run.PeriodStart:yyyy-MM}.zip");
        });

        payrollRuns.MapGet("/{id:guid}/calculations/{calculationId:guid}/payslips", async (Guid id, Guid calculationId,
            ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "view", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var calculation = await db.PayrollRunCalculations.AsNoTracking().SingleOrDefaultAsync(x =>
                x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || calculation is null) return Results.NotFound();
            if (calculation.Status != "Finalized") return Results.Conflict(new { error = "Pusulalar yalnızca kesinleştirilmiş iç bordro sonucundan üretilebilir." });
            if (calculation.RunSnapshotSha256 != run.SnapshotSha256 ||
                !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) ||
                !PayrollSnapshotHashMatches(calculation.ResultJson, calculation.ResultSha256))
                return Results.Conflict(new { error = "Pusula üretiminden önce girdi ve sonuç özetleri doğrulanamadı." });
            PayrollFormulaResultEnvelope? envelope;
            try { envelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(calculation.ResultJson); }
            catch (JsonException) { envelope = null; }
            if (envelope is null || envelope.RunId != run.Id || envelope.RunSnapshotSha256 != run.SnapshotSha256 ||
                envelope.IsOfficialPayrollResult || envelope.Employees.Count == 0)
                return Results.Conflict(new { error = "Pusula üretimi için uygun iç bordro sonucu bulunamadı." });

            static string Html(string? value) => System.Net.WebUtility.HtmlEncode(value ?? "");
            static string Money(decimal value) => value.ToString("N2", CultureInfo.GetCultureInfo("tr-TR"));
            var slips = new StringBuilder();
            foreach (var employee in envelope.Employees)
            {
                var rows = string.Join("", employee.Components.Select(component =>
                    $"<tr><td>{Html(component.Label)}</td><td>{Html(component.Category)}</td><td class=\"amount\">{Money(component.Amount)} {Html(component.Unit)}</td></tr>"));
                slips.Append($"<article class=\"slip\"><header><div><p class=\"eyebrow\">NEXORA · İÇ BORDRO ÖZETİ</p><h1>{Html(employee.FullName)}</h1><p>Personel kodu: {Html(employee.PersonnelCode)} · Dönem: {run.PeriodStart:dd.MM.yyyy} – {run.PeriodEnd:dd.MM.yyyy}</p></div><span class=\"badge\">İÇ KULLANIM</span></header><div class=\"notice\"><strong>Resmî bordro pusulası değildir.</strong> Şirket formüllerine göre hazırlanmış, kesinleştirilmiş iç hesap özetidir. Yasal bordro ve tahakkuk doğrulaması yapılmamıştır.</div><table><thead><tr><th>Ücret kalemi</th><th>Tür</th><th class=\"amount\">Tutar</th></tr></thead><tbody>{rows}</tbody></table><dl><div><dt>Ücret hedefi</dt><dd>{Money(employee.PeriodTargetAmount)} TRY</dd></div><div><dt>Brüt kazanç</dt><dd>{Money(employee.GrossEarnings)} TRY</dd></div><div><dt>Çalışan kesintileri</dt><dd>{Money(employee.EmployeeDeductions)} TRY</dd></div><div class=\"net\"><dt>Net ödeme adayı</dt><dd>{Money(employee.NetPay)} TRY</dd></div></dl><footer>Hesaplama sürümü {calculation.Version} · Sonuç SHA-256: {calculation.ResultSha256}</footer></article>");
            }
            var document = $"<!doctype html><html lang=\"tr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>İç bordro özetleri · {run.PeriodStart:yyyy-MM}</title><style>body{{font:14px Arial,sans-serif;color:#17243b;background:#eef2f7;margin:0;padding:24px}}.toolbar{{max-width:900px;margin:0 auto 16px;text-align:right}}button{{padding:10px 16px;border:0;border-radius:6px;background:#1264c8;color:white;font-weight:600;cursor:pointer}}.slip{{box-sizing:border-box;max-width:900px;margin:0 auto 24px;padding:36px;background:white;border:1px solid #dce4ef;border-radius:10px;box-shadow:0 4px 18px #142b4610;page-break-after:always}}header{{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #dce4ef;padding-bottom:18px}}h1{{margin:6px 0;font-size:24px}}p{{color:#5c6d84}}.eyebrow{{font-size:11px;letter-spacing:1.4px;color:#1264c8;font-weight:bold}}.badge{{border:1px solid #b9d2f0;background:#eef6ff;color:#155da9;border-radius:20px;padding:7px 12px;font-size:11px}}.notice{{margin:20px 0;padding:14px;background:#fff8e8;border:1px solid #f1dca7;border-radius:6px;color:#755817;line-height:1.5}}table{{width:100%;border-collapse:collapse;margin:20px 0}}th,td{{padding:11px;border-bottom:1px solid #e5eaf1;text-align:left}}th{{background:#f5f7fa}}.amount{{text-align:right;white-space:nowrap}}dl{{margin-left:auto;max-width:380px}}dl div{{display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #e5eaf1}}dt{{color:#5c6d84}}dd{{margin:0;font-weight:600}}.net{{font-size:17px;background:#f4f7fb}}footer{{margin-top:24px;border-top:1px solid #e5eaf1;padding-top:12px;color:#7b8798;font-size:10px;overflow-wrap:anywhere}}@media print{{body{{background:white;padding:0}}.toolbar{{display:none}}.slip{{box-shadow:none;border:0;margin:0 auto;padding:18mm;min-height:260mm}}}}</style><body><div class=\"toolbar\"><button onclick=\"window.print()\">Yazdır / PDF kaydet</button></div>{slips}</body></html>";
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.internal-payslips-generated", Resource = $"{run.Id:D}/{calculation.Id:D}/{calculation.ResultSha256}" });
            await db.SaveChangesAsync(ct);
            return Results.Content(document, "text/html; charset=utf-8");
        });

        payrollRuns.MapPost("/{id:guid}/calculations/{calculationId:guid}/1003a-xml", async (Guid id, Guid calculationId,
            PayrollGib1003ARequest declaration, ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer,
            TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "approve", ct)) return Results.Forbid();
            var run = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            var result = await db.PayrollRunCalculations.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RunId == id && x.Id == calculationId, ct);
            if (run is null || result is null) return Results.NotFound();
            if (result.Status != "Finalized" || result.FinalizedByUserId == userId)
                return Results.Conflict(new { error = "1003A XML üretimi için başka kullanıcı tarafından kesinleştirilmiş sonuç ve farklı beyan operatörü gerekir." });
            if (result.RunSnapshotSha256 != run.SnapshotSha256 || !PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256) ||
                !PayrollSnapshotHashMatches(result.ResultJson, result.ResultSha256))
                return Results.Conflict(new { error = "XML üretiminden önce snapshot ve hesaplama hash'leri doğrulanamadı." });
            PayrollFormulaResultEnvelope? envelope;
            try { envelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(result.ResultJson); }
            catch (JsonException) { envelope = null; }
            if (envelope is null || envelope.RunId != run.Id || envelope.RunSnapshotSha256 != run.SnapshotSha256)
                return Results.Conflict(new { error = "Kesinleştirilmiş hesaplama sonucu bu bordro snapshot'ına bağlı değil." });
            var approvedEmployerProfile = GetApproved1003AEmployerProfile(run);
            if (approvedEmployerProfile is null)
                return Results.Conflict(new { error = "1003A XML üretimi için bu dönemi kapsayan, ikinci kişi tarafından onaylanmış 1003A/MUHSGK_21 profili ve işveren bilgileri bulunmalıdır." });
            if (declaration is null || declaration.Employees is null || declaration.WithholdingLines is null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["declaration"] = ["1003A işveren, stopaj ve çalışan bildirim alanları zorunludur."] });
            if (declaration.TaxOfficeCode != approvedEmployerProfile.TaxOfficeCode || declaration.TaxNumber != approvedEmployerProfile.TaxNumber ||
                declaration.EmployerTitle != approvedEmployerProfile.EmployerTitle || declaration.PhoneAreaCode != approvedEmployerProfile.PhoneAreaCode ||
                declaration.PhoneNumber != approvedEmployerProfile.PhoneNumber || declaration.BranchNumber != approvedEmployerProfile.BranchNumber)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["employer"] = ["XML işveren alanları, ikinci yetkili tarafından onaylanmış firma beyan profilindeki verilerle aynı olmalıdır."] });
            if (declaration.Employees.Select(x => x.EmployeeId).Distinct().Count() != declaration.Employees.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["employees"] = ["Her bordro çalışanı için yalnız bir 1003A bildirim satırı olmalıdır."] });
            var rowsById = declaration.Employees.ToDictionary(x => x.EmployeeId);
            if (rowsById.Count != envelope.Employees.Count || envelope.Employees.Any(employee => !rowsById.TryGetValue(employee.EmployeeId, out var row) ||
                    decimal.Round(row.EarnedWage + row.BonusAndPremium, 2) != decimal.Round(employee.GrossEarnings, 2)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["employees"] = ["SGK brüt kazançları ve prim/ikramiye toplamları, kesinleştirilmiş run çalışanlarıyla ve brüt kazanç tutarlarıyla birebir eşleşmelidir."] });
            if (decimal.Round(declaration.WithholdingLines.Sum(x => x.GrossAmount), 2) !=
                    decimal.Round(envelope.Employees.Sum(x => x.GrossEarnings), 2) ||
                decimal.Round(declaration.WithholdingLines.Sum(x => x.WithheldAmount), 2) !=
                    decimal.Round(declaration.Employees.Sum(x => x.IncomeTaxWithheld), 2))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["withholdingLines"] = ["Beyanname stopaj gayrisafi ve kesinti toplamları, çalışan satırları ve kesinleştirilmiş hesaplamayla eşleşmelidir."] });
            if (!PayrollGib1003AExporter.TryBuild(run, result, envelope, declaration, out var xmlBytes, out var errors))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["declaration"] = errors.ToArray() });
            var xmlHash = Convert.ToHexString(SHA256.HashData(xmlBytes));
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.gib-1003a-xml-generated", Resource = $"{run.Id:D}/{result.Id:D}/{result.ResultSha256}/{xmlHash}" });
            await db.SaveChangesAsync(ct);
            return Results.File(xmlBytes, "application/xml", $"MUHSGK_21_{run.PeriodStart:yyyyMM}.xml");
        });

        payrollRuns.MapPost("/", async (PayrollRunCreateRequest request, ClaimsPrincipal user,
            IPlatformPermissionAuthorizer authorizer, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var role = user.FindFirstValue("role") ?? "";
            if (!await HasCompensationPermissionAsync(authorizer, tenantId, userId, role, "change", ct)) return Results.Forbid();
            if (request.PeriodKind is not ("CalendarMonth" or "EmployerDefined") ||
                request.PeriodStart == default || request.PeriodEnd < request.PeriodStart ||
                request.PeriodEnd.DayNumber - request.PeriodStart.DayNumber > 365 ||
                request.PeriodStart.Year != request.PeriodEnd.Year && request.PeriodKind == "CalendarMonth" ||
                request.PeriodKind == "CalendarMonth" && (request.PeriodStart.Day != 1 ||
                    request.PeriodEnd != request.PeriodStart.AddMonths(1).AddDays(-1)) ||
                request.ProfileCode is not ("TR-4A-PRIVATE") || request.EmployeeIds is null ||
                request.EmployeeIds.Count is < 1 or > 500 || request.EmployeeIds.Distinct().Count() != request.EmployeeIds.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["run"] = ["Dönem türü, geçerli en fazla 366 günlük tarih aralığı, TR-4A-PRIVATE profili ve 1–500 benzersiz personel seçilmelidir. Takvim ayı dönemi ayın ilk ve son gününü kapsamalıdır."] });

            PayrollRunSnapshot? correctionSource = null;
            PayrollRunCalculation? correctionCalculation = null;
            if (request.CorrectionOfRunId is Guid correctionOfRunId)
            {
                correctionSource = await db.PayrollRunSnapshots.AsNoTracking().SingleOrDefaultAsync(x =>
                    x.TenantId == tenantId && x.Id == correctionOfRunId, ct);
                correctionCalculation = await db.PayrollRunCalculations.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    x.RunId == correctionOfRunId && x.Status == "Finalized").OrderByDescending(x => x.Version).FirstOrDefaultAsync(ct);
                if (correctionSource is null || correctionCalculation is null || correctionSource.ProfileCode != request.ProfileCode ||
                    correctionSource.PeriodStart != request.PeriodStart || correctionSource.PeriodEnd != request.PeriodEnd ||
                    correctionSource.PeriodKind != request.PeriodKind || correctionSource.TenantId != tenantId ||
                    correctionCalculation.RunSnapshotSha256 != correctionSource.SnapshotSha256 ||
                    !PayrollSnapshotHashMatches(correctionSource.SnapshotJson, correctionSource.SnapshotSha256) ||
                    !PayrollSnapshotHashMatches(correctionCalculation.ResultJson, correctionCalculation.ResultSha256))
                    return Results.Conflict(new { error = "Düzeltme yalnız aynı firma/dönem/profil için bütünlük özeti doğrulanan kesinleştirilmiş bir bordroya bağlanabilir." });
            }

            var employees = await db.EmployeeRecords.AsNoTracking().Where(x => x.TenantId == tenantId && request.EmployeeIds.Contains(x.Id))
                .OrderBy(x => x.PersonnelCode).ToListAsync(ct);
            if (employees.Count != request.EmployeeIds.Count) return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeIds"] = ["Seçilen personellerin tümü bu firmada bulunmalıdır."] });

            var employeeIds = employees.Select(x => x.Id).ToArray();
            var compensation = await db.PayrollCompensationRecords.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    employeeIds.Contains(x.EmployeeId) && x.Status == "Approved" && x.EffectiveFrom <= request.PeriodEnd)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.EffectiveFrom).ThenBy(x => x.Version).Take(50001).ToListAsync(ct);
            var attendance = await db.EmployeeAttendanceRecords.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    employeeIds.Contains(x.EmployeeId) && x.WorkDate >= request.PeriodStart && x.WorkDate <= request.PeriodEnd)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.WorkDate).Take(50001).ToListAsync(ct);
            var leave = await db.EmployeeLeaveRequests.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    employeeIds.Contains(x.EmployeeId) && x.StartDate <= request.PeriodEnd && x.EndDate >= request.PeriodStart)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.StartDate).Take(50001).ToListAsync(ct);
            var workplaceAssignments = await db.PayrollEmployeeWorkplaceAssignments.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    employeeIds.Contains(x.EmployeeId) && x.Status == "Approved" && x.EffectiveFrom <= request.PeriodEnd)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.EffectiveFrom).ThenBy(x => x.Version).Take(50001).ToListAsync(ct);
            var workplaceCalendars = await db.PayrollWorkplaceCalendars.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    x.Status == "Approved" && x.EffectiveFrom <= request.PeriodEnd)
                .OrderBy(x => x.WorkplaceCode).ThenBy(x => x.EffectiveFrom).ThenBy(x => x.Version).Take(50001).ToListAsync(ct);
            var employeeCalendarOverrides = await db.PayrollEmployeeWorkCalendarOverrides.AsNoTracking().Where(x => x.TenantId == tenantId &&
                    employeeIds.Contains(x.EmployeeId) && x.Status == "Approved" && x.EffectiveFrom <= request.PeriodEnd)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.EffectiveFrom).ThenBy(x => x.Version).Take(50001).ToListAsync(ct);
            var priorEmployerTaxBaseDeclarations = await db.PayrollPriorEmployerTaxBaseDeclarations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && employeeIds.Contains(x.EmployeeId) && x.TaxYear == request.PeriodStart.Year)
                .OrderBy(x => x.EmployeeId).ThenBy(x => x.Version).Take(50001).ToListAsync(ct);
            var priorApprovedPayrollRuns = await db.PayrollRunCalculations.AsNoTracking().Where(x =>
                    x.TenantId == tenantId && (x.Status == "Approved" || x.Status == "Finalized") && x.ApprovedByUserId != null &&
                    x.ApprovedByUserId != x.CreatedByUserId && x.ApprovedAt != null)
                .Join(db.PayrollRunSnapshots.AsNoTracking().Where(x => x.TenantId == tenantId &&
                        x.ProfileCode == request.ProfileCode && x.PeriodStart.Year == request.PeriodStart.Year && x.PeriodEnd < request.PeriodStart),
                    calculation => new { calculation.TenantId, RunId = calculation.RunId },
                    run => new { run.TenantId, RunId = run.Id },
                    (calculation, run) => new { Run = run, Calculation = calculation })
                .OrderBy(x => x.Run.PeriodStart).ThenBy(x => x.Run.PeriodEnd).ThenBy(x => x.Calculation.Version)
                .Take(5001).ToListAsync(ct);
            if (compensation.Count > 50000 || attendance.Count > 50000 || leave.Count > 50000 ||
                workplaceAssignments.Count > 50000 || workplaceCalendars.Count > 50000 || employeeCalendarOverrides.Count > 50000 ||
                priorEmployerTaxBaseDeclarations.Count > 50000 || priorApprovedPayrollRuns.Count > 5000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["snapshot"] = ["Snapshot boyutu sınırı aşıldı; seçimi daha küçük bordro taslaklarına bölün."] });

            var sameEmployerYtdPeriods = employeeIds.ToDictionary(x => x, _ => new List<object>());
            var sameEmployerYtdDateRanges = employeeIds.ToDictionary(x => x, _ => new List<(DateOnly Start, DateOnly End)>());
            var priorPayrollResultIntegrityFailure = false;
            foreach (var item in priorApprovedPayrollRuns)
            {
                if (!PayrollSnapshotHashMatches(item.Calculation.ResultJson, item.Calculation.ResultSha256) ||
                    !PayrollSnapshotHashMatches(item.Run.SnapshotJson, item.Run.SnapshotSha256) ||
                    item.Calculation.RunSnapshotSha256 != item.Run.SnapshotSha256)
                { priorPayrollResultIntegrityFailure = true; continue; }
                try
                {
                    using var priorResult = JsonDocument.Parse(item.Calculation.ResultJson);
                    var root = priorResult.RootElement;
                    if (!TryGetJsonPropertyIgnoreCase(root, "runId", out var sourceRunNode) || sourceRunNode.ValueKind != JsonValueKind.String ||
                        !Guid.TryParse(sourceRunNode.GetString(), out var sourceRunId) || sourceRunId != item.Run.Id ||
                        !TryGetJsonPropertyIgnoreCase(root, "runSnapshotSha256", out var sourceSnapshotHashNode) ||
                        sourceSnapshotHashNode.ValueKind != JsonValueKind.String || sourceSnapshotHashNode.GetString() != item.Run.SnapshotSha256 ||
                        !TryGetJsonPropertyIgnoreCase(root, "stage", out var stageNode) || stageNode.ValueKind != JsonValueKind.String || stageNode.GetString() != "FormulaTargetPreviewOnly" ||
                        !TryGetJsonPropertyIgnoreCase(root, "isOfficialPayrollResult", out var officialNode) || officialNode.ValueKind != JsonValueKind.False ||
                        !TryGetJsonPropertyIgnoreCase(root, "employees", out var priorEmployees) || priorEmployees.ValueKind != JsonValueKind.Array)
                    { priorPayrollResultIntegrityFailure = true; continue; }
                    foreach (var priorEmployee in priorEmployees.EnumerateArray())
                    {
                        if (!TryGetJsonPropertyIgnoreCase(priorEmployee, "employeeId", out var priorEmployeeIdNode) ||
                            priorEmployeeIdNode.ValueKind != JsonValueKind.String || !Guid.TryParse(priorEmployeeIdNode.GetString(), out var priorEmployeeId) ||
                            !sameEmployerYtdPeriods.TryGetValue(priorEmployeeId, out var periodsForEmployee) ||
                            !TryGetJsonPropertyIgnoreCase(priorEmployee, "baseAggregates", out var aggregates) || aggregates.ValueKind != JsonValueKind.Array)
                            continue;
                        sameEmployerYtdDateRanges[priorEmployeeId].Add((item.Run.PeriodStart, item.Run.PeriodEnd));
                        periodsForEmployee.Add(new
                        {
                            periodStart = item.Run.PeriodStart,
                            periodEnd = item.Run.PeriodEnd,
                            runId = item.Run.Id,
                            calculationId = item.Calculation.Id,
                            calculationVersion = item.Calculation.Version,
                            approvedByUserId = item.Calculation.ApprovedByUserId,
                            approvedAt = item.Calculation.ApprovedAt,
                            resultSha256 = item.Calculation.ResultSha256,
                            baseAggregates = JsonSerializer.Deserialize<JsonElement>(aggregates.GetRawText())
                        });
                    }
                }
                catch (JsonException) { priorPayrollResultIntegrityFailure = true; }
            }

            var ruleSets = await db.PayrollRuleSets.AsNoTracking().Where(x => x.TenantId == tenantId && x.JurisdictionCode == "TR" &&
                    x.Status == "Approved" && x.EffectiveFrom <= request.PeriodEnd && (x.EffectiveTo == null || x.EffectiveTo >= request.PeriodStart))
                .OrderBy(x => x.EffectiveFrom).ThenBy(x => x.Version).ToListAsync(ct);
            var blockers = new HashSet<string>(StringComparer.Ordinal)
            {
                "calculation-engine-not-enabled",
                "employer-declaration-profile-not-approved",
                "declaration-business-validation-not-configured"
            };
            if (priorPayrollResultIntegrityFailure) blockers.Add("same-employer-ytd-source-integrity-failed");
            if (request.PeriodStart.Year != request.PeriodEnd.Year) blockers.Add("period-crosses-tax-year-boundary");
            var coveringRuleSets = ruleSets.Where(x => x.EffectiveFrom <= request.PeriodStart &&
                (x.EffectiveTo is null || x.EffectiveTo >= request.PeriodEnd)).ToArray();
            var approvedPayBasisCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var configuredPayrollInputSources = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var approvedDeclarationProfileConfigured = false;
            if (coveringRuleSets.Length != 1) blockers.Add(coveringRuleSets.Length == 0 ? "approved-rule-set-missing" : "approved-rule-set-ambiguous");
            else
            {
                try
                {
                    using var approvedRules = JsonDocument.Parse(coveringRuleSets[0].RulesJson);
                    approvedPayBasisCodes = PayrollParameterSetValidator.PayBasesCovering(approvedRules.RootElement,
                        request.ProfileCode!, request.PeriodStart, request.PeriodEnd);
                    configuredPayrollInputSources = PayrollParameterSetValidator.EffectiveComponentInputSources(
                        approvedRules.RootElement, request.ProfileCode!, request.PeriodStart, request.PeriodEnd);
                    var ruleSetComplete = PayrollParameterSetValidator.TryValidate(approvedRules.RootElement, coveringRuleSets[0].EffectiveFrom,
                        coveringRuleSets[0].EffectiveTo, true, out _);
                    if (!ruleSetComplete)
                    {
                        blockers.Add("approved-rule-set-incomplete");
                        blockers.Add("tax-social-security-accounting-mappings-not-configured");
                    }
                    if (!PayrollParameterSetValidator.CoversProfile(approvedRules.RootElement, request.ProfileCode!,
                        request.PeriodStart, request.PeriodEnd)) blockers.Add("approved-rule-set-profile-incomplete");
                    else if (ruleSetComplete)
                        approvedDeclarationProfileConfigured = PayrollParameterSetValidator.HasKnownDeclarationProfile(
                            approvedRules.RootElement, request.ProfileCode!, request.PeriodStart, request.PeriodEnd);
                }
                catch (JsonException)
                {
                    blockers.Add("approved-rule-set-incomplete");
                }
            }
            if (approvedDeclarationProfileConfigured)
                blockers.Remove("employer-declaration-profile-not-approved");

            var attendanceCompletenessRequired = configuredPayrollInputSources.Contains("attendance.workedMinutes") ||
                configuredPayrollInputSources.Contains("attendance.overtimeMinutes");
            if (attendanceCompletenessRequired)
                foreach (var employee in employees.Where(employee => attendance.Any(x => x.EmployeeId == employee.Id && x.ApprovalStatus != "Approved")))
                    blockers.Add($"attendance-approval-pending:{employee.Id:D}");
            var workCalendarRequired = attendanceCompletenessRequired || configuredPayrollInputSources.Contains("period.scheduledMinutes") ||
                configuredPayrollInputSources.Contains("period.scheduledDays");
            var scheduledMinutesByEmployee = employees.ToDictionary(x => x.Id, _ => 0L);
            var scheduledDaysByEmployee = employees.ToDictionary(x => x.Id, _ => 0);

            foreach (var employee in employees)
            {
                if (configuredPayrollInputSources.Contains("sameEmployerYtdBase.amount") &&
                    !HasContinuousPayrollPeriodCoverage(employee.HireDate, request.PeriodStart, sameEmployerYtdDateRanges[employee.Id]))
                    blockers.Add($"same-employer-ytd-periods-incomplete:{employee.Id:D}");
                if (!priorEmployerTaxBaseDeclarations.Any(x => x.EmployeeId == employee.Id && x.TaxYear == request.PeriodStart.Year && x.Status == "Approved"))
                    blockers.Add($"prior-employer-tax-base-declaration-missing:{employee.Id:D}:{request.PeriodStart.Year}");
                if (employee.HireDate > request.PeriodEnd || employee.TerminationDate is not null && employee.TerminationDate < request.PeriodStart)
                    blockers.Add($"employee-outside-employment:{employee.Id:D}");
                else if (employee.HireDate > request.PeriodStart || employee.TerminationDate is not null && employee.TerminationDate < request.PeriodEnd)
                    blockers.Add($"employment-proration-not-configured:{employee.Id:D}");
                var records = compensation.Where(x => x.EmployeeId == employee.Id).ToArray();
                var effectiveAtStart = records.Where(x => x.EffectiveFrom <= request.PeriodStart).LastOrDefault();
                if (effectiveAtStart is null) blockers.Add($"approved-compensation-missing:{employee.Id:D}");
                if (records.Any(x => x.EffectiveFrom > request.PeriodStart && x.EffectiveFrom <= request.PeriodEnd))
                    blockers.Add($"compensation-change-within-period:{employee.Id:D}");
                var activeCompensation = records.Where(x => x.EffectiveFrom > request.PeriodStart && x.EffectiveFrom <= request.PeriodEnd).ToList();
                if (effectiveAtStart is not null) activeCompensation.Add(effectiveAtStart);
                foreach (var salary in activeCompensation.Where(x => !approvedPayBasisCodes.Contains(x.PayBasisCode)))
                    blockers.Add($"pay-basis-mapping-missing:{employee.Id:D}:{salary.PayBasisCode}");
                if (leave.Any(x => x.EmployeeId == employee.Id && x.Status == EmployeeLeaveStatus.Requested))
                    blockers.Add($"pending-leave-decision:{employee.Id:D}");
                foreach (var approvedLeave in leave.Where(x => x.EmployeeId == employee.Id && x.Status == EmployeeLeaveStatus.Approved))
                {
                    if (approvedLeave.StartDate < request.PeriodStart || approvedLeave.EndDate > request.PeriodEnd)
                        blockers.Add($"leave-crosses-period-boundary:{employee.Id:D}");
                    if (!configuredPayrollInputSources.Contains($"leave.requestedDays:{approvedLeave.LeaveType}"))
                        blockers.Add($"leave-pay-effects-not-configured:{employee.Id:D}:{approvedLeave.LeaveType}");
                }

                if (workCalendarRequired)
                {
                    var employeeAssignments = workplaceAssignments.Where(x => x.EmployeeId == employee.Id).ToArray();
                    var assignmentAtStart = employeeAssignments.Where(x => x.EffectiveFrom <= request.PeriodStart)
                        .OrderBy(x => x.EffectiveFrom).ThenBy(x => x.Version).LastOrDefault();
                    if (assignmentAtStart is null)
                        blockers.Add($"workplace-assignment-missing:{employee.Id:D}");
                    if (employeeAssignments.Any(x => x.EffectiveFrom > request.PeriodStart && x.EffectiveFrom <= request.PeriodEnd))
                        blockers.Add($"workplace-assignment-change-within-period:{employee.Id:D}");

                    var overrides = employeeCalendarOverrides.Where(x => x.EmployeeId == employee.Id).ToArray();
                    var overrideAtStart = overrides.Where(x => x.EffectiveFrom <= request.PeriodStart)
                        .OrderBy(x => x.EffectiveFrom).ThenBy(x => x.Version).LastOrDefault();
                    var overrideChangesInside = overrides.Any(x => x.EffectiveFrom > request.PeriodStart && x.EffectiveFrom <= request.PeriodEnd);
                    if (overrideChangesInside)
                        blockers.Add($"employee-calendar-override-change-within-period:{employee.Id:D}");

                    var calendarSource = overrideAtStart is not null ? overrideAtStart : null;
                    string? workplaceCode = assignmentAtStart?.WorkplaceCode;
                    PayrollWorkCalendarSchedule? schedule = null;
                    if (calendarSource is null && workplaceCode is not null)
                    {
                        var workplaceVersions = workplaceCalendars.Where(x => StringComparer.OrdinalIgnoreCase.Equals(x.WorkplaceCode, workplaceCode)).ToArray();
                        var calendarAtStart = workplaceVersions.Where(x => x.EffectiveFrom <= request.PeriodStart)
                            .OrderBy(x => x.EffectiveFrom).ThenBy(x => x.Version).LastOrDefault();
                        if (calendarAtStart is null)
                            blockers.Add($"workplace-calendar-missing:{employee.Id:D}");
                        if (workplaceVersions.Any(x => x.EffectiveFrom > request.PeriodStart && x.EffectiveFrom <= request.PeriodEnd))
                            blockers.Add($"workplace-calendar-change-within-period:{employee.Id:D}");
                        if (calendarAtStart is not null)
                        {
                            if (!PayrollWorkCalendarSchedule.TryParse(calendarAtStart.WeeklyMinutesJson, calendarAtStart.DateOverridesJson,
                                    calendarAtStart.EffectiveFrom, out schedule, out _))
                                blockers.Add($"approved-work-calendar-invalid:{employee.Id:D}");
                        }
                    }
                    else if (calendarSource is not null)
                    {
                        if (!PayrollWorkCalendarSchedule.TryParse(calendarSource.WeeklyMinutesJson, calendarSource.DateOverridesJson,
                                calendarSource.EffectiveFrom, out schedule, out _))
                            blockers.Add($"approved-work-calendar-invalid:{employee.Id:D}");
                    }

                    if (schedule is not null && (assignmentAtStart is not null || employee.HireDate > request.PeriodStart))
                    {
                        var firstDate = employee.HireDate > request.PeriodStart ? employee.HireDate : request.PeriodStart;
                        var employmentEnd = employee.TerminationDate is not null && employee.TerminationDate < request.PeriodEnd
                            ? employee.TerminationDate.Value : request.PeriodEnd;
                        if (firstDate <= employmentEnd)
                        {
                            var attendanceDates = attendance.Where(x => x.EmployeeId == employee.Id).Select(x => x.WorkDate).ToHashSet();
                            var missingAttendanceDate = false;
                            for (var workDate = firstDate; workDate <= employmentEnd; workDate = workDate.AddDays(1))
                            {
                                var expectedMinutes = schedule.ExpectedMinutes(workDate);
                                if (expectedMinutes <= 0) continue;
                                scheduledMinutesByEmployee[employee.Id] = checked(scheduledMinutesByEmployee[employee.Id] + expectedMinutes);
                                scheduledDaysByEmployee[employee.Id]++;
                                if (attendanceCompletenessRequired && !attendanceDates.Contains(workDate)) missingAttendanceDate = true;
                            }
                            if (missingAttendanceDate)
                                {
                                    blockers.Add($"attendance-days-missing:{employee.Id:D}");
                                }
                        }
                    }
                    else if (schedule is null)
                    {
                        blockers.Add(attendanceCompletenessRequired
                            ? $"attendance-period-completeness-not-confirmed:{employee.Id:D}"
                            : $"work-calendar-period-not-confirmed:{employee.Id:D}");
                    }
                }
            }
            if (attendance.Any(x => x.OvertimeMinutes > 0) && !configuredPayrollInputSources.Contains("attendance.overtimeMinutes"))
                blockers.Add("overtime-pay-effects-not-configured");

            var ruleSetSnapshot = ruleSets.Select(x => new { x.Id, x.TaxYear, x.EffectiveFrom, x.EffectiveTo, x.Version,
                x.RulesJson, x.OfficialSourceUrl, x.Status, x.ApprovedByUserId, x.ApprovedAt }).ToArray();
            var workplaceAssignmentSnapshot = workplaceAssignments.Select(x => new { x.Id, x.EmployeeId, x.WorkplaceCode,
                x.EffectiveFrom, x.Version, x.Status, x.ApprovedByUserId, x.ApprovedAt }).ToArray();
            var workplaceCalendarSnapshot = workplaceCalendars.Select(x => new { x.Id, x.WorkplaceCode, x.EffectiveFrom, x.Version,
                x.WeeklyMinutesJson, x.DateOverridesJson, x.PolicyReference, x.Status, x.ApprovedByUserId, x.ApprovedAt }).ToArray();
            var employeeCalendarOverrideSnapshot = employeeCalendarOverrides.Select(x => new { x.Id, x.EmployeeId, x.EffectiveFrom,
                x.Version, x.WeeklyMinutesJson, x.DateOverridesJson, x.PolicyReference, x.Status, x.ApprovedByUserId, x.ApprovedAt }).ToArray();
            var snapshot = new
            {
                schemaVersion = 1,
                period = new { request.PeriodKind, request.PeriodStart, request.PeriodEnd, request.ProfileCode },
                capturedAt = DateTimeOffset.UtcNow,
                employees = employees.Select(employee => new
                {
                    employee.Id, employee.PersonnelCode, employee.FullName, employee.EmploymentCategory, employee.HireDate, employee.TerminationDate,
                    scheduledMinutes = scheduledMinutesByEmployee[employee.Id], scheduledDays = scheduledDaysByEmployee[employee.Id],
                    compensation = compensation.Where(x => x.EmployeeId == employee.Id).Select(x => new
                    {
                        x.Id, x.TargetKind, x.Amount, x.CurrencyCode, x.PayBasisCode, x.EffectiveFrom, x.Version,
                        x.ApprovedByUserId, x.ApprovedAt
                    }).ToArray(),
                    attendance = attendance.Where(x => x.EmployeeId == employee.Id).Select(x => new
                    {
                        x.Id, x.WorkDate, x.WorkedMinutes, x.OvertimeMinutes, status = x.ApprovalStatus,
                        x.RecordedByUserId, x.ApprovedByUserId, x.ApprovedAt
                    }).ToArray(),
                    leave = leave.Where(x => x.EmployeeId == employee.Id).Select(x => new
                    {
                        x.Id, x.LeaveType, x.StartDate, x.EndDate, x.RequestedDays, status = x.Status.ToString(), x.ReviewedByUserId, x.ReviewedAt
                    }).ToArray(),
                    priorEmployerTaxBaseDeclarations = priorEmployerTaxBaseDeclarations.Where(x => x.EmployeeId == employee.Id)
                        .Select(x => new { x.Id, x.TaxYear, x.DeclarationKind, x.BaseEntriesJson, x.Version, x.Status,
                            x.ApprovedByUserId, x.ApprovedAt }).ToArray(),
                    sameEmployerYtdPeriods = sameEmployerYtdPeriods[employee.Id]
                }).ToArray(),
                ruleSets = ruleSetSnapshot,
                workplaceAssignments = workplaceAssignmentSnapshot,
                workplaceCalendars = workplaceCalendarSnapshot,
                employeeCalendarOverrides = employeeCalendarOverrideSnapshot,
                correction = correctionSource is null ? null : new
                {
                    correctionOfRunId = correctionSource.Id,
                    sourceCalculationId = correctionCalculation!.Id,
                    sourceCalculationVersion = correctionCalculation.Version,
                    sourceSnapshotSha256 = correctionSource.SnapshotSha256,
                    sourceResultSha256 = correctionCalculation.ResultSha256,
                    sourceFinalizedAt = correctionCalculation.FinalizedAt,
                    requestedByUserId = userId
                },
                priorEmployerTaxBaseDeclarations = priorEmployerTaxBaseDeclarations.Select(x => new { x.Id, x.EmployeeId,
                    x.TaxYear, x.DeclarationKind, x.BaseEntriesJson, x.EvidenceReference, x.Version, x.Status,
                    x.CreatedByUserId, x.ApprovedByUserId, x.ApprovedAt }).ToArray(),
                blockers = blockers.Order(StringComparer.Ordinal).ToArray()
            };
            var snapshotJson = JsonSerializer.Serialize(snapshot);
            var snapshotHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(snapshotJson)));
            var run = new PayrollRunSnapshot
            {
                TenantId = tenantId, PeriodKind = request.PeriodKind, PeriodStart = request.PeriodStart,
                PeriodEnd = request.PeriodEnd, ProfileCode = request.ProfileCode, Status = "Blocked",
                EmployeeCount = employees.Count, SnapshotJson = snapshotJson, SnapshotSha256 = snapshotHash,
                BlockersJson = JsonSerializer.Serialize(blockers.Order(StringComparer.Ordinal)), CreatedByUserId = userId
            };
            db.PayrollRunSnapshots.Add(run);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId,
                Action = "hr.payroll-run.blocked-snapshot-created", Resource = $"{run.Id:D}/{snapshotHash}/employees:{employees.Count}" });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/hr/payroll/runs/{run.Id}", new PayrollRunView(run.Id, run.PeriodKind,
                run.PeriodStart, run.PeriodEnd, run.ProfileCode, run.Status, run.EmployeeCount, run.SnapshotSha256,
                run.BlockersJson, run.CreatedAt, run.CreatedByUserId));
        });
    }

    private static bool ValidatePriorEmployerTaxBaseEntries(JsonElement entries, bool required)
    {
        if (entries.ValueKind != JsonValueKind.Array || entries.GetArrayLength() > 128 ||
            required && entries.GetArrayLength() == 0 || !required && entries.GetArrayLength() != 0) return false;
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in entries.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) return false;
            var properties = item.EnumerateObject().ToArray();
            if (properties.Length != 4 || properties.Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != 4 ||
                !item.TryGetProperty("code", out var codeNode) || codeNode.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("label", out var labelNode) || labelNode.ValueKind != JsonValueKind.String ||
                !item.TryGetProperty("amount", out var amountNode) || !amountNode.TryGetDecimal(out var amount) ||
                !item.TryGetProperty("unit", out var unitNode) || unitNode.ValueKind != JsonValueKind.String) return false;
            var code = codeNode.GetString()?.Trim(); var label = labelNode.GetString()?.Trim(); var unit = unitNode.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(code) || code.Length > 80 || !Regex.IsMatch(code, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ||
                !codes.Add(code) || string.IsNullOrWhiteSpace(label) || label.Length > 120 || amount < 0m ||
                amount > 99_999_999_999_999.9999m || decimal.Round(amount, 4) != amount ||
                string.IsNullOrWhiteSpace(unit) || unit.Length > 32 || !Regex.IsMatch(unit, "^[A-Za-z0-9%._/-]+$")) return false;
        }
        return true;
    }

    private static Dictionary<string, string[]>? ValidateEmployee(EmployeeWriteRequest request)
    {
        var code = request.PersonnelCode?.Trim(); var name = request.FullName?.Trim();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 40 || !Regex.IsMatch(code, "^[A-Za-z0-9._-]+$") ||
            string.IsNullOrWhiteSpace(name) || name.Length > 160 || request.HireDate == default ||
            request.TerminationDate is not null && request.TerminationDate < request.HireDate ||
            (request.Department?.Length ?? 0) > 120 || (request.JobTitle?.Length ?? 0) > 120 || (request.EmploymentCategory?.Length ?? 0) > 80 ||
            (request.WorkEmail is not null && (!new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(request.WorkEmail) || request.WorkEmail.Length > 254)) ||
            request.UserId == Guid.Empty)
            return new() { ["employee"] = ["Personel kodu, ad, işe giriş tarihi ve geçerli isteğe bağlı iletişim bilgilerini girin."] };
        return null;
    }

    private static Task<bool> HasCompensationPermissionAsync(IPlatformPermissionAuthorizer authorizer,
        Guid tenantId, Guid userId, string role, string action, CancellationToken cancellationToken)
    {
        var definition = PlatformPermissionCatalog.Definitions.Single(x =>
            x.ResourceType == "erp.payroll-compensation" && x.Action == action);
        var method = action == "view" ? "GET" : "POST";
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = definition.ResourceType,
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = method,
            ["request.action"] = action
        };
        return authorizer.IsAllowedAsync(tenantId, userId, role,
            new ResolvedPlatformPermission(definition, attributes), cancellationToken);
    }

    private static byte[] BuildPayrollManualPackage(PayrollRunSnapshot run, PayrollRunCalculation calculation,
        PayrollFormulaResultEnvelope envelope)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            void AddText(string name, string content)
            {
                var entry = archive.CreateEntry(name, CompressionLevel.Optimal);
                using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
                writer.Write(content);
            }

            var csv = new StringBuilder("PersonnelCode,FullName,TargetKind,TargetAmount,PeriodTargetAmount,GrossCandidate,GrossEarnings,EmployeeDeductions,NetPay\r\n");
            foreach (var employee in envelope.Employees)
            {
                static string Csv(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
                csv.Append(Csv(employee.PersonnelCode)).Append(',').Append(Csv(employee.FullName)).Append(',')
                    .Append(Csv(employee.TargetKind)).Append(',').Append(employee.TargetAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(employee.PeriodTargetAmount.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(employee.GrossCandidate.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(employee.GrossEarnings.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(employee.EmployeeDeductions.ToString(CultureInfo.InvariantCulture)).Append(',')
                    .Append(employee.NetPay.ToString(CultureInfo.InvariantCulture)).Append("\r\n");
            }
            AddText("bordro-ozeti.csv", csv.ToString());
            var voucher = new StringBuilder("Date,EmployeeCode,EmployeeName,Description,AccountCode,Debit,Credit,Currency\r\n");
            foreach (var employee in envelope.Employees)
            {
                foreach (var component in employee.Components.Where(x => x.Category is "earning" or "deduction"))
                {
                    static string Csv(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
                    var accountCode = component.MappingCodes.TryGetValue("accountingAccount", out var mappedAccount) &&
                                      !string.Equals(mappedAccount, "EXCLUDED", StringComparison.OrdinalIgnoreCase)
                        ? mappedAccount
                        : "";
                    voucher.Append(run.PeriodEnd.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).Append(',')
                        .Append(Csv(employee.PersonnelCode)).Append(',').Append(Csv(employee.FullName)).Append(',')
                        .Append(Csv(component.Label)).Append(',').Append(Csv(accountCode)).Append(',')
                        .Append(component.Category == "earning" ? component.Amount.ToString("0.00", CultureInfo.InvariantCulture) : "0.00").Append(',')
                        .Append(component.Category == "deduction" ? component.Amount.ToString("0.00", CultureInfo.InvariantCulture) : "0.00")
                        .Append(',').Append(Csv(component.Unit)).Append("\r\n");
                }
                voucher.Append(run.PeriodEnd.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).Append(',')
                    .Append('"').Append(employee.PersonnelCode.Replace("\"", "\"\"")).Append('"').Append(',')
                    .Append('"').Append(employee.FullName.Replace("\"", "\"\"")).Append('"').Append(',')
                    .Append("\"Net ücret ödeme borcu\",,").Append("0.00,")
                    .Append(employee.NetPay.ToString("0.00", CultureInfo.InvariantCulture)).Append(",\"TRY\"\r\n");
            }
            AddText("muhasebe-fisi-taslagi.csv", voucher.ToString());
            AddText("hesaplama-sonucu.json", calculation.ResultJson);
            AddText("paket-bilgisi.json", JsonSerializer.Serialize(new
            {
                packageType = "ManualPayrollReviewPackage",
                officialDeclaration = false,
                declaration = new
                {
                    selectedBaselineForm = "1003A",
                    schemaName = "MUHSGK_21",
                    schemaRelease = "GİB e-Beyanname V133.0 (2026-10-02)",
                    xmlGenerated = false,
                    blockers = new[]
                    {
                        "employer.taxNumber", "employer.taxOfficeCode", "employer.branchNumber",
                        "employer.sgkWorkplaceRegistrationFields", "employee.nationalIdentityNumber",
                        "employee.sgkDocumentAndLawCodes", "employee.occupationCode", "employee.premiumDays",
                        "employee.socialSecurityEarnings", "employee.incomeTaxBaseAndWithholding",
                        "employee.minimumWageExemption", "employee.stampTaxAndExemption",
                        "employer.approvedDeclarationProfileAndFieldMappings"
                    },
                    note = "1003A is the default format for the ordinary private-sector 4/a baseline. Employer-specific eligibility, source data and mappings must be confirmed before producing a declaration file."
                },
                runId = run.Id,
                periodStart = run.PeriodStart,
                periodEnd = run.PeriodEnd,
                profileCode = run.ProfileCode,
                calculationId = calculation.Id,
                calculationVersion = calculation.Version,
                runSnapshotSha256 = run.SnapshotSha256,
                resultSha256 = calculation.ResultSha256,
                generatedAtUtc = DateTimeOffset.UtcNow,
                contents = new[] { "bordro-ozeti.csv", "muhasebe-fisi-taslagi.csv", "hesaplama-sonucu.json", "paket-bilgisi.json", "OKU.txt" }
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
            AddText("OKU.txt", "Bu dosyalar kesinleştirilmiş iç bordro hesaplama paketidir. Resmî GİB/SGK beyanı veya gönderime hazır XML değildir. muhasebe-fisi-taslagi.csv, formüldeki brüt kazanç ve çalışan kesintilerini, kural setinde açıkça eşlenmiş hesap kodlarıyla taslak fiş satırlarına aktarır; EXCLUDED/atanmamış hesap kodları boş kalır. Net ücret borcu ile işveren SGK payı ve diğer işveren maliyetleri için gerekli karşı hesaplar tanımlı olmadığı için bu CSV yevmiye kaydı oluşturmaz; muhasebeci bu satırları ve işveren maliyetlerini tamamlayıp dengeyi doğrulamalıdır. Başlangıç biçimi olarak özel sektör 4/a için 1003A (MUHSGK_21) seçilmiştir; işverenin gerçek yetki ve profil bilgisi bunu doğrulamalıdır. Vergi numarası/vergi dairesi, SGK işyeri sicili, çalışan T.C. kimlik numarası, meslek ve belge kodları, prim günleri ile yasal matrah/kesinti değerleri eksiktir; paket-bilgisi.json alan listesini içerir. XML için onaylı alan eşlemesi gerekir. Tutarları yetkili bordro uzmanı kontrol etmelidir.");
        }
        return output.ToArray();
    }

    private static bool TryBuildPayrollFormulaResult(PayrollRunSnapshot run, out PayrollFormulaResultEnvelope? result, out string error)
    {
        result = null;
        error = "Formül sonucu üretilemedi.";
        if (!PayrollSnapshotHashMatches(run.SnapshotJson, run.SnapshotSha256))
        { error = "Bordro snapshot bütünlük özeti doğrulanamadı."; return false; }
        string[] allowedDraftBlockers = [
            "calculation-engine-not-enabled",
            "employer-declaration-profile-not-approved",
            "declaration-business-validation-not-configured"
        ];
        string[] blockers;
        try { blockers = JsonSerializer.Deserialize<string[]>(run.BlockersJson) ?? []; }
        catch (JsonException) { error = "Bordro taslağı engel kaydı okunamıyor."; return false; }
        if (blockers.Any(x => !allowedDraftBlockers.Contains(x, StringComparer.Ordinal)))
        { error = "Bordro taslağında eksik veri veya onaylı kural engeli var."; return false; }

        try
        {
            using var snapshotDocument = JsonDocument.Parse(run.SnapshotJson);
            var snapshot = snapshotDocument.RootElement;
            if (!TryGetJsonPropertyIgnoreCase(snapshot, "ruleSets", out var ruleSets) || ruleSets.ValueKind != JsonValueKind.Array ||
                !TryGetJsonPropertyIgnoreCase(snapshot, "employees", out var employees) || employees.ValueKind != JsonValueKind.Array)
            { error = "Bordro snapshot içinde onaylı kural sürümleri veya çalışan girdileri bulunamadı."; return false; }
            var employeeCount = employees.GetArrayLength();
            var applicableRules = new List<(JsonDocument Document, DateOnly From, DateOnly? To)>();
            foreach (var ruleSet in ruleSets.EnumerateArray())
            {
                if (!IsApprovedPayrollRuleSnapshot(ruleSet) ||
                    !TryGetJsonDate(ruleSet, "effectiveFrom", out var ruleFrom) ||
                    !TryGetJsonOptionalDate(ruleSet, "effectiveTo", out var ruleTo) ||
                    ruleFrom > run.PeriodStart || ruleTo is not null && ruleTo < run.PeriodEnd ||
                    !TryGetJsonPropertyIgnoreCase(ruleSet, "rulesJson", out var rulesNode) || rulesNode.ValueKind != JsonValueKind.String) continue;
                applicableRules.Add((JsonDocument.Parse(rulesNode.GetString()!), ruleFrom, ruleTo));
            }
            if (applicableRules.Count != 1)
            {
                foreach (var entry in applicableRules) entry.Document.Dispose();
                error = "Snapshot içinde dönemi tek başına kapsayan tam bir onaylı kural sürümü yok.";
                return false;
            }
            using var rules = applicableRules[0].Document;
            if (!PayrollParameterSetValidator.TryValidate(rules.RootElement, applicableRules[0].From, applicableRules[0].To, true, out var validationError) ||
                !PayrollParameterSetValidator.CoversProfile(rules.RootElement, run.ProfileCode, run.PeriodStart, run.PeriodEnd))
            { error = validationError ?? "Onaylı firma kuralı bordro profili ve dönemini kapsamıyor."; return false; }
            if (!TryGetJsonPropertyIgnoreCase(rules.RootElement, "components", out var configuredComponents) ||
                configuredComponents.ValueKind != JsonValueKind.Array || (long)employeeCount * configuredComponents.GetArrayLength() > 5000)
            { error = "Formül sonucu en fazla 5.000 çalışan-kalem çiftini destekler."; return false; }

            var rows = new List<PayrollFormulaEmployeeResult>(employeeCount);
            foreach (var employee in employees.EnumerateArray())
            {
                if (!TryGetJsonPropertyIgnoreCase(employee, "id", out var idNode) || idNode.ValueKind != JsonValueKind.String ||
                    !Guid.TryParse(idNode.GetString(), out var employeeId) ||
                    !TryGetJsonPropertyIgnoreCase(employee, "personnelCode", out var codeNode) || codeNode.ValueKind != JsonValueKind.String ||
                    !TryGetJsonPropertyIgnoreCase(employee, "fullName", out var nameNode) || nameNode.ValueKind != JsonValueKind.String)
                { error = "Snapshot içindeki çalışan kimliği eksik veya geçersiz."; return false; }
                if (!PayrollRuleSetRuntime.TryEvaluateTarget(rules.RootElement, applicableRules[0].From,
                        applicableRules[0].To, run.ProfileCode, run.PeriodStart, run.PeriodEnd, employee,
                        out var target, out var formulaError))
                { error = $"{codeNode.GetString()}: {formulaError}"; return false; }
                rows.Add(new PayrollFormulaEmployeeResult(employeeId, codeNode.GetString()!, nameNode.GetString()!,
                    target.TargetKind, target.TargetAmount, target.PeriodTargetAmount, target.GrossCandidate, target.GrossEarnings,
                    target.EmployeeDeductions, target.NetPay, target.Components.Select(x => new PayrollFormulaComponentResult(
                        x.Key, x.Label, x.Category, x.Amount, x.Unit, x.MappingCodes, x.MappingTreatments)).ToArray(),
                    target.BaseAggregates.Select(x => new PayrollFormulaBaseAggregateResult(x.MappingType, x.TargetCode, x.Amount, x.Unit)).ToArray()));
            }
            result = new PayrollFormulaResultEnvelope(run.Id, run.SnapshotSha256, "FormulaTargetPreviewOnly", false,
                "Onaylı firma formülleri ve matrah etkisi kararlarıyla üretilmiş iç formül taslağıdır; tahakkuk, yasal uygunluk veya resmi beyan sonucu değildir.", rows);
            return true;
        }
        catch (JsonException)
        { error = "Bordro snapshot içindeki kural veya çalışan girdileri geçerli JSON değil."; return false; }
    }

    private static bool PayrollSnapshotHashMatches(string snapshotJson, string expectedHash)
    {
        if (expectedHash.Length != 64) return false;
        try
        {
            var expected = Convert.FromHexString(expectedHash);
            var actual = SHA256.HashData(Encoding.UTF8.GetBytes(snapshotJson));
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException) { return false; }
    }

    private static bool HasContinuousPayrollPeriodCoverage(DateOnly hireDate, DateOnly currentPeriodStart,
        IReadOnlyCollection<(DateOnly Start, DateOnly End)> priorPeriods)
    {
        var coverageStart = new DateOnly(currentPeriodStart.Year, 1, 1);
        if (hireDate > coverageStart) coverageStart = hireDate;
        if (coverageStart >= currentPeriodStart) return true;
        var expected = coverageStart;
        foreach (var period in priorPeriods.Where(x => x.End >= coverageStart && x.End < currentPeriodStart)
                     .OrderBy(x => x.Start).ThenBy(x => x.End))
        {
            var clippedStart = period.Start < coverageStart ? coverageStart : period.Start;
            if (clippedStart != expected || period.End < clippedStart) return false;
            expected = period.End.AddDays(1);
            if (expected == currentPeriodStart) return true;
            if (expected > currentPeriodStart) return false;
        }
        return false;
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

    private static bool IsApprovedPayrollRuleSnapshot(JsonElement ruleSet)
    {
        if (TryGetJsonPropertyIgnoreCase(ruleSet, "status", out var status))
            return status.ValueKind == JsonValueKind.String && status.GetString() == "Approved";
        return TryGetJsonPropertyIgnoreCase(ruleSet, "approvedByUserId", out var approver) &&
            approver.ValueKind == JsonValueKind.String && Guid.TryParse(approver.GetString(), out var approverId) && approverId != Guid.Empty &&
            TryGetJsonPropertyIgnoreCase(ruleSet, "approvedAt", out var approvedAt) && approvedAt.ValueKind == JsonValueKind.String &&
            DateTimeOffset.TryParse(approvedAt.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out _);
    }

    private static bool TryGetJsonDate(JsonElement element, string property, out DateOnly value)
    {
        value = default;
        return TryGetJsonPropertyIgnoreCase(element, property, out var item) && item.ValueKind == JsonValueKind.String &&
            DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }

    private static bool TryGetJsonOptionalDate(JsonElement element, string property, out DateOnly? value)
    {
        value = null;
        if (!TryGetJsonPropertyIgnoreCase(element, property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String ||
            !DateOnly.TryParseExact(item.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)) return false;
        value = parsed;
        return true;
    }

    private static PayrollGib1003AEmployerProfile? GetApproved1003AEmployerProfile(PayrollRunSnapshot run)
    {
        try
        {
            using var snapshot = JsonDocument.Parse(run.SnapshotJson);
            if (!TryGetJsonPropertyIgnoreCase(snapshot.RootElement, "ruleSets", out var ruleSets) || ruleSets.ValueKind != JsonValueKind.Array)
                return null;
            var applicable = new List<(JsonDocument Rules, DateOnly From, DateOnly? To)>();
            foreach (var ruleSet in ruleSets.EnumerateArray())
            {
                if (!IsApprovedPayrollRuleSnapshot(ruleSet) ||
                    !TryGetJsonDate(ruleSet, "effectiveFrom", out var from) || from > run.PeriodStart ||
                    !TryGetJsonOptionalDate(ruleSet, "effectiveTo", out var to) || to is not null && to < run.PeriodEnd ||
                    !TryGetJsonPropertyIgnoreCase(ruleSet, "rulesJson", out var rulesNode) || rulesNode.ValueKind != JsonValueKind.String)
                    continue;
                applicable.Add((JsonDocument.Parse(rulesNode.GetString()!), from, to));
            }
            if (applicable.Count != 1)
            {
                foreach (var item in applicable) item.Rules.Dispose();
                return null;
            }

            using var approvedRules = applicable[0].Rules;
            if (!PayrollParameterSetValidator.TryValidate(approvedRules.RootElement, applicable[0].From, applicable[0].To, true, out _) ||
                !PayrollParameterSetValidator.CoversProfile(approvedRules.RootElement, run.ProfileCode, run.PeriodStart, run.PeriodEnd) ||
                !TryGetJsonPropertyIgnoreCase(approvedRules.RootElement, "declarations", out var declarations) || declarations.ValueKind != JsonValueKind.Array)
                return null;

            var declarationProfile = declarations.EnumerateArray().FirstOrDefault(declaration =>
                TryGetJsonPropertyIgnoreCase(declaration, "profile", out var profile) && profile.ValueKind == JsonValueKind.String && profile.GetString() == run.ProfileCode &&
                TryGetJsonPropertyIgnoreCase(declaration, "declarationCode", out var code) && code.ValueKind == JsonValueKind.String && code.GetString() == "1003A" &&
                TryGetJsonPropertyIgnoreCase(declaration, "schemaVersion", out var schema) && schema.ValueKind == JsonValueKind.String && schema.GetString() == "MUHSGK_21" &&
                TryGetJsonPropertyIgnoreCase(declaration, "format", out var format) && format.ValueKind == JsonValueKind.String && format.GetString() == "XML" &&
                TryGetJsonDate(declaration, "effectiveFrom", out var from) && from <= run.PeriodStart &&
                TryGetJsonOptionalDate(declaration, "effectiveTo", out var to) && (to is null || to >= run.PeriodEnd));
            if (declarationProfile.ValueKind != JsonValueKind.Object ||
                !TryGetJsonPropertyIgnoreCase(declarationProfile, "employerProfile", out var employer) || employer.ValueKind != JsonValueKind.Object ||
                !TryGetJsonPropertyIgnoreCase(employer, "taxOfficeCode", out var taxOffice) || taxOffice.ValueKind != JsonValueKind.String ||
                !TryGetJsonPropertyIgnoreCase(employer, "taxNumber", out var taxNumber) || taxNumber.ValueKind != JsonValueKind.String ||
                !TryGetJsonPropertyIgnoreCase(employer, "employerTitle", out var title) || title.ValueKind != JsonValueKind.String ||
                !TryGetJsonPropertyIgnoreCase(employer, "phoneAreaCode", out var area) || area.ValueKind != JsonValueKind.String ||
                !TryGetJsonPropertyIgnoreCase(employer, "phoneNumber", out var phone) || phone.ValueKind != JsonValueKind.String ||
                !TryGetJsonPropertyIgnoreCase(employer, "branchNumber", out var branch) || branch.ValueKind != JsonValueKind.String)
                return null;
            return new PayrollGib1003AEmployerProfile(taxOffice.GetString()!, taxNumber.GetString()!, title.GetString()!,
                area.GetString()!, phone.GetString()!, branch.GetString()!);
        }
        catch (JsonException)
        {
            return null;
        }
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
            x.HireDate <= to && (x.TerminationDate == null || x.TerminationDate >= to), ct);
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
    private static Dictionary<string, string[]>? ValidateWorkplaceDefinition(string? code, string? name, string? kind)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(code) || code.Trim().Length > 40 || code.Any(char.IsControl)) errors["code"] = ["Kod 1–40 karakter olmalıdır."];
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 120) errors["name"] = ["Ad 1–120 karakter olmalıdır."];
        if (kind is not ("Workplace" or "Branch" or "Factory")) errors["kind"] = ["Tanım türü iş yeri, şube veya fabrika olmalıdır."];
        return errors.Count == 0 ? null : errors;
    }
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
    private static bool IsSqlServerDeadlock(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException!)
            if (current is Microsoft.Data.SqlClient.SqlException { Number: 1205 }) return true;
        return false;
    }
}

public sealed record EmployeeWriteRequest(string? PersonnelCode, string? FullName, string? Department, string? JobTitle,
    string? WorkEmail, DateOnly HireDate, DateOnly? TerminationDate, Guid? UserId = null, string? RowVersion = null,
    string? EmploymentCategory = null);
public sealed record EmployeeView(Guid Id, string PersonnelCode, string FullName, string? Department, string? JobTitle,
    string? EmploymentCategory, string? WorkEmail, DateOnly HireDate, DateOnly? TerminationDate, string Status, Guid? UserId, string RowVersion);
public sealed record LeaveCreateRequest(Guid EmployeeId, string? LeaveType, DateOnly StartDate, DateOnly EndDate, decimal RequestedDays, string? Note = null);
public sealed record LeaveReviewRequest(bool Approve, string? Note, string? RowVersion);
public sealed record LeaveCancelRequest(string? RowVersion);
public sealed record LeaveView(Guid Id, Guid EmployeeId, string Employee, string LeaveType, DateOnly StartDate, DateOnly EndDate,
    decimal RequestedDays, string? Note, string Status, Guid RequestedByUserId, Guid? ReviewedByUserId, DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt, string? ReviewNote, string RowVersion, bool CanCancel);
public sealed record AttendanceWriteRequest(Guid EmployeeId, DateOnly WorkDate, int WorkedMinutes, int OvertimeMinutes,
    string? Note = null, string? RowVersion = null);
public sealed record AttendanceApproveRequest(string? RowVersion);
public sealed record AttendanceView(Guid Id, Guid EmployeeId, string Employee, DateOnly WorkDate, int WorkedMinutes,
    int OvertimeMinutes, string? Note, Guid RecordedByUserId, string ApprovalStatus, Guid? ApprovedByUserId, DateTimeOffset? ApprovedAt,
    DateTimeOffset CreatedAt, string RowVersion);
public sealed record PayrollRuleSetCreateRequest(string? TaxYear, DateOnly EffectiveFrom, DateOnly? EffectiveTo,
    string? OfficialSourceUrl, JsonElement? Rules);
public sealed record PayrollRuleSetApproveRequest(string? RowVersion);
public sealed record PayrollRuleSetView(Guid Id, string TaxYear, DateOnly EffectiveFrom, DateOnly? EffectiveTo,
    int Version, string RulesJson, string OfficialSourceUrl, string Status, Guid CreatedByUserId,
    Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt, bool CanApprove, string RowVersion);
public sealed record PayrollCompensationCreateRequest(Guid EmployeeId, string? TargetKind, decimal Amount,
    string? CurrencyCode, string? PayBasisCode, DateOnly EffectiveFrom);
public sealed record PayrollCompensationApproveRequest(string? RowVersion);
public sealed record PayrollCompensationView(Guid Id, Guid EmployeeId, string Employee, string TargetKind, decimal Amount,
    string CurrencyCode, string PayBasisCode, DateOnly EffectiveFrom, int Version, string Status,
    Guid CreatedByUserId, Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt,
    bool CanApprove, string RowVersion);
public sealed record PayrollCompensationEmployeeOption(Guid Id, string PersonnelCode, string FullName);
public sealed record PayrollPriorEmployerTaxBaseCreateRequest(Guid EmployeeId, int TaxYear, string? DeclarationKind,
    JsonElement BaseEntries, string? EvidenceReference);
public sealed record PayrollPriorEmployerTaxBaseView(Guid Id, Guid EmployeeId, string Employee, int TaxYear,
    string DeclarationKind, string BaseEntriesJson, string EvidenceReference, int Version, string Status,
    Guid CreatedByUserId, Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt,
    bool CanApprove, string RowVersion);
public sealed record PayrollEmployeeWorkplaceAssignmentCreateRequest(Guid EmployeeId, string? WorkplaceCode, DateOnly EffectiveFrom);
public sealed record WorkplaceDefinitionWriteRequest(string? Code, string? Name, string? Kind);
public sealed record WorkplaceDefinitionUpdateRequest(string? Code, string? Name, string? Kind, byte[]? RowVersion);
public sealed record WorkplaceDefinitionStateRequest(bool IsActive);
public sealed record WorkplaceDefinitionView(Guid Id, string Code, string Name, string Kind, bool IsActive, byte[] RowVersion);
public sealed record PayrollEmployeeWorkplaceAssignmentView(Guid Id, Guid EmployeeId, string Employee, string WorkplaceCode,
    DateOnly EffectiveFrom, int Version, string Status, Guid CreatedByUserId, Guid? ApprovedByUserId,
    DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt, bool CanApprove, string RowVersion);
public sealed record PayrollWorkplaceCalendarCreateRequest(string? WorkplaceCode, DateOnly EffectiveFrom,
    string? WeeklyMinutesJson, string? DateOverridesJson, string? PolicyReference);
public sealed record PayrollWorkplaceCalendarView(Guid Id, string WorkplaceCode, DateOnly EffectiveFrom, int Version,
    string WeeklyMinutesJson, string DateOverridesJson, string PolicyReference, string Status, Guid CreatedByUserId,
    Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt, bool CanApprove, string RowVersion);
public sealed record PayrollEmployeeCalendarOverrideCreateRequest(Guid EmployeeId, DateOnly EffectiveFrom,
    string? WeeklyMinutesJson, string? DateOverridesJson, string? PolicyReference);
public sealed record PayrollEmployeeCalendarOverrideView(Guid Id, Guid EmployeeId, string Employee, DateOnly EffectiveFrom,
    int Version, string WeeklyMinutesJson, string DateOverridesJson, string PolicyReference, string Status,
    Guid CreatedByUserId, Guid? ApprovedByUserId, DateTimeOffset CreatedAt, DateTimeOffset? ApprovedAt,
    bool CanApprove, string RowVersion);
public sealed record PayrollRunCreateRequest(string? PeriodKind, DateOnly PeriodStart, DateOnly PeriodEnd,
    string? ProfileCode, List<Guid>? EmployeeIds, Guid? CorrectionOfRunId = null);
public sealed record PayrollRunView(Guid Id, string PeriodKind, DateOnly PeriodStart, DateOnly PeriodEnd,
    string ProfileCode, string Status, int EmployeeCount, string SnapshotSha256, string BlockersJson,
    DateTimeOffset CreatedAt, Guid CreatedByUserId);
public sealed record PayrollRunSnapshotDetail(Guid Id, string PeriodKind, DateOnly PeriodStart, DateOnly PeriodEnd,
    string ProfileCode, string Status, int EmployeeCount, string SnapshotSha256, string BlockersJson,
    string SnapshotJson, DateTimeOffset CreatedAt, Guid CreatedByUserId);
public sealed record PayrollFormulaComponentResult(string Key, string Label, string Category, decimal Amount,
    string Unit, IReadOnlyDictionary<string, string> MappingCodes, IReadOnlyDictionary<string, string> MappingTreatments);
public sealed record PayrollFormulaBaseAggregateResult(string MappingType, string TargetCode, decimal Amount, string Unit);
public sealed record PayrollFormulaEmployeeResult(Guid EmployeeId, string PersonnelCode, string FullName, string TargetKind,
    decimal TargetAmount, decimal PeriodTargetAmount, decimal GrossCandidate, decimal GrossEarnings, decimal EmployeeDeductions, decimal NetPay,
    IReadOnlyList<PayrollFormulaComponentResult> Components, IReadOnlyList<PayrollFormulaBaseAggregateResult> BaseAggregates);
public sealed record PayrollFormulaResultEnvelope(Guid RunId, string RunSnapshotSha256, string Stage,
    bool IsOfficialPayrollResult, string Warning, IReadOnlyList<PayrollFormulaEmployeeResult> Employees);
public sealed record PayrollRunCalculationView(Guid Id, Guid RunId, int Version, string RunSnapshotSha256,
    string ResultSha256, string Status, string ResultJson, Guid CreatedByUserId, DateTimeOffset CreatedAt,
    Guid? ApprovedByUserId, DateTimeOffset? ApprovedAt);
public sealed record HrLeaveStatusSummary(string Status, int RequestCount, decimal RequestedDays);
public sealed record HrPeriodSummaryView(DateOnly From, DateOnly To, int EmployeesAtPeriodEnd, int AttendanceRecordCount,
    int EmployeesWithAttendance, long WorkedMinutes, long OvertimeMinutes, int LeaveRequestCount,
    decimal RequestedLeaveDays, IReadOnlyList<HrLeaveStatusSummary> LeaveStatuses);
