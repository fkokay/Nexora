/// <summary>
/// Server-side parser for page conditions (<c>visibleWhen</c>, <c>disabledWhen</c>). It mirrors the client parser in
/// <c>frontend/erp-web/src/custom-page/conditions.ts</c> exactly; both are checked against <c>conditions.vectors.json</c>.
/// The server only validates syntax and collects path roots; it never evaluates a condition.
/// </summary>
internal static class PageConditionExpression
{
    internal const int MaxLength = 300;
    private const int MaxString = 100;
    private const int MaxDepth = 8;
    private static readonly HashSet<string> Keywords = new(StringComparer.Ordinal) { "true", "false", "null", "in" };

    private enum TokenType { Op, Keyword, String, Number, Path }
    private readonly record struct Token(TokenType Type, string Value);
    private sealed class ConditionException(string message) : Exception(message);

    /// <summary>Parses per the Wire-contract grammar; roots are the first identifiers of every path, in order, distinct.</summary>
    internal static bool TryParse(string text, out IReadOnlyList<string> roots, out string? error)
    {
        roots = [];
        error = null;
        try
        {
            if (string.IsNullOrWhiteSpace(text)) throw new ConditionException("ifade boş");
            if (text.Length > MaxLength) throw new ConditionException($"ifade en fazla {MaxLength} karakter olabilir");
            var parser = new Parser(Tokenize(text));
            parser.Parse();
            roots = parser.Roots;
            return true;
        }
        catch (ConditionException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool IsIdentStart(char c) => char.IsAsciiLetter(c) || c == '_';
    private static bool IsIdentChar(char c) => char.IsAsciiLetterOrDigit(c) || c == '_';

    private static int ReadIdent(string text, int index)
    {
        if (index >= text.Length || !IsIdentStart(text[index])) return 0;
        var end = index + 1;
        while (end < text.Length && IsIdentChar(text[end])) end++;
        return end - index;
    }

    /// <summary>Matches <c>-?\d+(?:\.\d+)?</c> at <paramref name="index"/> (ASCII digits only); 0 when no match.</summary>
    private static int ReadNumber(string text, int index)
    {
        var position = index;
        if (position < text.Length && text[position] == '-') position++;
        var digitsStart = position;
        while (position < text.Length && char.IsAsciiDigit(text[position])) position++;
        if (position == digitsStart) return 0;
        if (position + 1 < text.Length && text[position] == '.' && char.IsAsciiDigit(text[position + 1]))
        {
            position++;
            while (position < text.Length && char.IsAsciiDigit(text[position])) position++;
        }
        return position - index;
    }

    /// <summary>Matches <c>(?:\.IDENT|\[\d{1,4}\])*</c>, the tail of a binding path.</summary>
    private static int ReadPathTail(string text, int index)
    {
        var position = index;
        while (position < text.Length)
        {
            if (text[position] == '.')
            {
                var ident = ReadIdent(text, position + 1);
                if (ident == 0) break;
                position += 1 + ident;
                continue;
            }
            if (text[position] == '[')
            {
                var digits = 0;
                while (position + 1 + digits < text.Length && char.IsAsciiDigit(text[position + 1 + digits]) && digits < 5) digits++;
                if (digits is < 1 or > 4 || position + 1 + digits >= text.Length || text[position + 1 + digits] != ']') break;
                position += digits + 2;
                continue;
            }
            break;
        }
        return position - index;
    }

    private static List<Token> Tokenize(string text)
    {
        var tokens = new List<Token>();
        var index = 0;
        while (index < text.Length)
        {
            var c = text[index];
            if (c is ' ' or '\t' or '\r' or '\n') { index++; continue; }
            if (index + 1 < text.Length)
            {
                var two = text.Substring(index, 2);
                if (two is "||" or "&&" or "==" or "!=") { tokens.Add(new Token(TokenType.Op, two)); index += 2; continue; }
            }
            if (c is '!' or '(' or ')' or '[' or ']' or ',') { tokens.Add(new Token(TokenType.Op, c.ToString())); index++; continue; }
            if (c is '\'' or '"')
            {
                var end = text.IndexOf(c, index + 1);
                if (end < 0) throw new ConditionException("kapanmamış metin");
                var value = text[(index + 1)..end];
                if (value.Length > MaxString) throw new ConditionException($"metin en fazla {MaxString} karakter olabilir");
                tokens.Add(new Token(TokenType.String, value));
                index = end + 1;
                continue;
            }
            var number = ReadNumber(text, index);
            if (number > 0)
            {
                // "1abc" gibi sayıya yapışık ad geçersizdir.
                if (ReadIdent(text, index + number) > 0) throw new ConditionException($"beklenmeyen karakter: {text[index + number]}");
                tokens.Add(new Token(TokenType.Number, text.Substring(index, number)));
                index += number;
                continue;
            }
            var ident = ReadIdent(text, index);
            if (ident > 0)
            {
                var name = text.Substring(index, ident);
                index += ident;
                if (Keywords.Contains(name)) { tokens.Add(new Token(TokenType.Keyword, name)); continue; }
                var tail = ReadPathTail(text, index);
                tokens.Add(new Token(TokenType.Path, name + text.Substring(index, tail)));
                index += tail;
                continue;
            }
            throw new ConditionException($"beklenmeyen karakter: {c}");
        }
        return tokens;
    }

    private sealed class Parser(List<Token> tokens)
    {
        private int position;
        private int depth;
        public List<string> Roots { get; } = [];

        private Token? Peek => position < tokens.Count ? tokens[position] : null;
        private bool IsOp(string value) => Peek is { Type: TokenType.Op } token && token.Value == value;
        private void ExpectOp(string value)
        {
            if (!IsOp(value)) throw new ConditionException($"'{value}' bekleniyordu");
            position++;
        }

        public void Parse()
        {
            Expr();
            if (position < tokens.Count) throw new ConditionException("ifadenin sonunda fazladan simge var");
        }

        private bool Literal()
        {
            if (Peek is not { } token) return false;
            if (token.Type is TokenType.String or TokenType.Number || token.Type == TokenType.Keyword && token.Value != "in")
            {
                position++;
                return true;
            }
            return false;
        }

        private void Operand()
        {
            if (Peek is not { } token) throw new ConditionException("ifade eksik");
            if (IsOp("("))
            {
                depth++;
                if (depth > MaxDepth) throw new ConditionException($"en fazla {MaxDepth} düzey parantez kullanılabilir");
                position++;
                Expr();
                ExpectOp(")");
                depth--;
                return;
            }
            if (token.Type == TokenType.Path)
            {
                position++;
                var root = token.Value[..ReadIdent(token.Value, 0)];
                if (!Roots.Contains(root, StringComparer.Ordinal)) Roots.Add(root);
                return;
            }
            if (Literal()) return;
            throw new ConditionException("işlenen bekleniyordu");
        }

        private void Cmp()
        {
            Operand();
            if (IsOp("==") || IsOp("!="))
            {
                position++;
                Operand();
                return;
            }
            if (Peek is { Type: TokenType.Keyword, Value: "in" })
            {
                position++;
                ExpectOp("[");
                for (;;)
                {
                    if (!Literal()) throw new ConditionException("liste öğesi sabit değer olmalı");
                    if (IsOp(",")) { position++; continue; }
                    break;
                }
                ExpectOp("]");
            }
        }

        private void Unary()
        {
            if (IsOp("!")) { position++; Unary(); return; }
            Cmp();
        }

        private void And()
        {
            Unary();
            while (IsOp("&&")) { position++; Unary(); }
        }

        private void Expr()
        {
            And();
            while (IsOp("||")) { position++; And(); }
        }
    }
}
