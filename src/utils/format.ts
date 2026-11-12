export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function money(minor: number, currency: string): string {
  const formatted = (minor / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'PEN') return `S/ ${formatted}`;
  if (currency === 'USD') return `$ ${formatted}`;
  return `${currency} ${formatted}`;
}

export function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-PE');
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-PE');
}

export function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Sin dato';
  return `${Number(value).toFixed(2)} kg`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}