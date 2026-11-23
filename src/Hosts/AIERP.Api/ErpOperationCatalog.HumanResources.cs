namespace AIERP.Api;

// İnsan Kaynakları system pages (taslak 25): Personel, Personel kartı, İzin talepleri, Puantaj and Dönem özeti. Kept in its own
// partial file so other modules' catalog changes do not collide. No static fields here (see ErpOperationCatalog.Purchasing.cs):
// the label block is a method; its map (HrLabels) lives in the main file next to the other module blocks.
// No operation is offered for compensation, payroll, rule set or calendar endpoints (KVKK, taslak 25 decision 8): ik.* is
// visible in every tenant's Studio catalog and salary data must not be bindable on tenant pages.
internal static partial class ErpOperationCatalog
{
    private const string HumanResourcesModule = "İnsan Kaynakları";

    private static KeyValuePair<string, string>[] HumanResourcesLabels() =>
    [
        new("personnelCode", "Personel kodu"), new("fullName", "Ad soyad"), new("department", "Departman"), new("jobTitle", "Görev"),
        new("employmentCategory", "Çalışan kategorisi"), new("workEmail", "İş e-postası"), new("hireDate", "İşe giriş"),
        new("terminationDate", "İşten çıkış"), new("userId", "Bağlı kullanıcı"),
        new("employeeId", "Personel kimliği"), new("employee", "Personel"), new("leaveType", "İzin türü"), new("startDate", "Başlangıç"),
        new("endDate", "Bitiş"), new("requestedDays", "Talep edilen gün"), new("note", "Not"), new("requestedByUserId", "Talep eden"),
        new("reviewedByUserId", "Değerlendiren"), new("reviewedAt", "Değerlendirme zamanı"), new("reviewNote", "Değerlendirme notu"),
        new("canCancel", "İptal edilebilir"), new("canReview", "Onaylanabilir"), new("approve", "Onay"),
        new("workDate", "İş günü"), new("workedMinutes", "Çalışılan (dk)"), new("overtimeMinutes", "Fazla mesai (dk)"),
        new("recordedByUserId", "Kaydeden"), new("approvalStatus", "Onay durumu"), new("approvedByUserId", "Onaylayan"),
        new("approvedAt", "Onay zamanı"), new("canApprove", "Onaylanabilir"), new("requestCount", "Talep sayısı"),
    ];

    /// <summary>
    /// The three lists answer with the paged envelope only when page or pageSize is sent (without them they keep the legacy
    /// plain array), so every query on a <c>listele</c> operation must bind one of them. The row rule stays on the server: a
    /// non-admin reads only the personnel linked to their user and its leave / attendance rows. Review, cancel and approve
    /// take the row's <c>rowVersion</c> as a page-bound body value (there is no single leave read to source it from);
    /// <c>approve</c> is fixed per operation, so a button can never send the wrong decision. Each <c>ik.donemOzeti</c> call
    /// writes an audit row, so a page must run it on demand only (runOn manual); its totals are meta values and its rows the
    /// leave status breakdown.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildHumanResources(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string employees = "/api/hr/employees";
        const string employee = employees + "/{id}";
        const string employeeRead = "ik.personel.getir";
        const string leaves = "/api/hr/leave-requests";
        const string leave = leaves + "/{id}";
        const string attendance = "/api/hr/attendance";
        const string attendanceRecord = attendance + "/{id}";
        const string attendanceRead = "ik.puantaj.getir";
        var id = Route("id");
        var meta = new[] { "page", "pageSize", "totalCount" };
        var rowVersion = new ErpOperationParameter("rowVersion", "body", "text", true);
        static ErpOperationColumn[] Cols(params string[] specs) =>
            specs.Select(x => x.Split(':')).Select(x => new ErpOperationColumn(x[0], Label(x[0]), x[1])).ToArray();
        static Dictionary<string, object?> Decision(bool approve) => new(StringComparer.Ordinal) { ["approve"] = approve };
        var employeeColumns = Columns<EmployeeView>();
        var leaveColumns = Columns<LeaveView>();
        var attendanceColumns = Columns<AttendanceView>();

        // ---- Personel ----
        yield return Read(HumanResourcesModule, "ik.personel.listele", "Personeli listele", employees,
            [Query("q", "text"), Query("status", "text"), Query("department", "text"), .. paging],
            List(employeeColumns, "items") with { MetaPaths = meta });
        yield return Read(HumanResourcesModule, employeeRead, "Personel kaydı getir", employee, [id], Record(employeeColumns));
        yield return Write(HumanResourcesModule, "ik.personel.olustur", "Personel kaydı oluştur", "insert", "POST", employees,
            BodyParameters<EmployeeWriteRequest>(sourceBacked: false, exclude: "rowVersion"), Record(employeeColumns), null, null,
            requiresTenantAdmin: true);
        // A full replace: unbound fields (userId, rowVersion, …) keep the source record's values.
        yield return Write(HumanResourcesModule, "ik.personel.guncelle", "Personel kaydı güncelle", "update", "PUT", employee,
            [id, .. BodyParameters<EmployeeWriteRequest>(sourceBacked: true)], Record(employeeColumns), employeeRead, null,
            requiresTenantAdmin: true);

