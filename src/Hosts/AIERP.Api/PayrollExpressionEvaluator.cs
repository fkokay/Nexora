using System.Text.Json;

internal static class PayrollExpressionEvaluator
{
    private const int MaxDepth = 32;
    private const int MaxNodes = 256;

    public static bool TryEvaluate(JsonElement expression,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> parameters,
        string? expectedUnit,
        out PayrollExpressionRuntimeValue result,
        out string? error)
    {
        result = default!;
        error = null;
        if (!PayrollExpressionSchemaValidator.IsValid(expression, expectedUnit))
            return Fail("İfade şeması veya beklenen birim geçersiz.", out result, out error);

        var nodes = 0;
        try
        {
            if (!EvaluateNode(expression, inputs, parameters, 0, ref nodes, out result, out error)) return false;
            if (!string.IsNullOrWhiteSpace(expectedUnit) && !PayrollExpressionSchemaValidator.UnitsMatch(result.Unit, expectedUnit))
                return Fail("Sonuç birimi beklenen birimle eşleşmiyor.", out result, out error);
            return true;
        }
        catch (Exception ex) when (ex is OverflowException or DivideByZeroException or ArgumentOutOfRangeException)
        {
            return Fail("İfade sayısal sınırı aştı veya sıfıra bölme yaptı.", out result, out error);
        }
    }

