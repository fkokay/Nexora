import { ListPageHeader } from "../list-page/ListPageHeader";
import type { Plan } from "./types";

type Props = {
  plans: Plan[];
  admin: boolean;
  baseCurrency: string;
  onNew: () => void;
  loading: boolean;
  controlsLocked: boolean;
  error: string;
  notice: string;
  onRetry: () => void;
};

export function BudgetPageChrome({
  plans,
  admin,
  baseCurrency,
  onNew,
  loading,
  controlsLocked,
  error,
  notice,
  onRetry,
}: Props) {
  return (
    <>
      <ListPageHeader
        title="Bütçe planı ve gerçekleşen"
        description="Aylık gelir ve gider hedeflerini yevmiye gerçekleşenleriyle aynı ekranda izleyin."
        count={loading && plans.length === 0 ? null : plans.length}
        countLabel="bütçe"
      >
        {admin && (
          <button
            type="button"
            className="primary"
            onClick={onNew}
            disabled={controlsLocked || !baseCurrency}
          >
            + Yeni bütçe
          </button>
        )}
      </ListPageHeader>
      {error && (
        <div className="alert inline-alert budget-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="row-action"
            onClick={onRetry}
            disabled={loading}
          >
            Yeniden dene
          </button>
        </div>
      )}
      {notice && (
        <div className="notice inline-notice budget-notice" role="status">
          {notice}
        </div>
      )}
    </>
  );
}

export function BudgetBoundaryNote({ baseCurrency }: { baseCurrency: string }) {
  return (
    <div className="boundary-note">
      <span>
        Gerçekleşen değerler yalnız mali yıldaki yevmiye kayıtlarından ve
        firmanın baz para birimi ({baseCurrency || "yükleniyor"}) üzerinden
        hesaplanır. Gelir hesabında alacak − borç, gider hesabında borç − alacak
        kullanılır. Bu ekran kur çevrimi, bordro veya vergi mevzuatı hesabı
        yapmaz.
      </span>
    </div>
  );
}
