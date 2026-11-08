import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Perfil, Vista, EstadoUI } from './types';
import { Navbar } from './components/Navbar';
import { BocetoLogin } from './components/BocetoLogin';
import { BocetoDashboard } from './components/BocetoDashboard';
import { BocetoListado } from './components/BocetoListado';
import { BocetoFormulario } from './components/BocetoFormulario';
import { ModuloAdministracion } from './components/ModuloAdministracion';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';
import { ModuloInventario } from './components/ModuloInventario';
import { ModuloAnimales } from './components/ModuloAnimales';
import { ModuloReproduccion } from './components/ModuloReproduccion';
import { ModuloAlimentacion } from './components/ModuloAlimentacion';
import { ModuloSanidad } from './components/ModuloSanidad';
import './style.css';

function getInitialView(): Vista {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/listado') return 'listado';
    if (path === '/animales') return 'animales';
    if (path === '/reproduccion') return 'reproduccion';
    if (path === '/alta' || path === '/formulario') return 'formulario';
    if (path === '/detalle' || path.startsWith('/animal/')) return 'detalle';
    if (path === '/inventario') return 'inventario';
    if (path === '/alimentacion') return 'alimentacion';
    if (path === '/sanidad') return 'sanidad';
    if (path === '/configuracion' || path === '/config') return 'configuracion';
    if (path === '/administracion' || path === '/admin') return 'administracion';
    if (path === '/login') return 'login';
    if (path === '/inicio' || path === '/') return 'inicio';
  }
  return 'inicio';
}

function App() {
  const [vistaActual, setVistaActual] = useState<Vista>(getInitialView);
  const [perfilActual, setPerfilActual] = useState<Perfil>('responsable');
  const [estadoUI, setEstadoUI] = useState<EstadoUI>('normal');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(() => {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/^\/animal\/(.+)$/) : null;
    if (!match) return '002';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return '002';
    }
  });
  const [estaAutenticado, setEstaAutenticado] = useState<boolean>(true);
  const [usuarioActual, setUsuarioActual] = useState<string>('encargado@granja.pe');

  useEffect(() => {
    // Verificar si hay sesión activa en el servidor
    const verificarSesion = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json() as { ok: boolean; user: { role: Perfil; username: string } };
          setPerfilActual(data.user.role);
          setUsuarioActual(data.user.username);
          setEstaAutenticado(true);
        }
      } catch {
        // En entorno local desconectado se mantiene el estado interactivo
      }
    };
    verificarSesion();

    const handlePopState = () => {
      setVistaActual(getInitialView());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (vista: Vista) => {
    setVistaActual(vista);
    if (typeof window !== 'undefined' && window.history) {
      let targetPath = '/';
      if (vista === 'listado') targetPath = '/listado';
      else if (vista === 'animales') targetPath = '/animales';
      else if (vista === 'reproduccion') targetPath = '/reproduccion';
      else if (vista === 'formulario') targetPath = '/alta';
      else if (vista === 'detalle') targetPath = `/animal/${selectedAnimalId}`;
      else if (vista === 'inventario') targetPath = '/inventario';
      else if (vista === 'alimentacion') targetPath = '/alimentacion';
      else if (vista === 'sanidad') targetPath = '/sanidad';
      else if (vista === 'configuracion') targetPath = '/configuracion';
      else if (vista === 'administracion') targetPath = '/administracion';
      else if (vista === 'login') targetPath = '/login';
      else if (vista === 'inicio') targetPath = '/inicio';
      window.history.pushState(null, '', targetPath);
    }
  };

  const handleLogin = (perfil: Perfil, username?: string) => {
    setPerfilActual(perfil);
    if (username) setUsuarioActual(username);
    setEstaAutenticado(true);
    handleNavigate('inicio');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignorar fallo de red
    }
    setEstaAutenticado(false);
    handleNavigate('login');
  };

  const renderVista = () => {
    if (!estaAutenticado || vistaActual === 'login') {
      return (
        <BocetoLogin
          onLogin={handleLogin}
          isErrorMode={estadoUI === 'rechazo'}
        />
      );
    }

    switch (vistaActual) {
      case 'inicio':
        return (
          <BocetoDashboard
            perfil={perfilActual}
            onNavigate={handleNavigate}
            onSelectAnimal={(id) => setSelectedAnimalId(id)}
          />
        );
      case 'listado':
        return (
          <BocetoListado
            onNavigate={handleNavigate}
            onSelectAnimal={(id) => setSelectedAnimalId(id)}
            estadoUI={estadoUI}
          />
        );
      case 'formulario':
        return (
          <BocetoFormulario
            onNavigate={handleNavigate}
            estadoUI={estadoUI}
          />
        );
      case 'detalle':
        return <ModuloAnimales perfil={perfilActual} initialAnimalKey={selectedAnimalId} />;
      case 'inventario':
        return <ModuloInventario perfil={perfilActual} />;
      case 'alimentacion':
        return <ModuloAlimentacion perfil={perfilActual} />;
      case 'sanidad':
        return <ModuloSanidad perfil={perfilActual} />;
      case 'animales':
        return <ModuloAnimales perfil={perfilActual} />;
      case 'reproduccion':
        return <ModuloReproduccion perfil={perfilActual} />;
      case 'configuracion':
        return <ModuloConfiguracion />;
      case 'administracion':
        return (
          <ModuloAdministracion
            perfil={perfilActual}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      {estaAutenticado && vistaActual !== 'login' && (
        <Navbar
          vistaActual={vistaActual}
          perfilActual={perfilActual}
          estadoUI={estadoUI}
          usuario={usuarioActual}
          onNavigate={handleNavigate}
          onChangePerfil={(p) => setPerfilActual(p)}
          onChangeEstadoUI={(e) => setEstadoUI(e)}
          onLogout={handleLogout}
        />
      )}

      <main className="main-content">
        {renderVista()}
      </main>

      <footer className="main-footer">
        <div className="footer-content">
          <p className="footer-text">
            Web Porcícola · Sistema de gestión integral · T02 Boceto navegable interactivo
          </p>
          <p className="text-xs text-muted">
            Los datos mostrados corresponden a valores sintéticos de prueba según la especificación técnica.
          </p>
        </div>
      </footer>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
export { App };
