"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ─── Constantes ────────────────────────────────────────────────────────────────
const C_BLUE   = '#044389';
const C_ORANGE = '#EC4E20';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Vue { niveau: number; nom: string; jours: number | null; divisions: number | null; labelEnfant: string; }

interface Sandbox {
  id: string; userId?: string; nom: string; couleur: string; startDate: string;
  // Système vitalité
  vitalite: number; jokers: number; isFrozenUntil: string | null;
  lastEntropyDay: number; lastHarvestDay: number;
}

interface Ritual {
  _id?: string; id?: number; userId?: string;
  niveau: number; targetNiveau: number; nom: string;
  pattern: Record<number, number[]>; sandboxId: string | null;
  elements: any[]; isGlobal?: boolean;
}

interface Todo {
  id: number; text: string; done: boolean; inherited?: boolean;
  sandboxId?: string | null; sourceRitualId?: string;
  sourceRitualName?: string; sourceRitualLayer?: string;
  createdAt?: number;
}

interface NodeData {
  userId: string; nodeId: string; notes: string;
  todos: Todo[]; sandboxId: string; activeRituals: string[];
}

interface SandboxStats {
  streak: number; streakRecord: number; notesCount: number;
  todosDone: number; todosTotal: number; ritualsCount: number;
}

interface WizardElement { itemType: string; text: string; }
interface WizardData {
  nom: string; couleur: string; date: string;
  targetNiveau: number; pattern: Record<number, number[]>;
  elements: WizardElement[]; isGlobal: boolean;
}
interface WizardState { active: boolean; type: string; step: number; data: WizardData; }

interface ContextMenuItem { label: string; icon?: string; action: () => void; danger?: boolean; separator?: boolean; }
interface ContextMenuState { x: number; y: number; items: ContextMenuItem[]; }

