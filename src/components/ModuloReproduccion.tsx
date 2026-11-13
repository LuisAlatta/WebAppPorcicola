import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconActivity,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconEdit,
  IconHeart,
  IconLock,
  IconPlus,
  IconRefreshCw,
  IconX,
} from './icons';
import { farmToday, fetchOperation, newOperationKey } from '../utils/operations';
import { errorMessage } from '../utils/format';
import { DataState } from './DataState';
import { ModalDialog } from './ModalDialog';
import { ModuleTabs } from './ModuleTabs';
import {
  PageHeader,
  InlineAlert,
  KpiCard,
  StatusBadge,
  SectionCard,
  FormField,
  DataCardHead,
  DataCardMeta,
  DataCardActions,
} from './ui';
import type { Perfil } from '../types';

interface AnimalOption {
  code: string;
  alias: string | null;
  barnName: string;
  breed: string | null;
}

interface Service {
  id: number;
  serviceNumber: number;
  serviceDate: string;
  serviceType: string;
  sireCode: string | null;
  sireBreed: string | null;
  materialSource: string;
  externalSource: string | null;
  observations: string | null;
}

interface ReproductionEvent {
  id: number;
  eventType: string;
  eventDate: string;
  physiologicalStatus: string | null;
  reason: string | null;
  observations: string | null;
}

interface WeaningPlan {
  referenceWeaningDate: string;
  heatIntervalDays: number;
  firstRepeatIntervalDays: number;
  secondRepeatIntervalDays: number;
  expectedHeatDate: string;
  expectedFirstRepeatDate: string;
  expectedSecondRepeatDate: string;
  actualHeatDate: string | null;
  actualFirstRepeatDate: string | null;
  actualSecondRepeatDate: string | null;
}

type BirthCountKey = 'maleAlive' | 'femaleAlive' | 'unsexedAlive' | 'maleStillborn' | 'femaleStillborn' | 'unsexedStillborn';

const birthCountFields: { key: BirthCountKey; label: string }[] = [
  { key: 'maleAlive', label: 'Machos vivos al nacer' },
  { key: 'femaleAlive', label: 'Hembras vivas al nacer' },
  { key: 'unsexedAlive', label: 'Sin sexar vivos al nacer' },
  { key: 'maleStillborn', label: 'Machos nacidos muertos' },
  { key: 'femaleStillborn', label: 'Hembras nacidas muertas' },
  { key: 'unsexedStillborn', label: 'Sin sexar nacidos muertos' },
];

interface Litter {
  id: string;
  farrowingDate?: string;
  liveCount: number;
  maleAlive: number;
  femaleAlive: number;
  unsexedAlive: number;
  stillbornCount: number;
  averageWeightKg: number | null;
  expectedWeaningDate: string | null;
  actualWeaningDate: string | null;
  identifiedAnimals?: { code: string; sex: string }[];
  historicalOnly?: boolean;
  birthCounts?: Record<BirthCountKey, number>;
}

interface Cycle {
  id: string;
  femaleCode: string;
  femaleAlias: string | null;
  cycleNumber: number;
  cycleStatus: string;
  reproductiveStatus: string;
  femalePresent: boolean;
  serviceAnchorDate: string | null;
  gestationDays: number;
  probableFarrowingDate: string;
  dueDateSource: string;
  dueDateReason: string | null;
  daysRemaining: number;
  dueLabel: string;
  barnId: number;
  barnName: string;
  locationCode: string | null;
  lotCode: string | null;
  femaleBreed: string | null;
  aptitude: string | null;
  lastFarrowingDate: string | null;
  previousWeaningDate?: string | null;
  previousWeaningPending?: boolean;
  observations: string | null;
  antecedent: boolean;
  services: Service[];
  events: ReproductionEvent[];
  litter: Litter | null;
  weaningPlan: WeaningPlan | null;
}

interface LitterTarget {
  litterId: string;
  motherCode: string;
  barnName: string;
  farrowingDate: string;
  historicalOnly: boolean;
}

interface FormState {
  femaleCode: string;
  serviceDate: string;
  serviceType: string;
  sireCode: string;
  sireBreed: string;
  materialSource: 'internal' | 'external';
  externalSource: string;
  dueDate: string;
  dueDateReason: string;
  lastFarrowingDate: string;
  aptitude: string;
  observations: string;
}

const initialForm = (): FormState => ({
  femaleCode: '',
  serviceDate: farmToday(),
  serviceType: 'inseminacion_artificial',
  sireCode: '',
  sireBreed: '',
  materialSource: 'internal',
  externalSource: '',
  dueDate: '',
  dueDateReason: '',
  lastFarrowingDate: '',
  aptitude: '',
  observations: '',
});

const serviceLabels: Record<string, string> = {
  monta_natural: 'Monta natural',
  inseminacion_artificial: 'Inseminación artificial',
  transferencia_embriones: 'Transferencia de embriones',
};

const statusLabels: Record<string, string> = {
  empty: 'Vacía',
  possible_pregnancy: 'Posible preñez',
  gestation: 'Gestación',
  lactation: 'Parida · ciclo cerrado',
  abortion: 'Aborto',
};

