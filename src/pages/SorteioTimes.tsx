import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { Player, Location, Position, AdminData, Card } from '../types';
import { getPositionAbbr, getPositionColor } from '../utils/playerUtils';
import { 
  Dices, 
  Users, 
  User,
  MapPin, 
  ArrowLeft, 
  FileText,
  Printer,
  Eye,
  RefreshCw,
  Flame,
  Shirt,
  RotateCcw, 
  Trophy, 
  Sparkles, 
  Search, 
  Sliders, 
  Trash2,
  Save,
  Check,
  FolderOpen,
  Loader2,
  X,
  Play,
  Pause,
  SkipForward,
  FastForward,
  Zap,
  Copy,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../App';

interface Props {
  adminData?: AdminData | null;
  sharedLocations?: Location[];
}

interface DraftTeam {
  id: number;
  name: string;
  players: Player[];
  totalOverall: number;
  avgOverall: number;
}

interface DefinedPot {
  id: string;
  name: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  defaultPos?: Position;
}

interface DrawStepItem {
  stepIndex: number;
  player: Player;
  teamId: number;
  teamName: string;
  potId: string;
  potName: string;
  potShort: string;
  potBadgeBg: string;
  potBadgeText: string;
}

const CUSTOM_POTS: DefinedPot[] = [
  { id: 'goleiro', name: 'Goleiros', shortLabel: 'GOL', badgeBg: 'bg-amber-100', badgeText: 'text-amber-800', defaultPos: 'goleiro' },
  { id: 'lateral_1', name: 'Lateral 1', shortLabel: 'LAT 1', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800', defaultPos: 'lateral' },
  { id: 'lateral_2', name: 'Lateral 2', shortLabel: 'LAT 2', badgeBg: 'bg-cyan-100', badgeText: 'text-cyan-800', defaultPos: 'lateral' },
  { id: 'zagueiro', name: 'Zagueiros / Defensores', shortLabel: 'ZAG', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800', defaultPos: 'zagueiro' },
  { id: 'meio_1', name: 'Meio-Campistas 1', shortLabel: 'MEI 1', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800', defaultPos: 'meio-campo' },
  { id: 'meio_2', name: 'Meio-Campistas 2', shortLabel: 'MEI 2', badgeBg: 'bg-teal-100', badgeText: 'text-teal-800', defaultPos: 'meio-campo' },
  { id: 'atacante', name: 'Atacantes', shortLabel: 'ATA', badgeBg: 'bg-red-100', badgeText: 'text-red-800', defaultPos: 'centroavante' },
  { id: 'reserva', name: 'Reservas', shortLabel: 'RES', badgeBg: 'bg-gray-200', badgeText: 'text-gray-800' },
];

const LOCAL_STORAGE_KEY = 'arena_sorteio_pots_ids';

const EMPTY_POTS_STRUCTURE: Record<string, Player[]> = {
  goleiro: [],
  lateral_1: [],
  lateral_2: [],
  zagueiro: [],
  meio_1: [],
  meio_2: [],
  atacante: [],
  reserva: []
};

export default function SorteioTimes({ adminData, sharedLocations = [] }: Props) {
  const [locations, setLocations] = useState<Location[]>(sharedLocations);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    adminData?.role !== 'master' && adminData?.locationId ? adminData.locationId : 'all'
  );
  
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  // Configuration State
  const [numTeams, setNumTeams] = useState<number>(4);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [positionTabFilter, setPositionTabFilter] = useState<string>('all');

  // Pots State: Map of Pot ID -> Array of Players
  const [potsData, setPotsData] = useState<Record<string, Player[]>>(EMPTY_POTS_STRUCTURE);
  const [hydratedLocalStorage, setHydratedLocalStorage] = useState(false);

  // Animated Stage States
  const [isAnimatedDrawActive, setIsAnimatedDrawActive] = useState(false);
  const [isFinalViewActive, setIsFinalViewActive] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [drawSequence, setDrawSequence] = useState<DrawStepItem[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);
  const [shuffleName, setShuffleName] = useState('');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  // Cards state for player card visual calculation
  const [cards, setCards] = useState<Card[]>([]);

  // Modal / Selector state for quick assigning
  const [assigningPlayer, setAssigningPlayer] = useState<Player | null>(null);
  const [savedPotsSuccess, setSavedPotsSuccess] = useState(false);
  const [loadedPotsSuccess, setLoadedPotsSuccess] = useState(false);
  const [isSavingPots, setIsSavingPots] = useState(false);
  const [isLoadingPots, setIsLoadingPots] = useState(false);
  const [lastSavedInfo, setLastSavedInfo] = useState<string | null>(null);

  // Draft Results State
  const [draftedTeams, setDraftedTeams] = useState<DraftTeam[]>([]);
  const [isDrawDone, setIsDrawDone] = useState(false);

  // Manual Swap state in results
  const [selectedForSwap, setSelectedForSwap] = useState<{ teamIdx: number; player: Player } | null>(null);

  // Auto-hydrate pots from Firestore once allPlayers are loaded
  const [hasAutoLoadedPots, setHasAutoLoadedPots] = useState(false);

  useEffect(() => {
    if (allPlayers.length > 0 && !hasAutoLoadedPots) {
      setHasAutoLoadedPots(true);
      handleLoadPots(false);
    }
  }, [allPlayers, hasAutoLoadedPots]);

  // Fetch locations if not provided
  useEffect(() => {
    if (sharedLocations.length === 0) {
      const unsub = onSnapshot(collection(db, 'locations'), (snap) => {
        setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Location)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'locations'));
      return () => unsub();
    }
  }, [sharedLocations]);

  // Fetch players from Firestore
  useEffect(() => {
    setLoadingPlayers(true);
    const q = collection(db, 'players');
    const unsub = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setAllPlayers(fetched);
      setLoadingPlayers(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'players');
      setLoadingPlayers(false);
    });
    return () => unsub();
  }, []);

  // Fetch cards from Firestore for card display
  useEffect(() => {
    const q = collection(db, 'cards');
    const unsub = onSnapshot(q, (snap) => {
      setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    }, (err) => console.error("Error loading cards:", err));
    return () => unsub();
  }, []);

  // Helper to compute card display attributes
  const getPlayerCardDisplay = (player: Player) => {
    let overall = player.overallValue || 75;
    let fontColor = '#a52a2a';
    let bgImage: string | undefined = undefined;

    if (cards && cards.length > 0) {
      let assignedCard = cards.find(c => c.imageUrl === player.cardBgUrl) || cards.find(c => c.isDefault);
      if (assignedCard && assignedCard.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (assignedCard.expirationDate < todayStr) {
          assignedCard = cards.find(c => c.name.toUpperCase() === 'GERAL') || cards.find(c => c.isDefault);
        }
      }
      const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);
      const rawOverallWithBonus = overall + cardBonusValue;

      const silverCard = cards.find(c => {
        const n = c.name?.toUpperCase() || '';
        return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
      });
      const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

      const resolvedCard = forceSilver ? silverCard! : assignedCard;
      if (resolvedCard) {
        fontColor = resolvedCard.fontColor || '#a52a2a';
        const resolvedIsArtilheiro = resolvedCard.name?.toUpperCase()?.includes('ARTILHEIRO');
        const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard.increaseOverall || 0);
        overall = Math.min(105, overall + resolvedBonus);
        bgImage = resolvedCard.imageUrl;
      }
    } else {
      bgImage = player.cardBgUrl;
      if (player.fontColor) fontColor = player.fontColor;
    }

    return { overall, fontColor, bgImage };
  };

  // Filter players by selected location
  const locationPlayers = useMemo(() => {
    if (selectedLocationId === 'all') return allPlayers;
    return allPlayers.filter(p => p.locationId === selectedLocationId);
  }, [allPlayers, selectedLocationId]);

  // Save pots manually to Firestore database
  const handleSavePots = async () => {
    try {
      setIsSavingPots(true);
      const idsMap: Record<string, string[]> = {};
      for (const [potId, players] of Object.entries(potsData)) {
        idsMap[potId] = players.map(p => p.id);
      }
      const updatedAt = new Date().toISOString();
      const docData = {
        pots: idsMap,
        updatedAt,
        numTeams,
        locationId: selectedLocationId || 'all'
      };

      await setDoc(doc(db, 'saved_pots', 'latest'), docData);

      // Also update localStorage as local fallback
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(idsMap));
      } catch (e) {
        console.error(e);
      }

      const dateStr = new Date(updatedAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      setLastSavedInfo(`Salvo em ${dateStr}`);

      setSavedPotsSuccess(true);
      setTimeout(() => setSavedPotsSuccess(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar potes no Firestore', e);
      handleFirestoreError(e, OperationType.WRITE, 'saved_pots');
    } finally {
      setIsSavingPots(false);
    }
  };

  // Load pots from Firestore database
  const handleLoadPots = async (showFeedback = true) => {
    try {
      setIsLoadingPots(true);
      const docSnap = await getDoc(doc(db, 'saved_pots', 'latest'));
      let loadedIdsMap: Record<string, string[]> | null = null;
      let savedNumTeams: number | null = null;
      let updatedAtStr: string | null = null;

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.pots) loadedIdsMap = data.pots;
        if (data.numTeams) savedNumTeams = data.numTeams;
        if (data.updatedAt) updatedAtStr = data.updatedAt;
      } else {
        // Fallback to localStorage
        try {
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) loadedIdsMap = JSON.parse(local);
        } catch (e) {
          console.error(e);
        }
      }

      if (loadedIdsMap && allPlayers.length > 0) {
        const playerMap = new Map(allPlayers.map(p => [p.id, p]));
        const nextPots: Record<string, Player[]> = {
          goleiro: [],
          lateral_1: [],
          lateral_2: [],
          zagueiro: [],
          meio_1: [],
          meio_2: [],
          atacante: [],
          reserva: []
        };

        for (const [potId, ids] of Object.entries(loadedIdsMap)) {
          if (nextPots[potId] && Array.isArray(ids)) {
            nextPots[potId] = ids.map(id => playerMap.get(id)).filter((p): p is Player => p !== undefined);
          }
        }

        setPotsData(nextPots);
        if (savedNumTeams) setNumTeams(savedNumTeams);

        if (updatedAtStr) {
          const dateStr = new Date(updatedAtStr).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
          setLastSavedInfo(`Salvo em ${dateStr}`);
        }

        if (showFeedback) {
          setLoadedPotsSuccess(true);
          setTimeout(() => setLoadedPotsSuccess(false), 3000);
        }
      } else if (showFeedback) {
        alert('Nenhum pote salvo foi encontrado no banco de dados.');
      }
    } catch (e) {
      console.error('Erro ao carregar potes do Firestore', e);
      handleFirestoreError(e, OperationType.GET, 'saved_pots');
    } finally {
      setIsLoadingPots(false);
    }
  };

  // Clear all pots manually
  const clearAllPots = () => {
    const emptyPots = {
      goleiro: [],
      lateral_1: [],
      lateral_2: [],
      zagueiro: [],
      meio_1: [],
      meio_2: [],
      atacante: [],
      reserva: []
    };
    setPotsData(emptyPots);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
    setIsDrawDone(false);
    setDraftedTeams([]);
  };

  // Helper to find which pot a player is currently in (if any)
  const getPlayerPotId = (playerId: string): string | null => {
    for (const [potId, players] of Object.entries(potsData)) {
      if (players.some(p => p.id === playerId)) {
        return potId;
      }
    }
    return null;
  };

  // Assign or move player to a specific pot
  const assignPlayerToPot = (player: Player, targetPotId: string | null) => {
    setPotsData(prev => {
      const next: Record<string, Player[]> = {};
      
      // First, remove player from all current pots
      for (const [potId, players] of Object.entries(prev)) {
        next[potId] = players.filter(p => p.id !== player.id);
      }

      // If targetPotId is provided, add player to that pot
      if (targetPotId && next[targetPotId]) {
        next[targetPotId] = [...next[targetPotId], player];
      }

      return next;
    });
    setAssigningPlayer(null);
  };

  // Auto-distribute location players into pots logically
  const handleAutoFillPots = () => {
    const nextPots: Record<string, Player[]> = {
      goleiro: [],
      lateral_1: [],
      lateral_2: [],
      zagueiro: [],
      meio_1: [],
      meio_2: [],
      atacante: [],
      reserva: []
    };

    locationPlayers.forEach(p => {
      if (p.position === 'goleiro') {
        nextPots.goleiro.push(p);
      } else if (p.position === 'zagueiro') {
        nextPots.zagueiro.push(p);
      } else if (p.position === 'centroavante') {
        nextPots.atacante.push(p);
      } else if (p.position === 'lateral') {
        // Distribute evenly between Lateral 1 and Lateral 2
        if (nextPots.lateral_1.length <= nextPots.lateral_2.length) {
          nextPots.lateral_1.push(p);
        } else {
          nextPots.lateral_2.push(p);
        }
      } else if (p.position === 'meio-campo') {
        // Distribute evenly between Meio 1 and Meio 2
        if (nextPots.meio_1.length <= nextPots.meio_2.length) {
          nextPots.meio_1.push(p);
        } else {
          nextPots.meio_2.push(p);
        }
      } else {
        nextPots.reserva.push(p);
      }
    });

    setPotsData(nextPots);
  };

  // Helper to get effective overall
  const getPlayerOverall = (p: Player): number => {
    if (p.overallValue && p.overallValue > 0) return p.overallValue;
    return 75; // fallback
  };

  // Total allocated players across all pots
  const totalAllocatedPlayers = useMemo(() => {
    return Object.values(potsData).reduce((acc, list) => acc + list.length, 0);
  }, [potsData]);

  // Filtered and sorted players list for selection view (ordered by position)
  const visibleSelectionPlayers = useMemo(() => {
    const positionRank: Record<string, number> = {
      goleiro: 1,
      zagueiro: 2,
      lateral: 3,
      'meio-campo': 4,
      centroavante: 5,
    };

    return locationPlayers
      .filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (p.nickname && p.nickname.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchPos = positionTabFilter === 'all' || p.position === positionTabFilter;
        return matchSearch && matchPos;
      })
      .sort((a, b) => {
        const rankA = positionRank[a.position] || 99;
        const rankB = positionRank[b.position] || 99;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        const ovrA = a.overallValue || 75;
        const ovrB = b.overallValue || 75;
        if (ovrB !== ovrA) {
          return ovrB - ovrA;
        }
        return a.name.localeCompare(b.name);
      });
  }, [locationPlayers, searchQuery, positionTabFilter]);

  // Build complete random draw sequence across pots (completely ignoring overall)
  const buildRandomDrawSequence = (): { sequence: DrawStepItem[]; finalTeams: DraftTeam[] } => {
    const sequence: DrawStepItem[] = [];
    const finalTeams: DraftTeam[] = Array.from({ length: numTeams }, (_, i) => ({
      id: i + 1,
      name: `Time ${i + 1}`,
      players: [],
      totalOverall: 0,
      avgOverall: 0
    }));

    let globalStep = 0;

    CUSTOM_POTS.forEach(pot => {
      const rawPlayers = [...(potsData[pot.id] || [])];
      if (rawPlayers.length === 0) return;

      // Pure random shuffle (disregarding overall)
      for (let i = rawPlayers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawPlayers[i], rawPlayers[j]] = [rawPlayers[j], rawPlayers[i]];
      }

      // Distribute to teams sequentially
      rawPlayers.forEach((player, idx) => {
        const targetTeamIdx = idx % numTeams;
        const targetTeam = finalTeams[targetTeamIdx];
        targetTeam.players.push(player);
        targetTeam.totalOverall += getPlayerOverall(player);

        sequence.push({
          stepIndex: globalStep++,
          player,
          teamId: targetTeam.id,
          teamName: targetTeam.name,
          potId: pot.id,
          potName: pot.name,
          potShort: pot.shortLabel,
          potBadgeBg: pot.badgeBg,
          potBadgeText: pot.badgeText
        });
      });
    });

    finalTeams.forEach(t => {
      t.avgOverall = t.players.length > 0 ? Math.round(t.totalOverall / t.players.length) : 0;
    });

    return { sequence, finalTeams };
  };

  // Start Animated Draft
  const handleStartAnimatedDraft = () => {
    if (totalAllocatedPlayers === 0) {
      alert('Adicione pelo menos alguns jogadores aos potes antes de realizar o sorteio.');
      return;
    }

    if (numTeams < 2) {
      alert('A quantidade de times deve ser no mínimo 2.');
      return;
    }

    const { sequence, finalTeams } = buildRandomDrawSequence();
    setDrawSequence(sequence);
    setDraftedTeams(finalTeams);
    setIsDrawDone(true);
    setSelectedForSwap(null);

    // Open animated draw stage in waiting mode
    setCurrentStepIndex(-1);
    setIsAnimatedDrawActive(true);
    setIsFinalViewActive(false);
    setIsAutoPlaying(false);
    setIsShuffling(false);
    setShuffleName('');
  };

  const handleCopyTeamsToClipboard = () => {
    if (draftedTeams.length === 0) return;

    let text = `🏆 *SORTEIO DE EQUIPES CONCLUÍDO*\n\n`;
    draftedTeams.forEach((t) => {
      text += `⚽ *${t.name.toUpperCase()}* (${t.players.length} Atletas - Média: ${t.avgOverall})\n`;
      t.players.forEach((p, idx) => {
        text += `   ${idx + 1}. ${p.nickname || p.name} (${getPositionAbbr(p.position)})\n`;
      });
      text += `\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    }).catch((err) => {
      console.error("Erro ao copiar times:", err);
    });
  };

  // Trigger shuffle animation for current step
  const triggerShuffleEffect = (targetStep: DrawStepItem | undefined) => {
    if (!targetStep) return;
    setIsShuffling(true);

    const candidates = potsData[targetStep.potId]?.length > 0 
      ? potsData[targetStep.potId] 
      : locationPlayers;

    let iterations = 0;
    const interval = setInterval(() => {
      if (candidates.length > 0) {
        const randomP = candidates[Math.floor(Math.random() * candidates.length)];
        setShuffleName(randomP.name);
      }
      iterations++;
      if (iterations >= 10) {
        clearInterval(interval);
        setShuffleName(targetStep.player.name);
        setIsShuffling(false);
      }
    }, 80);
  };

  // Step Controls
  const handleNextStep = () => {
    if (currentStepIndex < 0) {
      setCurrentStepIndex(0);
      triggerShuffleEffect(drawSequence[0]);
    } else if (currentStepIndex < drawSequence.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      triggerShuffleEffect(drawSequence[nextIdx]);
    } else {
      setIsAutoPlaying(false);
      setIsFinalViewActive(true);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      setIsShuffling(false);
      setShuffleName(drawSequence[prevIdx].player.name);
    } else if (currentStepIndex === 0) {
      setCurrentStepIndex(-1);
      setIsShuffling(false);
      setShuffleName('');
    }
  };

  const handleSkipToFinish = () => {
    setCurrentStepIndex(drawSequence.length - 1);
    setIsShuffling(false);
    setIsAutoPlaying(false);
    setIsFinalViewActive(true);
  };

  // Auto-play timer with increased pause between draws
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAutoPlaying && isAnimatedDrawActive && !isShuffling && !isFinalViewActive) {
      if (currentStepIndex < 0) {
        // Start first step immediately when autoplay toggled on
        handleNextStep();
      } else if (currentStepIndex < drawSequence.length - 1) {
        timer = setTimeout(() => {
          handleNextStep();
        }, 4800); // 4.8s pause between draws so users can analyze the updated team
      } else {
        // Last step: wait 4.8s then open Final View automatically
        timer = setTimeout(() => {
          setIsAutoPlaying(false);
          setIsFinalViewActive(true);
        }, 4800);
      }
    }
    return () => clearTimeout(timer);
  }, [isAutoPlaying, isAnimatedDrawActive, isShuffling, isFinalViewActive, currentStepIndex, drawSequence.length]);

  // Compute partially revealed teams for step-by-step display
  const currentStepTeams = useMemo(() => {
    if (currentStepIndex < 0 || drawSequence.length === 0) return [];
    
    // Create empty teams structure
    const teams: { id: number; name: string; players: { player: Player; potShort: string; potBadgeBg: string; potBadgeText: string }[] }[] = Array.from({ length: numTeams }, (_, i) => ({
      id: i + 1,
      name: `Time ${i + 1}`,
      players: []
    }));

    // Fill up to currentStepIndex
    const activeSteps = drawSequence.slice(0, currentStepIndex + 1);
    activeSteps.forEach((step, idx) => {
      // If currently shuffling on the last active step, don't show it in team yet until revealed!
      if (idx === currentStepIndex && isShuffling) return;

      const t = teams.find(team => team.id === step.teamId);
      if (t) {
        t.players.push({
          player: step.player,
          potShort: step.potShort,
          potBadgeBg: step.potBadgeBg,
          potBadgeText: step.potBadgeText
        });
      }
    });

    return teams;
  }, [currentStepIndex, drawSequence, numTeams, isShuffling]);

  // Swap player logic
  const handlePlayerClickInTeam = (teamIdx: number, player: Player) => {
    if (!selectedForSwap) {
      setSelectedForSwap({ teamIdx, player });
    } else {
      if (selectedForSwap.player.id === player.id) {
        setSelectedForSwap(null);
        return;
      }

      const nextTeams = [...draftedTeams];
      const teamA = nextTeams[selectedForSwap.teamIdx];
      const teamB = nextTeams[teamIdx];

      teamA.players = teamA.players.filter(p => p.id !== selectedForSwap.player.id);
      teamB.players = teamB.players.filter(p => p.id !== player.id);

      teamA.players.push(player);
      teamB.players.push(selectedForSwap.player);

      [teamA, teamB].forEach(t => {
        t.totalOverall = t.players.reduce((acc, p) => acc + getPlayerOverall(p), 0);
        t.avgOverall = t.players.length > 0 ? Math.round(t.totalOverall / t.players.length) : 0;
      });

      setDraftedTeams(nextTeams);
      setSelectedForSwap(null);
    }
  };

  // Handle PDF Generation
  const handleGeneratePDF = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-3.5 rounded-2xl text-white shadow-md">
            <Dices className="w-7 h-7 text-primary-yellow animate-bounce" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-primary-blue">
              Sorteio de Times por Potes
            </h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
              Preenchimento manual de potes (Lateral 2, Meio 2, Reserva) e sorteio de 1 por pote
            </p>
          </div>
        </div>

        {/* Location Selector */}
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-2xl border border-gray-100">
          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={adminData?.role !== 'master' && !!adminData?.locationId}
            className="bg-transparent font-bold text-xs uppercase text-gray-700 outline-none pr-3 py-1 cursor-pointer"
          >
            {adminData?.role === 'master' && <option value="all">Todas as Sedes</option>}
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Config & Player Selection */}
        <div className="lg:col-span-5 space-y-6">
          {/* Step 1: Config Parameters */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="font-black text-sm uppercase tracking-wider text-primary-blue flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" /> 1. Configurar Quantidade de Times
              </h2>
              <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                {numTeams} Equipes
              </span>
            </div>

            {/* Quantity of Teams buttons */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-500 tracking-wider">
                Número de Equipes no Sorteio
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumTeams(n)}
                    className={`py-2.5 rounded-2xl font-black text-xs uppercase transition-all ${
                      numTeams === n
                        ? 'bg-primary-blue text-white shadow-md scale-105 ring-2 ring-primary-blue/30'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {n} Times
                  </button>
                ))}
              </div>
            </div>

            {/* Pot Management Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <button
                type="button"
                onClick={handleAutoFillPots}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 py-2.5 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Auto-Preencher
              </button>
              <button
                type="button"
                onClick={handleSavePots}
                disabled={isSavingPots}
                className={`py-2.5 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 border shadow-2xs ${
                  savedPotsSuccess
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-primary-blue hover:bg-blue-900 text-white border-primary-blue'
                } ${isSavingPots ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isSavingPots ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : savedPotsSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {savedPotsSuccess ? 'Potes Salvos!' : 'Salvar Potes'}
              </button>
              <button
                type="button"
                onClick={() => handleLoadPots(true)}
                disabled={isLoadingPots}
                className={`py-2.5 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5 border shadow-2xs ${
                  loadedPotsSuccess
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
                } ${isLoadingPots ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoadingPots ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : loadedPotsSuccess ? <Check className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                {loadedPotsSuccess ? 'Potes Carregados!' : 'Carregar Potes'}
              </button>
              <button
                type="button"
                onClick={clearAllPots}
                className="bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 py-2.5 px-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar Potes
              </button>
            </div>
            {lastSavedInfo && (
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right pr-1 pt-1">
                Último Pote: {lastSavedInfo}
              </p>
            )}
          </div>

          {/* Step 2: Atletas Pool (Allocation) */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-black text-sm uppercase tracking-wider text-primary-blue flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" /> 2. Lista de Atletas Disponíveis
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                  {totalAllocatedPlayers} de {locationPlayers.length} alocados nos potes
                </p>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Buscar atleta por nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-700 focus:outline-none focus:border-primary-blue"
                />
              </div>

              {/* Position Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setPositionTabFilter('all')}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase shrink-0 ${
                    positionTabFilter === 'all'
                      ? 'bg-primary-blue text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  Todos ({locationPlayers.length})
                </button>
                {['goleiro', 'zagueiro', 'lateral', 'meio-campo', 'centroavante'].map(pos => {
                  const count = locationPlayers.filter(p => p.position === pos).length;
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setPositionTabFilter(pos)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase shrink-0 ${
                        positionTabFilter === pos
                          ? 'bg-primary-blue text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {getPositionAbbr(pos as Position)} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Players List with Quick Pot Select */}
            {loadingPlayers ? (
              <p className="text-center py-6 text-xs text-gray-400 font-bold uppercase animate-pulse">Carregando atletas...</p>
            ) : visibleSelectionPlayers.length === 0 ? (
              <p className="text-center py-6 text-xs text-gray-400 font-bold uppercase italic">Nenhum atleta encontrado.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                {visibleSelectionPlayers.map(p => {
                  const currentPotId = getPlayerPotId(p.id);
                  const potObj = CUSTOM_POTS.find(cp => cp.id === currentPotId);

                  return (
                    <div
                      key={p.id}
                      className={`p-3 rounded-2xl border transition-all space-y-2 ${
                        currentPotId
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-gray-50/60 border-gray-100 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-black uppercase text-gray-800 leading-tight">
                            {p.name} {p.nickname ? `(${p.nickname})` : ''}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${getPositionColor(p.position)}`}>
                              {getPositionAbbr(p.position)}
                            </span>
                            <span className="text-[10px] font-black italic text-primary-blue bg-white border border-gray-200 px-1.5 py-0.5 rounded-md">
                              {getPlayerOverall(p)} OVR
                            </span>
                          </div>
                        </div>

                        {/* Pot Badge or Unallocated Badge */}
                        {potObj ? (
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl shadow-2xs ${potObj.badgeBg} ${potObj.badgeText}`}>
                              {potObj.shortLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => assignPlayerToPot(p, null)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                              title="Remover do pote"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold uppercase text-gray-400 bg-gray-200/60 px-2 py-0.5 rounded-md">
                            Sem Pote
                          </span>
                        )}
                      </div>

                      {/* Pot Selection Buttons Grid */}
                      <div className="pt-1 border-t border-gray-200/50">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Alocar em:</p>
                        <div className="flex flex-wrap gap-1">
                          {CUSTOM_POTS.map(pot => {
                            const isThisPot = currentPotId === pot.id;
                            return (
                              <button
                                key={pot.id}
                                type="button"
                                onClick={() => assignPlayerToPot(p, isThisPot ? null : pot.id)}
                                className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${
                                  isThisPot
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {pot.shortLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Trigger Buttons */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleStartAnimatedDraft}
              disabled={totalAllocatedPlayers === 0}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white py-5 rounded-3xl font-black uppercase italic tracking-widest text-base shadow-lg shadow-teal-700/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Dices className="w-6 h-6 text-primary-yellow animate-spin" /> INICIAR SORTEIO ANIMADO
            </button>
            <p className="text-[10px] text-gray-400 font-bold uppercase text-center">
              Apresentação passo a passo com revelação individual por pote
            </p>
          </div>
        </div>

        {/* Right Column: Pots Display & Results */}
        <div className="lg:col-span-7 space-y-6">
          {/* Potes Personalizados Display */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-black text-sm uppercase tracking-wider text-primary-blue flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" /> 3. Potes do Sorteio (1 por Time)
                </h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                  Cada time sorteará 1 jogador de cada pote preenchido
                </p>
              </div>

              <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                {totalAllocatedPlayers} Jogadores em Potes
              </span>
            </div>

            {/* Grid of 8 Pots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CUSTOM_POTS.map((pot, idx) => {
                const potPlayers = potsData[pot.id] || [];
                const isIdeal = potPlayers.length === numTeams;

                return (
                  <div key={pot.id} className="bg-gray-50/80 border border-gray-200/80 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${pot.badgeBg} ${pot.badgeText}`}>
                          P{idx + 1}
                        </span>
                        <h3 className="font-black text-xs uppercase text-gray-800 italic">
                          {pot.name}
                        </h3>
                      </div>

                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                        isIdeal ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {potPlayers.length} / {numTeams} ideal
                      </span>
                    </div>

                    {potPlayers.length === 0 ? (
                      <p className="text-[10px] font-semibold text-gray-400 italic py-2 text-center">
                        Pote Vazio. Adicione atletas na lista ao lado.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {potPlayers.map(p => (
                          <div
                            key={p.id}
                            className="flex items-center gap-1 text-[10px] font-black uppercase bg-white border border-gray-200 text-gray-800 px-2 py-1 rounded-lg shadow-2xs group"
                          >
                            <span>{p.name.split(' ')[0]}</span>
                            <button
                              type="button"
                              onClick={() => assignPlayerToPot(p, null)}
                              className="text-gray-400 hover:text-red-500 ml-0.5"
                              title="Remover do Pote"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drafted Teams Results */}
          {isDrawDone && !isAnimatedDrawActive && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-5 sm:p-6 rounded-3xl border-2 border-emerald-500 shadow-xl space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-emerald-600 animate-bounce" />
                    <h2 className="font-black text-lg sm:text-xl uppercase italic tracking-tight text-primary-blue">
                      Resultado Final do Sorteio
                    </h2>
                  </div>
                  <p className="text-xs text-gray-500 font-bold uppercase mt-0.5">
                    {draftedTeams.length} Equipes Formadas • {totalAllocatedPlayers} Atletas
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsAnimatedDrawActive(true)}
                    className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" /> Rever Apresentação
                  </button>

                  <button
                    type="button"
                    onClick={handleGeneratePDF}
                    className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white border border-emerald-500/30 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 shadow-sm active:scale-95"
                  >
                    <FileText className="w-4 h-4 text-primary-yellow" />
                    Gerar PDF dos Times
                  </button>

                  <button
                    type="button"
                    onClick={handleStartAnimatedDraft}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" /> Refazer Sorteio
                  </button>
                </div>
              </div>

              {selectedForSwap && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-2xl text-xs font-bold flex items-center justify-between">
                  <span>
                    Troca manual em andamento: Selecionado <strong>{selectedForSwap.player.name}</strong>. Clique em outro jogador para permutar.
                  </span>
                  <button onClick={() => setSelectedForSwap(null)} className="text-amber-900 font-black underline ml-2">
                    Cancelar
                  </button>
                </div>
              )}

              {/* Render Teams Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftedTeams.map((team, tIdx) => (
                  <div
                    key={team.id}
                    className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-4 space-y-3 shadow-md border border-slate-700"
                  >
                    {/* Team Title Banner */}
                    <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
                          T{team.id}
                        </div>
                        <div>
                          <h3 className="font-black text-sm uppercase italic tracking-wide text-white">
                            {team.name}
                          </h3>
                          <span className="text-[10px] text-emerald-400 font-bold uppercase">
                            {team.players.length} Atletas
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Team Players Roster */}
                    <div className="space-y-1.5">
                      {team.players.map(p => {
                        const isSelectedForSwap = selectedForSwap?.player.id === p.id;
                        const potId = getPlayerPotId(p.id);
                        const potObj = CUSTOM_POTS.find(cp => cp.id === potId);

                        return (
                          <div
                            key={p.id}
                            onClick={() => handlePlayerClickInTeam(tIdx, p)}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                              isSelectedForSwap
                                ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                                : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              {potObj && (
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${potObj.badgeBg} ${potObj.badgeText}`}>
                                  {potObj.shortLabel}
                                </span>
                              )}
                              <span className="truncate">
                                {p.name} {p.nickname ? `(${p.nickname})` : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Full-Screen Interactive Animated Draw Stage */}
      <AnimatePresence>
        {isAnimatedDrawActive && drawSequence.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-between"
          >
            {/* Top Stage Navigation Bar */}
            <div className="w-full max-w-6xl flex items-center justify-between bg-slate-900/90 border border-slate-800 p-4 rounded-3xl shadow-2xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                  <Flame className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                    Palco do Sorteio em Tempo Real
                  </h2>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    {isFinalViewActive ? 'Tela Final de Resultados' : 'Sorteando 1 atleta por vez dos potes • Escolha 100% Aleatória'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isFinalViewActive ? (
                  <button
                    type="button"
                    onClick={handleSkipToFinish}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 border border-amber-400 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 shadow"
                  >
                    <FastForward className="w-4 h-4 fill-current" /> Ver Tela Final
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setIsFinalViewActive(false); setCurrentStepIndex(-1); setIsAutoPlaying(false); }}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" /> Rever Passo a Passo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsAnimatedDrawActive(false)}
                  className="p-2.5 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 rounded-xl transition"
                  title="Fechar Sorteio"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* IF FINAL VIEW: SHOW ALL TEAMS AT ONCE */}
            {isFinalViewActive ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-6xl my-6 space-y-6 text-center"
              >
                <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-emerald-500/80 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-500/30 pb-5">
                    <div className="text-left space-y-1">
                      <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-primary-yellow" /> Resultado Completo
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white flex items-center gap-2">
                        🎉 Sorteio Concluído com Sucesso!
                      </h2>
                      <p className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                        Confira os elencos de todas as {draftedTeams.length} equipes formadas
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
                      <button
                        type="button"
                        onClick={handleCopyTeamsToClipboard}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 shadow-lg active:scale-95"
                      >
                        <Copy className="w-4 h-4" /> {copiedText ? 'Copiado para WhatsApp!' : 'Copiar Escalação'}
                      </button>

                      <button
                        type="button"
                        onClick={handleGeneratePDF}
                        className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 shadow-lg active:scale-95"
                      >
                        <FileText className="w-4 h-4 text-primary-yellow" /> PDF
                      </button>

                      <button
                        type="button"
                        onClick={handleStartAnimatedDraft}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" /> Refazer Sorteio
                      </button>
                    </div>
                  </div>

                  {/* All Teams Grid Side by Side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
                    {draftedTeams.map((team, tIdx) => (
                      <motion.div
                        key={team.id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: tIdx * 0.08 }}
                        className="bg-slate-900/90 border-2 border-emerald-500/50 rounded-3xl p-4 space-y-3 shadow-xl relative overflow-hidden flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 font-black text-xs flex items-center justify-center shadow">
                                T{team.id}
                              </div>
                              <div>
                                <h3 className="font-black text-sm uppercase italic tracking-wide text-white">
                                  {team.name}
                                </h3>
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                                  Média: {team.avgOverall || 0}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-black uppercase bg-slate-800 text-emerald-300 border border-slate-700 px-2 py-0.5 rounded-lg">
                              {team.players.length} Atletas
                            </span>
                          </div>

                          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                            {team.players.map((p, pIdx) => {
                              const potId = getPlayerPotId(p.id);
                              const potObj = CUSTOM_POTS.find(cp => cp.id === potId);
                              return (
                                <div
                                  key={p.id}
                                  className="flex items-center justify-between p-2 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs font-bold text-slate-200"
                                >
                                  <div className="flex items-center gap-2 truncate pr-1">
                                    <span className="text-slate-500 text-[10px] font-black">#{pIdx + 1}</span>
                                    <span className="truncate">
                                      {p.nickname || p.name}
                                    </span>
                                  </div>
                                  {potObj && (
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${potObj.badgeBg} ${potObj.badgeText}`}>
                                      {potObj.shortLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 text-center">
                          <span className="text-[9px] font-extrabold uppercase text-slate-400">
                            Equipe Pronta para o Confronto
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setIsAnimatedDrawActive(false)}
                      className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition shadow-2xl active:scale-95 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary-yellow" /> Concluir e Voltar
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* IF STEP-BY-STEP MODE: DRAWING ONE BY ONE WITH PAUSE & SPOTLIGHT ON CHOSEN TEAM */
              <div className="w-full max-w-4xl my-6 space-y-6 text-center">
                {/* Progress Indicator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-slate-400 px-2">
                    <span>Atleta {currentStepIndex < 0 ? 0 : currentStepIndex + 1} de {drawSequence.length}</span>
                    {currentStepIndex >= 0 && drawSequence[currentStepIndex] ? (
                      <span className={`px-2.5 py-0.5 rounded-full ${drawSequence[currentStepIndex].potBadgeBg} ${drawSequence[currentStepIndex].potBadgeText}`}>
                        {drawSequence[currentStepIndex].potName} ({drawSequence[currentStepIndex].potShort})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                        Aguardando Início
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      animate={{ width: `${currentStepIndex < 0 ? 0 : ((currentStepIndex + 1) / drawSequence.length) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Main Arena Layout: Player Card on Left / Chosen Team Spotlight on Right */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  {/* Big Player Reveal Card */}
                  <motion.div
                    key={currentStepIndex}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500/60 p-6 sm:p-7 rounded-3xl shadow-2xl space-y-4 relative overflow-hidden flex flex-col items-center justify-center"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                      <Dices className="w-40 h-40 text-emerald-400" />
                    </div>

                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400">
                      {currentStepIndex < 0 ? 'Palco do Sorteio' : isShuffling ? 'Sorteando Atleta...' : 'Atleta Sorteado!'}
                    </p>

                    {/* Player Card Spotlight */}
                    <div className="py-2 flex flex-col items-center justify-center min-h-[220px]">
                      {currentStepIndex < 0 ? (
                        <div className="py-6 flex flex-col items-center justify-center min-h-[220px] text-center space-y-3">
                          <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl">
                            <Dices className="w-10 h-10 animate-pulse" />
                          </div>
                          <div className="space-y-1 px-2">
                            <h3 className="text-base sm:text-lg font-black uppercase text-white tracking-tight italic">
                              Pronto para o Sorteio!
                            </h3>
                            <p className="text-xs text-slate-400 font-bold max-w-xs leading-relaxed">
                              Clique em <span className="text-primary-yellow font-black">"Sortear 1º Atleta"</span> ou ative a <span className="text-emerald-400 font-black">"Reprodução Auto"</span> para começar.
                            </p>
                          </div>
                        </div>
                      ) : isShuffling ? (
                        <motion.div 
                          animate={{ scale: [0.98, 1.02, 0.98] }}
                          transition={{ repeat: Infinity, duration: 0.15 }}
                          className="w-48 sm:w-56 aspect-[3/4] relative bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-amber-400/60 rounded-3xl flex flex-col items-center justify-between p-4 shadow-2xl overflow-hidden"
                        >
                          <div className="w-full flex justify-between items-start">
                            <span className="text-2xl font-black italic text-amber-400">??</span>
                            <div className="w-14 h-14 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center">
                              <User className="w-7 h-7 text-slate-400" />
                            </div>
                          </div>
                          <div className="text-center w-full my-auto px-2">
                            <div className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-primary-yellow italic drop-shadow-md truncate">
                              {shuffleName || 'Sorteando...'}
                            </div>
                          </div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Misturando Pote...
                          </div>
                        </motion.div>
                      ) : (
                        (() => {
                          const stepItem = drawSequence[currentStepIndex];
                          if (!stepItem) return null;
                          const curPlayer = stepItem.player;
                          const cardInfo = getPlayerCardDisplay(curPlayer);

                          return (
                            <motion.div
                              initial={{ scale: 0.75, opacity: 0, y: 20 }}
                              animate={{ scale: 1, opacity: 1, y: 0 }}
                              transition={{ type: 'spring', damping: 15 }}
                              className="w-48 sm:w-56 aspect-[3/4] relative filter drop-shadow-2xl transition-transform hover:scale-105 select-none"
                              style={{
                                backgroundImage: cardInfo.bgImage ? `url(${cardInfo.bgImage})` : 'none',
                                backgroundColor: !cardInfo.bgImage ? '#1e293b' : 'transparent',
                                backgroundSize: '100% 100%',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'center'
                              }}
                            >
                              {/* Rating and Position */}
                              <div className="absolute left-[calc(8%+10px)] top-[19%] flex flex-col items-center z-10" style={{ color: cardInfo.fontColor }}>
                                <span className="text-[1.6rem] sm:text-[2rem] font-black italic leading-none">
                                  {cardInfo.overall.toString().padStart(2, '0')}
                                </span>
                                <span className="text-[9px] sm:text-[11px] font-black uppercase mt-0.5 sm:mt-1 bg-amber-950/20 px-1.5 py-0.5 rounded tracking-wider">
                                  {getPositionAbbr(curPlayer.position)}
                                </span>
                              </div>

                              {/* Player Photo */}
                              <div className="absolute right-[calc(3%+5px)] top-[13.875%] w-[71.5%] aspect-square pointer-events-none z-20">
                                {curPlayer.photoUrl ? (
                                  <img 
                                    src={curPlayer.photoUrl} 
                                    alt={curPlayer.name} 
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full rounded-none object-cover shadow-sm bg-transparent" 
                                  />
                                ) : (
                                  <div className="w-full h-full rounded-none bg-amber-950/10 flex items-center justify-center shadow-sm">
                                    <User className="w-[40%] h-[40%] text-amber-950/30" />
                                  </div>
                                )}
                              </div>

                              {/* Player Name Banner */}
                              <div className="absolute bottom-[16%] left-0 right-0 px-3 text-center z-30" style={{ color: cardInfo.fontColor }}>
                                <div className="font-black uppercase italic tracking-tighter text-sm sm:text-base leading-tight truncate drop-shadow-sm">
                                  {curPlayer.nickname || curPlayer.name}
                                </div>
                                <div className="text-[8px] sm:text-[9px] font-extrabold uppercase opacity-80 truncate">
                                  {curPlayer.name}
                                </div>
                              </div>

                              {/* Pot Tag at bottom */}
                              <div className="absolute bottom-[4%] left-0 right-0 flex justify-center z-30">
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded shadow ${stepItem.potBadgeBg} ${stepItem.potBadgeText}`}>
                                  {stepItem.potName}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })()
                      )}
                    </div>

                    {/* Destination Team Callout */}
                    {currentStepIndex >= 0 && !isShuffling && drawSequence[currentStepIndex] && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-3 bg-emerald-500/20 border-2 border-emerald-500/60 text-emerald-300 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-black uppercase italic shadow-lg"
                      >
                        <span>Foi para o:</span>
                        <span className="text-white bg-emerald-600 px-3 py-1 rounded-xl shadow-md">
                          {drawSequence[currentStepIndex].teamName}
                        </span>
                      </motion.div>
                    )}

                    {/* Interactive Controls Bar */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-center gap-2 flex-wrap w-full">
                      <button
                        type="button"
                        onClick={handlePrevStep}
                        disabled={currentStepIndex < 0 || isShuffling}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl disabled:opacity-30 transition border border-slate-700"
                        title="Anterior"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                        disabled={isShuffling}
                        className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center gap-2 shadow-lg ${
                          isAutoPlaying
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {isAutoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isAutoPlaying ? 'Pausar Sorteio' : 'Reprodução Auto'}
                      </button>

                      <button
                        type="button"
                        onClick={handleNextStep}
                        disabled={currentStepIndex === drawSequence.length - 1 || isShuffling}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center gap-1.5 border border-slate-700 disabled:opacity-30"
                      >
                        {currentStepIndex < 0 ? 'Sortear 1º Atleta' : 'Próximo'} <SkipForward className="w-4 h-4 text-primary-yellow" />
                      </button>
                    </div>
                  </motion.div>

                  {/* SPOTLIGHT: COMO FICOU O TIME DO ESCOLHIDO COM PAUSA */}
                  <motion.div
                    key={`chosen-team-spotlight-${currentStepIndex}`}
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 20 }}
                    className="h-full bg-gradient-to-br from-slate-900 via-emerald-950/80 to-slate-950 border-2 border-emerald-500/80 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden text-left flex flex-col justify-between"
                  >
                    {currentStepIndex < 0 ? (
                      <div className="py-8 text-center space-y-3 my-auto flex flex-col items-center justify-center min-h-[220px]">
                        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Sparkles className="w-7 h-7 text-primary-yellow" />
                        </div>
                        <h3 className="text-sm font-black uppercase text-white italic">
                          Montagem das Equipes
                        </h3>
                        <p className="text-xs text-slate-400 font-bold max-w-xs leading-relaxed">
                          Assim que o primeiro atleta for sorteado, a escalação em tempo real do seu time aparecerá aqui.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-3.5 w-3.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                            </span>
                            <div>
                              <h3 className="text-base sm:text-xl font-black uppercase italic tracking-tight text-primary-yellow">
                                {drawSequence[currentStepIndex]?.teamName}
                              </h3>
                            </div>
                          </div>
                          <span className="text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-xl shrink-0">
                            {currentStepTeams.find(t => t.id === drawSequence[currentStepIndex]?.teamId)?.players.length || 0} Atleta(s)
                          </span>
                        </div>

                        {/* Roster of chosen team up to this point */}
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {!isShuffling && drawSequence[currentStepIndex] ? (
                            currentStepTeams
                              .find(t => t.id === drawSequence[currentStepIndex]?.teamId)
                              ?.players.map((item, pIdx) => {
                                const isNewlyDrawn = item.player.id === drawSequence[currentStepIndex]?.player.id;
                                return (
                                  <motion.div
                                    key={item.player.id || pIdx}
                                    initial={isNewlyDrawn ? { scale: 0.85, opacity: 0 } : false}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className={`flex items-center justify-between p-2.5 rounded-2xl text-xs font-bold border transition ${
                                      isNewlyDrawn
                                        ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white border-emerald-300 shadow-xl ring-2 ring-emerald-400/60'
                                        : 'bg-slate-800/90 text-slate-200 border-slate-700/80'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate pr-1">
                                      <span className={`text-[10px] font-black ${isNewlyDrawn ? 'text-amber-300' : 'text-slate-400'}`}>
                                        #{pIdx + 1}
                                      </span>
                                      <span className="truncate">
                                        {item.player.nickname || item.player.name}
                                      </span>
                                      {isNewlyDrawn && (
                                        <span className="text-[9px] font-black uppercase bg-primary-yellow text-slate-950 px-2 py-0.5 rounded-full shadow animate-pulse shrink-0">
                                          Recém Sorteado!
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md shrink-0 ${item.potBadgeBg} ${item.potBadgeText}`}>
                                      {item.potShort}
                                    </span>
                                  </motion.div>
                                );
                              })
                          ) : (
                            <div className="py-8 text-center text-slate-500 font-bold text-xs uppercase italic">
                              Sorteando atleta para o time...
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800/80 text-[10px] text-emerald-400 font-extrabold uppercase italic flex items-center justify-between">
                      <span>Pausa para Análise da Equipe</span>
                      <span className="animate-pulse">Sorteio em Andamento...</span>
                    </div>
                  </motion.div>
                </div>

                {/* Preenchimento de Vagas Geral */}
                <div className="w-full max-w-6xl space-y-3 pt-2">
                  <p className="text-xs font-black uppercase text-slate-400 text-center tracking-widest">
                    Preenchimento Geral de Vagas nos Times
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {currentStepTeams.map(t => {
                      const isCurrentTeam = t.id === drawSequence[currentStepIndex]?.teamId;
                      return (
                        <div 
                          key={t.id} 
                          className={`rounded-2xl p-3 space-y-2 border transition-all ${
                            isCurrentTeam && !isShuffling 
                              ? 'bg-slate-900 border-emerald-500/80 shadow-lg ring-1 ring-emerald-500/30' 
                              : 'bg-slate-900/60 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className={`font-black text-xs uppercase italic ${isCurrentTeam && !isShuffling ? 'text-primary-yellow' : 'text-white'}`}>
                              {t.name}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                              {t.players.length} Atletas
                            </span>
                          </div>

                          <div className="space-y-1 max-h-36 overflow-y-auto">
                            {t.players.map((item, pIdx) => (
                              <motion.div
                                key={pIdx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center justify-between p-1.5 bg-slate-800/80 rounded-xl text-[11px] font-bold text-slate-200 border border-slate-700"
                              >
                                <span className="truncate pr-1">{item.player.name}</span>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${item.potBadgeBg} ${item.potBadgeText}`}>
                                  {item.potShort}
                                </span>
                              </motion.div>
                            ))}

                            {t.players.length === 0 && (
                              <p className="text-[10px] text-slate-500 font-semibold italic text-center py-2">
                                Aguardando sorteio...
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Printable Area (Hidden on screen, rendered on window.print()) */}
      <div id="pdf-printable-area" className="hidden print:block p-8 bg-white text-slate-900 font-sans">
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #pdf-printable-area, #pdf-printable-area * {
              visibility: visible !important;
            }
            #pdf-printable-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 24px !important;
              background: #ffffff !important;
              color: #0f172a !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
          }
        `}</style>

        {/* Header */}
        <div className="border-b-4 border-emerald-600 pb-4 mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-emerald-600 text-white font-black text-sm px-3 py-1 rounded-lg uppercase tracking-wider">
                ARENA COXIM
              </span>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest">
                Painel Oficial de Gestão
              </span>
            </div>
            <h1 className="text-2xl font-black uppercase italic tracking-tight text-slate-900">
              Relatório de Times Sorteados
            </h1>
            <p className="text-xs font-bold text-slate-500 uppercase mt-1">
              Sede: {locations.find(l => l.id === selectedLocationId)?.name || 'Arena Coxim'} • Gerado em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="text-right border-l-2 border-emerald-200 pl-5">
            <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Resumo do Sorteio</div>
            <div className="text-base font-black text-emerald-600 uppercase">{draftedTeams.length} Times Formados</div>
            <div className="text-xs font-bold text-slate-600">{totalAllocatedPlayers} Atletas Distribuídos</div>
          </div>
        </div>

        {/* Teams Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {draftedTeams.map((t) => (
            <div key={t.id} className="border-2 border-slate-300 rounded-xl overflow-hidden bg-white">
              {/* Team Header */}
              <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between border-b-2 border-emerald-500">
                <span className="font-black text-sm uppercase italic text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                  {t.name}
                </span>
                <span className="text-[10px] font-black uppercase bg-emerald-500 text-white px-2 py-0.5 rounded">
                  {t.players.length} Atletas
                </span>
              </div>

              {/* Players Table */}
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black uppercase text-slate-600">
                    <th className="py-1.5 px-2.5 w-8 text-center">#</th>
                    <th className="py-1.5 px-2.5 w-16">Pote</th>
                    <th className="py-1.5 px-2.5">Nome do Atleta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                  {t.players.map((p, pIdx) => {
                    const potId = getPlayerPotId(p.id);
                    const potLabel = CUSTOM_POTS.find(cp => cp.id === potId)?.shortLabel || getPositionAbbr(p.position);
                    return (
                      <tr key={p.id} className={pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="py-1.5 px-2.5 text-center font-bold text-slate-400 text-[10px]">{pIdx + 1}</td>
                        <td className="py-1.5 px-2.5">
                          <span className="bg-slate-200 text-slate-800 text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
                            {potLabel}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 font-bold">
                          {p.name}
                          {p.nickname ? <span className="text-slate-400 text-[10px] ml-1">({p.nickname})</span> : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-slate-200 pt-4 text-center text-[10px] font-bold text-slate-400 uppercase flex items-center justify-between">
          <span>Documento Oficial • Painel Arena Coxim</span>
          <span>Sorteio Randômico Transparente</span>
        </div>
      </div>
    </div>
  );
}
