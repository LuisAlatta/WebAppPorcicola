import { AnimalPicker } from './AnimalPicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconClipboard,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconFilter,
  IconPig,
  IconPlus,
  IconRefreshCw,
  IconScale,
  IconSearch,
  IconTrash,
  IconX,
} from './icons';
import { ModalDialog } from './ModalDialog';
import { AnimalToolbar } from './AnimalToolbar';
import { AnimalWorkspace } from './AnimalWorkspace';
import { DataState } from './DataState';
import { ModuleTabs } from './ModuleTabs';
import { Pagination } from './Pagination';
import { availabilityForStatus } from '../utils/animal-filters';
import { farmToday, fetchOperation, newOperationKey } from '../utils/operations';
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
  weighedTime: string;
  weightKg: number;
  stageCode: string | null;
  note: string | null;
  barnId: number | null;
  locationCode: string | null;
  lotCode: string | null;
  corrected: boolean;
  correctsWeightId: number | null;
  gainKg: number | null;
  gainDays: number | null;
}

interface ParentSummary {
  id: number | null;
  code: string | null;
  alias: string | null;
  external: string | null;
}

interface ChronologyItem {
  date: string;
  kind: 'alta' | 'pesaje' | 'arete' | 'tipo' | 'inventario' | 'servicio' | 'parto' | 'sanidad';
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
  exitCauseCode: string | null;
  exitCauseLabel: string | null;
  reproductiveSummary: {serviceCount:number;farrowingCount:number;firstFarrowingDate:string|null;lastFarrowingDate:string|null;totalBorn:number;maleBorn:number;femaleBorn:number;unsexedBorn:number;averageBirthWeightKg:number|null;weighedBirths:number}|null;
}

interface AnimalOptions {
  barns: { id: number; code: string; name: string }[];
  stages: { code: string; name: string }[];
  locations: { code: string; name: string; locationType: string; barnId?: number | null }[];
  lots: { code: string; name: string }[];
  aptitudes: { code: string; name: string }[];
  types: { code: string; name: string }[];
  sexes: { code: string; name: string }[];
  statuses: { code: string; name: string }[];
  origins: { code: string; name: string }[];
  deathCauses: { code: string; name: string }[];
  saleCauses: { code: string; name: string }[];
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
  mother: string;
  father: string;
  breed: string;
  aptitude: string;
  originType: string;
  entryStage: string;
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
  purchaseAmount: string;
  purchaseCurrencyCode: string;
  purchaseCounterparty: string;
  purchaseDocumentReference: string;
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
  compra: 'El animal llega de fuera: suma una cabeza al inventario. Registre el importe para enlazar la compra con Finanzas.',
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
    purchaseAmount: '',
    purchaseCurrencyCode: 'PEN',
    purchaseCounterparty: '',
    purchaseDocumentReference: '',
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
  return `${Number(value).toFixed(2)} kg`;
}

function useCompactLayout() {
  const query = '(max-width: 900px)';
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return compact;
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
      <span className="kpi-label inline-flex items-center gap-1.5 leading-none">
        {icon}
        <span>{label}</span>
      </span>
      <span className="kpi-value font-numeric tabular-nums font-bold">{value}</span>
      <span className="kpi-detail">{detail}</span>
    </div>
  );
}

