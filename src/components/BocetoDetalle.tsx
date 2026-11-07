import React from 'react';
import { PesajeHistorico, MovimientoHistorico, Vista } from '../types';
import {
  IconArrowLeft,
  IconScale,
  IconCalendar,
  IconAlertTriangle,
  IconPlus,
  IconPig,
} from './icons';

interface BocetoDetalleProps {
  animalId: string;
  onNavigate: (vista: Vista) => void;
}

const HISTORIAL_PESAJES: PesajeHistorico[] = [
  { fecha: '20/10/2026', pesoKg: 44.0, gananciaGramosDia: 400, registradoPor: 'Operario 1' },
  { fecha: '05/10/2026', pesoKg: 38.0, gananciaGramosDia: 450, registradoPor: 'Operario 1' },
  { fecha: '15/09/2026', pesoKg: 29.0, gananciaGramosDia: 420, registradoPor: 'Operario 1' },
];

const HISTORIAL_MOVIMIENTOS: MovimientoHistorico[] = [
  { fecha: '04/11/2026', tipo: 'Tratamiento', detalle: 'Enrofloxacina 10% (3 ml) · Retiro sanitario de 10 días hasta 14/11/2026' },
  { fecha: '20/10/2026', tipo: 'Pesaje', detalle: 'Pesaje de control de etapa: 44.0 kg' },
  { fecha: '05/08/2026', tipo: 'Tratamiento', detalle: 'Vacuna Mycoplasma aplicada según regla +60 días' },
  { fecha: '06/06/2026', tipo: 'Ingreso', detalle: 'Nacimiento / Alta de reemplazo con código textual 002' },
];

export function BocetoDetalle({ animalId, onNavigate }: BocetoDetalleProps) {
  return (
    <div className="boceto-container">
      <header className="page-header">
        <div className="header-title-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onNavigate('listado')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconArrowLeft size={16} />
              <span>Volver al inventario</span>
            </span>
          </button>
          <span className="badge-boceto">Ficha individual</span>
        </div>

        <div className="animal-summary-banner">
          <div className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPig size={28} className="text-primary" />
            <div>
              <h2 className="title-md">Arete {animalId}</h2>
              <span className="text-muted text-sm">Hembra de reemplazo · Galpón A (Corral A1)</span>
            </div>
          </div>
          <div className="banner-kpis">
            <div className="kpi-mini">
              <span className="kpi-label">Peso actual</span>
              <span className="kpi-value">44.0 kg</span>
            </div>
            <div className="kpi-mini">
              <span className="kpi-label">Lote</span>
              <span className="kpi-value">L-2026-01</span>
            </div>
          </div>
        </div>
      </header>

      <div className="alert alert-warning" role="alert">
        <div className="inline-flex items-center justify-center gap-2 leading-none">
          <IconAlertTriangle size={18} />
          <span>
            <strong>Periodo de retiro clínico vigente:</strong> Tratamiento del 04/11/2026. Prohibido traslado a beneficio o venta hasta el 14/11/2026.
          </span>
        </div>
      </div>

      <div className="detail-grid">
        <section className="card">
          <h3 className="section-title">Datos zootécnicos</h3>
          <div className="data-list">
            <div className="data-row">
              <span className="data-label">Código único</span>
              <span className="data-value font-numeric">{animalId}</span>
            </div>
            <div className="data-row">
              <span className="data-label">Galpón actual</span>
              <span className="data-value">Galpón A</span>
            </div>
            <div className="data-row">
              <span className="data-label">Ubicación física</span>
              <span className="data-value">Corral A1</span>
            </div>
            <div className="data-row">
              <span className="data-label">Etapa productiva</span>
              <span className="data-value">Crecimiento</span>
            </div>
            <div className="data-row">
              <span className="data-label">Fecha de nacimiento</span>
              <span className="data-value">06/06/2026</span>
            </div>
            <div className="data-row">
              <span className="data-label">Edad actual</span>
              <span className="data-value">154 días</span>
            </div>
            <div className="data-row">
              <span className="data-label">Valor patrimonial</span>
              <span className="data-value font-numeric">S/ 350.00</span>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header-clean">
            <h3 className="section-title">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconScale size={18} />
                <span>Historial de pesajes</span>
              </span>
            </h3>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => onNavigate('formulario')}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={14} />
                <span>Nuevo peso</span>
              </span>
            </button>
          </div>
          <table className="data-table-compact">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Peso</th>
                <th>Ganancia diaria</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {HISTORIAL_PESAJES.map((pesaje, idx) => (
                <tr key={idx}>
                  <td>{pesaje.fecha}</td>
                  <td className="font-numeric">{pesaje.pesoKg.toFixed(1)} kg</td>
                  <td className="font-numeric">+{pesaje.gananciaGramosDia} g/d</td>
                  <td className="text-muted text-xs">{pesaje.registradoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card form-col-span-full">
          <h3 className="section-title">
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconCalendar size={18} />
              <span>Cronología de eventos (Auditoría D1)</span>
            </span>
          </h3>
          <ul className="timeline">
            {HISTORIAL_MOVIMIENTOS.map((mov, idx) => (
              <li key={idx} className="timeline-item">
                <div className="timeline-dot"></div>
                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-date">{mov.fecha}</span>
                    <span className="badge-tag">{mov.tipo}</span>
                  </div>
                  <p className="timeline-text">{mov.detalle}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
