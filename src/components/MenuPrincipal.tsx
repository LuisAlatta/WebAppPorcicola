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
  IconArrowRight,
  IconBuilding,
} from './icons';

interface MenuPrincipalProps {
  perfil: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
}

interface MenuItem {
  view: Vista;
  title: string;
  subtitle: string;
  tag: string;
  icon: React.ReactNode;
  accentClass: string;
  adminOnly?: boolean;
}

const roleNames: Record<Perfil, string> = {
  administrador: 'Administrador General',
  responsable: 'Responsable de Granja',
  operario: 'Operario de Galpón',
  veterinario: 'Médico Veterinario',
};

export function MenuPrincipal({ perfil, usuario, onNavigate }: MenuPrincipalProps) {
  const sections: { title: string; description: string; items: MenuItem[] }[] = [
    {
      title: 'Animales y Producción',
      description: 'Gestión central de piara, padrón individual, camadas e inventario físico.',
      items: [
        {
          view: 'animales',
          title: 'Padrón de Animales',
          subtitle: 'Fichas individuales, aretes históricos, genealogía, pesajes y cronología.',
          tag: 'Individual',
          icon: <IconPig size={24} />,
          accentClass: 'menu-accent-animals',
        },
        {
          view: 'inventario',
          title: 'Inventario y Existencias',
          subtitle: 'Existencias por fecha de corte, etapas, entradas, salidas, muertes y traslados.',
          tag: 'Grupal / Censo',
          icon: <IconBox size={24} />,
          accentClass: 'menu-accent-inventory',
        },
        {
          view: 'reproduccion',
          title: 'Reproducción y Camadas',
          subtitle: 'Servicios de inseminación/monta, palpaciones, partos atómicos y destetes.',
          tag: 'Ciclo Reproductivo',
          icon: <IconHeart size={24} />,
          accentClass: 'menu-accent-repro',
        },
      ],
    },
    {
      title: 'Alimentación y Sanidad',
      description: 'Control de raciones, planes sanitarios, aplicación de fármacos y retiros.',
      items: [
        {
          view: 'alimentacion',
          title: 'Alimentación y Silos',
          subtitle: 'Almacenes de insumos, consumos programados, raciones y días de cobertura.',
          tag: 'Nutrición',
          icon: <IconWheat size={24} />,
          accentClass: 'menu-accent-feed',
        },
        {
          view: 'sanidad',
          title: 'Sanidad y Tratamientos',
          subtitle: 'Historial clínico, prescripciones, periodos de retiro y calendario de vacunas.',
          tag: 'Salud Animal',
          icon: <IconActivity size={24} />,
          accentClass: 'menu-accent-health',
        },
        {
          view: 'alertas',
          title: 'Centro de Alertas',
          subtitle: 'Retiros sanitarios vigentes, raciones bajas, partos inminentes y tareas de hoy.',
          tag: 'Operativo',
          icon: <IconBell size={24} />,
          accentClass: 'menu-accent-alerts',
        },
      ],
    },
    {
      title: 'Economía y Reportes',
      description: 'Registro de caja, compras, ventas, análisis de productividad y exportaciones.',
      items: [
        {
          view: 'finanzas',
          title: 'Finanzas y Caja',
          subtitle: 'Libro de ingresos y egresos, compras asociadas, ventas y flujo de caja en Soles/Dólares.',
          tag: 'Económico',
          icon: <IconCoins size={24} />,
          accentClass: 'menu-accent-finance',
        },
        {
          view: 'reportes',
          title: 'Reportes y Métricas',
          subtitle: 'Consultas autorizadas de partos, ganancias de peso y exportación PDF / Excel.',
          tag: 'Informes',
          icon: <IconBarChart size={24} />,
          accentClass: 'menu-accent-reports',
        },
      ],
    },
  ];

  if (perfil === 'administrador') {
    sections.push({
      title: 'Configuración y Administración',
      description: 'Gestión de accesos, infraestructura de galpones y parámetros maestros.',
      items: [
        {
          view: 'configuracion',
          title: 'Configuración de Granja',
          subtitle: 'Catálogos de insumos, galpones, ubicaciones, lotes y etapas productivas.',
          tag: 'Exclusivo Admin',
          icon: <IconSettings size={24} />,
          accentClass: 'menu-accent-config',
          adminOnly: true,
        },
        {
          view: 'administracion',
          title: 'Administración de Usuarios',
          subtitle: 'Cuentas del personal, asignación de galpones a equipos y registro de auditoría.',
          tag: 'Exclusivo Admin',
          icon: <IconShield size={24} />,
          accentClass: 'menu-accent-admin',
          adminOnly: true,
        },
      ],
    });
  }

  return (
    <div className="menu-hub-container">
      {/* Banner de Bienvenida y Estado */}
      <header className="card menu-welcome-card mb-4">
        <div className="menu-welcome-header">
          <div className="menu-welcome-text">
            <span className="badge-env mb-1">{roleNames[perfil]}</span>
            <h1 className="title-lg">Menú Principal</h1>
            <p className="subtitle">
              Selecciona el módulo para comenzar a trabajar. Los datos se actualizan según tus galpones asignados.
            </p>
          </div>
          <div className="menu-user-chip">
            <div className="inline-flex items-center justify-center gap-2 leading-none user-chip-content">
              <IconBuilding size={18} className="text-primary" />
              <div className="text-left">
                <div className="font-bold text-xs">{usuario || 'Sesión activa'}</div>
                <div className="text-xs text-muted">Galpón A y Galpón B</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Secciones de Módulos */}
      <div className="menu-sections-wrapper">
        {sections.map((section) => (
          <section key={section.title} className="menu-section mb-6">
            <div className="section-header-clean mb-3">
              <div>
                <h2 className="section-title text-base font-bold">{section.title}</h2>
                <p className="text-xs text-muted">{section.description}</p>
              </div>
              <span className="text-xs text-muted font-mono">{section.items.length} módulos</span>
            </div>

            <div className="menu-grid">
              {section.items.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  className={`menu-card ${item.accentClass}`}
                  onClick={() => onNavigate(item.view)}
                >
                  <div className="menu-card-top">
                    <div className="menu-icon-box">
                      {item.icon}
                    </div>
                    <span className="menu-item-tag">{item.tag}</span>
                  </div>

                  <div className="menu-card-body">
                    <h3 className="menu-card-title">{item.title}</h3>
                    <p className="menu-card-desc">{item.subtitle}</p>
                  </div>

                  <div className="menu-card-action">
                    <span className="inline-flex items-center justify-center gap-2 leading-none menu-action-link">
                      <span>Entrar al módulo</span>
                      <IconArrowRight size={16} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
