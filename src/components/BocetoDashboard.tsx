import React from 'react';
import { Perfil, Vista } from '../types';
import {
  IconShield,
  IconUser,
  IconStethoscope,
  IconClipboard,
  IconPig,
  IconAlertTriangle,
  IconPlus,
  IconList,
  IconCalendar,
} from './icons';

interface BocetoDashboardProps {
  perfil: Perfil;
  onNavigate: (vista: Vista) => void;
  onSelectAnimal: (id: string) => void;
}

export function BocetoDashboard({ perfil, onNavigate, onSelectAnimal }: BocetoDashboardProps) {
  const renderContenidoPorPerfil = () => {
    switch (perfil) {
      case 'administrador':
        return (
          <div className="dashboard-grid">
            <div className="kpi-card">
              <span className="kpi-label">Usuarios activos</span>
              <span className="kpi-value">5</span>
              <span className="kpi-detail">4 roles operativos</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Galpones en servicio</span>
              <span className="kpi-value">2</span>
              <span className="kpi-detail">Galpón A y Galpón B</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Base de datos D1</span>
              <span className="kpi-value text-success">Aislada</span>
              <span className="kpi-detail">Staging vs Producción</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Auditoría de eventos</span>
              <span className="kpi-value">Activa</span>
              <span className="kpi-detail">Reintentos con clave única</span>
            </div>
          </div>
        );

      case 'responsable':
        return (
          <>
            <div className="dashboard-grid">
              <div className="kpi-card">
                <span className="kpi-label">Total animales</span>
                <span className="kpi-value">142</span>
                <span className="kpi-detail">78 en Galpón A · 64 en Galpón B</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Caja operativa</span>
                <span className="kpi-value">S/ 14,850.00</span>
                <span className="kpi-detail">Saldo disponible</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Ventas del mes</span>
                <span className="kpi-value">S/ 32,400.00</span>
                <span className="kpi-detail">18 cabezas entregadas</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Alertas activas</span>
                <span className="kpi-value text-warning">2</span>
                <span className="kpi-detail">1 retiro sanitario · 1 ración baja</span>
              </div>
            </div>

            <div className="card highlight-card">
              <div className="card-header-clean">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertTriangle size={18} className="text-warning" />
                  <strong>Atención prioritaria de la piara</strong>
                </span>
              </div>
              <p className="card-text">
                El animal con arete <strong>002</strong> tiene restricción de retiro clínico vigente hasta el 14 de noviembre de 2026.
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    onSelectAnimal('002');
                    onNavigate('detalle');
                  }}
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <span>Ver ficha del animal 002</span>
                  </span>
                </button>
              </div>
            </div>
          </>
        );

      case 'operario':
        return (
          <div className="dashboard-grid">
            <div className="kpi-card">
              <span className="kpi-label">Galpón asignado</span>
              <span className="kpi-value">Galpón A</span>
              <span className="kpi-detail">Turno mañana</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Tareas del turno</span>
              <span className="kpi-value">4</span>
              <span className="kpi-detail">2 pesajes · 2 limpiezas</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Ración programada</span>
              <span className="kpi-value">450.0 kg</span>
              <span className="kpi-detail">Etapa crecimiento</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Pesajes del día</span>
              <span className="kpi-value">12 / 14</span>
              <span className="kpi-detail">Faltan 2 en Corral A2</span>
            </div>
          </div>
        );

      case 'veterinario':
        return (
          <>
            <div className="dashboard-grid">
              <div className="kpi-card">
                <span className="kpi-label">En tratamiento</span>
                <span className="kpi-value">4</span>
                <span className="kpi-detail">Antibióticos y vitaminas</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Periodos de retiro</span>
                <span className="kpi-value text-danger">2</span>
                <span className="kpi-detail">Prohibida salida a faena</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Vacunas programadas</span>
                <span className="kpi-value">5</span>
                <span className="kpi-detail">Próximos 7 días</span>
              </div>
              <div className="kpi-card">
                <span className="kpi-label">Revisiones clínicas</span>
                <span className="kpi-value">3</span>
                <span className="kpi-detail">Cerdas en gestación</span>
              </div>
            </div>

            <div className="card highlight-card">
              <div className="card-header-clean">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconStethoscope size={18} className="text-primary" />
                  <strong>Protocolo sanitario en curso</strong>
                </span>
              </div>
              <p className="card-text">
                Tratamiento con enrofloxacina aplicado en Corral A1. Fecha límite de retiro: <strong>14/11/2026</strong>.
              </p>
            </div>
          </>
        );
    }
  };

  const getPerfilNombre = () => {
    switch (perfil) {
      case 'administrador': return 'Administrador general';
      case 'responsable': return 'Usuario responsable (Encargado)';
      case 'operario': return 'Operario de granja';
      case 'veterinario': return 'Médico veterinario';
    }
  };

  const getPerfilIcon = () => {
    switch (perfil) {
      case 'administrador': return <IconShield size={20} />;
      case 'responsable': return <IconUser size={20} />;
      case 'operario': return <IconClipboard size={20} />;
      case 'veterinario': return <IconStethoscope size={20} />;
    }
  };

  return (
    <div className="boceto-container">
      <header className="page-header">
        <div className="header-title-row">
          <div className="inline-flex items-center justify-center gap-2 leading-none profile-tag">
            {getPerfilIcon()}
            <span>{getPerfilNombre()}</span>
          </div>
          <span className="text-muted text-sm">Fecha operativa: 07/11/2026</span>
        </div>
        <h2 className="title-md">Panel de control de granja</h2>
      </header>

      {renderContenidoPorPerfil()}

      <section className="section-block">
        <h3 className="section-title">Accesos rápidos del módulo</h3>
        <div className="button-group-grid">
          <button
            type="button"
            className="btn btn-card"
            onClick={() => onNavigate('listado')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconList size={18} />
              <span>Listado de animales y grupos</span>
            </span>
          </button>

          <button
            type="button"
            className="btn btn-card"
            onClick={() => onNavigate('formulario')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconPlus size={18} />
              <span>Alta o corrección de registro</span>
            </span>
          </button>

          <button
            type="button"
            className="btn btn-card"
            onClick={() => {
              onSelectAnimal('002');
              onNavigate('detalle');
            }}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconPig size={18} />
              <span>Ficha de ejemplo (Arete 002)</span>
            </span>
          </button>
        </div>
      </section>

      <div className="card note-box">
        <div className="inline-flex items-center justify-center gap-2 leading-none">
          <IconCalendar size={16} />
          <span>Formato estándar: Fechas locales (DD/MM/AAAA) · Moneda nacional (S/) · Peso (kg)</span>
        </div>
      </div>
    </div>
  );
}
