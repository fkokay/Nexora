using System.Text.Json;
using System.Text.RegularExpressions;

internal static class PayrollExpressionSchemaValidator
{
    private const int MaxDepth = 32;
    private const int MaxNodes = 256;
    private static readonly HashSet<string> ScalarTypes = new(StringComparer.Ordinal)
        { "decimal", "integer", "boolean", "text", "choice" };
    private static readonly HashSet<string> RoundingModes = new(StringComparer.Ordinal)
        { "toEven", "awayFromZero", "towardZero", "floor", "ceiling" };

    public static bool IsValid(JsonElement expression, string? expectedUnit)
    {
        var nodes = 0;
        if (!TryInfer(expression, 0, ref nodes, out var result)) return false;
        if (result.Type is "decimal" or "integer")
            return !string.IsNullOrWhiteSpace(expectedUnit) && UnitsMatch(result.Unit, expectedUnit);
        return result.Type == "boolean" && string.IsNullOrWhiteSpace(expectedUnit);
    }

    public static bool IsUnitValid(string? unit) => IsValidUnit(unit);

    private static bool TryInfer(JsonElement node, int depth, ref int nodes, out ExpressionType result)
    {
        result = default;
        if (depth > MaxDepth || ++nodes > MaxNodes || node.ValueKind != JsonValueKind.Object ||
            !ReadString(node, "op", out var op)) return false;

        switch (op)
        {
            case "constant":
                return node.TryGetProperty("value", out var constant) && constant.ValueKind == JsonValueKind.Number &&
                    constant.TryGetDecimal(out _) && ReadString(node, "unit", out var constantUnit) &&
                    IsValidUnit(constantUnit) && SetResult("decimal", constantUnit, out result);
            case "input":
            case "parameter":
                if (!ReadString(node, "key", out var key) || !Regex.IsMatch(key, "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$") ||
                    !ReadString(node, "valueType", out var valueType) || !ScalarTypes.Contains(valueType) ||
                    !ReadOptionalString(node, "unit", out var referenceUnit) ||
                    !ValidTypeUnit(valueType, referenceUnit)) return false;
                return SetResult(valueType, referenceUnit, out result);
            case "add":
            case "subtract":
            case "min":
            case "max":
            case "multiply":
            case "divide":
                if (!ReadChildren(node, "left", "right", depth, ref nodes, out var left, out var right) ||
                    !IsNumeric(left.Type) || !IsNumeric(right.Type)) return false;
                if (op is "add" or "subtract" or "min" or "max")
                    return UnitsMatch(left.Unit, right.Unit) && SetResult("decimal", left.Unit, out result);
                if (!TryCombineUnits(left.Unit!, right.Unit!, op == "multiply", out var combinedUnit)) return false;
                return SetResult("decimal", combinedUnit, out result);
            case "eq":
            case "ne":
            case "lt":
            case "lte":
            case "gt":
            case "gte":
                if (!ReadChildren(node, "left", "right", depth, ref nodes, out var compareLeft, out var compareRight) ||
                    compareLeft.Type != compareRight.Type || !UnitsMatch(compareLeft.Unit, compareRight.Unit) ||
                    op is not ("eq" or "ne") && !IsNumeric(compareLeft.Type)) return false;
                return SetResult("boolean", null, out result);
            case "and":
            case "or":
                if (!ReadChildren(node, "left", "right", depth, ref nodes, out var boolLeft, out var boolRight) ||
                    boolLeft.Type != "boolean" || boolRight.Type != "boolean") return false;
                return SetResult("boolean", null, out result);
            case "not":
                return node.TryGetProperty("value", out var notValue) && TryInfer(notValue, depth + 1, ref nodes, out var notType) &&
                    notType.Type == "boolean" && SetResult("boolean", null, out result);
            case "if":
                if (!node.TryGetProperty("condition", out var condition) || !TryInfer(condition, depth + 1, ref nodes, out var conditionType) ||
                    conditionType.Type != "boolean" || !node.TryGetProperty("then", out var thenValue) ||
                    !TryInfer(thenValue, depth + 1, ref nodes, out var thenType) || !node.TryGetProperty("else", out var elseValue) ||
                    !TryInfer(elseValue, depth + 1, ref nodes, out var elseType) || thenType.Type != elseType.Type ||
                    !UnitsMatch(thenType.Unit, elseType.Unit)) return false;
                return SetResult(thenType.Type, thenType.Unit, out result);
            case "round":
                if (!node.TryGetProperty("value", out var roundValue) || !TryInfer(roundValue, depth + 1, ref nodes, out var roundType) ||
                    !IsNumeric(roundType.Type) || !node.TryGetProperty("precision", out var precision) || precision.ValueKind != JsonValueKind.Number ||
                    !precision.TryGetInt32(out var digits) || digits is < 0 or > 8 ||
                    !ReadString(node, "mode", out var mode) || !RoundingModes.Contains(mode)) return false;
                return SetResult("decimal", roundType.Unit, out result);
            case "convert":
                if (!node.TryGetProperty("value", out var convertValue) || !TryInfer(convertValue, depth + 1, ref nodes, out var convertType) ||
                    !IsNumeric(convertType.Type) || !ReadString(node, "fromUnit", out var fromUnit) ||
                    !ReadString(node, "toUnit", out var toUnit) || !UnitsMatch(convertType.Unit, fromUnit) || !IsValidUnit(toUnit) ||
                    !node.TryGetProperty("factor", out var factor) || !TryInfer(factor, depth + 1, ref nodes, out var factorType) ||
                    !IsNumeric(factorType.Type) || !UnitsMatch(factorType.Unit, "1")) return false;
                return SetResult("decimal", toUnit, out result);
            default:
                return false;
        }
    }

