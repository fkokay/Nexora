using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class WriteSqlValidatorTests
{
    private static void AssertRejected(string sql, string kind)
    {
        Assert.False(ReportEndpoints.TryValidateWriteSql(sql, kind, out var error), $"Kabul edilmemeliydi: {sql}");
        Assert.False(string.IsNullOrWhiteSpace(error));
    }

    [Theory]
    [InlineData("insert", "INSERT INTO T(a) VALUES(@a)")]
    [InlineData("update", "UPDATE T SET a=@a WHERE id=@id")]
    [InlineData("delete", "DELETE FROM T WHERE id=@id")]
    [InlineData("insert", "INSERT INTO dbo.CustomerNotes (CustomerId, Note) VALUES (@id, @not)")]
    [InlineData("insert", "INSERT INTO Arsiv (Kod, Ad) SELECT Code, Name FROM CustomerAccounts WHERE Code = @kod")]
    [InlineData("update", "UPDATE c SET c.Name = @ad FROM CustomerAccounts c WHERE c.Id IN (SELECT Id FROM CustomerAccounts WHERE Code = @kod)")]
    [InlineData("delete", "DELETE FROM Notlar WHERE Metin = 'a;b -- /* x */'")]
    [InlineData("update", "update T set a = @a where Deleted = 0 and [Update] = 1")]
    public void Accepts_single_statement_write_sql_matching_kind(string kind, string sql)
    {
        Assert.True(ReportEndpoints.TryValidateWriteSql(sql, kind, out var error), error);
        Assert.Null(error);
    }

    [Fact]
    public void Rejects_multi_statement_or_kind_mismatch_write_sql()
    {
        AssertRejected("UPDATE T SET a = 1; DROP TABLE x", "update");
        AssertRejected("UPDATE T SET a = 1;", "update");
        AssertRejected("DELETE FROM T WHERE id = @id", "update");
        AssertRejected("UPDATE T SET a = 1", "insert");
        AssertRejected("INSERT INTO T(a) VALUES (1)", "delete");
        // Without a semicolon T-SQL still runs a second statement.
        AssertRejected("UPDATE T SET a = 1 DELETE FROM T", "update");
        AssertRejected("UPDATE T SET a = 1 UPDATE U SET b = 2", "update");
        AssertRejected("DELETE FROM T WHERE id = 1 INSERT INTO U(a) VALUES (1)", "delete");
        AssertRejected("INSERT INTO T(a) VALUES (1) INSERT INTO T(a) VALUES (2)", "insert");
        AssertRejected("UPDATE T SET a = 1 SELECT * FROM Users", "update");
        AssertRejected("INSERT INTO T(a) VALUES (1) SELECT * FROM Users", "insert");
        AssertRejected("UPDATE T SET a = 1 WHERE id = 1 SET NOCOUNT ON", "update");
        AssertRejected("DELETE FROM T DECLARE @x int", "delete");
        AssertRejected("WITH x AS (SELECT 1 AS a) UPDATE T SET a = 1", "update");
        AssertRejected("SELECT 1", "update");
        AssertRejected("UPDATE T SET a = 1", "read");
        AssertRejected("UPDATE T SET a = 1", "UPDATE");
    }

    [Fact]
    public void Rejects_exec_ddl_merge_into_openrowset_comments_in_write_sql()
    {
        AssertRejected("UPDATE T SET a = 1 EXEC sp_who", "update");
        AssertRejected("UPDATE T SET a = 1 EXECUTE('x')", "update");
        AssertRejected("UPDATE T SET a = dbo.xp_cmdshell('dir')", "update");
        AssertRejected("INSERT INTO T(a) SELECT name FROM sp_helpdb", "insert");
        AssertRejected("DELETE FROM T DROP TABLE U", "delete");
        AssertRejected("UPDATE T SET a = 1 ALTER TABLE T ADD b int", "update");
        AssertRejected("DELETE FROM T TRUNCATE TABLE U", "delete");
        AssertRejected("INSERT INTO T(a) VALUES (1) CREATE TABLE U(a int)", "insert");
        AssertRejected("UPDATE T SET a = 1 GRANT SELECT ON T TO public", "update");
        AssertRejected("MERGE INTO T USING U ON T.a = U.a WHEN MATCHED THEN DELETE", "delete");
        AssertRejected("INSERT INTO T(a) SELECT a FROM OPENROWSET('SQLNCLI', 'x', 'SELECT 1')", "insert");
        AssertRejected("INSERT INTO T(a) SELECT a FROM OPENQUERY(srv, 'SELECT 1')", "insert");
        AssertRejected("INSERT INTO T(a) SELECT a FROM OPENDATASOURCE('x', 'y').db.dbo.t", "insert");
        AssertRejected("INSERT INTO T(a) SELECT a INTO Kopya FROM U", "insert");
        AssertRejected("UPDATE T SET a = 1 OUTPUT inserted.a INTO Log(a)", "update");
        AssertRejected("DELETE FROM T OUTPUT deleted.* INTO Arsiv", "delete");
        AssertRejected("INSERT INTO T(a) BULK INSERT", "insert");
        AssertRejected("UPDATE T SET a = 1 -- yorum", "update");
        AssertRejected("UPDATE T SET a = 1 /* yorum */", "update");
        AssertRejected("UPDATE T SET a = '{{x}}'", "update");
        AssertRejected("UPDATE T SET a = 1 WHERE b = {{x}}", "update");
        AssertRejected("UPDATE T SET a = DB_NAME()", "update");
        AssertRejected("INSERT INTO T(a) SELECT name FROM sys.databases", "insert");
        AssertRejected("INSERT INTO T(a) SELECT name FROM master.dbo.sysdatabases", "insert");
        AssertRejected("UPDATE OtherDb.dbo.T SET a = 1", "update");
        AssertRejected("UPDATE T SET a = 1 WAITFOR DELAY '00:00:10'", "update");
        AssertRejected("UPDATE T SET a = 'kapanmamış", "update");
        AssertRejected("", "update");
        AssertRejected("   ", "update");
        AssertRejected("UPDATE T SET a = 1 WHERE b = '" + new string('x', 10_000) + "'", "update");
    }

    [Fact]
    public void Read_validator_behaviour_unchanged()
    {
        Assert.True(ReportEndpoints.TryValidateReadOnlySql("SELECT Code FROM CustomerAccounts WHERE Code = 'a;b'", out var error), error);
        Assert.True(ReportEndpoints.TryValidateReadOnlySql("WITH x AS (SELECT 1 AS a) SELECT a FROM x", out error), error);
        Assert.False(ReportEndpoints.TryValidateReadOnlySql("SELECT 1; SELECT 2", out error));
        Assert.Equal("Tek bir salt okunur SELECT sorgusu kullanın; yorum, batch ve noktalı virgül kullanılamaz.", error);
        Assert.False(ReportEndpoints.TryValidateReadOnlySql("UPDATE T SET a = 1", out error));
        Assert.Equal("Sorgu SELECT veya WITH ... SELECT ile başlamalıdır.", error);
        Assert.False(ReportEndpoints.TryValidateReadOnlySql("SELECT 'x", out error));
        Assert.Equal("SQL metin sabitinde tırnak kapanmamış.", error);
        Assert.False(ReportEndpoints.TryValidateReadOnlySql("SELECT dbo.fn(1)", out error));
        Assert.Equal("Şemaya bağlı kullanıcı fonksiyonları çalıştırılamaz.", error);
    }
}
