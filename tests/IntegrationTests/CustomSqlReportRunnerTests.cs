using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CustomSqlReportRunnerTests
{
    [Fact]
    public async Task Runner_stops_reading_after_max_rows_and_marks_truncated()
    {
        using var reader = new ArrayDataReader([("n", typeof(int))], Enumerable.Range(1, 7).Select(i => new object[] { i }).ToArray());

        var result = await CustomSqlReportRunner.ReadAsync(reader, 5, CancellationToken.None);

        Assert.Equal(5, result.Rows.Count);
        Assert.True(result.Truncated);
        Assert.Equal(new object?[] { 1, 2, 3, 4, 5 }, result.Rows.Select(row => row["n"]).ToArray());
    }

    [Fact]
    public async Task Runner_does_not_mark_truncated_when_rows_equal_max_rows()
    {
        using var reader = new ArrayDataReader([("n", typeof(int))], Enumerable.Range(1, 5).Select(i => new object[] { i }).ToArray());

        var result = await CustomSqlReportRunner.ReadAsync(reader, 5, CancellationToken.None);

        Assert.Equal(5, result.Rows.Count);
        Assert.False(result.Truncated);
    }

    [Fact]
    public async Task Runner_names_unnamed_and_duplicate_columns_uniquely()
    {
        using var reader = new ArrayDataReader([("", typeof(int)), ("a", typeof(int)), ("a", typeof(int))], [[1, 2, 3]]);

        var result = await CustomSqlReportRunner.ReadAsync(reader, 10, CancellationToken.None);

        Assert.Equal(["Sütun 1", "a", "a (2)"], result.Columns.Select(column => column.Code).ToArray());
        Assert.Equal(["Sütun 1", "a", "a (2)"], result.Columns.Select(column => column.Label).ToArray());
        var row = Assert.Single(result.Rows);
        Assert.Equal(1, row["Sütun 1"]);
        Assert.Equal(2, row["a"]);
        Assert.Equal(3, row["a (2)"]);
    }

    [Fact]
    public async Task Runner_maps_dbnull_and_binary_values_without_reading_binary_bytes()
    {
        // ArrayDataReader byte[] sütunlarında GetValue/GetBytes çağrılırsa atar.
        using var reader = new ArrayDataReader([("nothing", typeof(string)), ("blob", typeof(byte[]))], [[DBNull.Value, new byte[] { 1, 2 }]]);

        var result = await CustomSqlReportRunner.ReadAsync(reader, 10, CancellationToken.None);

        var row = Assert.Single(result.Rows);
        Assert.Null(row["nothing"]);
        Assert.Equal("[ikili veri]", row["blob"]);
    }

    [Fact]
    public async Task Runner_caps_each_text_cell_at_4000_characters()
    {
        var large = new string('x', 100_000);
        using var reader = new ArrayDataReader([("big", typeof(string)), ("exact", typeof(string))],
            [[large, new string('y', CustomSqlReportRunner.MaxCellCharacters)]]);

        var result = await CustomSqlReportRunner.ReadAsync(reader, 10, CancellationToken.None);

        var row = Assert.Single(result.Rows);
        var big = Assert.IsType<string>(row["big"]);
        Assert.Equal(CustomSqlReportRunner.MaxCellCharacters + 1, big.Length);
        Assert.StartsWith(new string('x', CustomSqlReportRunner.MaxCellCharacters), big);
        Assert.EndsWith("…", big);
        Assert.Equal(new string('y', CustomSqlReportRunner.MaxCellCharacters), row["exact"]);
        Assert.False(result.Truncated);
    }

    [Fact]
    public async Task Runner_stops_when_shared_character_budget_is_exhausted()
    {
        var budget = new CustomSqlCharacterBudget(10);
        using var first = new ArrayDataReader([("s", typeof(string))], [["abcd"], ["efgh"], ["ijkl"]]);

        var result = await CustomSqlReportRunner.ReadAsync(first, 100, CancellationToken.None, budget);

        Assert.Equal(["abcd", "efgh"], result.Rows.Select(row => row["s"]).ToArray());
        Assert.True(result.Truncated);
        Assert.Equal(0, budget.Remaining);

        // Bütçe sonraki firmanın okumasıyla paylaşılır.
        using var second = new ArrayDataReader([("s", typeof(string))], [["a"]]);
        var next = await CustomSqlReportRunner.ReadAsync(second, 100, CancellationToken.None, budget);
        Assert.Empty(next.Rows);
        Assert.True(next.Truncated);
    }

    [Fact]
    public async Task Runner_does_not_return_partial_row_when_budget_ends_mid_row()
    {
        var budget = new CustomSqlCharacterBudget(6);
        using var reader = new ArrayDataReader([("a", typeof(string)), ("b", typeof(string))], [["abc", "def"], ["ghi", "jkl"]]);

        var result = await CustomSqlReportRunner.ReadAsync(reader, 100, CancellationToken.None, budget);

        var row = Assert.Single(result.Rows);
        Assert.Equal("abc", row["a"]);
        Assert.Equal("def", row["b"]);
        Assert.True(result.Truncated);
    }

    [Fact]
    public async Task Runner_maps_unsupported_and_variant_columns_to_text_instead_of_failing()
    {
        using var reader = new ArrayDataReader([("udt", typeof(void)), ("variant", typeof(object)), ("broken", typeof(Uri))],
            [[new object(), 12.5m, new object()]])
        {
            FieldTypeThrowsFor = 0,
            GetValueThrowsFor = 2
        };

        var result = await CustomSqlReportRunner.ReadAsync(reader, 10, CancellationToken.None);

        Assert.Equal(["text", "text", "text"], result.Columns.Select(column => column.DataType).ToArray());
        var row = Assert.Single(result.Rows);
        Assert.Equal("[desteklenmeyen veri]", row["udt"]);
        Assert.Equal("12.5", row["variant"]);
        Assert.Equal("[desteklenmeyen veri]", row["broken"]);
    }

    [Fact]
    public void DescribeColumns_maps_clr_types_to_report_types()
    {
        using var reader = new ArrayDataReader([("i", typeof(int)), ("l", typeof(long)), ("m", typeof(decimal)), ("f", typeof(double)),
            ("d", typeof(DateTime)), ("o", typeof(DateTimeOffset)), ("b", typeof(bool)), ("g", typeof(Guid)), ("s", typeof(string))], []);

        var types = CustomSqlReportRunner.DescribeColumns(reader).Select(column => column.DataType).ToArray();

        Assert.Equal(["number", "number", "decimal", "decimal", "date", "date", "boolean", "text", "text"], types);
    }

    [Fact]
    public async Task ExecuteCommand_cancels_command_before_reader_is_disposed_when_truncated()
    {
        using var reader = new ArrayDataReader([("n", typeof(int))], Enumerable.Range(1, 10).Select(i => new object[] { i }).ToArray());
        await using var command = new FakeCommand(reader);

        var result = await CustomSqlReportRunner.ExecuteCommandAsync(command, 3, new CustomSqlCharacterBudget(1_000), CancellationToken.None);

        Assert.True(result.Truncated);
        Assert.Equal(1, command.CancelCalls);
        Assert.False(command.ReaderDisposedAtCancel);
        Assert.True(reader.Disposed);
    }

    [Fact]
    public async Task ExecuteCommand_does_not_cancel_when_result_is_read_completely()
    {
        using var reader = new ArrayDataReader([("n", typeof(int))], [[1], [2]]);
        await using var command = new FakeCommand(reader);

        var result = await CustomSqlReportRunner.ExecuteCommandAsync(command, 3, new CustomSqlCharacterBudget(1_000), CancellationToken.None);

        Assert.False(result.Truncated);
        Assert.Equal(0, command.CancelCalls);
    }

    [Fact]
    public async Task ExecuteCommand_cancels_command_when_reading_fails()
    {
        using var reader = new ArrayDataReader([("n", typeof(int))], [[1], [2]]) { ReadThrowsAtRow = 1 };
        await using var command = new FakeCommand(reader);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CustomSqlReportRunner.ExecuteCommandAsync(command, 3, new CustomSqlCharacterBudget(1_000), CancellationToken.None));

        Assert.Equal(1, command.CancelCalls);
        Assert.False(command.ReaderDisposedAtCancel);
    }

    [Fact]
    public async Task Execute_maps_total_deadline_to_validation_error()
    {
        var factory = new HangingQueryConnectionFactory();

        var exception = await Assert.ThrowsAsync<CustomSqlDeadlineExceededException>(() =>
            CustomSqlReportRunner.ExecuteAsync("SELECT 1", [(Guid.NewGuid(), "A"), (Guid.NewGuid(), "B")], factory,
                CancellationToken.None, TimeSpan.FromMilliseconds(50)));

        Assert.Equal("Sorgular toplam 60 saniye içinde tamamlanmadı.", exception.Message);
        var mapped = Assert.IsType<ProblemHttpResult>(CustomSqlReportRunner.MapError(exception));
        Assert.Equal(StatusCodes.Status400BadRequest, mapped.StatusCode);
        Assert.Equal(["Sorgular toplam 60 saniye içinde tamamlanmadı."], Assert.IsType<HttpValidationProblemDetails>(mapped.ProblemDetails).Errors["sqlQuery"]);
    }

    [Fact]
    public async Task Execute_maps_deadline_even_when_factory_reports_unavailable()
    {
        var factory = new HangingQueryConnectionFactory { ThrowUnavailableOnCancel = true };

        await Assert.ThrowsAsync<CustomSqlDeadlineExceededException>(() =>
            CustomSqlReportRunner.ExecuteAsync("SELECT 1", [(Guid.NewGuid(), "A")], factory,
                CancellationToken.None, TimeSpan.FromMilliseconds(50)));
    }

    [Fact]
    public async Task Execute_propagates_request_cancellation_instead_of_deadline()
    {
        var factory = new HangingQueryConnectionFactory();
        using var request = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CustomSqlReportRunner.ExecuteAsync("SELECT 1", [(Guid.NewGuid(), "A")], factory, request.Token, TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public async Task Multi_company_audit_writes_only_caller_tenant_row_into_caller_tenant_database()
    {
        var caller = Guid.NewGuid();
        var other = Guid.NewGuid();
        var user = Guid.NewGuid();
        var name = Guid.NewGuid().ToString("N");
        await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase($"tenant-{name}").Options);
        await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase($"platform-{name}").Options);

        CustomSqlReportRunner.AddAuditEvents(tenantDb, platformDb, caller, user, [(caller, "A"), (other, "B")],
            export: false, sqlLength: 42, rowCount: 7);
        await platformDb.SaveChangesAsync();
        await tenantDb.SaveChangesAsync();

        var tenantRows = await tenantDb.AuditEvents.AsNoTracking().ToListAsync();
        var tenantRow = Assert.Single(tenantRows);
        Assert.Equal(caller, tenantRow.TenantId);
        Assert.DoesNotContain(tenantRows, row => row.TenantId != caller);
        Assert.Equal("erp.report.executed", tenantRow.Action);
        Assert.Equal("customSql:companies=2:sqlLength=42:rows=7", tenantRow.Resource);

        var platformRows = await platformDb.AuditEvents.AsNoTracking().ToListAsync();
        Assert.Equal(new[] { caller, other }.Order(), platformRows.Select(row => row.TenantId!.Value).Order());
        Assert.All(platformRows, row => Assert.Equal($"customSql:callerTenant={caller:N}:sqlLength=42:rows=7", row.Resource));
    }

    [Fact]
    public async Task Audit_for_other_company_only_still_writes_caller_tenant_row()
    {
        var caller = Guid.NewGuid();
        var other = Guid.NewGuid();
        var name = Guid.NewGuid().ToString("N");
        await using var tenantDb = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase($"tenant-{name}").Options);
        await using var platformDb = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase($"platform-{name}").Options);

        CustomSqlReportRunner.AddAuditEvents(tenantDb, platformDb, caller, Guid.NewGuid(), [(other, "B")],
            export: true, sqlLength: 10, rowCount: 0);
        await platformDb.SaveChangesAsync();
        await tenantDb.SaveChangesAsync();

        var tenantRow = Assert.Single(await tenantDb.AuditEvents.AsNoTracking().ToListAsync());
        Assert.Equal(caller, tenantRow.TenantId);
        Assert.Equal("erp.report.exported", tenantRow.Action);
        Assert.Equal(other, Assert.Single(await platformDb.AuditEvents.AsNoTracking().ToListAsync()).TenantId);
    }

    [Theory]
    [InlineData("SELECT name FROM sys.sysdatabases")]
    [InlineData("SELECT [name] FROM [sys].[sysdatabases]")]
    [InlineData("SELECT DB_NAME(5) AS name")]
    [InlineData("select db_id(N'AIERPPlatform') AS id")]
    [InlineData("SELECT HAS_DBACCESS(N'AIERPPlatform') AS x")]
    [InlineData("SELECT physical_name FROM sys.master_files")]
    [InlineData("SELECT SUSER_SNAME(0x01) AS loginName")]
    [InlineData("SELECT * FROM sys.dm_exec_sessions")]
    public void Validator_rejects_server_database_and_login_enumeration(string sql)
    {
        Assert.False(ReportEndpoints.TryValidateReadOnlySql(sql, out var error));
        Assert.NotNull(error);
    }

    [Theory]
    [InlineData("SELECT * FROM sys.xp_dirtree")]
    [InlineData("SELECT * FROM xp_fileexist")]
    [InlineData("SELECT * FROM xp_subdirs")]
    public void Validator_rejects_extended_procedures(string sql) =>
        Assert.False(ReportEndpoints.TryValidateReadOnlySql(sql, out _));

    [Theory]
    [InlineData("SELECT 'DB_NAME' AS label")]
    [InlineData("SELECT Code, Name FROM CustomerAccounts")]
    public void Validator_ignores_identifiers_inside_string_literals_and_allows_tenant_tables(string sql) =>
        Assert.True(ReportEndpoints.TryValidateReadOnlySql(sql, out _));

    private sealed class HangingQueryConnectionFactory : ITenantQueryConnectionFactory
    {
        public bool ThrowUnavailableOnCancel { get; init; }

        public async Task<SqlConnection> OpenAsync(Guid tenantId, TenantQueryAccess access, CancellationToken cancellationToken)
        {
            try
            {
                await Task.Delay(Timeout.Infinite, cancellationToken);
            }
            catch (OperationCanceledException) when (ThrowUnavailableOnCancel)
            {
                throw new TenantQueryUnavailableException("Sorgu veritabanı erişimi bu firma için hazır değil.");
            }
            throw new InvalidOperationException("unreachable");
        }
    }

    private sealed class FakeCommand(ArrayDataReader reader) : DbCommand
    {
        public int CancelCalls { get; private set; }
        public bool ReaderDisposedAtCancel { get; private set; }
        [AllowNull] public override string CommandText { get; set; } = "";
        public override int CommandTimeout { get; set; }
        public override CommandType CommandType { get; set; }
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; }
        protected override DbConnection? DbConnection { get; set; }
        protected override DbParameterCollection DbParameterCollection => throw new NotSupportedException();
        protected override DbTransaction? DbTransaction { get; set; }

        public override void Cancel()
        {
            CancelCalls++;
            ReaderDisposedAtCancel = reader.Disposed;
        }

        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) => reader;
        public override int ExecuteNonQuery() => throw new NotSupportedException();
        public override object? ExecuteScalar() => throw new NotSupportedException();
        public override void Prepare() { }
        protected override DbParameter CreateDbParameter() => throw new NotSupportedException();
    }

    /// <summary>Yinelenen/boş sütun adlarına izin veren en küçük okuyucu (DataTable buna izin vermez).</summary>
    private sealed class ArrayDataReader((string Name, Type Type)[] columns, object[][] rows) : DbDataReader
    {
        private int _index = -1;
        public bool Disposed { get; private set; }
        public int FieldTypeThrowsFor { get; init; } = -1;
        public int GetValueThrowsFor { get; init; } = -1;
        public int ReadThrowsAtRow { get; init; } = -1;
        public override int FieldCount => columns.Length;
        public override bool HasRows => rows.Length > 0;
        public override bool IsClosed => Disposed;
        public override int RecordsAffected => -1;
        public override int Depth => 0;
        public override object this[int ordinal] => GetValue(ordinal);
        public override object this[string name] => GetValue(GetOrdinal(name));
        public override bool Read()
        {
            if (++_index == ReadThrowsAtRow) throw new InvalidOperationException("okuma hatası");
            return _index < rows.Length;
        }
        public override bool NextResult() => false;
        public override string GetName(int ordinal) => columns[ordinal].Name;
        public override Type GetFieldType(int ordinal) =>
            ordinal == FieldTypeThrowsFor ? throw new InvalidOperationException("UDT derlemesi yüklenemedi") : columns[ordinal].Type;
        public override string GetDataTypeName(int ordinal) => columns[ordinal].Type.Name;
        public override int GetOrdinal(string name) => Array.FindIndex(columns, column => column.Name == name);
        public override object GetValue(int ordinal)
        {
            if (columns[ordinal].Type == typeof(byte[])) throw new InvalidOperationException("İkili veri okunmamalıydı.");
            if (ordinal == GetValueThrowsFor) throw new InvalidCastException("Desteklenmeyen tür.");
            return rows[_index][ordinal];
        }
        public override bool IsDBNull(int ordinal) => rows[_index][ordinal] is DBNull;
        public override int GetValues(object[] values) { var count = Math.Min(values.Length, FieldCount); Array.Copy(rows[_index], values, count); return count; }
        public override bool GetBoolean(int ordinal) => (bool)GetValue(ordinal);
        public override byte GetByte(int ordinal) => (byte)GetValue(ordinal);
        public override long GetBytes(int ordinal, long dataOffset, byte[]? buffer, int bufferOffset, int length) =>
            throw new InvalidOperationException("İkili veri okunmamalıydı.");
        public override char GetChar(int ordinal) => (char)GetValue(ordinal);
        public override long GetChars(int ordinal, long dataOffset, char[]? buffer, int bufferOffset, int length) => throw new NotSupportedException();
        public override DateTime GetDateTime(int ordinal) => (DateTime)GetValue(ordinal);
        public override decimal GetDecimal(int ordinal) => (decimal)GetValue(ordinal);
        public override double GetDouble(int ordinal) => (double)GetValue(ordinal);
        public override float GetFloat(int ordinal) => (float)GetValue(ordinal);
        public override Guid GetGuid(int ordinal) => (Guid)GetValue(ordinal);
        public override short GetInt16(int ordinal) => (short)GetValue(ordinal);
        public override int GetInt32(int ordinal) => (int)GetValue(ordinal);
        public override long GetInt64(int ordinal) => (long)GetValue(ordinal);
        public override string GetString(int ordinal) => (string)GetValue(ordinal);
        public override IEnumerator GetEnumerator() => throw new NotSupportedException();
        protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
        public override ValueTask DisposeAsync() { Disposed = true; return base.DisposeAsync(); }
    }
}
