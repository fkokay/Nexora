// Mevcut ve önerilen dosya içeriğini satır satır karşılaştıran salt okunur görünüm.

export function CodeSuggestionDiff({
  original,
  proposed,
}: {
  original: string;
  proposed: string;
}) {
  const before = original.split(/\r?\n/),
    after = proposed.split(/\r?\n/);
  if (
    before.length * after.length > 250_000 ||
    before.length + after.length > 3000
  )
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 12,
        }}
      >
        <section className="panel">
          <div className="panel-heading">
            <b>
              {original === ""
                ? "Önceki içerik · boş dosya"
                : "Önceki dosya içeriği"}
            </b>
          </div>
          <pre
            style={{
              maxHeight: 360,
              overflow: "auto",
              padding: 12,
              background: "#0b1020",
              color: "#dce5ff",
              borderRadius: 10,
              whiteSpace: "pre",
              fontSize: 12,
            }}
          >
            <code>{original}</code>
          </pre>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <b>
              {proposed === "" ? "Güncel içerik · boş" : "Güncel dosya içeriği"}
            </b>
          </div>
          <pre
            style={{
              maxHeight: 360,
              overflow: "auto",
              padding: 12,
              background: "#0b1020",
              color: "#dce5ff",
              borderRadius: 10,
              whiteSpace: "pre",
              fontSize: 12,
            }}
          >
            <code>{proposed}</code>
          </pre>
        </section>
      </div>
    );
  const lcs = Array.from(
    { length: before.length + 1 },
    () => new Uint32Array(after.length + 1),
  );
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      lcs[i][j] =
        before[i] === after[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const rows: {
    kind: "same" | "add" | "remove";
    text: string;
    line: number;
  }[] = [];
  let i = 0,
    j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      rows.push({ kind: "same", text: before[i], line: i + 1 });
      i++;
      j++;
    } else if (
      j < after.length &&
      (i === before.length || lcs[i][j + 1] >= lcs[i + 1][j])
    ) {
      rows.push({ kind: "add", text: after[j], line: j + 1 });
      j++;
    } else {
      rows.push({ kind: "remove", text: before[i], line: i + 1 });
      i++;
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <b>Satır diff’i</b>
        <small>Yeşil: eklendi · Kırmızı: kaldırıldı</small>
      </div>
      <pre
        style={{
          maxHeight: 450,
          overflow: "auto",
          padding: 12,
          background: "#0b1020",
          color: "#dce5ff",
          borderRadius: 10,
          whiteSpace: "pre",
          fontSize: 12,
        }}
      >
        <code>
          {rows.map((row, index) => (
            <span
              key={index}
              style={{
                display: "block",
                background:
                  row.kind === "add"
                    ? "rgba(34,197,94,.18)"
                    : row.kind === "remove"
                      ? "rgba(239,68,68,.18)"
                      : "transparent",
                color:
                  row.kind === "add"
                    ? "#86efac"
                    : row.kind === "remove"
                      ? "#fca5a5"
                      : "#dce5ff",
              }}
            >
              {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}{" "}
              {String(row.line).padStart(4, " ")} │ {row.text || " "}
            </span>
          ))}
        </code>
      </pre>
    </section>
  );
}
