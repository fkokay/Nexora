using System.Collections;
using System.Data.Common;
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
    public async Task Runner_maps_dbnull_and_binary_values()
    {
        using var reader = new ArrayDataReader([("nothing", typeof(string)), ("blob", typeof(byte[]))], [[DBNull.Value, new byte[] { 1, 2 }]]);

        var result = await CustomSqlReportRunner.ReadAsync(reader, 10, CancellationToken.None);

        var row = Assert.Single(result.Rows);
        Assert.Null(row["nothing"]);
        Assert.Equal("[ikili veri]", row["blob"]);
    }

    [Fact]
    public void DescribeColumns_maps_clr_types_to_report_types()
    {
        using var reader = new ArrayDataReader([("i", typeof(int)), ("l", typeof(long)), ("m", typeof(decimal)), ("f", typeof(double)),
            ("d", typeof(DateTime)), ("o", typeof(DateTimeOffset)), ("b", typeof(bool)), ("g", typeof(Guid)), ("s", typeof(string))], []);

        var types = CustomSqlReportRunner.DescribeColumns(reader).Select(column => column.DataType).ToArray();

        Assert.Equal(["number", "number", "decimal", "decimal", "date", "date", "boolean", "text", "text"], types);
    }

    /// <summary>Yinelenen/boş sütun adlarına izin veren en küçük okuyucu (DataTable buna izin vermez).</summary>
    private sealed class ArrayDataReader((string Name, Type Type)[] columns, object[][] rows) : DbDataReader
    {
        private int _index = -1;
        public override int FieldCount => columns.Length;
        public override bool HasRows => rows.Length > 0;
        public override bool IsClosed => false;
        public override int RecordsAffected => -1;
        public override int Depth => 0;
        public override object this[int ordinal] => GetValue(ordinal);
        public override object this[string name] => GetValue(GetOrdinal(name));
        public override bool Read() => ++_index < rows.Length;
        public override bool NextResult() => false;
        public override string GetName(int ordinal) => columns[ordinal].Name;
        public override Type GetFieldType(int ordinal) => columns[ordinal].Type;
        public override string GetDataTypeName(int ordinal) => columns[ordinal].Type.Name;
        public override int GetOrdinal(string name) => Array.FindIndex(columns, column => column.Name == name);
        public override object GetValue(int ordinal) => rows[_index][ordinal];
        public override bool IsDBNull(int ordinal) => GetValue(ordinal) is DBNull;
        public override int GetValues(object[] values) { var count = Math.Min(values.Length, FieldCount); Array.Copy(rows[_index], values, count); return count; }
        public override bool GetBoolean(int ordinal) => (bool)GetValue(ordinal);
        public override byte GetByte(int ordinal) => (byte)GetValue(ordinal);
        public override long GetBytes(int ordinal, long dataOffset, byte[]? buffer, int bufferOffset, int length) => throw new NotSupportedException();
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
    }
}