    private static bool ReadChildren(JsonElement node, string leftName, string rightName, int depth, ref int nodes,
        out ExpressionType left, out ExpressionType right)
    {
        left = default; right = default;
        return node.TryGetProperty(leftName, out var leftNode) && TryInfer(leftNode, depth + 1, ref nodes, out left) &&
            node.TryGetProperty(rightName, out var rightNode) && TryInfer(rightNode, depth + 1, ref nodes, out right);
    }

    private static bool ReadString(JsonElement node, string property, out string value)
    {
        value = "";
        if (!node.TryGetProperty(property, out var item) || item.ValueKind != JsonValueKind.String) return false;
        var text = item.GetString();
        if (string.IsNullOrWhiteSpace(text)) return false;
        value = text;
        return true;
    }

    private static bool ReadOptionalString(JsonElement node, string property, out string? value)
    {
        value = null;
        if (!node.TryGetProperty(property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString();
        return true;
    }

    private static bool ValidTypeUnit(string type, string? unit) => IsNumeric(type)
        ? !string.IsNullOrWhiteSpace(unit) && IsValidUnit(unit)
        : string.IsNullOrWhiteSpace(unit);

    private static bool IsNumeric(string type) => type is "decimal" or "integer";

    private static bool IsValidUnit(string? unit) => !string.IsNullOrWhiteSpace(unit) && TryParseUnit(unit, out _);

    public static bool UnitsMatch(string? left, string? right) => left is null && right is null ||
        TryParseUnit(left, out var leftUnits) && TryParseUnit(right, out var rightUnits) &&
        leftUnits.Count == rightUnits.Count && leftUnits.All(x => rightUnits.TryGetValue(x.Key, out var power) && power == x.Value);

    private static bool TryCombineUnits(string left, string right, bool multiply, out string result)
    {
        result = "";
        if (!TryParseUnit(left, out var leftUnits) || !TryParseUnit(right, out var rightUnits)) return false;
        foreach (var (unit, power) in rightUnits)
        {
            var combined = leftUnits.GetValueOrDefault(unit) + (multiply ? power : -power);
            if (combined == 0) leftUnits.Remove(unit);
            else leftUnits[unit] = combined;
        }
        result = FormatUnit(leftUnits);
        return true;
    }

    private static bool TryParseUnit(string? unit, out Dictionary<string, int> units)
    {
        units = new Dictionary<string, int>(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(unit)) return false;
        if (unit == "1") return true;

        var position = 0;
        var sign = 1;
        while (position < unit.Length)
        {
            var start = position;
            while (position < unit.Length && unit[position] is not ('*' or '/')) position++;
            var token = unit[start..position];
            if (!Regex.IsMatch(token, "^[A-Za-z0-9%._-]+(?:\\^[1-8])?$")) return false;
            var powerIndex = token.IndexOf('^');
            var name = powerIndex < 0 ? token : token[..powerIndex];
            var power = powerIndex < 0 ? 1 : int.Parse(token[(powerIndex + 1)..], System.Globalization.CultureInfo.InvariantCulture);
            units[name] = units.GetValueOrDefault(name) + sign * power;
            if (units[name] == 0) units.Remove(name);
            if (position == unit.Length) break;
            sign = unit[position++] == '/' ? -1 : 1;
            if (position == unit.Length) return false;
        }
        return true;
    }

    private static string FormatUnit(Dictionary<string, int> units)
    {
        var numerator = units.Where(x => x.Value > 0).OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => x.Value == 1 ? x.Key : $"{x.Key}^{x.Value}").ToArray();
        var denominator = units.Where(x => x.Value < 0).OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => x.Value == -1 ? x.Key : $"{x.Key}^{-x.Value}").ToArray();
        var top = numerator.Length == 0 ? "1" : string.Join('*', numerator);
        return denominator.Length == 0 ? top : $"{top}/{string.Join('*', denominator)}";
    }

    private static bool SetResult(string type, string? unit, out ExpressionType result)
    {
        result = new ExpressionType(type, unit);
        return true;
    }

    private readonly record struct ExpressionType(string Type, string? Unit);
}
