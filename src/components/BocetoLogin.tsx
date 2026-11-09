import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Perfil } from '../types';
import {
  IconPig,
  IconUser,
  IconLock,
  IconEye,
  IconEyeOff,
  IconAlertCircle,
  IconShield,
  IconLogIn,
  IconRefreshCw,
  IconStethoscope,
} from './icons';

export interface DemoAccount {
  role: Perfil;
  label: string;
  username: string;
  password: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'administrador',
    label: 'Administrador',
    username: 'admin@granja.pe',
    password: 'Password123!',
  },
  {
    role: 'responsable',
    label: 'Responsable',
    username: 'responsable@granja.pe',
    password: 'Password123!',
  },
  {
    role: 'operario',
    label: 'Operario',
    username: 'operario@granja.pe',
    password: 'Password123!',
  },
  {
    role: 'veterinario',
    label: 'Veterinario',
    username: 'veterinario@granja.pe',
    password: 'Password123!',
  },
];

export const REMEMBERED_USERNAME_KEY = 'porcicola_remembered_username';
const LEGACY_REMEMBER_CREDENTIALS_KEY = 'porcicola_saved_credentials';

export function migrateRememberedUsername() {
  try {
    const current = localStorage.getItem(REMEMBERED_USERNAME_KEY);
    const legacy = localStorage.getItem(LEGACY_REMEMBER_CREDENTIALS_KEY);
    let username = '';
    if (current) {
      const parsed = JSON.parse(current) as { username?: unknown };
      if (typeof parsed?.username === 'string') username = parsed.username;
    }
    if (legacy) {
      const parsed = JSON.parse(legacy) as { username?: unknown };
      if (!username && typeof parsed?.username === 'string') username = parsed.username;
    }
    localStorage.removeItem(LEGACY_REMEMBER_CREDENTIALS_KEY);
    if (username) {
      localStorage.setItem(REMEMBERED_USERNAME_KEY, JSON.stringify({ username }));
      return { username, hasSaved: true };
    }
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
    // Entorno restringido o sin acceso a almacenamiento local
  }
  try {
    // El formato anterior guardaba la contraseña sin cifrar; nunca se conserva.
    localStorage.removeItem(LEGACY_REMEMBER_CREDENTIALS_KEY);
  } catch {
    // Ignorar
  }
  return { username: '', hasSaved: false };
}

async function storeBrowserCredential(form: HTMLFormElement) {
  const PasswordCredentialConstructor = (
    window as Window & { PasswordCredential?: new (form: HTMLFormElement) => Credential }
  ).PasswordCredential;
  if (!window.isSecureContext || !PasswordCredentialConstructor || !navigator.credentials?.store) return;

  try {
    await navigator.credentials.store(new PasswordCredentialConstructor(form));
  } catch {
    // El gestor de contraseñas del navegador es opcional; nunca impide iniciar sesión.
  }
}

interface LoginProps {
  onLogin: (perfil: Perfil, username?: string) => void;
}