    private static bool EvaluateNode(JsonElement node,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> inputs,
        IReadOnlyDictionary<string, PayrollExpressionRuntimeValue> parameters,
        int depth, ref int nodes, out PayrollExpressionRuntimeValue result, out string? error)
    {
        result = default!;
        error = null;
        if (depth > MaxDepth || ++nodes > MaxNodes || !TryString(node, "op", out var op))
            return Fail("İfade sınırları aşıldı.", out result, out error);

        if (op is "input" or "parameter")
        {
            if (!TryString(node, "key", out var key) ||
                !(op == "input" ? inputs : parameters).TryGetValue(key, out var binding) ||
                !TryString(node, "valueType", out var declaredType) || binding.Type != declaredType ||
                !TryOptionalString(node, "unit", out var declaredUnit) ||
                !PayrollExpressionSchemaValidator.UnitsMatch(binding.Unit, declaredUnit))
                return Fail($"{op} bağlaması eksik veya tür/birim tanımıyla uyuşmuyor.", out result, out error);
            result = binding;
            if (!IsValidRuntimeValue(result)) return Fail("Bağlanan değer geçersiz.", out result, out error);
            return true;
        }

        if (op == "constant")
        {
            if (!node.TryGetProperty("value", out var value) || !value.TryGetDecimal(out var number) ||
                !TryString(node, "unit", out var unit)) return Fail("Sabit sayı geçersiz.", out result, out error);
            result = new("decimal", number, unit);
            return true;
        }

        if (op == "if")
        {
            if (!TryChild(node, "condition", out var conditionNode) ||
                !EvaluateNode(conditionNode, inputs, parameters, depth + 1, ref nodes, out var condition, out error) ||
                condition.Type != "boolean") return Fail(error ?? "Koşul boolean olmalıdır.", out result, out error);
            var branchName = (bool)condition.Value! ? "then" : "else";
            return TryChild(node, branchName, out var branch) &&
                EvaluateNode(branch, inputs, parameters, depth + 1, ref nodes, out result, out error);
        }

        if (op == "not")
        {
            if (!TryChild(node, "value", out var valueNode) ||
                !EvaluateNode(valueNode, inputs, parameters, depth + 1, ref nodes, out var value, out error) || value.Type != "boolean")
                return Fail(error ?? "not işleci boolean değer bekliyor.", out result, out error);
            result = new("boolean", !(bool)value.Value!, null);
            return true;
        }

        if (op is "round" or "convert")
        {
            if (!TryChild(node, "value", out var valueNode) ||
                !EvaluateNode(valueNode, inputs, parameters, depth + 1, ref nodes, out var value, out error) || !TryNumber(value, out var number))
                return Fail(error ?? "İşlem sayısal değer bekliyor.", out result, out error);
            if (op == "round")
            {
                if (!node.TryGetProperty("precision", out var precisionNode) || !precisionNode.TryGetInt32(out var precision) ||
                    !TryString(node, "mode", out var mode) || !TryRounding(mode, out var rounding))
                    return Fail("Yuvarlama hassasiyeti veya yöntemi geçersiz.", out result, out error);
                result = new("decimal", decimal.Round(number, precision, rounding), value.Unit);
                return true;
            }
            if (!TryChild(node, "factor", out var factorNode) ||
                !EvaluateNode(factorNode, inputs, parameters, depth + 1, ref nodes, out var factor, out error) ||
                !TryNumber(factor, out var factorNumber) || !PayrollExpressionSchemaValidator.UnitsMatch(factor.Unit, "1") ||
                !TryString(node, "fromUnit", out var fromUnit) || !PayrollExpressionSchemaValidator.UnitsMatch(value.Unit, fromUnit) ||
                !TryString(node, "toUnit", out var toUnit))
                return Fail(error ?? "Dönüşüm girdileri geçersiz.", out result, out error);
            result = new("decimal", number * factorNumber, toUnit);
            return true;
        }

        if (!TryChild(node, "left", out var leftNode) ||
            !EvaluateNode(leftNode, inputs, parameters, depth + 1, ref nodes, out var left, out error))
            return Fail(error ?? "Sol operand eksik veya geçersiz.", out result, out error);
        if (op is "and" or "or")
        {
            if (left.Type != "boolean") return Fail("Boolean işleci boolean değer bekliyor.", out result, out error);
            var leftBool = (bool)left.Value!;
            if (op == "and" && !leftBool || op == "or" && leftBool)
            {
                result = new("boolean", leftBool, null);
                return true;
            }
        }
        if (!TryChild(node, "right", out var rightNode) ||
            !EvaluateNode(rightNode, inputs, parameters, depth + 1, ref nodes, out var right, out error))
            return Fail(error ?? "Sağ operand eksik veya geçersiz.", out result, out error);

        if (op is "and" or "or")
        {
            if (right.Type != "boolean") return Fail("Boolean işleci boolean değer bekliyor.", out result, out error);
            result = new("boolean", op == "and" ? (bool)left.Value! && (bool)right.Value! : (bool)left.Value! || (bool)right.Value!, null);
            return true;
        }
        if (op is "eq" or "ne" or "lt" or "lte" or "gt" or "gte")
            return Compare(op, left, right, out result, out error);
        if (!TryNumber(left, out var leftNumber) || !TryNumber(right, out var rightNumber))
            return Fail("Aritmetik işleç sayısal değer bekliyor.", out result, out error);

        switch (op)
        {
            case "add": result = new("decimal", leftNumber + rightNumber, left.Unit); break;
            case "subtract": result = new("decimal", leftNumber - rightNumber, left.Unit); break;
            case "multiply": result = new("decimal", leftNumber * rightNumber, CombineUnits(left.Unit!, right.Unit!, true)); break;
            case "divide": result = new("decimal", leftNumber / rightNumber, CombineUnits(left.Unit!, right.Unit!, false)); break;
            case "min": result = new("decimal", Math.Min(leftNumber, rightNumber), left.Unit); break;
            case "max": result = new("decimal", Math.Max(leftNumber, rightNumber), left.Unit); break;
            default: return Fail("Bilinmeyen ifade işleci.", out result, out error);
        }
        return true;
    }

    private static bool Compare(string op, PayrollExpressionRuntimeValue left, PayrollExpressionRuntimeValue right,
        out PayrollExpressionRuntimeValue result, out string? error)
    {
        result = default!; error = null;
        var comparison = left.Type switch
        {
            "decimal" or "integer" => ((decimal)left.Value!).CompareTo((decimal)right.Value!),
            "boolean" => ((bool)left.Value!).CompareTo((bool)right.Value!),
            "text" or "choice" => string.CompareOrdinal((string)left.Value!, (string)right.Value!),
            _ => int.MinValue
        };
        if (comparison == int.MinValue) return Fail("Karşılaştırma türü geçersiz.", out result, out error);
        var value = op switch
        {
            "eq" => comparison == 0, "ne" => comparison != 0, "lt" => comparison < 0,
            "lte" => comparison <= 0, "gt" => comparison > 0, "gte" => comparison >= 0,
            _ => false
        };
        result = new("boolean", value, null);
        return true;
    }

