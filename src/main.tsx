import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Perfil, Vista, EstadoUI } from './types';
import { Navbar } from './components/Navbar';
import { BocetoLogin } from './components/BocetoLogin';
import { BocetoDashboard } from './components/BocetoDashboard';
import { BocetoListado } from './components/BocetoListado';
import { BocetoFormulario } from './components/BocetoFormulario';
import { BocetoDetalle } from './components/BocetoDetalle';
import './style.css';

function getInitialView(): Vista {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/animales' || path === '/listado') return 'listado';
    if (path === '/alta' || path === '/formulario') return 'formulario';
    if (path === '/detalle' || path.startsWith('/animal/')) return 'detalle';
    if (path === '/login') return 'login';
    if (path === '/inicio' || path === '/') return 'inicio';
  }
  return 'inicio';
}

function App() {
  const [vistaActual, setVistaActual] = useState<Vista>(getInitialView);
  const [perfilActual, setPerfilActual] = useState<Perfil>('responsable');
  const [estadoUI, setEstadoUI] = useState<EstadoUI>('normal');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('002');
  const [estaAutenticado, setEstaAutenticado] = useState<boolean>(true);

  useEffect(() => {
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
      if (vista === 'listado') targetPath = '/animales';
      else if (vista === 'formulario') targetPath = '/alta';
      else if (vista === 'detalle') targetPath = `/animal/${selectedAnimalId}`;
      else if (vista === 'login') targetPath = '/login';
      else if (vista === 'inicio') targetPath = '/inicio';
      window.history.pushState(null, '', targetPath);
    }
  };

  const handleLogin = (perfil: Perfil) => {
    setPerfilActual(perfil);
    setEstaAutenticado(true);
    handleNavigate('inicio');
  };

  const handleLogout = () => {
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
        return (
          <BocetoDetalle
            animalId={selectedAnimalId}
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