export function BocetoLogin({ onLogin }: LoginProps) {
  const [remembered] = useState(migrateRememberedUsername);
  const [username, setUsername] = useState(remembered.username);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(remembered.hasSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<Perfil | null>(() => {
    const found = DEMO_ACCOUNTS.find(
      (a) => a.username.toLowerCase() === remembered.username.toLowerCase(),
    );
    return found ? found.role : null;
  });
  const userStartedEditing = useRef(false);

  const fillDemoAccount = (acc: DemoAccount) => {
    userStartedEditing.current = true;
    setUsername(acc.username);
    setPassword(acc.password);
    setSelectedRole(acc.role);
    setError('');
  };

  useEffect(() => {
    if (!remembered.hasSaved) return;
    const getCredential = navigator.credentials?.get as unknown as
      | ((options: { password: true; mediation: 'optional' }) => Promise<Credential | null>)
      | undefined;
    if (!window.isSecureContext || !getCredential) return;

    let cancelled = false;
    void getCredential({ password: true, mediation: 'optional' })
      .then((credential) => {
        const saved = credential as (Credential & { id?: unknown; password?: unknown }) | null;
        if (
          cancelled || userStartedEditing.current || saved?.type !== 'password' ||
          typeof saved.id !== 'string' || typeof saved.password !== 'string'
        ) return;
        setUsername(saved.id);
        setPassword(saved.password);
        setRemember(true);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [remembered.hasSaved]);

  const removeRememberedUsername = () => {
    userStartedEditing.current = true;
    try {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      localStorage.removeItem(LEGACY_REMEMBER_CREDENTIALS_KEY);
    } catch {
      // Ignorar
    }
    void navigator.credentials?.preventSilentAccess?.().catch(() => undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as {
        user?: { role: Perfil; username: string };
        error?: string;
      };
      if (!response.ok || !data.user) {
        throw new Error(
          data.error || 'No se pudo iniciar sesión. Comprueba tus credenciales.',
        );
      }

      if (remember) {
        try {
          localStorage.setItem(
            REMEMBERED_USERNAME_KEY,
            JSON.stringify({ username }),
          );
        } catch {
          // Ignorar problemas de cuota
        }
        void storeBrowserCredential(form);
      } else {
        try {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          localStorage.removeItem(LEGACY_REMEMBER_CREDENTIALS_KEY);
        } catch {
          // Ignorar
        }
      }

      onLogin(data.user.role, data.user.username);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servidor. Vuelve a intentar cuando tengas conexión.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card login-card-uncontained">
        <header className="login-header">
          <div className="login-logo-wrap">
            <img
              src="/logo.jpg"
              alt="Logo Mi Granja Pro"
              className="login-brand-logo"
            />
          </div>
          <h1 className="login-title">Mi Granja Pro</h1>
          <p className="login-subtitle">Sistema integral de gestión porcícola</p>
        </header>

        <form onSubmit={submit} className="login-form" autoComplete="on">
          <div className="form-group">
            <label htmlFor="login-username" className="login-label">
              Usuario
            </label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-lead" aria-hidden="true">
                <IconUser size={18} />
              </span>
              <input
                id="login-username"
                className="form-input login-input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                name="username"
                placeholder="ej. admin@granja.pe"
                value={username}
                onChange={(e) => {
                  userStartedEditing.current = true;
                  const val = e.target.value;
                  setUsername(val);
                  const found = DEMO_ACCOUNTS.find(
                    (a) => a.username.toLowerCase() === val.toLowerCase() ||
                           a.role.toLowerCase() === val.toLowerCase(),
                  );
                  setSelectedRole(found ? found.role : null);
                }}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="login-label">
              Contraseña
            </label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-lead" aria-hidden="true">
                <IconLock size={18} />
              </span>
              <input
                id="login-password"
                className="form-input login-input input-has-trail"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { userStartedEditing.current = true; setPassword(e.target.value); }}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="btn-password-toggle"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
                disabled={loading}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <div className={`login-remember-row ${remember ? 'is-active' : ''}`}>
            <label htmlFor="login-remember" className="login-remember-label">
              <input
                id="login-remember"
                className="login-remember-checkbox"
                type="checkbox"
                checked={remember}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRemember(checked);
                  if (!checked) {
                    removeRememberedUsername();
                  }
                }}
                disabled={loading}
              />
              <span className="login-remember-text">
                Recordar usuario y contraseña
              </span>
            </label>
          </div>

          {error && (
            <div className="alert alert-danger login-alert" role="alert">
              <IconAlertCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-login-submit"
            disabled={loading}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              {loading ? (
                <>
                  <IconRefreshCw size={18} className="spinner-icon" />
                  <span>Comprobando…</span>
                </>
              ) : (
                <>
                  <IconLogIn size={18} />
                  <span>Entrar</span>
                </>
              )}
            </span>
          </button>

          <div className="login-quick-roles" aria-label="Perfiles de acceso rápido">
            {DEMO_ACCOUNTS.map((acc) => {
              const isSelected = selectedRole === acc.role;
              return (
                <button
                  key={acc.role}
                  type="button"
                  className={`btn-quick-role ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => fillDemoAccount(acc)}
                  disabled={loading}
                >
                  <span className="inline-flex items-center justify-center gap-1.5 leading-none">
                    {acc.role === 'administrador' && <IconShield size={15} />}
                    {acc.role === 'responsable' && <IconUser size={15} />}
                    {acc.role === 'operario' && <IconPig size={15} />}
                    {acc.role === 'veterinario' && <IconStethoscope size={15} />}
                    <span>{acc.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </form>

        <footer className="login-card-footer">
          <div className="login-security-badge">
            <IconShield size={14} />
            <span>Acceso seguro para personal autorizado</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
