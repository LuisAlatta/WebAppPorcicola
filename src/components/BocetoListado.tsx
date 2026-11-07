import React, { useState } from 'react';
import { AnimalMock, EstadoUI, Vista } from '../types';
import {
  IconSearch,
  IconFilter,
  IconPlus,
  IconEdit,
  IconPig,
  IconAlertTriangle,
  IconRefreshCw,
} from './icons';

interface BocetoListadoProps {
  onNavigate: (vista: Vista) => void;
  onSelectAnimal: (id: string) => void;
  estadoUI: EstadoUI;
}

const ANIMALES_INICIALES: AnimalMock[] = [
  {
    id: '002',
    arete: '002',
    galpon: 'Galpón A',
    corral: 'Corral A1',
    lote: 'L-2026-01',
    etapa: 'Crecimiento',
    sexo: 'H',
    pesoKg: 44.0,
    fechaIngreso: '06/06/2026',
    estadoSalud: 'Retiro vigente',
    diasRetiroRestantes: 7,
  },
  {
    id: '003',
    arete: '003',
    galpon: 'Galpón A',
    corral: 'Corral A1',
    lote: 'L-2026-01',
    etapa: 'Crecimiento',
    sexo: 'M',
    pesoKg: 42.5,
    fechaIngreso: '06/06/2026',
    estadoSalud: 'Sano',
  },
  {
    id: '004',
    arete: '004',
    galpon: 'Galpón B',
    corral: 'Corral B2',
    lote: 'L-2026-02',
    etapa: 'Engorde',
    sexo: 'M',
    pesoKg: 78.0,
    fechaIngreso: '15/04/2026',
    estadoSalud: 'Sano',
  },
  {
    id: '005',
    arete: '005',
    galpon: 'Galpón B',
    corral: 'Corral B1',
    lote: 'L-2026-03',
    etapa: 'Gestación',
    sexo: 'H',
    pesoKg: 145.0,
    fechaIngreso: '10/01/2026',
    estadoSalud: 'En tratamiento',
  },
];

export function BocetoListado({ onNavigate, onSelectAnimal, estadoUI }: BocetoListadoProps) {
  const [filtroGalpon, setFiltroGalpon] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState<string>('');

  const animalesFiltrados = ANIMALES_INICIALES.filter((animal) => {
    const coincideGalpon = filtroGalpon === 'todos' || animal.galpon.toLowerCase().includes(filtroGalpon.toLowerCase());
    const coincideBusqueda = animal.arete.includes(busqueda) || animal.lote.toLowerCase().includes(busqueda.toLowerCase());
    return coincideGalpon && coincideBusqueda;
  });

  const renderContenido = () => {
    if (estadoUI === 'cargando') {
      return (
        <div className="card loading-skeleton-container" aria-live="polite">
          <div className="skeleton skeleton-row"></div>
          <div className="skeleton skeleton-row"></div>
          <div className="skeleton skeleton-row"></div>
          <p className="text-center text-muted text-sm">Cargando registros desde D1...</p>
        </div>
      );
    }

    if (estadoUI === 'vacio' || animalesFiltrados.length === 0) {
      return (
        <div className="card empty-state-card">
          <div className="empty-icon-wrap">
            <IconPig size={32} className="text-muted" />
          </div>
          <h4 className="title-sm">Sin registros disponibles</h4>
          <p className="text-muted text-sm">
            No se encontraron animales ni grupos para los criterios seleccionados en este galpón.
          </p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setFiltroGalpon('todos');
              setBusqueda('');
            }}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Restablecer filtros</span>
            </span>
          </button>
        </div>
      );
    }

    return (
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Arete / Código</th>
              <th>Galpón / Ubicación</th>
              <th>Lote y Etapa</th>
              <th>Sexo</th>
              <th>Peso actual</th>
              <th>Estado sanitario</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {animalesFiltrados.map((animal) => (
              <tr key={animal.id}>
                <td>
                  <span className="arete-badge">{animal.arete}</span>
                </td>
                <td>
                  <div className="table-cell-stacked">
                    <strong>{animal.galpon}</strong>
                    <span className="text-xs text-muted">{animal.corral}</span>
                  </div>
                </td>
                <td>
                  <div className="table-cell-stacked">
                    <span>{animal.lote}</span>
                    <span className="text-xs text-muted">{animal.etapa}</span>
                  </div>
                </td>
                <td>
                  <span className={`tag-sexo tag-sexo-${animal.sexo.toLowerCase()}`}>
                    {animal.sexo === 'M' ? 'Macho' : animal.sexo === 'H' ? 'Hembra' : 'Pendiente'}
                  </span>
                </td>
                <td>
                  <span className="font-numeric">{animal.pesoKg.toFixed(1)} kg</span>
                </td>
                <td>
                  {animal.estadoSalud === 'Retiro vigente' ? (
                    <span className="inline-flex items-center justify-center gap-2 leading-none badge-status badge-danger">
                      <IconAlertTriangle size={14} />
                      <span>Retiro ({animal.diasRetiroRestantes} d)</span>
                    </span>
                  ) : animal.estadoSalud === 'En tratamiento' ? (
                    <span className="inline-flex items-center justify-center gap-2 leading-none badge-status badge-warning">
                      <span>Tratamiento</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2 leading-none badge-status badge-success">
                      <span>Sano</span>
                    </span>
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        onSelectAnimal(animal.id);
                        onNavigate('detalle');
                      }}
                      title="Ver ficha técnica"
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <span>Ficha</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => onNavigate('formulario')}
                      title="Corregir datos"
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconEdit size={14} />
                        <span>Corregir</span>
                      </span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="boceto-container">
      <header className="page-header">
        <div className="header-title-row">
          <h2 className="title-md">Inventario de piara y animales</h2>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onNavigate('formulario')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconPlus size={16} />
              <span>Alta de animal</span>
            </span>
          </button>
        </div>
      </header>

      <section className="filter-bar card">
        <div className="filter-group-row">
          <div className="search-input-wrap">
            <IconSearch size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por arete (ej: 002) o lote..."
              className="form-input search-input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="filter-select-wrap">
            <span className="inline-flex items-center justify-center gap-2 leading-none filter-label">
              <IconFilter size={16} />
              <span>Galpón:</span>
            </span>
            <select
              className="form-select"
              value={filtroGalpon}
              onChange={(e) => setFiltroGalpon(e.target.value)}
            >
              <option value="todos">Todos los galpones</option>
              <option value="Galpón A">Galpón A (78 cabezas)</option>
              <option value="Galpón B">Galpón B (64 cabezas)</option>
            </select>
          </div>
        </div>
      </section>

      {renderContenido()}
    </div>
  );
}
