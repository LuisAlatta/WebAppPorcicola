export function availabilityForStatus(status: string, availability: string): string {
  return availability === '1' && ['vendido', 'muerto', 'descartado'].includes(status) ? '' : availability;
}
