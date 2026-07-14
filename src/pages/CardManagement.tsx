import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy, updateDoc, writeBatch, where, getDocs } from 'firebase/firestore';                
import { Card, Player } from '../types';
import { calculateGrade } from '../utils/gradeUtils';
import { Trash2, Plus, Image, ArrowLeft, Upload, Sparkles, CheckCircle, Edit } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../App';
import { Link } from 'react-router-dom';

export default function CardManagement() {
  const [cards, setCards] = useState<Card[]>([]);
  const [name, setName] = useState('');
  const [fontColor, setFontColor] = useState('#a52a2a'); // Default brun
  const [increaseOverall, setIncreaseOverall] = useState(0);
  const [description, setDescription] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeWhiteBg, setRemoveWhiteBg] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editName, setEditName] = useState('');
  const [editFontColor, setEditFontColor] = useState('#a52a2a');
  const [editIncreaseOverall, setEditIncreaseOverall] = useState(0);
  const [editDescription, setEditDescription] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveWhiteBg, setEditRemoveWhiteBg] = useState(true);
  const [editImageSizeKb, setEditImageSizeKb] = useState<number | null>(null);

  const [imageSizeKb, setImageSizeKb] = useState<number | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'cards'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setCards(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Card)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cards'));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.onload = () => {
          // Optimized 3:4 dimensions to balance quality and storage limits
          const targetWidth = 300;
          const targetHeight = 400;
          
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Clear background to keep transparency intact for custom PNG shapes
            ctx.clearRect(0, 0, targetWidth, targetHeight);
            
            // Calculate crops to maintain exact vertical card aspect ratio
            const imgAspect = img.width / img.height;
            const targetAspect = targetWidth / targetHeight;
            
            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = img.width;
            let sourceHeight = img.height;
            
            if (imgAspect > targetAspect) {
              // Wider than 3:4, crop side borders
              sourceWidth = img.height * targetAspect;
              sourceX = (img.width - sourceWidth) / 2;
            } else if (imgAspect < targetAspect) {
              // Taller than 3:4, crop vertical heights
              sourceHeight = img.width / targetAspect;
              sourceY = (img.height - sourceHeight) / 2;
            }
            
            ctx.drawImage(
              img, 
              sourceX, sourceY, sourceWidth, sourceHeight,
              0, 0, targetWidth, targetHeight
            );

            // Apply white background stripping if enabled (chroma-key transparent PNG)
            if (removeWhiteBg) {
              try {
                const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                  const r = data[i];
                  const g = data[i + 1];
                  const b = data[i + 2];
                  // If color/pixels are very close to white, convert them to transparent
                  if (r > 220 && g > 220 && b > 220) {
                    data[i + 3] = 0; // Alpha = 0 (completely transparent)
                  }
                }
                ctx.putImageData(imgData, 0, 0);
              } catch (err) {
                console.error("Error setting transparent background on card:", err);
              }
            }
            
            // Standardize as PNG (preserves correct transparency for rounded/FUT card shapes)
            let finalDataUrl = canvas.toDataURL('image/png');
            let currentWidth = targetWidth;
            let currentHeight = targetHeight;
            
            // Failsafe auto-downscale loop if PNG size is somehow still close to Firestore limit of 1 MiB
            while (finalDataUrl.length > 900000 && currentWidth > 120) {
              currentWidth = Math.round(currentWidth * 0.8);
              currentHeight = Math.round(currentHeight * 0.8);
              
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = currentWidth;
              tempCanvas.height = currentHeight;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.drawImage(canvas, 0, 0, currentWidth, currentHeight);
                finalDataUrl = tempCanvas.toDataURL('image/png');
              } else {
                break;
              }
            }

            setImagePreview(finalDataUrl);
            
            const calcKb = Math.round((finalDataUrl.length * 3) / 4 / 1024);
            setImageSizeKb(calcKb);
          }
          setLoading(false);
        };
        img.onerror = () => {
          alert('Erro ao processar imagem.');
          setLoading(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert('Erro ao ler o arquivo.');
        setLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.onload = () => {
          const targetWidth = 300;
          const targetHeight = 400;
          
          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.clearRect(0, 0, targetWidth, targetHeight);
            
            const imgAspect = img.width / img.height;
            const targetAspect = targetWidth / targetHeight;
            
            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = img.width;
            let sourceHeight = img.height;
            
            if (imgAspect > targetAspect) {
              sourceWidth = img.height * targetAspect;
              sourceX = (img.width - sourceWidth) / 2;
            } else if (imgAspect < targetAspect) {
              sourceHeight = img.width / targetAspect;
              sourceY = (img.height - sourceHeight) / 2;
            }
            
            ctx.drawImage(
              img, 
              sourceX, sourceY, sourceWidth, sourceHeight,
              0, 0, targetWidth, targetHeight
            );

            if (editRemoveWhiteBg) {
              try {
                const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                  const r = data[i];
                  const g = data[i + 1];
                  const b = data[i + 2];
                  if (r > 220 && g > 220 && b > 220) {
                    data[i + 3] = 0;
                  }
                }
                ctx.putImageData(imgData, 0, 0);
              } catch (err) {
                console.error("Error setting transparent background on card:", err);
              }
            }
            
            let finalDataUrl = canvas.toDataURL('image/png');
            let currentWidth = targetWidth;
            let currentHeight = targetHeight;
            
            while (finalDataUrl.length > 900000 && currentWidth > 120) {
              currentWidth = Math.round(currentWidth * 0.8);
              currentHeight = Math.round(currentHeight * 0.8);
              
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = currentWidth;
              tempCanvas.height = currentHeight;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.drawImage(canvas, 0, 0, currentWidth, currentHeight);
                finalDataUrl = tempCanvas.toDataURL('image/png');
              } else {
                break;
              }
            }

            setEditImagePreview(finalDataUrl);
            
            const calcKb = Math.round((finalDataUrl.length * 3) / 4 / 1024);
            setEditImageSizeKb(calcKb);
          }
          setLoading(false);
        };
        img.onerror = () => {
          alert('Erro ao processar imagem.');
          setLoading(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert('Erro ao ler o arquivo.');
        setLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview) {
      alert('Por favor, faça upload de uma imagem de fundo.');
      return;
    }
    setLoading(true);
    try {
      // Save directly to Firestore db using the compressed base64 string
      await addDoc(collection(db, 'cards'), {
        name: name.trim(),
        imageUrl: imagePreview,
        fontColor: fontColor,
        increaseOverall: increaseOverall,
        description: description.trim(),
        expirationDate: expirationDate || null,
        createdAt: Date.now()
      });

      setName('');
      setFontColor('#a52a2a');
      setIncreaseOverall(0);
      setDescription('');
      setExpirationDate('');
      setImagePreview(null);
      setImageSizeKb(null);
      // Reset the file input
      const fileInput = document.getElementById('card-image-input') as HTMLInputElement | null;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cards');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, cardName: string) => {
    try {
      await deleteDoc(doc(db, 'cards', id));
    } catch (err) {
      console.error('Error deleting card:', err);
      handleFirestoreError(err, OperationType.DELETE, `cards/${id}`);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'cards', editingCard.id), {
        name: editName.trim(),
        imageUrl: editImagePreview || null,
        fontColor: editFontColor,
        increaseOverall: editIncreaseOverall,
        description: editDescription.trim(),
        expirationDate: editExpirationDate || null
      });

      // Propagate bonus change to all affected players if there is a card image URL
      if (editingCard.imageUrl) {
        const playersRef = collection(db, 'players');
        const q = query(playersRef, where('cardBgUrl', '==', editingCard.imageUrl));
        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        
        querySnapshot.forEach((playerDoc) => {
          const player = playerDoc.data() as Player;
          
          // Recalculate
          const avgPoints = (player.stats.points || 0) / (player.stats.matches || 1);
          const { grade } = calculateGrade(player.overallStats, avgPoints);
          const baseGrade = parseInt(grade) || 75;
          const isArtilheiro = editName.toUpperCase().includes('ARTILHEIRO');
          const bonus = isArtilheiro ? 5 : editIncreaseOverall;
          const overallValue = Math.min(105, baseGrade + bonus);
          
          batch.update(playerDoc.ref, { 
            overallValue,
            cardBgUrl: editImagePreview || null
          });
        });
        
        await batch.commit();
      }

      setIsEditModalOpen(false);
      setEditingCard(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cards/${editingCard.id}`);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (card: Card) => {
    setEditingCard(card);
    setEditName(card.name);
    setEditFontColor(card.fontColor || '#a52a2a');
    setEditIncreaseOverall(card.increaseOverall || 0);
    setEditDescription(card.description || '');
    setEditExpirationDate(card.expirationDate || '');
    setEditImagePreview(card.imageUrl);
    setEditRemoveWhiteBg(true);
    setEditImageSizeKb(null);
    setIsEditModalOpen(true);
  };

  const handleSetDefault = async (cardId: string) => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Reset all cards' isDefault to false
      cards.forEach(card => {
        if (card.id !== cardId) {
          batch.update(doc(db, 'cards', card.id), { isDefault: false });
        }
      });
      
      // Set the selected card's isDefault to true
      batch.update(doc(db, 'cards', cardId), { isDefault: true });
      
      await batch.commit();
      alert('Card padrão definido com sucesso!');
    } catch (err) {
      console.error('Error setting default card:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'cards');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="p-2 sm:p-3 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="bg-[#fdcb02] p-3 rounded-2xl shadow-sm">
            <Image className="w-6 h-6 text-primary-blue animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Gerenciar CARDS</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Fundos de carta para os atletas</p>
          </div>
        </div>

        {/* Removed button */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Adicionar Novo Card Form */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-fit">
          <h2 className="text-lg font-black uppercase italic tracking-tight text-primary-blue mb-4">Adicionar Novo Card</h2>
          <form onSubmit={handleAdd} className="space-y-5">
            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Nome do Card
              </label>
              <input
                type="text"
                placeholder="Ex prime, GERAL, ouro, lendario"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Cor da Fonte no Card
              </label>
              <input
                type="color"
                value={fontColor}
                onChange={(e) => setFontColor(e.target.value)}
                className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Aumento de Overall (0-10)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={increaseOverall}
                onChange={(e) => setIncreaseOverall(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Como obter (Descrição)
              </label>
              <textarea
                placeholder="Ex. Ganhar 3 partidas seguidas ou ser o melhor da rodada..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-semibold text-gray-700 transition resize-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Data de Vencimento
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
              />
              <p className="text-[10px] text-gray-400 mt-1 font-medium">
                Caso definida, esta carta expirará após esta data e o jogador retornará à sua carta correspondente (PRATA ou GERAL) de forma automática.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                Imagem de Fundo
              </label>

              {/* Automatic White Background Removal Filter Toggle */}
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 p-3 rounded-2xl mb-3">
                <input
                  type="checkbox"
                  id="card-remove-white-bg"
                  checked={removeWhiteBg}
                  onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                  className="w-4 h-4 text-primary-blue rounded border-slate-200 focus:ring-primary-blue accent-primary-blue cursor-pointer"
                />
                <label htmlFor="card-remove-white-bg" className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-600 tracking-wider cursor-pointer leading-tight">
                  Remover fundo branco da carta automaticamente
                </label>
              </div>
              
              <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-6 hover:border-primary-blue transition text-center cursor-pointer group">
                <input
                  type="file"
                  id="card-image-input"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                
                {imagePreview ? (
                  <div className="space-y-3">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-48 mx-auto object-contain rounded-xl shadow-sm border border-gray-100"
                    />
                    <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                      <p className="text-xs text-emerald-700 font-bold select-none">✓ Imagem otimizada com sucesso!</p>
                      {imageSizeKb !== null && (
                        <p className="text-[10px] text-emerald-600 font-mono mt-0.5">
                          Tamanho: {imageSizeKb} KB (Limite: 1024 KB)
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-gray-300 group-hover:text-primary-blue mx-auto transition" />
                    <span className="block text-xs font-black uppercase text-gray-400 tracking-wide">
                      Clique ou arraste a imagem do Card
                    </span>
                    <span className="block text-[10px] text-gray-400 font-medium">
                      Preferencialmente no formato vertical (3:4)
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !imagePreview || !name}
              className="w-full bg-[#fdcb02] hover:bg-[#e0b400] disabled:opacity-50 text-primary-blue px-6 py-4 rounded-2xl font-black uppercase italic tracking-wider text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
            >
              <Plus size={20} /> Adicionar Card
            </button>
          </form>
        </div>

        {/* Listagem de Cards */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-black uppercase italic tracking-tight text-primary-blue mb-4 flex items-center gap-2">
            Cards Disponíveis ({cards.length})
          </h2>

          {cards.length === 0 ? (
            <div className="bg-white rounded-[2rem] border-2 border-dashed border-gray-100 p-12 text-center flex flex-col items-center opacity-40">
              <Image className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-gray-500 font-black uppercase tracking-wider italic text-xs">Nenhum card personalizado cadastrado</p>
              <p className="text-[10px] text-gray-400 font-medium mt-1">Os atletas usarão o fundo padrão do sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {cards.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between transition-all hover:shadow-md"
                >
                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 mb-3">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      onError={(e) => {
                        // Fallback image
                        e.currentTarget.style.opacity = '0.5';
                      }}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Floating badge for card title inside rendering */}
                    <div className="absolute bottom-3 left-3 bg-primary-blue/90 border border-white/20 text-white px-3 py-1.5 rounded-xl font-black uppercase tracking-wider text-[10px] shadow-sm select-none">
                      {item.name}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div>
                      <h3 className="font-black uppercase tracking-tight text-primary-blue text-sm">
                        {item.name}
                      </h3>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(item);
                      }}
                      className="p-2.5 bg-blue-50 hover:bg-blue-500 text-blue-500 hover:text-white rounded-xl transition-all shadow-sm"
                      title="Editar Card"
                    >
                      <Edit size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(item.id);
                      }}
                      className={`p-2.5 rounded-xl transition-all shadow-sm ${item.isDefault ? 'bg-emerald-500 text-white' : 'bg-gray-100 hover:bg-emerald-500 text-gray-500 hover:text-white'}`}
                      title={item.isDefault ? 'Card Padrão' : 'Definir como Padrão'}
                    >
                      <CheckCircle size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id, item.name);
                      }}
                      className="p-2.5 bg-red-50 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all shadow-sm"
                      title="Excluir Card"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {item.description && (
                    <div className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-100 p-2.5 rounded-2xl break-words leading-relaxed font-medium">
                      <strong className="text-primary-blue mr-1">Como obter:</strong>
                      {item.description}
                    </div>
                  )}

                  {item.expirationDate && (
                    <div className="mt-2 text-[10.5px] text-red-600 bg-red-50/50 border border-red-100 p-2 py-1.5 rounded-2xl leading-relaxed font-bold flex items-center gap-1.5 w-fit">
                      <strong className="text-red-700">Expira em:</strong>
                      {item.expirationDate.split('-').reverse().join('/')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Edit Modal */}
      {isEditModalOpen && editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-black uppercase italic tracking-tight text-primary-blue mb-6">
              Editar Card: {editingCard.name}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">Nome</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">Cor da Fonte</label>
                <input
                  type="color"
                  value={editFontColor}
                  onChange={(e) => setEditFontColor(e.target.value)}
                  className="w-full h-12 bg-gray-50 border border-gray-100 rounded-2xl cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">Aumento de Overall (0-10)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={editIncreaseOverall}
                  onChange={(e) => setEditIncreaseOverall(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">Como obter (Descrição)</label>
                <textarea
                  placeholder="Explique como obter a carta..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-semibold text-gray-700 transition resize-none"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">Data de Vencimento</label>
                <input
                  type="date"
                  value={editExpirationDate}
                  onChange={(e) => setEditExpirationDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 focus:outline-none focus:border-primary-blue font-bold text-gray-700 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 tracking-wider mb-2">
                  Imagem de Fundo do Card
                </label>

                {/* Automatic White Background Removal Filter Toggle */}
                <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 p-3 rounded-2xl mb-3">
                  <input
                    type="checkbox"
                    id="edit-card-remove-white-bg"
                    checked={editRemoveWhiteBg}
                    onChange={(e) => setEditRemoveWhiteBg(e.target.checked)}
                    className="w-4 h-4 text-primary-blue rounded border-slate-200 focus:ring-primary-blue accent-primary-blue cursor-pointer"
                  />
                  <label htmlFor="edit-card-remove-white-bg" className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-600 tracking-wider cursor-pointer leading-tight">
                    Remover fundo branco automaticamente
                  </label>
                </div>
                
                <div className="relative border-2 border-dashed border-gray-200 rounded-3xl p-4 hover:border-primary-blue transition text-center cursor-pointer group">
                  <input
                    type="file"
                    id="edit-card-image-input"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  
                  {editImagePreview ? (
                    <div className="space-y-3">
                      <img
                        src={editImagePreview}
                        alt="Preview"
                        className="max-h-36 mx-auto object-contain rounded-xl shadow-sm border border-gray-100"
                      />
                      <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                        <p className="text-[11px] text-emerald-700 font-bold select-none">✓ Imagem carregada!</p>
                        {editImageSizeKb !== null ? (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">
                            Tamanho: {editImageSizeKb} KB (Limite: 1024 KB)
                          </p>
                        ) : (
                          <p className="text-[9px] text-emerald-600 font-mono mt-0.5">
                            Imagem original mantida/atualizada
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-6 h-6 text-gray-300 group-hover:text-primary-blue mx-auto transition" />
                      <span className="block text-xs font-black uppercase text-gray-400 tracking-wide">
                        Carregar nova imagem de fundo
                      </span>
                      <span className="block text-[9px] text-gray-400 font-medium">
                        Clique ou arraste um arquivo 3:4
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-3 rounded-2xl font-black uppercase tracking-wider text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-primary-blue hover:bg-blue-600 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-wider text-sm shadow-md transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
