export type Perfil = 'administrador' | 'responsable' | 'operario' | 'veterinario';

export type Vista =
  | 'login'
  | 'inicio'
  | 'listado'
  | 'formulario'
  | 'detalle'
  | 'animales'
  | 'reproduccion'
  | 'inventario'
  | 'alimentacion'
  | 'sanidad'
  | 'alertas'
  | 'finanzas'
  | 'reportes'
  | 'configuracion'
  | 'administracion';

export type EstadoUI = 'normal' | 'cargando' | 'vacio' | 'rechazo' | 'sin_conexion' | 'pendiente_local' | 'confirmado';

export interface AnimalMock {
  id: string;
  arete: string;
  galpon: string;
  corral: string;
  lote: string;
  etapa: 'Lechón' | 'Crecimiento' | 'Engorde' | 'Maternidad' | 'Gestación';
  sexo: 'M' | 'H' | 'Pendiente';
  pesoKg: number;
  fechaIngreso: string;
  estadoSalud: 'Sano' | 'En tratamiento' | 'Retiro vigente';
  diasRetiroRestantes?: number;
}

export interface PesajeHistorico {
  fecha: string;
  pesoKg: number;
  gananciaGramosDia: number;
  registradoPor: string;
}

export interface MovimientoHistorico {
  fecha: string;
  tipo: 'Ingreso' | 'Traslado' | 'Tratamiento' | 'Pesaje' | 'Baja';
  origen?: string;
  destino?: string;
  detalle: string;
}
