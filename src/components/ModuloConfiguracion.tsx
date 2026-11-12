import React, { useCallback, useEffect, useState } from 'react';
import {
  IconSettings,
  IconList,
  IconScale,
  IconBuilding,
  IconPlus,
  IconCheck,
  IconTrash,
  IconEdit,
  IconClock,
  IconCalendar,
  IconX,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import { ModalDialog } from './ModalDialog';
import { ModuleTabs } from './ModuleTabs';
import { DataState } from './DataState';
import {
  PageHeader,
  InlineAlert,
  StatusBadge,
  DataCardList,
  DataCard,
  DataCardHead,
  DataCardMeta,
  DataCardActions,
  FormField,
} from './ui';

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
  barnId: number | null;
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
  const [locationBarnId, setLocationBarnId] = useState<string>('');
  const [locationChoices, setLocationChoices] = useState<LocationItem[]>([]);
  const [barns, setBarns] = useState<{ id: number; name: string; status: string }[]>([]);
  const [locationDate, setLocationDate] = useState<string>(() => farmToday());
  const [locationReason, setLocationReason] = useState<string>('');
  const [locationKey, setLocationKey] = useState<string>(() => newOperationKey('cfg-loc'));
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState<boolean>(false);
  const [locationModal, setLocationModal] = useState(false);

  const [lotCode, setLotCode] = useState<string>('');
  const [lotName, setLotName] = useState<string>('');
  const [lotStage, setLotStage] = useState<string>('');
  const [lotDate, setLotDate] = useState<string>(() => farmToday());
  const [lotReason, setLotReason] = useState<string>('');
  const [lotKey, setLotKey] = useState<string>(() => newOperationKey('cfg-lot'));
  const [lotError, setLotError] = useState<string | null>(null);
  const [lotSaving, setLotSaving] = useState<boolean>(false);
  const [lotModal, setLotModal] = useState(false);

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
      const [res, barnResponse] = await Promise.all([
        fetch(`/api/config?asOf=${encodeURIComponent(date)}`),
        fetch('/api/admin/barns'),
      ]);
      const body = await res.json() as { error?: string } & Snapshot;
      if (!res.ok) {
        setError(body.error || 'No se pudo cargar la configuración');
        return;
      }
      setData(body);
      if (barnResponse.ok) {
        const barnBody = await barnResponse.json() as { barns: { id: number; name: string; status: string }[] };
        setBarns(barnBody.barns);
      }
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

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/config?asOf=${encodeURIComponent(locationDate)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const snapshot = await response.json() as Snapshot;
        setLocationChoices(snapshot.locations);
      }).catch(() => { if (!controller.signal.aborted) setLocationChoices([]); });
    return () => controller.abort();
  }, [locationDate, data]);

  const validLocationParents = locationChoices.filter((candidate) => {
    if (candidate.barnId === null) return false;
    const seen = new Set<string>([locationCode.trim().toLowerCase()]);
    let current: LocationItem | undefined = candidate;
    while (current) {
      if (seen.has(current.code)) return false;
      seen.add(current.code);
      if (!current.parentCode) return true;
      current = locationChoices.find((item) => item.code === current?.parentCode);
    }
    return false;
  });

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
          barnId: locationParent ? null : numberOrNull(locationBarnId),
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
      setLocationBarnId('');
      setLocationReason('');
      setLocationKey(newOperationKey('cfg-loc'));
      setLocationModal(false);
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
      setLotModal(false);
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
      <PageHeader
        title="Configuración"
        subtitle="Catálogos, etapas productivas, parámetros operativos y ubicaciones."
        cutoff={{ label: 'Consultar al:', value: asOf, onChange: setAsOf }}
        onRefresh={() => void loadConfig(asOf)}
        refreshing={loading}
      />

      {error && (
        <InlineAlert tone="error" onDismiss={() => setError(null)}>{error}</InlineAlert>
      )}

      {success && (
        <InlineAlert tone="success" autoDismissMs={6000} onDismiss={() => setSuccess(null)}>{success}</InlineAlert>
      )}

      <ModuleTabs label="Secciones de configuración" active={section} onChange={setSection} columns={2} tabs={[
        { id: 'parametros', label: 'Parámetros', icon: <IconSettings size={14} /> },
        { id: 'catalogos', label: 'Catálogos', icon: <IconList size={14} /> },
        { id: 'etapas', label: 'Etapas y Raciones', icon: <IconScale size={14} /> },
        { id: 'estructura', label: 'Ubicaciones y Lotes', icon: <IconBuilding size={14} /> },
      ]} />

      {loading ? (
        <DataState variant="loading" title="Cargando configuración…" />
      ) : !data ? (
        <DataState variant="empty" title="No hay configuración disponible." />
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
                <div className="data-card-list data-card-grid mb-3">
                  {SETTING_FIELDS.map((field) => (
                    <div className="data-card" key={field.key}>
                      <label className="form-label" htmlFor={`setting-${field.key}`}>{field.label}</label>
                      <input
                        id={`setting-${field.key}`}
                        type="text"
                        className="form-input"
                        value={settings[field.key] ?? ''}
                        onChange={(e) => setSettings((current) => ({ ...current, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                    </div>
                  ))}
                  <FormField labelClassName="inline-flex items-center gap-1" label={<><IconCalendar size={14} /><span>Vigente desde:</span></>}>
                    <input type="date" className="form-input" required value={settingsDate} onChange={(e) => setSettingsDate(e.target.value)} />
                  </FormField>
                  <FormField className="form-col-span-full" label="Motivo del cambio (queda en auditoría):">
                    <input
                      type="text"
                      className="form-input"
                      required
                      minLength={5}
                      value={settingsReason}
                      onChange={(e) => setSettingsReason(e.target.value)}
                      placeholder="Ej. Actualización del nombre comercial de la granja"
                    />
                  </FormField>
                </div>
                <div className="form-actions form-actions-sticky">
                <button type="submit" className="btn btn-primary" disabled={settingsSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconCheck size={16} />
                    <span>{settingsSaving ? 'Guardando…' : 'Guardar Parámetros'}</span>
                  </span>
                </button>
                </div>
              </form>
            </div>

            <div className="card p-4 mt-4">
              <h4 className="font-bold mb-2">Aplicación en Dispositivo y Acceso Directo</h4>
              <p className="text-xs text-muted mb-3">
                Instale Mi Granja PRO en la pantalla de inicio o escritorio para una experiencia completa y acceso rápido sin barras de navegador.
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
                <DataState variant="empty" title="No hay valores vigentes para este catálogo en la fecha consultada." />
              ) : (
                <DataCardList label="Valores del catálogo" grid className="mb-4">
                  {selectedCatalog.items.map((item) => (
                    <DataCard key={item.id}>
                      <DataCardHead
                        title={item.name}
                        subtitle={<span className="font-mono">{item.code}</span>}
                        badge={<StatusBadge>{item.status === 'active' ? 'Activo' : 'Retirado'}</StatusBadge>}
                      />
                      <DataCardMeta items={[
                        { label: 'Orden', value: item.sortOrder },
                        { label: 'Vigente desde', value: item.effectiveFrom },
                      ]} />
                      <DataCardActions>
                        <button type="button" className="btn btn-outline" onClick={() => { setCatCode(item.code); setCatName(item.name); setCatSort(String(item.sortOrder)); setCatDate(farmToday()); setCatReason(''); setCatKey(newOperationKey('cfg-cat')); setCatError(null); document.getElementById('catalog-value-form')?.scrollIntoView({ behavior: 'smooth' }); }}><IconEdit size={14} /><span>Editar</span></button>
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
                      </DataCardActions>
                    </DataCard>
                  ))}
                </DataCardList>
              )}

              <h5 className="font-bold mb-2">Agregar o versionar un valor</h5>
              {catError && (
                <InlineAlert tone="error" onDismiss={() => setCatError(null)}>{catError}</InlineAlert>
              )}
              <form id="catalog-value-form" onSubmit={handleCreateCatalog}>
                <div className="form-grid mb-3">
                  <FormField label="Código">
                    <input type="text" className="form-input" required value={catCode} onChange={(e) => setCatCode(e.target.value)} placeholder="Ej. gestacion_tardia" />
                  </FormField>
                  <FormField label="Nombre visible">
                    <input type="text" className="form-input" required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej. Gestación tardía" />
                  </FormField>
                  <FormField label="Orden">
                    <input type="number" className="form-input" min={0} value={catSort} onChange={(e) => setCatSort(e.target.value)} />
                  </FormField>
                  <FormField label="Vigente desde">
                    <input type="date" className="form-input" required value={catDate} onChange={(e) => setCatDate(e.target.value)} />
                  </FormField>
                  <FormField className="form-col-span-full" label="Motivo (auditoría)">
                    <input type="text" className="form-input" value={catReason} onChange={(e) => setCatReason(e.target.value)} placeholder="Ej. Nuevo valor solicitado por producción" />
                  </FormField>
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

              <DataCardList label="Etapas productivas y raciones" grid className="mb-4">
                {data.stages.map((stage) => (
                  <DataCard key={stage.id}>
                    <DataCardHead
                      title={stage.name}
                      subtitle={<span className="font-mono">{stage.code} · Orden {stage.sortOrder}</span>}
                      badge={<StatusBadge>{stage.status === 'active' ? 'Activa' : 'Retirada'}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Peso (kg)', value: <>{displayNumber(stage.initialWeightKg)} a {displayNumber(stage.finalWeightKg)}</> },
                      { label: 'Edad (días)', value: <>{displayNumber(stage.initialAgeDays)} a {displayNumber(stage.finalAgeDays)}</> },
                      { label: 'Duración (días)', value: displayNumber(stage.durationDays) },
                      { label: 'Ración', value: stage.rationName ?? 'Sin ración' },
                      { label: 'Consumo diario', value: stage.dailyFeedKg === null ? 'Sin dato' : `${stage.dailyFeedKg} kg` },
                      { label: '30 días', value: stage.monthlyFeedKg === null ? 'Sin dato' : `${stage.monthlyFeedKg} kg` },
                      { label: 'Total etapa', value: stage.totalFeedKg === null ? 'Sin dato' : `${stage.totalFeedKg} kg` },
                    ]} />
                    <DataCardActions>
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
                    </DataCardActions>
                  </DataCard>
                ))}
              </DataCardList>

              <h5 className="font-bold mb-2">Registrar nueva versión de etapa</h5>
              {stageError && (
                <InlineAlert tone="error" onDismiss={() => setStageError(null)}>{stageError}</InlineAlert>
              )}
              <form onSubmit={handleSaveStage}>
                <div className="form-grid mb-3">
                  <FormField label="Código">
                    <input type="text" className="form-input" required value={stageCode} onChange={(e) => setStageCode(e.target.value)} placeholder="Ej. preinicio" />
                  </FormField>
                  <FormField label="Nombre">
                    <input type="text" className="form-input" required value={stageName} onChange={(e) => setStageName(e.target.value)} placeholder="Ej. Preinicio" />
                  </FormField>
                  <FormField label="Orden">
                    <input type="number" className="form-input" min={0} value={stageSort} onChange={(e) => setStageSort(e.target.value)} />
                  </FormField>
                  <FormField label="Peso inicial (kg, vacío = abierto)">
                    <input type="number" step="0.01" min={0} className="form-input" value={stageInitialWeight} onChange={(e) => setStageInitialWeight(e.target.value)} />
                  </FormField>
                  <FormField label="Peso final (kg, vacío = abierto)">
                    <input type="number" step="0.01" min={0} className="form-input" value={stageFinalWeight} onChange={(e) => setStageFinalWeight(e.target.value)} />
                  </FormField>
                  <FormField label="Edad inicial (días)">
                    <input type="number" min={0} className="form-input" value={stageInitialAge} onChange={(e) => setStageInitialAge(e.target.value)} />
                  </FormField>
                  <FormField label="Edad final (días)">
                    <input type="number" min={0} className="form-input" value={stageFinalAge} onChange={(e) => setStageFinalAge(e.target.value)} />
                  </FormField>
                  <FormField label="Duración (días)">
                    <input type="number" min={1} className="form-input" value={stageDuration} onChange={(e) => setStageDuration(e.target.value)} />
                  </FormField>
                  <FormField label="Ración asociada">
                    <input type="text" className="form-input" value={stageRation} onChange={(e) => setStageRation(e.target.value)} placeholder="Ej. Alimento preinicio" />
                  </FormField>
                  <FormField label="Consumo diario (kg/cabeza)">
                    <input type="number" step="0.01" min={0} className="form-input" value={stageDailyFeed} onChange={(e) => setStageDailyFeed(e.target.value)} />
                  </FormField>
                  <FormField labelClassName="inline-flex items-center gap-1" label={<><IconCalendar size={14} /><span>Vigente desde</span></>}>
                    <input type="date" className="form-input" required value={stageDate} onChange={(e) => setStageDate(e.target.value)} />
                  </FormField>
                  <FormField className="form-col-span-full" label="Motivo (auditoría)">
                    <input type="text" className="form-input" required minLength={5} value={stageReason} onChange={(e) => setStageReason(e.target.value)} placeholder="Ej. Ajuste de dieta y duración por indicación veterinaria" />
                  </FormField>
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
              <div className="form-actions mb-3"><button type="button" className="btn btn-primary" onClick={() => { setLocationCode(''); setLocationName(''); setLocationType('galpon'); setLocationParent(''); setLocationBarnId(''); setLocationDate(farmToday()); setLocationReason(''); setLocationKey(newOperationKey('cfg-loc')); setLocationError(null); setLocationModal(true); }}><IconPlus size={14} /><span>Agregar ubicación</span></button></div>
              <DataCardList label="Ubicaciones físicas" grid className="mb-3">
                {data.locations.map((location) => (
                  <DataCard key={location.id}>
                    <DataCardHead
                      title={location.name}
                      subtitle={<span className="font-mono">{location.code}</span>}
                      badge={<StatusBadge>{LOCATION_TYPE_LABEL[location.locationType] ?? location.locationType}</StatusBadge>}
                    />
                    <DataCardMeta items={[
                      { label: 'Ubicación padre', value: location.parentCode ?? 'Sin padre' },
                      { label: 'Galpón vinculado', value: barns.find((barn) => barn.id === location.barnId)?.name ?? 'Sin vínculo' },
                      { label: 'Vigente desde', value: location.effectiveFrom },
                    ]} />
                    <DataCardActions>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                        setLocationCode(location.code); setLocationName(location.name); setLocationType(location.locationType);
                        setLocationParent(location.parentCode ?? ''); setLocationBarnId(location.barnId === null ? '' : String(location.barnId));
                        setLocationDate(farmToday()); setLocationReason(''); setLocationKey(newOperationKey('cfg-loc')); setLocationError(null);
                        setLocationModal(true);
                      }}><IconEdit size={14} /><span>Editar</span></button>
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
                    </DataCardActions>
                  </DataCard>
                ))}
              </DataCardList>

              {locationModal && <ModalDialog labelledBy="config-location-title" onDismiss={() => setLocationModal(false)} dismissDisabled={locationSaving}>
              <h3 id="config-location-title" className="text-lg font-bold mb-3">Ubicación física</h3>
              {locationError && (
                <InlineAlert tone="error" onDismiss={() => setLocationError(null)}>{locationError}</InlineAlert>
              )}
              <form onSubmit={handleSaveLocation} className="mb-4">
                <div className="form-grid mb-2">
                  <FormField label="Código" htmlFor="config-location-code">
                    <input id="config-location-code" type="text" className="form-input" required value={locationCode} onChange={(e) => setLocationCode(e.target.value)} placeholder="Ej. galpon_c" />
                  </FormField>
                  <FormField label="Nombre" htmlFor="config-location-name">
                    <input id="config-location-name" type="text" className="form-input" required value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Ej. Galpón C" />
                  </FormField>
                  <FormField label="Tipo" htmlFor="config-location-type">
                    <select id="config-location-type" className="form-select" value={locationType} onChange={(e) => {
                      setLocationType(e.target.value);
                      if (e.target.value === 'galpon') setLocationParent('');
                    }}>
                      <option value="galpon">Galpón</option>
                      <option value="corral">Corral</option>
                      <option value="area">Área</option>
                      <option value="otro">Otro</option>
                    </select>
                  </FormField>
                  <FormField label={<>Ubicación padre{locationType === 'corral' ? '' : ' (opcional)'}</>} htmlFor="location-parent">
                    <select id="location-parent" className="form-select" required={locationType === 'corral'} disabled={locationType === 'galpon'} value={locationParent} onChange={(e) => setLocationParent(e.target.value)}>
                      <option value="">Sin padre (ubicación raíz)</option>
                      {validLocationParents.map((location) => <option key={location.code} value={location.code}>{location.name} · {location.code}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Galpón vinculado" htmlFor="location-barn">
                    {locationParent ? (
                      <p className="text-sm">{barns.find((barn) => barn.id === locationChoices.find((location) => location.code === locationParent)?.barnId)?.name ?? 'Seleccione un padre vigente'} · heredado del padre</p>
                    ) : (
                      <select id="location-barn" className="form-select" required value={locationBarnId} onChange={(e) => setLocationBarnId(e.target.value)}>
                        <option value="">Seleccione un galpón</option>
                        {barns.filter((barn) => barn.status !== 'inactivo').map((barn) => <option key={barn.id} value={barn.id}>{barn.name}</option>)}
                      </select>
                    )}
                  </FormField>
                  <FormField label="Vigente desde" htmlFor="config-location-date">
                    <input id="config-location-date" type="date" className="form-input" required value={locationDate} onChange={(e) => setLocationDate(e.target.value)} />
                  </FormField>
                  <FormField label="Motivo (auditoría)" htmlFor="config-location-reason">
                    <input id="config-location-reason" type="text" className="form-input" value={locationReason} onChange={(e) => setLocationReason(e.target.value)} placeholder="Ej. Nueva área habilitada" />
                  </FormField>
                </div>
                <div className="form-actions form-actions-sticky">
                <button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" disabled={locationSaving} onClick={() => setLocationModal(false)}><IconX size={14} /><span>Cancelar</span></button>
                <button type="submit" className="btn btn-primary" disabled={locationSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{locationSaving ? 'Guardando…' : 'Guardar Ubicación'}</span>
                  </span>
                </button>
                </div>
              </form>
              </ModalDialog>}

              <h5 className="font-bold mb-2">Lotes de manejo</h5>
              <div className="form-actions mb-3"><button type="button" className="btn btn-primary" onClick={() => { setLotCode(''); setLotName(''); setLotStage(''); setLotDate(farmToday()); setLotReason(''); setLotKey(newOperationKey('cfg-lot')); setLotError(null); setLotModal(true); }}><IconPlus size={14} /><span>Agregar lote</span></button></div>
              <DataCardList label="Lotes de manejo" grid className="mb-3">
                {data.lots.map((lot) => (
                  <DataCard key={lot.id}>
                    <DataCardHead
                      title={lot.name}
                      subtitle={<span className="font-mono">{lot.code}</span>}
                    />
                    <DataCardMeta items={[
                      { label: 'Etapa', value: lot.stageCode ?? 'Sin etapa' },
                      { label: 'Vigente desde', value: lot.effectiveFrom },
                    ]} />
                    <DataCardActions>
                      <button type="button" className="btn btn-outline" onClick={() => { setLotCode(lot.code); setLotName(lot.name); setLotStage(lot.stageCode ?? ''); setLotDate(farmToday()); setLotReason(''); setLotKey(newOperationKey('cfg-lot')); setLotError(null); setLotModal(true); }}><IconEdit size={14} /><span>Editar</span></button>
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
                    </DataCardActions>
                  </DataCard>
                ))}
              </DataCardList>

              {lotModal && <ModalDialog labelledBy="config-lot-title" onDismiss={() => setLotModal(false)} dismissDisabled={lotSaving}>
              <h3 id="config-lot-title" className="text-lg font-bold mb-3">Lote de manejo</h3>
              {lotError && (
                <InlineAlert tone="error" onDismiss={() => setLotError(null)}>{lotError}</InlineAlert>
              )}
              <form onSubmit={handleSaveLot}>
                <div className="form-grid mb-2">
                  <FormField label="Código" htmlFor="config-lot-code">
                    <input id="config-lot-code" type="text" className="form-input" required value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="Ej. lote_levante_b" />
                  </FormField>
                  <FormField label="Nombre" htmlFor="config-lot-name">
                    <input id="config-lot-name" type="text" className="form-input" required value={lotName} onChange={(e) => setLotName(e.target.value)} placeholder="Ej. Lote Levante B" />
                  </FormField>
                  <FormField label="Etapa asociada (opcional)" htmlFor="config-lot-stage">
                    <select id="config-lot-stage" className="form-select" value={lotStage} onChange={(e) => setLotStage(e.target.value)}>
                      <option value="">Sin etapa</option>
                      {data.stages.map((stage) => (
                        <option key={stage.code} value={stage.code}>{stage.name}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Vigente desde" htmlFor="config-lot-date">
                    <input id="config-lot-date" type="date" className="form-input" required value={lotDate} onChange={(e) => setLotDate(e.target.value)} />
                  </FormField>
                  <FormField label="Motivo (auditoría)" htmlFor="config-lot-reason">
                    <input id="config-lot-reason" type="text" className="form-input" value={lotReason} onChange={(e) => setLotReason(e.target.value)} placeholder="Ej. Nuevo lote de manejo" />
                  </FormField>
                </div>
                <div className="form-actions form-actions-sticky">
                <button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" disabled={lotSaving} onClick={() => setLotModal(false)}><IconX size={14} /><span>Cancelar</span></button>
                <button type="submit" className="btn btn-primary" disabled={lotSaving}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconPlus size={16} />
                    <span>{lotSaving ? 'Guardando…' : 'Guardar Lote'}</span>
                  </span>
                </button>
                </div>
              </form>
              </ModalDialog>}
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
            <InlineAlert tone="error" onDismiss={() => setRetireError(null)}>{retireError}</InlineAlert>
          )}
          <form onSubmit={submitRetire}>
            <FormField className="mb-2" labelClassName="text-sm" label="Vigente hasta (nueva fecha efectiva):" htmlFor="config-retire-date">
              <input id="config-retire-date" type="date" className="form-input" required value={retireDate} onChange={(e) => setRetireDate(e.target.value)} />
            </FormField>
            <FormField className="mb-3" labelClassName="text-sm" label="Motivo del retiro:" htmlFor="config-retire-reason">
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
            </FormField>
            <div className="form-actions form-actions-sticky mt-4">
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
              <DataState variant="loading" title="Cargando historial…" />
            ) : historyError ? (
              <InlineAlert tone="error" onDismiss={() => setHistoryError(null)}>{historyError}</InlineAlert>
            ) : !historyRows || historyRows.length === 0 ? (
              <DataState variant="empty" title="No hay versiones registradas." />
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
