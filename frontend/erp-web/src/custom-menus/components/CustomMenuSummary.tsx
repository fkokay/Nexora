type Props = { entryCount: number; targetCount: number; developerEdit: boolean };

export function CustomMenuSummary({ entryCount, targetCount, developerEdit }: Props) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TENANT UYARLAMA</p>
          <h1>Özel menüler</h1>
          <p className="muted">
            ERP menülerini düzenleyin, çalışma alanına özel kısayollar ekleyin.
          </p>
          {developerEdit && (
            <p className="muted">
              Menü değişiklikleri firma genelinde hemen uygulanır.
            </p>
          )}
        </div>
        <span className="custom-menu-count">{entryCount} / 30 özel kısayol</span>
      </div>
      <section className="custom-menu-kpis" aria-label="Özel menü özeti">
        <article>
          <span>Özel kısayol</span>
          <b>{entryCount}</b>
        </article>
        <article>
          <span>Kullanılabilir alan</span>
          <b>{30 - entryCount}</b>
        </article>
        <article>
          <span>ERP hedefi</span>
          <b>{targetCount}</b>
        </article>
      </section>
    </>
  );
}
