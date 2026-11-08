import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFilter,
  IconList,
  IconPig,
  IconPlus,
  IconRefreshCw,
  IconScale,
  IconSearch,
  IconTrash,
} from './icons';
import { farmToday, newOperationKey } from '../utils/operations';
import type { Perfil } from '../types';

type AnimalType = 'cerda' | 'verraco' | 'lechon' | 'reemplazo';
type Sex = 'macho' | 'hembra' | 'pendiente';
type OriginType = 'nacimiento' | 'compra' | 'interna' | 'inicial';

interface Animal {
  id: number;
  code: string;
  currentTag: string;
  alias: string | null;
  animalType: AnimalType;
  animalTypeLabel: string;
  sex: Sex;
  sexLabel: string;
  breed: string | null;
  status: string;
  statusLabel: string;
  isActive: boolean;
  birthDate: string | null;
  ageDays: number | null;
  ageLabel: string | null;
  currentWeightKg: number | null;
  currentWeightDate: string | null;
  birthWeightKg: number | null;
  weaningDate: string | null;
  weaningWeightKg: number | null;
  aptitude: string | null;
  barnId: number;
  barnCode: string;
  barnName: string;
  stageCode: string;
  stageName: string;
  locationCode: string | null;
  locationName: string | null;
  lotCode: string | null;
  lotName: string | null;
  entryDate: string;
  exitDate: string | null;
  exitType: string | null;
}

interface TagHistoryItem {
  id: number;
  tag: string;
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
}

interface TypeHistoryItem {
  id: number;
  animalType: AnimalType;
  animalTypeLabel: string;
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
  reason: string | null;
}

interface WeightItem {
  id: number;
  weighedOn: string;
  weightKg: number;
  stageCode: string | null;
  note: string | null;
}

interface ParentSummary {
  id: number | null;
  code: string | null;
  alias: string | null;
  external: string | null;
}

interface ChronologyItem {
  date: string;
  kind: 'alta' | 'pesaje' | 'arete' | 'tipo' | 'inventario';
  title: string;
  detail: string;
  id: number | null;
}

interface AnimalDetail extends Animal {
  observations: string | null;
  originType: OriginType;
  originLabel: string;
  originDetail: string | null;
  entryStageCode: string;
  mother: ParentSummary | null;
  father: ParentSummary | null;
  tags: TagHistoryItem[];
  typeHistory: TypeHistoryItem[];
  weights: WeightItem[];
  chronology: ChronologyItem[];
  ageReference: string;
}

interface AnimalOptions {
  barns: { id: number; code: string; name: string }[];
  stages: { code: string; name: string }[];
  locations: { code: string; name: string; locationType: string }[];
  lots: { code: string; name: string }[];
  aptitudes: { code: string; name: string }[];
  types: { code: string; name: string }[];
  sexes: { code: string; name: string }[];
  statuses: { code: string; name: string }[];
  origins: { code: string; name: string }[];
}

interface ListPayload {
  animals: Animal[];
  total: number;
  options: AnimalOptions;
}

interface Filters {
  q: string;
  type: string;
  sex: string;
  status: string;
  stage: string;
  barnId: string;
  location: string;
  lot: string;
  active: string;
}

interface AnimalForm {
  code: string;
  alias: string;
  animalType: AnimalType;
  sex: Sex;
  breed: string;
  birthDate: string;
  birthWeightKg: string;
  weaningDate: string;
  weaningWeightKg: string;
  aptitude: string;
  originType: OriginType;
  originDetail: string;
  entryDate: string;
  entryStageCode: string;
  barnId: string;
  locationCode: string;
  lotCode: string;
  motherId: string;
  fatherId: string;
  motherExternal: string;
  fatherExternal: string;
  observations: string;
  reason: string;
}

type Section = 'padron' | 'alta' | 'ficha';

const STATUS_BADGE: Record<string, string> = {
  activo: 'badge-status badge-success',
  vendido: 'badge-status badge-warning',
  descartado: 'badge-status badge-warning',
  muerto: 'badge-status badge-danger',
};

const ORIGIN_HINTS: Record<OriginType, string> = {
  nacimiento: 'El lechón nace en la granja: suma una cabeza al inventario.',
  compra: 'El animal llega de fuera: suma una cabeza al inventario.',
  inicial: 'Existencia que ya estaba al empezar: suma una cabeza al inventario.',
  interna: 'Ya estaba en un grupo sin arete: identifica la ficha sin sumar cabezas.',
};

function emptyForm(): AnimalForm {
  return {
    code: '',
    alias: '',
    animalType: 'lechon',
    sex: 'pendiente',
    breed: '',
    birthDate: '',
    birthWeightKg: '',
    weaningDate: '',
    weaningWeightKg: '',
    aptitude: '',
    originType: 'nacimiento',
    originDetail: '',
    entryDate: farmToday(),
    entryStageCode: '',
    barnId: '',
    locationCode: '',
    lotCode: '',
    motherId: '',
    fatherId: '',
    motherExternal: '',
    fatherExternal: '',
    observations: '',
    reason: '',
  };
}

