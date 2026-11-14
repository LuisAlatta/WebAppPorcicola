export function projectedDate(date: string, days: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(Number(days)) || Number(days) < 1) return '';
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return Number.isNaN(result.getTime()) ? '' : result.toISOString().slice(0, 10);
}
