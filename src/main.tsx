import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return (
    <main>
      <section className="card">
        <p className="label">Gestión porcina</p>
        <h1>Estamos preparando tu granja</h1>
        <p>El sistema de gestión se encuentra en desarrollo.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