function formatWeight(value: number | null): string {
  if (value === null || value === undefined) return 'Sin dato';
  return `${value} kg`;
}

function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="kpi-card">
      <span className="kpi-label inline-flex items-center justify-center gap-2 leading-none">
        {icon}
        <span>{label}</span>
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-detail">{detail}</span>
    </div>
  );
}

export function ModuloAnimales({ perfil, initialAnimalKey }: { perfil: Perfil; initialAnimalKey?: string }) {
  const soloLectura = perfil === 'veterinario';
  const [section, setSection] = useState<Section>('padron');
  const [data, setData] = useState<ListPayload | null>(null);
  const [parentOptions, setParentOptions] = useState<Animal[]>([]);
  const [detail, setDetail] = useState<AnimalDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    q: '',
    type: '',
    sex: '',
    status: '',
    stage: '',
    barnId: '',
    location: '',
    lot: '',
    active: '',
  });
  const [form, setForm] = useState<AnimalForm>(emptyForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [operationKey, setOperationKey] = useState<string>(() => newOperationKey('ani'));
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tagForm, setTagForm] = useState({ tag: '', effectiveDate: farmToday(), reason: '' });
  const [tagError, setTagError] = useState<string | null>(null);
  const [toggleReason, setToggleReason] = useState<string>('');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.sex) params.set('sex', filters.sex);
    if (filters.status) params.set('status', filters.status);
    if (filters.stage) params.set('stage', filters.stage);
    if (filters.barnId) params.set('barnId', filters.barnId);
    if (filters.location) params.set('location', filters.location);
    if (filters.lot) params.set('lot', filters.lot);
    if (filters.active) params.set('active', filters.active);
    const text = params.toString();
    return text ? `?${text}` : '';
  }, [filters]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/animals${queryString}`);
      const body = await res.json() as { ok?: boolean; error?: string } & ListPayload;
      if (!res.ok) {
        setError(body.error ?? 'No se pudo cargar el padrón de animales');
        setData(null);
        return;
      }
      setData(body);
      setForm((prev) => ({
        ...prev,
        barnId: prev.barnId || (body.options.barns[0] ? String(body.options.barns[0].id) : ''),
        entryStageCode: prev.entryStageCode || (body.options.stages[0] ? body.options.stages[0].code : ''),
      }));
    } catch {
      setError('No se pudo conectar con el servidor. Reintente cuando vuelva la conexión.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadList();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  useEffect(() => {
    const loadParents = async () => {
      try {
        const res = await fetch('/api/animals?limit=500');
        if (!res.ok) return;
        const body = await res.json() as ListPayload;
        setParentOptions(body.animals);
      } catch {
        // La ficha sigue funcionando sin sugerencias de progenitores.
      }
    };
    void loadParents();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const options = data?.options;

  const motherCandidates = useMemo(
    () => parentOptions.filter((animal) => animal.sex === 'hembra'),
    [parentOptions],
  );
  const fatherCandidates = useMemo(
    () => parentOptions.filter((animal) => animal.sex === 'macho'),
    [parentOptions],
  );

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const setField = <K extends keyof AnimalForm>(key: K, value: AnimalForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openDetail = useCallback(async (key: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(key)}`);
      const body = await res.json() as { ok?: boolean; error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) {
        setError(body.error ?? 'No se pudo cargar la ficha del animal');
        return;
      }
      setDetail(body.animal);
      setTagForm({ tag: '', effectiveDate: farmToday(), reason: '' });
      setTagError(null);
      setToggleReason('');
      setToggleError(null);
      setSection('ficha');
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!initialAnimalKey) return;
    let cancelled = false;
    const loadInitialDetail = async () => {
      try {
        const res = await fetch(`/api/animals/${encodeURIComponent(initialAnimalKey)}`);
        const body = await res.json() as { ok?: boolean; error?: string; animal?: AnimalDetail };
        if (cancelled) return;
        if (!res.ok || !body.animal) {
          setError(body.error ?? 'No se pudo cargar la ficha del animal');
          return;
        }
        setDetail(body.animal);
        setSection('ficha');
      } catch {
        if (!cancelled) setError('No se pudo conectar con el servidor.');
      }
    };
    void loadInitialDetail();
    return () => {
      cancelled = true;
    };
  }, [initialAnimalKey, openDetail]);

  const startCreate = () => {
    setEditingCode(null);
    setForm((prev) => ({
      ...emptyForm(),
      barnId: prev.barnId,
      entryStageCode: prev.entryStageCode,
    }));
    setOperationKey(newOperationKey('ani'));
    setFormError(null);
    setSection('alta');
  };

  const startEdit = () => {
    if (!detail) return;
    setEditingCode(detail.code);
    setForm({
      code: detail.code,
      alias: detail.alias ?? '',
      animalType: detail.animalType,
      sex: detail.sex,
      breed: detail.breed ?? '',
      birthDate: detail.birthDate ?? '',
      birthWeightKg: detail.birthWeightKg !== null ? String(detail.birthWeightKg) : '',
      weaningDate: detail.weaningDate ?? '',
      weaningWeightKg: detail.weaningWeightKg !== null ? String(detail.weaningWeightKg) : '',
      aptitude: detail.aptitude ?? '',
      originType: detail.originType,
      originDetail: detail.originDetail ?? '',
      entryDate: detail.entryDate,
      entryStageCode: detail.entryStageCode,
      barnId: String(detail.barnId),
      locationCode: detail.locationCode ?? '',
      lotCode: detail.lotCode ?? '',
      motherId: detail.mother?.id ? String(detail.mother.id) : '',
      fatherId: detail.father?.id ? String(detail.father.id) : '',
      motherExternal: detail.mother?.external ?? '',
      fatherExternal: detail.father?.external ?? '',
      observations: detail.observations ?? '',
      reason: '',
    });
    setOperationKey(newOperationKey('ani'));
    setFormError(null);
    setSection('alta');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (soloLectura) return;
    setFormError(null);
    setSuccess(null);

    if (!editingCode) {
      if (!form.code.trim()) {
        setFormError('Indique el código o arete del animal.');
        return;
      }
      if (!form.barnId) {
        setFormError('Seleccione un galpón.');
        return;
      }
      if (!form.entryStageCode) {
        setFormError('Seleccione la etapa de ingreso.');
        return;
      }
    }
    if (!form.reason.trim()) {
      setFormError('Escriba el motivo del alta o de la corrección.');
      return;
    }
    if (form.motherId && form.motherExternal.trim()) {
      setFormError('Indique la madre interna o externa, no ambas.');
      return;
    }
    if (form.fatherId && form.fatherExternal.trim()) {
      setFormError('Indique el padre interno o externo, no ambos.');
      return;
    }

    const shared = {
      alias: form.alias.trim() || null,
      animalType: form.animalType,
      sex: form.sex,
      breed: form.breed.trim() || null,
      birthDate: form.birthDate || null,
      birthWeightKg: form.birthWeightKg.trim() ? Number(form.birthWeightKg) : null,
      weaningDate: form.weaningDate || null,
      weaningWeightKg: form.weaningWeightKg.trim() ? Number(form.weaningWeightKg) : null,
      aptitude: form.aptitude || null,
      motherId: form.motherId ? Number(form.motherId) : null,
      fatherId: form.fatherId ? Number(form.fatherId) : null,
      motherExternal: form.motherId ? null : (form.motherExternal.trim() || null),
      fatherExternal: form.fatherId ? null : (form.fatherExternal.trim() || null),
      observations: form.observations.trim() || null,
      reason: form.reason.trim(),
      operationKey,
    };

    const payload = editingCode
      ? shared
      : {
        ...shared,
        code: form.code.trim(),
        originType: form.originType,
        originDetail: form.originDetail.trim() || null,
        entryDate: form.entryDate,
        entryStageCode: form.entryStageCode,
        barnId: Number(form.barnId),
        locationCode: form.locationCode || null,
        lotCode: form.lotCode || null,
      };

    setSaving(true);
    try {
      const res = await fetch(
        editingCode ? `/api/animals/${encodeURIComponent(editingCode)}` : '/api/animals',
        {
          method: editingCode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json() as {
        error?: string;
        replayed?: boolean;
        animal?: AnimalDetail;
      };
      if (!res.ok || !body.animal) {
        setFormError(body.error ?? 'No se pudo guardar la ficha.');
        return;
      }

      setDetail(body.animal);
      setSuccess(body.replayed
        ? `Reintento confirmado: la ficha ${body.animal.code} ya estaba guardada y no se duplicó.`
        : editingCode
          ? `Ficha ${body.animal.code} actualizada.`
          : `Animal ${body.animal.code} registrado con su ficha individual.`);
      setOperationKey(newOperationKey('ani'));
      setEditingCode(null);
      setForm((prev) => ({
        ...emptyForm(),
        barnId: prev.barnId,
        entryStageCode: prev.entryStageCode,
      }));
      await loadList();
      setSection('ficha');
    } catch {
      setFormError('No se pudo confirmar el guardado. Reintente con el mismo formulario.');
    } finally {
      setSaving(false);
    }
  };

  const handleTagChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setTagError(null);
    setSuccess(null);
    if (!tagForm.tag.trim() || !tagForm.reason.trim()) {
      setTagError('Indique el nuevo arete y el motivo del cambio.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: tagForm.tag.trim(),
          effectiveDate: tagForm.effectiveDate,
          reason: tagForm.reason.trim(),
          operationKey: newOperationKey('ani-arete'),
        }),
      });
      const body = await res.json() as { error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) {
        setTagError(body.error ?? 'No se pudo cambiar el arete.');
        return;
      }
      setDetail(body.animal);
      setTagForm({ tag: '', effectiveDate: farmToday(), reason: '' });
      setSuccess(`Arete actualizado a ${body.animal.currentTag}. El anterior se conserva con su fecha.`);
      await loadList();
    } catch {
      setTagError('No se pudo conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (active: boolean) => {
    if (!detail) return;
    setToggleError(null);
    setSuccess(null);
    if (!toggleReason.trim()) {
      setToggleError('Escriba el motivo para cambiar la disponibilidad de la ficha.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/animals/${encodeURIComponent(detail.code)}/${active ? 'reactivate' : 'deactivate'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: toggleReason.trim(),
            operationKey: newOperationKey(active ? 'ani-reactivar' : 'ani-baja'),
          }),
        },
      );
      const body = await res.json() as { error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) {
        setToggleError(body.error ?? 'No se pudo actualizar la disponibilidad.');
        return;
      }
      setDetail(body.animal);
      setToggleReason('');
      setSuccess(active
        ? `La ficha ${body.animal.code} vuelve al padrón de selección.`
        : `La ficha ${body.animal.code} quedó inactiva sin registrar venta ni muerte.`);
      await loadList();
    } catch {
      setToggleError('No se pudo conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  };

  const animals = data?.animals ?? [];
  const total = data?.total ?? 0;
  const inactivas = animals.filter((animal) => !animal.isActive).length;
  const conPeso = animals.filter((animal) => animal.currentWeightKg !== null).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-lg inline-flex items-center justify-center gap-2 leading-none">
            <IconPig size={20} className="text-primary" />
            <span>Animales</span>
          </h3>
          <p className="text-xs text-muted mt-1">
            Padrón individual con identificación permanente, aretes históricos, genealogía, pesos y cronología (ANI-01 a ANI-08).
          </p>
        </div>
        <div className="inline-flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void loadList()}
            disabled={loading}
            title="Recargar padrón"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar</span>
            </span>
          </button>
          {!soloLectura && (
            <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconPlus size={14} />
                <span>Nuevo animal</span>
              </span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-4" role="alert">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={16} />
            <span>{error}</span>
          </span>
        </div>
      )}

      {success && (
        <div className="alert alert-success mb-4" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={16} />
            <span>{success}</span>
          </span>
        </div>
      )}

      {soloLectura && (
        <div className="alert alert-warning mb-4" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconEye size={16} />
            <span>El perfil Veterinario puede consultar fichas y cronología, pero no modificarlas.</span>
          </span>
        </div>
      )}

      <div className="admin-tabs mb-4">
        <button
          type="button"
          className={`btn btn-sm ${section === 'padron' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setSection('padron')}
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconList size={14} />
            <span>Padrón</span>
          </span>
        </button>
        {!soloLectura && (
          <button
            type="button"
            className={`btn btn-sm ${section === 'alta' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => (editingCode ? setSection('alta') : startCreate())}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              {editingCode ? <IconEdit size={14} /> : <IconPlus size={14} />}
              <span>{editingCode ? 'Editar ficha' : 'Alta de animal'}</span>
            </span>
          </button>
        )}
        {detail && (
          <button
            type="button"
            className={`btn btn-sm ${section === 'ficha' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection('ficha')}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconClipboard size={14} />
              <span>Ficha {detail.code}</span>
            </span>
          </button>
        )}
      </div>

      {loading && !data && (
        <div className="card text-sm text-muted">Cargando padrón…</div>
      )}

      {data && section === 'padron' && (
        <div className="section-block">
          <div className="grid-3">
            <Metric
              label="Animales en el padrón"
              value={String(total)}
              detail={total === animals.length ? 'Todos visibles' : `Mostrando ${animals.length}`}
              icon={<IconPig size={14} />}
            />
            <Metric
              label="Fichas inactivas"
              value={String(inactivas)}
              detail="No intervienen en selecciones nuevas"
              icon={<IconEyeOff size={14} />}
            />
            <Metric
              label="Con peso actual"
              value={String(conPeso)}
              detail="Último pesaje válido por fecha"
              icon={<IconScale size={14} />}
            />
          </div>

          <div className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <span className="section-title">Buscar y filtrar</span>
              <span className="text-xs text-muted">
                Búsqueda por código, alias o arete
              </span>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="ani-q">Buscar</label>
                <input
                  id="ani-q"
                  type="search"
                  className="form-input"
                  value={filters.q}
                  onChange={(event) => setFilter('q', event.target.value)}
                  placeholder="Ej. 002 o A-2002"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-type">Tipo</label>
                <select
                  id="ani-type"
                  className="form-select"
                  value={filters.type}
                  onChange={(event) => setFilter('type', event.target.value)}
                >
                  <option value="">Todos</option>
                  {(options?.types ?? []).map((type) => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-sex">Sexo</label>
                <select
                  id="ani-sex"
                  className="form-select"
                  value={filters.sex}
                  onChange={(event) => setFilter('sex', event.target.value)}
                >
                  <option value="">Todos</option>
                  {(options?.sexes ?? []).map((sex) => (
                    <option key={sex.code} value={sex.code}>{sex.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-status">Estado productivo</label>
                <select
                  id="ani-status"
                  className="form-select"
                  value={filters.status}
                  onChange={(event) => setFilter('status', event.target.value)}
                >
                  <option value="">Todos</option>
                  {(options?.statuses ?? []).map((status) => (
                    <option key={status.code} value={status.code}>{status.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-stage">Etapa</label>
                <select
                  id="ani-stage"
                  className="form-select"
                  value={filters.stage}
                  onChange={(event) => setFilter('stage', event.target.value)}
                >
                  <option value="">Todas</option>
                  {(options?.stages ?? []).map((stage) => (
                    <option key={stage.code} value={stage.code}>{stage.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-barn">Galpón</label>
                <select
                  id="ani-barn"
                  className="form-select"
                  value={filters.barnId}
                  onChange={(event) => setFilter('barnId', event.target.value)}
                >
                  <option value="">Todos</option>
                  {(options?.barns ?? []).map((barn) => (
                    <option key={barn.id} value={barn.id}>{barn.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-location">Ubicación</label>
                <select
                  id="ani-location"
                  className="form-select"
                  value={filters.location}
                  onChange={(event) => setFilter('location', event.target.value)}
                >
                  <option value="">Todas</option>
                  {(options?.locations ?? []).map((location) => (
                    <option key={location.code} value={location.code}>{location.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-lot">Lote</label>
                <select
                  id="ani-lot"
                  className="form-select"
                  value={filters.lot}
                  onChange={(event) => setFilter('lot', event.target.value)}
                >
                  <option value="">Todos</option>
                  {(options?.lots ?? []).map((lot) => (
                    <option key={lot.code} value={lot.code}>{lot.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-active">Disponibilidad</label>
                <select
                  id="ani-active"
                  className="form-select"
                  value={filters.active}
                  onChange={(event) => setFilter('active', event.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="1">Solo activas</option>
                  <option value="0">Solo inactivas</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                <IconFilter size={16} className="text-primary" />
                <span>Padrón de animales</span>
              </span>
              <span className="text-xs text-muted">{total} ficha{total === 1 ? '' : 's'}</span>
            </div>

            {animals.length === 0 ? (
              <div className="empty-state-card">
                <div className="empty-icon-wrap">
                  <IconSearch size={26} className="text-primary" />
                </div>
                <p className="font-semibold">Sin animales para los filtros seleccionados</p>
                <p className="text-sm text-muted">
                  Ajuste la búsqueda o registre el primer animal con su código permanente.
                </p>
                {!soloLectura && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Registrar animal</span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Arete vigente</th>
                      <th>Tipo</th>
                      <th>Sexo</th>
                      <th>Edad</th>
                      <th>Peso actual</th>
                      <th>Galpón</th>
                      <th>Etapa</th>
                      <th>Ubicación / lote</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.map((animal) => (
                      <tr key={animal.id}>
                        <td className="font-semibold">
                          {animal.code}
                          {animal.alias ? <span className="text-xs text-muted"> · {animal.alias}</span> : null}
                        </td>
                        <td>{animal.currentTag}</td>
                        <td>{animal.animalTypeLabel}</td>
                        <td>{animal.sexLabel}</td>
                        <td>{animal.ageLabel ?? <span className="text-muted">Sin dato</span>}</td>
                        <td>{formatWeight(animal.currentWeightKg)}</td>
                        <td>{animal.barnName}</td>
                        <td>{animal.stageName}</td>
                        <td>
                          {animal.locationName ?? 'Sin ubicación'}
                          {animal.lotName ? ` · ${animal.lotName}` : ''}
                        </td>
                        <td>
                          <span className={STATUS_BADGE[animal.status] ?? 'badge-tag'}>
                            {animal.isActive ? animal.statusLabel : 'Inactiva'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => void openDetail(animal.code)}
                            disabled={loadingDetail}
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconEye size={14} />
                              <span>Ver ficha</span>
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'alta' && !soloLectura && (
        <div className="card">
          <div className="card-header-clean mb-2">
            <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
              {editingCode ? <IconEdit size={16} className="text-primary" /> : <IconPlus size={16} className="text-primary" />}
              <span>{editingCode ? `Editar ficha ${editingCode}` : 'Alta de animal'}</span>
            </span>
            <span className="text-xs text-muted">
              {editingCode
                ? 'El código y la ubicación física no cambian desde esta pantalla'
                : 'El código es permanente y conserva sus ceros iniciales'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
            {formError && (
              <div className="alert alert-error" role="alert">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertCircle size={16} />
                  <span>{formError}</span>
                </span>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="ani-code">Código permanente</label>
                <input
                  id="ani-code"
                  type="text"
                  className="form-input"
                  value={form.code}
                  onChange={(event) => setField('code', event.target.value)}
                  placeholder="Ej. 002"
                  disabled={editingCode !== null}
                  required
                />
                <p className="form-helper">Se conserva tal cual, incluidos los ceros a la izquierda.</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-alias">Nombre o alias</label>
                <input
                  id="ani-alias"
                  type="text"
                  className="form-input"
                  value={form.alias}
                  onChange={(event) => setField('alias', event.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-form-type">Tipo</label>
                <select
                  id="ani-form-type"
                  className="form-select"
                  value={form.animalType}
                  onChange={(event) => setField('animalType', event.target.value as AnimalType)}
                >
                  {(options?.types ?? []).map((type) => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-form-sex">Sexo</label>
                <select
                  id="ani-form-sex"
                  className="form-select"
                  value={form.sex}
                  onChange={(event) => setField('sex', event.target.value as Sex)}
                >
                  {(options?.sexes ?? []).map((sex) => (
                    <option key={sex.code} value={sex.code}>{sex.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-breed">Raza</label>
                <input
                  id="ani-breed"
                  type="text"
                  className="form-input"
                  value={form.breed}
                  onChange={(event) => setField('breed', event.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-aptitude">Aptitud</label>
                <select
                  id="ani-aptitude"
                  className="form-select"
                  value={form.aptitude}
                  onChange={(event) => setField('aptitude', event.target.value)}
                >
                  <option value="">Sin definir</option>
                  {(options?.aptitudes ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-birth">Fecha de nacimiento</label>
                <input
                  id="ani-birth"
                  type="date"
                  className="form-input"
                  value={form.birthDate}
                  max={farmToday()}
                  onChange={(event) => setField('birthDate', event.target.value)}
                />
                <p className="form-helper">Déjela vacía si se desconoce.</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-birth-weight">Peso al nacer (kg)</label>
                <input
                  id="ani-birth-weight"
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={form.birthWeightKg}
                  onChange={(event) => setField('birthWeightKg', event.target.value)}
                  placeholder="Opcional"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-weaning">Fecha de destete</label>
                <input
                  id="ani-weaning"
                  type="date"
                  className="form-input"
                  value={form.weaningDate}
                  max={farmToday()}
                  onChange={(event) => setField('weaningDate', event.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-weaning-weight">Peso al destete (kg)</label>
                <input
                  id="ani-weaning-weight"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  value={form.weaningWeightKg}
                  onChange={(event) => setField('weaningWeightKg', event.target.value)}
                  placeholder="Requiere la fecha de destete"
                />
              </div>

              {!editingCode && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-origin">Procedencia</label>
                    <select
                      id="ani-origin"
                      className="form-select"
                      value={form.originType}
                      onChange={(event) => setField('originType', event.target.value as OriginType)}
                    >
                      {(options?.origins ?? []).map((origin) => (
                        <option key={origin.code} value={origin.code}>{origin.name}</option>
                      ))}
                    </select>
                    <p className="form-helper">{ORIGIN_HINTS[form.originType]}</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-origin-detail">Detalle de procedencia</label>
                    <input
                      id="ani-origin-detail"
                      type="text"
                      className="form-input"
                      value={form.originDetail}
                      onChange={(event) => setField('originDetail', event.target.value)}
                      placeholder="Proveedor, granja de origen u observación"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-entry-date">Fecha de ingreso</label>
                    <input
                      id="ani-entry-date"
                      type="date"
                      className="form-input"
                      value={form.entryDate}
                      max={farmToday()}
                      onChange={(event) => setField('entryDate', event.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-barn">Galpón</label>
                    <select
                      id="ani-barn"
                      className="form-select"
                      value={form.barnId}
                      onChange={(event) => setField('barnId', event.target.value)}
                      required
                    >
                      <option value="">Seleccione un galpón</option>
                      {(options?.barns ?? []).map((barn) => (
                        <option key={barn.id} value={barn.id}>{barn.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-entry-stage">Etapa de ingreso</label>
                    <select
                      id="ani-entry-stage"
                      className="form-select"
                      value={form.entryStageCode}
                      onChange={(event) => setField('entryStageCode', event.target.value)}
                      required
                    >
                      <option value="">Seleccione una etapa</option>
                      {(options?.stages ?? []).map((stage) => (
                        <option key={stage.code} value={stage.code}>{stage.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-location">Ubicación</label>
                    <select
                      id="ani-location"
                      className="form-select"
                      value={form.locationCode}
                      onChange={(event) => setField('locationCode', event.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {(options?.locations ?? []).map((location) => (
                        <option key={location.code} value={location.code}>{location.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-lot">Lote</label>
                    <select
                      id="ani-lot"
                      className="form-select"
                      value={form.lotCode}
                      onChange={(event) => setField('lotCode', event.target.value)}
                    >
                      <option value="">Sin lote</option>
                      {(options?.lots ?? []).map((lot) => (
                        <option key={lot.code} value={lot.code}>{lot.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="ani-mother">Madre interna</label>
                <select
                  id="ani-mother"
                  className="form-select"
                  value={form.motherId}
                  onChange={(event) => setField('motherId', event.target.value)}
                >
                  <option value="">Desconocida o externa</option>
                  {motherCandidates.map((animal) => (
                    <option key={animal.id} value={animal.id}>{animal.code}</option>
                  ))}
                  {form.motherId && !motherCandidates.some((animal) => String(animal.id) === form.motherId) && (
                    <option value={form.motherId}>Animal #{form.motherId}</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-mother-external">Madre externa</label>
                <input
                  id="ani-mother-external"
                  type="text"
                  className="form-input"
                  value={form.motherExternal}
                  onChange={(event) => setField('motherExternal', event.target.value)}
                  placeholder="Identificación fuera de la granja"
                  disabled={form.motherId !== ''}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-father">Padre interno</label>
                <select
                  id="ani-father"
                  className="form-select"
                  value={form.fatherId}
                  onChange={(event) => setField('fatherId', event.target.value)}
                >
                  <option value="">Desconocido o externo</option>
                  {fatherCandidates.map((animal) => (
                    <option key={animal.id} value={animal.id}>{animal.code}</option>
                  ))}
                  {form.fatherId && !fatherCandidates.some((animal) => String(animal.id) === form.fatherId) && (
                    <option value={form.fatherId}>Animal #{form.fatherId}</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-father-external">Padre externo</label>
                <input
                  id="ani-father-external"
                  type="text"
                  className="form-input"
                  value={form.fatherExternal}
                  onChange={(event) => setField('fatherExternal', event.target.value)}
                  placeholder="Identificación fuera de la granja"
                  disabled={form.fatherId !== ''}
                />
              </div>

              <div className="form-group form-col-span-full">
                <label className="form-label" htmlFor="ani-observations">Observaciones</label>
                <textarea
                  id="ani-observations"
                  className="form-textarea"
                  rows={2}
                  value={form.observations}
                  onChange={(event) => setField('observations', event.target.value)}
                  placeholder="Detalle opcional de la ficha"
                />
              </div>

              <div className="form-group form-col-span-full">
                <label className="form-label" htmlFor="ani-reason">Motivo</label>
                <input
                  id="ani-reason"
                  type="text"
                  className="form-input"
                  value={form.reason}
                  onChange={(event) => setField('reason', event.target.value)}
                  placeholder={editingCode ? 'Ej. Corrección del peso al nacer' : 'Ej. Alta de lechón nacido el 5 de enero'}
                  required
                />
                <p className="form-helper">Queda en la auditoría con su usuario y la fecha efectiva.</p>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{saving ? 'Guardando…' : editingCode ? 'Guardar cambios' : 'Registrar animal'}</span>
                </span>
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (editingCode && detail) {
                    setSection('ficha');
                    return;
                  }
                  setForm(emptyForm());
                  setOperationKey(newOperationKey('ani'));
                  setFormError(null);
                }}
                disabled={saving}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconArrowLeft size={14} />
                  <span>{editingCode ? 'Volver a la ficha' : 'Limpiar'}</span>
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {section === 'ficha' && detail && (
        <div className="section-block">
          <div className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                <IconPig size={18} className="text-primary" />
                <span>Ficha {detail.code}</span>
                {detail.alias ? <span className="text-sm text-muted">({detail.alias})</span> : null}
              </span>
              <span className={detail.isActive ? 'badge-status badge-success' : 'badge-status badge-warning'}>
                {detail.isActive ? 'Disponible' : 'Inactiva'}
              </span>
            </div>

            <div className="grid-3">
              <Metric
                label="Edad"
                value={detail.ageLabel ?? 'Sin dato'}
                detail={detail.birthDate ? `Nacimiento ${detail.birthDate} · referencia ${detail.ageReference}` : 'Fecha de nacimiento desconocida'}
                icon={<IconCalendar size={14} />}
              />
              <Metric
                label="Peso actual"
                value={formatWeight(detail.currentWeightKg)}
                detail={detail.currentWeightDate ? `Último pesaje ${detail.currentWeightDate}` : 'Sin pesajes registrados'}
                icon={<IconScale size={14} />}
              />
              <Metric
                label="Estado"
                value={detail.statusLabel}
                detail={`${detail.barnName} · ${detail.stageName}`}
                icon={<IconClipboard size={14} />}
              />
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <tbody>
                  <tr>
                    <th>Arete vigente</th>
                    <td>{detail.currentTag}</td>
                    <th>Tipo</th>
                    <td>{detail.animalTypeLabel}</td>
                  </tr>
                  <tr>
                    <th>Sexo</th>
                    <td>{detail.sexLabel}</td>
                    <th>Raza</th>
                    <td>{detail.breed ?? 'Sin dato'}</td>
                  </tr>
                  <tr>
                    <th>Aptitud</th>
                    <td>{detail.aptitude ?? 'Sin definir'}</td>
                    <th>Procedencia</th>
                    <td>
                      {detail.originLabel}
                      {detail.originDetail ? ` · ${detail.originDetail}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <th>Ingreso</th>
                    <td>{detail.entryDate}</td>
                    <th>Etapa de ingreso</th>
                    <td>{detail.entryStageCode}</td>
                  </tr>
                  <tr>
                    <th>Ubicación</th>
                    <td>{detail.locationName ?? 'Sin asignar'}</td>
                    <th>Lote</th>
                    <td>{detail.lotName ?? 'Sin lote'}</td>
                  </tr>
                  <tr>
                    <th>Madre</th>
                    <td>{detail.mother ? (detail.mother.code ?? detail.mother.external ?? 'Sin dato') : 'Desconocida'}</td>
                    <th>Padre</th>
                    <td>{detail.father ? (detail.father.code ?? detail.father.external ?? 'Sin dato') : 'Desconocido'}</td>
                  </tr>
                  <tr>
                    <th>Peso al nacer</th>
                    <td>{formatWeight(detail.birthWeightKg)}</td>
                    <th>Peso al destete</th>
                    <td>{formatWeight(detail.weaningWeightKg)}</td>
                  </tr>
                  {detail.exitDate && (
                    <tr>
                      <th>Salida</th>
                      <td>{detail.exitDate}</td>
                      <th>Tipo de salida</th>
                      <td>{detail.exitType === 'sale' ? 'Venta' : detail.exitType === 'death' ? 'Muerte' : '—'}</td>
                    </tr>
                  )}
                  <tr>
                    <th>Observaciones</th>
                    <td colSpan={3}>{detail.observations ?? 'Sin observaciones'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {!soloLectura && (
              <div className="form-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={startEdit}>
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconEdit size={14} />
                    <span>Editar ficha</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header-clean mb-2">
              <span className="section-title">Cronología</span>
              <span className="text-xs text-muted">Altas, aretes, tipos, pesajes y movimientos de inventario</span>
            </div>
            {detail.chronology.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay eventos registrados.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Evento</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.chronology.map((item) => (
                      <tr key={`${item.kind}-${item.date}-${item.id ?? 'alta'}`}>
                        <td>{item.date}</td>
                        <td className="font-semibold">{item.title}</td>
                        <td>{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header-clean mb-2">
                <span className="section-title">Aretes históricos</span>
                <span className="text-xs text-muted">Se conserva el anterior con su fecha</span>
              </div>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Arete</th>
                      <th>Desde</th>
                      <th>Hasta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.tags.map((tag) => (
                      <tr key={tag.id}>
                        <td className="font-semibold">{tag.tag}</td>
                        <td>{tag.validFrom}</td>
                        <td>{tag.validTo ?? 'Vigente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header-clean mb-2">
                <span className="section-title">Pesajes</span>
                <span className="text-xs text-muted">El peso actual es el último por fecha</span>
              </div>
              {detail.weights.length === 0 ? (
                <p className="text-sm text-muted">Sin pesajes registrados.</p>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Peso</th>
                        <th>Nota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.weights.map((weight) => (
                        <tr key={weight.id}>
                          <td>{weight.weighedOn}</td>
                          <td className="font-semibold">{weight.weightKg} kg</td>
                          <td>{weight.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {!soloLectura && detail.exitDate === null && (
            <div className="grid-2">
              <div className="card">
                <div className="card-header-clean mb-2">
                  <span className="section-title">Cambiar arete</span>
                  <span className="text-xs text-muted">El número anterior queda con su fecha de vigencia</span>
                </div>
                <form onSubmit={handleTagChange} className="form-stack">
                  {tagError && (
                    <div className="alert alert-error" role="alert">
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconAlertCircle size={16} />
                        <span>{tagError}</span>
                      </span>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-new-tag">Nuevo arete</label>
                    <input
                      id="ani-new-tag"
                      type="text"
                      className="form-input"
                      value={tagForm.tag}
                      onChange={(event) => setTagForm((prev) => ({ ...prev, tag: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-tag-date">Fecha del cambio</label>
                    <input
                      id="ani-tag-date"
                      type="date"
                      className="form-input"
                      value={tagForm.effectiveDate}
                      max={farmToday()}
                      onChange={(event) => setTagForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-tag-reason">Motivo</label>
                    <input
                      id="ani-tag-reason"
                      type="text"
                      className="form-input"
                      value={tagForm.reason}
                      onChange={(event) => setTagForm((prev) => ({ ...prev, reason: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconCheck size={14} />
                        <span>{busy ? 'Guardando…' : 'Cambiar arete'}</span>
                      </span>
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <div className="card-header-clean mb-2">
                  <span className="section-title">Disponibilidad de la ficha</span>
                  <span className="text-xs text-muted">
                    No registra venta ni muerte; solo la retira de selecciones nuevas (ANI-08)
                  </span>
                </div>
                <div className="form-stack">
                  {toggleError && (
                    <div className="alert alert-error" role="alert">
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconAlertCircle size={16} />
                        <span>{toggleError}</span>
                      </span>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-toggle-reason">Motivo</label>
                    <input
                      id="ani-toggle-reason"
                      type="text"
                      className="form-input"
                      value={toggleReason}
                      onChange={(event) => setToggleReason(event.target.value)}
                      placeholder={detail.isActive ? 'Ej. Animal reservado para otra evaluación' : 'Ej. La ficha vuelve al padrón'}
                    />
                  </div>
                  <div className="form-actions">
                    {detail.isActive ? (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => void handleToggle(false)}
                        disabled={busy}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconTrash size={14} />
                          <span>Desactivar ficha</span>
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleToggle(true)}
                        disabled={busy}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconRefreshCw size={14} />
                          <span>Reactivar ficha</span>
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
