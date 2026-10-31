type Props = { onImport: () => void }

export function BankStatementImportPrompt({ onImport }: Props) {
  return <section className="panel finance-statement-import-prompt">
    <div>
      <p className="eyebrow">BANKA EKSTRESİ</p>
      <h2>CSV aktarımını başlatın</h2>
      <p>İmzalı tutar kullanın: pozitif giriş, negatif çıkış. Bakiye toplamı API tarafından doğrulanır.</p>
    </div>
    <button type="button" className="primary" onClick={onImport}>Banka ekstresi içe aktar</button>
  </section>
}
