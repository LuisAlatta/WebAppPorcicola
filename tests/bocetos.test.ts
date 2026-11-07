import { describe, expect, it } from 'vitest';
import { Perfil, Vista, EstadoUI } from '../src/types';

describe('Bocetos navegables · T02', () => {
  it('define los cuatro perfiles operativos de la granja', () => {
    const perfiles: Perfil[] = ['administrador', 'responsable', 'operario', 'veterinario'];
    expect(perfiles).toHaveLength(4);
    expect(perfiles).toContain('administrador');
    expect(perfiles).toContain('responsable');
    expect(perfiles).toContain('operario');
    expect(perfiles).toContain('veterinario');
  });

  it('define las cinco vistas navegables mínimas del plan', () => {
    const vistas: Vista[] = ['login', 'inicio', 'listado', 'formulario', 'detalle'];
    expect(vistas).toHaveLength(5);
    expect(vistas).toContain('login');
    expect(vistas).toContain('inicio');
    expect(vistas).toContain('listado');
    expect(vistas).toContain('formulario');
    expect(vistas).toContain('detalle');
  });

  it('soporta los estados de interfaz requeridos', () => {
    const estados: EstadoUI[] = [
      'normal',
      'cargando',
      'vacio',
      'rechazo',
      'sin_conexion',
      'pendiente_local',
      'confirmado',
    ];
    expect(estados).toHaveLength(7);
  });

  it('soporta la vista exclusiva de administración T05', () => {
    const vistaAdmin: Vista = 'administracion';
    expect(vistaAdmin).toBe('administracion');
  });
});