export function ModuloAnimales({ perfil, initialAnimalKey, barnNames = [], onChangeBarns }: { perfil: Perfil; initialAnimalKey?: string; barnNames?: string[]; onChangeBarns?: () => void }) {
  const soloLectura = perfil === 'veterinario';
  const [section, setSection] = useState<Section>('padron');
  const [animalModalOpen, setAnimalModalOpen] = useState(false);
  const [fichaTab, setFichaTab] = useState<'resumen' | 'pesajes' | 'trazabilidad' | 'operaciones'>('resumen');
  const [data, setData] = useState<ListPayload | null>(null);
  const [page, setPage] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const listRequest = useRef(0);
  const pageSize = 50;
  const [detail, setDetail] = useState<AnimalDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [requestedAnimalCode, setRequestedAnimalCode] = useState('');
  const detailRequest = useRef<AbortController | null>(null);
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
    active: '1',
    mother: '', father: '', breed: '', aptitude: '', originType: '', entryStage: '',
  });
  const [form, setForm] = useState<AnimalForm>(emptyForm);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [operationKey, setOperationKey] = useState<string>(() => newOperationKey('ani'));
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [tagForm, setTagForm] = useState({ tag: '', effectiveDate: farmToday(), reason: '' });
  const [tagError, setTagError] = useState<string | null>(null);
  const [toggleReason, setToggleReason] = useState<string>('');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Animal | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [transferForm, setTransferForm] = useState({ destinationBarnId: '', destinationStageCode: '', locationCode: '', lotCode: '', effectiveDate: farmToday(), reason: '' });
  const [exitForm, setExitForm] = useState({ exitType: 'sale' as 'sale' | 'death' | 'discard', purchaseReturn:false, causeCode: '', effectiveDate: farmToday(), reason: '', saleAmount: '', currencyCode: 'PEN', counterparty: '', documentReference: '' });
  const [physicalActionError, setPhysicalActionError] = useState<string | null>(null);
  const [transferOperationKey, setTransferOperationKey] = useState(() => newOperationKey('ani-transfer'));
  const [exitOperationKey, setExitOperationKey] = useState(() => newOperationKey('ani-exit'));
  const [saleReturnOperationKey, setSaleReturnOperationKey] = useState(() => newOperationKey('ani-sale-return'));
  const [saleReturnModalOpen, setSaleReturnModalOpen] = useState(false);
  const [saleReturnReason, setSaleReturnReason] = useState('');
  const [weightOperationKey, setWeightOperationKey] = useState(() => newOperationKey('ani-pesaje'));
  const [weightForm, setWeightForm] = useState({ weighedOn: farmToday(), weighedTime: '12:00', weightKg: '', stageCode: '', note: '' });
  const [weightError, setWeightError] = useState<string | null>(null);
  const [weightCorrection, setWeightCorrection] = useState<{ id: number; kg: string; reason: string; operationKey: string } | null>(null);

  const queryString = useMemo(() => {
    const filters = appliedFilters;
    const params = new URLSearchParams();
    params.set('limit', String(pageSize));
    params.set('offset', String(page * pageSize));
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.sex) params.set('sex', filters.sex);
    if (filters.status) params.set('status', filters.status);
    if (filters.stage) params.set('stage', filters.stage);
    if (filters.barnId) params.set('barnId', filters.barnId);
    if (filters.location) params.set('location', filters.location);
    if (filters.lot) params.set('lot', filters.lot);
    if (filters.active) params.set('active', filters.active);
    for (const key of ['mother','father','breed','aptitude','originType','entryStage'] as const) if (filters[key].trim()) params.set(key,filters[key].trim());
    const text = params.toString();
    return text ? `?${text}` : '';
  }, [appliedFilters, page]);

  const loadList = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/animals${queryString}`);
      const body = await res.json() as { ok?: boolean; error?: string } & ListPayload;
      if (request !== listRequest.current) return;
      if (!res.ok) {
        setError(body.error ?? 'No se pudo cargar el padrón de animales');
        setData(null);
        return;
      }
      if (page > 0 && page * pageSize >= body.total) {
        setPage(Math.max(0, Math.ceil(body.total / pageSize) - 1));
        return;
      }
      setData(body);
      setForm((prev) => ({
        ...prev,
        barnId: prev.barnId || (body.options.barns[0] ? String(body.options.barns[0].id) : ''),
        entryStageCode: prev.entryStageCode || (body.options.stages[0] ? body.options.stages[0].code : ''),
      }));
    } catch {
      if (request !== listRequest.current) return;
      setError('No se pudo conectar con el servidor. Reintente cuando vuelva la conexión.');
      setData(null);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [queryString, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadList(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadList, refreshVersion]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const options = data?.options;

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'barnId' ? {location: ''} : {}), ...(key === 'status' ? {active: availabilityForStatus(value, prev.active)} : {}) }));
  };

  const applyFilters = (searchOnly = false) => {
    const next = searchOnly ? { ...appliedFilters, q: filters.q.trim() } : { ...filters, q: filters.q.trim() };
    listRequest.current++;
    setPage(0);
    setAppliedFilters(next);
    setRefreshVersion(version => version + 1);
    if (!searchOnly) setFiltersOpen(false);
  };

  const hasActiveFilters = useMemo(() => {
    const filters = appliedFilters;
    return Boolean(
      filters.q || filters.type || filters.sex || filters.status || filters.stage ||
      filters.barnId || filters.location || filters.lot || filters.active !== '1' ||
      filters.mother || filters.father || filters.breed || filters.aptitude ||
      filters.originType || filters.entryStage
    );
  }, [appliedFilters]);

  const clearFilters = useCallback(() => {
    listRequest.current++;
    setPage(0);
    const cleared: Filters = {
      q: '',
      type: '',
      sex: '',
      status: '',
      stage: '',
      barnId: '',
      location: '',
      lot: '',
      active: '1',
      mother: '',
      father: '',
      breed: '',
      aptitude: '',
      originType: '',
      entryStage: '',
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
  }, []);

  const filterChips = useMemo(() => {
    const list: { key: keyof Filters; label: string }[] = [];
    const nameOf = (items: { code: string; name: string }[] | undefined, value: string) =>
      items?.find((item) => item.code === value)?.name ?? value;
    const f = appliedFilters;
    if (f.q) list.push({ key: 'q', label: `Búsqueda: ${f.q}` });
    if (f.type) list.push({ key: 'type', label: `Tipo: ${nameOf(options?.types, f.type)}` });
    if (f.sex) list.push({ key: 'sex', label: `Sexo: ${nameOf(options?.sexes, f.sex)}` });
    if (f.status) list.push({ key: 'status', label: `Estado: ${nameOf(options?.statuses, f.status)}` });
    if (f.stage) list.push({ key: 'stage', label: `Etapa: ${nameOf(options?.stages, f.stage)}` });
    if (f.barnId) list.push({ key: 'barnId', label: `Galpón: ${options?.barns.find((barn) => String(barn.id) === f.barnId)?.name ?? f.barnId}` });
    if (f.location) list.push({ key: 'location', label: `Ubicación: ${nameOf(options?.locations, f.location)}` });
    if (f.lot) list.push({ key: 'lot', label: `Lote: ${nameOf(options?.lots, f.lot)}` });
    if (f.active === '0') list.push({ key: 'active', label: 'Disponibilidad: solo inactivas' });
    if (f.mother) list.push({ key: 'mother', label: `Madre: ${f.mother}` });
    if (f.father) list.push({ key: 'father', label: `Padre: ${f.father}` });
    if (f.breed) list.push({ key: 'breed', label: `Raza: ${f.breed}` });
    if (f.aptitude) list.push({ key: 'aptitude', label: `Aptitud: ${nameOf(options?.aptitudes, f.aptitude)}` });
    if (f.originType) list.push({ key: 'originType', label: `Procedencia: ${f.originType}` });
    if (f.entryStage) list.push({ key: 'entryStage', label: `Etapa de ingreso: ${nameOf(options?.stages, f.entryStage)}` });
    return list;
  }, [appliedFilters, options]);

  const removeFilter = (key: keyof Filters) => {
    const next = { ...appliedFilters, [key]: key === 'active' ? '1' : '', ...(key === 'barnId' ? { location: '' } : {}) } as Filters;
    setFilters((prev) => ({ ...prev, ...next }));
    listRequest.current++;
    setPage(0);
    setAppliedFilters(next);
  };

  const setField = <K extends keyof AnimalForm>(key: K, value: AnimalForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value, ...(key === 'barnId' ? {locationCode: ''} : {}) }));
    if (fieldErrors[key] || fieldErrors.mother || fieldErrors.father || fieldErrors.weaningDate) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        if (key === 'motherId' || key === 'motherExternal') delete next.mother;
        if (key === 'fatherId' || key === 'fatherExternal') delete next.father;
        if (key === 'weaningDate' || key === 'weaningWeightKg') delete next.weaningDate;
        return next;
      });
    }
  };

  const openDetail = useCallback(async (key: string) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setRequestedAnimalCode(key);
    setLoadingDetail(true);
    setDetail(null);
    setSection('ficha');
    setAnimalModalOpen(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(key)}`, { signal: controller.signal });
      const body = await res.json() as { ok?: boolean; error?: string; animal?: AnimalDetail };
      if (controller.signal.aborted) return;
      if (!res.ok || !body.animal) {
        setError(body.error ?? 'No se pudo cargar la ficha del animal');
        return;
      }
      setDetail(body.animal);
      setFichaTab('resumen');
      setTagForm({ tag: '', effectiveDate: farmToday(), reason: '' });
      setTagError(null);
      setToggleReason('');
      setToggleError(null);
      setSection('ficha');
      setAnimalModalOpen(true);
      return body.animal;
    } catch {
      if (!controller.signal.aborted) setError('No se pudo conectar con el servidor.');
    } finally {
      if (!controller.signal.aborted) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    const request = detailRequest;
    return () => request.current?.abort();
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
        setFichaTab('resumen');
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
    setFieldErrors({});
    setSection('alta');
  };

  const startEdit = (animal = detail) => {
    const detail = animal;
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
      purchaseAmount: '',
      purchaseCurrencyCode: 'PEN',
      purchaseCounterparty: '',
      purchaseDocumentReference: '',
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
    setFieldErrors({});
    setSection('alta');
  };

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deleteTarget || !deleteReason.trim() || soloLectura || busy) return;
    setBusy(true);
    setDeleteError('');
    try {
      const response = await fetchOperation(`/api/animals/${encodeURIComponent(deleteTarget.code)}/deactivate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'No se pudo eliminar la ficha');
      setDeleteTarget(null);
      setSuccess(`Ficha ${deleteTarget.code} eliminada del padrón activo. Su historial se conserva y puede reactivarse.`);
      await loadList();
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar la ficha'); }
    finally { setBusy(false); }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (soloLectura) return;
    setFormError(null);
    setFieldErrors({});
    setSuccess(null);

    const errors: Record<string, string> = {};
    if (!editingCode) {
      if (!form.code.trim()) {
        errors.code = 'Indique el código o arete permanente.';
      }
      if (!form.barnId) {
        errors.barnId = 'Seleccione el galpón de ingreso.';
      }
      if (!form.entryStageCode) {
        errors.entryStageCode = 'Seleccione la etapa de ingreso.';
      }
      if (form.originType === 'compra' && (!form.purchaseAmount || Number(form.purchaseAmount) <= 0)) {
        errors.purchaseAmount = 'Indique el importe de compra.';
      }
    }
    if (!form.reason.trim()) {
      errors.reason = 'Escriba el motivo del alta o de la corrección.';
    }
    if (form.motherId && form.motherExternal.trim()) {
      errors.mother = 'Indique la madre interna o externa, no ambas.';
    }
    if (form.fatherId && form.fatherExternal.trim()) {
      errors.father = 'Indique el padre interno o externo, no ambos.';
    }
    if (form.weaningWeightKg.trim() && !form.weaningDate) {
      errors.weaningDate = 'El peso al destete requiere la fecha de destete.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Por favor complete o corrija los campos señalados.');
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
        purchaseAmount: form.originType==='compra'?form.purchaseAmount:undefined,
        purchaseCurrencyCode: form.purchaseCurrencyCode,
        purchaseCounterparty: form.purchaseCounterparty.trim()||form.originDetail.trim()||undefined,
        purchaseDocumentReference: form.purchaseDocumentReference.trim()||undefined,
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
      const res = await fetchOperation(`/api/animals/${encodeURIComponent(detail.code)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: tagForm.tag.trim(),
          effectiveDate: tagForm.effectiveDate,
          reason: tagForm.reason.trim(),
        }),
      });
      const body = await res.json() as { error?: string; animal?: AnimalDetail; warning?: string | null };
      if (!res.ok || !body.animal) {
        setTagError(body.error ?? 'No se pudo cambiar el arete.');
        return;
      }
      setDetail(body.animal);
      setTagForm({ tag: '', effectiveDate: farmToday(), reason: '' });
      setSuccess(`Arete actualizado a ${body.animal.currentTag}. El anterior se conserva con su fecha.`);
      await loadList();
    } catch (e) {
      setTagError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
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
      const res = await fetchOperation(
        `/api/animals/${encodeURIComponent(detail.code)}/${active ? 'reactivate' : 'deactivate'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: toggleReason.trim(),
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
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      setBusy(false);
    }
  };

  const handlePhysicalTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !transferForm.destinationBarnId || !transferForm.reason.trim()) {
      setPhysicalActionError('Seleccione el galpón destino y escriba el motivo del traslado.');
      return;
    }
    setBusy(true); setPhysicalActionError(null);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...transferForm, destinationBarnId: Number(transferForm.destinationBarnId),
          destinationStageCode: transferForm.destinationStageCode || detail.stageCode, locationCode: transferForm.locationCode || null, lotCode: transferForm.lotCode || null, operationKey: transferOperationKey }) });
      const body = await res.json() as { error?: string; animal?: AnimalDetail; warning?: string | null };
      if (!res.ok || !body.animal) { setPhysicalActionError(body.error ?? 'No se pudo trasladar el animal.'); return; }
      setDetail(body.animal); setTransferOperationKey(newOperationKey('ani-transfer'));
      setTransferForm((prev) => ({ ...prev, destinationBarnId: '', destinationStageCode: '', reason: '' }));
      setSuccess([`Animal ${body.animal.code} trasladado y su historial de galpón actualizado.`, body.warning].filter(Boolean).join(' '));
      await loadList();
    } catch { setPhysicalActionError('No se pudo confirmar el traslado. Reintente con el mismo formulario.'); }
    finally { setBusy(false); }
  };

  const handlePhysicalExit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !exitForm.causeCode || !exitForm.reason.trim() || (exitForm.exitType==='sale'&&!exitForm.purchaseReturn&&(!exitForm.saleAmount||Number(exitForm.saleAmount)<=0))) {
      setPhysicalActionError('Seleccione la causa, complete el importe correspondiente y escriba el motivo de la salida.');
      return;
    }
    setBusy(true); setPhysicalActionError(null);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/exit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...exitForm, operationKey: exitOperationKey }) });
      const body = await res.json() as { error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) { setPhysicalActionError(body.error ?? 'No se pudo registrar la salida.'); return; }
      setDetail(body.animal); setExitOperationKey(newOperationKey('ani-exit'));
      setExitForm((prev) => ({ ...prev, causeCode: '', reason: '', saleAmount: '', counterparty: '', documentReference: '' }));
      setSuccess(`La ficha ${body.animal.code} y el movimiento de ${exitForm.purchaseReturn?'devolución de compra':exitForm.exitType === 'death' ? 'muerte' : exitForm.exitType === 'discard' ? 'descarte' : 'venta'} quedaron registrados juntos.`);
      await loadList();
    } catch { setPhysicalActionError('No se pudo confirmar la salida. Reintente con el mismo formulario.'); }
    finally { setBusy(false); }
  };

  const confirmSaleReturn = async () => {
    if (!detail || !saleReturnReason.trim()) return;
    setBusy(true);
    setPhysicalActionError(null);
    try {
      const response = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/sale-return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveDate: farmToday(), reason: saleReturnReason.trim(), operationKey: saleReturnOperationKey }),
      });
      const result = await response.json() as { error?: string; animal?: AnimalDetail };
      if (!response.ok || !result.animal) throw new Error(result.error || 'No se pudo devolver la venta');
      setDetail(result.animal);
      setSaleReturnOperationKey(newOperationKey('ani-sale-return'));
      setSuccess(`Se revirtió la venta y se restituyó el animal ${result.animal.code} al inventario.`);
      setSaleReturnModalOpen(false);
      setSaleReturnReason('');
      await loadList();
    } catch (error) {
      setPhysicalActionError(error instanceof Error ? error.message : 'No se pudo confirmar la devolución. Reintente con la misma clave.');
    } finally {
      setBusy(false);
    }
  };

  const handleWeightSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setWeightError(null); setBusy(true);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/weights`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...weightForm, weightKg: Number(weightForm.weightKg), stageCode: weightForm.stageCode || detail.stageCode, operationKey: weightOperationKey }) });
      const body = await res.json() as { error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) { setWeightError(body.error ?? 'No se pudo registrar el pesaje.'); return; }
      setDetail(body.animal); setWeightOperationKey(newOperationKey('ani-pesaje'));
      setWeightForm((prev) => ({ ...prev, weightKg: '', note: '' })); setSuccess('Pesaje registrado con la ubicación histórica del animal.'); await loadList();
    } catch { setWeightError('No se pudo confirmar el pesaje. Reintente con la misma operación.'); }
    finally { setBusy(false); }
  };

  const handleWeightCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || !weightCorrection) return;
    setWeightError(null); setBusy(true);
    try {
      const res = await fetch(`/api/animals/${encodeURIComponent(detail.code)}/weights/${weightCorrection.id}/correction`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: Number(weightCorrection.kg), reason: weightCorrection.reason, operationKey: weightCorrection.operationKey }) });
      const body = await res.json() as { error?: string; animal?: AnimalDetail };
      if (!res.ok || !body.animal) { setWeightError(body.error ?? 'No se pudo corregir el pesaje.'); return; }
      setDetail(body.animal); setWeightCorrection(null); setSuccess('Corrección guardada; el pesaje original permanece en el historial.'); await loadList();
    } catch { setWeightError('No se pudo confirmar la corrección.'); }
    finally { setBusy(false); }
  };

  const animals = data?.animals ?? [];
  const total = data?.total ?? 0;
  const compactLayout = useCompactLayout();
  const closeAnimalWorkspace = () => {
    if (saving || busy) return;
    detailRequest.current?.abort();
    setLoadingDetail(false);
    setError(null);
    setAnimalModalOpen(false);
    setEditingCode(null);
    setSection('padron');
  };

  return (
    <div>
      {deleteTarget && <ModalDialog labelledBy="animal-delete-title" onDismiss={() => setDeleteTarget(null)} dismissDisabled={busy}>
        <form onSubmit={event => void handleDelete(event)} aria-busy={busy} className="modal-form">
          <header className="modal-header">
            <span className="modal-icon modal-icon-danger" aria-hidden="true"><IconTrash size={20} /></span>
            <div>
              <h2 id="animal-delete-title">Eliminar animal {deleteTarget.code}</h2>
              <p className="text-sm text-muted">{deleteTarget.alias ?? 'Sin alias'} · {deleteTarget.barnName}</p>
            </div>
          </header>
          <div className="modal-body">
            <p className="text-sm">La ficha se retirará del padrón activo. Se conservará su historial y podrá reactivarse desde el filtro de fichas inactivas. Esto no registra una venta ni una muerte y no descuenta cabezas del inventario.</p>
            <div className="form-group">
              <label className="form-label" htmlFor="animal-delete-reason">Motivo de eliminación</label>
              <input
                id="animal-delete-reason"
                className="form-input"
                value={deleteReason}
                required
                maxLength={300}
                disabled={busy}
                onChange={event => setDeleteReason(event.target.value)}
              />
              <p className="form-helper">Queda registrado en la auditoría con tu usuario.</p>
            </div>
            {deleteError && <p role="alert" className="alert alert-error">{deleteError}</p>}
            {busy && <p className="animal-action-loading inline-flex items-center gap-2" role="status"><IconRefreshCw size={18} className="spinner-icon" /><span>Eliminando animal… Espera un momento.</span></p>}
          </div>
          <footer className="modal-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setDeleteTarget(null)}><IconX size={16} /><span>Cancelar</span></button>
            <button type="submit" className="btn btn-danger" disabled={busy || !deleteReason.trim()}><IconTrash size={16} /><span>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</span></button>
          </footer>
        </form>
      </ModalDialog>}
      <AnimalToolbar barns={barnNames} onChangeBarns={onChangeBarns} onRefresh={() => void loadList()} loading={loading} />

      {error && !animalModalOpen && (
        <div className="alert alert-error mb-4" role="alert" aria-live="assertive">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconAlertCircle size={16} />
            <span>{error}</span>
          </span>
        </div>
      )}

      {success && !animalModalOpen && (
        <div className="alert alert-success mb-4" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconCheck size={16} />
            <span>{success}</span>
          </span>
        </div>
      )}

      {soloLectura && (
        <div className="alert alert-warning mb-4" role="status" aria-live="polite">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconEye size={16} />
            <span>El perfil Veterinario puede consultar fichas y cronología, pero no modificarlas.</span>
          </span>
        </div>
      )}

      {section !== 'padron' && !animalModalOpen && <nav className="admin-tabs mb-4" aria-label="Navegación de animales">
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => setSection('padron')}
          aria-label="Ir a sección padrón de animales"
        >
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconArrowLeft size={14} />
            <span>Volver al padrón</span>
            {total > 0 && (
              <span className="badge-status badge-outline tabular-nums font-numeric ml-1">{total}</span>
            )}
          </span>
        </button>
        {detail && (
          <button
            type="button"
            aria-current={section === 'ficha' ? 'page' : undefined}
            className={`btn btn-sm ${section === 'ficha' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSection('ficha')}
            aria-label={`Ver ficha técnica ${detail.code}`}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconClipboard size={14} />
              <span>Ficha técnica {detail.code}</span>
            </span>
          </button>
        )}
      </nav>}

      {loading && !data && (
        <DataState variant="loading" title="Cargando padrón de animales…" />
      )}

      {!loading && !data && error && (
        <DataState
          variant="error"
          title="No se pudo cargar el padrón"
          description={error}
          action={<button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" onClick={() => void loadList()}><IconRefreshCw size={16} /><span>Reintentar</span></button>}
        />
      )}

      {data && (section === 'padron' || animalModalOpen) && (
        <div className="section-block">
          <div className="card">
            <form className="animal-search-bar" onSubmit={event => { event.preventDefault(); applyFilters(true); }}>
              <div className="form-group animal-search-field">
                <label className="sr-only" htmlFor="ani-q">Buscar</label>
                <input id="ani-q" type="search" className="form-input" value={filters.q}
                  onChange={event => setFilter('q', event.target.value)} placeholder="Código o nombre del animal" />
              </div>
              <button type="submit" className="btn btn-primary animal-icon-button" aria-label="Buscar" title="Buscar" disabled={loading}><IconSearch size={18} /></button>
              <button type="button" className="btn btn-outline animal-icon-button" aria-label="Filtros" title="Filtros" aria-expanded={filtersOpen} aria-controls="animal-filters-panel" onClick={() => setFiltersOpen(open => !open)}>
                <IconFilter size={18} />
                {filterChips.length > 0 && <span className="animal-icon-count tabular-nums font-numeric">{filterChips.length}</span>}
              </button>
              {!soloLectura && <button type="button" className="btn btn-outline animal-icon-button" aria-label="Registrar animal en el padrón" title="Registrar animal" onClick={startCreate}><IconPlus size={18} /></button>}
            </form>
            {filterChips.length > 0 && (
              <div className="filter-chip-row" aria-label="Filtros aplicados">
                {filterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className="filter-chip"
                    onClick={() => removeFilter(chip.key)}
                    aria-label={`Quitar filtro ${chip.label}`}
                  >
                    <span>{chip.label}</span>
                    <IconX size={12} />
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm filter-chip-clear"
                  onClick={clearFilters}
                  aria-label="Limpiar todos los filtros"
                >
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconX size={14} />
                    <span>Limpiar filtros</span>
                  </span>
                </button>
              </div>
            )}
            {filtersOpen && <form id="animal-filters-panel" className="animal-filters-panel" onSubmit={event => { event.preventDefault(); applyFilters(); }}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="ani-filter-type">Tipo</label>
                <select
                  id="ani-filter-type"
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
                <label className="form-label" htmlFor="ani-filter-sex">Sexo</label>
                <select
                  id="ani-filter-sex"
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
                <label className="form-label" htmlFor="ani-filter-status">Estado productivo</label>
                <select
                  id="ani-filter-status"
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
                <label className="form-label" htmlFor="ani-filter-stage">Etapa</label>
                <select
                  id="ani-filter-stage"
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
                <label className="form-label" htmlFor="ani-filter-barn">Galpón</label>
                <select
                  id="ani-filter-barn"
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
                <label className="form-label" htmlFor="ani-filter-location">Ubicación</label>
                <select
                  id="ani-filter-location"
                  className="form-select"
                  value={filters.location}
                  onChange={(event) => setFilter('location', event.target.value)}
                >
                  <option value="">Todas</option>
                  {(options?.locations ?? []).filter(location => !filters.barnId || location.barnId === undefined || location.barnId === Number(filters.barnId)).map((location) => (
                    <option key={location.code} value={location.code}>{location.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-filter-lot">Lote</label>
                <select
                  id="ani-filter-lot"
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
                <label className="form-label" htmlFor="ani-filter-active">Disponibilidad</label>
                <select
                  id="ani-filter-active"
                  className="form-select"
                  value={filters.active}
                  onChange={(event) => setFilter('active', event.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="1">Solo activas</option>
                  <option value="0">Solo inactivas</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-mother">Madre</label>
                <input
                  id="filter-mother"
                  className="form-input"
                  value={filters.mother}
                  onChange={(event) => setFilter('mother', event.target.value)}
                  placeholder="Código, alias o referencia"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-father">Padre</label>
                <input
                  id="filter-father"
                  className="form-input"
                  value={filters.father}
                  onChange={(event) => setFilter('father', event.target.value)}
                  placeholder="Código, alias o referencia"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-breed">Raza</label>
                <input
                  id="filter-breed"
                  className="form-input"
                  value={filters.breed}
                  onChange={(event) => setFilter('breed', event.target.value)}
                  placeholder="Ej. Landrace"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-aptitude">Aptitud</label>
                <select
                  id="filter-aptitude"
                  className="form-select"
                  value={filters.aptitude}
                  onChange={(event) => setFilter('aptitude', event.target.value)}
                >
                  <option value="">Todas</option>
                  {(options?.aptitudes ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-origin">Procedencia</label>
                <select
                  id="filter-origin"
                  className="form-select"
                  value={filters.originType}
                  onChange={(event) => setFilter('originType', event.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="nacimiento">Nacimiento</option>
                  <option value="compra">Compra</option>
                  <option value="interna">Interna</option>
                  <option value="inicial">Inventario inicial</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="filter-entry-stage">Etapa de ingreso</label>
                <select
                  id="filter-entry-stage"
                  className="form-select"
                  value={filters.entryStage}
                  onChange={(event) => setFilter('entryStage', event.target.value)}
                >
                  <option value="">Todas</option>
                  {(options?.stages ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="animal-filter-actions"><button type="submit" disabled={loading} className="btn btn-primary inline-flex items-center justify-center gap-2"><IconCheck size={16} /><span>Aplicar filtros</span></button></div>
            </form>}
          </div>

          <div className="card">
            <div className="card-header-clean mb-2 flex-wrap gap-2">
              <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                <IconFilter size={16} className="text-primary" />
                <span>Padrón de animales</span>
              </span>
              <span className="text-xs text-muted" role="status" aria-live="polite">{loading ? 'Actualizando…' : `${total} ficha${total === 1 ? '' : 's'}${hasActiveFilters ? ' · Filtros aplicados' : ''}`}</span>
            </div>

            {animals.length === 0 ? (
              <DataState
                variant="empty"
                title="Sin animales para los filtros seleccionados"
                description="Ajuste la búsqueda o registre el primer animal con su código permanente."
                icon={<IconSearch size={26} className="text-primary" />}
                action={!soloLectura ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" onClick={startCreate}><IconPlus size={16} /><span>Registrar animal</span></button> : undefined}
              />
            ) : (
              compactLayout ? (
                <ul className="animal-card-list" aria-label="Padrón de animales">
                  {animals.map((animal) => (
                    <li key={animal.id}>
                      <article className="animal-card" data-state={animal.isActive ? 'active' : 'inactive'}>
                        <header className="animal-card-head">
                          <div className="animal-card-identity">
                            <span className="animal-card-code">{animal.code}</span>
                            {animal.alias ? <span className="animal-card-alias">{animal.alias}</span> : null}
                          </div>
                          <span className={animal.isActive ? (STATUS_BADGE[animal.status] ?? 'badge-status') : 'badge-status badge-outline'}>
                            {animal.isActive ? animal.statusLabel : 'Inactiva'}
                          </span>
                        </header>

                        <dl className="animal-card-meta">
                          <div><dt>Arete</dt><dd className="font-mono">{animal.currentTag}</dd></div>
                          <div><dt>Tipo</dt><dd>{animal.animalTypeLabel}</dd></div>
                          <div><dt>Sexo</dt><dd>{animal.sexLabel}</dd></div>
                          <div><dt>Edad</dt><dd className="font-mono">{animal.ageDays !== null ? `${animal.ageDays} d` : animal.ageLabel ?? 'Sin dato'}</dd></div>
                          <div><dt>Peso vivo</dt><dd className="font-mono">{formatWeight(animal.currentWeightKg)}</dd></div>
                          <div><dt>Etapa</dt><dd>{animal.stageName}</dd></div>
                        </dl>

                        <p className="animal-card-location">
                          <IconBuilding size={14} />
                          <span>{animal.barnName}</span>
                          <span className="animal-card-place">{animal.locationName ?? 'Sin ubicación'}{animal.lotName ? ` · Lote ${animal.lotName}` : ''}</span>
                        </p>

                        <div className="animal-card-actions">
                          <button
                            type="button"
                            className="btn animal-action animal-action-view"
                            onClick={() => void openDetail(animal.code)}
                            disabled={loadingDetail}
                            aria-label={`Ver ficha de ${animal.code}`}
                          >
                            <IconEye size={14} />
                            <span>Ver ficha</span>
                          </button>
                          {!soloLectura && <>
                            <button type="button" className="btn animal-action animal-action-edit" disabled={loadingDetail || busy}
                              aria-label={`Editar animal ${animal.code}`} onClick={async () => { const record = await openDetail(animal.code); if (record) startEdit(record); }}><IconEdit size={14} /><span>Editar</span></button>
                            <button type="button" className="btn animal-action animal-action-delete" disabled={!animal.isActive || busy}
                              aria-label={`Eliminar animal ${animal.code}`} onClick={() => { setDeleteTarget(animal); setDeleteReason(''); setDeleteError(''); }}><IconTrash size={14} /><span>Eliminar</span></button>
                          </>}
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
              <div className="table-responsive">
                <table className="data-table" aria-label="Padrón de animales">
                  <thead>
                    <tr>
                      <th className="text-left">Código</th>
                      <th className="text-left">Arete oficial</th>
                      <th className="text-left">Tipo</th>
                      <th className="text-left">Sexo</th>
                      <th className="text-right">Edad</th>
                      <th className="text-right">Peso vivo</th>
                      <th className="text-left">Galpón</th>
                      <th className="text-left">Etapa productiva</th>
                      <th className="text-left">Ubicación / Lote</th>
                      <th className="text-center">Estado</th>
                      <th className="text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.map((animal) => (
                      <tr key={animal.id}>
                        <td className="text-left font-mono font-bold">
                          {animal.code}
                          {animal.alias ? <span className="text-xs text-muted"> · {animal.alias}</span> : null}
                        </td>
                        <td className="text-left font-mono">{animal.currentTag}</td>
                        <td className="text-left">{animal.animalTypeLabel}</td>
                        <td className="text-left">{animal.sexLabel}</td>
                        <td className="text-right tabular-nums font-mono">
                          {animal.ageDays !== null ? `${animal.ageDays} d` : animal.ageLabel ?? <span className="text-muted">Sin dato</span>}
                        </td>
                        <td className="text-right tabular-nums font-mono font-bold">
                          {formatWeight(animal.currentWeightKg)}
                        </td>
                        <td className="text-left">{animal.barnName}</td>
                        <td className="text-left">{animal.stageName}</td>
                        <td className="text-left text-xs">
                          {animal.locationName ?? 'Sin ubicación'}
                          {animal.lotName ? ` · Lote ${animal.lotName}` : ''}
                        </td>
                        <td className="text-center">
                          <span className={animal.isActive ? (STATUS_BADGE[animal.status] ?? 'badge-status') : 'badge-status badge-outline'}>
                            {animal.isActive ? animal.statusLabel : 'Inactiva'}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="animal-row-actions animal-table-actions">
                          <button
                            type="button"
                            className="btn animal-action animal-action-view"
                            onClick={() => void openDetail(animal.code)}
                            disabled={loadingDetail}
                            aria-label={`Ver ficha de ${animal.code}`}
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconEye size={14} />
                              <span>Ver ficha</span>
                            </span>
                          </button>
                          {!soloLectura && <>
                            <button type="button" className="btn animal-action animal-action-edit" disabled={loadingDetail || busy}
                              aria-label={`Editar animal ${animal.code}`} onClick={async () => { const record = await openDetail(animal.code); if (record) startEdit(record); }}><IconEdit size={14} /><span>Editar</span></button>
                            <button type="button" className="btn animal-action animal-action-delete" disabled={!animal.isActive || busy}
                              aria-label={`Eliminar animal ${animal.code}`} onClick={() => { setDeleteTarget(animal); setDeleteReason(''); setDeleteError(''); }}><IconTrash size={14} /><span>Eliminar</span></button>
                          </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )
            )}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              loading={loading}
              onPage={(next) => { listRequest.current++; setPage(next); }}
              navLabel="Páginas del padrón"
              prevLabel="Página anterior del padrón"
              nextLabel="Página siguiente del padrón"
              unit={total === 1 ? 'ficha' : 'fichas'}
            />
          </div>
        </div>
      )}

      <AnimalWorkspace modal={animalModalOpen} loading={loadingDetail} title={loadingDetail ? `Cargando animal ${requestedAnimalCode}` : section === 'alta' ? `Editar animal ${editingCode ?? ''}` : `Ficha del animal ${detail?.code ?? requestedAnimalCode}`} onClose={closeAnimalWorkspace} busy={saving || busy}>
      {animalModalOpen && error && <p className="alert alert-error" role="alert">{error}</p>}
      {animalModalOpen && success && <p className="alert alert-success" role="status">{success}</p>}
      {section === 'alta' && !soloLectura && (
        <div className="card">
          <div className="card-header-clean mb-3 flex-wrap gap-2 justify-between">
            <div>
              <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                {editingCode ? <IconEdit size={16} className="text-primary" /> : <IconPlus size={16} className="text-primary" />}
                <span>{editingCode ? `Editar ficha ${editingCode}` : 'Alta de animal'}</span>
              </span>
              <p className="text-xs text-muted mt-1">
                {editingCode
                  ? 'El código y la ubicación física no cambian desde esta pantalla'
                  : 'El código es permanente y conserva sus ceros iniciales'}
              </p>
            </div>
            {!animalModalOpen && <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (editingCode && detail) {
                  setSection('ficha');
                } else {
                  closeAnimalWorkspace();
                }
              }}
              aria-label="Volver al padrón de animales"
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <IconArrowLeft size={14} />
                <span>Volver al padrón</span>
              </span>
            </button>}
          </div>

          <form onSubmit={handleSubmit} className="form-stack">
            {formError && (
              <div className="alert alert-error" role="alert" aria-live="assertive">
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconAlertCircle size={16} />
                  <span>{formError}</span>
                </span>
              </div>
            )}

            <div className="form-sections">
            <fieldset className="form-section">
              <legend>Identificación</legend>
              <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="ani-code">Código permanente</label>
                <input
                  id="ani-code"
                  type="text"
                  className={`form-input ${fieldErrors.code ? 'input-error' : ''}`}
                  value={form.code}
                  onChange={(event) => setField('code', event.target.value)}
                  placeholder="Ej. 002"
                  disabled={editingCode !== null}
                  aria-invalid={Boolean(fieldErrors.code)}
                  aria-describedby={fieldErrors.code ? 'ani-code-error ani-code-helper' : 'ani-code-helper'}
                  required
                />
                {fieldErrors.code && (
                  <p id="ani-code-error" className="field-error-message" role="alert">
                    <IconAlertCircle size={14} />
                    <span>{fieldErrors.code}</span>
                  </p>
                )}
                <p id="ani-code-helper" className="form-helper">Se conserva tal cual, incluidos los ceros a la izquierda.</p>
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
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>Datos zootécnicos</legend>
              <div className="form-grid">
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
                  className={`form-input ${fieldErrors.weaningDate ? 'input-error' : ''}`}
                  value={form.weaningDate}
                  max={farmToday()}
                  onChange={(event) => setField('weaningDate', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.weaningDate)}
                  aria-describedby={fieldErrors.weaningDate ? 'ani-weaning-error' : undefined}
                />
                {fieldErrors.weaningDate && (
                  <p id="ani-weaning-error" className="field-error-message" role="alert">
                    <IconAlertCircle size={14} />
                    <span>{fieldErrors.weaningDate}</span>
                  </p>
                )}
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
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>Origen y ubicación</legend>
              <div className="form-grid">
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

                  {form.originType === 'compra' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="ani-purchase-amount">Importe pagado / de compra</label>
                        <input
                          id="ani-purchase-amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0.00"
                          className={`form-input ${fieldErrors.purchaseAmount ? 'input-error' : ''}`}
                          value={form.purchaseAmount}
                          onChange={(event) => setField('purchaseAmount', event.target.value)}
                          aria-invalid={Boolean(fieldErrors.purchaseAmount)}
                          aria-describedby={fieldErrors.purchaseAmount ? 'ani-purchase-amount-error' : undefined}
                          required
                        />
                        {fieldErrors.purchaseAmount && (
                          <p id="ani-purchase-amount-error" className="field-error-message" role="alert">
                            <IconAlertCircle size={14} />
                            <span>{fieldErrors.purchaseAmount}</span>
                          </p>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="ani-purchase-currency">Moneda</label>
                        <select
                          id="ani-purchase-currency"
                          className="form-select"
                          value={form.purchaseCurrencyCode}
                          onChange={(event) => setField('purchaseCurrencyCode', event.target.value)}
                        >
                          <option value="PEN">PEN · Sol</option>
                          <option value="USD">USD · Dólar</option>
                          <option value="EUR">EUR · Euro</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="ani-purchase-seller">Proveedor</label>
                        <input
                          id="ani-purchase-seller"
                          className="form-input"
                          value={form.purchaseCounterparty}
                          placeholder="Nombre del proveedor o granja"
                          onChange={(event) => setField('purchaseCounterparty', event.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="ani-purchase-reference">Documento de compra</label>
                        <input
                          id="ani-purchase-reference"
                          className="form-input"
                          value={form.purchaseDocumentReference}
                          placeholder="Ej. Factura F001-4567"
                          onChange={(event) => setField('purchaseDocumentReference', event.target.value)}
                        />
                      </div>
                    </>
                  )}

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
                      className={`form-select ${fieldErrors.barnId ? 'input-error' : ''}`}
                      value={form.barnId}
                      onChange={(event) => setField('barnId', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.barnId)}
                      aria-describedby={fieldErrors.barnId ? 'ani-barn-error' : undefined}
                      required
                    >
                      <option value="">Seleccione un galpón</option>
                      {(options?.barns ?? []).map((barn) => (
                        <option key={barn.id} value={barn.id}>{barn.name}</option>
                      ))}
                    </select>
                    {fieldErrors.barnId && (
                      <p id="ani-barn-error" className="field-error-message" role="alert">
                        <IconAlertCircle size={14} />
                        <span>{fieldErrors.barnId}</span>
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ani-entry-stage">Etapa de ingreso</label>
                    <select
                      id="ani-entry-stage"
                      className={`form-select ${fieldErrors.entryStageCode ? 'input-error' : ''}`}
                      value={form.entryStageCode}
                      onChange={(event) => setField('entryStageCode', event.target.value)}
                      aria-invalid={Boolean(fieldErrors.entryStageCode)}
                      aria-describedby={fieldErrors.entryStageCode ? 'ani-entry-stage-error' : undefined}
                      required
                    >
                      <option value="">Seleccione una etapa</option>
                      {(options?.stages ?? []).map((stage) => (
                        <option key={stage.code} value={stage.code}>{stage.name}</option>
                      ))}
                    </select>
                    {fieldErrors.entryStageCode && (
                      <p id="ani-entry-stage-error" className="field-error-message" role="alert">
                        <IconAlertCircle size={14} />
                        <span>{fieldErrors.entryStageCode}</span>
                      </p>
                    )}
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
                      {(options?.locations ?? []).filter(location => location.barnId === undefined || location.barnId === Number(form.barnId)).map((location) => (
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
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>Genealogía</legend>
              <div className="form-grid">
              <div className="form-group">
                <AnimalPicker label="Madre interna" searchLabel="Buscar madre interna" sex="hembra" useIdValue value={form.motherId ? [form.motherId] : []} onChange={values => setField('motherId', values[0] ?? '')} emptyLabel="Desconocido o externo" />
                {fieldErrors.mother && (
                  <p className="field-error-message" role="alert">
                    <IconAlertCircle size={14} />
                    <span>{fieldErrors.mother}</span>
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-mother-external">Madre externa</label>
                <input
                  id="ani-mother-external"
                  type="text"
                  className={`form-input ${fieldErrors.mother ? 'input-error' : ''}`}
                  value={form.motherExternal}
                  onChange={(event) => setField('motherExternal', event.target.value)}
                  placeholder="Identificación fuera de la granja"
                  disabled={form.motherId !== ''}
                  aria-invalid={Boolean(fieldErrors.mother)}
                />
              </div>

              <div className="form-group">
                <AnimalPicker label="Padre interno" searchLabel="Buscar padre interno" sex="macho" useIdValue value={form.fatherId ? [form.fatherId] : []} onChange={values => setField('fatherId', values[0] ?? '')} emptyLabel="Desconocido o externo" />
                {fieldErrors.father && (
                  <p className="field-error-message" role="alert">
                    <IconAlertCircle size={14} />
                    <span>{fieldErrors.father}</span>
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="ani-father-external">Padre externo</label>
                <input
                  id="ani-father-external"
                  type="text"
                  className={`form-input ${fieldErrors.father ? 'input-error' : ''}`}
                  value={form.fatherExternal}
                  onChange={(event) => setField('fatherExternal', event.target.value)}
                  placeholder="Identificación fuera de la granja"
                  disabled={form.fatherId !== ''}
                  aria-invalid={Boolean(fieldErrors.father)}
                />
              </div>
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>Observaciones y auditoría</legend>
              <div className="form-grid">
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
                  className={`form-input ${fieldErrors.reason ? 'input-error' : ''}`}
                  value={form.reason}
                  onChange={(event) => setField('reason', event.target.value)}
                  placeholder={editingCode ? 'Ej. Corrección del peso al nacer' : 'Ej. Alta de lechón nacido el 5 de enero'}
                  aria-invalid={Boolean(fieldErrors.reason)}
                  aria-describedby={fieldErrors.reason ? 'ani-reason-error ani-reason-helper' : 'ani-reason-helper'}
                  required
                />
                {fieldErrors.reason && (
                  <p id="ani-reason-error" className="field-error-message" role="alert">
                    <IconAlertCircle size={14} />
                    <span>{fieldErrors.reason}</span>
                  </p>
                )}
                <p id="ani-reason-helper" className="form-helper">Queda en la auditoría con su usuario y la fecha efectiva.</p>
              </div>
              </div>
            </fieldset>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
                aria-label={saving ? 'Guardando ficha…' : editingCode ? 'Guardar cambios de la ficha' : 'Registrar animal en el padrón'}
              >
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
                  setFieldErrors({});
                }}
                disabled={saving}
                aria-label={editingCode ? 'Volver a la ficha del animal' : 'Limpiar formulario'}
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
          {/* Tarjeta héroe focal dominante */}
          <div className="card">
            <div className="card-header-clean mb-3 flex-wrap gap-2 justify-between">
              <div className="inline-flex items-center gap-2">
                <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                  <IconPig size={18} className="text-primary" />
                  <span>Ficha {detail.code}</span>
                  {detail.alias ? <span className="text-sm text-muted">({detail.alias})</span> : null}
                </span>
                <span className={detail.isActive ? 'badge-status badge-success' : 'badge-status badge-outline'}>
                  {detail.isActive ? 'Disponible' : 'Inactiva'}
                </span>
              </div>
              {!animalModalOpen && <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={closeAnimalWorkspace}
                aria-label="Volver al padrón general"
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconArrowLeft size={14} />
                  <span>Volver al padrón</span>
                </span>
              </button>}
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
          </div>

          <ModuleTabs
            label="Secciones de la ficha"
            active={fichaTab}
            onChange={setFichaTab}
            tabs={[
              { id: 'resumen', label: 'Datos técnicos', icon: <IconPig size={14} /> },
              { id: 'pesajes', label: 'Pesajes y GMD', icon: <IconScale size={14} />, count: detail.weights.length },
              { id: 'trazabilidad', label: 'Trazabilidad', icon: <IconClipboard size={14} />, count: detail.chronology.length },
              ...(!soloLectura ? [{ id: 'operaciones', label: 'Gestión y Traslados', icon: <IconEdit size={14} /> }] : []),
            ]}
          />

          {fichaTab === 'resumen' && (
            <div className="card">
              <div className="card-header-clean mb-2">
                <span className="section-title">Datos técnicos y genealogía</span>
                <span className="text-xs text-muted">Información productiva, procedencia e identificación</span>
              </div>
              <dl className="detail-grid">
                <div className="detail-item"><dt>Arete oficial</dt><dd className="font-mono font-bold">{detail.currentTag}</dd></div>
                <div className="detail-item"><dt>Tipo</dt><dd>{detail.animalTypeLabel}</dd></div>
                <div className="detail-item"><dt>Sexo</dt><dd>{detail.sexLabel}</dd></div>
                <div className="detail-item"><dt>Raza</dt><dd>{detail.breed ?? 'Sin dato'}</dd></div>
                <div className="detail-item"><dt>Aptitud</dt><dd>{detail.aptitude ?? 'Sin definir'}</dd></div>
                <div className="detail-item"><dt>Procedencia</dt><dd>{detail.originLabel}{detail.originDetail ? ` · ${detail.originDetail}` : ''}</dd></div>
                <div className="detail-item"><dt>Fecha de ingreso</dt><dd className="font-mono tabular-nums">{detail.entryDate}</dd></div>
                <div className="detail-item"><dt>Etapa de ingreso</dt><dd>{detail.entryStageCode}</dd></div>
                <div className="detail-item"><dt>Ubicación</dt><dd>{detail.locationName ?? 'Sin asignar'}</dd></div>
                <div className="detail-item"><dt>Lote</dt><dd>{detail.lotName ? `Lote ${detail.lotName}` : 'Sin lote'}</dd></div>
                <div className="detail-item"><dt>Marrana (madre)</dt><dd className="font-mono">{detail.mother ? (detail.mother.code ?? detail.mother.external ?? 'Sin dato') : 'Desconocida'}</dd></div>
                <div className="detail-item"><dt>Verraco (padre)</dt><dd className="font-mono">{detail.father ? (detail.father.code ?? detail.father.external ?? 'Sin dato') : 'Desconocido'}</dd></div>
                <div className="detail-item"><dt>Peso al nacer</dt><dd className="font-mono font-bold tabular-nums">{formatWeight(detail.birthWeightKg)}</dd></div>
                <div className="detail-item"><dt>Peso al destete</dt><dd className="font-mono font-bold tabular-nums">{formatWeight(detail.weaningWeightKg)}</dd></div>
                {detail.exitDate && (
                  <>
                    <div className="detail-item"><dt>Fecha de salida</dt><dd className="font-mono tabular-nums">{detail.exitDate}</dd></div>
                    <div className="detail-item"><dt>Tipo de salida</dt><dd>{detail.exitType === 'sale' ? 'Venta' : detail.exitType === 'death' ? 'Muerte' : detail.exitType === 'discard' ? 'Descarte' : 'Sin dato'}{detail.exitCauseLabel ? ` · ${detail.exitCauseLabel}` : ''}</dd></div>
                  </>
                )}
                <div className="detail-item detail-item-wide"><dt>Observaciones</dt><dd>{detail.observations ?? 'Sin observaciones'}</dd></div>
              </dl>

              {detail.reproductiveSummary && (
                <section className="detail-section" aria-label="Resumen reproductivo">
                  <h3 className="detail-section-title">Resumen reproductivo</h3>
                  <dl className="detail-grid">
                    <div className="detail-item"><dt>Servicios de monta o IA</dt><dd className="font-mono font-bold tabular-nums">{detail.reproductiveSummary.serviceCount}</dd></div>
                    <div className="detail-item"><dt>Partos registrados</dt><dd className="font-mono font-bold tabular-nums">{detail.reproductiveSummary.farrowingCount}</dd></div>
                    <div className="detail-item"><dt>Primer parto</dt><dd className="font-mono tabular-nums">{detail.reproductiveSummary.firstFarrowingDate ?? 'Sin dato'}</dd></div>
                    <div className="detail-item"><dt>Último parto</dt><dd className="font-mono tabular-nums">{detail.reproductiveSummary.lastFarrowingDate ?? 'Sin dato'}</dd></div>
                    <div className="detail-item"><dt>Crías nacidas</dt><dd className="font-mono font-bold tabular-nums">{detail.reproductiveSummary.totalBorn}</dd></div>
                    <div className="detail-item"><dt>Machos, hembras y sin sexar</dt><dd className="font-mono tabular-nums">{detail.reproductiveSummary.maleBorn} / {detail.reproductiveSummary.femaleBorn} / {detail.reproductiveSummary.unsexedBorn}</dd></div>
                    <div className="detail-item detail-item-wide"><dt>Peso promedio de crías vivas</dt><dd className="font-mono font-bold tabular-nums">{formatWeight(detail.reproductiveSummary.averageBirthWeightKg)}{detail.reproductiveSummary.weighedBirths ? ` · ponderado por ${detail.reproductiveSummary.weighedBirths} crías vivas de camadas con peso registrado` : ''}</dd></div>
                  </dl>
                </section>
              )}

              {!soloLectura && (
                <div className="form-actions mt-3">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => startEdit()}
                    aria-label={`Editar ficha del animal ${detail.code}`}
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconEdit size={14} />
                      <span>Editar ficha</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {fichaTab === 'pesajes' && (
            <div className="card">
              <div className="card-header-clean mb-2">
                <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                  <IconScale size={16} className="text-primary" />
                  <span>Pesajes y Ganancia Media Diaria (GMD)</span>
                </span>
                <span className="text-xs text-muted">Ordenados por fecha y hora; ubicación física preservada</span>
              </div>
              {weightError && (
                <div className="alert alert-error mb-3" role="alert" aria-live="assertive">
                  <span className="inline-flex items-center justify-center gap-2 leading-none">
                    <IconAlertCircle size={16} />
                    <span>{weightError}</span>
                  </span>
                </div>
              )}
              {!soloLectura && detail.exitDate === null && (
                <form onSubmit={handleWeightSave} className="form-stack mb-4">
                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label" htmlFor="ani-weight-date">Fecha</label>
                      <input
                        id="ani-weight-date"
                        className="form-input"
                        type="date"
                        value={weightForm.weighedOn}
                        max={farmToday()}
                        onChange={(event) => setWeightForm((prev) => ({ ...prev, weighedOn: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ani-weight-time">Hora</label>
                      <input
                        id="ani-weight-time"
                        className="form-input"
                        type="time"
                        value={weightForm.weighedTime}
                        onChange={(event) => setWeightForm((prev) => ({ ...prev, weighedTime: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ani-weight-kg">Peso (kg)</label>
                      <input
                        id="ani-weight-kg"
                        className="form-input font-numeric tabular-nums font-bold"
                        type="number"
                        min="0.01"
                        max="500"
                        step="0.01"
                        placeholder="Ej. 85.5"
                        value={weightForm.weightKg}
                        onChange={(event) => setWeightForm((prev) => ({ ...prev, weightKg: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label" htmlFor="ani-weight-stage">Etapa</label>
                      <select
                        id="ani-weight-stage"
                        className="form-select"
                        value={weightForm.stageCode || detail.stageCode}
                        onChange={(event) => setWeightForm((prev) => ({ ...prev, stageCode: event.target.value }))}
                      >
                        {(options?.stages ?? []).map((stage) => (
                          <option key={stage.code} value={stage.code}>{stage.name}</option>
                        ))}
                      </select>
                      <small className="text-muted">Si elige otra etapa, se actualizarán la ficha y el inventario desde la fecha del pesaje.</small>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ani-weight-note">Nota</label>
                      <input
                        id="ani-weight-note"
                        className="form-input"
                        value={weightForm.note}
                        placeholder="Opcional"
                        onChange={(event) => setWeightForm((prev) => ({ ...prev, note: event.target.value }))}
                        maxLength={300}
                      />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      aria-label="Pesar animal y registrar en ficha"
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconScale size={14} />
                        <span>{busy ? 'Guardando…' : 'Pesar animal'}</span>
                      </span>
                    </button>
                  </div>
                </form>
              )}
              {detail.weights.length === 0 ? (
                <div className="card empty-state-card mt-3">
                  <div className="empty-icon-wrap">
                    <IconScale size={28} className="text-muted" />
                  </div>
                  <p className="font-semibold text-base">Sin pesajes registrados</p>
                  <p className="text-sm text-muted">
                    Registra el primer pesaje para monitorear la curva de crecimiento y la ganancia media diaria (GMD) de este animal.
                  </p>
                </div>
              ) : (
                <ul className="data-card-list" aria-label="Historial de pesajes">
                  {detail.weights.map((weight) => (
                    <li key={weight.id}>
                      <article className="data-card weight-card" data-state={weight.corrected ? 'corrected' : 'active'}>
                        <header className="data-card-head">
                          <div className="data-card-identity">
                            <span className="data-card-title font-mono">{weight.weighedOn}</span>
                            <span className="data-card-subtitle font-mono">{weight.weighedTime}</span>
                          </div>
                          <span className="badge-status badge-outline">{weight.corrected ? 'Corregido' : 'Registrado'}</span>
                        </header>
                        <dl className="data-card-meta">
                          <div>
                            <dt>Peso vivo</dt>
                            <dd className="font-mono font-bold tabular-nums">{weight.weightKg.toFixed(2)} kg</dd>
                          </div>
                          <div>
                            <dt>Ganancia (GMD)</dt>
                            <dd className="font-mono tabular-nums">
                              {weight.corrected ? (
                                <span className="text-muted">Sin cálculo</span>
                              ) : weight.gainDays === null ? (
                                'Sin dato'
                              ) : (
                                <>+{weight.gainKg} kg <span className="text-xs text-muted">({(Number(weight.gainKg) / weight.gainDays).toFixed(2)} kg/d)</span></>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Ubicación histórica</dt>
                            <dd>{[weight.barnId ? data?.options.barns.find((barn) => barn.id === weight.barnId)?.name : null, weight.locationCode, weight.lotCode].filter(Boolean).join(' · ') || 'Sin dato'}</dd>
                          </div>
                        </dl>
                        {weight.note && <p className="data-card-note">{weight.note}</p>}
                        {!soloLectura && !weight.corrected && detail.exitDate === null && (
                          <div className="data-card-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setWeightCorrection({
                                id: weight.id,
                                kg: String(weight.weightKg),
                                reason: '',
                                operationKey: newOperationKey('ani-pesaje-corr'),
                              })}
                              aria-label={`Corregir pesaje del ${weight.weighedOn}`}
                            >
                              <IconEdit size={14} />
                              <span>Corregir</span>
                            </button>
                          </div>
                        )}
                        {weightCorrection?.id === weight.id && (
                          <form onSubmit={handleWeightCorrection} className="form-stack weight-correction-form">
                            <div className="grid-2">
                              <div className="form-group">
                                <label className="form-label" htmlFor={`weight-corr-kg-${weight.id}`}>Peso corregido (kg)</label>
                                <input
                                  id={`weight-corr-kg-${weight.id}`}
                                  className="form-input font-numeric tabular-nums font-bold"
                                  type="number"
                                  min="0.01"
                                  max="500"
                                  step="0.01"
                                  value={weightCorrection.kg}
                                  onChange={(event) =>
                                    setWeightCorrection((prev) => prev ? { ...prev, kg: event.target.value } : prev)
                                  }
                                  required
                                />
                              </div>
                              <div className="form-group">
                                <label className="form-label" htmlFor={`weight-corr-reason-${weight.id}`}>Motivo de corrección</label>
                                <input
                                  id={`weight-corr-reason-${weight.id}`}
                                  className="form-input"
                                  value={weightCorrection.reason}
                                  placeholder="Ej. Error tipográfico en báscula"
                                  onChange={(event) =>
                                    setWeightCorrection((prev) => prev ? { ...prev, reason: event.target.value } : prev)
                                  }
                                  required
                                  maxLength={300}
                                />
                              </div>
                            </div>
                            <div className="form-actions">
                              <button type="submit" className="btn btn-primary btn-sm" disabled={busy} aria-label="Guardar corrección">
                                <IconCheck size={14} />
                                <span>{busy ? 'Guardando…' : 'Guardar corrección'}</span>
                              </button>
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeightCorrection(null)} aria-label="Cancelar corrección">
                                <IconX size={14} />
                                <span>Cancelar</span>
                              </button>
                            </div>
                          </form>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {fichaTab === 'trazabilidad' && (
            <>
              <div className="card">
                <div className="card-header-clean mb-2">
                  <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                    <IconClipboard size={16} className="text-primary" />
                    <span>Cronología operativa</span>
                  </span>
                  <span className="text-xs text-muted">Altas, aretes, tipos, pesajes y movimientos de inventario</span>
                </div>
                {detail.chronology.length === 0 ? (
                  <DataState
                    variant="empty"
                    title="Sin eventos en la cronología"
                    description="Los pesajes, traslados, aplicaciones sanitarias y eventos reproductivos se reflejarán aquí automáticamente."
                    icon={<IconClipboard size={26} className="text-primary" />}
                  />
                ) : (
                  <ol className="timeline" aria-label="Cronología operativa">
                    {detail.chronology.map((item) => (
                      <li key={`${item.kind}-${item.date}-${item.id ?? 'alta'}`} className="timeline-item" data-kind={item.kind}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <div className="timeline-body">
                          <span className="timeline-date font-mono tabular-nums">{item.date}</span>
                          <span className="timeline-title">{item.title}</span>
                          <span className="timeline-detail">{item.detail}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="card">
                <div className="card-header-clean mb-2">
                  <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                    <IconClipboard size={16} className="text-primary" />
                    <span>Aretes históricos</span>
                  </span>
                  <span className="text-xs text-muted">Se conserva el historial de aretes y fechas de asignación</span>
                </div>
                {detail.tags.length === 0 ? (
                  <DataState
                    variant="empty"
                    title="Sin cambios de arete"
                    description={`El animal conserva su arete oficial vigente (${detail.currentTag}).`}
                    icon={<IconClipboard size={26} className="text-primary" />}
                  />
                ) : (
                  <ul className="data-card-list tag-history" aria-label="Aretes históricos">
                    {detail.tags.map((tag) => (
                      <li key={tag.id}>
                        <article className="data-card tag-card">
                          <header className="data-card-head">
                            <span className="data-card-title font-mono">{tag.tag}</span>
                            <span className={`badge-status ${tag.validTo ? 'badge-outline' : 'badge-success'}`}>{tag.validTo ? 'Histórico' : 'Vigente'}</span>
                          </header>
                          <dl className="data-card-meta">
                            <div><dt>Vigente desde</dt><dd className="font-mono tabular-nums">{tag.validFrom}</dd></div>
                            <div><dt>Vigente hasta</dt><dd className="font-mono tabular-nums">{tag.validTo ?? 'Sin fecha de cierre'}</dd></div>
                          </dl>
                        </article>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {fichaTab === 'operaciones' && !soloLectura && (
            <>
              {detail.exitDate === null ? (
                <div className="grid-2">
                  <div className="card">
                    <div className="card-header-clean mb-2">
                      <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                        <IconClipboard size={16} className="text-primary" />
                        <span>Cambiar arete oficial</span>
                      </span>
                      <span className="text-xs text-muted">El arete anterior queda registrado con su fecha de vigencia</span>
                    </div>
                    <form onSubmit={handleTagChange} className="form-stack">
                      {tagError && (
                        <div className="alert alert-error" role="alert" aria-live="assertive">
                          <span className="inline-flex items-center justify-center gap-2 leading-none">
                            <IconAlertCircle size={16} />
                            <span>{tagError}</span>
                          </span>
                        </div>
                      )}
                      <div className="form-group">
                        <label className="form-label" htmlFor="ani-new-tag">Nuevo arete oficial</label>
                        <input
                          id="ani-new-tag"
                          type="text"
                          className="form-input font-mono"
                          value={tagForm.tag}
                          placeholder="Ej. A-402 o PE-9821"
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
                          placeholder="Ej. Pérdida, desprendimiento o deterioro del arete previo"
                          onChange={(event) => setTagForm((prev) => ({ ...prev, reason: event.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          aria-label="Confirmar cambio de arete oficial"
                        >
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
                      <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                        <IconEyeOff size={16} className="text-primary" />
                        <span>Disponibilidad de la ficha</span>
                      </span>
                      <span className="text-xs text-muted">
                        No registra venta ni muerte; solo la retira de selecciones nuevas.
                      </span>
                    </div>
                    <div className="form-stack">
                      {toggleError && (
                        <div className="alert alert-error" role="alert" aria-live="assertive">
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
                            aria-label="Desactivar ficha de animal"
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconEyeOff size={14} />
                              <span>{busy ? 'Guardando…' : 'Desactivar ficha'}</span>
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void handleToggle(true)}
                            disabled={busy}
                            aria-label="Reactivar ficha de animal"
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconRefreshCw size={14} />
                              <span>{busy ? 'Guardando…' : 'Reactivar ficha'}</span>
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header-clean mb-2">
                      <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                        <IconArrowRight size={16} className="text-primary" />
                        <span>Trasladar a galpón</span>
                      </span>
                      <span className="text-xs text-muted">Actualiza ficha, historial de ubicación y libro de inventario en una operación.</span>
                    </div>
                    <form className="form-stack" onSubmit={(event) => void handlePhysicalTransfer(event)}>
                      {physicalActionError && (
                        <div className="alert alert-error mb-3" role="alert" aria-live="assertive">
                          <span className="inline-flex items-center justify-center gap-2 leading-none">
                            <IconAlertCircle size={16} />
                            <span>{physicalActionError}</span>
                          </span>
                        </div>
                      )}
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-barn">Galpón destino</label>
                          <select
                            id="ani-transfer-barn"
                            className="form-select"
                            value={transferForm.destinationBarnId}
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, destinationBarnId: event.target.value, locationCode: '' }))}
                            required
                          >
                            <option value="">Seleccione destino</option>
                            {data?.options.barns.map((barn) => (
                              <option key={barn.id} value={barn.id}>{barn.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-stage">Etapa de destino</label>
                          <select
                            id="ani-transfer-stage"
                            className="form-select"
                            value={transferForm.destinationStageCode || detail.stageCode}
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, destinationStageCode: event.target.value }))}
                          >
                            {(options?.stages ?? []).map((stage) => (
                              <option key={stage.code} value={stage.code}>{stage.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-location">Ubicación</label>
                          <select
                            id="ani-transfer-location"
                            className="form-select"
                            value={transferForm.locationCode}
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, locationCode: event.target.value }))}
                          >
                            <option value="">Sin asignar</option>
                            {data?.options.locations.filter(item => item.barnId === undefined || item.barnId === Number(transferForm.destinationBarnId)).map((item) => (
                              <option key={item.code} value={item.code}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-lot">Lote</label>
                          <select
                            id="ani-transfer-lot"
                            className="form-select"
                            value={transferForm.lotCode}
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, lotCode: event.target.value }))}
                          >
                            <option value="">Sin lote</option>
                            {data?.options.lots.map((item) => (
                              <option key={item.code} value={item.code}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-date">Fecha efectiva</label>
                          <input
                            id="ani-transfer-date"
                            type="date"
                            className="form-input"
                            value={transferForm.effectiveDate}
                            max={farmToday()}
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-transfer-reason">Motivo</label>
                          <input
                            id="ani-transfer-reason"
                            className="form-input"
                            value={transferForm.reason}
                            placeholder="Ej. Paso a engorde"
                            onChange={(event) => setTransferForm((prev) => ({ ...prev, reason: event.target.value }))}
                            required
                          />
                        </div>
                      </div>
                      <div className="form-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          aria-label="Trasladar animal a galpón"
                        >
                          <span className="inline-flex items-center justify-center gap-2 leading-none">
                            <IconArrowRight size={14} />
                            <span>{busy ? 'Guardando…' : 'Trasladar a galpón'}</span>
                          </span>
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="card">
                    <div className="card-header-clean mb-2">
                      <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                        <IconAlertTriangle size={16} className="text-danger" />
                        <span>Registrar baja de inventario</span>
                      </span>
                      <span className="text-xs text-muted">La venta, el descarte (saca) o la muerte actualiza la ficha y descuenta la cabeza del inventario de granja.</span>
                    </div>
                    <form className="form-stack" onSubmit={(event) => void handlePhysicalExit(event)}>
                      {physicalActionError && (
                        <div className="alert alert-error mb-3" role="alert" aria-live="assertive">
                          <span className="inline-flex items-center justify-center gap-2 leading-none">
                            <IconAlertCircle size={16} />
                            <span>{physicalActionError}</span>
                          </span>
                        </div>
                      )}
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-exit-type">Tipo de salida</label>
                          <select
                            id="ani-exit-type"
                            className="form-select"
                            value={exitForm.purchaseReturn ? 'purchase_return' : exitForm.exitType}
                            onChange={(event) =>
                              setExitForm((prev) => ({
                                ...prev,
                                exitType:
                                  event.target.value === 'death'
                                    ? 'death'
                                    : event.target.value === 'discard'
                                      ? 'discard'
                                      : 'sale',
                                purchaseReturn: event.target.value === 'purchase_return',
                                causeCode: '',
                              }))
                            }
                          >
                            <option value="sale">Venta</option>
                            <option value="discard">Descarte (saca)</option>
                            {detail.originType === 'compra' && (
                              <option value="purchase_return">Devolución de compra al proveedor</option>
                            )}
                            <option value="death">Muerte</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-exit-cause">Causa</label>
                          <select
                            id="ani-exit-cause"
                            className="form-select"
                            value={exitForm.causeCode}
                            onChange={(event) => setExitForm((prev) => ({ ...prev, causeCode: event.target.value }))}
                            required
                          >
                            <option value="">Seleccione causa</option>
                            {(exitForm.exitType === 'death' ? data?.options.deathCauses : data?.options.saleCauses)?.map((item) => (
                              <option key={item.code} value={item.code}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="ani-exit-date">Fecha efectiva</label>
                          <input
                            id="ani-exit-date"
                            type="date"
                            className="form-input"
                            value={exitForm.effectiveDate}
                            max={farmToday()}
                            onChange={(event) => setExitForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                            required
                          />
                        </div>
                        {exitForm.exitType === 'sale' && !exitForm.purchaseReturn && (
                          <>
                            <div className="form-group">
                              <label className="form-label" htmlFor="ani-exit-amount">Importe de venta</label>
                              <input
                                id="ani-exit-amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                placeholder="0.00"
                                className="form-input tabular-nums"
                                value={exitForm.saleAmount}
                                onChange={(event) => setExitForm((prev) => ({ ...prev, saleAmount: event.target.value }))}
                                required
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label" htmlFor="ani-exit-currency">Moneda</label>
                              <select
                                id="ani-exit-currency"
                                className="form-select"
                                value={exitForm.currencyCode}
                                onChange={(event) => setExitForm((prev) => ({ ...prev, currencyCode: event.target.value }))}
                              >
                                <option value="PEN">PEN · Sol peruano (S/)</option>
                                <option value="USD">USD · Dólar ($)</option>
                                <option value="EUR">EUR · Euro (€)</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label className="form-label" htmlFor="ani-exit-buyer">Cliente</label>
                              <input
                                id="ani-exit-buyer"
                                className="form-input"
                                placeholder="Nombre del comprador"
                                value={exitForm.counterparty}
                                onChange={(event) => setExitForm((prev) => ({ ...prev, counterparty: event.target.value }))}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label" htmlFor="ani-exit-document">Documento</label>
                              <input
                                id="ani-exit-document"
                                className="form-input"
                                placeholder="Ej. Guía / Factura"
                                value={exitForm.documentReference}
                                onChange={(event) => setExitForm((prev) => ({ ...prev, documentReference: event.target.value }))}
                              />
                            </div>
                          </>
                        )}
                        {exitForm.purchaseReturn ? (
                          <p className="form-helper form-col-span-full">
                            Se revertirán el pago original y la existencia comprada; no se permite una segunda devolución.
                          </p>
                        ) : null}
                        <div className="form-group form-col-span-full">
                          <label className="form-label" htmlFor="ani-exit-reason">Motivo</label>
                          <input
                            id="ani-exit-reason"
                            className="form-input"
                            placeholder="Detalle o justificación de la salida"
                            value={exitForm.reason}
                            onChange={(event) => setExitForm((prev) => ({ ...prev, reason: event.target.value }))}
                            required
                          />
                        </div>
                      </div>
                      <div className="form-actions">
                        <button
                          type="submit"
                          className="btn btn-danger btn-sm"
                          disabled={busy}
                          aria-label="Registrar baja de animal"
                        >
                          <span className="inline-flex items-center justify-center gap-2 leading-none">
                            <IconAlertCircle size={14} />
                            <span>{busy ? 'Guardando…' : 'Registrar baja'}</span>
                          </span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="card empty-state-card">
                  <div className="empty-icon-wrap">
                    <IconAlertCircle size={28} className="text-warning" />
                  </div>
                  <p className="font-semibold text-base">Ficha con baja registrada</p>
                  <p className="text-sm text-muted">
                    El animal registra salida ({detail.exitType === 'sale' ? 'Venta' : detail.exitType === 'death' ? 'Muerte' : 'Descarte'}) el {detail.exitDate}.
                  </p>
                </div>
              )}

              {detail.exitDate !== null && detail.exitType === 'sale' && ['administrador', 'responsable'].includes(perfil) && (
                <section className="card mt-3">
                  <div className="card-header-clean mb-2">
                    <span className="section-title inline-flex items-center justify-center gap-2 leading-none">
                      <IconRefreshCw size={16} className="text-primary" />
                      <span>Devolver venta de animal</span>
                    </span>
                    <span className="text-xs text-muted">Restaura la ficha y el inventario, y enlaza el asiento compensatorio con la venta original.</span>
                  </div>
                  {physicalActionError && (
                    <div className="alert alert-error mb-3" role="alert" aria-live="assertive">
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconAlertCircle size={16} />
                        <span>{physicalActionError}</span>
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setSaleReturnReason('');
                      setSaleReturnOperationKey(newOperationKey('ani-sale-return'));
                      setPhysicalActionError(null);
                      setSaleReturnModalOpen(true);
                    }}
                    aria-label="Abrir formulario para registrar devolución de venta"
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconRefreshCw size={14} />
                      <span>Registrar devolución de venta</span>
                    </span>
                  </button>
                </section>
              )}
            </>
          )}

          {saleReturnModalOpen && detail && (
            <ModalDialog labelledBy="animal-sale-return-dialog-title" onDismiss={() => setSaleReturnModalOpen(false)} dismissDisabled={busy}>
              <header className="modal-header">
                <span className="modal-icon modal-icon-primary" aria-hidden="true"><IconRefreshCw size={20} /></span>
                <div>
                  <h2 id="animal-sale-return-dialog-title">Devolver venta de animal</h2>
                  <p className="text-sm text-muted">Ficha {detail.code}</p>
                </div>
              </header>
              <div className="modal-body">
                <p className="text-sm text-muted">
                  Se cancelará el registro de salida del animal <strong>{detail.code}</strong>, se reintegrará 1 cabeza al inventario del galpón y se generará el contra-asiento financiero auditable.
                </p>
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-sale-return-reason">Motivo de la devolución</label>
                  <input
                    id="modal-sale-return-reason"
                    className="form-input"
                    value={saleReturnReason}
                    onChange={(e) => setSaleReturnReason(e.target.value)}
                    placeholder="Ej. Reclamo del cliente o transacción revertida"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <footer className="modal-actions">
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setSaleReturnModalOpen(false)} aria-label="Cancelar devolución">
                  <IconX size={16} />
                  <span>Cancelar</span>
                </button>
                <button type="button" className="btn btn-primary" disabled={busy || !saleReturnReason.trim()} aria-label="Confirmar devolución de venta" onClick={() => void confirmSaleReturn()}>
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : 'Confirmar devolución'}</span>
                </button>
              </footer>
            </ModalDialog>
          )}
        </div>
      )}
      </AnimalWorkspace>
    </div>
  );
}
