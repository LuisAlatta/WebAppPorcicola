import { IconArrowLeft, IconArrowRight } from './icons';

export function Pagination({ page, pageSize, total, loading, onPage, navLabel, prevLabel, nextLabel, unit }: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
  navLabel: string;
  prevLabel: string;
  nextLabel: string;
  unit: string;
}) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={navLabel} className="animal-pagination">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label={prevLabel}
        disabled={loading || page <= 0}
        onClick={() => onPage(page - 1)}
      >
        <IconArrowLeft size={16} />
        <span>Anterior</span>
      </button>
      <span className="animal-pagination-info">
        Página {page + 1} de {pages}
        <small>{total} {unit}</small>
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-label={nextLabel}
        disabled={loading || (page + 1) * pageSize >= total}
        onClick={() => onPage(page + 1)}
      >
        <span>Siguiente</span>
        <IconArrowRight size={16} />
      </button>
    </nav>
  );
}
