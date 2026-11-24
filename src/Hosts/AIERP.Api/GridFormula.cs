/// <summary>
/// Server twin of <c>parseFormula</c> in <c>frontend/erp-web/src/custom-page/gridFormula.ts</c> (validation only; the runtime
/// evaluates). Both are checked against <c>gridFormula.vectors.json</c>. Grammar: numbers (<c>[0-9]+</c> or <c>[0-9]+.[0-9]+</c>),
/// codes of the grid's other number columns (formulas may chain without cycles, see <see cref="Order"/>), <c>+ - * /</c>, parentheses and unary minus; space and tab are ignored.
/// Anything else (functions, strings, exponents, "1.", ".5", "1e3", dotted codes) is invalid.
/// </summary>
internal static class GridFormula
{
    internal const int MaxLength = 200;
    private const int MaxDepth = 20;

    private readonly record struct Token(char Kind, string Text);

    /// <summary>
    /// Parses <paramref name="text"/>; <paramref name="columns"/> are the codes it may reference. On success
    /// <paramref name="refs"/> lists the referenced codes (distinct, in order); otherwise <paramref name="error"/> is a Turkish reason.
    /// </summary>
    internal static bool TryParse(string text, IReadOnlySet<string> columns, out IReadOnlyList<string> refs, out string? error)
    {
        var references = new List<string>();
        refs = references;
        error = null;
        if (text.Length > MaxLength) return Fail($"en fazla {MaxLength} karakter", out error);
        if (!Tokenize(text, out var tokens, out var reason)) return Fail(reason!, out error);
        if (tokens.Count == 0) return Fail("boş", out error);
        var parser = new Parser(tokens, columns, references);
        if (!parser.Expression(0)) return Fail(parser.Error ?? "ifade eksik", out error);
        if (parser.Position < tokens.Count)
        {
            var rest = tokens[parser.Position];
            return Fail(rest.Kind == 's' ? $"beklenmeyen '{rest.Text}'" : "işleç eksik", out error);
        }
        return true;
    }

    /// <summary>
    /// Evaluation order of formula columns (Kahn, like <c>formulaOrder</c> in gridFormula.ts): each formula after the formulas it
    /// references, ties in written order. <paramref name="refs"/>: formula code → referenced codes (non-formula codes ignored).
    /// Codes on, or depending on, a cycle end up in <paramref name="cyclic"/>.
    /// </summary>
    internal static IReadOnlyList<string> Order(IReadOnlyList<(string Code, IReadOnlyList<string> Refs)> refs, out IReadOnlyList<string> cyclic)
    {
        var codes = refs.Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        var done = new HashSet<string>(StringComparer.Ordinal);
        var order = new List<string>();
        for (var progress = true; progress;)
        {
            progress = false;
            foreach (var (code, deps) in refs)
            {
                if (done.Contains(code) || !deps.All(x => !codes.Contains(x) || done.Contains(x))) continue;
                done.Add(code);
                order.Add(code);
                progress = true;
            }
        }
        cyclic = refs.Select(x => x.Code).Where(x => !done.Contains(x)).ToArray();
        return order;
    }

    private static bool Fail(string reason, out string? error)
    {
        error = $"Formül geçersiz ({reason})";
        return false;
    }

    private static bool IsDigit(char c) => c is >= '0' and <= '9';
    private static bool IsLetter(char c) => c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or '_';

    private static bool Tokenize(string text, out List<Token> tokens, out string? error)
    {
        tokens = [];
        error = null;
        var index = 0;
        while (index < text.Length)
        {
            var c = text[index];
            if (c is ' ' or '\t') { index++; continue; }
            if (c is '+' or '-' or '*' or '/' or '(' or ')') { tokens.Add(new Token('s', c.ToString())); index++; continue; }
            if (IsDigit(c))
            {
                var start = index;
                while (index < text.Length && IsDigit(text[index])) index++;
                if (index + 1 < text.Length && text[index] == '.' && IsDigit(text[index + 1]))
                {
                    index++;
                    while (index < text.Length && IsDigit(text[index])) index++;
                }
                if (index < text.Length && (IsLetter(text[index]) || IsDigit(text[index]) || text[index] == '.'))
                { error = $"geçersiz sayı ({start + 1}. karakter)"; return false; }
                tokens.Add(new Token('n', text[start..index]));
                continue;
            }
            if (IsLetter(c))
            {
                var start = index;
                while (index < text.Length && (IsLetter(text[index]) || IsDigit(text[index]))) index++;
                if (index < text.Length && text[index] == '.') { error = $"noktalı sütun kodu kullanılamaz ({start + 1}. karakter)"; return false; }
                tokens.Add(new Token('c', text[start..index]));
                continue;
            }
            error = $"beklenmeyen karakter '{c}' ({index + 1}. karakter)";
            return false;
        }
        return true;
    }

    private sealed class Parser(List<Token> tokens, IReadOnlySet<string> columns, List<string> refs)
    {
        public int Position { get; private set; }
        public string? Error { get; private set; }

        private bool IsSymbol(string symbol) => Position < tokens.Count && tokens[Position].Kind == 's' && tokens[Position].Text == symbol;

        public bool Expression(int depth)
        {
            if (!Term(depth)) return false;
            while (IsSymbol("+") || IsSymbol("-"))
            {
                Position++;
                if (!Term(depth)) return false;
            }
            return true;
        }

        private bool Term(int depth)
        {
            if (!Unary(depth)) return false;
            while (IsSymbol("*") || IsSymbol("/"))
            {
                Position++;
                if (!Unary(depth)) return false;
            }
            return true;
        }

        private bool Unary(int depth)
        {
            if (depth > MaxDepth) { Error ??= "çok derin iç içe ifade"; return false; }
            if (IsSymbol("-")) { Position++; return Unary(depth + 1); }
            return Primary(depth);
        }

        private bool Primary(int depth)
        {
            if (Position >= tokens.Count) { Error ??= "ifade eksik"; return false; }
            var token = tokens[Position++];
            if (token.Kind == 'n') return true;
            if (token.Kind == 'c')
            {
                if (!columns.Contains(token.Text)) { Error ??= $"'{token.Text}' kullanılabilecek bir sayı sütunu değil"; return false; }
                if (!refs.Contains(token.Text)) refs.Add(token.Text);
                return true;
            }
            if (token.Text == "(")
            {
                if (!Expression(depth + 1)) return false;
                if (!IsSymbol(")")) { Error ??= "kapanmayan parantez"; return false; }
                Position++;
                return true;
            }
            Error ??= $"beklenmeyen '{token.Text}'";
            return false;
        }
    }
}
