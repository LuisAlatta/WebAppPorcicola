import React, { useState } from 'react';
import { EstadoUI, Vista } from '../types';
import {
  IconArrowLeft,
  IconCheck,
  IconAlertCircle,
  IconScale,
  IconCoins,
  IconCalendar,
  IconClock,
} from './icons';

interface BocetoFormularioProps {
  onNavigate: (vista: Vista) => void;
  estadoUI: EstadoUI;
}

export function BocetoFormulario({ onNavigate, estadoUI }: BocetoFormularioProps) {
  const [esCorreccion, setEsCorreccion] = useState<boolean>(false);
  const [arete, setArete] = useState<string>('002');
  const [galpon, setGalpon] = useState<string>('Galpón A');
  const [corral, setCorral] = useState<string>('Corral A1');
  const [lote, setLote] = useState<string>('L-2026-01');
  const [etapa, setEtapa] = useState<string>('Crecimiento');
  const [sexo, setSexo] = useState<string>('H');
  const [pesoKg, setPesoKg] = useState<string>('44.0');
  const [valorSoles, setValorSoles] = useState<string>('350.00');
  const [fechaOperativa, setFechaOperativa] = useState<string>('2026-11-07');
  const [motivoCorreccion, setMotivoCorreccion] = useState<string>('Ajuste de pesaje según balanza de corral');

  const [guardadoExitoso, setGuardadoExitoso] = useState<boolean>(false);
  const [esBorradorLocal, setEsBorradorLocal] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (estadoUI === 'sin_conexion') {
      setEsBorradorLocal(true);
      setGuardadoExitoso(true);
    } else {
      setEsBorradorLocal(false);
      setGuardadoExitoso(true);
    }
  };

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
              <span>Volver al listado</span>
            </span>
          </button>
          <div className="badge-boceto">Formulario navegable</div>
        </div>
        <h2 className="title-md">
          {esCorreccion ? 'Corrección de registro con auditoría' : 'Alta de animal en inventario'}
        </h2>
      </header>

      {guardadoExitoso && (
        <div className={`alert ${esBorradorLocal ? 'alert-warning' : 'alert-success'}`} role="status">
          <div className="inline-flex items-center justify-center gap-2 leading-none">
            {esBorradorLocal ? <IconClock size={18} /> : <IconCheck size={18} />}
            <span>
              {esBorradorLocal
                ? 'Guardado como borrador pendiente localmente (sin conexión a servidor).'
                : 'Operación confirmada y registrada con clave única de evento.'}
            </span>
          </div>
        </div>
      )}

      {estadoUI === 'rechazo' && (
        <div className="alert alert-error" role="alert">
          <div className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={18} />
            <span>
              Error de precondición: El arete 002 ya existe en el Galpón A.
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="mode-toggle-group">
          <button
            type="button"
            className={`btn btn-toggle ${!esCorreccion ? 'btn-toggle-active' : ''}`}
            onClick={() => setEsCorreccion(false)}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <span>Alta nueva</span>
            </span>
          </button>
          <button
            type="button"
            className={`btn btn-toggle ${esCorreccion ? 'btn-toggle-active' : ''}`}
            onClick={() => setEsCorreccion(true)}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <span>Corrección con historial</span>
            </span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label htmlFor="form-arete" className="form-label">Arete / Código de identificación</label>
            <input
              id="form-arete"
              type="text"
              className="form-input"
              value={arete}
              onChange={(e) => setArete(e.target.value)}
              placeholder="Ej: 002 (conserva ceros a la izquierda)"
              required
            />
            <span className="form-helper">Se conserva formato textual y único.</span>
          </div>

          <div className="form-group">
            <label htmlFor="form-galpon" className="form-label">Galpón de destino</label>
            <select
              id="form-galpon"
              className="form-select"
              value={galpon}
              onChange={(e) => setGalpon(e.target.value)}
            >
              <option value="Galpón A">Galpón A</option>
              <option value="Galpón B">Galpón B</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-corral" className="form-label">Corral físico</label>
            <input
              id="form-corral"
              type="text"
              className="form-input"
              value={corral}
              onChange={(e) => setCorral(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-lote" className="form-label">Lote operativo</label>
            <input
              id="form-lote"
              type="text"
              className="form-input"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-etapa" className="form-label">Etapa de producción</label>
            <select
              id="form-etapa"
              className="form-select"
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
            >
              <option value="Lechón">Lechón</option>
              <option value="Crecimiento">Crecimiento</option>
              <option value="Engorde">Engorde</option>
              <option value="Gestación">Gestación</option>
              <option value="Maternidad">Maternidad</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-sexo" className="form-label">Sexo</label>
            <select
              id="form-sexo"
              className="form-select"
              value={sexo}
              onChange={(e) => setSexo(e.target.value)}
            >
              <option value="H">Hembra</option>
              <option value="M">Macho</option>
              <option value="Pendiente">Pendiente de sexado</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="form-peso" className="form-label">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconScale size={16} />
                <span>Peso registrado (kg)</span>
              </span>
            </label>
            <input
              id="form-peso"
              type="number"
              step="0.1"
              min="0.1"
              className="form-input font-numeric"
              value={pesoKg}
              onChange={(e) => setPesoKg(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-valor" className="form-label">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconCoins size={16} />
                <span>Valor estimado o costo (S/)</span>
              </span>
            </label>
            <input
              id="form-valor"
              type="number"
              step="0.01"
              min="0"
              className="form-input font-numeric"
              value={valorSoles}
              onChange={(e) => setValorSoles(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="form-fecha" className="form-label">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconCalendar size={16} />
                <span>Fecha efectiva local</span>
              </span>
            </label>
            <input
              id="form-fecha"
              type="date"
              className="form-input"
              value={fechaOperativa}
              onChange={(e) => setFechaOperativa(e.target.value)}
              required
            />
          </div>

          {esCorreccion && (
            <div className="form-group form-col-span-full">
              <label htmlFor="form-motivo" className="form-label">Motivo de la corrección (Auditoría obligatoria)</label>
              <textarea
                id="form-motivo"
                className="form-input form-textarea"
                rows={3}
                value={motivoCorreccion}
                onChange={(e) => setMotivoCorreccion(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-actions form-col-span-full">
            <button type="submit" className="btn btn-primary">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconCheck size={16} />
                <span>{esCorreccion ? 'Confirmar corrección' : 'Registrar animal en D1'}</span>
              </span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onNavigate('listado')}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <span>Cancelar</span>
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
