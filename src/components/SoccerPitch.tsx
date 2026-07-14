import React from 'react';
import { Player, Card } from '../types';
import { SoccerJersey } from './SoccerJersey';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Share2, Loader2, User } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

interface SoccerPitchProps {
  teamA: string[];
  teamB: string[];
  goalkeeperAId?: string;
  goalkeeperBId?: string;
  teamAColor?: string;
  teamBColor?: string;
  players: Player[];
  matchDate?: string;
  matchTime?: string;
  teamAName?: string;
  teamBName?: string;
}

export const SoccerPitch: React.FC<SoccerPitchProps> = ({
  teamA,
  teamB,
  goalkeeperAId,
  goalkeeperBId,
  teamAColor = '#555',
  teamBColor = '#555',
  players,
  matchDate,
  matchTime,
  teamAName,
  teamBName
}) => {
  const resolvedTeamBColor = teamBColor && teamBColor !== '#555' && teamBColor !== '#eee' && teamBColor !== 'transparente' ? teamBColor : '#2563eb';
  const resolvedTeamAColor = teamAColor && teamAColor !== '#555' && teamAColor !== '#eee' && teamAColor !== 'transparente' ? teamAColor : '#eab308';

  const pitchRef = React.useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = React.useState(false);
  const [localCards, setLocalCards] = React.useState<Card[]>([]);
  const [shareImageUrl, setShareImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const qCards = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qCards, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Card));
      setLocalCards(list);
    }, (err) => {
      console.error("Error loading cards inside SoccerPitch:", err);
    });

    return () => unsubscribe();
  }, []);

  const resolvePlayerCard = (player: Player) => {
    let cardBg = '';
    let fontColor = '#a52a2a';
    let overall = player.overallValue || 75;

    if (localCards && localCards.length > 0) {
      let assignedCard = localCards.find(c => c.imageUrl === player.cardBgUrl) || localCards.find(c => c.isDefault);
      
      if (assignedCard && assignedCard.expirationDate) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (assignedCard.expirationDate < todayStr) {
          assignedCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
        }
      }

      const isArtilheiroCard = assignedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);
      const rawOverallWithBonus = (player.overallValue || 75) + cardBonusValue;

      const silverCard = localCards.find(c => {
        const n = c.name?.toUpperCase() || '';
        return n === 'PRATA' || n === 'CARTA PRATA' || n.includes('PRATA');
      });
      const forceSilver = (!player.cardBgUrl || assignedCard?.isDefault || assignedCard?.name?.toUpperCase() === 'GERAL') && rawOverallWithBonus < 90 && !!silverCard;

      const resolvedCard = forceSilver ? silverCard! : assignedCard;
      cardBg = resolvedCard?.imageUrl || '';
      fontColor = resolvedCard?.fontColor || '#a52a2a';

      const resolvedIsArtilheiro = resolvedCard?.name?.toUpperCase()?.includes('ARTILHEIRO');
      const resolvedBonus = resolvedIsArtilheiro ? 5 : (resolvedCard?.increaseOverall || 0);
      overall = (player.overallValue || 75) + resolvedBonus;
    }

    if (!cardBg) {
      const defaultCard = localCards.find(c => c.name.toUpperCase() === 'GERAL') || localCards.find(c => c.isDefault);
      cardBg = player.cardBgUrl || defaultCard?.imageUrl || '';
    }

    return { cardBg, fontColor, overall };
  };

  const tPlayersA = teamA.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
  const tPlayersB = teamB.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];

  const gkA = tPlayersA.find(p => p.id === goalkeeperAId);
  const gkB = tPlayersB.find(p => p.id === goalkeeperBId);

  const othersA = tPlayersA.filter(p => p.id !== goalkeeperAId);
  const othersB = tPlayersB.filter(p => p.id !== goalkeeperBId);

  // Layout logic
  const row1A = othersA.slice(0, 3);
  const row2A = othersA.slice(3, 5);
  const row3A = othersA.slice(5, 6);

  const row1B = othersB.slice(0, 3);
  const row2B = othersB.slice(3, 5);
  const row3B = othersB.slice(5, 6);

  // Parse safety for Date
  let formattedDateStr = "";
  if (matchDate) {
    try {
      formattedDateStr = format(new Date(matchDate + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR });
    } catch {
      formattedDateStr = matchDate;
    }
  }

  const getProxyUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('data:') || !url.startsWith('http')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  };

  // Render FUT-style card
  const renderPlayerSymbol = (player: Player, teamColor: string, isGoalkeeper: boolean, isTeamB: boolean) => {
    const { cardBg, fontColor, overall } = resolvePlayerCard(player);
    const proxiedCardBg = getProxyUrl(cardBg);
    const proxiedPhotoUrl = getProxyUrl(player.photoUrl);

    // Dynamic aesthetic glow: Blue for Team B, Yellow/Gold for Team A
    const glowColor = isTeamB ? 'rgba(37, 99, 235, 0.85)' : 'rgba(234, 179, 8, 0.9)';
    const shadowFilter = `drop-shadow(0 2.5px 4px rgba(0,0,0,0.45)) drop-shadow(0 0 6px ${glowColor})`;

    return (
      <div 
        className="w-12 md:w-[72px] aspect-[3/4] relative select-none pointer-events-none rounded-none overflow-hidden bg-transparent"
        style={{ filter: shadowFilter }}
      >
        {/* Card Background image using inline <img> to ensure crossOrigin and correct rendering in html2canvas */}
        {proxiedCardBg ? (
          <img 
            src={proxiedCardBg} 
            alt="" 
            crossOrigin="anonymous" 
            referrerPolicy="no-referrer" 
            className="absolute inset-0 w-full h-full object-fill z-0 pointer-events-none bg-transparent" 
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-slate-900/40 backdrop-blur-[1px] border border-white/10 rounded-lg z-0" />
        )}

        {/* Rating and Position on the left (FUT layout) */}
        <div 
          className="absolute left-[8%] top-[19%] flex flex-col items-center select-none z-10" 
          style={{ color: fontColor }}
        >
          {/* Very large overall rating (+4pt added) */}
          <span className="text-[17px] md:text-[25px] font-black italic leading-none tracking-tighter">
            {overall.toString().padStart(2, '0')}
          </span>
          <span className="text-[4px] md:text-[6.5px] font-black uppercase mt-0 sm:mt-0.5 tracking-wider opacity-95">
            {(player.position || '').slice(0, 3).toUpperCase()}
          </span>
        </div>

        {/* Player Photo (centered FUT Align Cutout with clean transparent background) */}
        <div className="absolute right-[5%] top-[14%] w-[71.5%] aspect-square pointer-events-none z-20 overflow-hidden bg-transparent">
          {proxiedPhotoUrl ? (
            <img 
              src={proxiedPhotoUrl} 
              alt="" 
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              className="w-full h-full object-cover rounded-none bg-transparent" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-transparent">
              <div className="scale-[0.5] md:scale-[0.8] opacity-85">
                <SoccerJersey color={isGoalkeeper ? "#111" : teamColor} size={24} />
              </div>
            </div>
          )}
        </div>

        {/* Player Name below candidate photo inside the FUT card (+4pt added to size) */}
        <div 
          className="absolute bottom-[9%] left-0 right-0 text-center select-none z-30 px-1 pointer-events-none"
          style={{ color: fontColor }}
        >
          <span className="block text-[8.2px] md:text-[10.5px] font-black uppercase tracking-tighter leading-none truncate whitespace-nowrap px-0.5">
            {(player.nickname || player.name.split(' ')[0]).toUpperCase()}
          </span>
        </div>
      </div>
    );
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pitchRef.current) return;
    setIsSharing(true);

    let originalCssRulesGetter: (() => CSSRuleList) | undefined = undefined;

    try {
      // Temporary patch to prevent html2canvas from crashing on Tailwind CSS oklch/oklab color values
      originalCssRulesGetter = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, 'cssRules')?.get;
      
      if (originalCssRulesGetter) {
        const proxyRule = (rule: any): any => {
          const handler: ProxyHandler<any> = {
            get(target, prop) {
              if (prop === 'cssText') {
                let text = target.cssText;
                if (text && (text.includes('oklch') || text.includes('oklab'))) {
                  text = text
                    .replace(/oklch\([^)]+\)/gi, 'rgb(120, 120, 120)')
                    .replace(/oklab\([^)]+\)/gi, 'rgb(120, 120, 120)');
                }
                return text;
              }
              if (prop === 'cssRules') {
                try {
                  const rules = target.cssRules;
                  if (!rules) return rules;
                  const proxiedRules = [];
                  for (let i = 0; i < rules.length; i++) {
                    proxiedRules.push(proxyRule(rules[i]));
                  }
                  return {
                    length: proxiedRules.length,
                    item: (index: number) => proxiedRules[index] || null,
                    ...proxiedRules
                  };
                } catch {
                  return [];
                }
              }
              const val = target[prop];
              if (typeof val === 'function') {
                return val.bind(target);
              }
              return val;
            }
          };
          return new Proxy(rule, handler);
        };

        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get() {
            try {
              const rules = originalCssRulesGetter!.call(this);
              const proxiedRules = [];
              for (let i = 0; i < rules.length; i++) {
                proxiedRules.push(proxyRule(rules[i]));
              }
              return {
                length: proxiedRules.length,
                item: (index: number) => proxiedRules[index] || null,
                ...proxiedRules
              } as unknown as CSSRuleList;
            } catch (err) {
              return [] as unknown as CSSRuleList;
            }
          },
          configurable: true
        });
      }

      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(pitchRef.current, {
        useCORS: true,
        logging: false,
        backgroundColor: '#2e7d32', // green field color
        scale: 2, // High resolution Quality
      });

      // Restore styleSheet rules parse behavior right away
      if (originalCssRulesGetter) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get: originalCssRulesGetter,
          configurable: true
        });
        originalCssRulesGetter = undefined; // prevent restoring again in finally block
      }

      // Retrieve JPEG DataURL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      // Save block to trigger our beautiful fallback preview/download Modal
      setShareImageUrl(dataUrl);

      // Check if mobile device
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

      if (isMobileDevice && navigator.share && navigator.canShare) {
        try {
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const file = new File([blob], `campo_${matchDate || 'escalacao'}.jpg`, { type: 'image/jpeg' });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: 'Escalação do Campo',
              text: 'Confira a escalação do campo para o nosso jogo!',
            });
            setIsSharing(false);
            return;
          }
        } catch (shareErr) {
          console.error("Native sharing failed, using modal fallback:", shareErr);
        }
      }

      // Desktop Download action or Mobile Fallback
      const link = document.createElement('a');
      link.download = `campo_${matchDate || 'escalacao'}.jpg`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
      alert("Não foi possível gerar a imagem no momento.");
    } finally {
      setIsSharing(false);
      if (originalCssRulesGetter) {
        Object.defineProperty(CSSStyleSheet.prototype, 'cssRules', {
          get: originalCssRulesGetter,
          configurable: true
        });
      }
    }
  };

  return (
    <>
      <div 
        ref={pitchRef}
        className="relative aspect-[3/4] w-full bg-[#2e7d32] rounded-[1.5rem] md:rounded-[2.5rem] border-[4px] md:border-8 border-white/30 overflow-visible shadow-2xl flex flex-col"
      >
        {/* Share Button in the Top-Right Corner */}
        <button
          onClick={handleShare}
          disabled={isSharing}
          data-html2canvas-ignore="true"
          className="absolute top-4 right-4 z-50 p-2 md:p-3 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/20 shadow-lg cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          title="Compartilhar escalação (JPG)"
        >
          {isSharing ? (
            <Loader2 className="w-4 h-4 md:w-5 h-5 animate-spin text-white" />
          ) : (
            <Share2 className="w-4 h-4 md:w-5 h-5 text-white" />
          )}
          <span className="hidden md:inline text-xs font-black uppercase tracking-wider text-white">Compartilhar</span>
        </button>

        {/* Grass Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none rounded-[1.5rem] md:rounded-[2.5rem]" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.05) 40px, rgba(255,255,255,0.05) 80px)'
        }} />

        {/* Beautiful Watermark Shield Crest on the Pitch Grass */}
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none flex flex-col items-center justify-center z-0 opacity-[0.14]">
          <svg className="w-20 h-20 md:w-36 md:h-36" viewBox="0 0 100 100" fill="none" style={{ color: resolvedTeamBColor }}>
            <path 
              d="M50 5 L85 20 C85 55, 75 75, 50 95 C25 75, 15 55, 15 20 Z" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              fill="currentColor" 
              fillOpacity="0.05"
            />
            <path 
              d="M50 12 L78 24 C78 51, 70 68, 50 85 C30 68, 22 51, 22 24 Z" 
              stroke="currentColor" 
              strokeWidth="1" 
              strokeDasharray="2 2"
              fill="none" 
            />
            <polygon points="50,28 53,36 62,36 55,41 57,49 50,44 43,49 45,41 38,36 47,38" fill="currentColor" fillOpacity="0.8"/>
          </svg>
          <span 
            className="block text-[11px] sm:text-[15px] md:text-[24px] font-black uppercase tracking-[0.2em] font-sans mt-2 text-center text-ellipsis overflow-hidden max-w-[240px] whitespace-nowrap"
            style={{ color: resolvedTeamBColor }}
          >
            {teamBName || 'TIME AZUL'}
          </span>
        </div>

        <div className="absolute bottom-[22%] left-1/2 -translate-x-1/2 translate-y-1/2 select-none pointer-events-none flex flex-col items-center justify-center z-0 opacity-[0.14]">
          <svg className="w-20 h-20 md:w-36 md:h-36" viewBox="0 0 100 100" fill="none" style={{ color: resolvedTeamAColor }}>
            <path 
              d="M50 5 L85 20 C85 55, 75 75, 50 95 C25 75, 15 55, 15 20 Z" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              fill="currentColor" 
              fillOpacity="0.05"
            />
            <path 
              d="M50 12 L78 24 C78 51, 70 68, 50 85 C30 68, 22 51, 22 24 Z" 
              stroke="currentColor" 
              strokeWidth="1" 
              strokeDasharray="2 2"
              fill="none" 
            />
            <polygon points="50,28 53,36 62,36 55,41 57,49 50,44 43,49 45,41 38,36 47,38" fill="currentColor" fillOpacity="0.8"/>
          </svg>
          <span 
            className="block text-[11px] sm:text-[15px] md:text-[24px] font-black uppercase tracking-[0.2em] font-sans mt-2 text-center text-ellipsis overflow-hidden max-w-[240px] whitespace-nowrap"
            style={{ color: resolvedTeamAColor }}
          >
            {teamAName || 'TIME AMARELO'}
          </span>
        </div>

        {/* Field Lines */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 md:w-40 md:h-40 border-2 md:border-4 border-white/20 rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-0 right-0 h-0.5 md:h-1 bg-white/20 pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 md:w-64 h-12 md:h-24 border-b-2 md:border-b-4 border-x-2 md:border-x-4 border-white/20 pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 md:w-64 h-12 md:h-24 border-t-2 md:border-t-4 border-x-2 md:border-x-4 border-white/20 pointer-events-none" />

        {/* Goalkeepers */}
        {gkB && (
          <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-2xl">
            {renderPlayerSymbol(gkB, resolvedTeamBColor, true, true)}
          </div>
        )}
        {gkA && (
          <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-2xl">
            {renderPlayerSymbol(gkA, resolvedTeamAColor, true, false)}
          </div>
        )}

        {/* Match Info Overlay */}
        {formattedDateStr && (
          <div className="absolute bottom-2 left-2 md:bottom-6 md:left-6 z-20 text-left">
            <div className="inline-block bg-white/10 backdrop-blur-md px-2 md:px-4 py-1 md:py-2 rounded-lg md:rounded-2xl border border-white/20 shadow-xl">
              <p className="text-[6px] md:text-[10px] font-black text-white/80 uppercase tracking-widest leading-none">
                {formattedDateStr} {matchTime ? `• ${matchTime}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Top Team (B) */}
        <div className="relative flex-1 flex flex-col justify-start pt-[82px] md:pt-[130px] gap-4 md:gap-7 z-10">
          <div className="flex justify-center gap-4 md:gap-10 h-auto">
            {row1B.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-6 md:gap-12 h-auto">
            {row2B.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
              </div>
            ))}
          </div>
          <div className="flex justify-center h-auto">
            {row3B.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamBColor, false, true)}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Team (A) */}
        <div className="relative flex-1 flex flex-col-reverse justify-start pb-[82px] md:pb-[130px] gap-4 md:gap-7 z-10">
          <div className="flex justify-center gap-4 md:gap-10 h-auto">
            {row1A.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-6 md:gap-12 h-auto">
            {row2A.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
              </div>
            ))}
          </div>
          <div className="flex justify-center h-auto">
            {row3A.map(p => (
              <div key={p.id} className="relative flex flex-col items-center justify-start w-12 md:w-[72px] h-auto transition-transform hover:scale-110 drop-shadow-xl overflow-visible">
                {renderPlayerSymbol(p, resolvedTeamAColor, false, false)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Elegant Fallback Download Preview Modal */}
      {shareImageUrl && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-white/10 rounded-2xl p-5 md:p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-white"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/25 flex items-center justify-center text-emerald-400 mb-3 text-xl">
              ⚽
            </div>
            <h3 className="text-base md:text-lg font-black text-white mb-1.5 text-center uppercase tracking-wider">
              Imagem do Campo Gerada!
            </h3>
            <p className="text-xs text-slate-300 mb-5 text-center leading-relaxed">
              A escalação foi gerada com sucesso. Toque e segure na imagem abaixo para <strong>compartilhar ou salvar</strong>, ou clique no botão de download.
            </p>
            
            {/* Real Generated Image */}
            <div className="relative border-2 border-white/20 rounded-xl overflow-hidden aspect-[3/4] w-full max-h-[40vh] mb-5 shadow-lg bg-emerald-800">
              <img 
                src={shareImageUrl} 
                alt="Escalação gerada" 
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-col gap-2 w-full">
              <a 
                href={shareImageUrl} 
                download={`campo_${matchDate || 'escalacao'}.jpg`}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-3 px-4 rounded-xl text-center text-xs md:text-sm uppercase tracking-wider transition-all active:scale-95 shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer focus:outline-none"
              >
                📥 Baixar Imagem (JPG)
              </a>

              <button 
                onClick={() => setShareImageUrl(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold py-2.5 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition-all cursor-pointer border border-white/5 focus:outline-none"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

