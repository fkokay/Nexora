using System.IO.Compression;
using System.Text;
using System.Text.Json;
using AIERP.ModuleSDK;
using AIERP.PluginHost;
using Wasmtime;

namespace AIERP.Platform.UnitTests;

public sealed class PluginHostTests
{
    [Fact]
    public void ModulePackageArchive_RequiresOneBoundedRootWasmEntry()
    {
        var wasm = BuildModule();
        var package = BuildPackage(("module.wasm", wasm));
        Assert.Equal(wasm, ModulePackageArchive.ExtractWasm(package));
        Assert.Throws<InvalidDataException>(() => ModulePackageArchive.ExtractWasm(BuildPackage(("../module.wasm", wasm))));
        Assert.Throws<InvalidDataException>(() => ModulePackageArchive.ExtractWasm(BuildPackage(("module.wasm", wasm), ("extra.txt", [1]))));
    }

    [Fact]
    public void WasmModuleRuntime_InvokesFixedJsonAbiAndRejectsImports()
    {
        using var runtime = new WasmModuleRuntime();
        var wasm = BuildModule();
        runtime.Validate(wasm);
        using var input = JsonDocument.Parse("{\"name\":\"Ada\"}");
        var result = runtime.Invoke(wasm, new ModuleInvocationInput(Guid.NewGuid(), "sample.module", "1.0.0", "render", input.RootElement.Clone()));
        Assert.True(result.GetProperty("ok").GetBoolean());
        Assert.Throws<WasmtimeException>(() => runtime.Validate(BuildModule(importFunction: true)));
    }

    [Fact]
    public void WasmModuleRuntime_TrapsWhenFuelIsExhausted()
    {
        using var runtime = new WasmModuleRuntime();
        using var input = JsonDocument.Parse("{}");
        Assert.Throws<WasmtimeException>(() => runtime.Invoke(BuildModule(infiniteLoop: true),
            new ModuleInvocationInput(Guid.NewGuid(), "sample.module", "1.0.0", "run", input.RootElement.Clone())));
    }

    private static byte[] BuildPackage(params (string Path, byte[] Contents)[] entries)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        foreach (var (path, contents) in entries)
        {
            using var entry = archive.CreateEntry(path).Open();
            entry.Write(contents);
        }
        return output.ToArray();
    }

    private static byte[] BuildModule(bool importFunction = false, bool infiniteLoop = false)
    {
        var bytes = new List<byte> { 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 };
        WriteSection(bytes, 1, [0x02, 0x60, 0x01, 0x7f, 0x01, 0x7f, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7e]);
        if (importFunction)
            WriteSection(bytes, 2, [0x01, 0x03, (byte)'e', (byte)'n', (byte)'v', 0x04, (byte)'n', (byte)'o', (byte)'o', (byte)'p', 0x00, 0x00]);
        WriteSection(bytes, 3, [0x02, 0x00, 0x01]);
        WriteSection(bytes, 5, [0x01, 0x00, 0x01]);
        var exports = new List<byte> { 0x03 };
        WriteExport(exports, "memory", 0x02, 0);
        WriteExport(exports, "aierp_alloc", 0x00, importFunction ? 1u : 0u);
        WriteExport(exports, "aierp_invoke", 0x00, importFunction ? 2u : 1u);
        WriteSection(bytes, 7, exports);

        var allocBody = new byte[] { 0x00, 0x41, 0x00, 0x0b };
        var invokeBody = infiniteLoop
            ? new byte[] { 0x00, 0x03, 0x40, 0x0c, 0x00, 0x0b, 0x0b }
            : [0x00, 0x42, .. SignedLeb((4096L << 32) | 11), 0x0b];
        var code = new List<byte> { 0x02 };
        WriteVectorBytes(code, allocBody);
        WriteVectorBytes(code, invokeBody);
        WriteSection(bytes, 10, code);
        if (!infiniteLoop)
        {
            var output = Encoding.UTF8.GetBytes("{\"ok\":true}");
            var data = new List<byte> { 0x01, 0x00, 0x41 };
            data.AddRange(SignedLeb(4096));
            data.Add(0x0b);
            WriteUnsignedLeb(data, (uint)output.Length);
            data.AddRange(output);
            WriteSection(bytes, 11, data);
        }
        return bytes.ToArray();
    }

    private static void WriteExport(List<byte> output, string name, byte kind, uint index)
    {
        var encoded = Encoding.UTF8.GetBytes(name);
        WriteUnsignedLeb(output, (uint)encoded.Length);
        output.AddRange(encoded);
        output.Add(kind);
        WriteUnsignedLeb(output, index);
    }

    private static void WriteVectorBytes(List<byte> output, byte[] value)
    {
        WriteUnsignedLeb(output, (uint)value.Length);
        output.AddRange(value);
    }

    private static void WriteSection(List<byte> output, byte id, IEnumerable<byte> payload)
    {
        var section = payload.ToArray();
        output.Add(id);
        WriteUnsignedLeb(output, (uint)section.Length);
        output.AddRange(section);
    }

    private static void WriteUnsignedLeb(List<byte> output, uint value)
    {
        do
        {
            var next = (byte)(value & 0x7f);
            value >>= 7;
            if (value != 0) next |= 0x80;
            output.Add(next);
        } while (value != 0);
    }

    private static byte[] SignedLeb(long value)
    {
        var output = new List<byte>();
        bool more;
        do
        {
            var next = (byte)(value & 0x7f);
            value >>= 7;
            var sign = (next & 0x40) != 0;
            more = !((value == 0 && !sign) || (value == -1 && sign));
            if (more) next |= 0x80;
            output.Add(next);
        } while (more);
        return output.ToArray();
    }
}
