import React from 'react';
import type { Perfil, Vista } from '../types';
import { PwaInstallButton } from './PwaInstallButton';
import {
  IconPig,
  IconBox,
  IconHeart,
  IconWheat,
  IconActivity,
  IconBell,
  IconCoins,
  IconBarChart,
  IconSettings,
  IconShield,
  IconArrowRight,
} from './icons';

interface MenuPrincipalProps {
  perfil: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
}

interface MenuOption {
  view: Vista;
  title: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  adminOnly?: boolean;
}

export function MenuPrincipal({ perfil, onNavigate }: MenuPrincipalProps) {
  const options: MenuOption[] = [
    {
      view: 'animales',
      title: 'Animales',
      description: 'Fichas, pesajes y padrón',
      icon: <IconPig size={24} />,
      colorClass: 'menu-tile-animales',
    },
    {
      view: 'inventario',
      title: 'Inventario',
      description: 'Stock y movimientos',
      icon: <IconBox size={24} />,
      colorClass: 'menu-tile-inventario',
    },
    {
      view: 'reproduccion',
      title: 'Reproducción',
      description: 'Ciclos, servicios y partos',
      icon: <IconHeart size={24} />,
      colorClass: 'menu-tile-reproduccion',
    },
    {
      view: 'alimentacion',
      title: 'Alimentación',
      description: 'Consumo y raciones',
      icon: <IconWheat size={24} />,
      colorClass: 'menu-tile-alimentacion',
    },
    {
      view: 'sanidad',
      title: 'Sanidad',
      description: 'Tratamientos y retiros',
      icon: <IconActivity size={24} />,
      colorClass: 'menu-tile-sanidad',
    },
    {
      view: 'alertas',
      title: 'Alertas',
      description: 'Pendientes y avisos',
      icon: <IconBell size={24} />,
      colorClass: 'menu-tile-alertas',
    },
    {
      view: 'finanzas',
      title: 'Finanzas',
      description: 'Ingresos, gastos y saldos',
      icon: <IconCoins size={24} />,
      colorClass: 'menu-tile-finanzas',
    },
    {
      view: 'reportes',
      title: 'Reportes',
      description: 'Indicadores y exportaciones',
      icon: <IconBarChart size={24} />,
      colorClass: 'menu-tile-reportes',
    },
  ];

  if (perfil === 'administrador') {
    options.push(
      {
        view: 'configuracion',
        title: 'Configuración',
        description: 'Parámetros de la granja',
        icon: <IconSettings size={24} />,
        colorClass: 'menu-tile-configuracion',
        adminOnly: true,
      },
      {
        view: 'administracion',
        title: 'Administración',
        description: 'Usuarios y galpones',
        icon: <IconShield size={24} />,
        colorClass: 'menu-tile-administracion',
        adminOnly: true,
      },
    );
  }

  return (
    <div className="menu-app-container">
      <header className="menu-app-header">
        <h1 className="menu-app-title">Tu granja</h1>
        <p className="menu-app-subtitle">Elige un módulo para trabajar.</p>
      </header>
      <div className="menu-app-grid">
        {options.map((opt) => (
          <button
            key={opt.view}
            type="button"
            className={`menu-app-tile ${opt.colorClass}`}
            onClick={() => onNavigate(opt.view)}
            aria-label={opt.title}
          >
            <span className="menu-tile-icon-box">
              {opt.icon}
            </span>
            <span className="menu-tile-body">
              <span className="menu-tile-title">{opt.title}</span>
              <span className="menu-tile-description">{opt.description}</span>
            </span>
            <IconArrowRight size={16} className="menu-tile-chevron" />
          </button>
        ))}
      </div>
      <PwaInstallButton card />
    </div>
  );
}
