"use client";
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';

const C_BLUE = '#044389';
const C_ORANGE = '#EC4E20';

const VUES = {
  0: { niveau: 0, nom: '1 BLOC',  jours: 1,  divisions: 6, labelEnfant: '-' },
  1: { niveau: 1, nom: '1 JOUR',  jours: 1,  divisions: 6, labelEnfant: 'Bloc de 4h' },
  2: { niveau: 2, nom: '6 JOURS', jours: 6,  divisions: 6, labelEnfant: 'Jour' },
  3: { niveau: 3, nom: '24 JOURS', jours: 24, divisions: 4, labelEnfant: 'Période de 6J' },
  4: { niveau: 4, nom: '96 JOURS', jours: 96, divisions: 4, labelEnfant: 'Mois (24J)' },
  5: { niveau: 5, nom: '384 JOURS', jours: 384, divisions: 4, labelEnfant: 'Trimestre (96J)' },
  6: { niveau: 6, nom: 'BLOCK', jours: null, divisions: null, labelEnfant: 'Dimension' }, // FIX : Renommé en BLOCK
};

const formatDate = (date: any) => date ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
const formatHeures = (blocIndex: any) => `${(blocIndex * 4).toString().padStart(2, '0')}h00 - ${((blocIndex + 1) * 4).toString().padStart(2, '0')}h00`;

