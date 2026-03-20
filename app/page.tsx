"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ─── Constantes ────────────────────────────────────────────────────────────────
const C_BLUE   = '#044389';
const C_ORANGE = '#EC4E20';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Vue {
  niveau:      number;
  nom:         string;
  jours:       number | null;
  divisions:   number | null;
  labelEnfant: string;
}
interface Sandbox {
  id:        string;
  userId?:   string;
  nom:       string;
  couleur:   string;
  startDate: string;
}
interface Ritual {
  _id?:           string;
  id?:            number;
  userId?:        string;
  niveau:         number;
  targetNiveau:   number;
  nom:            string;
  pattern:        Record<number, number[]>;
  sandboxId:      string | null;
  elements:       any[];
  isGlobal?:      boolean;
}
interface Todo {
  id:                 number;
  text:               string;
  done:               boolean;
  inherited?:         boolean;
  sandboxId?:         string | null;
  sourceRitualId?:    string;
  sourceRitualName?:  string;
  sourceRitualLayer?: string;
}
interface NodeData {
  userId:        string;
  nodeId:        string;
  notes:         string;
  todos:         Todo[];
  sandboxId:     string;
  activeRituals: string[];
}
interface SandboxStats {
  streak:       number;
  streakRecord: number;
  notesCount:   number;
  todosDone:    number;
  todosTotal:   number;
  ritualsCount: number;
}
interface WizardElement { itemType: string; text: string; }
interface WizardData {
  nom:          string;
  couleur:      string;
  date:         string;
  targetNiveau: number;
  pattern:      Record<number, number[]>;
  elements:     WizardElement[];
  isGlobal:     boolean;
}
interface WizardState {
  active: boolean;
  type:   string;
  step:   number;
  data:   WizardData;
}

// ─── Structure fractale ────────────────────────────────────────────────────────
// Niveau N contient VUES[N].divisions enfants de taille VUES[N-1].jours
// Pour afficher les boutons couche N → lire VUES[N+1].divisions
const VUES: Record<number, Vue> = {
  0: { niveau: 0, nom: '1 BLOC',    jours: 1,    divisions: 6, labelEnfant: '-'                },
  1: { niveau: 1, nom: '1 JOUR',    jours: 1,    divisions: 6, labelEnfant: 'Bloc de 4h'       },
  2: { niveau: 2, nom: '6 JOURS',   jours: 6,    divisions: 6, labelEnfant: 'Jour'             },
  3: { niveau: 3, nom: '24 JOURS',  jours: 24,   divisions: 4, labelEnfant: 'Période de 6J'   },
  4: { niveau: 4, nom: '96 JOURS',  jours: 96,   divisions: 4, labelEnfant: 'Mois (24J)'      },
  5: { niveau: 5, nom: '384 JOURS', jours: 384,  divisions: 4, labelEnfant: 'Trimestre (96J)' },
  6: { niveau: 6, nom: 'BLOCK',     jours: null, divisions: null, labelEnfant: 'Dimension'    },
};

// ─── Helpers purs ──────────────────────────────────────────────────────────────
const formatDate = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

const formatHeures = (b: number) =>
  `${(b * 4).toString().padStart(2, '0')}h00 - ${((b + 1) * 4).toString().padStart(2, '0')}h00`;

const formatTimer = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

