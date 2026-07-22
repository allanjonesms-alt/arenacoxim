import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc, increment, where, orderBy, getDocs } from 'firebase/firestore';
import { MonthlyAward, AwardCategory, Player, Card, Location, AdminData } from '../types';
import { Trophy, Trash2, Plus, Calendar, Search, MapPin, User, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { handleFirestoreError, OperationType } from '../App';

interface MonthlyAwardsManagementProps {
  adminData: AdminData | null;
  locations: Location[];
}

export default function MonthlyAwardsManagement({ adminData, locations }: MonthlyAwardsManagementProps) {
  const [awards, setAwards] = useState<MonthlyAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<AwardCategory>('ARTILHEIRO DO MÊS');
  const [searchPlayerQuery, setSearchPlayerQuery] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  const [loading, setLoading] = useState(true);

  const categories: AwardCategory[] = [
    'ARTILHEIRO DO MÊS',
    'ASSISTENTE DO MÊS',
    'MELHOR GOLEIRO',
    'MELHOR DEFENSOR',
    'MELHOR LATERAL'
  ];

  useEffect(() => {
    // Current month as default
    const now = new Date();
    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  }, []);

  useEffect(() => {
    let qAwards = query(collection(db, 'monthlyAwards'), orderBy('createdAt', 'desc'));
    if (adminData?.role !== 'master' && adminData?.locationId) {
      qAwards = query(collection(db, 'monthlyAwards'), where('locationId', '==', adminData.locationId));
      setSelectedLocationId(adminData.locationId);
    } else if (locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }

    const unsubAwards = onSnapshot(qAwards, (snap) => {
      setAwards(snap.docs.map(d => ({ id: d.id, ...d.data() } as MonthlyAward)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'monthlyAwards'));

    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
    });

    const unsubCards = onSnapshot(collection(db, 'cards'), (snap) => {
      setCards(snap.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    });

    return () => {
      unsubAwards();
      unsubPlayers();
      unsubCards();
    };
  }, [adminData, locations]);

  const handleSaveAward = async () => {
    if (!selectedLocationId || !selectedMonth || !selectedCategory || !selectedPlayerId || !selectedCardId) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    // Generate unique ID based on month, location and category
    const id = `${selectedMonth}_${selectedLocationId}_${selectedCategory.replace(/\s+/g, '')}`;

    const existingAward = awards.find(a => a.id === id);

    const newAward: MonthlyAward = {
      id,
      month: selectedMonth,
      locationId: selectedLocationId,
      category: selectedCategory,
      playerId: selectedPlayerId,
      cardId: selectedCardId,
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'monthlyAwards', id), newAward);

      // If award existed before for a different player, decrement old player
      if (existingAward && existingAward.playerId !== selectedPlayerId) {
        await updateDoc(doc(db, 'players', existingAward.playerId), {
          overallValue: increment(-1)
        });
      }

      // If new award or assigned to different player, increment new player
      if (!existingAward || existingAward.playerId !== selectedPlayerId) {
        await updateDoc(doc(db, 'players', selectedPlayerId), {
          overallValue: increment(1)
        });
      }

      setSearchPlayerQuery('');
      setSelectedPlayerId('');
      alert("Prêmio salvo com sucesso! (+1 no Overall do atleta)");
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar o prêmio.");
    }
  };

  const handleDeleteAward = async (id: string) => {
    if (window.confirm("Deseja remover este prêmio?")) {
      try {
        const awardToDelete = awards.find(a => a.id === id);
        await deleteDoc(doc(db, 'monthlyAwards', id));

        if (awardToDelete && awardToDelete.playerId) {
          await updateDoc(doc(db, 'players', awardToDelete.playerId), {
            overallValue: increment(-1)
          });
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao remover o prêmio.");
      }
    }
  };

  const filteredPlayers = players.filter(p => 
    p.locationId === selectedLocationId &&
    (p.name.toLowerCase().includes(searchPlayerQuery.toLowerCase()) || p.nickname?.toLowerCase().includes(searchPlayerQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-primary-gray flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary-yellow" />
            Melhores do Mês
          </h1>
          <p className="text-gray-500 text-sm font-medium mt-1">Gerencie os destaques mensais e suas cartas bônus.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary-yellow/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <h2 className="text-sm font-black uppercase tracking-widest text-primary-blue mb-6 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Registrar Destaque
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminData?.role === 'master' && (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Sede/Local</label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:border-primary-blue focus:ring-1 focus:ring-primary-blue"
              >
                <option value="">Selecione um local</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Mês (Ano-Mês)</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:border-primary-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Categoria</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as AwardCategory)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:border-primary-blue"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="relative col-span-1 md:col-span-2 lg:col-span-1">
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Buscar Atleta</label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar jogador..."
                value={searchPlayerQuery}
                onChange={(e) => {
                  setSearchPlayerQuery(e.target.value);
                  setSelectedPlayerId('');
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:border-primary-blue"
              />
            </div>
            
            {/* Autocomplete Dropdown */}
            {searchPlayerQuery && !selectedPlayerId && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPlayerId(p.id);
                        setSearchPlayerQuery(p.nickname || p.name);
                      }}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
                    >
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <User size={14} className="text-gray-400" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-gray-800">{p.nickname || p.name}</div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase">{p.position}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">Nenhum atleta encontrado no local selecionado.</div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">Carta Bônus</label>
            <select
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 focus:outline-none focus:border-primary-blue"
            >
              <option value="">Selecione a carta</option>
              {cards.map(card => (
                <option key={card.id} value={card.id}>{card.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end lg:col-span-1">
            <button
              onClick={handleSaveAward}
              className="w-full bg-primary-blue text-white rounded-xl px-4 py-3 font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-colors"
            >
              Salvar Destaque
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Mês</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Categoria</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Atleta</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Carta Bônus</th>
                <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {awards.map(award => {
                const p = players.find(x => x.id === award.playerId);
                const c = cards.find(x => x.id === award.cardId);
                const monthDate = new Date(`${award.month}-01T12:00:00`);
                const monthStr = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                
                return (
                  <tr key={award.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 capitalize">{monthStr}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="bg-blue-50 text-primary-blue px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">
                        {award.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {p?.photoUrl ? (
                          <img src={p.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <User size={14} className="text-gray-400" />
                          </div>
                        )}
                        <span className="text-sm font-bold text-gray-700">{p?.nickname || p?.name || 'Desconhecido'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c ? (
                        <div className="flex items-center gap-2">
                          <img src={c.imageUrl} className="w-6 h-8 object-cover rounded shadow-sm" alt="card" />
                          <span className="text-xs font-bold text-gray-600">{c.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Carta não encontrada</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleDeleteAward(award.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover Prêmio"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {awards.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm font-medium italic">
                    Nenhum destaque registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
