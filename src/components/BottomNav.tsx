import React from 'react';
import type { Perfil, Vista } from '../types';
import {
  IconGrid,
  IconPig,
  IconHeart,
  IconBox,
  IconCoins,
  IconBell,
} from './icons';

interface BottomNavProps {
  vistaActual: Vista;
  perfilActual: Perfil;
  onNavigate: (vista: Vista) => void;
}

interface BottomNavItem {
  id: string;
  view: Vista;
  label: string;
  icon: React.ReactNode;
  isActive: (current: Vista) => boolean;
}

export function BottomNav({ vistaActual, onNavigate }: BottomNavProps) {
  const navItems: BottomNavItem[] = [
    {
      id: 'menu',
      view: 'inicio',
      label: 'Menú',
      icon: <IconGrid size={20} />,
      isActive: (current) => current === 'inicio',
    },
    {
      id: 'animales',
      view: 'animales',
      label: 'Animales',
      icon: <IconPig size={20} />,
      isActive: (current) => ['animales', 'formulario', 'detalle', 'listado'].includes(current),
    },
    {
      id: 'reproduccion',
      view: 'reproduccion',
      label: 'Reproducción',
      icon: <IconHeart size={20} />,
      isActive: (current) => current === 'reproduccion',
    },
    {
      id: 'inventario',
      view: 'inventario',
      label: 'Inventario',
      icon: <IconBox size={20} />,
      isActive: (current) => current === 'inventario',
    },
    {
      id: 'finanzas',
      view: 'finanzas',
      label: 'Finanzas',
      icon: <IconCoins size={20} />,
      isActive: (current) => current === 'finanzas',
    },
    {
      id: 'alertas',
      view: 'alertas',
      label: 'Alertas',
      icon: <IconBell size={20} />,
      isActive: (current) => current === 'alertas',
    },
  ];

  return (
    <div className="bottom-nav-container" role="toolbar" aria-label="Navegación rápida inferior">
      <div className="bottom-nav-wrapper">
        {navItems.map((item) => {
          const active = item.isActive(vistaActual);
          return (
            <button
              key={item.id}
              type="button"
              className={`bottom-nav-button ${active ? 'bottom-nav-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <div className="bottom-nav-icon-wrap">
                {item.icon}
              </div>
              <span className="bottom-nav-text">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
