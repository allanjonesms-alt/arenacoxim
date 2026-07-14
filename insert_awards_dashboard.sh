sed -i '/<div className="lg:col-span-8 space-y-6">/r /dev/stdin' src/pages/PublicDashboard.tsx << 'INNER_EOF'
        {monthlyAwards.length > 0 && (
          <div className="mb-2">
            <h2 className="text-xl font-black uppercase italic tracking-tight flex items-center gap-2 text-primary-gray mb-4">
              <Star className="text-primary-yellow" /> Melhores do Mês
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {monthlyAwards.map(award => {
                const p = players.find(x => x.id === award.playerId);
                const c = cards.find(x => x.id === award.cardId);
                const categoryAbbr = award.category === 'ARTILHEIRO DO MÊS' ? 'Artilheiro' : 
                                     award.category === 'ASSISTENTE DO MÊS' ? 'Garçom' :
                                     award.category === 'MELHOR GOLEIRO' ? 'Muralha' :
                                     award.category === 'MELHOR DEFENSOR' ? 'Defensor' : 'Lateral';
                
                return (
                  <div key={award.id} className="bg-app-card rounded-2xl p-3 border border-gray-100 flex flex-col items-center justify-center shadow-sm relative overflow-hidden group hover:border-primary-yellow/50 transition-all">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-primary-yellow/10 rounded-full blur-xl -mr-8 -mt-8 pointer-events-none group-hover:bg-primary-yellow/20 transition-all"></div>
                    
                    <div className="text-[9px] font-black text-primary-blue uppercase tracking-tight text-center mb-2 h-8 flex items-center justify-center leading-none">
                      {award.category}
                    </div>

                    <div className="relative w-full aspect-[3/4] flex justify-center mb-2">
                       {c ? (
                          <img src={c.imageUrl} alt="" className="h-full object-contain drop-shadow-md z-10 group-hover:scale-105 transition-transform" />
                       ) : (
                         <div className="w-full h-full bg-gray-100 rounded-lg animate-pulse" />
                       )}
                    </div>
                    
                    <div className="text-center w-full z-10">
                      <div className="text-[10px] font-black uppercase text-gray-800 tracking-tighter truncate w-full">{p?.nickname || p?.name}</div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">{categoryAbbr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
INNER_EOF