export function ModuloReproduccion({ perfil }: { perfil: Perfil }) {
  const soloLectura = perfil === 'operario';
  const [females, setFemales] = useState<AnimalOption[]>([]);
  const [sires, setSires] = useState<AnimalOption[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const activeCycles = cycles.filter(cycle => cycle.cycleStatus === 'open' && cycle.femalePresent);
  const [targetLitters, setTargetLitters] = useState<LitterTarget[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isAntecedent, setIsAntecedent] = useState(false);
  const [section, setSection] = useState<'ciclos' | 'registro'>('ciclos');
  const [operationKey, setOperationKey] = useState(() => newOperationKey('rep-ciclo'));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('pending');

  const hasActiveFilters = useMemo(
    () => Boolean(from || to || status !== 'pending'),
    [from, to, status]
  );

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setStatus('pending');
  };
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [repeatCycle, setRepeatCycle] = useState<string | null>(null);
  const [manualCycle, setManualCycle] = useState<string | null>(null);
  const [repeatKeys, setRepeatKeys] = useState<Record<string, string>>({});
  const [eventKeys, setEventKeys] = useState<Record<string, string>>({});
  const [manualKeys, setManualKeys] = useState<Record<string, string>>({});
  const [closureForm, setClosureForm] = useState<{ cycleId: string; eventType: 'abortion' | 'closed'; reason: string } | null>(null);
  const [farrowingCycle, setFarrowingCycle] = useState<string | null>(null);
  const [farrowingKeys, setFarrowingKeys] = useState<Record<string, string>>({});
  const [postweaningCycle, setPostweaningCycle] = useState<string | null>(null);
  const [postweaningKeys, setPostweaningKeys] = useState<Record<string, string>>({});
  const [litterEventCycle, setLitterEventCycle] = useState<string | null>(null);
  const [litterEventEffectiveDate, setLitterEventEffectiveDate] = useState(farmToday());
  const [litterEventKeys, setLitterEventKeys] = useState<Record<string, string>>({});
  const [dateCorrection, setDateCorrection] = useState<{
    cycleId: string;
    litterId: string;
    expectedCurrentDate: string;
    farrowingDate: string;
    reason: string;
    operationKey: string;
  } | null>(null);
  const [countCorrection, setCountCorrection] = useState<{
    cycleId: string;
    litterId: string;
    expectedCounts: number[];
    values: Record<BirthCountKey, string>;
    reason: string;
    operationKey: string;
  } | null>(null);

  const openCountCorrection = (cycle: Cycle) => {
    if (!cycle.litter?.birthCounts) return;
    const counts = cycle.litter.birthCounts;
    setError(null);
    setNotice(null);
    setCountCorrection({
      cycleId: cycle.id,
      litterId: cycle.litter.id,
      expectedCounts: birthCountFields.map((field) => counts[field.key]),
      values: Object.fromEntries(birthCountFields.map((field) => [field.key, String(counts[field.key])])) as Record<BirthCountKey, string>,
      reason: '',
      operationKey: newOperationKey('camada-cantidades'),
    });
  };

  const openDateCorrection = (cycle: Cycle) => {
    const currentDate = cycle.litter?.farrowingDate ?? cycle.lastFarrowingDate;
    if (!cycle.litter || !currentDate) return;
    setError(null);
    setNotice(null);
    setDateCorrection({
      cycleId: cycle.id,
      litterId: cycle.litter.id,
      expectedCurrentDate: currentDate,
      farrowingDate: currentDate,
      reason: '',
      operationKey: newOperationKey('camada-fecha'),
    });
  };

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status !== 'all') params.set('status', status);

    const [cycleRes, targetLittersRes, femaleRes, sireRes] = await Promise.all([
      fetch(`/api/reproduction/cycles?${params.toString()}`),
      fetch('/api/reproduction/litters/targets'),
      fetch('/api/animals?sex=hembra&status=activo&limit=500'),
      fetch('/api/animals?type=verraco&status=activo&limit=500'),
    ]);

    const cycleBody = (await cycleRes.json()) as { error?: string; cycles?: Cycle[] };
    const targetLitterBody = (await targetLittersRes.json()) as { error?: string; targets?: LitterTarget[] };
    const femaleBody = (await femaleRes.json()) as { animals?: AnimalOption[] };
    const sireBody = (await sireRes.json()) as { animals?: AnimalOption[] };

    if (!cycleRes.ok) throw new Error(cycleBody.error ?? 'No se pudieron cargar los ciclos.');
    if (!targetLittersRes.ok) throw new Error(targetLitterBody.error ?? 'No se pudieron cargar las camadas destino.');
    return {
      cycles: cycleBody.cycles ?? [],
      targetLitters: targetLitterBody.targets ?? [],
      females: femaleBody.animals ?? [],
      sires: sireBody.animals ?? [],
    };
  }, [from, to, status]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchData();
      setCycles(data.cycles);
      setTargetLitters(data.targetLitters);
      setFemales(data.females);
      setSires(data.sires);
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    let active = true;
    void fetchData()
      .then((data) => {
        if (!active) return;
        setCycles(data.cycles);
        setTargetLitters(data.targetLitters);
        setFemales(data.females);
        setSires(data.sires);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(errorMessage(err, 'Error cargando reproducción.'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchData]);

  const submitCycle = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const path = isAntecedent ? '/api/reproduction/antecedents' : '/api/reproduction/cycles';
      const payload = {
        ...form,
        serviceDate: form.serviceDate,
        dueDate: form.dueDate || undefined,
        lastFarrowingDate: form.lastFarrowingDate || undefined,
        operationKey,
        ...(isAntecedent ? { gestationDays: undefined } : {}),
      };
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string; replayed?: boolean };
      if (!res.ok) {
        setError(body.error ?? 'No se pudo guardar el ciclo.');
        return;
      }
      setNotice(
        body.replayed
          ? 'Operación ya registrada; se recuperó el ciclo guardado.'
          : isAntecedent
          ? 'Antecedente gestante registrado sin crear servicios ficticios.'
          : 'Ciclo reproductivo abierto.'
      );
      setForm(initialForm());
      setOperationKey(newOperationKey('rep-ciclo'));
      await load();
      setSection('ciclos');
    } catch {
      setError('No se pudo confirmar el registro. Puede reintentar con el mismo formulario.');
    } finally {
      setBusy(false);
    }
  };

  const recordEvent = async (cycle: Cycle, eventType: string, physiologicalStatus?: string, suppliedReason = '') => {
    const eventDate = farmToday();
    const reason = suppliedReason.trim();
    if ((eventType === 'abortion' || eventType === 'closed') && !reason) return;
    const keyId = `${cycle.id}:${eventType}:${eventDate}`;
    const opKey = eventKeys[keyId] ?? newOperationKey('rep-event');
    setEventKeys((previous) => ({ ...previous, [keyId]: opKey }));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, eventDate, physiologicalStatus, reason, operationKey: opKey }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'No se pudo registrar el evento.');
        return;
      }
      setEventKeys((previous) => ({ ...previous, [keyId]: newOperationKey('rep-event') }));
      if (eventType === 'abortion' || eventType === 'closed') setClosureForm(null);
      setNotice(eventType === 'abortion' ? 'Aborto registrado; el ciclo se retiró de pendientes.' : 'Evento reproductivo registrado.');
      await load();
    } catch {
      setError('No se pudo confirmar el evento.');
    } finally {
      setBusy(false);
    }
  };

  const addRepeatService = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const opKey = repeatKeys[cycle.id] ?? newOperationKey('rep-servicio');
    setRepeatKeys((previous) => ({ ...previous, [cycle.id]: opKey }));
    try {
      const payload = {
        serviceDate: data.get('serviceDate'),
        serviceType: data.get('serviceType'),
        materialSource: data.get('materialSource'),
        sireCode: data.get('sireCode'),
        externalSource: data.get('externalSource'),
        observations: data.get('observations'),
        operationKey: opKey,
      };
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'No se pudo agregar el servicio.');
        return;
      }
      setRepeatKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-servicio') }));
      setRepeatCycle(null);
      setNotice('Nuevo servicio agregado al mismo ciclo; el anterior permanece en el historial.');
      await load();
    } catch {
      setError('No se pudo confirmar el nuevo servicio.');
    } finally {
      setBusy(false);
    }
  };

  const saveManualDue = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const opKey = manualKeys[cycle.id] ?? newOperationKey('rep-fecha');
    setManualKeys((previous) => ({ ...previous, [cycle.id]: opKey }));
    try {
      const res = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: data.get('dueDate'),
          dueDateReason: data.get('dueDateReason'),
          observations: cycle.observations,
          operationKey: opKey,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'No se pudo cambiar la fecha probable.');
        return;
      }
      setManualKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-fecha') }));
      setManualCycle(null);
      setNotice('Fecha manual guardada con su motivo y vigencia.');
      await load();
    } catch {
      setError('No se pudo confirmar el cambio.');
    } finally {
      setBusy(false);
    }
  };

  const saveFarrowing = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const opKey = farrowingKeys[cycle.id] ?? newOperationKey('rep-parto');
    setFarrowingKeys((previous) => ({ ...previous, [cycle.id]: opKey }));
    try {
      const response = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/farrowing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farrowingDate: data.get('farrowingDate'),
          parityNumber: data.get('parityNumber') || undefined,
          maleAlive: data.get('maleAlive'),
          femaleAlive: data.get('femaleAlive'),
          unsexedAlive: data.get('unsexedAlive'),
          maleStillborn: data.get('maleStillborn'),
          femaleStillborn: data.get('femaleStillborn'),
          unsexedStillborn: data.get('unsexedStillborn'),
          averageWeightKg: data.get('averageWeightKg') || undefined,
          observations: data.get('observations'),
          reason: data.get('reason'),
          operationKey: opKey,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        liveCount?: number;
        expectedWeaningDate?: string;
        historicalOnly?: boolean;
        motherStageCode?: string | null;
      };
      if (!response.ok) {
        setError(body.error ?? 'No se pudo registrar el parto.');
        return;
      }
      setFarrowingKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-parto') }));
      setFarrowingCycle(null);
      setNotice(
        `${body.liveCount ?? 0} nacidos vivos registrados${body.historicalOnly ? ' como antecedente histórico' : ' en inventario'}${body.motherStageCode === 'lactancia' ? ' · paso de la madre a Lactancia registrado' : ''}${
          body.expectedWeaningDate ? ` · destete previsto ${body.expectedWeaningDate}` : ''
        }.`
      );
      await load();
    } catch {
      setError('No se pudo confirmar el parto. Reintente con la misma operación.');
    } finally {
      setBusy(false);
    }
  };

  const savePostweaningPlan = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const opKey = postweaningKeys[cycle.id] ?? newOperationKey('rep-postdestete');
    setPostweaningKeys((previous) => ({ ...previous, [cycle.id]: opKey }));
    try {
      const response = await fetch(`/api/reproduction/cycles/${encodeURIComponent(cycle.id)}/postweaning`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceWeaningDate: data.get('referenceWeaningDate'),
          heatIntervalDays: data.get('heatIntervalDays'),
          firstRepeatIntervalDays: data.get('firstRepeatIntervalDays'),
          secondRepeatIntervalDays: data.get('secondRepeatIntervalDays'),
          actualHeatDate: data.get('actualHeatDate') || undefined,
          actualFirstRepeatDate: data.get('actualFirstRepeatDate') || undefined,
          actualSecondRepeatDate: data.get('actualSecondRepeatDate') || undefined,
          reason: 'Plan postdestete confirmado',
          operationKey: opKey,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'No se pudo guardar el plan de celo.');
        return;
      }
      setPostweaningKeys((previous) => ({ ...previous, [cycle.id]: newOperationKey('rep-postdestete') }));
      setPostweaningCycle(null);
      setNotice('Intervalos y fechas de celo/repetición guardados en este ciclo.');
      await load();
    } catch {
      setError('No se pudo confirmar el plan postdestete.');
    } finally {
      setBusy(false);
    }
  };

  const saveLitterEvent = async (event: React.FormEvent, cycle: Cycle) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const eventType = String(data.get('eventType'));
    const keyId = `${cycle.litter?.id}:${eventType}`;
    const opKey = litterEventKeys[keyId] ?? newOperationKey('camada-evento');
    setLitterEventKeys((previous) => ({ ...previous, [keyId]: opKey }));
    try {
      const response = await fetch(`/api/reproduction/litters/${encodeURIComponent(cycle.litter!.id)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          effectiveDate: data.get('effectiveDate'),
          sex: data.get('sex'),
          quantity: data.get('quantity'),
          destinationLitterId: data.get('destinationLitterId') || undefined,
          destinationStageCode: data.get('destinationStageCode') || undefined,
          destinationBarnId: data.get('destinationBarnId') || undefined,
          destinationLocationCode: data.get('destinationLocationCode') || undefined,
          destinationLotCode: data.get('destinationLotCode') || undefined,
          weightKg: data.get('weightKg') || undefined,
          animalCodes: data.getAll('animalCodes'),
          cause: data.get('cause') || undefined,
          reason: data.get('reason'),
          operationKey: opKey,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? 'No se pudo guardar el evento de camada.');
        return;
      }
      setLitterEventKeys((previous) => ({ ...previous, [keyId]: newOperationKey('camada-evento') }));
      setLitterEventCycle(null);
      setNotice(
        eventType === 'weaning'
          ? 'Destete parcial registrado sin aumentar el total de cabezas.'
          : eventType === 'death'
          ? 'Baja durante lactancia registrada.'
          : 'Adopción registrada entre camadas.'
      );
      await load();
    } catch {
      setError('No se pudo confirmar el evento de camada.');
    } finally {
      setBusy(false);
    }
  };

  const saveLitterDate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dateCorrection || soloLectura) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { litterId, farrowingDate, expectedCurrentDate, reason, operationKey: opKey } = dateCorrection;
      const response = await fetchOperation(`/api/reproduction/litters/${encodeURIComponent(litterId)}/date-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farrowingDate, expectedCurrentDate, reason, operationKey: opKey }),
      });
      const body = (await response.json()) as { error?: string; replayed?: boolean };
      if (!response.ok) {
        setError(body.error ?? 'No se pudo corregir la fecha real del parto.');
        return;
      }
      setDateCorrection(null);
      setNotice(
        body.replayed
          ? 'La corrección ya estaba registrada; se recuperó el resultado.'
          : 'Fecha real del parto corregida. Se actualizaron las vacunas pendientes vinculadas; las aplicaciones permanecen en el historial.'
      );
      try {
        await load();
      } catch {
        setError('La corrección fue guardada, pero no se pudo actualizar la lista. Pulse Actualizar para consultar el resultado.');
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo confirmar la corrección. Conserve el formulario y reintente.'));
    } finally {
      setBusy(false);
    }
  };

  const saveLitterCounts = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!countCorrection || soloLectura) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const values = Object.fromEntries(birthCountFields.map((field) => [field.key, Number(countCorrection.values[field.key])]));
      const response = await fetchOperation(`/api/reproduction/litters/${encodeURIComponent(countCorrection.litterId)}/correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          expectedCounts: countCorrection.expectedCounts,
          reason: countCorrection.reason,
          operationKey: countCorrection.operationKey,
        }),
      });
      const body = (await response.json()) as { error?: string; replayed?: boolean };
      if (!response.ok) {
        setError(body.error ?? 'No se pudieron corregir las cantidades.');
        return;
      }
      setCountCorrection(null);
      setNotice(body.replayed ? 'La corrección de cantidades ya estaba registrada.' : 'Las cantidades de nacimiento corregidas quedaron guardadas.');
      try {
        await load();
      } catch {
        setError('La corrección fue guardada, pero no se pudo actualizar la lista. Pulse Actualizar.');
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo confirmar la corrección. Conserve el formulario y reintente.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="reproduction-page">
      <PageHeader
        title="Reproducción"
        subtitle="Ciclos reproductivos de marranas, servicios de monta o inseminación, confirmación de gestación y seguimiento de camadas."
        actions={
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => void load().catch((err: unknown) => setError(errorMessage(err, 'Error cargando reproducción.')))}
            aria-label="Actualizar agenda reproductiva"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconRefreshCw size={14} />
              <span>Actualizar agenda</span>
            </span>
          </button>
        }
      />

      {error && !dateCorrection && !countCorrection && !postweaningCycle && !litterEventCycle && (cycles.length > 0 || section === 'registro') && (
        <InlineAlert tone="error" onDismiss={() => setError(null)}>{error}</InlineAlert>
      )}
      {notice && <InlineAlert tone="success" autoDismissMs={6000} onDismiss={() => setNotice(null)}>{notice}</InlineAlert>}

      <ModuleTabs
        label="Secciones del módulo reproductivo"
        active={section}
        onChange={setSection}
        columns={2}
        tabs={[
          { id: 'ciclos', label: 'Ciclos reproductivos', icon: <IconHeart size={14} />, count: cycles.length },
          ...(!soloLectura
            ? [{ id: 'registro', label: 'Registrar servicio / Gestante', icon: <IconPlus size={14} /> }]
            : []),
        ]}
      />

      {section === 'registro' && !soloLectura && (
        <SectionCard
          className="mb-4"
          title={isAntecedent ? 'Ingreso de marrana gestante (antecedente)' : 'Registrar servicio de monta / inseminación'}
          subtitle={isAntecedent
            ? 'Registra preñez confirmada o adquirida sin requerir servicio previo en el sistema.'
            : 'Abre un nuevo ciclo reproductivo vinculando a la marrana y el macho o material genético.'}
          actions={
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-label={isAntecedent ? 'Cambiar a registrar servicio de monta o IA' : 'Cambiar a registrar marrana gestante o antecedente'}
                onClick={() => {
                  setIsAntecedent(!isAntecedent);
                  setForm(initialForm());
                }}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconPlus size={14} />
                  <span>{isAntecedent ? 'Cambiar a servicio monta/IA' : 'Cambiar a antecedente gestante'}</span>
                </span>
              </button>
            </>
          }
        >
          <form onSubmit={submitCycle} className="form-stack">
            <div className="form-sections">
            <fieldset className="form-section">
              <legend>Identificación del ciclo</legend>
            <div className="grid-3">
              <FormField label="Marrana (Hembra reproductora)">
                <select
                  className="form-select"
                  required
                  value={form.femaleCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, femaleCode: e.target.value }))}
                >
                  <option value="">Seleccione marrana</option>
                  {females.map((animal) => (
                    <option key={animal.code} value={animal.code}>
                      {animal.code}
                      {animal.alias ? ` · ${animal.alias}` : ''} · {animal.barnName}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={isAntecedent ? 'Fecha de ingreso / antecedente' : 'Fecha del servicio'}>
                <input
                  type="date"
                  className="form-input"
                  required
                  max={farmToday()}
                  value={form.serviceDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, serviceDate: e.target.value }))}
                />
              </FormField>

              {!isAntecedent && (
                <FormField label="Tipo de servicio">
                  <select
                    className="form-select"
                    value={form.serviceType}
                    onChange={(e) => setForm((prev) => ({ ...prev, serviceType: e.target.value }))}
                  >
                    {Object.entries(serviceLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </div>
            </fieldset>

            {!isAntecedent && (
              <fieldset className="form-section">
                <legend>Padre o material genético</legend>
              <div className="grid-3">
                <FormField label="Origen del material">
                  <select
                    className="form-select"
                    value={form.materialSource}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, materialSource: e.target.value as FormState['materialSource'] }))
                    }
                  >
                    <option value="internal">Verraco de la granja</option>
                    <option value="external">Material externo</option>
                  </select>
                </FormField>

                {form.materialSource === 'internal' ? (
                  <FormField label="Verraco">
                    <select
                      className="form-select"
                      required
                      value={form.sireCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, sireCode: e.target.value }))}
                    >
                      <option value="">Seleccione</option>
                      {sires.map((animal) => (
                        <option key={animal.code} value={animal.code}>
                          {animal.code}
                          {animal.alias ? ` · ${animal.alias}` : ''}
                        </option>
                      ))}
                    </select>
                  </FormField>
                ) : (
                  <FormField label="Procedencia externa">
                    <input
                      className="form-input"
                      required
                      value={form.externalSource}
                      onChange={(e) => setForm((prev) => ({ ...prev, externalSource: e.target.value }))}
                      maxLength={160}
                    />
                  </FormField>
                )}

                <FormField label="Raza del padre/material">
                  <input
                    className="form-input"
                    value={form.sireBreed}
                    onChange={(e) => setForm((prev) => ({ ...prev, sireBreed: e.target.value }))}
                    maxLength={80}
                  />
                </FormField>
              </div>
            </fieldset>
            )}

            <fieldset className="form-section">
              <legend>Parto y antecedentes</legend>
            <div className="grid-3">
              <FormField label={isAntecedent ? 'Fecha probable de parto' : 'Fecha probable manual (opcional)'}>
                <input
                  type="date"
                  className="form-input"
                  required={isAntecedent}
                  value={form.dueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                />
              </FormField>

              {form.dueDate && (
                <FormField label="Motivo de fecha manual">
                  <input
                    className="form-input"
                    required
                    value={form.dueDateReason}
                    onChange={(e) => setForm((prev) => ({ ...prev, dueDateReason: e.target.value }))}
                    maxLength={300}
                  />
                </FormField>
              )}

              <FormField label="Último parto conocido">
                <input
                  type="date"
                  className="form-input"
                  value={form.lastFarrowingDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastFarrowingDate: e.target.value }))}
                />
              </FormField>
            </div>

            <FormField label="Observaciones / antecedentes">
              <textarea
                className="form-textarea"
                rows={2}
                value={form.observations}
                onChange={(e) => setForm((prev) => ({ ...prev, observations: e.target.value }))}
                maxLength={1000}
              />
            </FormField>
            </fieldset>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-outline" data-action="back" disabled={busy} onClick={() => setSection('ciclos')} aria-label="Volver a la lista de ciclos reproductivos">Volver a ciclos</button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy}
                aria-label={busy ? 'Guardando ciclo reproductivo…' : isAntecedent ? 'Guardar marrana gestante e historial' : 'Abrir ciclo y registrar servicio de monta o IA'}
                data-action="save"
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconCheck size={16} />
                  <span>{busy ? 'Guardando…' : isAntecedent ? 'Guardar marrana gestante' : 'Abrir ciclo y registrar servicio'}</span>
                </span>
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {section === 'ciclos' && (
        <>
          {/* Tablero Focal Reproductivo */}
          <div className="grid-4 mb-4">
            <KpiCard
              label="Marranas gestantes"
              icon={<IconHeart size={16} className="text-success" />}
              value={activeCycles.filter((c) => c.reproductiveStatus === 'gestation').length}
              detail="Preñez confirmada en curso"
            />
            <KpiCard
              label="Partos próximos (≤ 7d)"
              icon={<IconCalendar size={16} className="text-warning" />}
              value={activeCycles.filter((c) => ['gestation','possible_pregnancy'].includes(c.reproductiveStatus) && c.daysRemaining >= 0 && c.daysRemaining <= 7).length}
              detail="Atención prioritaria de maternidad"
            />
            <KpiCard
              label="Posible preñez"
              icon={<IconActivity size={16} className="text-primary" />}
              value={activeCycles.filter((c) => c.reproductiveStatus === 'possible_pregnancy').length}
              detail="Evaluación o ecografía pendiente"
            />
            <KpiCard
              label="Ciclos activos"
              icon={<IconHeart size={16} className="text-body" />}
              value={activeCycles.length}
              detail="Marranas en seguimiento"
            />
          </div>

          <SectionCard
            title="Ciclos reproductivos"
            subtitle="Rango inclusivo por fecha del último servicio (antecedente: fecha probable)"
            actions={
              <>
                {!soloLectura && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setSection('registro')}
                    aria-label="Registrar nuevo servicio"
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconPlus size={14} />
                      <span>Nuevo servicio</span>
                    </span>
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={clearFilters}
                    aria-label="Limpiar filtros de ciclos reproductivos"
                  >
                    <span className="inline-flex items-center justify-center gap-2 leading-none">
                      <IconX size={12} />
                      <span>Limpiar filtros</span>
                    </span>
                  </button>
                )}
              </>
            }
          >
        <div className="grid-3 mb-4">
          <FormField label="Desde">
            <input type="date" className="form-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormField>
          <FormField label="Hasta">
            <input type="date" className="form-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormField>
          <FormField label="Estado">
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pendientes</option>
              <option value="all">Todos</option>
              <option value="aborted">Abortados</option>
              <option value="farrowed">Paridos</option>
              <option value="closed">Cerrados</option>
            </select>
          </FormField>
        </div>

        {loading && !cycles.length ? (
          <DataState variant="loading" title="Cargando ciclos reproductivos…" />
        ) : error && !cycles.length ? (
          <DataState
            variant="error"
            title="No se pudieron cargar los ciclos reproductivos"
            description={error}
            action={
              <button
                type="button"
                className="btn btn-outline inline-flex items-center justify-center gap-2"
                onClick={() => {
                  setLoading(true);
                  void load().catch((err) => {
                    setError(errorMessage(err, 'Error cargando reproducción.'));
                    setLoading(false);
                  });
                }}
              >
                <IconRefreshCw size={16} />
                <span>Reintentar</span>
              </button>
            }
          />
        ) : !cycles.length ? (
          <DataState
            variant="empty"
            title="Sin ciclos reproductivos para los filtros seleccionados"
            description="Ajusta las fechas o el estado, o registra un nuevo servicio reproductivo para abrir el ciclo de una marrana."
            icon={<IconHeart size={28} className="text-primary" />}
            action={hasActiveFilters ? <button type="button" className="btn btn-outline inline-flex items-center justify-center gap-2" onClick={clearFilters}><IconX size={16} /><span>Limpiar filtros</span></button> : !soloLectura ? <button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" onClick={() => setSection('registro')}><IconPlus size={16} /><span>Registrar servicio</span></button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cycles.map((cycle) => (
              <article className="reproduction-cycle" key={cycle.id}>
                {/* Header del Ciclo */}
                <header className="data-card-head">
                  <div className="data-card-identity">
                    <div className="inline-flex items-center gap-2 flex-wrap">
                      <span className="arete-badge">{cycle.femaleCode}</span>
                      {cycle.femaleAlias && <span className="font-semibold text-sm">{cycle.femaleAlias}</span>}
                      <StatusBadge className="text-xs tabular-nums font-mono">Ciclo #{cycle.cycleNumber}</StatusBadge>
                      {cycle.antecedent && (
                        <StatusBadge className="text-xs">Antecedente</StatusBadge>
                      )}
                    </div>
                    <span className="data-card-subtitle">
                      {cycle.barnName} · {cycle.locationCode ?? 'Ubicación sin asignar'} · {cycle.lotCode ?? 'Sin lote'} ·{' '}
                      {cycle.femaleBreed ?? 'Raza sin registrar'}
                      {cycle.aptitude ? ` · ${cycle.aptitude}` : ''}
                    </span>
                  </div>

                  <div className="reproduction-due flex flex-col items-end gap-1">
                    <StatusBadge
                      tone={
                        cycle.reproductiveStatus === 'gestation'
                          ? 'success'
                          : cycle.reproductiveStatus === 'possible_pregnancy'
                          ? 'primary'
                          : cycle.reproductiveStatus === 'abortion'
                          ? 'danger'
                          : 'outline'
                      }
                    >
                      {statusLabels[cycle.reproductiveStatus] ?? cycle.reproductiveStatus}
                    </StatusBadge>
                    <StatusBadge
                      className="tabular-nums font-mono"
                      tone={
                        cycle.cycleStatus !== 'open' ? 'outline' : cycle.daysRemaining < 0
                          ? 'danger'
                          : cycle.daysRemaining <= 7
                          ? 'warning'
                          : 'primary'
                      }
                    >
                      <IconCalendar size={13} />
                      <span>{cycle.dueLabel}</span>
                    </StatusBadge>
                    {cycle.cycleStatus === 'open' && <span className="text-xs text-muted tabular-nums font-mono">
                      {cycle.daysRemaining} días
                    </span>}
                  </div>
                </header>

                <DataCardMeta items={[
                  { label: 'Servicio', value: cycle.serviceAnchorDate ?? 'Sin registrar', className: 'font-mono tabular-nums' },
                  { label: 'Parto probable', value: cycle.probableFarrowingDate, className: 'font-mono tabular-nums' },
                  { label: 'Fuente de fecha', value: cycle.dueDateSource === 'manual' ? 'Manual' : `${cycle.gestationDays} días de gestación` },
                  { label: 'Parto real', value: cycle.litter?.farrowingDate ?? cycle.lastFarrowingDate ?? 'Sin registrar', className: 'font-mono tabular-nums' },
                  { label: 'Camada', value: cycle.litter ? `${cycle.litter.femaleAlive + cycle.litter.maleAlive + cycle.litter.unsexedAlive} lechones vivos` : 'Sin camada abierta', className: 'font-mono tabular-nums' },
                ]} />

                {cycle.dueDateReason && (
                  <p className="text-xs text-muted italic mt-2">
                    <strong>Motivo de fecha manual:</strong> {cycle.dueDateReason}
                  </p>
                )}

                {/* Historial de Servicios */}
                {cycle.services.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Servicios ({cycle.services.length})
                    </div>
                    <div className="flex flex-col gap-1">
                      {cycle.services.map((service) => (
                        <div
                          key={service.id}
                          className="text-xs text-muted flex items-center gap-2 flex-wrap p-1.5 rounded card-subtle"
                        >
                          <span className="font-semibold text-body tabular-nums font-mono">{service.serviceDate}</span>
                          <StatusBadge className="text-xs tabular-nums font-mono">#{service.serviceNumber}</StatusBadge>
                          <span>{serviceLabels[service.serviceType] ?? service.serviceType}</span>
                          <span>·</span>
                          <span>
                            Padre/material: <strong>{service.sireCode ?? service.externalSource ?? '—'}</strong>
                            {service.sireBreed ? ` (${service.sireBreed})` : ''}
                          </span>
                          {service.observations && <span className="italic">({service.observations})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Eventos / Palpaciones */}
                {cycle.events.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Eventos y palpaciones ({cycle.events.length})
                    </div>
                    <ol className="timeline">
                      {cycle.events.map((entry) => (
                        <li key={entry.id} className="timeline-item">
                          <span className="timeline-dot" aria-hidden="true" />
                          <div className="timeline-body">
                            <div className="timeline-head">
                              <span className="timeline-title">{entry.eventType}</span>
                              <span className="timeline-date font-mono tabular-nums">{entry.eventDate}</span>
                            </div>
                            <div className="timeline-meta">
                              {entry.physiologicalStatus && (
                                <StatusBadge className="text-xs">
                                  {statusLabels[entry.physiologicalStatus] ?? entry.physiologicalStatus}
                                </StatusBadge>
                              )}
                              {entry.reason && <span className="italic">{entry.reason}</span>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {cycle.observations && (
                  <p className="text-xs text-muted p-2 rounded card-subtle mt-2">
                    <strong>Observaciones:</strong> {cycle.observations}
                  </p>
                )}

                {/* Camada / Parto */}
                {cycle.litter && (
                  <section className="data-card litter-card mt-3" aria-label={`Camada de ${cycle.femaleCode}`}>
                    <DataCardHead
                      title={
                        <span className="inline-flex items-center gap-2">
                          <IconActivity size={15} className="text-primary" />
                          <span>Camada · <span className="tabular-nums font-mono">{cycle.litter.id.slice(0, 8)}</span></span>
                        </span>
                      }
                      subtitle={<>Parto real: <span className="tabular-nums font-mono">{cycle.litter.farrowingDate ?? cycle.lastFarrowingDate ?? 'Sin registrar'}</span></>}
                    />
                    <DataCardMeta items={[
                      { label: 'Hembras vivas', value: cycle.litter.femaleAlive, className: 'font-mono tabular-nums' },
                      { label: 'Machos vivos', value: cycle.litter.maleAlive, className: 'font-mono tabular-nums' },
                      { label: 'Sin sexar', value: cycle.litter.unsexedAlive, className: 'font-mono tabular-nums' },
                      { label: 'Vivos totales', value: cycle.litter.femaleAlive + cycle.litter.maleAlive + cycle.litter.unsexedAlive, className: 'font-mono tabular-nums font-semibold' },
                      { label: 'Destete previsto', value: cycle.litter.expectedWeaningDate ?? 'Sin parámetro', className: 'font-mono tabular-nums' },
                      { label: 'Destete real', value: cycle.litter.actualWeaningDate ?? 'Sin registrar', className: 'font-mono tabular-nums' },
                    ]} />

                    {!soloLectura && (
                      <>
                        <DataCardActions>
                          <button
                            type="button"
                            className="btn btn-primary"
                            aria-label={`Registrar baja, adopción o destete para camada de ${cycle.femaleCode}`}
                            onClick={() => {
                              const nextCycleId = litterEventCycle === cycle.id ? null : cycle.id;
                              setLitterEventCycle(nextCycleId);
                              if (nextCycleId) setLitterEventEffectiveDate(cycle.litter?.farrowingDate ?? farmToday());
                            }}
                          >
                            <IconPlus size={14} />
                            <span>Baja, adopción o destete</span>
                          </button>
                        </DataCardActions>
                        <details className="data-card-disclosure">
                          <summary>
                            <IconEdit size={14} />
                            <span>Corregir datos de la camada</span>
                          </summary>
                          <DataCardActions>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={busy || !(cycle.litter.farrowingDate ?? cycle.lastFarrowingDate)}
                              aria-label={`Corregir fecha real del parto para camada de ${cycle.femaleCode}`}
                              onClick={() => openDateCorrection(cycle)}
                            >
                              <IconEdit size={14} />
                              <span>Corregir fecha real del parto</span>
                            </button>
                            {cycle.litter.birthCounts && !cycle.litter.historicalOnly && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                disabled={busy}
                                aria-label={`Corregir cantidades de lechones para camada de ${cycle.femaleCode}`}
                                onClick={() => openCountCorrection(cycle)}
                              >
                                <IconEdit size={14} />
                                <span>Corregir cantidades</span>
                              </button>
                            )}
                          </DataCardActions>
                        </details>
                      </>
                    )}

                    {/* Corrección de fecha del parto */}
                    {!soloLectura && dateCorrection?.cycleId === cycle.id && (
                      <ModalDialog
                        labelledBy="litter-date-dialog-title"
                        onDismiss={() => setDateCorrection(null)}
                        dismissDisabled={busy}
                      >
                      <form
                        className="form-stack"
                        aria-label="Corrección de fecha real del parto"
                        onSubmit={(event) => void saveLitterDate(event)}
                      >
                        <h4 id="litter-date-dialog-title" className="text-lg font-bold mb-1">Corregir fecha real del parto</h4>
                        {error && <InlineAlert tone="error">{error}</InlineAlert>}
                        <p className="text-xs text-muted">
                          Fecha vigente al abrir: <strong>{dateCorrection.expectedCurrentDate}</strong>. Indique el
                          motivo de la corrección para conservarlo en el historial.
                        </p>
                        <FormField label="Nueva fecha real del parto" htmlFor={`litter-date-${cycle.litter.id}`} labelClassName="text-xs">
                          <input
                            id={`litter-date-${cycle.litter.id}`}
                            type="date"
                            className="form-input"
                            required
                            max={farmToday()}
                            value={dateCorrection.farrowingDate}
                            onChange={(event) =>
                              setDateCorrection((previous) =>
                                previous ? { ...previous, farrowingDate: event.target.value } : previous
                              )
                            }
                          />
                        </FormField>
                        <FormField label="Motivo de la corrección de fecha" htmlFor={`litter-date-reason-${cycle.litter.id}`} labelClassName="text-xs">
                          <textarea
                            id={`litter-date-reason-${cycle.litter.id}`}
                            className="form-textarea"
                            rows={2}
                            required
                            minLength={5}
                            maxLength={300}
                            value={dateCorrection.reason}
                            onChange={(event) =>
                              setDateCorrection((previous) =>
                                previous ? { ...previous, reason: event.target.value } : previous
                              )
                            }
                          />
                        </FormField>
                        <div className="form-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy || dateCorrection.farrowingDate === dateCorrection.expectedCurrentDate}
                            aria-label="Guardar corrección de fecha de parto"
                            data-action="save"
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconCheck size={14} />
                              <span>{busy ? 'Guardando corrección…' : 'Guardar corrección de fecha'}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busy}
                            aria-label="Cancelar corrección de fecha"
                            data-action="back"
                            onClick={() => setDateCorrection(null)}
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconX size={14} />
                              <span>Cancelar</span>
                            </span>
                          </button>
                        </div>
                      </form>
                      </ModalDialog>
                    )}

                    {/* Corrección de cantidades */}
                    {!soloLectura && countCorrection?.cycleId === cycle.id && (
                      <ModalDialog
                        labelledBy="litter-count-dialog-title"
                        onDismiss={() => setCountCorrection(null)}
                        dismissDisabled={busy}
                      >
                      <form
                        className="form-stack"
                        aria-label="Corrección de cantidades de nacimiento"
                        onSubmit={(event) => void saveLitterCounts(event)}
                      >
                        <h4 id="litter-count-dialog-title" className="text-lg font-bold mb-1">Corregir cantidades de nacimiento</h4>
                        {error && <InlineAlert tone="error">{error}</InlineAlert>}
                        <p className="text-xs text-muted">
                          Corrija los nacimientos originales. Las bajas y destetes posteriores se conservarán y se
                          comprobarán antes de guardar.
                        </p>
                        <div className="grid-3">
                          {birthCountFields.map((field) => (
                            <FormField key={field.key} label={field.label} htmlFor={`litter-count-${field.key}`} labelClassName="text-xs">
                              <input
                                id={`litter-count-${field.key}`}
                                type="number"
                                min="0"
                                step="1"
                                required
                                className="form-input"
                                value={countCorrection.values[field.key]}
                                onChange={(event) =>
                                  setCountCorrection((previous) =>
                                    previous
                                      ? {
                                          ...previous,
                                          values: { ...previous.values, [field.key]: event.target.value },
                                        }
                                      : previous
                                  )
                                }
                              />
                            </FormField>
                          ))}
                        </div>
                        <FormField label="Motivo de corrección de cantidades" htmlFor="litter-count-reason" labelClassName="text-xs">
                          <textarea
                            id="litter-count-reason"
                            className="form-textarea"
                            rows={2}
                            required
                            minLength={5}
                            maxLength={300}
                            value={countCorrection.reason}
                            onChange={(event) =>
                              setCountCorrection((previous) =>
                                previous ? { ...previous, reason: event.target.value } : previous
                              )
                            }
                          />
                        </FormField>
                        <div className="form-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            aria-label="Guardar cantidades corregidas de nacimiento"
                            data-action="save"
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconCheck size={14} />
                              <span>Guardar cantidades corregidas</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busy}
                            aria-label="Cancelar corrección de cantidades"
                            data-action="back"
                            onClick={() => setCountCorrection(null)}
                          >
                            <span className="inline-flex items-center justify-center gap-2 leading-none">
                              <IconX size={14} />
                              <span>Cancelar</span>
                            </span>
                          </button>
                        </div>
                      </form>
                      </ModalDialog>
                    )}
                  </section>
                )}

                {/* Plan postdestete */}
                {cycle.weaningPlan && (
                  <p className="text-xs text-muted mt-2">
                    Destete anterior: <strong className="tabular-nums font-mono">{cycle.weaningPlan.referenceWeaningDate}</strong> · +<span className="tabular-nums font-mono font-medium">{cycle.weaningPlan.heatIntervalDays}</span> d: celo previsto <strong className="tabular-nums font-mono">{cycle.weaningPlan.expectedHeatDate}</strong> · +<span className="tabular-nums font-mono font-medium">{cycle.weaningPlan.firstRepeatIntervalDays}</span> d: 1ª repetición <strong className="tabular-nums font-mono">{cycle.weaningPlan.expectedFirstRepeatDate}</strong> · +<span className="tabular-nums font-mono font-medium">{cycle.weaningPlan.secondRepeatIntervalDays}</span> d: 2ª repetición <strong className="tabular-nums font-mono">{cycle.weaningPlan.expectedSecondRepeatDate}</strong>
                  </p>
                )}
                {cycle.weaningPlan && cycle.previousWeaningDate && cycle.weaningPlan.referenceWeaningDate !== cycle.previousWeaningDate && (
                  <InlineAlert tone="warning">
                    El destete real cambió a <strong className="tabular-nums font-mono">{cycle.previousWeaningDate}</strong>; revise y actualice este plan.
                  </InlineAlert>
                )}
                {cycle.weaningPlan && cycle.previousWeaningPending && (
                  <InlineAlert tone="warning">
                    El destete de la camada anterior volvió a quedar pendiente; revise este plan cuando se complete.
                  </InlineAlert>
                )}

                {!soloLectura && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      aria-label={cycle.weaningPlan ? `Editar plan postdestete para ${cycle.femaleCode}` : `Configurar celo y repeticiones para ${cycle.femaleCode}`}
                      onClick={() => setPostweaningCycle(postweaningCycle === cycle.id ? null : cycle.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconCalendar size={12} />
                        <span>{cycle.weaningPlan ? 'Editar plan postdestete' : 'Configurar celo y repeticiones'}</span>
                      </span>
                    </button>
                  </div>
                )}

                {postweaningCycle === cycle.id && (
                  <ModalDialog
                    labelledBy={`postweaning-dialog-title-${cycle.id}`}
                    onDismiss={() => setPostweaningCycle(null)}
                    dismissDisabled={busy}
                  >
                  <form
                    className="form-stack"
                    aria-label={`Plan postdestete para ${cycle.femaleCode}`}
                    onSubmit={(event) => void savePostweaningPlan(event, cycle)}
                  >
                    <h4 id={`postweaning-dialog-title-${cycle.id}`} className="text-lg font-bold mb-1">Plan postdestete</h4>
                    {error && <InlineAlert tone="error">{error}</InlineAlert>}
                    <p className="text-xs text-muted mb-2">{cycle.femaleCode} · ajusta el destete de referencia y los intervalos de celo y repeticiones.</p>
                    <div className="grid-2">
                      <FormField label="Fecha real del destete anterior" labelClassName="text-xs">
                        <input
                          name="referenceWeaningDate"
                          type="date"
                          max={cycle.serviceAnchorDate ?? farmToday()}
                          defaultValue={cycle.previousWeaningDate ?? cycle.weaningPlan?.referenceWeaningDate ?? ''}
                          className="form-input"
                          required
                        />
                        {cycle.previousWeaningDate && (
                          <small className="text-muted">Fecha registrada en camada anterior: {cycle.previousWeaningDate}</small>
                        )}
                      </FormField>
                      <FormField label="Intervalo a celo (días)" labelClassName="text-xs">
                        <input
                          name="heatIntervalDays"
                          type="number"
                          min="1"
                          max="120"
                          defaultValue={cycle.weaningPlan?.heatIntervalDays ?? 5}
                          className="form-input"
                          required
                        />
                      </FormField>
                    </div>

                    <div className="grid-3">
                      {[
                        ['firstRepeatIntervalDays', 'Intervalo primera repetición', cycle.weaningPlan?.firstRepeatIntervalDays ?? 10],
                        ['secondRepeatIntervalDays', 'Intervalo segunda repetición', cycle.weaningPlan?.secondRepeatIntervalDays ?? 20],
                      ].map(([name, label, value]) => (
                        <FormField key={String(name)} label={String(label)} labelClassName="text-xs">
                          <input
                            name={String(name)}
                            type="number"
                            min="1"
                            max="120"
                            defaultValue={Number(value)}
                            className="form-input"
                            required
                          />
                        </FormField>
                      ))}
                    </div>

                    <div className="grid-3">
                      {[
                        ['actualHeatDate', 'Celo observado', cycle.weaningPlan?.actualHeatDate],
                        ['actualFirstRepeatDate', 'Primera repetición observada', cycle.weaningPlan?.actualFirstRepeatDate],
                        ['actualSecondRepeatDate', 'Segunda repetición observada', cycle.weaningPlan?.actualSecondRepeatDate],
                      ].map(([name, label, value]) => (
                        <FormField key={String(name)} label={String(label)} labelClassName="text-xs">
                          <input
                            name={String(name)}
                            type="date"
                            defaultValue={String(value ?? '')}
                            className="form-input"
                          />
                        </FormField>
                      ))}
                    </div>

                    <div className="form-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label="Recalcular y guardar fechas de celo y repeticiones"
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>Recalcular y guardar fechas</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar plan postdestete"
                        data-action="back"
                        onClick={() => setPostweaningCycle(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                  </ModalDialog>
                )}

                {/* Evento de Camada (baja, adopción, destete) */}
                {litterEventCycle === cycle.id && cycle.litter && (
                  <ModalDialog
                    labelledBy={`litter-event-dialog-title-${cycle.id}`}
                    onDismiss={() => setLitterEventCycle(null)}
                    dismissDisabled={busy}
                  >
                  <form
                    className="form-stack"
                    onSubmit={(event) => void saveLitterEvent(event, cycle)}
                  >
                    <h4 id={`litter-event-dialog-title-${cycle.id}`} className="text-lg font-bold mb-1">Baja, adopción o destete</h4>
                    {error && <InlineAlert tone="error">{error}</InlineAlert>}
                    <p className="text-xs text-muted mb-2">{cycle.femaleCode} · camada {cycle.litter.id.slice(0, 8)}</p>
                    <div className="grid-3">
                      <FormField label="Evento" labelClassName="text-xs">
                        <select name="eventType" className="form-select">
                          <option value="weaning">Destete parcial</option>
                          <option value="death">Baja en lactancia</option>
                          <option value="adoption">Adopción hacia otra camada</option>
                        </select>
                      </FormField>
                      <FormField label="Fecha" labelClassName="text-xs">
                        <input
                          name="effectiveDate"
                          type="date"
                          min={cycle.litter.farrowingDate}
                          max={farmToday()}
                          className="form-input"
                          value={litterEventEffectiveDate}
                          onChange={(event) => setLitterEventEffectiveDate(event.target.value)}
                          required
                        />
                      </FormField>
                      <FormField label="Sexo" labelClassName="text-xs">
                        <select name="sex" className="form-select">
                          <option value="hembra">Hembra · quedan {cycle.litter.femaleAlive}</option>
                          <option value="macho">Macho · quedan {cycle.litter.maleAlive}</option>
                          <option value="pendiente">Sin sexar · quedan {cycle.litter.unsexedAlive}</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="grid-3">
                      <FormField label="Cantidad" labelClassName="text-xs">
                        <input name="quantity" type="number" min="1" step="1" className="form-input" required />
                      </FormField>
                      <FormField label="Peso promedio al destete (kg)" labelClassName="text-xs">
                        <input name="weightKg" type="number" min="0.01" step="0.01" className="form-input" />
                      </FormField>
                      <FormField label="Causa de baja (si aplica)" labelClassName="text-xs">
                        <input name="cause" className="form-input" />
                      </FormField>
                    </div>

                    {!!cycle.litter.identifiedAnimals?.length && (
                      <fieldset className="form-group">
                        <legend className="form-label text-xs">Fichas identificadas</legend>
                        <p className="text-xs text-muted">
                          Seleccione las crías que forman parte de la cantidad indicada.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {cycle.litter.identifiedAnimals.map((animal) => (
                            <label key={animal.code} className="inline-flex items-center gap-1.5 text-xs card-subtle p-1.5 rounded">
                              <input type="checkbox" name="animalCodes" value={animal.code} />
                              <span>{animal.code} · {animal.sex}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    <div className="grid-3">
                      <FormField label="Etapa destino (destete)" labelClassName="text-xs">
                        <input name="destinationStageCode" className="form-input" defaultValue="inicio" />
                      </FormField>
                      <FormField label="Galpón destino" labelClassName="text-xs">
                        <input
                          name="destinationBarnId"
                          type="number"
                          min="1"
                          className="form-input"
                          defaultValue={cycle.barnId}
                        />
                      </FormField>
                      <FormField label="Ubicación destino (destete)" labelClassName="text-xs">
                        <input name="destinationLocationCode" className="form-input" />
                      </FormField>
                    </div>

                    <div className="grid-2">
                      <FormField label="Lote destino (destete)" labelClassName="text-xs">
                        <input name="destinationLotCode" className="form-input" />
                      </FormField>
                      <FormField label="Camada destino (adopción)" labelClassName="text-xs">
                        <select name="destinationLitterId" className="form-select">
                          <option value="">Seleccione</option>
                          {targetLitters
                            .filter((target) =>
                              !target.historicalOnly &&
                              target.litterId !== cycle.litter?.id &&
                              target.farrowingDate <= litterEventEffectiveDate
                            )
                            .map((target) => (
                              <option key={target.litterId} value={target.litterId}>
                                {target.motherCode} · {target.barnName} · parto {target.farrowingDate} · {target.litterId.slice(0, 8)}
                              </option>
                            ))}
                        </select>
                      </FormField>
                    </div>

                    <FormField label="Motivo" labelClassName="text-xs">
                      <input name="reason" className="form-input" required minLength={5} />
                    </FormField>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label="Guardar evento de camada (baja, adopción o destete)"
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>Guardar evento de camada</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar evento de camada"
                        data-action="back"
                        onClick={() => setLitterEventCycle(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                  </ModalDialog>
                )}

                {/* Barra de Acciones del Ciclo Abierto */}
                {!soloLectura && cycle.cycleStatus === 'open' && (
                  <div className="form-actions mt-3 pt-2.5 border-t border-subtle flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-muted font-medium">Palpación:</span>
                      <select
                        className="form-select form-select-sm"
                        defaultValue=""
                        aria-label={`Registrar palpación o estado reproductivo para hembra ${cycle.femaleCode}`}
                        onChange={(e) => {
                          if (e.target.value) void recordEvent(cycle, 'palpation', e.target.value);
                          e.currentTarget.value = '';
                        }}
                      >
                        <option value="">Registrar estado…</option>
                        {Object.entries(statusLabels)
                          .filter(([key]) => key !== 'abortion')
                          .map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Confirmar preñez y gestación para ${cycle.femaleCode}`}
                      onClick={() => void recordEvent(cycle, 'pregnancy_confirmed', 'gestation')}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconCheck size={14} className="text-success" />
                        <span>Confirmar gestación</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Registrar servicio o repetición de monta / IA para ${cycle.femaleCode}`}
                      onClick={() => setRepeatCycle(repeatCycle === cycle.id ? null : cycle.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconPlus size={14} />
                        <span>Registrar servicio / repetición</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Definir fecha probable de parto manual para ${cycle.femaleCode}`}
                      onClick={() => setManualCycle(manualCycle === cycle.id ? null : cycle.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconCalendar size={14} />
                        <span>Fecha probable manual</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Registrar parto y camada para ${cycle.femaleCode}`}
                      onClick={() => setFarrowingCycle(farrowingCycle === cycle.id ? null : cycle.id)}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconHeart size={14} className="text-primary" />
                        <span>Registrar parto y camada</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Registrar evento de aborto para ${cycle.femaleCode}`}
                      onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'abortion', reason: '' })}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconAlertTriangle size={14} className="text-warning" />
                        <span>Registrar aborto</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm text-muted"
                      aria-label={`Cerrar ciclo reproductivo para ${cycle.femaleCode}`}
                      onClick={() => setClosureForm({ cycleId: cycle.id, eventType: 'closed', reason: '' })}
                    >
                      <span className="inline-flex items-center justify-center gap-2 leading-none">
                        <IconLock size={14} />
                        <span>Cerrar ciclo</span>
                      </span>
                    </button>
                  </div>
                )}

                {/* Parto y Camada Form */}
                {farrowingCycle === cycle.id && (
                  <form
                    className="form-stack mt-3 p-3 bg-surface rounded border border-border"
                    aria-label={`Registrar parto y camada para ${cycle.femaleCode}`}
                    onSubmit={(event) => void saveFarrowing(event, cycle)}
                  >
                    <div className="grid-3">
                      <FormField label="Fecha del parto" labelClassName="text-xs">
                        <input
                          name="farrowingDate"
                          type="date"
                          max={farmToday()}
                          className="form-input"
                          defaultValue={cycle.probableFarrowingDate}
                          required
                        />
                      </FormField>
                      <FormField label="Número de parto (opcional)" labelClassName="text-xs">
                        <input name="parityNumber" type="number" min="1" step="1" className="form-input" />
                      </FormField>
                      <FormField label="Peso promedio vivo (kg)" labelClassName="text-xs">
                        <input
                          name="averageWeightKg"
                          type="number"
                          min="0.01"
                          max="10"
                          step="0.01"
                          className="form-input"
                        />
                      </FormField>
                    </div>

                    <div className="grid-3">
                      {[
                        ['maleAlive', 'Machos vivos'],
                        ['femaleAlive', 'Hembras vivas'],
                        ['unsexedAlive', 'Vivos sin sexar'],
                        ['maleStillborn', 'Machos nacidos muertos'],
                        ['femaleStillborn', 'Hembras nacidas muertas'],
                        ['unsexedStillborn', 'Muertos sin sexar'],
                      ].map(([name, label]) => (
                        <FormField key={name} label={label} labelClassName="text-xs">
                          <input
                            name={name}
                            type="number"
                            min="0"
                            step="1"
                            defaultValue="0"
                            className="form-input"
                            required
                          />
                        </FormField>
                      ))}
                    </div>

                    <div className="grid-2">
                      <FormField label="Motivo / referencia" labelClassName="text-xs">
                        <input name="reason" className="form-input" required minLength={5} maxLength={300} />
                      </FormField>
                      <FormField label="Observaciones" labelClassName="text-xs">
                        <input name="observations" className="form-input" maxLength={1000} />
                      </FormField>
                    </div>

                    <p className="text-xs text-muted">
                      La madre pasa a Lactancia desde la fecha del parto en su misma ubicación, sin aumentar su cabeza en inventario. Si tiene movimientos posteriores, reconcilie primero su cronología. Los partos previos al ingreso quedan como antecedentes históricos.
                      {' '}Solo los nacidos vivos ingresan al inventario. El destete previsto usa la duración vigente de Lactancia.
                    </p>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label="Guardar parto y cerrar ciclo"
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>Guardar parto y cerrar ciclo</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar registro de parto"
                        data-action="back"
                        onClick={() => setFarrowingCycle(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Aborto / Cierre Form */}
                {closureForm?.cycleId === cycle.id && (
                  <form
                    className="form-stack mt-3 p-3 bg-surface rounded border border-border"
                    aria-label={closureForm.eventType === 'abortion' ? `Registrar aborto para ${cycle.femaleCode}` : `Cerrar ciclo para ${cycle.femaleCode}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void recordEvent(cycle, closureForm.eventType, undefined, closureForm.reason);
                    }}
                  >
                    <FormField label={closureForm.eventType === 'abortion' ? 'Motivo del aborto' : 'Motivo del cierre'} labelClassName="text-xs">
                      <input
                        className="form-input"
                        required
                        minLength={5}
                        maxLength={300}
                        value={closureForm.reason}
                        onChange={(event) =>
                          setClosureForm((previous) =>
                            previous ? { ...previous, reason: event.target.value } : previous
                          )
                        }
                      />
                    </FormField>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label={closureForm.eventType === 'abortion' ? 'Guardar aborto y cerrar ciclo' : 'Guardar motivo de cierre'}
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>
                            {closureForm.eventType === 'abortion' ? 'Guardar aborto y cerrar ciclo' : 'Guardar cierre'}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar cierre"
                        data-action="back"
                        onClick={() => setClosureForm(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Repetición / Nuevo Servicio Form */}
                {repeatCycle === cycle.id && (
                  <form
                    className="form-stack mt-3 p-3 bg-surface rounded border border-border"
                    aria-label={`Registrar nuevo servicio para ${cycle.femaleCode}`}
                    onSubmit={(e) => void addRepeatService(e, cycle)}
                  >
                    <div className="grid-3">
                      <FormField label="Fecha" labelClassName="text-xs">
                        <input
                          name="serviceDate"
                          type="date"
                          className="form-input"
                          min={cycle.serviceAnchorDate ?? undefined}
                          max={farmToday()}
                          required
                        />
                      </FormField>
                      <FormField label="Tipo" labelClassName="text-xs">
                        <select name="serviceType" className="form-select">
                          <option value="inseminacion_artificial">Inseminación artificial</option>
                          <option value="monta_natural">Monta natural</option>
                          <option value="transferencia_embriones">Transferencia de embriones</option>
                        </select>
                      </FormField>
                      <FormField label="Origen" labelClassName="text-xs">
                        <select name="materialSource" className="form-select">
                          <option value="internal">Verraco interno</option>
                          <option value="external">Material externo</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="grid-3">
                      <FormField label="Código del verraco" labelClassName="text-xs">
                        <select name="sireCode" className="form-select">
                          <option value="">Seleccione si aplica</option>
                          {sires.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.code}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Material externo" labelClassName="text-xs">
                        <input name="externalSource" className="form-input" />
                      </FormField>
                      <FormField label="Observaciones" labelClassName="text-xs">
                        <input name="observations" className="form-input" />
                      </FormField>
                    </div>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label="Guardar nuevo servicio para la hembra"
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>Guardar nuevo servicio</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar nuevo servicio"
                        data-action="back"
                        onClick={() => setRepeatCycle(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Fecha probable manual Form */}
                {manualCycle === cycle.id && (
                  <form
                    className="form-stack mt-3 p-3 bg-surface rounded border border-border"
                    aria-label={`Fecha probable manual para ${cycle.femaleCode}`}
                    onSubmit={(e) => void saveManualDue(e, cycle)}
                  >
                    <div className="grid-2">
                      <FormField label="Fecha probable" labelClassName="text-xs">
                        <input
                          name="dueDate"
                          type="date"
                          min={cycle.serviceAnchorDate ?? undefined}
                          className="form-input"
                          defaultValue={cycle.probableFarrowingDate}
                          required
                        />
                      </FormField>
                      <FormField label="Motivo" labelClassName="text-xs">
                        <input name="dueDateReason" className="form-input" required minLength={5} />
                      </FormField>
                    </div>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        aria-label="Guardar fecha probable manual"
                        data-action="save"
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconCheck size={14} />
                          <span>Guardar fecha manual</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={busy}
                        aria-label="Cancelar fecha manual"
                        data-action="back"
                        onClick={() => setManualCycle(null)}
                      >
                        <span className="inline-flex items-center justify-center gap-2 leading-none">
                          <IconX size={14} />
                          <span>Cancelar</span>
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
          </SectionCard>
    </>
  )}
</section>
  );
}