    private static bool IsValidRuntimeValue(PayrollExpressionRuntimeValue value) => value.Type switch
    {
        "decimal" => value.Value is decimal,
        "integer" => value.Value is decimal n && decimal.Truncate(n) == n,
        "boolean" => value.Value is bool,
        "text" or "choice" => value.Value is string,
        _ => false
    };

    private static bool TryNumber(PayrollExpressionRuntimeValue value, out decimal number)
    {
        number = 0;
        if (value.Type is not ("decimal" or "integer") || value.Value is not decimal numeric) return false;
        number = numeric;
        return true;
    }

    private static bool TryRounding(string mode, out MidpointRounding rounding)
    {
        rounding = mode switch
        {
            "toEven" => MidpointRounding.ToEven,
            "awayFromZero" => MidpointRounding.AwayFromZero,
            "towardZero" => MidpointRounding.ToZero,
            "floor" => MidpointRounding.ToNegativeInfinity,
            "ceiling" => MidpointRounding.ToPositiveInfinity,
            _ => (MidpointRounding)(-1)
        };
        return (int)rounding >= 0;
    }

    private static string CombineUnits(string left, string right, bool multiply)
    {
        var powers = new Dictionary<string, int>(StringComparer.Ordinal);
        ApplyUnit(left, 1, powers);
        ApplyUnit(right, multiply ? 1 : -1, powers);
        var numerator = powers.Where(x => x.Value > 0).OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => x.Value == 1 ? x.Key : $"{x.Key}^{x.Value}").ToArray();
        var denominator = powers.Where(x => x.Value < 0).OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => x.Value == -1 ? x.Key : $"{x.Key}^{-x.Value}").ToArray();
        return (numerator.Length == 0 ? "1" : string.Join('*', numerator)) +
            (denominator.Length == 0 ? "" : "/" + string.Join('*', denominator));
    }

    private static void ApplyUnit(string unit, int sign, Dictionary<string, int> powers)
    {
        var position = 0;
        var direction = 1;
        while (position < unit.Length)
        {
            var start = position;
            while (position < unit.Length && unit[position] is not ('*' or '/')) position++;
            var factor = unit[start..position];
            if (factor != "1")
            {
                var parts = factor.Split('^', 2);
                var power = parts.Length == 1 ? 1 : int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
                var combined = powers.GetValueOrDefault(parts[0]) + sign * direction * power;
                if (combined == 0) powers.Remove(parts[0]); else powers[parts[0]] = combined;
            }
            if (position < unit.Length) direction = unit[position++] == '/' ? -1 : 1;
        }
    }

    private static bool TryChild(JsonElement node, string property, out JsonElement child) =>
        node.TryGetProperty(property, out child) && child.ValueKind == JsonValueKind.Object;

    private static bool TryString(JsonElement node, string property, out string value)
    {
        value = "";
        if (!node.TryGetProperty(property, out var item) || item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString() ?? "";
        return value.Length > 0;
    }

    private static bool TryOptionalString(JsonElement node, string property, out string? value)
    {
        value = null;
        if (!node.TryGetProperty(property, out var item)) return false;
        if (item.ValueKind == JsonValueKind.Null) return true;
        if (item.ValueKind != JsonValueKind.String) return false;
        value = item.GetString();
        return true;
    }

    private static bool Fail(string message, out PayrollExpressionRuntimeValue result, out string? error)
    {
        result = default!; error = message; return false;
    }
}

internal sealed record PayrollExpressionRuntimeValue(string Type, object Value, string? Unit);
