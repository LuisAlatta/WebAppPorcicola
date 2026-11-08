import React from 'react';
import { Perfil, Vista, EstadoUI } from '../types';
import {
  IconHome,
  IconList,
  IconPlus,
  IconPig,
  IconClipboard,
  IconShield,
  IconLogOut,
  IconWifiOff,
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconScale,
  IconSettings,
  IconCalendar,
} from './icons';

interface NavbarProps {
  vistaActual: Vista;
  perfilActual: Perfil;
  estadoUI: EstadoUI;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
  onChangePerfil: (perfil: Perfil) => void;
  onChangeEstadoUI: (estado: EstadoUI) => void;
  onLogout: () => void;
}

export function Navbar({
  vistaActual,
  perfilActual,
  estadoUI,
  usuario,
  onNavigate,
  onChangePerfil,
  onChangeEstadoUI,
  onLogout,
}: NavbarProps) {
  return (
    <header className="navbar-wrapper">
      <div className="navbar-top">
        <div className="navbar-brand">
          <div className="inline-flex items-center justify-center gap-2 leading-none brand-link">
            <IconPig size={22} className="brand-icon" />
            <span className="brand-text">Web Porcícola</span>
          </div>
          <span className="badge-env">T04 · Sesión activa</span>
          {usuario && <span className="text-xs text-muted user-badge-navbar">({usuario})</span>}
        </div>

        <div className="navbar-controls">
          <div className="control-item">
            <label htmlFor="select-perfil" className="text-xs text-muted">Perfil:</label>
            <select
              id="select-perfil"
              className="form-select form-select-sm"
              value={perfilActual}
              onChange={(e) => onChangePerfil(e.target.value as Perfil)}
            >
              <option value="administrador">Administrador</option>
              <option value="responsable">Responsable</option>
              <option value="operario">Operario</option>
              <option value="veterinario">Veterinario</option>
            </select>
          </div>

          <div className="control-item">
            <label htmlFor="select-estado" className="text-xs text-muted">Simular estado:</label>
            <select
              id="select-estado"
              className="form-select form-select-sm"
              value={estadoUI}
              onChange={(e) => onChangeEstadoUI(e.target.value as EstadoUI)}
            >
              <option value="normal">Normal</option>
              <option value="cargando">Cargando datos</option>
              <option value="vacio">Sin datos</option>
              <option value="rechazo">Rechazo / Denegado</option>
              <option value="sin_conexion">Sin conexión (Offline)</option>
              <option value="pendiente_local">Pendiente local</option>
              <option value="confirmado">Confirmado</option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onLogout}
            title="Cerrar sesión"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconLogOut size={16} />
              <span>Salir</span>
            </span>
          </button>
        </div>
      </div>

      <nav className="navbar-nav">
        <button
          type="button"
          className={`nav-tab ${vistaActual === 'inicio' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('inicio')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconHome size={16} />
            <span>Inicio</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'listado' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('listado')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconList size={16} />
            <span>Listado</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'animales' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('animales')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClipboard size={16} />
            <span>Animales</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'reproduccion' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('reproduccion')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCalendar size={16} />
            <span>Reproducción</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'formulario' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('formulario')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={16} />
            <span>Alta / Corrección</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'detalle' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('detalle')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPig size={16} />
            <span>Detalle 002</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'inventario' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('inventario')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconScale size={16} />
            <span>Inventario</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'alimentacion' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('alimentacion')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClipboard size={16} />
            <span>Alimentación</span>
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${vistaActual === 'sanidad' ? 'nav-tab-active' : ''}`}
          onClick={() => onNavigate('sanidad')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconPlus size={16} />
            <span>Sanidad</span>
          </span>
        </button>

        {perfilActual === 'administrador' && (
          <button
            type="button"
            className={`nav-tab ${vistaActual === 'configuracion' ? 'nav-tab-active' : ''}`}
            onClick={() => onNavigate('configuracion')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconSettings size={16} />
              <span>Configuración</span>
            </span>
          </button>
        )}

        {perfilActual === 'administrador' && (
          <button
            type="button"
            className={`nav-tab ${vistaActual === 'administracion' ? 'nav-tab-active' : ''}`}
            onClick={() => onNavigate('administracion')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconShield size={16} />
              <span>Administración</span>
            </span>
          </button>
        )}
      </nav>

      {estadoUI === 'sin_conexion' && (
        <div className="status-strip strip-offline" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconWifiOff size={16} />
            <span>Modo sin conexión: Las operaciones se guardan en borrador local hasta restablecer red.</span>
          </span>
        </div>
      )}

      {estadoUI === 'pendiente_local' && (
        <div className="status-strip strip-pending" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconClock size={16} />
            <span>Hay 1 registro pendiente de sincronización local.</span>
          </span>
        </div>
      )}

      {estadoUI === 'confirmado' && (
        <div className="status-strip strip-success" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={16} />
            <span>Todas las operaciones sincronizadas y confirmadas con D1.</span>
          </span>
        </div>
      )}

      {estadoUI === 'rechazo' && (
        <div className="status-strip strip-error" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertTriangle size={16} />
            <span>Permiso insuficiente o precondición fallida para esta operación.</span>
          </span>
        </div>
      )}
    </header>
  );
}
