import { describe, expect, it } from 'vitest';
import { animalErrorField, animalFieldIds } from '../src/utils/animal-form-errors';

describe('Errores del registro individual', () => {
  it.each([
    ['La etapa no está vigente en la fecha de ingreso', 'entryStageCode'],
    ['Ya existe un animal con el código 001', 'code'],
    ['Una cerda debe registrarse como hembra', 'sex'],
    ['Un verraco debe registrarse como macho', 'sex'],
    ['La fecha de nacimiento no puede ser posterior al ingreso', 'birthDate'],
    ['La fecha de destete no puede ser anterior al nacimiento', 'weaningDate'],
    ['Indique la fecha de destete junto con su peso', 'weaningDate'],
    ['Peso al nacer inválido', 'birthWeightKg'],
    ['Peso al destete inválido', 'weaningWeightKg'],
    ['La ubicación no está vigente en la fecha indicada', 'locationCode'],
    ['El lote no está vigente en la fecha de ingreso', 'lotCode'],
    ['La aptitud no está vigente en la fecha de ingreso', 'aptitude'],
    ['El importe de compra debe ser mayor que cero', 'purchaseAmount'],
    ['Toda compra de animales requiere importe para enlazarla con Finanzas', 'purchaseAmount'],
    ['Código de moneda inválido', 'purchaseCurrencyCode'],
    ['Indique la madre interna o externa, no ambas', 'mother'],
    ['Indique el padre interno o externo, no ambos', 'father'],
    ['La madre debe ser de sexo hembra', 'mother'],
    ['La padre debe ser de sexo macho', 'father'],
    ['La fecha de nacimiento de la madre debe ser anterior a la del animal', 'mother'],
    ['El galpón indicado no existe', 'barnId'],
    ['La fecha de ingreso no puede ser futura', 'entryDate'],
    ['No hay cabezas sin identificar en ese grupo para vincular la ficha', 'originType'],
  ])('asocia %s al campo %s', (message, field) => {
    expect(animalErrorField(message)).toBe(field);
    expect(animalFieldIds[field]).toBeTruthy();
  });

  it('no atribuye fallos de red o del servidor a un dato del usuario', () => {
    expect(animalErrorField('No se pudo conectar con el servidor')).toBeUndefined();
    expect(animalErrorField('No se pudo guardar la ficha.')).toBeUndefined();
  });
});
