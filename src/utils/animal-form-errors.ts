export const animalFieldIds: Record<string, string> = {
  code: 'ani-code', animalType: 'ani-form-type', sex: 'ani-form-sex',
  birthDate: 'ani-birth', birthWeightKg: 'ani-birth-weight',
  weaningDate: 'ani-weaning', weaningWeightKg: 'ani-weaning-weight',
  aptitude: 'ani-aptitude', originType: 'ani-origin', entryDate: 'ani-entry-date',
  barnId: 'ani-barn', entryStageCode: 'ani-entry-stage', locationCode: 'ani-location',
  lotCode: 'ani-lot', purchaseAmount: 'ani-purchase-amount',
  purchaseCurrencyCode: 'ani-purchase-currency', mother: 'ani-mother-field',
  father: 'ani-father-field', reason: 'ani-reason',
};

// Las respuestas actuales de la API contienen mensajes, no nombres de campo.
export function animalErrorField(message: string): string | undefined {
  const rules: [RegExp, string][] = [
    [/cabezas.*sin identificar/i, 'originType'],
    [/madre/i, 'mother'], [/padre|progenitor|genealog/i, 'father'],
    [/cerda.*hembra|verraco.*macho|sexo/i, 'sex'],
    [/fecha de destete/i, 'weaningDate'], [/fecha de nacimiento/i, 'birthDate'],
    [/peso al nacer/i, 'birthWeightKg'], [/peso al destete/i, 'weaningWeightKg'],
    [/etapa/i, 'entryStageCode'], [/ubicaci[oó]n|corral/i, 'locationCode'],
    [/lote/i, 'lotCode'], [/aptitud/i, 'aptitude'],
    [/importe|compra.*requiere/i, 'purchaseAmount'], [/moneda/i, 'purchaseCurrencyCode'],
    [/c[oó]digo|arete/i, 'code'], [/tipo de animal|cambiar el tipo/i, 'animalType'],
    [/galp[oó]n/i, 'barnId'], [/fecha de ingreso/i, 'entryDate'],
    [/procedencia|cabezas sin identificar/i, 'originType'], [/motivo/i, 'reason'],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1];
}

export function animalSaveError(message: string): string {
  if (/cabezas.*sin identificar/i.test(message)) {
    return 'No hay animales sin identificar disponibles en el grupo seleccionado. Revise Procedencia: use Interna solo si el animal ya está contado en inventario y coinciden su galpón, etapa, sexo, lote y fecha de ingreso. Si es un ingreso nuevo, elija Nacimiento, Compra o Existencia inicial según corresponda. No se ha guardado la ficha ni se han sumado cabezas.';
  }
  return message;
}