// Clone profond du pattern — évite le state bleeding entre couches
const deepClonePattern = (p: Record<number, number[]>): Record<number, number[]> => {
  const c: Record<number, number[]> = {};
  for (let k = 0; k <= 5; k++) c[k] = Array.isArray(p[k]) ? [...p[k]] : [];
  return c;
};
const emptyPattern = (): Record<number, number[]> => ({ 5: [], 4: [], 3: [], 2: [], 1: [], 0: [] });

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AgendaExtremeMinimalism() {
  const { data: session, status } = useSession();
  const router = useRouter();
  useEffect(() => { if (status === 'unauthenticated') router.push('/login'); }, [status, router]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [isReady,         setIsReady]         = useState(false);
  const [niveau,          setNiveau]          = useState(6);
  const [activeDay,       setActiveDay]       = useState(0);
  const [activeBlock,     setActiveBlock]     = useState(0);
  const [sandboxes,       setSandboxes]       = useState<Sandbox[]>([]);
  const [activeSandboxId, setActiveSandboxId] = useState<string | null>(null);
  const [parametres,      setParametres]      = useState<Record<string, NodeData>>({});
  const [rituels,         setRituels]         = useState<Ritual[]>([]);
  const [zoomStyle,       setZoomStyle]       = useState('scale-100 opacity-100 transition-all duration-500 ease-out');
  const [isSidebarOpen,   setIsSidebarOpen]   = useState(false);
  const [localInputValue, setLocalInputValue] = useState('');
  const [wizTaskInput,    setWizTaskInput]    = useState('');

  // Nouvelles features
  const [focusTimer,       setFocusTimer]       = useState({ active: false, running: false, seconds: 0, mode: 'up' as 'up' | 'down', preset: 25 * 60 });
  const [showRevue,        setShowRevue]        = useState(false);
  const [showStreakAlert,  setShowStreakAlert]   = useState(false);

  const paramsRef             = useRef<Record<string, NodeData>>({});
  const saveQueue             = useRef<Record<string, NodeJS.Timeout>>({});
  const touchStartRef         = useRef<{ x: number; y: number } | null>(null);
  const timerIntervalRef      = useRef<NodeJS.Timeout | null>(null);
  const streakAlertDismissed  = useRef(false);
  const importInputRef        = useRef<HTMLInputElement>(null);

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
    const d = new Date(systemStartDate);
    d.setDate(d.getDate() + idx);
    return d;
  }, [systemStartDate]);

  const getComputedNodeId = useCallback((sbId: string | null, niv: number, day: number, block = 0) => {
    const prefix = sbId ? `${sbId}_` : '';
    if (niv === 0) return `${prefix}lvl0-jour${day}-bloc${block}`;
    if (niv === 1) return `${prefix}lvl1-jour${day}`;
    return `${prefix}lvl${niv}-start${Math.floor(day / (VUES[niv].jours ?? 1)) * (VUES[niv].jours ?? 1)}`;
  }, []);

  const nodeId   = niveau < 6 ? getComputedNodeId(activeSandboxId, niveau, activeDay, activeBlock) : 'ROOT';
  const nodeData = parametres[nodeId] ?? { notes: '', todos: [], activeRituals: [] };

  // Rituels de la dimension courante + rituels globaux (sandboxId === null)
  const filteredRituels = activeSandboxId
    ? rituels.filter(r => r.niveau === niveau && (r.sandboxId === activeSandboxId || r.sandboxId === null))
    : [];

  // ── isDayActive — check jour + tous ses blocs ──────────────────────────────
  const isDayActive = useCallback((sbId: string, d: number): boolean => {
    const k1 = `${sbId}_lvl1-jour${d}`;
    if ((parametres[k1]?.notes ?? '').trim() || (parametres[k1]?.todos ?? []).length) return true;
    return [0, 1, 2, 3, 4, 5].some(b => {
      const k0 = `${sbId}_lvl0-jour${d}-bloc${b}`;
      return (parametres[k0]?.notes ?? '').trim() || (parametres[k0]?.todos ?? []).length;
    });
  }, [parametres]);

  // ── FIX pastilles — hasActiveTasks cascade récursive jusqu'au niveau 0 ────
  // Avant : vérifiait uniquement le nœud exact.
  // Maintenant : descend récursivement jusqu'aux blocs (niveau 0).
  //   • niveau 2 : hasActiveTasks(jourIndex, 1)  → vérifie lvl1 + tous lvl0 du jour
  //   • niveau 1 : hasActiveTasks(activeDay, 0, b) → vérifie le bloc précis
  const hasActiveTasks = useCallback((startDay: number, checkNiv: number, block = 0): boolean => {
    if (!activeSandboxId) return false;
    // Vérifier ce nœud
    const key  = getComputedNodeId(activeSandboxId, checkNiv, startDay, block);
    const data = parametres[key];
    if (data && (data.todos ?? []).some(t => !t.done)) return true;
    if (checkNiv === 0) return false;
    // Descendre : niveau 1 → ses 6 blocs
    if (checkNiv === 1) {
      return [0, 1, 2, 3, 4, 5].some(b => {
        const k = getComputedNodeId(activeSandboxId, 0, startDay, b);
        const d = parametres[k];
        return d && (d.todos ?? []).some(t => !t.done);
      });
    }
    // Descendre : niveau N → ses N-1 enfants
    const childNiv     = checkNiv - 1;
    const childDaySize = VUES[childNiv].jours ?? 1;
    const numChildren  = VUES[checkNiv].divisions ?? 1;
    for (let i = 0; i < numChildren; i++) {
      if (hasActiveTasks(startDay + i * childDaySize, childNiv)) return true;
    }
    return false;
  }, [activeSandboxId, parametres, getComputedNodeId]);

  // ── Stats par dimension (streak + métriques) ───────────────────────────────
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
        if (isDayActive(sb.id, d)) {
          streak++; current++;
          if (current > streakRecord) streakRecord = current;
        } else {
          if (streak > 0) break;
          current = 0;
        }
      }
      streakRecord = Math.max(streakRecord, streak);
      result[sb.id] = { streak, streakRecord, notesCount, todosDone, todosTotal, ritualsCount };
    });
    return result;
  }, [sandboxes, parametres, rituels, isDayActive]);

  // ── Heatmap — 56 jours glissants ──────────────────────────────────────────
  const heatmapData = useMemo(() => {
    if (!activeSandboxId) return [];
    return Array.from({ length: 56 }, (_, i) => {
      const dayIdx = indexJourAujourdhui - 55 + i;
      if (dayIdx < 0) return { active: false, isToday: false, future: false };
      return {
        active:  isDayActive(activeSandboxId, dayIdx),
        isToday: dayIdx === indexJourAujourdhui,
        future:  dayIdx > indexJourAujourdhui,
      };
    });
  }, [activeSandboxId, indexJourAujourdhui, isDayActive]);

  // ── Détection période de revue (2 derniers jours d'un bloc) ───────────────
  const isRevuePeriod = niveau >= 2 && niveau <= 5 && (() => {
    const jours     = VUES[niveau].jours ?? 0;
    const endDay    = chunkStart + jours - 1;
    const daysLeft  = endDay - indexJourAujourdhui;
    return daysLeft >= 0 && daysLeft <= 1;
  })();

  // ── Stats de la période pour la revue ────────────────────────────────────
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
    return {
      todos, done, notes,
      period: `${formatDate(getDateFromIndex(chunkStart))} — ${formatDate(getDateFromIndex(chunkStart + jours - 1))}`,
    };
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
  }, []);

  useEffect(() => {
    if (!isReady) return;
    localStorage.setItem('fractal_niveau',  niveau.toString());
    localStorage.setItem('fractal_day',     activeDay.toString());
    localStorage.setItem('fractal_block',   activeBlock.toString());
    localStorage.setItem('fractal_sandbox', activeSandboxId ?? 'null');
  }, [niveau, activeDay, activeBlock, activeSandboxId, isReady]);

  // ── Chargement API ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session || !isReady) return;
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/rituals').then(r => r.json()),
      fetch('/api/nodedata').then(r => r.json()),
    ]).then(([settingsData, ritualsData, nodesData]) => {
      const loadedSandboxes: Sandbox[] = settingsData.sandboxes ?? [];
      setSandboxes(loadedSandboxes);
      if (activeSandboxId && !loadedSandboxes.some(sb => sb.id === activeSandboxId)) {
        setActiveSandboxId(null); setNiveau(6);
      }
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
        setParametres(formatted);
        paramsRef.current = formatted;
        if (purgeUpdates.length > 0) {
          fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: purgeUpdates }) });
        }
      }
    }).catch(console.error);
  }, [session, isReady, activeSandboxId]);

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
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [focusTimer.running]);

  // ── Streak alert (après 18h, si aujourd'hui pas encore actif) ─────────────
  useEffect(() => {
    if (!activeSandboxId || streakAlertDismissed.current) return;
    const s = sandboxStats[activeSandboxId];
    if (!s || s.streak === 0) return;
    if (new Date().getHours() < 18) return;
    const sbStartMs = new Date(activeSandbox?.startDate ?? '').setHours(0, 0, 0, 0);
    const todayIdx  = Math.floor((new Date().setHours(0,0,0,0) - sbStartMs) / 86_400_000);
    if (!isDayActive(activeSandboxId, todayIdx)) setShowStreakAlert(true);
  }, [activeSandboxId, sandboxStats, isDayActive, activeSandbox?.startDate]);

  // ── NodeData helpers ───────────────────────────────────────────────────────
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

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setNodeData(c => ({ ...c, notes: e.target.value }));

  // ── Navigation ─────────────────────────────────────────────────────────────
  const naviguer = useCallback((newNiveau: number, cibleJour: number | null = null, cibleBloc: number | null = null, sandboxCibleId: string | null = null) => {
    if (newNiveau === niveau || newNiveau < 0 || newNiveau > 6) return;
    const applyTransition = (enter: string, exit: string, apply: () => void) => {
      setZoomStyle(`transition-all duration-400 ease-in-out opacity-0 ${enter}`);
      setTimeout(() => {
        apply();
        setZoomStyle(`transition-none opacity-0 ${exit}`);
        requestAnimationFrame(() => requestAnimationFrame(() => setZoomStyle('transition-all duration-500 ease-out opacity-100 scale-100')));
      }, 300);
    };
    if (newNiveau === 6) {
      applyTransition('scale-[0.8]', 'scale-[1.2]', () => { setActiveSandboxId(null); setNiveau(6); });
      return;
    }
    if (niveau === 6 && sandboxCibleId) {
      applyTransition('scale-[1.2]', 'scale-[0.8]', () => { setActiveSandboxId(sandboxCibleId); setNiveau(5); });
      return;
    }
    const isZoomIn = newNiveau < niveau;
    applyTransition(isZoomIn ? 'scale-[1.2]' : 'scale-[0.8]', isZoomIn ? 'scale-[0.8]' : 'scale-[1.2]', () => {
      if (cibleJour  !== null) setActiveDay(cibleJour);
      if (cibleBloc  !== null) setActiveBlock(cibleBloc);
      setNiveau(newNiveau);
    });
  }, [niveau]);

  // ── Swipe mobile ──────────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || niveau === 6 || isSidebarOpen) return;
    const dx  = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy  = e.changedTouches[0].clientY - touchStartRef.current.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 55) return;
    if (ady > adx) {
      // Vertical — swipe bas = remonter
      if (dy > 0 && niveau < 6) naviguer(niveau + 1);
    } else {
      // Horizontal — swipe gauche = suivant, droite = précédent
      if (niveau === 0) {
        const nb = activeBlock + (dx < 0 ? 1 : -1);
        if (nb >= 0 && nb < 6) setActiveBlock(nb);
      } else {
        const step   = VUES[niveau].jours ?? 1;
        const newDay = activeDay + (dx < 0 ? step : -step);
        if (newDay >= 0) setActiveDay(newDay);
      }
    }
    touchStartRef.current = null;
  };

  // ── Wizard ─────────────────────────────────────────────────────────────────
  const startWizard = (type: string) => {
    setIsSidebarOpen(false);
    setWizard({ active: true, type, step: 0, data: { ...defaultWizardData, targetNiveau: Math.max(0, niveau - 1) } });
  };
  const closeWizard = () => setWizard(prev => ({ ...prev, active: false }));

  const submitWizard = async () => {
    if (wizard.type === 'DIMENSION') {
      if (!wizard.data.nom.trim()) return;
      const newSb: Sandbox = { id: `sb_${Date.now()}`, nom: wizard.data.nom.toUpperCase(), couleur: wizard.data.couleur, startDate: new Date(wizard.data.date).toISOString() };
      const updated = [...sandboxes, newSb];
      setSandboxes(updated);
      if (session) await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updated }) });
    } else {
      if (!wizard.data.nom.trim() || wizard.data.elements.length === 0) return;
      const payload = {
        sandboxId:    wizard.data.isGlobal ? null : activeSandboxId,
        niveau, nom:  wizard.data.nom,
        targetNiveau: wizard.data.targetNiveau,
        pattern:      wizard.data.pattern,
        elements:     wizard.data.elements,
        isGlobal:     wizard.data.isGlobal,
      };
      if (session) {
        const res = await fetch('/api/rituals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { const r = await res.json(); setRituels(prev => [...prev, r]); }
      } else {
        setRituels(prev => [...prev, { ...payload, id: Date.now() }]);
      }
    }
    closeWizard();
  };

  // ── generateTargetNodeIds ──────────────────────────────────────────────────
  const generateTargetNodeIds = useCallback((baseNiveau: number, baseStartDay: number, pattern: Record<number, number[]>, targetNiveau = 0) => {
    let currentNodes: { day: number; block: number }[] = [{ day: baseStartDay, block: 0 }];
    const safePattern = pattern ?? {};
    for (let currentLevel = baseNiveau; currentLevel > targetNiveau; currentLevel--) {
      const nextNodes: { day: number; block: number }[] = [];
      const childLevel   = currentLevel - 1;
      const numChildren  = VUES[currentLevel].divisions ?? 1;
      const childDaySize = VUES[childLevel].jours ?? 1;
      currentNodes.forEach(node => {
        const selected: number[] = safePattern[childLevel] ?? [];
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

  // ── Suppression dimension ──────────────────────────────────────────────────
  const supprimerSandbox = async (sb: Sandbox, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer "${sb.nom}" ? Irréversible.`)) return;
    const updatedSandboxes = sandboxes.filter(s => s.id !== sb.id);
    setSandboxes(updatedSandboxes);
    const newParams = { ...paramsRef.current };
    Object.keys(newParams).filter(k => k.startsWith(`${sb.id}_`)).forEach(k => delete newParams[k]);
    paramsRef.current = newParams;
    setParametres(newParams);
    const sbRituals = rituels.filter(r => r.sandboxId === sb.id);
    setRituels(prev => prev.filter(r => r.sandboxId !== sb.id));
    if (session) {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updatedSandboxes }) });
      await Promise.all(sbRituals.map(r => fetch(`/api/rituals?id=${r._id ?? r.id}`, { method: 'DELETE' })));
    }
  };

  // ── Export / Import dimension ──────────────────────────────────────────────
  const exportDimension = (sb: Sandbox, e: React.MouseEvent) => {
    e.stopPropagation();
    const prefix  = `${sb.id}_`;
    const nodes   = Object.entries(paramsRef.current).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    const rituals = rituels.filter(r => r.sandboxId === sb.id);
    const blob    = new Blob([JSON.stringify({ version: 1, sandbox: sb, rituals, nodes }, null, 2)], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href = url;
    a.download = `${sb.nom.toLowerCase().replace(/\s+/g, '-')}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDimension = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !data.sandbox) { alert('Format invalide'); return; }
      const newId    = `sb_${Date.now()}`;
      const newSb: Sandbox = { ...data.sandbox, id: newId, nom: data.sandbox.nom + '_IMP' };
      const updatedSb = [...sandboxes, newSb];
      setSandboxes(updatedSb);
      const oldPrefix = `${data.sandbox.id}_`;
      const newPrefix = `${newId}_`;
      const newParams = { ...paramsRef.current };
      (data.nodes ?? []).forEach((n: NodeData) => {
        const key = n.nodeId.replace(oldPrefix, newPrefix);
        newParams[key] = { ...n, nodeId: key, sandboxId: newId };
      });
      paramsRef.current = newParams;
      setParametres(newParams);
      const newRituels = (data.rituals ?? []).map((r: Ritual) => ({ ...r, _id: undefined, id: Date.now() + Math.random(), sandboxId: newId }));
      setRituels(prev => [...prev, ...newRituels]);
      if (session) {
        await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updatedSb }) });
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
    const newActiveRituals = isActivating
      ? [...(currentNode.activeRituals ?? []), rituelId]
      : (currentNode.activeRituals ?? []).filter(id => id !== rituelId);
    paramsRef.current = { ...paramsRef.current, [nodeId]: { ...currentNode, activeRituals: newActiveRituals } };
    const targetNodeIds = generateTargetNodeIds(rituel.niveau, chunkStart, rituel.pattern, rituel.targetNiveau);
    const updates       = [{ nodeId, todos: currentNode.todos ?? [], activeRituals: newActiveRituals }];
    const ritualLayer   = VUES[rituel.niveau]?.nom ?? rituel.nom;
    targetNodeIds.forEach(childId => {
      const childData = paramsRef.current[childId] ?? { todos: [], activeRituals: [] };
      let newTodos    = [...(childData.todos ?? [])];
      if (isActivating) {
        (rituel.elements ?? []).forEach(el => {
          if (!newTodos.some(t => t.sourceRitualId === rituelId && t.text === el.text)) {
            newTodos.push({ id: Date.now() + Math.random(), text: el.text, done: false, inherited: true, sourceRitualId: rituelId, sourceRitualName: rituel.nom, sourceRitualLayer: ritualLayer, sandboxId: activeSandboxId });
          }
        });
      } else {
        newTodos = newTodos.filter(t => t.sourceRitualId !== rituelId);
      }
      paramsRef.current[childId] = { ...childData, todos: newTodos };
      updates.push({ nodeId: childId, todos: newTodos, activeRituals: childData.activeRituals ?? [] });
    });
    setParametres({ ...paramsRef.current });
    if (session) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
  };

  const supprimerRituelBase = async (rituel: Ritual, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Désintégrer ce modèle ?')) return;
    const rituelId = (rituel._id ?? rituel.id) as string;
    const updates: any[] = [];
    Object.keys(paramsRef.current).forEach(nodeKey => {
      const node             = paramsRef.current[nodeKey];
      const newTodos         = (node.todos ?? []).filter(t => t.sourceRitualId !== rituelId);
      const newActiveRituals = (node.activeRituals ?? []).filter(id => id !== rituelId);
      if (newTodos.length !== (node.todos ?? []).length || newActiveRituals.length !== (node.activeRituals ?? []).length) {
        paramsRef.current[nodeKey] = { ...node, todos: newTodos, activeRituals: newActiveRituals };
        updates.push({ nodeId: nodeKey, todos: newTodos, activeRituals: newActiveRituals });
      }
    });
    setParametres({ ...paramsRef.current });
    setRituels(prev => prev.filter(r => (r._id ?? r.id) !== rituelId));
    if (session) {
      await fetch(`/api/rituals?id=${rituelId}`, { method: 'DELETE' });
      if (updates.length > 0) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
    }
  };

  // Toggle global — rend un rituel disponible dans toutes les dimensions
  const toggleRituelGlobal = async (rituel: Ritual, e: React.MouseEvent) => {
    e.stopPropagation();
    const rituelId = (rituel._id ?? rituel.id) as string;
    const wasGlobal = rituel.sandboxId === null || rituel.isGlobal;
    const updated   = { ...rituel, isGlobal: !wasGlobal, sandboxId: !wasGlobal ? null : activeSandboxId };
    setRituels(prev => prev.map(r => (r._id ?? r.id) === rituelId ? updated : r));
    if (session) {
      await fetch(`/api/rituals?id=${rituelId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isGlobal: updated.isGlobal, sandboxId: updated.sandboxId }) });
    }
  };

  // ── Todos locaux ───────────────────────────────────────────────────────────
  const handleAddLocalTodo = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !localInputValue.trim() || !activeSandboxId) return;
    setNodeData(c => ({ ...c, todos: [...(c.todos ?? []), { id: Date.now(), text: localInputValue.trim(), done: false, inherited: false, sandboxId: activeSandboxId }] }));
    setLocalInputValue('');
  };
  const toggleTodo = (id: number) => setNodeData(c => ({ ...c, todos: (c.todos ?? []).map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  const deleteTodo = (id: number) => setNodeData(c => ({ ...c, todos: (c.todos ?? []).filter(t => t.id !== id) }));

  // ── Couleur de fond ────────────────────────────────────────────────────────
  const currentBgColorHex = (() => {
    if (niveau === 6) return '#000000';
    let past = 0, future = 0;
    if (niveau >= 3) {
      [0,1,2,3].forEach(i => { const e = chunkStart + (i+1)*((VUES[niveau].jours??0)/4) - 1; e < indexJourAujourdhui ? past++ : future++; });
    } else if (niveau === 2) {
      [0,1,2,3,4,5].forEach(o => (chunkStart+o) < indexJourAujourdhui ? past++ : future++);
    } else if (niveau === 1) {
      [0,1,2,3,4,5].forEach(b => (activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && b < indexBlocAujourdhui)) ? past++ : future++);
    } else if (niveau === 0) {
      (activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && activeBlock < indexBlocAujourdhui)) ? past++ : future++;
    }
    return past > future ? C_BLUE : C_ORANGE;
  })();

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Grille principale
  // ══════════════════════════════════════════════════════════════════════════
  const renderGrille = () => {

    // ── Niveau 6 : dimensions ──────────────────────────────────────────────
    if (niveau === 6) return (
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full max-w-[1200px] mx-auto px-4 md:px-8 h-full content-center overflow-y-auto">
        {sandboxes.map(sb => {
          const s = sandboxStats[sb.id] ?? { streak:0, streakRecord:0, notesCount:0, todosDone:0, todosTotal:0, ritualsCount:0 };
          return (
            <div key={sb.id} onClick={() => naviguer(5, null, null, sb.id)}
                 className="group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] hover:z-10 border border-white/10 shadow-2xl shrink-0 hover:border-transparent relative overflow-hidden"
                 style={{ backgroundColor: '#000' }}
                 onMouseEnter={e => e.currentTarget.style.backgroundColor = sb.couleur}
                 onMouseLeave={e => e.currentTarget.style.backgroundColor = '#000'}>

              <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ backgroundColor: sb.couleur }} />

              {/* Actions top-left — hover uniquement */}
              <div className="absolute top-3 left-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button onClick={e => supprimerSandbox(sb, e)} className="w-5 h-5 flex items-center justify-center text-white/30 hover:text-white text-base font-mono" title="Supprimer">×</button>
                <button onClick={e => exportDimension(sb, e)} className="text-[7px] font-mono text-white/30 hover:text-white uppercase tracking-widest" title="Exporter JSON">↓</button>
              </div>

              <span className="text-xl md:text-3xl lg:text-4xl font-black text-white/60 tracking-[0.1em] uppercase text-center px-4 leading-tight group-hover:text-white transition-colors">{sb.nom}</span>

              {/* Stats hover */}
              <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-1 pb-4 px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-1.5">
                  {s.streak > 0 ? (
                    <> <span className="text-[11px] font-black font-mono text-white tracking-wider">{s.streak}J</span>
                       <span className="text-[7px] font-mono text-white/40 uppercase tracking-widest">streak</span>
                       {s.streak >= 7 && <span className="text-[8px] text-white/50">◆</span>} </>
                  ) : (
                    <span className="text-[8px] font-mono text-white/30 uppercase tracking-widest">{formatDate(new Date(sb.startDate))}</span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 text-[7px] font-mono text-white/35 uppercase tracking-widest">
                  {s.ritualsCount > 0 && <span>{s.ritualsCount} rit.</span>}
                  {s.notesCount   > 0 && <span>{s.notesCount} notes</span>}
                  {s.todosTotal   > 0 && <span>{s.todosDone}/{s.todosTotal}</span>}
                </div>
                {s.todosTotal > 0 && (
                  <div className="w-full h-px bg-white/10 mt-0.5">
                    <div className="h-px bg-white/40 transition-all" style={{ width: `${Math.round((s.todosDone/s.todosTotal)*100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Tuile + nouvelle dimension + import */}
        <div className="flex flex-col items-center gap-3">
          <div onClick={() => startWizard('DIMENSION')}
               className="group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] border border-white/5 hover:border-white/20 border-dashed shrink-0">
            <span className="text-4xl md:text-6xl font-light text-white/20 group-hover:text-white/60 transition-colors">+</span>
          </div>
          <button onClick={() => importInputRef.current?.click()} className="text-[7px] font-mono text-white/20 hover:text-white/60 uppercase tracking-[0.25em] transition-colors">[ importer ]</button>
          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={importDimension} />
        </div>
      </div>
    );

    // ── Niveau ≥ 3 : grille 2×2 ───────────────────────────────────────────
    if (niveau >= 3) {
      const jours = VUES[niveau].jours ?? 0;
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-4 md:gap-8 h-full aspect-square px-4 pb-8 pt-28 mx-auto w-full max-w-[85vh]">
          {[0,1,2,3].map(i => {
            const blocStartDay  = chunkStart + i*(jours/4);
            const blocEndDay    = blocStartDay + jours/4 - 1;
            const isTodayInside = indexJourAujourdhui >= blocStartDay && indexJourAujourdhui <= blocEndDay;
            const isPast        = blocEndDay < indexJourAujourdhui;
            const isBusy        = hasActiveTasks(blocStartDay, niveau - 1);
            return (
              <div key={i} onClick={() => naviguer(niveau-1, blocStartDay)}
                   style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                   className={`group flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-out relative text-white hover:scale-[1.03] hover:z-20 hover:shadow-2xl rounded-sm ${isTodayInside ? 'ring-1 ring-white/60 z-10' : 'border border-transparent hover:border-white/20'}`}>
                <span className="text-4xl md:text-7xl font-black tracking-tighter opacity-90 group-hover:opacity-100">{jours/4}</span>
                <span className="text-[10px] md:text-xs font-mono mt-3 text-white/60 tracking-widest uppercase opacity-0 group-hover:opacity-100">
                  {formatDate(getDateFromIndex(blocStartDay))} — {formatDate(getDateFromIndex(blocEndDay))}
                </span>
                {isBusy && (
                  <div className="absolute top-3 right-3 md:top-4 md:right-4">
                    <span className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full shadow-md animate-pulse block" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // ── Niveau 2 : 6 jours — FIX pastille : hasActiveTasks(jourIndex, 1) ──
    if (niveau === 2) return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-6 h-full w-full px-4 md:px-8 pb-8 pt-24 md:pt-32 max-w-[1400px] mx-auto overflow-y-auto">
        {[0,1,2,3,4,5].map(offset => {
          const jourIndex = chunkStart + offset;
          const isToday   = jourIndex === indexJourAujourdhui;
          // hasActiveTasks(jourIndex, 1) vérifie lvl1 + tous les lvl0 blocs du jour
          const isBusy    = hasActiveTasks(jourIndex, 1);
          return (
            <div key={offset} className="flex flex-col gap-2 md:gap-3 h-full min-h-[120px] group">
              <div className={`text-center font-mono text-[9px] md:text-[10px] py-1 tracking-widest transition-colors ${isToday ? 'text-white font-bold' : 'text-white/50 group-hover:text-white'}`}>
                {formatDate(getDateFromIndex(jourIndex))}
              </div>
              <div onClick={() => naviguer(1, jourIndex)}
                   className={`flex flex-col gap-1 md:gap-1.5 h-full cursor-pointer transition-all duration-300 hover:scale-[1.02] p-1 relative ${isToday ? 'ring-1 ring-white/50 bg-white/5' : ''}`}>
                {/* Pastille niveau 2 : en haut à droite de la colonne-jour */}
                {isBusy && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-white rounded-full animate-pulse z-10 shadow-md" />}
                {[0,1,2,3,4,5].map(b => (
                  <div key={b}
                       style={{ backgroundColor: jourIndex < indexJourAujourdhui || (isToday && b < indexBlocAujourdhui) ? C_BLUE : C_ORANGE }}
                       className="flex-1 w-full opacity-90 transition-opacity group-hover:opacity-100 min-h-[8px]" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );

    // ── Niveau 1 : 6 blocs — FIX pastille : hasActiveTasks(activeDay, 0, b) ──
    if (niveau === 1) return (
      <div className="flex flex-col h-full w-full max-w-[700px] mx-auto px-4 md:px-8 pb-8 pt-24 md:pt-32 relative overflow-y-auto">
        <div className="absolute top-16 md:top-20 left-4 md:left-8 text-xs md:text-sm font-mono text-white/50 tracking-widest">{formatDate(getDateFromIndex(activeDay))}</div>
        <div className="flex flex-col gap-2 h-full mt-8">
          {[0,1,2,3,4,5].map(b => {
            const isPast    = activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && b < indexBlocAujourdhui);
            const isCurrent = activeDay === indexJourAujourdhui && b === indexBlocAujourdhui;
            // hasActiveTasks(activeDay, 0, b) vérifie le nœud lvl0 exact
            const isBusy    = hasActiveTasks(activeDay, 0, b);
            return (
              <div key={b} onClick={() => naviguer(0, activeDay, b)}
                   style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                   className={`flex-1 w-full min-h-[40px] cursor-pointer flex items-center justify-center relative transition-all duration-300 hover:scale-[1.01] ${isCurrent ? 'ring-1 ring-white/60 z-10' : 'opacity-90'}`}>
                <span className="text-white font-light text-xl md:text-2xl tracking-[0.3em]">{formatHeures(b)}</span>
                {/* Pastille niveau 1 */}
                {isBusy && <span className="absolute top-2 right-3 w-1.5 h-1.5 bg-white rounded-full animate-pulse shadow-md" />}
              </div>
            );
          })}
        </div>
      </div>
    );

    // ── Niveau 0 : bloc — Focus Timer ─────────────────────────────────────
    const isPastBloc = activeDay < indexJourAujourdhui || (activeDay===indexJourAujourdhui && activeBlock < indexBlocAujourdhui);
    return (
      <div className="flex h-full aspect-square px-4 pb-8 pt-20 md:pt-24 mx-auto w-full max-w-[80vh]">
        <div style={{ backgroundColor: isPastBloc ? C_BLUE : C_ORANGE }}
             className={`w-full h-full flex flex-col items-center justify-center relative transition-all duration-500 ${activeDay===indexJourAujourdhui && activeBlock===indexBlocAujourdhui ? 'ring-1 ring-white/60' : ''}`}>
          <div className="absolute top-8 md:top-12 text-white/70 font-mono tracking-[0.3em] text-[10px] md:text-sm">{formatDate(getDateFromIndex(activeDay))}</div>
          <span className="text-white font-black text-5xl md:text-8xl tracking-tighter drop-shadow-md">{formatHeures(activeBlock)}</span>

          {/* Focus Timer */}
          {focusTimer.active ? (
            <div className="absolute bottom-8 md:bottom-12 flex flex-col items-center gap-3">
              <span className={`text-white font-mono font-black tracking-wider text-3xl md:text-5xl ${focusTimer.mode === 'down' && focusTimer.seconds <= 60 && focusTimer.running ? 'opacity-60' : ''}`}>
                {formatTimer(focusTimer.seconds)}
              </span>
              <div className="flex items-center gap-4 text-[9px] font-mono text-white/60 uppercase tracking-widest">
                <button onClick={() => setFocusTimer(p => ({ ...p, running: !p.running }))} className="hover:text-white transition-colors">
                  {focusTimer.running ? 'pause' : 'start'}
                </button>
                <button onClick={() => setFocusTimer(p => ({ ...p, running: false, seconds: p.mode === 'down' ? p.preset : 0 }))} className="hover:text-white transition-colors text-white/30">reset</button>
                <button onClick={() => setFocusTimer(p => {
                  const next = p.mode === 'up' ? 'down' : 'up';
                  return { ...p, mode: next, running: false, seconds: next === 'down' ? p.preset : 0 };
                })} className="hover:text-white transition-colors text-white/30">
                  {focusTimer.mode === 'up' ? '↓ 25m' : '↑ libre'}
                </button>
                <button onClick={() => setFocusTimer({ active: false, running: false, seconds: 0, mode: 'up', preset: 25*60 })} className="hover:text-white transition-colors text-white/20">×</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setFocusTimer(p => ({ ...p, active: true }))}
                    className="absolute bottom-8 md:bottom-12 text-[8px] font-mono text-white/20 hover:text-white/60 uppercase tracking-[0.3em] transition-colors">
              [ focus ]
            </button>
          )}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU — Wizard
  // ══════════════════════════════════════════════════════════════════════════
  const renderWizard = () => {
    const isDim   = wizard.type === 'DIMENSION';
    const maxStep = isDim ? 2 : 3;
    const wizBg   = isDim ? '#000000' : (activeSandbox?.couleur ?? '#000000');
    const handleNext = () => wizard.step < maxStep ? setWizard(w => ({ ...w, step: w.step+1 })) : submitWizard();
    const handlePrev = () => wizard.step > 0 ? setWizard(w => ({ ...w, step: w.step-1 })) : closeWizard();

    return (
      <div className={`fixed inset-0 z-[100] flex flex-col transition-opacity duration-500 ${wizard.active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ backgroundColor: wizBg }}>

        <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-y-auto p-6 md:p-8 max-w-[800px] mx-auto">

          {isDim && wizard.step === 0 && (
            <input autoFocus value={wizard.data.nom} onChange={e => setWizard(w => ({ ...w, data: { ...w.data, nom: e.target.value } }))} onKeyDown={e => e.key==='Enter' && handleNext()} className="w-full bg-transparent text-5xl md:text-7xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/20" placeholder="NOM" />
          )}
          {isDim && wizard.step === 1 && (
            <div className="flex flex-col items-center gap-8">
              <span className="text-white/50 font-mono tracking-widest uppercase">Signature Visuelle</span>
              <input type="color" value={wizard.data.couleur} onChange={e => setWizard(w => ({ ...w, data: { ...w.data, couleur: e.target.value } }))} className="w-32 h-32 cursor-pointer border-0 bg-transparent p-0 rounded-full shadow-2xl" />
            </div>
          )}
          {isDim && wizard.step === 2 && (
            <div className="flex flex-col items-center gap-8">
              <span className="text-white/50 font-mono tracking-widest uppercase">Origine (Jour 1)</span>
              <input type="date" value={wizard.data.date} onChange={e => setWizard(w => ({ ...w, data: { ...w.data, date: e.target.value } }))} className="text-3xl md:text-5xl font-mono text-white bg-transparent outline-none text-center cursor-pointer" />
            </div>
          )}

          {!isDim && wizard.step === 0 && (
            <input autoFocus value={wizard.data.nom} onChange={e => setWizard(w => ({ ...w, data: { ...w.data, nom: e.target.value } }))} onKeyDown={e => e.key==='Enter' && handleNext()} className="w-full bg-transparent text-4xl md:text-7xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/20" placeholder="NOM DU MODÈLE" />
          )}

          {!isDim && wizard.step === 1 && (
            <div className="flex flex-col items-center gap-8 w-full">
              <span className="text-white/50 font-mono tracking-widest uppercase">Projection Cible</span>
              <div className="grid grid-cols-1 gap-4 w-full max-w-[400px]">
                {Object.values(VUES).filter(v => v.niveau < niveau && v.niveau >= 0).reverse().map(v => (
                  <button key={`target-${v.niveau}`}
                          onClick={() => setWizard(w => ({ ...w, data: { ...w.data, targetNiveau: v.niveau, pattern: emptyPattern() }, step: 2 }))}
                          className={`p-4 border text-center font-bold tracking-widest transition-colors ${wizard.data.targetNiveau === v.niveau ? 'bg-white text-black border-white' : 'bg-transparent text-white/50 border-white/20 hover:border-white hover:text-white'}`}>
                    {v.nom}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CRON Fractal — layout compact ligne/couche */}
          {!isDim && wizard.step === 2 && (
            <div className="flex flex-col gap-5 w-full max-w-[600px]">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-white/40 font-mono tracking-widest uppercase text-[10px]">CRON Fractal</span>
                {/* Toggle local / global */}
                <button onClick={() => setWizard(w => ({ ...w, data: { ...w.data, isGlobal: !w.data.isGlobal } }))}
                        className={`text-[8px] font-mono uppercase tracking-widest px-2 py-1 border transition-colors ${wizard.data.isGlobal ? 'border-white text-white bg-white/10' : 'border-white/20 text-white/30 hover:text-white/60'}`}>
                  {wizard.data.isGlobal ? '◆ GLOBAL' : '○ LOCAL'}
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {(() => {
                  const layers: number[] = [];
                  for (let l = niveau-1; l >= wizard.data.targetNiveau; l--) layers.push(l);
                  return layers.map(layerIndex => {
                    const parentVue  = VUES[layerIndex + 1];
                    const numBoutons = parentVue?.divisions ?? 1;
                    const selected   = wizard.data.pattern[layerIndex] ?? [];
                    return (
                      <div key={`layer-${layerIndex}`} className="flex items-center gap-3 border-l border-white/20 pl-3 py-1">
                        <div className="flex flex-col gap-0.5 w-[90px] md:w-[110px] shrink-0">
                          <span className="text-[7px] font-mono text-white/30 uppercase tracking-widest leading-tight">/{parentVue.nom}</span>
                          <span className="text-[10px] font-black text-white/80 uppercase tracking-wide leading-tight">{parentVue.labelEnfant}</span>
                          {selected.length === 0 && <span className="text-[6px] font-mono text-white/25 uppercase tracking-widest">∅ tous</span>}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {Array.from({ length: numBoutons }, (_, btnIndex) => (
                            <button key={`btn-${layerIndex}-${btnIndex}`}
                                    onClick={() => {
                                      setWizard(prev => {
                                        const np = deepClonePattern(prev.data.pattern);
                                        if (np[layerIndex].includes(btnIndex)) {
                                          np[layerIndex] = np[layerIndex].filter(x => x !== btnIndex);
                                        } else {
                                          np[layerIndex] = [...np[layerIndex], btnIndex].sort((a,b) => a-b);
                                        }
                                        return { ...prev, data: { ...prev.data, pattern: np } };
                                      });
                                    }}
                                    className={`w-7 h-7 flex items-center justify-center text-xs font-mono transition-colors ${selected.includes(btnIndex) ? 'bg-white text-black' : 'bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70'}`}>
                              {btnIndex + 1}
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
              <span className="text-white/50 font-mono tracking-widest uppercase text-center">Action à hériter</span>
              <input autoFocus type="text" value={wizTaskInput} onChange={e => setWizTaskInput(e.target.value)}
                     onKeyDown={e => { if (e.key==='Enter' && wizTaskInput.trim()) { setWizard(w => ({ ...w, data: { ...w.data, elements: [...w.data.elements, { itemType:'task', text: wizTaskInput.trim() }] } })); setWizTaskInput(''); } }}
                     placeholder="Écrire et appuyer sur Entrée..." className="text-2xl font-light border-b-2 border-white/20 focus:border-white py-4 outline-none bg-transparent text-white placeholder:text-white/20 text-center" />
              <div className="flex flex-col gap-2">
                {wizard.data.elements.map((el, i) => <div key={i} className="text-lg font-mono text-white/70 text-center">— {el.text}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="w-full flex justify-between p-8 md:p-12 text-xs md:text-sm font-mono uppercase tracking-[0.3em] font-bold text-white/50 shrink-0">
          <button onClick={handlePrev} className="hover:text-white transition-colors py-4 px-8 border border-transparent hover:border-white/20">{wizard.step===0 ? 'Annuler' : 'Précédent'}</button>
          <button onClick={handleNext} className="hover:text-white transition-colors py-4 px-8 border border-white/20 hover:bg-white hover:text-black">{wizard.step===maxStep ? 'Valider' : 'Suivant'}</button>
        </div>
      </div>
    );
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div className="h-screen w-screen bg-black flex items-center justify-center">
      <div className="text-white font-mono tracking-widest text-xs uppercase animate-pulse">Chargement</div>
    </div>
  );
  if (!isReady) return <div className="h-screen w-screen bg-black" />;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDU PRINCIPAL
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <main className="flex flex-col lg:flex-row h-[100dvh] w-screen bg-black font-sans overflow-hidden relative">

      {renderWizard()}

      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSidebarOpen(false)} />}

      {/* ── Breadcrumb ── */}
      <div className="absolute top-6 md:top-8 left-6 md:left-8 z-40 flex items-center gap-2 md:gap-3">
        <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] drop-shadow-md flex items-center gap-2 transition-colors ${niveau===6 ? 'text-white/60' : 'text-white'}`}>
          {niveau < 6 ? activeSandbox?.nom : 'BLOCK'}
          <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ backgroundColor: niveau < 6 ? activeSandbox?.couleur : 'rgba(255,255,255,0.4)' }} />
        </span>
        {niveau < 6 && (
          <> <span className="text-white/20 text-xs">/</span>
             <button onClick={() => naviguer(6)} className="text-[9px] md:text-[10px] font-mono text-white/50 hover:text-white uppercase tracking-widest transition-colors">RACINE</button> </>
        )}
      </div>

      {/* ── Bouton DATA ── */}
      <button onClick={() => setIsSidebarOpen(true)}
              className={`fixed top-6 md:top-8 right-6 md:right-8 z-40 text-white/50 text-[9px] md:text-[10px] font-mono tracking-widest uppercase hover:text-white transition-colors drop-shadow-md ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        [ DATA ]
      </button>

      {/* ── Badge Revue — derniers jours d'une période ── */}
      {isRevuePeriod && !showRevue && (
        <button onClick={() => setShowRevue(true)}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 text-[8px] font-mono uppercase tracking-[0.3em] text-white/40 hover:text-white border border-white/15 hover:border-white/40 px-5 py-2.5 transition-colors backdrop-blur-sm">
          [ REVUE ↗ ]
        </button>
      )}

      {/* ── Modal Revue fractale ── */}
      {showRevue && revueStats && (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-8" onClick={() => setShowRevue(false)}>
          <div className="bg-white text-black max-w-[400px] w-full p-8 flex flex-col gap-6" onClick={e => e.stopPropagation()}>
            <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-gray-400">Revue Fractale — {VUES[niveau].nom}</span>
            <span className="text-xs font-mono text-gray-400">{revueStats.period}</span>
            <div className="flex gap-6 items-end">
              <div className="flex flex-col gap-1">
                <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Tâches</span>
                <span className="text-2xl font-black">{revueStats.done}<span className="text-gray-300 font-normal text-base">/{revueStats.todos}</span></span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Notes</span>
                <span className="text-2xl font-black">{revueStats.notes}</span>
              </div>
              {activeSandboxId && (sandboxStats[activeSandboxId]?.streak ?? 0) > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Streak</span>
                  <span className="text-2xl font-black">{sandboxStats[activeSandboxId].streak}J</span>
                </div>
              )}
            </div>
            {revueStats.todos > 0 && (
              <div className="w-full h-1 bg-gray-100">
                <div className="h-1 bg-black" style={{ width: `${Math.round((revueStats.done/revueStats.todos)*100)}%` }} />
              </div>
            )}
            <button onClick={() => setShowRevue(false)} className="text-[8px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors self-end">FERMER</button>
          </div>
        </div>
      )}

      {/* ── Streak alert ── */}
      {showStreakAlert && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] bg-white text-black flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <span className="text-[8px] font-mono uppercase tracking-widest">
            ◆ {sandboxStats[activeSandboxId!]?.streak}J — STREAK À RISQUE
          </span>
          <button onClick={() => { setShowStreakAlert(false); streakAlertDismissed.current = true; }} className="text-[9px] font-mono text-gray-400 hover:text-black transition-colors">×</button>
        </div>
      )}

      {/* ── Zone principale avec gestion swipe ── */}
      <section style={{ backgroundColor: currentBgColorHex }}
               className="flex-1 flex flex-col relative w-full overflow-hidden transition-colors duration-1000 ease-in-out"
               onTouchStart={handleTouchStart}
               onTouchEnd={handleTouchEnd}>

        {niveau < 6 && (
          <nav className="absolute top-14 md:top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 md:gap-4 flex-wrap justify-center w-full px-4">
            {[5,4,3,2,1,0].map(niv => {
              if (niv > niveau) return (
                <div key={niv} className="flex items-center gap-2 md:gap-4">
                  <button onClick={() => naviguer(niv)} className="text-[8px] md:text-[9px] font-mono text-white/40 hover:text-white tracking-widest uppercase transition-colors drop-shadow-md">{VUES[niv].nom}</button>
                  <span className="text-white/20 text-[8px] md:text-[9px]">-</span>
                </div>
              );
              if (niv === niveau) return <span key={niv} className="text-[8px] md:text-[9px] font-mono font-bold text-white tracking-widest uppercase border-b border-white pb-0.5 drop-shadow-md">{VUES[niv].nom}</span>;
              return null;
            })}
          </nav>
        )}

        <div className={`flex-1 flex items-center justify-center ${zoomStyle} w-full`}>{renderGrille()}</div>
      </section>

      {/* ── Sidebar ── */}
      <aside className={`fixed top-0 right-0 h-full w-[85%] max-w-[400px] bg-white text-black flex flex-col z-50 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSidebarOpen ? 'translate-x-0 shadow-[-20px_0_40px_rgba(0,0,0,0.1)]' : 'translate-x-full'}`}>

        <header className="p-6 md:p-8 flex justify-between items-start shrink-0">
          <div className="flex flex-col gap-4 md:gap-5">
            {/* Profil */}
            <div className="flex items-center gap-3">
              {session?.user?.image
                ? <img src={session.user.image} alt="Profil" className="w-6 h-6 md:w-8 md:h-8 rounded-full object-cover grayscale" />
                : <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">{session?.user?.name?.charAt(0).toUpperCase() ?? 'U'}</div>
              }
              <div className="flex flex-col">
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em]">{session?.user?.name ?? 'Architecte'}</span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1 h-1 rounded-full ${status==='authenticated' ? 'bg-black' : 'bg-red-500'}`} />
                  <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-[7px] md:text-[8px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors">{status==='authenticated' ? 'LOGOUT' : 'OFFLINE'}</button>
                </div>
              </div>
            </div>

            {/* Stats dimension active */}
            {niveau < 6 && activeSandboxId && (() => {
              const s = sandboxStats[activeSandboxId];
              if (!s) return null;
              return (
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Streak</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black tracking-wider">{s.streak > 0 ? `${s.streak}J` : '—'}</span>
                      {s.streak >= 7 && <span className="text-[7px] font-mono text-gray-300 uppercase tracking-widest">rec.{s.streakRecord}J</span>}
                    </div>
                  </div>
                  {s.todosTotal > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Tâches</span>
                      <span className="text-sm font-black tracking-wider">{s.todosDone}<span className="text-gray-300 font-normal text-xs">/{s.todosTotal}</span></span>
                    </div>
                  )}
                  {s.notesCount > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Notes</span>
                      <span className="text-sm font-black tracking-wider">{s.notesCount}</span>
                    </div>
                  )}
                  {s.ritualsCount > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Rituels</span>
                      <span className="text-sm font-black tracking-wider">{s.ritualsCount}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Heatmap 8 semaines */}
            {niveau < 6 && heatmapData.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[7px] font-mono text-gray-400 uppercase tracking-widest">Activité</span>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', maxWidth: '180px' }}>
                  {heatmapData.map((d, i) => (
                    <div key={i} title={`J${indexJourAujourdhui - 55 + i}`}
                         className={`aspect-square rounded-sm transition-colors ${
                           d.future  ? 'bg-gray-50' :
                           d.isToday ? 'bg-black ring-1 ring-offset-1 ring-black' :
                           d.active  ? 'bg-black' : 'bg-gray-100'
                         }`} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-[8px] md:text-[9px] font-mono tracking-[0.2em] text-gray-400 uppercase">{niveau < 6 ? formatDate(getDateFromIndex(activeDay)) : 'ADMINISTRATION'}</span>
              <h2 className="text-[10px] md:text-xs font-black uppercase tracking-widest">{VUES[niveau].nom}</h2>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-gray-300 hover:text-black transition-colors p-2 -m-2">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-8 flex flex-col gap-8 md:gap-10">
          {niveau < 6 ? (
            <>
              {/* Rituels — locaux + globaux */}
              <div className="flex flex-col gap-3 md:gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Matrice</span>
                  {!wizard.active && niveau > 1 && (
                    <button onClick={() => startWizard('RITUEL')} className="text-[8px] md:text-[9px] font-bold text-gray-300 hover:text-black tracking-widest uppercase p-1 -m-1">[+ NEW MODEL]</button>
                  )}
                </div>
                <div className="flex flex-col gap-2 md:gap-3">
                  {filteredRituels.map(r => {
                    const ritualId = (r._id ?? r.id) as string;
                    const isActive = (nodeData.activeRituals ?? []).includes(ritualId);
                    const isGlobal = r.sandboxId === null || !!r.isGlobal;
                    return (
                      <div key={ritualId} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => toggleRitualActivation(r)}>
                          <div className={`w-1 h-1 rounded-full transition-colors ${isActive ? 'bg-black' : 'bg-gray-200'}`} />
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-black' : 'text-gray-400'}`}>{r.nom}</span>
                          {isGlobal && <span className="text-[7px] text-gray-300" title="Rituel global">◆</span>}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => toggleRituelGlobal(r, e)} className={`text-[7px] font-mono uppercase tracking-widest px-1.5 py-1 transition-colors ${isGlobal ? 'text-black' : 'text-gray-300 hover:text-black'}`} title="Passer global / local">◆</button>
                          <button onClick={e => supprimerRituelBase(r, e)} className="text-[7px] font-mono text-gray-300 hover:text-red-500 uppercase tracking-widest px-1.5 py-1">Del</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Todos */}
              <div className="flex flex-col gap-3 md:gap-4 mt-2 md:mt-4">
                <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Action</span>
                <input type="text" value={localInputValue} onChange={e => setLocalInputValue(e.target.value)} onKeyDown={handleAddLocalTodo} placeholder="..." className="w-full text-[9px] md:text-[10px] font-mono border-b border-transparent hover:border-gray-200 focus:border-black py-1 outline-none bg-transparent transition-colors placeholder:text-gray-300" />
                <div className="flex flex-col gap-2">
                  {(nodeData.todos ?? []).map(item => (
                    <div key={item.id} className="flex items-start justify-between group">
                      <div className="flex items-start gap-2 md:gap-3 cursor-pointer" onClick={() => toggleTodo(item.id)}>
                        <div className={`mt-0.5 w-1.5 h-1.5 md:w-2 md:h-2 border border-black flex items-center justify-center shrink-0 transition-colors ${item.done ? 'bg-black' : 'bg-transparent'}`} />
                        <div className="flex flex-col">
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest leading-snug ${item.done ? 'line-through text-gray-300' : 'text-black'}`}>{item.text}</span>
                          {item.inherited && <span className="text-[7px] md:text-[8px] font-mono text-gray-400 mt-0.5">↳ {item.sourceRitualLayer ?? item.sourceRitualName}</span>}
                        </div>
                      </div>
                      {!item.inherited && <button onClick={() => deleteTodo(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-[7px] md:text-[8px] font-mono transition-opacity ml-2 p-1">X</button>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes / Log */}
              <div className="flex flex-col gap-1.5 md:gap-2 h-full min-h-[150px] mt-2 md:mt-4">
                <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Log</span>
                <textarea value={nodeData.notes} onChange={handleNotesChange} placeholder="..." className="flex-1 w-full text-[9px] md:text-[10px] font-mono leading-relaxed text-gray-500 outline-none resize-none bg-transparent placeholder:text-gray-200" />
              </div>
            </>
          ) : (
            <div className="text-[8px] font-mono text-gray-400 uppercase tracking-widest border border-dashed border-gray-200 p-4 text-center mt-4">
              [ PLONGEZ DANS UNE DIMENSION POUR ACCÉDER AUX DONNÉES ]
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}
