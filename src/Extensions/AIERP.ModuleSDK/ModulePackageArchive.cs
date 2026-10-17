using System.IO.Compression;

namespace AIERP.ModuleSDK;

/// <summary>Validates and reads the fixed WebAssembly payload inside a signed module package.</summary>
public static class ModulePackageArchive
{
    public const int MaximumPackageBytes = 25 * 1024 * 1024;
    public const int MaximumWasmBytes = 8 * 1024 * 1024;

    public static byte[] ExtractWasm(ReadOnlyMemory<byte> packageBytes)
    {
        if (packageBytes.Length is <= 0 or > MaximumPackageBytes)
            throw new InvalidDataException("Module package must be between 1 byte and 25 MiB.");

        using var input = new MemoryStream(packageBytes.ToArray(), writable: false);
        using var archive = new ZipArchive(input, ZipArchiveMode.Read, leaveOpen: false);
        if (archive.Entries.Count != 1 || archive.Entries[0].FullName != "module.wasm" ||
            archive.Entries[0].Length is <= 0 or > MaximumWasmBytes ||
            archive.Entries[0].CompressedLength > MaximumWasmBytes)
            throw new InvalidDataException("Module package must contain exactly one root module.wasm file no larger than 8 MiB.");

        using var artifact = archive.Entries[0].Open();
        using var output = new MemoryStream((int)archive.Entries[0].Length);
        artifact.CopyTo(output);
        if (output.Length != archive.Entries[0].Length)
            throw new InvalidDataException("Module WebAssembly size does not match its archive metadata.");
        return output.ToArray();
    }
}
