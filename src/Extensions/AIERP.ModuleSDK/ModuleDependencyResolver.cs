namespace AIERP.ModuleSDK;

public sealed record ModuleDependencyResolutionResult(
    bool IsValid,
    IReadOnlyList<ModuleManifest> InstallOrder,
    IReadOnlyList<string> Errors);

/// <summary>Resolves a requested module and its exact catalog dependencies before installation.</summary>
public static class ModuleDependencyResolver
{
    public static ModuleDependencyResolutionResult Resolve(
        string requestedModuleCode,
        IEnumerable<ModuleManifest> availableModules)
    {
        var errors = new List<string>();
        var catalog = new Dictionary<string, ModuleManifest>(StringComparer.Ordinal);
        foreach (var manifest in availableModules)
        {
            var validation = ModuleManifestValidator.Validate(manifest);
            if (!validation.IsValid)
            {
                errors.Add($"Catalog module '{manifest.ModuleCode}' has an invalid manifest.");
                continue;
            }

            if (!catalog.TryAdd(manifest.ModuleCode, manifest))
                errors.Add($"Catalog contains more than one release for module '{manifest.ModuleCode}'.");
        }

        if (errors.Count > 0) return new(false, [], errors);
        if (!catalog.ContainsKey(requestedModuleCode))
            return new(false, [], [$"Requested module '{requestedModuleCode}' is not in the catalog."]);

        var state = new Dictionary<string, byte>(StringComparer.Ordinal);
        var order = new List<ModuleManifest>();
        var stack = new List<string>();
        Visit(requestedModuleCode);
        return new(errors.Count == 0, errors.Count == 0 ? order : [], errors);

        void Visit(string moduleCode)
        {
            if (state.TryGetValue(moduleCode, out var currentState))
            {
                if (currentState == 2) return;
                if (currentState == 1)
                {
                    var cycleStart = stack.IndexOf(moduleCode);
                    var cycle = stack.Skip(Math.Max(cycleStart, 0)).Append(moduleCode);
                    errors.Add($"Module dependency cycle detected: {string.Join(" -> ", cycle)}.");
                }
                return;
            }

            state[moduleCode] = 1;
            stack.Add(moduleCode);
            var manifest = catalog[moduleCode];
            foreach (var dependency in manifest.Dependencies.OrderBy(x => x.ModuleCode, StringComparer.Ordinal))
            {
                if (!catalog.TryGetValue(dependency.ModuleCode, out var dependencyManifest))
                {
                    errors.Add($"Module '{moduleCode}' requires missing module '{dependency.ModuleCode}'.");
                    continue;
                }

                if (!SemVersion.TryParse(dependency.MinimumVersion, out var minimum) ||
                    !SemVersion.TryParse(dependencyManifest.Version, out var installed) || installed.CompareTo(minimum) < 0)
                {
                    errors.Add($"Module '{moduleCode}' requires '{dependency.ModuleCode}' version {dependency.MinimumVersion} or newer; catalog has {dependencyManifest.Version}.");
                    continue;
                }

                Visit(dependency.ModuleCode);
            }
            stack.RemoveAt(stack.Count - 1);
            state[moduleCode] = 2;
            order.Add(manifest);
        }
    }

    private readonly record struct SemVersion(string Major, string Minor, string Patch, string? Prerelease) : IComparable<SemVersion>
    {
        public static bool TryParse(string value, out SemVersion version)
        {
            version = default;
            if (!ModuleManifestValidator.IsValidSemVersion(value)) return false;
            var withoutBuild = value.Split('+', 2)[0];
            var parts = withoutBuild.Split('-', 2);
            var core = parts[0].Split('.');
            if (core.Length != 3) return false;

            version = new(core[0], core[1], core[2], parts.Length == 2 ? parts[1] : null);
            return true;
        }

        public int CompareTo(SemVersion other)
        {
            var coreResult = CompareNumeric(Major, other.Major);
            if (coreResult != 0) return coreResult;
            coreResult = CompareNumeric(Minor, other.Minor);
            if (coreResult != 0) return coreResult;
            coreResult = CompareNumeric(Patch, other.Patch);
            if (coreResult != 0) return coreResult;
            if (Prerelease is null) return other.Prerelease is null ? 0 : 1;
            if (other.Prerelease is null) return -1;

            var left = Prerelease.Split('.');
            var right = other.Prerelease.Split('.');
            for (var i = 0; i < Math.Min(left.Length, right.Length); i++)
            {
                var leftNumeric = IsNumericIdentifier(left[i]);
                var rightNumeric = IsNumericIdentifier(right[i]);
                var result = leftNumeric && rightNumeric
                    ? CompareNumeric(left[i], right[i])
                    : leftNumeric != rightNumeric
                        ? leftNumeric ? -1 : 1
                        : string.Compare(left[i], right[i], StringComparison.Ordinal);
                if (result != 0) return result;
            }
            return left.Length.CompareTo(right.Length);
        }

        private static bool IsNumericIdentifier(string value) => value.All(char.IsAsciiDigit);

        private static int CompareNumeric(string left, string right) => left.Length != right.Length
            ? left.Length.CompareTo(right.Length)
            : string.Compare(left, right, StringComparison.Ordinal);
    }
}
