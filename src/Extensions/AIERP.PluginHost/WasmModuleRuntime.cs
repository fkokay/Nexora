using System.Text.Json;
using AIERP.ModuleSDK;
using Wasmtime;

namespace AIERP.PluginHost;

/// <summary>
/// Executes a narrow JSON-in/JSON-out Core WebAssembly ABI. No WASI, host imports,
/// filesystem, network, ERP services, or database handles are exposed to modules.
/// </summary>
public sealed class WasmModuleRuntime : IDisposable
{
    public const int MaximumInputBytes = 256 * 1024;
    public const int MaximumOutputBytes = 512 * 1024;
    public const ulong InvocationFuel = 20_000_000;
    private readonly Engine _engine;

    public WasmModuleRuntime()
    {
        using var config = new Config();
        config.WithFuelConsumption(true).WithMaximumStackSize(1024 * 1024);
        _engine = new Engine(config);
    }

    public void Validate(ReadOnlySpan<byte> wasm)
    {
        using var module = Module.FromBytes(_engine, "module", wasm);
        EnsureNoImports(module);
        using var store = CreateStore(fuel: 1_000_000);
        var instance = new Instance(store, module);
        _ = GetAbi(instance);
    }

    public JsonElement Invoke(ReadOnlySpan<byte> wasm, ModuleInvocationInput request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var input = JsonSerializer.SerializeToUtf8Bytes(new
        {
            tenantId = request.TenantId,
            moduleCode = request.ModuleCode,
            moduleVersion = request.Version,
            action = request.Action,
            data = request.Data
        });
        if (input.Length > MaximumInputBytes) throw new InvalidDataException("Module invocation input exceeds 256 KiB.");

        using var module = Module.FromBytes(_engine, "module", wasm);
        EnsureNoImports(module);
        using var store = CreateStore(InvocationFuel);
        var instance = new Instance(store, module);
        var (memory, allocate, invoke) = GetAbi(instance);
        var inputPointer = allocate(input.Length);
        if (inputPointer < 0 || (long)inputPointer + input.Length > memory.GetSpan<byte>(0).Length)
            throw new WasmtimeException("Module allocator returned an invalid input range.");
        input.CopyTo(memory.GetSpan<byte>(inputPointer, input.Length));

        var packedResult = invoke(inputPointer, input.Length);
        var result = unchecked((ulong)packedResult);
        var outputPointer = (int)(result >> 32);
        var outputLength = (int)(result & uint.MaxValue);
        if (outputPointer < 0 || outputLength < 0 || outputLength > MaximumOutputBytes ||
            (long)outputPointer + outputLength > memory.GetSpan<byte>(0).Length)
            throw new WasmtimeException("Module returned an invalid or oversized output range.");

        var outputBytes = memory.GetSpan<byte>(outputPointer, outputLength).ToArray();
        try
        {
            using var document = JsonDocument.Parse(outputBytes, new JsonDocumentOptions { MaxDepth = 32 });
            return document.RootElement.Clone();
        }
        catch (JsonException exception)
        {
            throw new WasmtimeException($"Module output is not valid JSON: {exception.Message}");
        }
    }

    private Store CreateStore(ulong fuel)
    {
        var store = new Store(_engine) { Fuel = fuel };
        store.SetLimits(memorySize: 64L * 1024 * 1024, tableElements: 1024, instances: 1, tables: 1, memories: 1);
        return store;
    }

    private static void EnsureNoImports(Module module)
    {
        if (module.Imports.Any()) throw new WasmtimeException("Module imports are disabled by the AIERP runtime ABI.");
    }

    private static (Memory Memory, Func<int, int> Allocate, Func<int, int, long> Invoke) GetAbi(Instance instance)
    {
        var memory = instance.GetMemory("memory")
            ?? throw new WasmtimeException("Module must export memory as 'memory'.");
        var allocate = instance.GetFunction<int, int>("aierp_alloc")
            ?? throw new WasmtimeException("Module must export aierp_alloc(i32) -> i32.");
        var invoke = instance.GetFunction<int, int, long>("aierp_invoke")
            ?? throw new WasmtimeException("Module must export aierp_invoke(i32, i32) -> i64.");
        return (memory, allocate, invoke);
    }

    public void Dispose() => _engine.Dispose();
}
