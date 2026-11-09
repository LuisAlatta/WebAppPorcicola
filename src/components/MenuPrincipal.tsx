import React from 'react';
import type { Perfil, Vista } from '../types';
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
} from './icons';

interface MenuPrincipalProps {
  perfil: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
}

interface MenuOption {
  view: Vista;
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  adminOnly?: boolean;
}

export function MenuPrincipal({ perfil, onNavigate }: MenuPrincipalProps) {
  const options: MenuOption[] = [
    {
      view: 'animales',
      title: 'Animales',
      icon: <IconPig size={30} />,
      colorClass: 'menu-tile-animales',
    },
    {
      view: 'inventario',
      title: 'Inventario',
      icon: <IconBox size={30} />,
      colorClass: 'menu-tile-inventario',
    },
    {
      view: 'reproduccion',
      title: 'Reproducción',
      icon: <IconHeart size={30} />,
      colorClass: 'menu-tile-reproduccion',
    },
    {
      view: 'alimentacion',
      title: 'Alimentación',
      icon: <IconWheat size={30} />,
      colorClass: 'menu-tile-alimentacion',
    },
    {
      view: 'sanidad',
      title: 'Sanidad',
      icon: <IconActivity size={30} />,
      colorClass: 'menu-tile-sanidad',
    },
    {
      view: 'alertas',
      title: 'Alertas',
      icon: <IconBell size={30} />,
      colorClass: 'menu-tile-alertas',
    },
    {
      view: 'finanzas',
      title: 'Finanzas',
      icon: <IconCoins size={30} />,
      colorClass: 'menu-tile-finanzas',
    },
    {
      view: 'reportes',
      title: 'Reportes',
      icon: <IconBarChart size={30} />,
      colorClass: 'menu-tile-reportes',
    },
  ];

  if (perfil === 'administrador') {
    options.push(
      {
        view: 'configuracion',
        title: 'Configuración',
        icon: <IconSettings size={30} />,
        colorClass: 'menu-tile-configuracion',
        adminOnly: true,
      },
      {
        view: 'administracion',
        title: 'Administración',
        icon: <IconShield size={30} />,
        colorClass: 'menu-tile-administracion',
        adminOnly: true,
      },
    );
  }

  return (
    <div className="menu-app-container">
      <header className="menu-app-header">
        <p className="menu-app-subtitle">Selecciona una opción para comenzar</p>
      </header>

      <div className="menu-app-grid">
        {options.map((opt) => (
          <button
            key={opt.view}
            type="button"
            className={`menu-app-tile ${opt.colorClass}`}
            onClick={() => onNavigate(opt.view)}
          >
            <div className="menu-tile-icon-box">
              {opt.icon}
            </div>
            <span className="menu-tile-title">{opt.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