export default function AgendaExtremeMinimalism() {
  const { data: session, status } = useSession();
  
  const [isReady, setIsReady] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(new Date().getTime());
  
  const [niveau, setNiveau] = useState(6);
  const [activeDay, setActiveDay] = useState(0);
  const [activeBlock, setActiveBlock] = useState(0);
  
  const [sandboxes, setSandboxes] = useState([]);
  const [activeSandboxId, setActiveSandboxId] = useState(null);

  const [parametres, setParametres] = useState({});
  const [rituels, setRituels] = useState([]); 
  const paramsRef = useRef({});
  const saveQueue = useRef({});
  
  const [zoomStyle, setZoomStyle] = useState("scale-100 opacity-100 transition-all duration-500 ease-out");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ——————————————————————————————————————————————————————————————————————
  // ÉTAT DU WIZARD PLEIN ÉCRAN
  // ——————————————————————————————————————————————————————————————————————
  const defaultWizardData = { nom: '', couleur: C_BLUE, date: new Date().toISOString().split('T')[0], targetNiveau: 0, pattern: { 4: [], 3: [], 2: [], 1: [], 0: [] }, elements: [] };
  const [wizard, setWizard] = useState({ active: false, type: 'DIMENSION', step: 0, data: defaultWizardData });
  const [wizTaskInput, setWizTaskInput] = useState("");

  const activeSandbox = activeSandboxId ? sandboxes.find(sb => sb.id === activeSandboxId) : null;
  const systemStartDate = activeSandbox?.startDate ? new Date(activeSandbox.startDate) : new Date();

  useEffect(() => {
    const savedNiv = parseInt(localStorage.getItem('fractal_niveau') || '6');
    const savedSb = localStorage.getItem('fractal_sandbox');
    
    if (savedNiv < 6 && (!savedSb || savedSb === 'null')) {
      setNiveau(6); setActiveSandboxId(null);
    } else {
      setNiveau(savedNiv); setActiveSandboxId(savedSb === 'null' ? null : savedSb);
    }
    
    setActiveDay(parseInt(localStorage.getItem('fractal_day') || '0'));
    setActiveBlock(parseInt(localStorage.getItem('fractal_block') || '0'));
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    localStorage.setItem('fractal_niveau', niveau.toString());
    localStorage.setItem('fractal_day', activeDay.toString());
    localStorage.setItem('fractal_block', activeBlock.toString());
    localStorage.setItem('fractal_sandbox', activeSandboxId || 'null');
  }, [niveau, activeDay, activeBlock, activeSandboxId, isReady]);

  useEffect(() => {
    if (session && isReady) {
      Promise.all([fetch('/api/settings').then(res => res.json()), fetch('/api/rituals').then(res => res.json()), fetch('/api/nodedata').then(res => res.json())])
      .then(([settingsData, ritualsData, nodesData]) => {
        const loadedSandboxes = settingsData.sandboxes || [];
        setSandboxes(loadedSandboxes);
        if (activeSandboxId && !loadedSandboxes.some(sb => sb.id === activeSandboxId)) { setActiveSandboxId(null); setNiveau(6); }
        
        const validRituels = Array.isArray(ritualsData) ? ritualsData : [];
        setRituels(validRituels);
        const validRitualIds = validRituels.map(r => r._id || r.id);

        if (Array.isArray(nodesData)) {
          const formatted = {};
          let hasPhantoms = false;
          const purgeUpdates = [];

          nodesData.forEach(n => { 
            const cleanTodos = (n.todos || []).filter(t => !t.inherited || validRitualIds.includes(t.sourceRitualId));
            const cleanRituals = (n.activeRituals || []).filter(id => validRitualIds.includes(id));
            if (cleanTodos.length !== (n.todos || []).length || cleanRituals.length !== (n.activeRituals || []).length) {
              hasPhantoms = true; purgeUpdates.push({ nodeId: n.nodeId, todos: cleanTodos, activeRituals: cleanRituals });
            }
            formatted[n.nodeId] = { notes: n.notes || "", todos: cleanTodos, activeRituals: cleanRituals }; 
          });
          setParametres(formatted); paramsRef.current = formatted; 
          if (hasPhantoms) fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: purgeUpdates }) });
        }
      }).catch(err => console.error(err));
    }
  }, [session, isReady]);

  const MAINTENANT = new Date();
  const startMidnight = new Date(systemStartDate).setHours(0, 0, 0, 0);
  const todayMidnight = new Date(MAINTENANT).setHours(0, 0, 0, 0);
  const indexJourAujourdhui = Math.floor((todayMidnight - startMidnight) / (1000 * 60 * 60 * 24));
  const indexBlocAujourdhui = Math.floor(MAINTENANT.getHours() / 4);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTimeMs(new Date().getTime()), 60000);
    return () => clearInterval(interval);
  }, []);

  const getDateFromIndex = (indexJour) => { const d = new Date(systemStartDate); d.setDate(d.getDate() + indexJour); return d; };
  const getChunkStart = () => niveau < 6 ? Math.floor(activeDay / VUES[niveau].jours) * VUES[niveau].jours : 0;
  const chunkStart = getChunkStart();

  // FIX MAJEUR : L'ID DU NŒUD EST MAINTENANT STRICTEMENT LIÉ À LA SANDBOX
  const getComputedNodeId = (sandboxId, niv, day, block = 0) => {
    const prefix = sandboxId ? `${sandboxId}_` : '';
    if (niv === 0) return `${prefix}lvl0-jour${day}-bloc${block}`;
    if (niv === 1) return `${prefix}lvl1-jour${day}`;
    return `${prefix}lvl${niv}-start${Math.floor(day / VUES[niv].jours) * VUES[niv].jours}`;
  };

  const nodeId = niveau < 6 ? getComputedNodeId(activeSandboxId, niveau, activeDay, activeBlock) : 'ROOT';
  const nodeData = parametres[nodeId] || { notes: '', todos: [], activeRituals: [] };

  const filteredTodos = nodeData.todos || [];
  const filteredRituels = activeSandboxId ? rituels.filter(r => r.niveau === niveau && r.sandboxId === activeSandboxId) : [];

  const setNodeData = (newDataUpdater, targetNodeId = nodeId) => {
    if (niveau === 6) return;
    const currentNode = paramsRef.current[targetNodeId] || { notes: '', todos: [], activeRituals: [] };
    const resolvedData = typeof newDataUpdater === 'function' ? newDataUpdater(currentNode) : newDataUpdater;
    const updatedNode = { ...currentNode, ...resolvedData };

    paramsRef.current = { ...paramsRef.current, [targetNodeId]: updatedNode };
    setParametres({ ...paramsRef.current });

    if (session) {
      clearTimeout(saveQueue.current[targetNodeId]);
      saveQueue.current[targetNodeId] = setTimeout(() => {
        fetch('/api/nodedata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId: targetNodeId, ...updatedNode }) });
      }, 500);
    }
  };

  const handleNotesChange = (e) => setNodeData({ notes: e.target.value });

  const naviguer = (nouveauNiveau, cibleJour = null, cibleBloc = null, sandboxCibleId = null) => {
    if (nouveauNiveau === niveau || nouveauNiveau < 0 || nouveauNiveau > 6) return;
    if (nouveauNiveau === 6) {
      setZoomStyle(`transition-all duration-400 ease-in-out opacity-0 scale-[0.8]`);
      setTimeout(() => { setActiveSandboxId(null); setNiveau(6); setZoomStyle(`transition-none opacity-0 scale-[1.2]`); requestAnimationFrame(() => requestAnimationFrame(() => setZoomStyle("transition-all duration-500 ease-out opacity-100 scale-100"))); }, 300);
      return;
    }
    if (niveau === 6 && sandboxCibleId) {
      setZoomStyle(`transition-all duration-400 ease-in-out opacity-0 scale-[1.2]`);
      setTimeout(() => { setActiveSandboxId(sandboxCibleId); setNiveau(5); setZoomStyle(`transition-none opacity-0 scale-[0.8]`); requestAnimationFrame(() => requestAnimationFrame(() => setZoomStyle("transition-all duration-500 ease-out opacity-100 scale-100"))); }, 300);
      return;
    }
    setZoomStyle(`transition-all duration-400 ease-in-out opacity-0 ${nouveauNiveau < niveau ? 'scale-[1.2]' : 'scale-[0.8]'}`);
    setTimeout(() => {
      if (cibleJour !== null) setActiveDay(cibleJour);
      if (cibleBloc !== null) setActiveBlock(cibleBloc);
      setNiveau(nouveauNiveau);
      setZoomStyle(`transition-none opacity-0 ${nouveauNiveau < niveau ? 'scale-[0.8]' : 'scale-[1.2]'}`);
      requestAnimationFrame(() => requestAnimationFrame(() => setZoomStyle("transition-all duration-500 ease-out opacity-100 scale-100")));
    }, 300);
  };

  // ——————————————————————————————————————————————————————————————————————
  // LOGIQUE WIZARD PLEIN ÉCRAN
  // ——————————————————————————————————————————————————————————————————————
  const startWizard = (type) => {
    setIsSidebarOpen(false);
    setWizard({ active: true, type, step: 0, data: { ...defaultWizardData, targetNiveau: Math.max(0, niveau - 1) } });
  };

  const closeWizard = () => setWizard(prev => ({ ...prev, active: false }));

  const submitWizard = async () => {
    if (wizard.type === 'DIMENSION') {
      if (!wizard.data.nom.trim()) return;
      const newSb = { id: `sb_${Date.now()}`, nom: wizard.data.nom.toUpperCase(), couleur: wizard.data.couleur, startDate: new Date(wizard.data.date) };
      const updated = [...sandboxes, newSb];
      setSandboxes(updated);
      if (session) await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updated }) });
    } else {
      if (!wizard.data.nom.trim() || wizard.data.elements.length === 0) return;
      const payload = { sandboxId: activeSandboxId, niveau, nom: wizard.data.nom, targetNiveau: wizard.data.targetNiveau, pattern: wizard.data.pattern, elements: wizard.data.elements };
      if (session) {
        const res = await fetch('/api/rituals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) setRituels([...rituels, await res.json()]);
      } else setRituels([...rituels, { ...payload, id: Date.now() }]);
    }
    closeWizard();
  };

  const deleteSandbox = async (id, e) => {
    e.stopPropagation();
    if (confirm("Désintégrer cet univers ? (Irréversible)")) {
      const updated = sandboxes.filter(sb => sb.id !== id);
      setSandboxes(updated);
      if (session) await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sandboxes: updated }) });
      
      // PURGE ABSOLUE : Détruit tous les nœuds de cette Sandbox
      const updates = [];
      Object.keys(paramsRef.current).forEach(nodeKey => {
        if (nodeKey.startsWith(id + '_')) {
          paramsRef.current[nodeKey] = { notes: '', todos: [], activeRituals: [] };
          updates.push({ nodeId: nodeKey, todos: [], activeRituals: [] });
        }
      });
      setParametres({ ...paramsRef.current });
      setRituels(rituels.filter(r => r.sandboxId !== id));
      if (session && updates.length > 0) fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
    }
  };

  const generateTargetNodeIds = (baseNiveau, baseStartDay, pattern, targetNiveau) => {
    let currentDays = [baseStartDay];
    const safeTargetNiveau = targetNiveau || 0;
    const safePattern = pattern || {};
    for (let niv = baseNiveau - 1; niv >= Math.max(1, safeTargetNiveau); niv--) {
      const nextDays = [];
      const divSize = VUES[niv].jours;
      const chunks = VUES[niv + 1].divisions;
      currentDays.forEach(day => {
        const selectedFractions = safePattern[niv] || [];
        const fractionsToUse = selectedFractions.length === 0 ? Array.from({length: chunks}, (_, i) => i) : selectedFractions;
        fractionsToUse.forEach(i => nextDays.push(day + i * divSize));
      });
      currentDays = nextDays;
    }
    if (safeTargetNiveau > 0) return currentDays.map(day => getComputedNodeId(activeSandboxId, safeTargetNiveau, day, 0));
    const nodeIds = [];
    currentDays.forEach(day => {
      const selectedBlocks = safePattern[0] || [];
      const blocksToUse = selectedBlocks.length === 0 ? [0,1,2,3,4,5] : selectedBlocks;
      blocksToUse.forEach(b => nodeIds.push(getComputedNodeId(activeSandboxId, 0, day, b)));
    });
    return nodeIds;
  };

  const toggleRitualActivation = async (rituel) => {
    const rituelId = rituel._id || rituel.id;
    const currentNode = paramsRef.current[nodeId] || { activeRituals: [] };
    const isActivating = !(currentNode.activeRituals || []).includes(rituelId);

    const newActiveRituals = isActivating ? [...(currentNode.activeRituals || []), rituelId] : (currentNode.activeRituals || []).filter(id => id !== rituelId);
    paramsRef.current = { ...paramsRef.current, [nodeId]: { ...currentNode, activeRituals: newActiveRituals } };

    const targetNodeIds = generateTargetNodeIds(rituel.niveau, chunkStart, rituel.pattern, rituel.targetNiveau);
    const updates = [{ nodeId, todos: currentNode.todos || [], activeRituals: newActiveRituals }];

    targetNodeIds.forEach(childId => {
      const childData = paramsRef.current[childId] || { todos: [], activeRituals: [] };
      let newTodos = [...(childData.todos || [])];
      if (isActivating) {
        (rituel.elements || []).forEach(el => {
          if (!newTodos.some(t => t.sourceRitualId === rituelId && t.text === el.text)) {
            newTodos.push({ id: Date.now() + Math.random(), text: el.text, done: false, inherited: true, sourceRitualId: rituelId, sourceRitualName: rituel.nom, sandboxId: activeSandboxId });
          }
        });
      } else { newTodos = newTodos.filter(t => t.sourceRitualId !== rituelId); }
      paramsRef.current[childId] = { ...childData, todos: newTodos };
      updates.push({ nodeId: childId, todos: newTodos, activeRituals: childData.activeRituals || [] });
    });
    setParametres({ ...paramsRef.current });
    if (session) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
  };

  const supprimerRituelBase = async (rituel, e) => {
    e.stopPropagation();
    if (confirm("Désintégrer ce modèle et toutes ses tâches ?")) {
      const rituelId = rituel._id || rituel.id;
      const updates = [];
      Object.keys(paramsRef.current).forEach(nodeKey => {
        const node = paramsRef.current[nodeKey];
        let hasChanges = false;
        let newTodos = node.todos || [];
        let newActiveRituals = node.activeRituals || [];

        if (newTodos.some(t => t.sourceRitualId === rituelId)) { newTodos = newTodos.filter(t => t.sourceRitualId !== rituelId); hasChanges = true; }
        if (newActiveRituals.includes(rituelId)) { newActiveRituals = newActiveRituals.filter(id => id !== rituelId); hasChanges = true; }
        if (hasChanges) {
          paramsRef.current[nodeKey] = { ...node, todos: newTodos, activeRituals: newActiveRituals };
          updates.push({ nodeId: nodeKey, todos: newTodos, activeRituals: newActiveRituals });
        }
      });
      setParametres({ ...paramsRef.current });
      setRituels(rituels.filter(r => (r._id || r.id) !== rituelId));
      if (session) {
        await fetch(`/api/rituals?id=${rituelId}`, { method: 'DELETE' });
        if (updates.length > 0) await fetch('/api/nodedata/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates }) });
      }
    }
  };

  const [localInputValue, setLocalInputValue] = useState("");
  const handleAddLocalTodo = (e) => {
    if (e.key === 'Enter' && localInputValue.trim() !== '') {
      if (!activeSandboxId) return;
      setNodeData({ todos: [...(nodeData.todos||[]), { id: Date.now(), text: localInputValue.trim(), done: false, inherited: false, sandboxId: activeSandboxId }] });
      setLocalInputValue("");
    }
  };
  const toggleTodo = (id) => setNodeData({ todos: (nodeData.todos||[]).map(t => t.id === id ? { ...t, done: !t.done } : t) });
  const deleteTodo = (id) => setNodeData({ todos: (nodeData.todos||[]).filter(t => t.id !== id && !t.inherited) });

  const hasActiveTasks = (blocStartDay, checkNiveau) => {
    if (!activeSandboxId) return false;
    const checkNodeId = getComputedNodeId(activeSandboxId, checkNiveau, blocStartDay, 0);
    const data = parametres[checkNodeId];
    return data && (data.todos || []).some(t => !t.done);
  };

  const currentBgColorHex = (() => {
    if (niveau === 6) return '#000000'; 
    let past = 0; let future = 0;
    if (niveau >= 3) {
      [0, 1, 2, 3].forEach(i => {
        const blocEndDay = chunkStart + (i * (VUES[niveau].jours / 4)) + (VUES[niveau].jours / 4) - 1;
        blocEndDay < indexJourAujourdhui ? past++ : future++;
      });
    } else if (niveau === 2) {
      [0, 1, 2, 3, 4, 5].forEach(offset => { (chunkStart + offset) < indexJourAujourdhui ? past++ : future++; });
    } else if (niveau === 1) {
      [0, 1, 2, 3, 4, 5].forEach(b => { (activeDay < indexJourAujourdhui || (activeDay === indexJourAujourdhui && b < indexBlocAujourdhui)) ? past++ : future++; });
    } else if (niveau === 0) {
      (activeDay < indexJourAujourdhui || (activeDay === indexJourAujourdhui && activeBlock < indexBlocAujourdhui)) ? past++ : future++;
    }
    return past > future ? C_BLUE : C_ORANGE;
  })();

  const renderGrille = () => {
    if (niveau === 6) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 w-full max-w-[1200px] mx-auto px-4 md:px-8 h-full content-center overflow-y-auto">
          {sandboxes.map(sb => (
             <div key={sb.id} onClick={() => naviguer(5, null, null, sb.id)}
                  className="group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] hover:z-10 border border-white/10 shadow-2xl shrink-0 hover:border-transparent relative"
                  style={{ backgroundColor: '#000' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = sb.couleur}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#000'}>
                
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ backgroundColor: sb.couleur }}></div>
                <span className="text-xl md:text-3xl lg:text-4xl font-black text-white/60 tracking-[0.1em] uppercase text-center px-4 leading-tight group-hover:text-white transition-colors">{sb.nom}</span>
                <span className="text-[8px] md:text-[10px] font-mono text-white/40 tracking-[0.2em] uppercase mt-4 opacity-0 group-hover:opacity-100 transition-opacity">{formatDate(new Date(sb.startDate))}</span>
             </div>
          ))}
          {/* LE BOUTON D'AJOUT DE DIMENSION À LA RACINE */}
          <div onClick={() => startWizard('DIMENSION')} className="group w-[150px] md:w-[250px] aspect-square flex flex-col items-center justify-center cursor-pointer transition-all duration-500 hover:scale-[1.03] border border-white/5 hover:border-white/20 border-dashed shrink-0">
             <span className="text-4xl md:text-6xl font-light text-white/20 group-hover:text-white/60 transition-colors">+</span>
          </div>
        </div>
      );
    }

    if (niveau >= 3) {
      return (
        <div className="grid grid-cols-2 grid-rows-2 gap-4 md:gap-8 h-full aspect-square px-4 pb-8 pt-28 mx-auto w-full max-w-[85vh]">
          {[0, 1, 2, 3].map(i => {
            const blocStartDay = chunkStart + (i * (VUES[niveau].jours / 4));
            const blocEndDay = blocStartDay + (VUES[niveau].jours / 4) - 1;
            const isTodayInside = indexJourAujourdhui >= blocStartDay && indexJourAujourdhui <= blocEndDay;
            const isPast = blocEndDay < indexJourAujourdhui;
            const isBusy = hasActiveTasks(blocStartDay, niveau - 1);

            return (
              <div key={i} onClick={() => naviguer(niveau - 1, blocStartDay)} 
                   style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                   className={`group flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-out relative text-white 
                   hover:scale-[1.03] hover:z-20 hover:shadow-2xl rounded-sm
                   ${isTodayInside ? 'ring-1 ring-white/60 z-10' : 'border border-transparent hover:border-white/20'}`}>
                
                <span className="text-4xl md:text-7xl font-black tracking-tighter opacity-90 group-hover:opacity-100 transition-opacity">{VUES[niveau].jours / 4}</span>
                <span className="text-[10px] md:text-xs font-mono mt-3 text-white/60 tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity">{formatDate(getDateFromIndex(blocStartDay))} - {formatDate(getDateFromIndex(blocEndDay))}</span>
                
                <div className="absolute top-3 right-3 md:top-4 md:right-4 flex gap-2">
                  {isBusy && <span className="w-2 h-2 md:w-2.5 md:h-2.5 bg-white rounded-full shadow-md animate-pulse"></span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (niveau === 2) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 md:gap-6 h-full w-full px-4 md:px-8 pb-8 pt-24 md:pt-32 max-w-[1400px] mx-auto overflow-y-auto">
          {[0, 1, 2, 3, 4, 5].map(offset => {
            const jourIndex = chunkStart + offset;
            const isToday = jourIndex === indexJourAujourdhui;
            return (
              <div key={offset} className="flex flex-col gap-2 md:gap-3 h-full min-h-[120px] group">
                <div className={`text-center font-mono text-[9px] md:text-[10px] py-1 tracking-widest transition-colors ${isToday ? 'text-white font-bold' : 'text-white/50 group-hover:text-white'}`}>{formatDate(getDateFromIndex(jourIndex))}</div>
                <div onClick={() => naviguer(1, jourIndex)} className={`flex flex-col gap-1 md:gap-1.5 h-full cursor-pointer transition-all duration-300 hover:scale-[1.02] p-1 ${isToday ? 'ring-1 ring-white/50 bg-white/5' : ''}`}>
                  {[0, 1, 2, 3, 4, 5].map(b => (
                    <div key={b} style={{ backgroundColor: jourIndex < indexJourAujourdhui || (isToday && b < indexBlocAujourdhui) ? C_BLUE : C_ORANGE }}
                         className={`flex-1 w-full opacity-90 transition-opacity group-hover:opacity-100 min-h-[8px]`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (niveau === 1) {
      return (
        <div className="flex flex-col h-full w-full max-w-[700px] mx-auto px-4 md:px-8 pb-8 pt-24 md:pt-32 relative overflow-y-auto">
          <div className="absolute top-16 md:top-20 left-4 md:left-8 text-xs md:text-sm font-mono text-white/50 tracking-widest">{formatDate(getDateFromIndex(activeDay))}</div>
          <div className="flex flex-col gap-2 h-full mt-8">
            {[0, 1, 2, 3, 4, 5].map(b => {
              const isPast = activeDay < indexJourAujourdhui || (activeDay === indexJourAujourdhui && b < indexBlocAujourdhui);
              const isCurrent = activeDay === indexJourAujourdhui && b === indexBlocAujourdhui;
              return (
                <div key={b} onClick={() => naviguer(0, activeDay, b)} 
                     style={{ backgroundColor: isPast ? C_BLUE : C_ORANGE }}
                     className={`flex-1 w-full min-h-[40px] cursor-pointer flex items-center justify-center transition-all duration-300 hover:scale-[1.01] ${isCurrent ? 'ring-1 ring-white/60 z-10' : 'opacity-90'}`}>
                  <span className="text-white font-light text-xl md:text-2xl tracking-[0.3em]">{formatHeures(b)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full aspect-square px-4 pb-8 pt-20 md:pt-24 mx-auto w-full max-w-[80vh]">
        <div style={{ backgroundColor: activeDay < indexJourAujourdhui || (activeDay === indexJourAujourdhui && activeBlock < indexBlocAujourdhui) ? C_BLUE : C_ORANGE }}
             className={`w-full h-full flex flex-col items-center justify-center relative transition-all duration-500 ${activeDay === indexJourAujourdhui && activeBlock === indexBlocAujourdhui ? 'ring-1 ring-white/60' : ''}`}>
           <div className="absolute top-8 md:top-12 text-white/70 font-mono tracking-[0.3em] text-[10px] md:text-sm">{formatDate(getDateFromIndex(activeDay))}</div>
           <span className="text-white font-black text-5xl md:text-8xl tracking-tighter drop-shadow-md">{formatHeures(activeBlock)}</span>
        </div>
      </div>
    );
  };

  // ——————————————————————————————————————————————————————————————————————
  // WIZARD RENDERING
  // ——————————————————————————————————————————————————————————————————————
  const renderWizard = () => {
    const isDim = wizard.type === 'DIMENSION';
    const maxStep = isDim ? 2 : 3;

    const handleNext = () => { if (wizard.step < maxStep) setWizard({...wizard, step: wizard.step + 1}); else submitWizard(); };
    const handlePrev = () => { if (wizard.step > 0) setWizard({...wizard, step: wizard.step - 1}); else closeWizard(); };

    const wizBg = isDim ? '#000000' : (activeSandbox?.couleur || '#000000');

    return (
      <div className={`fixed inset-0 z-[100] flex flex-col transition-opacity duration-500 ${wizard.active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ backgroundColor: wizBg }}>
         <div className="flex-1 w-full flex flex-col items-center justify-center p-8 max-w-[800px] mx-auto">
            
            {/* WIZARD : DIMENSION */}
            {isDim && wizard.step === 0 && (
              <input autoFocus value={wizard.data.nom} onChange={e => setWizard({...wizard, data: {...wizard.data, nom: e.target.value}})} onKeyDown={e => e.key === 'Enter' && handleNext()} className="w-full bg-transparent text-5xl md:text-7xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/20" placeholder="NOM" />
            )}
            {isDim && wizard.step === 1 && (
              <div className="flex flex-col items-center gap-8">
                <span className="text-white/50 font-mono tracking-widest uppercase">Signature Visuelle</span>
                <input type="color" value={wizard.data.couleur} onChange={e => setWizard({...wizard, data: {...wizard.data, couleur: e.target.value}})} className="w-32 h-32 cursor-pointer border-0 bg-transparent p-0 rounded-full shadow-2xl" />
              </div>
            )}
            {isDim && wizard.step === 2 && (
              <div className="flex flex-col items-center gap-8">
                <span className="text-white/50 font-mono tracking-widest uppercase">Origine (Jour 1)</span>
                <input type="date" value={wizard.data.date} onChange={e => setWizard({...wizard, data: {...wizard.data, date: e.target.value}})} className="text-3xl md:text-5xl font-mono text-white bg-transparent outline-none text-center cursor-pointer" />
              </div>
            )}

            {/* WIZARD : RITUEL */}
            {!isDim && wizard.step === 0 && (
              <input autoFocus value={wizard.data.nom} onChange={e => setWizard({...wizard, data: {...wizard.data, nom: e.target.value}})} onKeyDown={e => e.key === 'Enter' && handleNext()} className="w-full bg-transparent text-4xl md:text-7xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/20" placeholder="NOM DU MODÈLE" />
            )}
            {!isDim && wizard.step === 1 && (
              <div className="flex flex-col items-center gap-8 w-full">
                <span className="text-white/50 font-mono tracking-widest uppercase">Projection Cible</span>
                <div className="grid grid-cols-1 gap-4 w-full max-w-[400px]">
                  {Object.values(VUES).filter(v => v.niveau < niveau).reverse().map(v => (
                    <button key={v.niveau} onClick={() => { setWizard({...wizard, data: {...wizard.data, targetNiveau: v.niveau}}); handleNext(); }} className={`p-4 border text-center font-bold tracking-widest transition-colors ${wizard.data.targetNiveau === v.niveau ? 'bg-white text-black border-white' : 'bg-transparent text-white/50 border-white/20 hover:border-white hover:text-white'}`}>
                      {v.nom}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isDim && wizard.step === 2 && (
              <div className="flex flex-col gap-8 w-full max-w-[600px]">
                <span className="text-white/50 font-mono tracking-widest uppercase text-center">CRON Fractal</span>
                <div className="flex flex-col gap-6">
                  {Object.values(VUES).filter(v => v.niveau < niveau && v.niveau >= wizard.data.targetNiveau).reverse().map(couche => {
                    const numBoutons = VUES[couche.niveau + 1].divisions;
                    return (
                      <div key={couche.niveau} className="flex flex-col gap-3 border-l-2 border-white/20 pl-6">
                        <span className="text-xs font-mono text-white/70">{couche.nom}</span>
                        <div className="flex gap-2 flex-wrap">
                          {[...Array(numBoutons)].map((_, i) => {
                            const isSelected = (wizard.data.pattern[couche.niveau] || []).includes(i);
                            return <button key={i} onClick={() => {
                              const current = wizard.data.pattern[couche.niveau] || [];
                              const updated = current.includes(i) ? current.filter(x => x !== i) : [...current, i].sort();
                              setWizard(prev => ({...prev, data: {...prev.data, pattern: {...prev.data.pattern, [couche.niveau]: updated}}}));
                            }} className={`text-sm font-mono px-4 py-2 transition-colors ${isSelected ? 'bg-white text-black' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>{i + 1}</button>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!isDim && wizard.step === 3 && (
              <div className="flex flex-col gap-8 w-full max-w-[600px]">
                <span className="text-white/50 font-mono tracking-widest uppercase text-center">Action à hériter</span>
                <input autoFocus type="text" value={wizTaskInput} onChange={e => setWizTaskInput(e.target.value)} onKeyDown={(e) => { if(e.key==='Enter' && wizTaskInput.trim() !== '') { setWizard(prev => ({...prev, data: {...prev.data, elements: [...prev.data.elements, { itemType: 'task', text: wizTaskInput.trim() }]}})); setWizTaskInput(""); } }} placeholder="Écrire et appuyer sur Entrée..." className="text-2xl font-light border-b-2 border-white/20 focus:border-white py-4 outline-none bg-transparent text-white placeholder:text-white/20 text-center"/>
                <div className="flex flex-col gap-2">
                  {wizard.data.elements.map((el, i) => <div key={i} className="text-lg font-mono text-white/70 text-center">- {el.text}</div>)}
                </div>
              </div>
            )}
         </div>

         {/* WIZARD CONTROLS */}
         <div className="w-full flex justify-between p-8 md:p-12 text-xs md:text-sm font-mono uppercase tracking-[0.3em] font-bold text-white/50">
            <button onClick={handlePrev} className="hover:text-white transition-colors py-4 px-8 border border-transparent hover:border-white/20">{wizard.step === 0 ? 'Annuler' : 'Précédent'}</button>
            <button onClick={handleNext} className="hover:text-white transition-colors py-4 px-8 border border-white/20 hover:bg-white hover:text-black">{wizard.step === maxStep ? 'Valider' : 'Suivant'}</button>
         </div>
      </div>
    );
  };

  if (!isReady) return <div className="h-screen w-screen bg-black" />;

  return (
    <main className="flex flex-col lg:flex-row h-[100dvh] w-screen bg-black font-sans overflow-hidden relative">
      
      {/* WIZARD OVERLAY */}
      {renderWizard()}

      {/* OVERLAY FERMETURE SIDEBAR */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* NAVBAR (THEME ACTUEL) */}
      <div className="absolute top-6 md:top-8 left-6 md:left-8 z-40 flex items-center gap-2 md:gap-3">
        <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] drop-shadow-md flex items-center gap-2 transition-colors ${niveau === 6 ? 'text-white/60' : 'text-white'}`}>
          {niveau < 6 ? activeSandbox?.nom : 'BLOCK'}
          {niveau < 6 && <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ backgroundColor: activeSandbox?.couleur }}></div>}
          {niveau === 6 && <div className="w-1.5 h-1.5 rounded-full ml-1 bg-white opacity-40"></div>}
        </span>
        {niveau < 6 && <span className="text-white/20 text-xs">/</span>}
        {niveau < 6 && (
          <button onClick={() => naviguer(6)} className="text-[9px] md:text-[10px] font-mono text-white/50 hover:text-white uppercase tracking-widest transition-colors flex items-center">
            RACINE
          </button>
        )}
      </div>

      <button onClick={() => setIsSidebarOpen(true)} className={`fixed top-6 md:top-8 right-6 md:right-8 z-40 text-white/50 text-[9px] md:text-[10px] font-mono tracking-widest uppercase hover:text-white transition-colors drop-shadow-md ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>[ DATA ]</button>

      {/* FOND DYNAMIQUE */}
      <section 
        style={{ backgroundColor: currentBgColorHex }}
        className={`flex-1 flex flex-col relative w-full overflow-hidden transition-colors duration-1000 ease-in-out`}>
        
        {niveau < 6 && (
          <nav className="absolute top-14 md:top-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 md:gap-4 flex-wrap justify-center w-full px-4">
            {[5, 4, 3, 2, 1, 0].map(niv => {
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

      {/* SIDEBAR ULTRA MINIMALISTE */}
      <aside className={`fixed top-0 right-0 h-full w-[85%] max-w-[400px] bg-white text-black flex flex-col z-50 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSidebarOpen ? 'translate-x-0 shadow-[-20px_0_40px_rgba(0,0,0,0.1)]' : 'translate-x-full'}`}>
        
        <header className="p-6 md:p-8 flex justify-between items-start shrink-0">
          <div className="flex flex-col gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              {session?.user?.image ? <img src={session.user.image} alt="Profil" className="w-6 h-6 md:w-8 md:h-8 rounded-full object-cover grayscale" /> : <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold">{session?.user?.name ? session.user.name.charAt(0).toUpperCase() : "U"}</div>}
              <div className="flex flex-col">
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em]">{session?.user?.name || "Architecte"}</span>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`w-1 h-1 rounded-full ${status === "authenticated" ? 'bg-black' : 'bg-red-500'}`}></span>
                  <button onClick={() => signOut({ callbackUrl: '/login' })} className="text-[7px] md:text-[8px] font-mono uppercase tracking-widest text-gray-400 hover:text-black transition-colors">{status === "authenticated" ? 'LOGOUT' : 'OFFLINE'}</button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] md:text-[9px] font-mono tracking-[0.2em] text-gray-400 uppercase">{niveau < 6 ? formatDate(getDateFromIndex(activeDay)) : 'ADMINISTRATION'}</span>
              <h2 className="text-[10px] md:text-xs font-black uppercase tracking-widest">{VUES[niveau].nom}</h2>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-gray-300 hover:text-black transition-colors p-2 -m-2">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 md:px-8 pb-8 flex flex-col gap-8 md:gap-10">

          {/* VUE DIMENSION : MATRICE & TACHES */}
          {niveau < 6 && (
            <>
              <div className="flex flex-col gap-3 md:gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Matrice</span>
                  {niveau > 0 && <button onClick={() => startWizard('RITUEL')} className="text-[8px] md:text-[9px] font-bold text-gray-300 hover:text-black tracking-widest uppercase p-1 -m-1">[+ NEW MODEL]</button>}
                </div>

                <div className="flex flex-col gap-2 md:gap-3">
                  {filteredRituels.map(r => {
                    const isActive = (nodeData.activeRituals || []).includes(r._id || r.id);
                    return (
                      <div key={r._id || r.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => toggleRitualActivation(r)}>
                          <div className={`w-1 h-1 rounded-full transition-colors ${isActive ? 'bg-black' : 'bg-gray-200'}`}></div>
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-black' : 'text-gray-400'}`}>{r.nom}</span>
                        </div>
                        <button onClick={(e) => supprimerRituelBase(r, e)} className="text-[7px] md:text-[8px] font-mono text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 uppercase tracking-widest px-2 py-1">Del</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* TÂCHES DU NŒUD */}
              <div className="flex flex-col gap-3 md:gap-4 mt-2 md:mt-4">
                <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Action</span>
                
                <input type="text" value={localInputValue} onChange={e => setLocalInputValue(e.target.value)} onKeyDown={handleAddLocalTodo} placeholder="..." className="w-full text-[9px] md:text-[10px] font-mono border-b border-transparent hover:border-gray-200 focus:border-black py-1 outline-none bg-transparent transition-colors placeholder:text-gray-300" />

                <div className="flex flex-col gap-2">
                  {filteredTodos.map(item => (
                    <div key={item.id} className="flex items-start justify-between group">
                      <div className="flex items-start gap-2 md:gap-3 cursor-pointer" onClick={() => toggleTodo(item.id)}>
                        <div className={`mt-0.5 w-1.5 h-1.5 md:w-2 md:h-2 border border-black flex items-center justify-center shrink-0 transition-colors ${item.done ? 'bg-black' : 'bg-transparent'}`}></div>
                        <div className="flex flex-col">
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest leading-snug ${item.done ? 'line-through text-gray-300' : 'text-black'}`}>{item.text}</span>
                          {item.inherited && <span className="text-[7px] md:text-[8px] font-mono text-gray-400 mt-0.5">↳ {item.sourceRitualName}</span>}
                        </div>
                      </div>
                      {!item.inherited && <button onClick={() => deleteTodo(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-[7px] md:text-[8px] font-mono transition-opacity ml-2 p-1">X</button>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 md:gap-2 h-full min-h-[150px] mt-2 md:mt-4">
                <span className="text-[7px] md:text-[8px] font-bold uppercase tracking-[0.2em] text-gray-400">Log</span>
                <textarea value={nodeData.notes} onChange={handleNotesChange} placeholder="..." className="flex-1 w-full text-[9px] md:text-[10px] font-mono leading-relaxed text-gray-500 outline-none resize-none bg-transparent placeholder:text-gray-200" />
              </div>
            </>
          )}

          {/* VUE RACINE : LECTURE SEULE */}
          {niveau === 6 && (
            <div className="text-[8px] font-mono text-gray-400 uppercase tracking-widest border border-dashed border-gray-200 p-4 text-center mt-4">
              [ PLONGEZ DANS UNE DIMENSION POUR ACCÉDER AUX DONNÉES ]
            </div>
          )}

        </div>
      </aside>
    </main>
  );
}