        // ---- İzin talepleri ----
        yield return Read(HumanResourcesModule, "ik.izin.listele", "İzin taleplerini listele", leaves,
            [Query("q", "text"), Query("status", "text"), Query("leaveType", "text"), Query("employeeId", "guid"), Query("from", "date"),
                Query("to", "date"), .. paging],
            List(leaveColumns, "items") with { MetaPaths = meta });
        // Self-service: anyone may request for the personnel linked to their user (the handler checks it), an admin for anyone.
        yield return Write(HumanResourcesModule, "ik.izin.talepEt", "İzin talebi oluştur", "insert", "POST", leaves,
            BodyParameters<LeaveCreateRequest>(sourceBacked: false), Record(Cols("id:guid", "status:text")), null, null);
        var reviewResult = Record(Cols("id:guid", "status:text", "reviewedAt:date", "reviewNote:text"));
        yield return Write(HumanResourcesModule, "ik.izin.onayla", "İzin talebini onayla", "update", "POST", leave + "/review",
            [id, rowVersion], reviewResult, null, Decision(true), requiresTenantAdmin: true);
        yield return Write(HumanResourcesModule, "ik.izin.reddet", "İzin talebini reddet", "update", "POST", leave + "/review",
            [id, new ErpOperationParameter("note", "body", "text", false), rowVersion], reviewResult, null, Decision(false),
            requiresTenantAdmin: true);
        // Only the requester may cancel (the handler answers 403 to anyone else); the list's canCancel tells the page.
        yield return Write(HumanResourcesModule, "ik.izin.iptal", "İzin talebini iptal et", "update", "POST", leave + "/cancel",
            [id, rowVersion], Record(Cols("id:guid", "status:text")), null, null);

        // ---- Puantaj ----
        yield return Read(HumanResourcesModule, "ik.puantaj.listele", "Puantaj kayıtlarını listele", attendance,
            [Query("from", "date"), Query("to", "date"), Query("employeeId", "guid"), Query("approvalStatus", "text"), Query("q", "text"), .. paging],
            List(attendanceColumns, "items") with { MetaPaths = meta });
        yield return Read(HumanResourcesModule, attendanceRead, "Puantaj kaydı getir", attendanceRecord, [id], Record(attendanceColumns));
        yield return Write(HumanResourcesModule, "ik.puantaj.kaydet", "Puantaj kaydı oluştur", "insert", "POST", attendance,
            BodyParameters<AttendanceWriteRequest>(sourceBacked: false, exclude: "rowVersion"), Record(Cols("id:guid", "workDate:date")), null, null,
            requiresTenantAdmin: true);
        // A correction sets the record back to PendingApproval (server rule); the personnel of the record cannot change.
        yield return Write(HumanResourcesModule, "ik.puantaj.duzelt", "Puantaj kaydını düzelt", "update", "PUT", attendanceRecord,
            [id, .. BodyParameters<AttendanceWriteRequest>(sourceBacked: true, exclude: "employeeId")],
            Record(Cols("id:guid", "workDate:date", "workedMinutes:int", "overtimeMinutes:int", "rowVersion:text")), attendanceRead, null,
            requiresTenantAdmin: true);
        yield return Write(HumanResourcesModule, "ik.puantaj.onayla", "Puantaj kaydını onayla", "update", "POST", attendanceRecord + "/approve",
            [id, rowVersion], Record(Cols("id:guid", "status:text", "approvedByUserId:guid", "approvedAt:date", "rowVersion:text")), null, null,
            requiresTenantAdmin: true);

        // ---- Dönem özeti ----
        yield return Read(HumanResourcesModule, "ik.donemOzeti", "İK dönem özeti", "/api/hr/period-summary",
            [new ErpOperationParameter("from", "query", "date", true), new ErpOperationParameter("to", "query", "date", true)],
            List(Columns<HrLeaveStatusSummary>(), "leaveStatuses") with
            {
                MetaPaths = ["from", "to", "employeesAtPeriodEnd", "attendanceRecordCount", "employeesWithAttendance", "workedMinutes",
                    "overtimeMinutes", "leaveRequestCount", "requestedLeaveDays"]
            }) with { RequiresTenantAdmin = true };
    }
}
