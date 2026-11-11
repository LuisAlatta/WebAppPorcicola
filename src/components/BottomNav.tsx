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
  hasSelection?: boolean;
}

interface BottomNavItem {
  id: string;
  view: Vista;
  label: string;
  icon: React.ReactNode;
  isActive: (current: Vista) => boolean;
}

export function BottomNav({ vistaActual, onNavigate, hasSelection = true }: BottomNavProps) {
  const navItems: BottomNavItem[] = [
    {
      id: 'menu',
      view: 'inicio',
      label: 'Menú',
      icon: <IconGrid size={22} />,
      isActive: (current) => current === 'inicio',
    },
    {
      id: 'animales',
      view: 'animales',
      label: 'Animales',
      icon: <IconPig size={22} />,
      isActive: (current) => ['animales', 'formulario', 'detalle', 'listado'].includes(current),
    },
    {
      id: 'reproduccion',
      view: 'reproduccion',
      label: 'Reproducción',
      icon: <IconHeart size={22} />,
      isActive: (current) => current === 'reproduccion',
    },
    {
      id: 'inventario',
      view: 'inventario',
      label: 'Inventario',
      icon: <IconBox size={22} />,
      isActive: (current) => current === 'inventario',
    },
    {
      id: 'finanzas',
      view: 'finanzas',
      label: 'Finanzas',
      icon: <IconCoins size={22} />,
      isActive: (current) => current === 'finanzas',
    },
    {
      id: 'alertas',
      view: 'alertas',
      label: 'Alertas',
      icon: <IconBell size={22} />,
      isActive: (current) => current === 'alertas',
    },
  ];

  return (
    <nav className="bottom-nav-container" aria-label="Navegación principal">
      <div className="bottom-nav-wrapper">
        {(hasSelection ? navItems : [{ id: 'galpones', view: 'galpones' as Vista, label: 'Galpones', icon: <IconBox size={22} />, isActive: (current: Vista) => current === 'galpones' }]).map((item) => {
          const active = item.isActive(vistaActual);
          return (
            <button
              key={item.id}
              type="button"
              className={`bottom-nav-button ${active ? 'bottom-nav-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
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
    </nav>
  );
}
