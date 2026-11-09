import React, { useCallback, useEffect, useState } from 'react';
import {
  IconSettings,
  IconList,
  IconScale,
  IconBuilding,
  IconPlus,
  IconCheck,
  IconAlertCircle,
  IconRefreshCw,
  IconTrash,
  IconEdit,
  IconClock,
  IconCalendar,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import { ModalDialog } from './ModalDialog';

interface CatalogItem {
  id: number;
  catalogKey: string;
  code: string;
  name: string;
  sortOrder: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

interface StageItem {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  initialWeightKg: number | null;
  finalWeightKg: number | null;
  initialAgeDays: number | null;
  finalAgeDays: number | null;
  durationDays: number | null;
  rationName: string | null;
  dailyFeedKg: number | null;
  monthlyFeedKg: number | null;
  totalFeedKg: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

interface SettingItem {
  id: number;
  key: string;
  value: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface LocationItem {
  id: number;
  code: string;
  name: string;
  locationType: string;
  parentCode: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

interface LotItem {
  id: number;
  code: string;
  name: string;
  stageCode: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'retired';
}

interface Snapshot {
  asOf: string;
  settings: SettingItem[];
  catalogs: { key: string; label: string; items: CatalogItem[] }[];
  stages: StageItem[];
  locations: LocationItem[];
  lots: LotItem[];
}

type Section = 'parametros' | 'catalogos' | 'etapas' | 'estructura';
type HistoryEntity = 'catalog' | 'stage' | 'setting' | 'location' | 'lot';

interface RetireTarget {
  kind: 'catalog' | 'stage' | 'location' | 'lot';
  code: string;
  label: string;
  catalogKey?: string;
}

interface HistoryTarget {
  entity: HistoryEntity;
  code: string;
  label: string;
  catalogKey?: string;
}

const SETTING_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'farm_name', label: 'Nombre de la granja', placeholder: 'Ej. Granja San Luis' },
  { key: 'timezone', label: 'Zona horaria', placeholder: 'Ej. America/Lima' },
  { key: 'currency', label: 'Moneda', placeholder: 'Ej. S/' },
  { key: 'weight_unit', label: 'Unidad de peso', placeholder: 'Ej. kg' },
];

const LOCATION_TYPE_LABEL: Record<string, string> = {
  galpon: 'Galpón',
  corral: 'Corral',
  area: 'Área',
  otro: 'Otro',
};

function displayNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Sin dato' : String(value);
}

function numberOrNull(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function errorStatus(status: number, message: string): string {
  return status === 409 ? `${message} (conflicto de reintento)` : message;
}

export function ModuloConfiguracion() {
  const [section, setSection] = useState<Section>('parametros');
  const [asOf, setAsOf] = useState<string>(() => farmToday());
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Parámetros generales
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [settingsDate, setSettingsDate] = useState<string>(() => farmToday());
  const [settingsReason, setSettingsReason] = useState<string>('');
  const [settingsSaving, setSettingsSaving] = useState<boolean>(false);
  const [settingKeys, setSettingKeys] = useState<Record<string, string>>(() => Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.key, newOperationKey(`cfg-${field.key}`)]),
  ));

  // Catálogos
  const [catalogKey, setCatalogKey] = useState<string>('etapa');
  const [catCode, setCatCode] = useState<string>('');
  const [catName, setCatName] = useState<string>('');
  const [catSort, setCatSort] = useState<string>('0');
  const [catDate, setCatDate] = useState<string>(() => farmToday());
  const [catReason, setCatReason] = useState<string>('');
  const [catKey, setCatKey] = useState<string>(() => newOperationKey('cfg-cat'));
  const [catSaving, setCatSaving] = useState<boolean>(false);
  const [catError, setCatError] = useState<string | null>(null);

  // Etapas
  const [stageCode, setStageCode] = useState<string>('');
  const [stageName, setStageName] = useState<string>('');
  const [stageSort, setStageSort] = useState<string>('0');
  const [stageInitialWeight, setStageInitialWeight] = useState<string>('');
  const [stageFinalWeight, setStageFinalWeight] = useState<string>('');
  const [stageInitialAge, setStageInitialAge] = useState<string>('');
  const [stageFinalAge, setStageFinalAge] = useState<string>('');
  const [stageDuration, setStageDuration] = useState<string>('');
  const [stageRation, setStageRation] = useState<string>('');
  const [stageDailyFeed, setStageDailyFeed] = useState<string>('');
  const [stageDate, setStageDate] = useState<string>(() => farmToday());
  const [stageReason, setStageReason] = useState<string>('');
  const [stageKey, setStageKey] = useState<string>(() => newOperationKey('cfg-stage'));
  const [stageSaving, setStageSaving] = useState<boolean>(false);
  const [stageError, setStageError] = useState<string | null>(null);

  // Ubicaciones y lotes
  const [locationCode, setLocationCode] = useState<string>('');
  const [locationName, setLocationName] = useState<string>('');
  const [locationType, setLocationType] = useState<string>('galpon');
  const [locationParent, setLocationParent] = useState<string>('');
  const [locationDate, setLocationDate] = useState<string>(() => farmToday());
  const [locationReason, setLocationReason] = useState<string>('');
  const [locationKey, setLocationKey] = useState<string>(() => newOperationKey('cfg-loc'));
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState<boolean>(false);

  const [lotCode, setLotCode] = useState<string>('');
  const [lotName, setLotName] = useState<string>('');
  const [lotStage, setLotStage] = useState<string>('');
  const [lotDate, setLotDate] = useState<string>(() => farmToday());
  const [lotReason, setLotReason] = useState<string>('');
  const [lotKey, setLotKey] = useState<string>(() => newOperationKey('cfg-lot'));
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotSaving, setLotSaving] = useState<boolean>(false);

  // Retiro con vigencia
  const [retireTarget, setRetireTarget] = useState<RetireTarget | null>(null);
  const [retireDate, setRetireDate] = useState<string>(() => farmToday());
  const [retireReason, setRetireReason] = useState<string>('');
  const [retireKey, setRetireKey] = useState<string>(() => newOperationKey('cfg-ret'));
  const [retireError, setRetireError] = useState<string | null>(null);
  const [retireSaving, setRetireSaving] = useState<boolean>(false);

  // Historial de versiones
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);
  const [historyRows, setHistoryRows] = useState<unknown[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [canInstall, setCanInstall] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(window.__pwaInstallPrompt));

  useEffect(() => {
    const check = () => setCanInstall(Boolean(typeof window !== 'undefined' && window.__pwaInstallPrompt));
    check();
    window.addEventListener('pwa-install-ready', check);
    window.addEventListener('pwa-installed', check);
    return () => {
      window.removeEventListener('pwa-install-ready', check);
      window.removeEventListener('pwa-installed', check);
    };
  }, []);

  const handleInstallClick = async () => {
    if (typeof window !== 'undefined' && window.__pwaInstallPrompt) {
      await window.__pwaInstallPrompt.prompt();
      await window.__pwaInstallPrompt.userChoice;
      window.__pwaInstallPrompt = null;
      setCanInstall(false);
    }
  };

  const loadConfig = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/config?asOf=${encodeURIComponent(date)}`);
      const body = await res.json() as { error?: string } & Snapshot;
      if (!res.ok) {
        setError(body.error || 'No se pudo cargar la configuración');
        return;
      }
      setData(body);
      const map: Record<string, string> = {};
      for (const setting of body.settings) map[setting.key] = setting.value;
      setSettings(map);
    } catch {
      setError('No se pudo cargar la configuración de la granja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadConfig(asOf);
    }, 0);
    return () => clearTimeout(timer);
  }, [asOf, loadConfig]);

  const openRetire = (target: RetireTarget) => {
    setRetireTarget(target);
    setRetireDate(farmToday());
    setRetireReason('');
    setRetireKey(newOperationKey('cfg-ret'));
    setRetireError(null);
    setError(null);
    setSuccess(null);
  };

  const submitRetire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retireTarget) return;
    setRetireError(null);

    if (retireReason.trim().length < 5) {
      setRetireError('Indique el motivo del retiro (mínimo 5 caracteres). Los datos se conservan.');
      return;
    }

    setRetireSaving(true);
    try {
      const endpoint = retireTarget.kind === 'catalog' ? '/api/config/catalogs/retire'
        : retireTarget.kind === 'stage' ? '/api/config/stages/retire'
          : retireTarget.kind === 'location' ? '/api/config/locations/retire'
            : '/api/config/lots/retire';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogKey: retireTarget.catalogKey,
          code: retireTarget.code,
          effectiveFrom: retireDate,
          reason: retireReason,
          operationKey: retireKey,
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setRetireError(errorStatus(res.status, body.error || 'No se pudo retirar el valor'));
        return;
      }
      setSuccess(body.replayed
        ? 'Retiro ya registrado: se devolvió el resultado anterior sin duplicar el evento.'
        : `Retiro registrado para ${retireTarget.label}: conserva su historial para fechas anteriores.`);
      setRetireTarget(null);
      await loadConfig(asOf);
    } catch {
      setRetireError('No se pudo confirmar el retiro. Reintente con el mismo formulario.');
    } finally {
      setRetireSaving(false);
    }
  };

  const openHistory = async (target: HistoryTarget) => {
    setHistoryTarget(target);
    setHistoryRows(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ entity: target.entity, code: target.code });
      if (target.catalogKey) params.set('catalogKey', target.catalogKey);
      const res = await fetch(`/api/config/history?${params.toString()}`);
      const body = await res.json() as { error?: string; history?: unknown[] };
      if (!res.ok) {
        setHistoryError(body.error || 'No se pudo cargar el historial');
        return;
      }
      setHistoryRows(body.history || []);
    } catch {
      setHistoryError('No se pudo cargar el historial de versiones');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!settingsReason.trim()) {
      setError('Indique el motivo del cambio de parámetros. Los datos se conservan.');
      return;
    }

    const current = data?.settings ?? [];
    const changed = SETTING_FIELDS.filter((field) => {
      const existing = current.find((setting) => setting.key === field.key);
      return (settings[field.key] ?? '') !== (existing?.value ?? '');
    });

    if (changed.length === 0) {
      setSuccess('No hay cambios en los parámetros generales.');
      return;
    }

    setSettingsSaving(true);
    try {
      for (const field of changed) {
        const res = await fetch('/api/config/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: field.key,
            value: settings[field.key] ?? '',
            effectiveFrom: settingsDate,
            reason: settingsReason,
            operationKey: settingKeys[field.key],
          }),
        });
        const body = await res.json() as { error?: string };
        if (!res.ok) {
          setError(errorStatus(res.status, body.error || `No se pudo guardar ${field.label}`));
          return;
        }
      }
      setSuccess('Parámetros de la granja registrados con vigencia y auditoría.');
      setSettingsReason('');
      setSettingKeys(Object.fromEntries(
        SETTING_FIELDS.map((field) => [field.key, newOperationKey(`cfg-${field.key}`)]),
      ));
      await loadConfig(asOf);
    } catch {
      setError('No se pudo confirmar el cambio de parámetros. Reintente con el mismo formulario.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCreateCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    setSuccess(null);

    setCatSaving(true);
    try {
      const res = await fetch('/api/config/catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogKey,
          code: catCode,
          name: catName,
          sortOrder: Number(catSort) || 0,
          effectiveFrom: catDate,
          reason: catReason,
          operationKey: catKey,
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setCatError(errorStatus(res.status, body.error || 'No se pudo guardar el ítem'));
        return;
      }
      setSuccess(body.replayed
        ? 'Ítem ya registrado: se devolvió el resultado anterior sin duplicar el evento.'
        : 'Ítem de catálogo guardado con vigencia y auditoría.');
      setCatCode('');
      setCatName('');
      setCatSort('0');
      setCatReason('');
      setCatKey(newOperationKey('cfg-cat'));
      await loadConfig(asOf);
    } catch {
      setCatError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setCatSaving(false);
    }
  };

  const editStage = (stage: StageItem) => {
    setStageCode(stage.code);
    setStageName(stage.name);
    setStageSort(String(stage.sortOrder));
    setStageInitialWeight(stage.initialWeightKg === null ? '' : String(stage.initialWeightKg));
    setStageFinalWeight(stage.finalWeightKg === null ? '' : String(stage.finalWeightKg));
    setStageInitialAge(stage.initialAgeDays === null ? '' : String(stage.initialAgeDays));
    setStageFinalAge(stage.finalAgeDays === null ? '' : String(stage.finalAgeDays));
    setStageDuration(stage.durationDays === null ? '' : String(stage.durationDays));
    setStageRation(stage.rationName ?? '');
    setStageDailyFeed(stage.dailyFeedKg === null ? '' : String(stage.dailyFeedKg));
    setStageDate(farmToday());
    setStageReason('');
    setStageKey(newOperationKey('cfg-stage'));
    setStageError(null);
    setSection('etapas');
  };

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    setStageError(null);
    setSuccess(null);

    setStageSaving(true);
    try {
      const res = await fetch('/api/config/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: stageCode,
          name: stageName,
          sortOrder: Number(stageSort) || 0,
          initialWeightKg: numberOrNull(stageInitialWeight),
          finalWeightKg: numberOrNull(stageFinalWeight),
          initialAgeDays: numberOrNull(stageInitialAge),
          finalAgeDays: numberOrNull(stageFinalAge),
          durationDays: numberOrNull(stageDuration),
          rationName: stageRation,
          dailyFeedKg: numberOrNull(stageDailyFeed),
          effectiveFrom: stageDate,
          reason: stageReason,
          operationKey: stageKey,
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setStageError(errorStatus(res.status, body.error || 'No se pudo guardar la etapa'));
        return;
      }
      setSuccess(body.replayed
        ? 'Etapa ya registrada: se devolvió el resultado anterior sin duplicar el evento.'
        : 'Etapa guardada con pesos, edades, duración y ración vigentes desde la fecha indicada.');
      setStageReason('');
      setStageKey(newOperationKey('cfg-stage'));
      await loadConfig(asOf);
    } catch {
      setStageError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setStageSaving(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocationError(null);
    setSuccess(null);
    setLocationSaving(true);
    try {
      const res = await fetch('/api/config/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: locationCode,
          name: locationName,
          locationType,
          parentCode: locationParent,
          effectiveFrom: locationDate,
          reason: locationReason,
          operationKey: locationKey,
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setLocationError(errorStatus(res.status, body.error || 'No se pudo guardar la ubicación'));
        return;
      }
      setSuccess(body.replayed
        ? 'Ubicación ya registrada: se devolvió el resultado anterior sin duplicar el evento.'
        : 'Ubicación física guardada con vigencia. Se distingue del lote de manejo y de la etapa.');
      setLocationCode('');
      setLocationName('');
      setLocationParent('');
      setLocationReason('');
      setLocationKey(newOperationKey('cfg-loc'));
      await loadConfig(asOf);
    } catch {
      setLocationError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleSaveLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLotError(null);
    setSuccess(null);
    setLotSaving(true);
    try {
      const res = await fetch('/api/config/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: lotCode,
          name: lotName,
          stageCode: lotStage,
          effectiveFrom: lotDate,
          reason: lotReason,
          operationKey: lotKey,
        }),
      });
      const body = await res.json() as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setLotError(errorStatus(res.status, body.error || 'No se pudo guardar el lote'));
        return;
      }
      setSuccess(body.replayed
        ? 'Lote ya registrado: se devolvió el resultado anterior sin duplicar el evento.'
        : 'Lote de manejo guardado con vigencia y etapa asociada.');
      setLotCode('');
      setLotName('');
      setLotStage('');
      setLotReason('');
      setLotKey(newOperationKey('cfg-lot'));
      await loadConfig(asOf);
    } catch {
      setLotError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setLotSaving(false);
    }
  };

  const selectedCatalog = data?.catalogs.find((catalog) => catalog.key === catalogKey);

  return (
    <div>
      <div className="module-heading mb-4">
        <p className="text-xs text-muted">
          Catálogos, etapas productivas, parámetros operativos y ubicaciones.
        </p>
        <div className="inline-flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted inline-flex items-center gap-1">
            <IconCalendar size={14} />
            <span>Consultar al:</span>
          </label>
          <input
            type="date"
            className="form-input form-select-sm"
            style={{ maxWidth: '160px' }}
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void loadConfig(asOf)}
            title="Recargar configuración"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar</span>
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="banner-alert banner-alert-error mb-4" role="alert">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={18} />
            <span>{error}</span>
          </span>
        </div>
      )}

      {success && (
        <div className="banner-alert banner-alert-success mb-4" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={18} />
            <span>{success}</span>
          </span>
        </div>
      )}

      <div className="admin-tabs mb-4">
        <button type="button" className={`btn btn-sm ${section === 'parametros' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSection('parametros')}>
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconSettings size={14} />
            <span>Parámetros</span>
          </span>
        </button>
        <button type="button" className={`btn btn-sm ${section === 'catalogos' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSection('catalogos')}>
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconList size={14} />
            <span>Catálogos</span>
          </span>
        </button>
        <button type="button" className={`btn btn-sm ${section === 'etapas' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSection('etapas')}>
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconScale size={14} />
            <span>Etapas y Raciones</span>
          </span>
        </button>
        <button type="button" className={`btn btn-sm ${section === 'estructura' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSection('estructura')}>
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconBuilding size={14} />
            <span>Ubicaciones y Lotes</span>
          </span>
        </button>
      </div>

      {loading ? (
        <p className="text-muted text-center p-4">Cargando configuración...</p>
      ) : !data ? (
        <p className="text-muted text-center p-4">No hay configuración disponible.</p>
      ) : (
        <>
          {section === 'parametros' && (
            <>
              <div className="card p-4">
              <h4 className="font-bold mb-2">Parámetros generales de la granja</h4>
              <p className="text-xs text-muted mb-4">
                Cada valor se versiona por fecha. Los informes históricos conservan el valor que estaba vigente.
              </p>
              <form onSubmit={handleSaveSettings}>
                <div className="form-grid mb-3">
                  {SETTING_FIELDS.map((field) => (
                    <div className="form-group" key={field.key}>
                      <label className="form-label">{field.label}</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings[field.key] ?? ''}
                        onChange={(e) => setSettings((current) => ({ ...current, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                  <div className="form-group">
                    <label className="form-label inline-flex items-center gap-1">
                      <IconCalendar size={14} />
                      <span>Vigente desde:</span>
                    </label>
                    <input type="date" className="form-input" required value={settingsDate} onChange={(e) => setSettingsDate(e.target.value)} />
                  </div>
                  <div className="form-group form-col-span-full">
                    <label className="form-label">Motivo del cambio (queda en auditoría):</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      minLength={5}
                      value={settingsReason}
                      onChange={(e) => setSettingsReason(e.target.value)}
                      placeholder="Ej. Actualización del nombre comercial de la granja"
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>{settingsSaving ? 'Guardando…' : 'Guardar Parámetros'}</span>
                  </span>
                </button>
              </form>
            </div>

            <div className="card p-4 mt-4">
              <h4 className="font-bold mb-2">Aplicación en Dispositivo y Acceso Directo</h4>
              <p className="text-xs text-muted mb-3">
                Instale Mi Granja Pro en la pantalla de inicio o escritorio para una experiencia completa y acceso rápido sin barras de navegador.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {canInstall ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleInstallClick}>
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Instalar aplicación en este dispositivo</span>
                    </span>
                  </button>
                ) : (
                  <span className="text-xs text-muted">
                    La aplicación ya está instalada o este navegador no requiere instalación adicional.
                  </span>
                )}
              </div>
            </div>
          </>
        )}

          {section === 'catalogos' && (
            <div className="card p-4">
              <h4 className="font-bold mb-2">Catálogos configurables</h4>
              <p className="text-xs text-muted mb-4">
                Valores predefinidos y opciones activas para los módulos de la granja.
              </p>

              <div className="form-group mb-3" style={{ maxWidth: '340px' }}>
                <label className="form-label">Catálogo:</label>
                <select className="form-select" value={catalogKey} onChange={(e) => setCatalogKey(e.target.value)}>
                  {data.catalogs.map((catalog) => (
                    <option key={catalog.key} value={catalog.key}>
                      {catalog.label} ({catalog.items.length})
                    </option>
                  ))}
                </select>
              </div>

              {!selectedCatalog || selectedCatalog.items.length === 0 ? (
                <p className="text-muted text-center p-3">No hay valores vigentes para este catálogo en la fecha consultada.</p>
              ) : (
                <div className="table-responsive mb-4">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Nombre</th>
                        <th>Orden</th>
                        <th>Vigente desde</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCatalog.items.map((item) => (
                        <tr key={item.id}>
                          <td className="font-mono text-xs">{item.code}</td>
                          <td>{item.name}</td>
                          <td className="font-mono text-xs">{item.sortOrder}</td>
                          <td className="font-mono text-xs">{item.effectiveFrom}</td>
                          <td>
                            <div className="inline-flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void openHistory({
                                  entity: 'catalog',
                                  code: item.code,
                                  label: `${selectedCatalog.label} · ${item.name}`,
                                  catalogKey: selectedCatalog.key,
                                })}
                              >
                                <span className="inline-flex items-center justify-center gap-2 leading-none">
                                  <IconClock size={14} />
                                  <span>Historial</span>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-danger"
                                onClick={() => openRetire({
                                  kind: 'catalog',
                                  code: item.code,
                                  label: `${selectedCatalog.label} · ${item.name}`,
                                  catalogKey: selectedCatalog.key,
                                })}
                              >
                                <span className="inline-flex items-center justify-center gap-2 leading-none">
                                  <IconTrash size={14} />
                                  <span>Retirar</span>
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h5 className="font-bold mb-2">Agregar o versionar un valor</h5>
              {catError && (
                <div className="banner-alert banner-alert-error mb-3" role="alert">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{catError}</span>
                  </span>
                </div>
              )}
              <form onSubmit={handleCreateCatalog}>
                <div className="form-grid mb-3">
                  <div className="form-group">
                    <label className="form-label">Código</label>
                    <input type="text" className="form-input" required value={catCode} onChange={(e) => setCatCode(e.target.value)} placeholder="Ej. gestacion_tardia" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre visible</label>
                    <input type="text" className="form-input" required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej. Gestación tardía" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Orden</label>
                    <input type="number" className="form-input" min={0} value={catSort} onChange={(e) => setCatSort(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vigente desde</label>
                    <input type="date" className="form-input" required value={catDate} onChange={(e) => setCatDate(e.target.value)} />
                  </div>
                  <div className="form-group form-col-span-full">
                    <label className="form-label">Motivo (auditoría)</label>
                    <input type="text" className="form-input" value={catReason} onChange={(e) => setCatReason(e.target.value)} placeholder="Ej. Nuevo valor solicitado por producción" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={catSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{catSaving ? 'Guardando…' : 'Guardar Valor'}</span>
                  </span>
                </button>
              </form>
            </div>
          )}

          {section === 'etapas' && (
            <div className="card p-4">
              <h4 className="font-bold mb-2">Etapas productivas y raciones</h4>
              <p className="text-xs text-muted mb-4">
                Pesos y edades inicial/final, duración, ración y consumo diario por cabeza. El consumo mensual se calcula a 30 días.
                Los límites abiertos se muestran como «Sin dato», distintos de un cero.
              </p>

              <div className="table-responsive mb-4">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th>Peso (kg)</th>
                      <th>Edad (días)</th>
                      <th>Duración</th>
                      <th>Ración</th>
                      <th>Consumo diario</th>
                      <th>30 días</th>
                      <th>Total etapa</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stages.map((stage) => (
                      <tr key={stage.id}>
                        <td>
                          <strong>{stage.name}</strong>
                          <div className="font-mono text-xs text-muted">{stage.code}</div>
                        </td>
                        <td className="text-xs">
                          {displayNumber(stage.initialWeightKg)} a {displayNumber(stage.finalWeightKg)}
                        </td>
                        <td className="text-xs">
                          {displayNumber(stage.initialAgeDays)} a {displayNumber(stage.finalAgeDays)}
                        </td>
                        <td className="font-mono text-xs">{displayNumber(stage.durationDays)}</td>
                        <td className="text-xs">{stage.rationName ?? <span className="text-muted">Sin ración</span>}</td>
                        <td className="font-mono text-xs">{stage.dailyFeedKg === null ? 'Sin dato' : `${stage.dailyFeedKg} kg`}</td>
                        <td className="font-mono text-xs">{stage.monthlyFeedKg === null ? 'Sin dato' : `${stage.monthlyFeedKg} kg`}</td>
                        <td className="font-mono text-xs">{stage.totalFeedKg === null ? 'Sin dato' : `${stage.totalFeedKg} kg`}</td>
                        <td>
                          <div className="inline-flex items-center gap-2 flex-wrap">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editStage(stage)}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconEdit size={14} />
                                <span>Editar</span>
                              </span>
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHistory({ entity: 'stage', code: stage.code, label: stage.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconClock size={14} />
                                <span>Historial</span>
                              </span>
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => openRetire({ kind: 'stage', code: stage.code, label: stage.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconTrash size={14} />
                                <span>Retirar</span>
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h5 className="font-bold mb-2">Registrar nueva versión de etapa</h5>
              {stageError && (
                <div className="banner-alert banner-alert-error mb-3" role="alert">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{stageError}</span>
                  </span>
                </div>
              )}
              <form onSubmit={handleSaveStage}>
                <div className="form-grid mb-3">
                  <div className="form-group">
                    <label className="form-label">Código</label>
                    <input type="text" className="form-input" required value={stageCode} onChange={(e) => setStageCode(e.target.value)} placeholder="Ej. preinicio" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input type="text" className="form-input" required value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Ej. Preinicio" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Orden</label>
                    <input type="number" className="form-input" min={0} value={stageSort} onChange={(e) => setStageSort(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Peso inicial (kg, vacío = abierto)</label>
                    <input type="number" step="0.01" min={0} className="form-input" value={stageInitialWeight} onChange={(e) => setStageInitialWeight(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Peso final (kg, vacío = abierto)</label>
                    <input type="number" step="0.01" min={0} className="form-input" value={stageFinalWeight} onChange={(e) => setStageFinalWeight(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Edad inicial (días)</label>
                    <input type="number" min={0} className="form-input" value={stageInitialAge} onChange={(e) => setStageInitialAge(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Edad final (días)</label>
                    <input type="number" min={0} className="form-input" value={stageFinalAge} onChange={(e) => setStageFinalAge(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración (días)</label>
                    <input type="number" min={1} className="form-input" value={stageDuration} onChange={(e) => setStageDuration(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ración asociada</label>
                    <input type="text" className="form-input" value={stageRation} onChange={(e) => setStageRation(e.target.value)} placeholder="Ej. Alimento preinicio" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Consumo diario (kg/cabeza)</label>
                    <input type="number" step="0.01" min={0} className="form-input" value={stageDailyFeed} onChange={(e) => setStageDailyFeed(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label inline-flex items-center gap-1">
                      <IconCalendar size={14} />
                      <span>Vigente desde</span>
                    </label>
                    <input type="date" className="form-input" required value={stageDate} onChange={(e) => setStageDate(e.target.value)} />
                  </div>
                  <div className="form-group form-col-span-full">
                    <label className="form-label">Motivo (auditoría)</label>
                    <input type="text" className="form-input" required minLength={5} value={stageReason} onChange={(e) => setStageReason(e.target.value)} placeholder="Ej. Ajuste de dieta y duración por indicación veterinaria" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={stageSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{stageSaving ? 'Guardando…' : 'Guardar Etapa'}</span>
                  </span>
                </button>
              </form>
            </div>
          )}

          {section === 'estructura' && (
            <div className="card p-4">
              <h4 className="font-bold mb-2">Ubicaciones físicas y lotes de manejo</h4>
              <p className="text-xs text-muted mb-4">
                La ubicación física (galpón, corral o área) se mantiene separada del lote de manejo y de la etapa productiva.
              </p>

              <h5 className="font-bold mb-2">Ubicaciones físicas</h5>
              <div className="table-responsive mb-3">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Ubicación padre</th>
                      <th>Vigente desde</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.locations.map((location) => (
                      <tr key={location.id}>
                        <td className="font-mono text-xs">{location.code}</td>
                        <td>{location.name}</td>
                        <td><span className="badge badge-outline">{LOCATION_TYPE_LABEL[location.locationType] ?? location.locationType}</span></td>
                        <td className="font-mono text-xs">{location.parentCode ?? 'Sin padre'}</td>
                        <td className="font-mono text-xs">{location.effectiveFrom}</td>
                        <td>
                          <div className="inline-flex items-center gap-2 flex-wrap">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHistory({ entity: 'location', code: location.code, label: location.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconClock size={14} />
                                <span>Historial</span>
                              </span>
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => openRetire({ kind: 'location', code: location.code, label: location.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconTrash size={14} />
                                <span>Retirar</span>
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {locationError && (
                <div className="banner-alert banner-alert-error mb-3" role="alert">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{locationError}</span>
                  </span>
                </div>
              )}
              <form onSubmit={handleSaveLocation} className="mb-4">
                <div className="form-grid mb-2">
                  <div className="form-group">
                    <label className="form-label">Código</label>
                    <input type="text" className="form-input" required value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="Ej. galpon_c" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input type="text" className="form-input" required value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Ej. Galpón C" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tipo</label>
                    <select className="form-select" value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                      <option value="galpon">Galpón</option>
                      <option value="corral">Corral</option>
                      <option value="area">Área</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ubicación padre (opcional)</label>
                    <input type="text" className="form-input" value={locationParent} onChange={(e) => setLocationParent(e.target.value)} placeholder="Ej. galpon_a" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vigente desde</label>
                    <input type="date" className="form-input" required value={locationDate} onChange={(e) => setLocationDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Motivo (auditoría)</label>
                    <input type="text" className="form-input" value={locationReason} onChange={(e) => setLocationReason(e.target.value)} placeholder="Ej. Nueva área habilitada" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={locationSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{locationSaving ? 'Guardando…' : 'Guardar Ubicación'}</span>
                  </span>
                </button>
              </form>

              <h5 className="font-bold mb-2">Lotes de manejo</h5>
              <div className="table-responsive mb-3">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Etapa</th>
                      <th>Vigente desde</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lots.map((lot) => (
                      <tr key={lot.id}>
                        <td className="font-mono text-xs">{lot.code}</td>
                        <td>{lot.name}</td>
                        <td className="font-mono text-xs">{lot.stageCode ?? 'Sin etapa'}</td>
                        <td className="font-mono text-xs">{lot.effectiveFrom}</td>
                        <td>
                          <div className="inline-flex items-center gap-2 flex-wrap">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHistory({ entity: 'lot', code: lot.code, label: lot.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconClock size={14} />
                                <span>Historial</span>
                              </span>
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => openRetire({ kind: 'lot', code: lot.code, label: lot.name })}>
                              <span className="inline-flex items-center justify-center gap-2 leading-none">
                                <IconTrash size={14} />
                                <span>Retirar</span>
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lotError && (
                <div className="banner-alert banner-alert-error mb-3" role="alert">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{lotError}</span>
                  </span>
                </div>
              )}
              <form onSubmit={handleSaveLot}>
                <div className="form-grid mb-2">
                  <div className="form-group">
                    <label className="form-label">Código</label>
                    <input type="text" className="form-input" required value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="Ej. lote_levante_b" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input type="text" className="form-input" required value={lotName} onChange={(e) => setLotName(e.target.value)} placeholder="Ej. Lote Levante B" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Etapa asociada (opcional)</label>
                    <select className="form-select" value={lotStage} onChange={(e) => setLotStage(e.target.value)}>
                      <option value="">Sin etapa</option>
                      {data.stages.map((stage) => (
                        <option key={stage.code} value={stage.code}>{stage.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Vigente desde</label>
                    <input type="date" className="form-input" required value={lotDate} onChange={(e) => setLotDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Motivo (auditoría)</label>
                    <input type="text" className="form-input" value={lotReason} onChange={(e) => setLotReason(e.target.value)} placeholder="Ej. Nuevo lote de manejo" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={lotSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{lotSaving ? 'Guardando…' : 'Guardar Lote'}</span>
                  </span>
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {retireTarget && (
        <ModalDialog
          labelledBy="config-retire-dialog-title"
          onDismiss={() => setRetireTarget(null)}
          dismissDisabled={retireSaving}
        >
          <h4 id="config-retire-dialog-title" className="text-lg font-bold mb-2">Retirar de las opciones nuevas</h4>
          <p className="text-xs text-muted mb-3">
            <strong>{retireTarget.label}</strong> dejará de ofrecerse desde la fecha indicada.
            Las fechas anteriores conservan este valor en los informes.
          </p>
          {retireError && (
            <div className="banner-alert banner-alert-error mb-3" role="alert">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconAlertCircle size={16} />
                <span>{retireError}</span>
              </span>
            </div>
          )}
          <form onSubmit={submitRetire}>
            <div className="form-group mb-2">
              <label className="form-label text-sm" htmlFor="config-retire-date">Vigente hasta (nueva fecha efectiva):</label>
              <input id="config-retire-date" type="date" className="form-input" required value={retireDate} onChange={(e) => setRetireDate(e.target.value)} />
            </div>
            <div className="form-group mb-3">
              <label className="form-label text-sm" htmlFor="config-retire-reason">Motivo del retiro:</label>
              <input
                id="config-retire-reason"
                type="text"
                className="form-input"
                required
                minLength={5}
                value={retireReason}
                onChange={(e) => setRetireReason(e.target.value)}
                placeholder="Ej. Reemplazado por un nuevo valor del catálogo"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="btn btn-outline" onClick={() => setRetireTarget(null)} disabled={retireSaving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-danger" disabled={retireSaving}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{retireSaving ? 'Guardando…' : 'Confirmar Retiro'}</span>
                </span>
              </button>
            </div>
          </form>
        </ModalDialog>
      )}

      {historyTarget && (
        <ModalDialog
          labelledBy="config-history-dialog-title"
          onDismiss={() => setHistoryTarget(null)}
        >
          <div style={{ maxWidth: '760px', width: '100%' }}>
            <h4 id="config-history-dialog-title" className="text-lg font-bold mb-2">Historial de versiones</h4>
            <p className="text-xs text-muted mb-3">{historyTarget.label}</p>
            {historyLoading ? (
              <p className="text-muted text-center p-3">Cargando historial...</p>
            ) : historyError ? (
              <div className="banner-alert banner-alert-error mb-3" role="alert">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertCircle size={16} />
                  <span>{historyError}</span>
                </span>
              </div>
            ) : !historyRows || historyRows.length === 0 ? (
              <p className="text-muted text-center p-3">No hay versiones registradas.</p>
            ) : (
              <pre className="text-xs whitespace-pre-wrap break-all bg-light p-3" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                {JSON.stringify(historyRows, null, 2)}
              </pre>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="btn btn-outline" onClick={() => setHistoryTarget(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