// ─── Structure fractale ────────────────────────────────────────────────────────
const VUES: Record<number, Vue> = {
  0: { niveau: 0, nom: '1 BLOC',    jours: 1,    divisions: 6, labelEnfant: '-'                },
  1: { niveau: 1, nom: '1 JOUR',    jours: 1,    divisions: 6, labelEnfant: 'Bloc de 4h'       },
  2: { niveau: 2, nom: '6 JOURS',   jours: 6,    divisions: 6, labelEnfant: 'Jour'             },
  3: { niveau: 3, nom: '24 JOURS',  jours: 24,   divisions: 4, labelEnfant: 'Période de 6J'   },
  4: { niveau: 4, nom: '96 JOURS',  jours: 96,   divisions: 4, labelEnfant: 'Mois (24J)'      },
  5: { niveau: 5, nom: '384 JOURS', jours: 384,  divisions: 4, labelEnfant: 'Trimestre (96J)' },
  6: { niveau: 6, nom: 'BLOCK',     jours: null, divisions: null, labelEnfant: 'Dimension'    },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
const formatHeures = (b: number) =>
  `${(b * 4).toString().padStart(2, '0')}h00 - ${((b + 1) * 4).toString().padStart(2, '0')}h00`;
const formatTimer = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

const deepClonePattern = (p: Record<number, number[]>): Record<number, number[]> => {
  const c: Record<number, number[]> = {};
  for (let k = 0; k <= 5; k++) c[k] = Array.isArray(p[k]) ? [...p[k]] : [];
  return c;
};
const emptyPattern = (): Record<number, number[]> => ({ 5: [], 4: [], 3: [], 2: [], 1: [], 0: [] });

const defaultVitality = () => ({ vitalite: 50, jokers: 0, isFrozenUntil: null, lastEntropyDay: 0, lastHarvestDay: 0 });

// Vitalité → classes CSS Tailwind
const getVitalityClasses = (v: number) => {
  if (v < 30) return 'grayscale opacity-40';
  if (v > 70) return 'saturate-150 brightness-110';
  return '';
};
const getVitalityStyle = (sb: Sandbox): React.CSSProperties =>
  sb.vitalite > 70 ? { boxShadow: `0 0 24px ${sb.couleur}88` } : {};

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AgendaExtremeMinimalism() {
  const { data: session, status } = useSession();
  const router = useRouter();
  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status, router]);

  // ── State principal ────────────────────────────────────────────────────────
  const [isReady,         setIsReady]         = useState(false);
  const [niveau,          setNiveau]          = useState(6);
  const [activeDay,       setActiveDay]       = useState(0);
  const [activeBlock,     setActiveBlock]     = useState(0);
  const [sandboxes,       setSandboxes]       = useState<Sandbox[]>([]);
  const [activeSandboxId, setActiveSandboxId] = useState<string | null>(null);
  const [parametres,      setParametres]      = useState<Record<string, NodeData>>({});
  const [rituels,         setRituels]         = useState<Ritual[]>([]);
  const [zoomStyle,       setZoomStyle]       = useState('scale-100 opacity-100 transition-all duration-500 ease-out');

  // ── State UI ───────────────────────────────────────────────────────────────
  const [isSidebarOpen,   setIsSidebarOpen]   = useState(false);
  const [localInputValue, setLocalInputValue] = useState('');
  const [wizTaskInput,    setWizTaskInput]    = useState('');
  const [focusTimer,      setFocusTimer]      = useState({ active: false, running: false, seconds: 0, mode: 'up' as 'up' | 'down', preset: 25 * 60 });
  const [showRevue,       setShowRevue]       = useState(false);
  const [showStreakAlert, setShowStreakAlert]  = useState(false);
  const [isTouchDevice,   setIsTouchDevice]   = useState(false);

  // ── Info Panel (flottant draggable) ────────────────────────────────────────
  const [infoPanelOpen,   setInfoPanelOpen]   = useState(false);
  const [infoPanelMin,    setInfoPanelMin]    = useState(false);
  const [panelPos,        setPanelPos]        = useState({ x: 0, y: 0 });
  const [infoPanelCtx,    setInfoPanelCtx]    = useState<{ type: 'view' | 'ritual' | 'sandbox'; payload?: any }>({ type: 'view' });
  const panelDragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // ── Context Menu ───────────────────────────────────────────────────────────
  const [contextMenu,     setContextMenu]     = useState<ContextMenuState | null>(null);

  // ── Note Editor fullscreen ─────────────────────────────────────────────────
  const [noteEditorOpen,  setNoteEditorOpen]  = useState(false);
  const [noteEditorValue, setNoteEditorValue] = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const paramsRef            = useRef<Record<string, NodeData>>({});
  const saveQueue            = useRef<Record<string, NodeJS.Timeout>>({});
  const timerIntervalRef     = useRef<NodeJS.Timeout | null>(null);
  const longPressRef         = useRef<NodeJS.Timeout | null>(null);
  const streakAlertDismissed = useRef(false);
  const importInputRef       = useRef<HTMLInputElement>(null);
  
  // Navigation refs (Scroll & Pinch)
  const wheelTimeout         = useRef<NodeJS.Timeout | null>(null);
  const pinchStartRef        = useRef<number | null>(null);
  const pinchTriggeredRef    = useRef<boolean>(false);

  const defaultWizardData: WizardData = {
    nom: '', couleur: C_BLUE, date: new Date().toISOString().split('T')[0],
    targetNiveau: 0, pattern: emptyPattern(), elements: [], isGlobal: false,
  };
  const [wizard, setWizard] = useState<WizardState>({ active: false, type: 'DIMENSION', step: 0, data: defaultWizardData });

  // ── Dérivés ────────────────────────────────────────────────────────────────
  const activeSandbox   = activeSandboxId ? sandboxes.find(sb => sb.id === activeSandboxId) : null;
  const systemStartDate = activeSandbox?.startDate ? new Date(activeSandbox.startDate) : new Date();
  const MAINTENANT          = new Date();
  const startMidnight       = new Date(systemStartDate).setHours(0, 0, 0, 0);
  const todayMidnight       = new Date(MAINTENANT).setHours(0, 0, 0, 0);
  const indexJourAujourdhui = Math.floor((todayMidnight - startMidnight) / 86_400_000);
  const indexBlocAujourdhui = Math.floor(MAINTENANT.getHours() / 4);

  const getChunkStart = () =>
    niveau < 6 && VUES[niveau].jours
      ? Math.floor(activeDay / VUES[niveau].jours!) * VUES[niveau].jours!
      : 0;
  const chunkStart = getChunkStart();

  const getDateFromIndex = useCallback((idx: number) => {
    const d = new Date(systemStartDate); d.setDate(d.getDate() + idx); return d;
  }, [systemStartDate]);

  const getComputedNodeId = useCallback((sbId: string | null, niv: number, day: number, block = 0) => {
    const prefix = sbId ? `${sbId}_` : '';
    if (niv === 0) return `${prefix}lvl0-jour${day}-bloc${block}`;
    if (niv === 1) return `${prefix}lvl1-jour${day}`;
    return `${prefix}lvl${niv}-start${Math.floor(day / (VUES[niv].jours ?? 1)) * (VUES[niv].jours ?? 1)}`;
  }, []);

  const nodeId   = niveau < 6 ? getComputedNodeId(activeSandboxId, niveau, activeDay, activeBlock) : 'ROOT';
  const nodeData = parametres[nodeId] ?? { notes: '', todos: [], activeRituals: [] };
  const filteredRituels = activeSandboxId
    ? rituels.filter(r => r.niveau === niveau && (r.sandboxId === activeSandboxId || r.sandboxId === null))
    : [];

  // ── isDayActive ────────────────────────────────────────────────────────────
  const isDayActive = useCallback((sbId: string, d: number): boolean => {
    const k1 = `${sbId}_lvl1-jour${d}`;
    if ((parametres[k1]?.notes ?? '').trim() || (parametres[k1]?.todos ?? []).length) return true;
    return [0,1,2,3,4,5].some(b => {
      const k0 = `${sbId}_lvl0-jour${d}-bloc${b}`;
      return (parametres[k0]?.notes ?? '').trim() || (parametres[k0]?.todos ?? []).length;
    });
  }, [parametres]);

  // ── Méthode Statistiques Arborescence ──────────────────────────────────────
  const getNodeStats = useCallback((checkNiv: number, startDay: number, block = 0): { localTodos: number; localDone: number; totalTodos: number; totalDone: number; localRituals: number; totalRituals: number } => {
    if (!activeSandboxId) return { localTodos: 0, localDone: 0, totalTodos: 0, totalDone: 0, localRituals: 0, totalRituals: 0 };

    const key = getComputedNodeId(activeSandboxId, checkNiv, startDay, block);
    const node = parametres[key] || { todos: [], activeRituals: [] };

    const localTodos = node.todos?.length || 0;
    const localDone = node.todos?.filter(t => t.done).length || 0;
    const localRituals = node.activeRituals?.length || 0;

    let totalTodos = localTodos;
    let totalDone = localDone;
    let totalRituals = localRituals;

    if (checkNiv === 1) {
      for (let b = 0; b <= 5; b++) {
        const childStats = getNodeStats(0, startDay, b);
        totalTodos += childStats.totalTodos;
        totalDone += childStats.totalDone;
        totalRituals += childStats.totalRituals;
      }
    } else if (checkNiv > 1 && checkNiv < 6) {
      const childNiv = checkNiv - 1;
      const childDaySize = VUES[childNiv].jours ?? 1;
      const divs = VUES[checkNiv].divisions ?? 1;
      for (let i = 0; i < divs; i++) {
        const childStats = getNodeStats(childNiv, startDay + i * childDaySize, 0);
        totalTodos += childStats.totalTodos;
        totalDone += childStats.totalDone;
        totalRituals += childStats.totalRituals;
      }
    }

    return { localTodos, localDone, totalTodos, totalDone, localRituals, totalRituals };
  }, [activeSandboxId, parametres, getComputedNodeId]);

  // ── Badges — tâches actives (count) et présence rituel ────────────────────
  const countActiveTasks = useCallback((startDay: number, checkNiv: number, block = 0): number => {
    const stats = getNodeStats(checkNiv, startDay, block);
    return stats.totalTodos - stats.totalDone;
  }, [getNodeStats]);

  // Retourne true si le bloc LUI-MÊME possède un rituel actif
  const hasRitualAtBlock = useCallback((startDay: number, checkNiv: number, block = 0): boolean => {
    if (!activeSandboxId) return false;
    const key = getComputedNodeId(activeSandboxId, checkNiv, startDay, block);
    return (parametres[key]?.activeRituals?.length ?? 0) > 0;
  }, [activeSandboxId, parametres, getComputedNodeId]);

  // ── Stats dimension ────────────────────────────────────────────────────────
  const sandboxStats = useMemo((): Record<string, SandboxStats> => {
    const result: Record<string, SandboxStats> = {};
    sandboxes.forEach(sb => {
      const prefix  = `${sb.id}_`;
      const sbNodes = Object.entries(parametres).filter(([k]) => k.startsWith(prefix));
      let notesCount = 0, todosDone = 0, todosTotal = 0;
      sbNodes.forEach(([, d]) => {
        if ((d.notes ?? '').trim()) notesCount++;
        (d.todos ?? []).forEach(t => { todosTotal++; if (t.done) todosDone++; });
      });
      const ritualsCount = rituels.filter(r => r.sandboxId === sb.id).length;
      const sbStartMs = new Date(sb.startDate).setHours(0, 0, 0, 0);
      const todayMs   = new Date().setHours(0, 0, 0, 0);
      const todayIdx  = Math.max(0, Math.floor((todayMs - sbStartMs) / 86_400_000));
      let streak = 0, streakRecord = 0, current = 0;
      const startDay = isDayActive(sb.id, todayIdx) ? todayIdx : todayIdx - 1;
      for (let d = startDay; d >= 0; d--) {
        if (isDayActive(sb.id, d)) { streak++; current++; if (current > streakRecord) streakRecord = current; }
        else { if (streak > 0) break; current = 0; }
      }
      streakRecord = Math.max(streakRecord, streak);
      result[sb.id] = { streak, streakRecord, notesCount, todosDone, todosTotal, ritualsCount };
    });
    return result;
  }, [sandboxes, parametres, rituels, isDayActive]);

  // ── Revue période ──────────────────────────────────────────────────────────
  const isRevuePeriod = niveau >= 2 && niveau <= 5 && (() => {
    const jours = VUES[niveau].jours ?? 0;
    const daysLeft = (chunkStart + jours - 1) - indexJourAujourdhui;
    return daysLeft >= 0 && daysLeft <= 1;
  })();

  const revueStats = useMemo(() => {
    if (!activeSandboxId || !isRevuePeriod) return null;
    const jours = VUES[niveau].jours ?? 0;
    let todos = 0, done = 0, notes = 0;
    for (let d = chunkStart; d < chunkStart + jours; d++) {
      for (let niv = 0; niv <= 2; niv++) {
        const nd = parametres[getComputedNodeId(activeSandboxId, niv, d)];
        if (!nd) continue;
        if ((nd.notes ?? '').trim()) notes++;
        (nd.todos ?? []).forEach(t => { todos++; if (t.done) done++; });
      }
    }
    return { todos, done, notes, period: `${formatDate(getDateFromIndex(chunkStart))} — ${formatDate(getDateFromIndex(chunkStart + jours - 1))}` };
  }, [activeSandboxId, isRevuePeriod, niveau, chunkStart, parametres, getComputedNodeId, getDateFromIndex]);

  // ── Persistance locale ─────────────────────────────────────────────────────
  useEffect(() => {
    const savedNiv = parseInt(localStorage.getItem('fractal_niveau') ?? '6');
    const savedSb  = localStorage.getItem('fractal_sandbox');
    if (savedNiv < 6 && (!savedSb || savedSb === 'null')) {
      setNiveau(6); setActiveSandboxId(null);
    } else {
      setNiveau(savedNiv);
      setActiveSandboxId(savedSb === 'null' ? null : savedSb);
    }
    setActiveDay  (parseInt(localStorage.getItem('fractal_day')   ?? '0'));
    setActiveBlock(parseInt(localStorage.getItem('fractal_block') ?? '0'));
    setIsReady(true);
    // Init panel position
    setPanelPos({ x: window.innerWidth - 300, y: 80 });
  }, []);

  useEffect(() => {
    if (!isReady) return;
    localStorage.setItem('fractal_niveau',  niveau.toString());
    localStorage.setItem('fractal_day',     activeDay.toString());
    localStorage.setItem('fractal_block',   activeBlock.toString());
    localStorage.setItem('fractal_sandbox', activeSandboxId ?? 'null');
  }, [niveau, activeDay, activeBlock, activeSandboxId, isReady]);

  // ── Touch device detection ─────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    setIsTouchDevice(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // ── API load + migration vitalité ──────────────────────────────────────────
  useEffect(() => {
    if (!session || !isReady) return;
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/rituals').then(r => r.json()),
      fetch('/api/nodedata').then(r => r.json()),
    ]).then(([settingsData, ritualsData, nodesData]) => {
      const raw: Sandbox[] = settingsData.sandboxes ?? [];
      const now = new Date();
      let needsSave = false;
      const loadedSandboxes = raw.map(sb => {
        let s = { ...defaultVitality(), ...sb } as Sandbox;
        const sbStartMs = new Date(s.startDate).setHours(0, 0, 0, 0);
        const todayIdx  = Math.max(0, Math.floor((now.setHours(0,0,0,0) - sbStartMs) / 86_400_000));
        const isFrozen  = s.isFrozenUntil ? new Date() <= new Date(s.isFrozenUntil) : false;
        // Entropie
        const cycle6 = Math.floor(todayIdx / 6);
        const lastEC = Math.floor((s.lastEntropyDay ?? 0) / 6);
        if (cycle6 > lastEC) {
          if (!isFrozen) s.vitalite = Math.max(0, s.vitalite - 10 * (cycle6 - lastEC));
          s.lastEntropyDay = cycle6 * 6; needsSave = true;
        }
        // Récolte
        const cycle24 = Math.floor(todayIdx / 24);
        const lastHC  = Math.floor((s.lastHarvestDay ?? 0) / 24);
        if (cycle24 > lastHC) {
          if (s.vitalite >= 80) { s.jokers += 1; needsSave = true; }
          s.lastHarvestDay = cycle24 * 24; needsSave = true;
        }
        return s;
      });
      setSandboxes(loadedSandboxes);
      if (activeSandboxId && !loadedSandboxes.some(sb => sb.id === activeSandboxId)) { setActiveSandboxId(null); setNiveau(6); }
      if (needsSave && session) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: loadedSandboxes }) });
      const validRituels: Ritual[] = Array.isArray(ritualsData) ? ritualsData : [];
      setRituels(validRituels);
      const validRitualIds = validRituels.map(r => r._id ?? r.id);
      if (Array.isArray(nodesData)) {
        const formatted: Record<string, NodeData> = {};
        const purgeUpdates: any[] = [];
        nodesData.forEach((n: NodeData) => {
          const cleanTodos   = (n.todos ?? []).filter(t => !t.inherited || validRitualIds.includes(t.sourceRitualId));
          const cleanRituals = (n.activeRituals ?? []).filter(id => validRitualIds.includes(id));
          const hasPhantoms  = cleanTodos.length !== (n.todos ?? []).length || cleanRituals.length !== (n.activeRituals ?? []).length;
          if (hasPhantoms) purgeUpdates.push({ nodeId: n.nodeId, todos: cleanTodos, activeRituals: cleanRituals });
          formatted[n.nodeId] = { ...n, todos: cleanTodos, activeRituals: cleanRituals };
        });
        setParametres(formatted); paramsRef.current = formatted;
        if (purgeUpdates.length > 0) fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: purgeUpdates }) });
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isReady, activeSandboxId]);

  // ── Sandbox helpers ────────────────────────────────────────────────────────
  const saveSandboxes = useCallback((updated: Sandbox[]) => {
    setSandboxes(updated);
    if (session) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updated }) });
  }, [session]);

  const updateSandbox = useCallback((id: string, patch: Partial<Sandbox>) => {
    setSandboxes(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      if (session) fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updated }) });
      return updated;
    });
  }, [session]);

  // ── Focus Timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (focusTimer.running) {
      timerIntervalRef.current = setInterval(() => {
        setFocusTimer(prev => {
          if (prev.mode === 'up') return { ...prev, seconds: prev.seconds + 1 };
          const next = prev.seconds - 1;
          if (next <= 0) { clearInterval(timerIntervalRef.current!); return { ...prev, running: false, seconds: 0 }; }
          return { ...prev, seconds: next };
        });
      }, 1000);
    } else if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [focusTimer.running]);

  // ── Streak alert ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSandboxId || streakAlertDismissed.current) return;
    const s = sandboxStats[activeSandboxId];
    if (!s || s.streak === 0 || new Date().getHours() < 18) return;
    const sbStartMs = new Date(activeSandbox?.startDate ?? '').setHours(0, 0, 0, 0);
    const todayIdx  = Math.floor((new Date().setHours(0,0,0,0) - sbStartMs) / 86_400_000);
    if (!isDayActive(activeSandboxId, todayIdx)) setShowStreakAlert(true);
  }, [activeSandboxId, sandboxStats, isDayActive, activeSandbox?.startDate]);

  // ── NodeData ───────────────────────────────────────────────────────────────
  const setNodeData = useCallback((updater: ((c: NodeData) => NodeData) | NodeData, targetId = nodeId) => {
    if (niveau === 6) return;
    const current  = paramsRef.current[targetId] ?? { notes: '', todos: [], activeRituals: [] };
    const resolved = typeof updater === 'function' ? updater(current) : updater;
    const updated  = { ...current, ...resolved };
    paramsRef.current = { ...paramsRef.current, [targetId]: updated };
    setParametres({ ...paramsRef.current });
    if (session) {
      clearTimeout(saveQueue.current[targetId]);
      saveQueue.current[targetId] = setTimeout(() => {
        fetch('/api/nodedata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
      }, 500);
    }
  }, [niveau, nodeId, session]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const naviguer = useCallback((newNiveau: number, cibleJour: number | null = null, cibleBloc: number | null = null, sbCible: string | null = null) => {
    if (newNiveau === niveau || newNiveau < 0 || newNiveau > 6) return;
    setContextMenu(null);
    const applyTransition = (enter: string, exit: string, apply: () => void) => {
      setZoomStyle(`transition-all duration-400 ease-in-out opacity-0 ${enter}`);
      setTimeout(() => {
        apply();
        setZoomStyle(`transition-none opacity-0 ${exit}`);
        requestAnimationFrame(() => requestAnimationFrame(() => setZoomStyle('transition-all duration-500 ease-out opacity-100 scale-100')));
      }, 300);
    };
    if (newNiveau === 6) { applyTransition('scale-[0.8]', 'scale-[1.2]', () => { setActiveSandboxId(null); setNiveau(6); }); return; }
    if (niveau === 6 && sbCible) { applyTransition('scale-[1.2]', 'scale-[0.8]', () => { setActiveSandboxId(sbCible); setNiveau(5); }); return; }
    const isZoomIn = newNiveau < niveau;
    applyTransition(isZoomIn ? 'scale-[1.2]' : 'scale-[0.8]', isZoomIn ? 'scale-[0.8]' : 'scale-[1.2]', () => {
      if (cibleJour  !== null) setActiveDay(cibleJour);
      if (cibleBloc  !== null) setActiveBlock(cibleBloc);
      setNiveau(newNiveau);
    });
  }, [niveau]);

  // ── Gestures & Wheel (Zoom in/out) ─────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    if (isSidebarOpen || contextMenu) return;
    if (wheelTimeout.current) return; // Anti-spam

    wheelTimeout.current = setTimeout(() => {
      wheelTimeout.current = null;
    }, 700);

    if (e.deltaY > 20) {
      // Scroll down -> Zoom OUT (ex: 24J -> 96J) -> niveau + 1
      if (niveau < 6) naviguer(niveau + 1);
    } else if (e.deltaY < -20) {
      // Scroll up -> Zoom IN (ex: 96J -> 24J) -> niveau - 1
      if (niveau === 6 && !activeSandboxId) return; // Impossible de zoomer depuis la racine sans choisir
      if (niveau > 0) naviguer(niveau - 1);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchStartRef.current = dist;
      pinchTriggeredRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isSidebarOpen || contextMenu || e.touches.length < 2 || pinchStartRef.current === null || pinchTriggeredRef.current) return;

    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const delta = dist - pinchStartRef.current;

    // Seuil de déclenchement du pinch
    if (Math.abs(delta) > 60) {
      pinchTriggeredRef.current = true;
      if (delta > 0) {
        // Pinch OUT (écarter) -> Zoom IN -> niveau - 1
        if (niveau === 6 && !activeSandboxId) return;
        if (niveau > 0) naviguer(niveau - 1);
      } else {
        // Pinch IN (pincer) -> Zoom OUT -> niveau + 1
        if (niveau < 6) naviguer(niveau + 1);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
      pinchTriggeredRef.current = false;
    }
  };

  // ── Context Menu helpers ───────────────────────────────────────────────────
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openContextMenu = useCallback((e: React.MouseEvent | { clientX: number; clientY: number }, items: ContextMenuItem[]) => {
    if ('preventDefault' in e) (e as React.MouseEvent).preventDefault();
    const x = Math.min(e.clientX, window.innerWidth  - 200);
    const y = Math.min(e.clientY, window.innerHeight - items.length * 38 - 20);
    setContextMenu({ x, y, items });
  }, []);

  const startLongPress = useCallback((items: ContextMenuItem[]) => (e: React.TouchEvent) => {
    const t = e.touches[0];
    longPressRef.current = setTimeout(() => {
      openContextMenu({ clientX: t.clientX, clientY: t.clientY }, items);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 550);
  }, [openContextMenu]);

  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }, []);

  // ── Info Panel — drag ──────────────────────────────────────────────────────
  const handlePanelDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    panelDragRef.current = { x: cx, y: cy, px: panelPos.x, py: panelPos.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!panelDragRef.current) return;
      const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const nx = Math.max(0, Math.min(window.innerWidth - 260, panelDragRef.current.px + cx - panelDragRef.current.x));
      const ny = Math.max(0, Math.min(window.innerHeight - 120, panelDragRef.current.py + cy - panelDragRef.current.y));
      setPanelPos({ x: nx, y: ny });
    };
    const onUp = () => { panelDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, []);

  // ── Wizard ─────────────────────────────────────────────────────────────────
  const startWizard = (type: string) => {
    setIsSidebarOpen(false); setContextMenu(null);
    setWizard({ active: true, type, step: 0, data: { ...defaultWizardData, targetNiveau: Math.max(0, niveau - 1) } });
  };
  const closeWizard = () => setWizard(prev => ({ ...prev, active: false }));

  const submitWizard = async () => {
    if (wizard.type === 'DIMENSION') {
      if (!wizard.data.nom.trim()) return;
      const newSb: Sandbox = { id: `sb_${Date.now()}`, nom: wizard.data.nom.toUpperCase(), couleur: wizard.data.couleur, startDate: new Date(wizard.data.date).toISOString(), ...defaultVitality() };
      saveSandboxes([...sandboxes, newSb]);
    } else {
      if (!wizard.data.nom.trim() || wizard.data.elements.length === 0) return;
      const payload = { sandboxId: wizard.data.isGlobal ? null : activeSandboxId, niveau, nom: wizard.data.nom, targetNiveau: wizard.data.targetNiveau, pattern: wizard.data.pattern, elements: wizard.data.elements, isGlobal: wizard.data.isGlobal };
      if (session) {
        const res = await fetch('/api/rituals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { const r = await res.json(); setRituels(prev => [...prev, r]); }
      } else setRituels(prev => [...prev, { ...payload, id: Date.now() }]);
    }
    closeWizard();
  };

  // ── generateTargetNodeIds ──────────────────────────────────────────────────
  const generateTargetNodeIds = useCallback((baseNiveau: number, baseStartDay: number, pattern: Record<number, number[]>, targetNiveau = 0) => {
    let currentNodes: { day: number; block: number }[] = [{ day: baseStartDay, block: 0 }];
    for (let currentLevel = baseNiveau; currentLevel > targetNiveau; currentLevel--) {
      const nextNodes: { day: number; block: number }[] = [];
      const childLevel = currentLevel - 1, numChildren = VUES[currentLevel].divisions ?? 1, childDaySize = VUES[childLevel].jours ?? 1;
      currentNodes.forEach(node => {
        const selected = (pattern ?? {})[childLevel] ?? [];
        const toExpand = selected.length === 0 ? Array.from({ length: numChildren }, (_, i) => i) : selected;
        toExpand.forEach(i => {
          if (childLevel === 0) nextNodes.push({ day: node.day, block: i });
          else nextNodes.push({ day: node.day + i * childDaySize, block: 0 });
        });
      });
      currentNodes = nextNodes;
    }
    return currentNodes.map(n => getComputedNodeId(activeSandboxId, targetNiveau, n.day, n.block));
  }, [activeSandboxId, getComputedNodeId]);

  // ── Joker ──────────────────────────────────────────────────────────────────
  const useJoker = (sb: Sandbox) => {
    if (sb.jokers <= 0) return;
    const frozenUntil = new Date(); frozenUntil.setDate(frozenUntil.getDate() + 6);
    updateSandbox(sb.id, { jokers: sb.jokers - 1, isFrozenUntil: frozenUntil.toISOString() });
  };

  // ── Sandbox CRUD ───────────────────────────────────────────────────────────
  const supprimerSandbox = async (sb: Sandbox) => {
    if (!confirm(`Supprimer "${sb.nom}" ? Irréversible.`)) return;
    const updated = sandboxes.filter(s => s.id !== sb.id);
    const newParams = { ...paramsRef.current };
    Object.keys(newParams).filter(k => k.startsWith(`${sb.id}_`)).forEach(k => delete newParams[k]);
    paramsRef.current = newParams; setParametres(newParams);
    const sbRituals = rituels.filter(r => r.sandboxId === sb.id);
    setRituels(prev => prev.filter(r => r.sandboxId !== sb.id));
    saveSandboxes(updated);
    if (session) await Promise.all(sbRituals.map(r => fetch(`/api/rituals?id=${r._id ?? r.id}`, { method: 'DELETE' })));
  };

  const exportDimension = (sb: Sandbox) => {
    const nodes   = Object.entries(paramsRef.current).filter(([k]) => k.startsWith(`${sb.id}_`)).map(([, v]) => v);
    const rituals = rituels.filter(r => r.sandboxId === sb.id);
    const blob    = new Blob([JSON.stringify({ version: 1, sandbox: sb, rituals, nodes }, null, 2)], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a'); a.href = url;
    a.download = `${sb.nom.toLowerCase().replace(/\s+/g, '-')}-export.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const importDimension = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !data.sandbox) { alert('Format invalide'); return; }
      const newId  = `sb_${Date.now()}`;
      const newSb: Sandbox = { ...defaultVitality(), ...data.sandbox, id: newId, nom: data.sandbox.nom + '_IMP' };
      const oldPrefix = `${data.sandbox.id}_`, newPrefix = `${newId}_`;
      const newParams = { ...paramsRef.current };
      (data.nodes ?? []).forEach((n: NodeData) => { const key = n.nodeId.replace(oldPrefix, newPrefix); newParams[key] = { ...n, nodeId: key, sandboxId: newId }; });
      paramsRef.current = newParams; setParametres(newParams);
      const newRituels = (data.rituals ?? []).map((r: Ritual) => ({ ...r, _id: undefined, id: Date.now() + Math.random(), sandboxId: newId }));
      setRituels(prev => [...prev, ...newRituels]);
      saveSandboxes([...sandboxes, newSb]);
      if (session) {
        const nodeUpdates = Object.values(newParams).filter(n => (n.nodeId ?? '').startsWith(newPrefix));
        if (nodeUpdates.length > 0) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: nodeUpdates }) });
        for (const r of newRituels) await fetch('/api/rituals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
      }
    } catch { alert("Erreur lors de l'import"); }
    e.target.value = '';
  };

  // ── Rituels ────────────────────────────────────────────────────────────────
  const toggleRitualActivation = async (rituel: Ritual) => {
    const rituelId     = (rituel._id ?? rituel.id) as string;
    const currentNode  = paramsRef.current[nodeId] ?? { activeRituals: [] };
    const isActivating = !(currentNode.activeRituals ?? []).includes(rituelId);
    const newAR        = isActivating ? [...(currentNode.activeRituals ?? []), rituelId] : (currentNode.activeRituals ?? []).filter(id => id !== rituelId);
    paramsRef.current  = { ...paramsRef.current, [nodeId]: { ...currentNode, activeRituals: newAR } };
    const targetNodeIds = generateTargetNodeIds(rituel.niveau, chunkStart, rituel.pattern, rituel.targetNiveau);
    const updates = [{ nodeId, todos: currentNode.todos ?? [], activeRituals: newAR }];
    const ritualLayer = VUES[rituel.niveau]?.nom ?? rituel.nom;
    targetNodeIds.forEach(childId => {
      const childData = paramsRef.current[childId] ?? { todos: [], activeRituals: [] };
      let newTodos = [...(childData.todos ?? [])];
      if (isActivating) {
        (rituel.elements ?? []).forEach(el => {
          if (!newTodos.some(t => t.sourceRitualId === rituelId && t.text === el.text))
            newTodos.push({ id: Date.now() + Math.random(), text: el.text, done: false, inherited: true, sourceRitualId: rituelId, sourceRitualName: rituel.nom, sourceRitualLayer: ritualLayer, sandboxId: activeSandboxId, createdAt: Date.now() });
        });
      } else newTodos = newTodos.filter(t => t.sourceRitualId !== rituelId);
      paramsRef.current[childId] = { ...childData, todos: newTodos };
      updates.push({ nodeId: childId, todos: newTodos, activeRituals: childData.activeRituals ?? [] });
    });
    setParametres({ ...paramsRef.current });
    if (session) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
  };

  const supprimerRituelBase = async (rituel: Ritual) => {
    if (!confirm('Désintégrer ce modèle ?')) return;
    const rituelId = (rituel._id ?? rituel.id) as string;
    const updates: any[] = [];
    Object.keys(paramsRef.current).forEach(nodeKey => {
      const node = paramsRef.current[nodeKey];
      const newTodos = (node.todos ?? []).filter(t => t.sourceRitualId !== rituelId);
      const newAR    = (node.activeRituals ?? []).filter(id => id !== rituelId);
      if (newTodos.length !== (node.todos ?? []).length || newAR.length !== (node.activeRituals ?? []).length) {
        paramsRef.current[nodeKey] = { ...node, todos: newTodos, activeRituals: newAR };
        updates.push({ nodeId: nodeKey, todos: newTodos, activeRituals: newAR });
      }
    });
    setParametres({ ...paramsRef.current });
    setRituels(prev => prev.filter(r => (r._id ?? r.id) !== rituelId));
    if (session) {
      await fetch(`/api/rituals?id=${rituelId}`, { method: 'DELETE' });
      if (updates.length > 0) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
    }
  };

  const toggleRituelGlobal = async (rituel: Ritual) => {
    const rituelId  = (rituel._id ?? rituel.id) as string;
    const wasGlobal = rituel.sandboxId === null || rituel.isGlobal;
    const updated   = { ...rituel, isGlobal: !wasGlobal, sandboxId: !wasGlobal ? null : activeSandboxId };
    setRituels(prev => prev.map(r => (r._id ?? r.id) === rituelId ? updated : r));
    if (session) await fetch(`/api/rituals?id=${rituelId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isGlobal: updated.isGlobal, sandboxId: updated.sandboxId }) });
  };

  // ── Todos ──────────────────────────────────────────────────────────────────
  const handleAddLocalTodo = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !localInputValue.trim() || !activeSandboxId) return;
    setNodeData(c => ({ ...c, todos: [...(c.todos ?? []), { id: Date.now(), text: localInputValue.trim(), done: false, inherited: false, sandboxId: activeSandboxId, createdAt: Date.now() }] }));
    setLocalInputValue('');
  };

  const toggleTodo = (id: number) => {
    const todo = (nodeData.todos ?? []).find(t => t.id === id);
    const becomingDone = todo && !todo.done;
    setNodeData(c => ({ ...c, todos: (c.todos ?? []).map(t => t.id === id ? { ...t, done: !t.done } : t) }));
    if (becomingDone && activeSandboxId)
      updateSandbox(activeSandboxId, { vitalite: Math.min(100, (activeSandbox?.vitalite ?? 50) + 2.5) });
  };
  const deleteTodo = (id: number) => setNodeData(c => ({ ...c, todos: (c.todos ?? []).filter(t => t.id !== id) }));

  // ── Couleur fond ───────────────────────────────────────────────────────────
  const currentBgColorHex = (() => {
    if (niveau === 6) return '#000000';
    let past = 0, future = 0;
    if (niveau >= 3) { [0,1,2,3].forEach(i => { const e = chunkStart+(i+1)*((VUES[niveau].jours??0)/4)-1; e<indexJourAujourdhui?past++:future++; }); }
    else if (niveau === 2) { [0,1,2,3,4,5].forEach(o => (chunkStart+o)<indexJourAujourdhui?past++:future++); }
    else if (niveau === 1) { [0,1,2,3,4,5].forEach(b => (activeDay<indexJourAujourdhui||(activeDay===indexJourAujourdhui&&b<indexBlocAujourdhui))?past++:future++); }
    else if (niveau === 0) { (activeDay<indexJourAujourdhui||(activeDay===indexJourAujourdhui&&activeBlock<indexBlocAujourdhui))?past++:future++; }
    return past > future ? C_BLUE : C_ORANGE;
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // BADGES — pastille rouge (tâches) + carré bleu (rituel)
  // ══════════════════════════════════════════════════════════════════════════
  const renderBadges = (startDay: number, childNiv: number, block = 0) => {
    const count     = countActiveTasks(startDay, childNiv, block);
    const hasRitual = hasRitualAtBlock(startDay, childNiv, block);
    return (
      <>
        {count > 0 && (
          <span className="absolute top-2 right-2 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center px-1 leading-none shadow-md z-20">
            {count > 9 ? '9+' : count}
          </span>
        )}
        {hasRitual && (
          <span className="absolute bottom-2 right-2 w-[10px] h-[10px] bg-blue-600 shadow-md z-20" />
        )}
      </>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Grille
  // ══════════════════════════════════════════════════════════════════════════
  const renderGrille = () => {

    // ── Niveau 6 ──────────────────────────────────────────────────────────
    if (niveau === 6) return (
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full max-w-[1200px] mx-auto px-4 md:px-8 h-full content-center overflow-y-auto">
        {sandboxes.map(sb => {
          const vitClass = getVitalityClasses(sb.vitalite);
          const vitStyle = getVitalityStyle(sb);
          const isFrozen = sb.isFrozenUntil ? new Date() <= new Date(sb.isFrozenUntil) : false;

          const menuItems: ContextMenuItem[] = [
            { label: 'Ouvrir', action: () => naviguer(5, null, null, sb.id) },
            { label: 'Stats & Infos', action: () => { setInfoPanelCtx({ type: 'sandbox', payload: sb }); setInfoPanelOpen(true); setInfoPanelMin(false); } },
            { label: 'Exporter JSON', action: () => exportDimension(sb) },
            { separator: true, label: '', action: () => {} },
            ...(sb.jokers > 0 ? [{ label: `❄ Joker (${sb.jokers} dispo)`, action: () => useJoker(sb) }] : []),
            { label: 'Supprimer', action: () => supprimerSandbox(sb), danger: true },
          ];

          return (
            <div key={sb.id}
                 onClick={() => naviguer(5, null, null, sb.id)}
                 onContextMenu={e => { e.stopPropagation(); openContextMenu(e, menuItems); }}
                 onTouchStart={startLongPress(menuItems)}
                 onTouchEnd={cancelLongPress}
                 onTouchMove={cancelLongPress}
                 className={`group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] hover:z-10 border border-white/10 shrink-0 hover:border-transparent relative overflow-hidden ${vitClass}`}
                 style={{ backgroundColor: '#000', ...vitStyle }}
                 onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = sb.couleur}
                 onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#000'}>

              {/* Indicateur vitalité — barre fine en bas */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
                <div className="h-full transition-all duration-700"
                     style={{ width: `${Math.round(sb.vitalite)}%`, backgroundColor: sb.vitalite < 30 ? '#555' : sb.vitalite > 70 ? '#fff' : `${sb.couleur}cc` }} />
              </div>

              {/* Badges statut */}
              {isFrozen && <span className="absolute top-3 right-3 text-[8px] font-mono text-white/40">❄</span>}
              {sb.jokers > 0 && !isFrozen && <span className="absolute top-3 right-3 text-[8px] font-mono text-white/30">{sb.jokers}◆</span>}

              <span className="text-xl md:text-3xl lg:text-4xl font-black text-white/60 tracking-[0.1em] uppercase text-center px-4 leading-tight group-hover:text-white transition-colors">{sb.nom}</span>
              <span className="text-[8px] font-mono text-white/0 group-hover:text-white/30 transition-colors mt-2 uppercase tracking-widest">{formatDate(new Date(sb.startDate))}</span>
            </div>
          );
        })}

        {/* Tuile + */}
        <div className="flex flex-col items-center gap-3">
          <div onClick={() => startWizard('DIMENSION')} className="group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] border border-white/5 hover:border-white/20 border-dashed shrink-0">
            <span className="text-4xl md:text-6xl font-light text-white/20 group-hover:text-white/60 transition-colors">+</span>
          </div>
          <button onClick={() => importInputRef.current?.click()} className="text-[7px] font-mono text-white/20 hover:text-white/60 active:text-white/60 uppercase tracking-[0.25em] transition-colors">[ importer ]</button>
          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={importDimension} />
        </div>
      </div>
    );

    // ── Niveau ≥ 3 ────────────────────────────────────────────────────────
    if (niveau >= 3) {
      const jours = VUES[niveau].jours ?? 0;
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-4 md:gap-8 h-full aspect-square px-4 pb-8 pt-28 mx-auto w-full max-w-[85vh]">
          {[0,1,2,3].map(i => {
            const blocStartDay  = chunkStart + i*(jours/4);
            const blocEndDay    = blocStartDay + jours/4 - 1;
            const isTodayInside = indexJourAujourdhui >= blocStartDay && indexJourAujourdhui <= blocEndDay;
            const isPast        = blocEndDay < indexJourAujourdhui;

            const menuItems: ContextMenuItem[] = [
              { label: 'Ouvrir', action: () => naviguer(niveau-1, blocStartDay) },
              { label: 'Infos & Stats', action: () => { setInfoPanelCtx({ type: 'view', payload: { startDay: blocStartDay, niv: niveau-1 } }); setInfoPanelOpen(true); setInfoPanelMin(false); } },
            ];

            return (
              <div key={i}
                   onClick={() => naviguer(niveau-1, blocStartDay)}
                   onContextMenu={e => { e.stopPropagation(); openContextMenu(e, menuItems); }}
                   onTouchStart={startLongPress(menuItems)}
                   onTouchEnd={cancelLongPress}
                   onTouchMove={cancelLongPress}
                   style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                   className={`group flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-out relative text-white hover:scale-[1.03] hover:z-20 hover:shadow-2xl rounded-sm ${isTodayInside ? 'ring-1 ring-white/60 z-10' : 'border border-transparent hover:border-white/20'}`}>
                <span className="text-4xl md:text-7xl font-black tracking-tighter opacity-90">{jours/4}</span>
                <span className="text-[10px] font-mono mt-3 text-white/60 tracking-widest uppercase opacity-0 group-hover:opacity-100">
                  {formatDate(getDateFromIndex(blocStartDay))} — {formatDate(getDateFromIndex(blocEndDay))}
                </span>
                {renderBadges(blocStartDay, niveau - 1)}
              </div>
            );
          })}
        </div>
      );
    }

    // ── Niveau 2 ──────────────────────────────────────────────────────────
    if (niveau === 2) return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-6 h-full w-full px-4 md:px-8 pb-8 pt-24 md:pt-32 max-w-[1400px] mx-auto overflow-y-auto">
        {[0,1,2,3,4,5].map(offset => {
          const jourIndex = chunkStart + offset;
          const isToday   = jourIndex === indexJourAujourdhui;
          const menuItems: ContextMenuItem[] = [
            { label: 'Ouvrir', action: () => naviguer(1, jourIndex) },
            { label: 'Infos & Stats', action: () => { setInfoPanelCtx({ type: 'view', payload: { startDay: jourIndex, niv: 1 } }); setInfoPanelOpen(true); setInfoPanelMin(false); } },
          ];
          return (
            <div key={offset} className="flex flex-col gap-2 md:gap-3 h-full min-h-[120px] group">
              <div className={`text-center font-mono text-[9px] md:text-[10px] py-1 tracking-widest transition-colors ${isToday ? 'text-white font-bold' : 'text-white/50 group-hover:text-white'}`}>
                {formatDate(getDateFromIndex(jourIndex))}
              </div>
              <div onClick={() => naviguer(1, jourIndex)}
                   onContextMenu={e => { e.stopPropagation(); openContextMenu(e, menuItems); }}
                   onTouchStart={startLongPress(menuItems)}
                   onTouchEnd={cancelLongPress}
                   onTouchMove={cancelLongPress}
                   className={`flex flex-col gap-1 md:gap-1.5 h-full cursor-pointer hover:scale-[1.02] active:scale-[1.02] p-1 relative transition-transform ${isToday ? 'ring-1 ring-white/50 bg-white/5' : ''}`}>
                {[0,1,2,3,4,5].map(b => (
                  <div key={b}
                       style={{ backgroundColor: jourIndex < indexJourAujourdhui || (isToday && b < indexBlocAujourdhui) ? C_BLUE : C_ORANGE }}
                       className="flex-1 w-full opacity-90 min-h-[8px]" />
                ))}
                {renderBadges(jourIndex, 1)}
              </div>
            </div>
          );
        })}
      </div>
    );

    // ── Niveau 1 ──────────────────────────────────────────────────────────
    if (niveau === 1) {
      const menuItems = (b: number): ContextMenuItem[] => [
        { label: 'Ouvrir', action: () => naviguer(0, activeDay, b) },
        { label: 'Focus Timer', action: () => { naviguer(0, activeDay, b); setTimeout(() => setFocusTimer(p => ({ ...p, active: true })), 400); } },
        { label: 'Infos', action: () => { setInfoPanelCtx({ type: 'view', payload: { startDay: activeDay, niv: 0, block: b } }); setInfoPanelOpen(true); setInfoPanelMin(false); } },
      ];
      return (
        <div className="flex flex-col h-full w-full max-w-[700px] mx-auto px-4 md:px-8 pb-8 pt-24 md:pt-32 relative overflow-y-auto">
          <div className="absolute top-16 md:top-20 left-4 md:left-8 text-xs md:text-sm font-mono text-white/50 tracking-widest">{formatDate(getDateFromIndex(activeDay))}</div>
          <div className="flex flex-col gap-2 h-full mt-8">
            {[0,1,2,3,4,5].map(b => {
              const isPast    = activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && b < indexBlocAujourdhui);
              const isCurrent = activeDay === indexJourAujourdhui && b === indexBlocAujourdhui;
              return (
                <div key={b}
                     onClick={() => naviguer(0, activeDay, b)}
                     onContextMenu={e => { e.stopPropagation(); openContextMenu(e, menuItems(b)); }}
                     onTouchStart={startLongPress(menuItems(b))}
                     onTouchEnd={cancelLongPress}
                     onTouchMove={cancelLongPress}
                     style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                     className={`flex-1 w-full min-h-[40px] cursor-pointer flex items-center justify-center relative transition-all duration-300 hover:scale-[1.01] active:scale-[1.01] ${isCurrent ? 'ring-1 ring-white/60 z-10' : 'opacity-90'}`}>
                  <span className="text-white font-light text-xl md:text-2xl tracking-[0.3em]">{formatHeures(b)}</span>
                  {renderBadges(activeDay, 0, b)}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── Niveau 0 ──────────────────────────────────────────────────────────
    const isPastBloc = activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && activeBlock < indexBlocAujourdhui);
    return (
      <div className="flex h-full aspect-square px-4 pb-8 pt-20 md:pt-24 mx-auto w-full max-w-[80vh]">
        <div style={{ backgroundColor: isPastBloc ? C_BLUE : C_ORANGE }}
             className={`w-full h-full flex flex-col items-center justify-center relative transition-all duration-500 ${activeDay===indexJourAujourdhui && activeBlock===indexBlocAujourdhui ? 'ring-1 ring-white/60' : ''}`}>
          <div className="absolute top-8 md:top-12 text-white/70 font-mono tracking-[0.3em] text-[10px] md:text-sm">{formatDate(getDateFromIndex(activeDay))}</div>
          <span className="text-white font-black text-5xl md:text-8xl tracking-tighter drop-shadow-md">{formatHeures(activeBlock)}</span>
          {focusTimer.active ? (
            <div className="absolute bottom-8 flex flex-col items-center gap-3">
              <span className={`text-white font-mono font-black text-3xl md:text-5xl tracking-wider ${focusTimer.mode==='down' && focusTimer.seconds<=60 && focusTimer.running ? 'opacity-60' : ''}`}>{formatTimer(focusTimer.seconds)}</span>
              <div className="flex items-center gap-4 text-[11px] font-mono text-white/70 uppercase tracking-widest">
                <button onClick={() => setFocusTimer(p => ({ ...p, running: !p.running }))} className="hover:text-white active:text-white transition-colors py-1 px-3">{focusTimer.running ? 'pause' : 'start'}</button>
                <button onClick={() => setFocusTimer(p => ({ ...p, running: false, seconds: p.mode==='down' ? p.preset : 0 }))} className="hover:text-white active:text-white transition-colors py-1 px-3 text-white/40">reset</button>
                <button onClick={() => setFocusTimer(p => { const n = p.mode==='up'?'down':'up'; return {...p, mode:n, running:false, seconds:n==='down'?p.preset:0}; })} className="hover:text-white active:text-white transition-colors py-1 px-3 text-white/40">{focusTimer.mode==='up'?'↓ 25m':'↑ libre'}</button>
                <button onClick={() => setFocusTimer({ active:false, running:false, seconds:0, mode:'up', preset:25*60 })} className="hover:text-white active:text-white transition-colors py-1 px-3 text-white/20">×</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setFocusTimer(p => ({ ...p, active: true }))} className="absolute bottom-8 text-[10px] font-mono text-white/25 hover:text-white/70 active:text-white/70 uppercase tracking-[0.3em] transition-colors py-2 px-4">[ focus ]</button>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Info Panel flottant
  // ══════════════════════════════════════════════════════════════════════════
  const renderInfoPanel = () => {
    if (!infoPanelOpen) return null;
    const s = activeSandboxId ? sandboxStats[activeSandboxId] : null;
    const sb = activeSandbox;

    // Contenu selon contexte
    let title = VUES[niveau]?.nom ?? 'VUE';
    let content: React.ReactNode = null;

    if (infoPanelCtx.type === 'sandbox' && infoPanelCtx.payload) {
      const sbCtx: Sandbox = infoPanelCtx.payload;
      const sCtx = sandboxStats[sbCtx.id];
      const isFrozen = sbCtx.isFrozenUntil ? new Date() <= new Date(sbCtx.isFrozenUntil) : false;
      title = sbCtx.nom;
      content = (
        <div className="flex flex-col gap-3">
          <Row label="VITALITÉ" value={`${Math.round(sbCtx.vitalite)}%`} sub={isFrozen ? '❄ STASE' : sbCtx.vitalite < 30 ? 'DANGER' : sbCtx.vitalite > 70 ? 'ACTIF' : 'STABLE'} />
          <div className="w-full h-px bg-black/10"><div className="h-px bg-black transition-all" style={{ width: `${sbCtx.vitalite}%` }} /></div>
          {sCtx && (
            <>
              <Row label="STREAK" value={sCtx.streak > 0 ? `${sCtx.streak}J` : '—'} sub={sCtx.streak >= 7 ? `rec. ${sCtx.streakRecord}J` : undefined} />
              <Row label="TÂCHES" value={`${sCtx.todosDone}/${sCtx.todosTotal}`} />
              <Row label="NOTES" value={`${sCtx.notesCount}`} />
              <Row label="RITUELS" value={`${sCtx.ritualsCount}`} />
            </>
          )}
          {sbCtx.jokers > 0 && <Row label="JOKERS" value={`${sbCtx.jokers}`} />}
          <span className="text-[7px] font-mono text-gray-300 uppercase tracking-widest pt-1">{formatDate(new Date(sbCtx.startDate))}</span>
        </div>
      );
    } else if (infoPanelCtx.type === 'ritual' && infoPanelCtx.payload) {
      const r: Ritual = infoPanelCtx.payload;
      title = r.nom;
      const isActive = (nodeData.activeRituals ?? []).includes((r._id ?? r.id) as string);
      content = (
        <div className="flex flex-col gap-3">
          <Row label="NIVEAU" value={VUES[r.niveau]?.nom ?? `N${r.niveau}`} />
          <Row label="CIBLE" value={VUES[r.targetNiveau]?.nom ?? `N${r.targetNiveau}`} />
          <Row label="ACTIONS" value={`${r.elements?.length ?? 0}`} />
          <Row label="STATUT" value={isActive ? 'ACTIF' : 'INACTIF'} sub={r.isGlobal ? 'GLOBAL' : 'LOCAL'} />
          <div className="flex gap-2 pt-1">
            <button onClick={() => toggleRitualActivation(r)} className="text-[8px] font-mono uppercase tracking-widest border border-black/20 hover:bg-black hover:text-white active:bg-black active:text-white px-3 py-1.5 transition-colors">{isActive ? 'Désactiver' : 'Activer'}</button>
            <button onClick={() => { toggleRituelGlobal(r); }} className="text-[8px] font-mono uppercase tracking-widest border border-black/20 hover:bg-black hover:text-white active:bg-black active:text-white px-3 py-1.5 transition-colors">◆</button>
          </div>
        </div>
      );
    } else {
      // Vue courante
      const targetNiv = infoPanelCtx.payload?.niv ?? niveau;
      const getTargetStartDay = () => {
        if (infoPanelCtx.payload?.startDay !== undefined) return infoPanelCtx.payload.startDay;
        if (niveau < 6 && VUES[niveau].jours) return Math.floor(activeDay / VUES[niveau].jours!) * VUES[niveau].jours!;
        return activeDay;
      };
      const targetDay = getTargetStartDay();
      const targetBlock = infoPanelCtx.payload?.block ?? (niveau === 0 ? activeBlock : 0);

      const vs = targetNiv < 6 ? getNodeStats(targetNiv, targetDay, targetBlock) : null;

      content = (
        <div className="flex flex-col gap-3">
          {sb && <Row label="DIMENSION" value={sb.nom} />}
          {s && <Row label="STREAK" value={s.streak > 0 ? `${s.streak}J` : '—'} sub={s.streak >= 7 ? `rec. ${s.streakRecord}J` : undefined} />}

          {vs ? (
            <>
              <Row label="TÂCHES LOCALES" value={`${vs.localDone}/${vs.localTodos}`} />
              <Row label="TÂCHES TOTALES" value={`${vs.totalDone}/${vs.totalTodos}`} />
              {vs.totalTodos > 0 && (
                <div className="w-full h-px bg-black/10"><div className="h-px bg-black transition-all" style={{ width: `${Math.round((vs.totalDone/vs.totalTodos)*100)}%` }} /></div>
              )}

              <Row label="RITUELS LOCAUX" value={`${vs.localRituals}`} />
              <Row label="RITUELS TOTAUX" value={`${vs.totalRituals}`} />
              {vs.totalRituals > 0 && (
                <div className="w-full h-px bg-black/10"><div className="h-px bg-black transition-all" style={{ width: `${Math.round((vs.localRituals/vs.totalRituals)*100)}%` }} /></div>
              )}
            </>
          ) : (
            <>
              {/* Fallback Niveau 6 */}
              {s && s.todosTotal > 0 && (
                <>
                  <Row label="TÂCHES" value={`${s.todosDone}/${s.todosTotal}`} />
                  <div className="w-full h-px bg-black/10"><div className="h-px bg-black transition-all" style={{ width: `${s.todosTotal > 0 ? Math.round((s.todosDone/s.todosTotal)*100) : 0}%` }} /></div>
                </>
              )}
              {s && s.notesCount > 0 && <Row label="NOTES" value={`${s.notesCount}`} />}
              {s && s.ritualsCount > 0 && <Row label="RITUELS" value={`${s.ritualsCount}`} />}
            </>
          )}

          {sb && <Row label="VITALITÉ" value={`${Math.round(sb.vitalite)}%`} sub={sb.vitalite < 30 ? 'DANGER' : sb.vitalite > 70 ? 'ACTIF' : 'STABLE'} />}
        </div>
      );
    }

    return (
      <div className="fixed z-[60] bg-white text-black shadow-2xl flex flex-col select-none"
           style={{ left: panelPos.x, top: panelPos.y, width: 256 }}>
        {/* Handle drag */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 cursor-grab active:cursor-grabbing bg-black text-white"
             onMouseDown={handlePanelDragStart}
             onTouchStart={handlePanelDragStart}>
          <span className="text-[7px] font-mono uppercase tracking-[0.25em] text-white/60 truncate flex-1">
            {title}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button onClick={() => setInfoPanelMin(p => !p)} className="text-white/40 hover:text-white active:text-white text-[9px] font-mono transition-colors w-5 h-5 flex items-center justify-center">
              {infoPanelMin ? '↑' : '—'}
            </button>
            <button onClick={() => setInfoPanelOpen(false)} className="text-white/40 hover:text-white active:text-white text-xs font-mono transition-colors w-5 h-5 flex items-center justify-center">×</button>
          </div>
        </div>
        {!infoPanelMin && (
          <div className="px-4 py-3 flex flex-col gap-1">
            {content}
          </div>
        )}
      </div>
    );
  };

  // Composant Row pour le panel
  const Row = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="flex items-baseline justify-between">
      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-[11px] font-black tracking-wider">{value}</span>
        {sub && <span className="text-[7px] font-mono text-gray-300 uppercase tracking-widest">{sub}</span>}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Context Menu
  // ══════════════════════════════════════════════════════════════════════════
  const renderContextMenu = () => {
    if (!contextMenu) return null;
    return (
      <>
        <div className="fixed inset-0 z-[50]" onClick={closeContextMenu} />
        <div className="fixed z-[55] bg-white shadow-2xl border border-black/5 overflow-hidden"
             style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 180 }}>
          {contextMenu.items.map((item, i) => {
            if (item.separator) return <div key={i} className="h-px bg-gray-100 my-0.5" />;
            return (
              <button key={i}
                      onClick={() => { item.action(); closeContextMenu(); }}
                      className={`w-full text-left px-4 py-2.5 text-[9px] font-mono uppercase tracking-widest transition-colors hover:bg-black hover:text-white active:bg-black active:text-white ${item.danger ? 'text-red-500 hover:bg-red-500 hover:text-white' : 'text-black'}`}>
                {item.label}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Note Editor plein écran
  // ══════════════════════════════════════════════════════════════════════════
  const renderNoteEditor = () => {
    if (!noteEditorOpen) return null;
    return (
      <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 shrink-0">
          <span className="text-[8px] font-mono text-white/40 uppercase tracking-[0.3em]">LOG — {VUES[niveau]?.nom}</span>
          <button onClick={() => { setNodeData(c => ({ ...c, notes: noteEditorValue })); setNoteEditorOpen(false); }}
                  className="text-[8px] font-mono text-white/50 hover:text-white active:text-white uppercase tracking-[0.3em] border border-white/20 hover:bg-white hover:text-black px-4 py-2 transition-colors">
            SAUVEGARDER
          </button>
        </div>
        <textarea autoFocus value={noteEditorValue}
                  onChange={e => setNoteEditorValue(e.target.value)}
                  placeholder="..."
                  className="flex-1 w-full px-8 py-8 bg-transparent text-white/90 text-base font-mono leading-relaxed outline-none resize-none placeholder:text-white/20" />
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Wizard (Apple : full page, step by step)
  // ══════════════════════════════════════════════════════════════════════════
  const renderWizard = () => {
    const isDim   = wizard.type === 'DIMENSION';
    const maxStep = isDim ? 2 : 3;
    const wizBg   = isDim ? '#000000' : (activeSandbox?.couleur ?? '#000000');
    const handleNext = () => wizard.step < maxStep ? setWizard(w => ({ ...w, step: w.step+1 })) : submitWizard();
    const handlePrev = () => wizard.step > 0 ? setWizard(w => ({ ...w, step: w.step-1 })) : closeWizard();

    return (
      <div className={`fixed inset-0 z-[100] flex flex-col transition-opacity duration-500 ${wizard.active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ backgroundColor: wizBg }}>
        {/* Indicateur étape */}
        <div className="w-full flex justify-center gap-2 pt-8 shrink-0">
          {Array.from({ length: maxStep + 1 }, (_, i) => (
            <div key={i} className={`h-px transition-all duration-300 ${i === wizard.step ? 'w-8 bg-white' : 'w-3 bg-white/20'}`} />
          ))}
        </div>

        <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-y-auto p-6 md:p-8 max-w-[800px] mx-auto">

          {isDim && wizard.step === 0 && (
            <div className="flex flex-col items-center gap-8 w-full">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">NOM DE LA DIMENSION</span>
              <input autoFocus value={wizard.data.nom} onChange={e => setWizard(w=>({...w,data:{...w.data,nom:e.target.value}}))} onKeyDown={e=>e.key==='Enter'&&handleNext()} className="w-full bg-transparent text-4xl md:text-6xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/15" placeholder="..." />
            </div>
          )}
          {isDim && wizard.step === 1 && (
            <div className="flex flex-col items-center gap-8">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">COULEUR SIGNATURE</span>
              <input type="color" value={wizard.data.couleur} onChange={e => setWizard(w=>({...w,data:{...w.data,couleur:e.target.value}}))} className="w-32 h-32 cursor-pointer border-0 bg-transparent p-0 rounded-full shadow-2xl" />
            </div>
          )}
          {isDim && wizard.step === 2 && (
            <div className="flex flex-col items-center gap-8">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">DATE DE DÉPART</span>
              <input type="date" value={wizard.data.date} onChange={e => setWizard(w=>({...w,data:{...w.data,date:e.target.value}}))} className="text-3xl md:text-5xl font-mono text-white bg-transparent outline-none text-center cursor-pointer" />
            </div>
          )}

          {!isDim && wizard.step === 0 && (
            <div className="flex flex-col items-center gap-8 w-full">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">NOM DU MODÈLE</span>
              <input autoFocus value={wizard.data.nom} onChange={e => setWizard(w=>({...w,data:{...w.data,nom:e.target.value}}))} onKeyDown={e=>e.key==='Enter'&&handleNext()} className="w-full bg-transparent text-4xl md:text-6xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/15" placeholder="..." />
            </div>
          )}

          {!isDim && wizard.step === 1 && (
            <div className="flex flex-col items-center gap-8 w-full">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">NIVEAU CIBLE</span>
              <div className="grid grid-cols-1 gap-3 w-full max-w-[360px]">
                {Object.values(VUES).filter(v=>v.niveau<niveau&&v.niveau>=0).reverse().map(v => (
                  <button key={`t-${v.niveau}`}
                          onClick={()=>setWizard(w=>({...w,data:{...w.data,targetNiveau:v.niveau,pattern:emptyPattern()},step:2}))}
                          className={`p-4 border text-center font-black tracking-[0.2em] transition-colors text-sm ${wizard.data.targetNiveau===v.niveau?'bg-white text-black border-white':'bg-transparent text-white/40 border-white/15 hover:border-white/60 hover:text-white active:border-white active:text-white'}`}>
                    {v.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isDim && wizard.step === 2 && (
            <div className="flex flex-col gap-5 w-full max-w-[600px]">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em]">RÉCURRENCE</span>
                <button onClick={()=>setWizard(w=>({...w,data:{...w.data,isGlobal:!w.data.isGlobal}}))}
                        className={`text-[8px] font-mono uppercase tracking-widest px-3 py-2 border transition-colors ${wizard.data.isGlobal?'border-white text-white bg-white/10':'border-white/15 text-white/30 hover:text-white/60 active:text-white/60'}`}>
                  {wizard.data.isGlobal ? '◆ GLOBAL' : '○ LOCAL'}
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {(() => {
                  const layers: number[] = [];
                  for (let l=niveau-1; l>=wizard.data.targetNiveau; l--) layers.push(l);
                  return layers.map(li => {
                    const pv = VUES[li+1], nb = pv?.divisions ?? 1, sel = wizard.data.pattern[li] ?? [];
                    return (
                      <div key={`l-${li}`} className="flex items-center gap-3 border-l border-white/15 pl-3 py-1">
                        <div className="flex flex-col gap-0.5 w-[90px] md:w-[110px] shrink-0">
                          <span className="text-[7px] font-mono text-white/25 uppercase tracking-widest leading-tight">/{pv.nom}</span>
                          <span className="text-[10px] font-black text-white/70 uppercase leading-tight">{pv.labelEnfant}</span>
                          {sel.length===0 && <span className="text-[6px] font-mono text-white/20 uppercase tracking-widest">∅ tous</span>}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {Array.from({length:nb},(_,bi)=>(
                            <button key={`b-${li}-${bi}`}
                                    onClick={()=>{setWizard(prev=>{const np=deepClonePattern(prev.data.pattern);if(np[li].includes(bi)){np[li]=np[li].filter(x=>x!==bi);}else{np[li]=[...np[li],bi].sort((a,b)=>a-b);}return{...prev,data:{...prev.data,pattern:np}};});}}
                                    className={`w-8 h-8 flex items-center justify-center text-sm font-black tracking-widest transition-colors ${sel.includes(bi)?'bg-white text-black':'bg-white/8 text-white/40 hover:bg-white/20 active:bg-white/20'}`}>
                              {bi+1}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {!isDim && wizard.step === 3 && (
            <div className="flex flex-col gap-8 w-full max-w-[600px]">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.4em] text-center">ACTIONS À HÉRITER</span>
              <input autoFocus type="text" value={wizTaskInput} onChange={e=>setWizTaskInput(e.target.value)}
                     onKeyDown={e=>{if(e.key==='Enter'&&wizTaskInput.trim()){setWizard(w=>({...w,data:{...w.data,elements:[...w.data.elements,{itemType:'task',text:wizTaskInput.trim()}]}}));setWizTaskInput('');}}}
                     placeholder="..." className="text-2xl font-light border-b border-white/20 focus:border-white py-4 outline-none bg-transparent text-white placeholder:text-white/20 text-center transition-colors" />
              <div className="flex flex-col gap-2">
                {wizard.data.elements.map((el,i)=><div key={i} className="text-sm font-mono text-white/50 text-center tracking-widest">— {el.text}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="w-full flex justify-between p-8 md:p-12 text-[9px] md:text-xs font-mono uppercase tracking-[0.3em] font-black text-white/30 shrink-0">
          <button onClick={handlePrev} className="hover:text-white active:text-white transition-colors py-4 px-8 border border-transparent hover:border-white/20">{wizard.step===0?'Annuler':'Précédent'}</button>
          <button onClick={handleNext} className="hover:text-white active:text-white transition-colors py-4 px-8 border border-white/20 hover:bg-white hover:text-black active:bg-white active:text-black">{wizard.step===maxStep?'Valider':'Suivant'}</button>
        </div>
      </div>
    );
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (status === 'loading') return <div className="h-screen w-screen bg-black flex items-center justify-center"><div className="text-white font-mono tracking-widest text-xs uppercase animate-pulse">—</div></div>;
  if (!isReady) return <div className="h-screen w-screen bg-black" />;

  // ── Context menu zone principale ───────────────────────────────────────────
  const mainContextItems: ContextMenuItem[] = [
    ...(niveau > 1 && activeSandboxId ? [{ label: '+ Nouveau Rituel', action: () => startWizard('RITUEL') }] : []),
    ...(activeSandboxId ? [{ label: 'Infos & Stats', action: () => { setInfoPanelCtx({ type: 'view' }); setInfoPanelOpen(true); setInfoPanelMin(false); } }] : []),
    ...(niveau > 0 ? [{ label: 'Remonter', action: () => naviguer(niveau + 1) }] : []),
    { separator: true, label: '', action: () => {} },
    { label: 'Racine', action: () => naviguer(6) },
  ];

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <main className="flex h-[100dvh] w-screen bg-black font-sans overflow-hidden relative"
          onContextMenu={e => { if ((e.target as HTMLElement).closest('[data-no-ctx]')) return; openContextMenu(e, mainContextItems); }}>

      {renderWizard()}
      {renderInfoPanel()}
      {renderContextMenu()}
      {renderNoteEditor()}

      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSidebarOpen(false)} />}

      {/* ── Breadcrumb — sans couleur ── */}
      <div className="absolute top-6 md:top-8 left-6 md:left-8 z-40 flex items-center gap-2 md:gap-3">
        <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] drop-shadow-md transition-colors ${niveau === 6 ? 'text-white/40' : 'text-white/80'}`}>
          {niveau < 6 ? activeSandbox?.nom : 'BLOCK'}
        </span>
        {niveau < 6 && (
          <>
            <span className="text-white/20 text-xs">/</span>
            <button onClick={() => naviguer(6)} className="text-[9px] md:text-[10px] font-mono text-white/40 hover:text-white active:text-white uppercase tracking-widest transition-colors">RACINE</button>
          </>
        )}
      </div>

      {/* ── Boutons topbar droite ── */}
      <div className="absolute top-6 md:top-8 right-6 md:right-8 z-40 flex items-center gap-3">
        {/* Bouton INFO → panel flottant */}
        <button onClick={() => { setInfoPanelCtx({ type: 'view' }); setInfoPanelOpen(p => !p); if (!infoPanelOpen) setInfoPanelMin(false); }}
                className={`text-[9px] md:text-[10px] font-mono tracking-widest uppercase transition-colors ${infoPanelOpen ? 'text-white' : 'text-white/40 hover:text-white active:text-white'}`}>
          [ INFO ]
        </button>
        {/* Bouton DATA → sidebar */}
        <button onClick={() => setIsSidebarOpen(true)}
                className={`text-[9px] md:text-[10px] font-mono tracking-widest uppercase hover:text-white active:text-white transition-colors drop-shadow-md ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'text-white/40 opacity-100'}`}>
          [ DATA ]
        </button>
      </div>

      {/* ── Badge Revue ── */}
      {isRevuePeriod && !showRevue && (
        <button onClick={() => setShowRevue(true)} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 text-[8px] font-mono uppercase tracking-[0.3em] text-white/30 hover:text-white active:text-white border border-white/10 hover:border-white/30 px-5 py-2.5 transition-colors">
          [ REVUE ↗ ]
        </button>
      )}

      {/* ── Modal Revue ── */}
      {showRevue && revueStats && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-8" onClick={() => setShowRevue(false)}>
          <div className="bg-white text-black max-w-[360px] w-full p-8 flex flex-col gap-5" onClick={e => e.stopPropagation()}>
            <span className="text-[7px] font-mono uppercase tracking-[0.4em] text-gray-400">Revue — {VUES[niveau].nom}</span>
            <span className="text-xs font-mono text-gray-400">{revueStats.period}</span>
            <div className="flex gap-6 items-end">
              <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Tâches</span><span className="text-2xl font-black">{revueStats.done}<span className="text-gray-300 font-normal text-base">/{revueStats.todos}</span></span></div>
              <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Notes</span><span className="text-2xl font-black">{revueStats.notes}</span></div>
              {activeSandbox && <div className="flex flex-col gap-0.5"><span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Vitalité</span><span className="text-2xl font-black">{Math.round(activeSandbox.vitalite)}%</span></div>}
            </div>
            {revueStats.todos > 0 && (<div className="w-full h-px bg-gray-100"><div className="h-px bg-black" style={{ width: `${Math.round((revueStats.done/revueStats.todos)*100)}%` }} /></div>)}
            <button onClick={() => setShowRevue(false)} className="text-[7px] font-mono uppercase tracking-widest text-gray-400 hover:text-black active:text-black transition-colors self-end">FERMER</button>
          </div>
        </div>
      )}

      {/* ── Streak alert ── */}
      {showStreakAlert && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] bg-white text-black flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <span className="text-[8px] font-mono uppercase tracking-widest">◆ {sandboxStats[activeSandboxId!]?.streak}J — STREAK À RISQUE</span>
          <button onClick={() => { setShowStreakAlert(false); streakAlertDismissed.current = true; }} className="text-[11px] font-mono text-gray-400 hover:text-black active:text-black transition-colors py-1 px-2">×</button>
        </div>
      )}

      {/* ── Zone principale avec gestion des événements ── */}
      <section style={{ backgroundColor: currentBgColorHex }}
               className="flex-1 flex flex-col relative w-full overflow-hidden transition-colors duration-1000 ease-in-out"
               onWheel={handleWheel}
               onTouchStart={handleTouchStart}
               onTouchMove={handleTouchMove}
               onTouchEnd={handleTouchEnd}>

        {niveau < 6 && (
          <nav className="absolute top-14 md:top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 md:gap-4 flex-wrap justify-center w-full px-4">
            {[5,4,3,2,1,0].map(niv => {
              if (niv > niveau) return (
                <div key={niv} className="flex items-center gap-2 md:gap-4">
                  <button onClick={() => naviguer(niv)} className="text-[8px] md:text-[9px] font-mono text-white/30 hover:text-white active:text-white tracking-widest uppercase transition-colors">{VUES[niv].nom}</button>
                  <span className="text-white/15 text-[8px] md:text-[9px]">—</span>
                </div>
              );
              if (niv === niveau) return <span key={niv} className="text-[8px] md:text-[9px] font-mono font-bold text-white tracking-widest uppercase border-b border-white/60 pb-0.5">{VUES[niv].nom}</span>;
              return null;
            })}
          </nav>
        )}

        <div className={`flex-1 flex items-center justify-center ${zoomStyle} w-full`}>{renderGrille()}</div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR — Purement fonctionnelle. Aucun stat. Aucun chiffre.
          Seuls les outils d'action : rituels, todos, note.
          ════════════════════════════════════════════════════════════════════ */}
      <aside className={`fixed top-0 right-0 h-full w-[85%] max-w-[380px] bg-white text-black flex flex-col z-50 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSidebarOpen ? 'translate-x-0 shadow-[-20px_0_60px_rgba(0,0,0,0.08)]' : 'translate-x-full'}`}
            data-no-ctx>

        {/* Header minimal */}
        <header className="px-6 md:px-8 py-5 flex justify-between items-center shrink-0 border-b border-gray-50">
          <div className="flex items-center gap-3">
            {session?.user?.image
              ? <img src={session.user.image} alt="" className="w-5 h-5 rounded-full object-cover grayscale" />
              : <div className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[9px] font-bold">{session?.user?.name?.charAt(0).toUpperCase() ?? 'U'}</div>
            }
            <span className="text-[8px] font-mono uppercase tracking-[0.25em] text-gray-400">{VUES[niveau]?.nom}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-[7px] font-mono uppercase tracking-widest text-gray-300 hover:text-black active:text-black transition-colors">logout</button>
            <button onClick={() => setIsSidebarOpen(false)} className="text-gray-300 hover:text-black active:text-black transition-colors text-lg leading-none">✕</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 flex flex-col gap-7">
          {niveau < 6 ? (
            <>
              {/* ── Rituels ── */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-[7px] font-mono uppercase tracking-[0.3em] text-gray-300">MATRICE</span>
                  {!wizard.active && niveau > 1 && (
                    <button onClick={() => startWizard('RITUEL')} className="text-[7px] font-mono text-gray-300 hover:text-black active:text-black tracking-[0.2em] uppercase transition-colors">[+ MODÈLE]</button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {filteredRituels.map(r => {
                    const rid    = (r._id ?? r.id) as string;
                    const isActive = (nodeData.activeRituals ?? []).includes(rid);
                    const isGlobal = r.sandboxId === null || !!r.isGlobal;
                    const rituelMenuItems: ContextMenuItem[] = [
                      { label: isActive ? 'Désactiver' : 'Activer', action: () => toggleRitualActivation(r) },
                      { label: isGlobal ? 'Rendre local' : 'Rendre global', action: () => toggleRituelGlobal(r) },
                      { label: 'Infos', action: () => { setInfoPanelCtx({ type: 'ritual', payload: r }); setInfoPanelOpen(true); setInfoPanelMin(false); setIsSidebarOpen(false); } },
                      { separator: true, label: '', action: () => {} },
                      { label: 'Supprimer', action: () => supprimerRituelBase(r), danger: true },
                    ];
                    return (
                      <div key={rid}
                           className="flex items-center justify-between py-1.5 group"
                           onContextMenu={e => { e.stopPropagation(); e.preventDefault(); openContextMenu(e, rituelMenuItems); }}
                           onTouchStart={startLongPress(rituelMenuItems)}
                           onTouchEnd={cancelLongPress}
                           onTouchMove={cancelLongPress}>
                        <div className="flex items-center gap-2.5 cursor-pointer flex-1" onClick={() => toggleRitualActivation(r)}>
                          <div className={`w-1 h-1 rounded-full shrink-0 transition-colors ${isActive ? 'bg-black' : 'bg-gray-200'}`} />
                          <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${isActive ? 'text-black' : 'text-gray-400'}`}>{r.nom}</span>
                          {isGlobal && <span className="text-[6px] text-gray-300 shrink-0">◆</span>}
                        </div>
                        {/* Actions always visible on touch */}
                        <div className={`flex items-center gap-0.5 ${isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                          <button onClick={e => { e.stopPropagation(); setInfoPanelCtx({ type: 'ritual', payload: r }); setInfoPanelOpen(true); setInfoPanelMin(false); setIsSidebarOpen(false); }} className="text-[7px] font-mono text-gray-300 hover:text-black active:text-black uppercase tracking-widest px-2 py-1.5 transition-colors">ⓘ</button>
                          <button onClick={e => { e.stopPropagation(); supprimerRituelBase(r); }} className="text-[7px] font-mono text-gray-200 hover:text-red-500 active:text-red-500 uppercase tracking-widest px-2 py-1.5 transition-colors">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-gray-50" />

              {/* ── Todos ── */}
              <div className="flex flex-col gap-3">
                <span className="text-[7px] font-mono uppercase tracking-[0.3em] text-gray-300">ACTION</span>
                <input type="text" value={localInputValue}
                       onChange={e => setLocalInputValue(e.target.value)}
                       onKeyDown={handleAddLocalTodo}
                       placeholder="Nouvelle action..."
                       className="w-full text-[10px] font-mono border-b border-gray-100 focus:border-black py-1.5 outline-none bg-transparent transition-colors placeholder:text-gray-200" />
                <div className="flex flex-col gap-0.5">
                  {(nodeData.todos ?? []).map(item => {
                    const todoMenuItems: ContextMenuItem[] = [
                      { label: item.done ? 'Décocher' : 'Cocher', action: () => toggleTodo(item.id) },
                      ...(!item.inherited ? [{ label: 'Supprimer', action: () => deleteTodo(item.id), danger: true }] : []),
                    ];
                    return (
                      <div key={item.id}
                           className="flex items-start justify-between py-1.5 group"
                           onContextMenu={e => { e.stopPropagation(); e.preventDefault(); openContextMenu(e, todoMenuItems); }}
                           onTouchStart={startLongPress(todoMenuItems)}
                           onTouchEnd={cancelLongPress}
                           onTouchMove={cancelLongPress}>
                        <div className="flex items-start gap-2.5 cursor-pointer flex-1" onClick={() => toggleTodo(item.id)}>
                          <div className={`mt-0.5 w-1.5 h-1.5 border border-black shrink-0 transition-colors ${item.done ? 'bg-black' : 'bg-transparent'}`} />
                          <div className="flex flex-col">
                            <span className={`text-[9px] font-bold uppercase tracking-widest leading-snug ${item.done ? 'line-through text-gray-300' : 'text-black'}`}>{item.text}</span>
                            {item.inherited && <span className="text-[7px] font-mono text-gray-300 mt-0.5">↳ {item.sourceRitualLayer ?? item.sourceRitualName}</span>}
                          </div>
                        </div>
                        {!item.inherited && (
                          <button onClick={() => deleteTodo(item.id)} className={`text-gray-200 hover:text-red-500 active:text-red-500 text-[10px] font-mono ml-2 py-0.5 px-1 transition-colors ${isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-gray-50" />

              {/* ── Note — tap ouvre l'éditeur plein écran ── */}
              <div className="flex flex-col gap-3">
                <span className="text-[7px] font-mono uppercase tracking-[0.3em] text-gray-300">LOG</span>
                <button onClick={() => { setNoteEditorValue(nodeData.notes ?? ''); setNoteEditorOpen(true); }}
                        className="w-full text-left text-[9px] font-mono text-gray-400 hover:text-black active:text-black transition-colors border-b border-gray-100 hover:border-black pb-1.5 min-h-[32px] line-clamp-3">
                  {nodeData.notes?.trim() ? nodeData.notes.slice(0, 120) + (nodeData.notes.length > 120 ? '...' : '') : <span className="text-gray-200">Appuyer pour noter...</span>}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 mt-2">
              <button onClick={() => startWizard('DIMENSION')} className="text-[8px] font-mono uppercase tracking-[0.3em] text-gray-400 hover:text-black active:text-black transition-colors border border-dashed border-gray-200 hover:border-black p-4 text-center">+ NOUVELLE DIMENSION</button>
              <button onClick={() => importInputRef.current?.click()} className="text-[7px] font-mono uppercase tracking-[0.3em] text-gray-300 hover:text-black active:text-black transition-colors text-center py-2">IMPORTER</button>
              <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={importDimension} />
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}