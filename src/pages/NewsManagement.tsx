import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, onSnapshot, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { News } from '../types';
import { Trash2, Plus, FileText, Upload, Calendar, Clock, Image as ImageIcon, AlertCircle, Edit2, X } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../App';
import { format } from 'date-fns';

export default function NewsManagement() {
  const [news, setNews] = useState<News[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [link, setLink] = useState('');
  
  // Custom Date and Time states
  const [date, setDate] = useState(() => {
    const today = new Date();
    // Use local date string in YYYY-MM-DD
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
  });
  
  const [time, setTime] = useState(() => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  });

  // Uploader UI States
  const [isDragging, setIsDragging] = useState(false);
  const [compressionLoading, setCompressionLoading] = useState(false);
  const [imageSizeKb, setImageSizeKb] = useState<number | null>(null);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setNews(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as News)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'news'));
  }, []);

  const handleProcessFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    setCompressionLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Optimal banner 16:9 dimensions for news
        const targetWidth = 800;
        const targetHeight = 450;
        
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Fill neutral slate-900 background in case of transparent elements
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          
          const imgAspect = img.width / img.height;
          const targetAspect = targetWidth / targetHeight;
          
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = img.width;
          let sourceHeight = img.height;
          
          if (imgAspect > targetAspect) {
            // Wider, crop sides
            sourceWidth = img.height * targetAspect;
            sourceX = (img.width - sourceWidth) / 2;
          } else if (imgAspect < targetAspect) {
            // Taller, crop top/bottom
            sourceHeight = img.width / targetAspect;
            sourceY = (img.height - sourceHeight) / 2;
          }
          
          ctx.drawImage(
            img,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, targetWidth, targetHeight
          );
          
          // Compress to JPEG with 0.75 quality for high fidelity and micro size (~80-150KB)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setImageUrl(dataUrl);
          
          const sizeInKb = Math.round((dataUrl.length * 3) / 4 / 1024);
          setImageSizeKb(sizeInKb);
        }
        setCompressionLoading(false);
      };
      
      img.onerror = () => {
        alert('Erro ao carregar imagem.');
        setCompressionLoading(false);
      };
      
      img.src = event.target?.result as string;
    };
    
    reader.onerror = () => {
      alert('Erro ao ler arquivo.');
      setCompressionLoading(false);
    };
    
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl) {
      alert('Por favor, faça upload de uma imagem para a notícia!');
      return;
    }

    try {
      if (editingNews) {
        await updateDoc(doc(db, 'news', editingNews.id), {
          title,
          content,
          imageUrl,
          date,
          time,
          link: link.trim() || '',
        });
      } else {
        await addDoc(collection(db, 'news'), {
          title,
          content,
          imageUrl,
          date,
          time,
          link: link.trim() || '',
          createdAt: Date.now()
        });
      }
      
      resetForm();
    } catch (err: any) {
      console.error("ERRO COMPLETO:", err);

      if (err.code) {
        console.log("CODE:", err.code);
      }

      if (err.message) {
        console.log("MESSAGE:", err.message);
      }
      
      alert(`Falha ao salvar notícia!\nErro: ${err.code || 'Desconhecido'}\nDetalhe: ${err.message || String(err)}`);
    }
  };

  const resetForm = () => {
    setEditingNews(null);
    setTitle('');
    setContent('');
    setImageUrl('');
    setImageSizeKb(null);
    setLink('');
    const today = new Date();
    const localDate = new Date(today.getTime() - (today.getTimezoneOffset()*60*1000));
    setDate(localDate.toISOString().split('T')[0]);
    
    const hours = today.getHours().toString().padStart(2, '0');
    const minutes = today.getMinutes().toString().padStart(2, '0');
    setTime(`${hours}:${minutes}`);
  };

  const handleEdit = (item: News) => {
    setEditingNews(item);
    setTitle(item.title);
    setContent(item.content);
    setImageUrl(item.imageUrl || '');
    setImageSizeKb(null); // We don't have kb for loaded images without recalculating
    setLink(item.link || '');
    
    if (item.date) {
      setDate(item.date);
    }
    if (item.time) {
      setTime(item.time);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'news', id));
    } catch (err: any) {
      console.error("ERRO COMPLETO:", err);

      if (err.code) {
        console.log("CODE:", err.code);
      }

      if (err.message) {
        console.log("MESSAGE:", err.message);
      }
      
      // Exibe alert informativo para o usuário ver o erro exato na tela
      alert(`Falha ao excluir notícia!\nErro: ${err.code || 'Desconhecido'}\nDetalhe: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-emerald-600 p-3 rounded-2xl shadow-md border border-emerald-500/10">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-primary-blue">Gerenciar Notícias</h1>
          <p className="text-xs text-gray-400 font-semibold uppercase mt-0.5">Gerenciador de avisos e destaques rápidos da Arena Coxim</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-150 mb-8">
        <h2 className="text-lg font-black uppercase text-primary-blue mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {editingNews ? (
               <Edit2 className="w-5 h-5 text-emerald-500" />
            ) : (
               <Plus className="w-5 h-5 text-emerald-500" />
            )}
            {editingNews ? 'Editar Notícia' : 'Nova Notícia'}
          </div>
          {editingNews && (
            <button
               type="button"
               onClick={resetForm}
               className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold uppercase transition-all"
            >
              <X className="w-3 h-3" /> Cancelar
            </button>
          )}
        </h2>
        <form onSubmit={handleAdd} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Data da Notícia</label>
              <div className="relative">
                <input 
                  required 
                  type="date" 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-emerald-500 outline-none text-primary-gray font-medium text-sm transition-all shadow-inner" 
                />
                <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-350 w-5 h-5 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Horário de Publicação</label>
              <div className="relative">
                <input 
                  required 
                  type="time" 
                  value={time} 
                  onChange={e => setTime(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-emerald-500 outline-none text-primary-gray font-medium text-sm transition-all shadow-inner" 
                />
                <Clock className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-350 w-5 h-5 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Título</label>
            <input
              type="text"
              placeholder="Digite o título da notícia"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-emerald-500 outline-none text-primary-gray font-medium text-sm transition-all shadow-inner"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Conteúdo</label>
            <textarea
              placeholder="Escreva uma descrição ou mensagem rápida..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-emerald-500 outline-none text-primary-gray font-medium text-sm transition-all shadow-inner min-h-[100px]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1">Link de Acesso (Opcional)</label>
            <input
              type="text"
              placeholder="https://exemplo.com/noticia-completa"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-5 focus:border-emerald-500 outline-none text-primary-gray font-medium text-sm transition-all shadow-inner"
            />
          </div>

          {/* DND and Click Image Uploader */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest pl-1 block">Imagem da Notícia</label>
            
            {!imageUrl ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] ${
                  isDragging 
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600' 
                    : 'border-gray-200 bg-gray-50/50 text-gray-400 hover:bg-gray-50 hover:border-emerald-400'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                
                {compressionLoading ? (
                  <div className="space-y-3">
                    <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-bold text-emerald-600 uppercase">Processando imagem...</p>
                  </div>
                ) : (
                  <>
                    <Upload className={`w-10 h-10 mb-3 ${isDragging ? 'text-emerald-500 animate-bounce' : 'text-gray-350'}`} />
                    <span className="text-sm font-bold text-gray-700 uppercase">Arraste a Imagem aqui</span>
                    <span className="text-xs text-gray-400 font-semibold uppercase mt-1">ou clique para selecionar do dispositivo</span>
                  </>
                )}
              </div>
            ) : (
              <div className="relative rounded-3xl overflow-hidden border border-gray-150 shadow-sm bg-slate-900 group aspect-[16/9]">
                <img src={imageUrl} alt="Notícia Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-between p-4">
                  {imageSizeKb && (
                    <span className="bg-emerald-650 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">
                      {imageSizeKb} KB (Otimizada)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setImageSizeKb(null);
                    }}
                    className="p-2 bg-rose-600 text-white rounded-xl shadow-lg hover:bg-rose-700 transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider pl-2.5 pr-3"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </button>
                </div>
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={compressionLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-100 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {editingNews ? (
               <Edit2 className="w-5 h-5 text-primary-yellow" />
            ) : (
               <Plus className="w-5 h-5 text-primary-yellow" /> 
            )}
            {editingNews ? 'Salvar Alterações' : 'Criar Notícia'}
          </button>
        </form>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-black uppercase text-gray-400 tracking-wider">Feed de notícias publicadas ({news.length})</h2>
        {news.length === 0 ? (
          <div className="py-12 bg-white rounded-3xl border border-gray-100 text-center shadow-sm">
            <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium italic">Nenhuma notícia publicada até o período.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {news.map(item => (
              <div key={item.id} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-all">
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-slate-950 border border-gray-50 shadow-inner">
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    {item.date && (
                      <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm shadow-sm py-1 px-2.5 rounded-lg text-[9px] font-black uppercase text-primary-blue flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-emerald-500" /> {item.date} {item.time ? `às ${item.time}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-black text-sm text-primary-blue uppercase tracking-tight line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-gray-400 font-medium leading-relaxed line-clamp-3">{item.content}</p>
                    {item.link && (
                      <div className="text-[10px] text-emerald-650 font-black uppercase tracking-wider bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg w-fit truncate max-w-full">
                        Link: {item.link}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end border-t border-gray-50 mt-4 pt-3 gap-2">
                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                      <span className="text-[10px] font-bold text-rose-500 uppercase tracking-tight mr-1">Tem certeza?</span>
                      <button 
                        onClick={() => {
                          handleDelete(item.id);
                          setConfirmDeleteId(null);
                        }} 
                        className="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-xl transition-all text-[11px] font-black uppercase tracking-widest"
                      >
                        Sim
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(null)} 
                        className="bg-gray-100 hover:bg-gray-200 text-gray-550 px-3 py-1.5 rounded-xl transition-all text-[11px] font-black uppercase tracking-widest"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleEdit(item)} 
                        className="text-primary-blue p-2.5 hover:bg-blue-50 rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest pl-3 pr-3.5"
                      >
                        <Edit2 size={15} /> Editar
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(item.id)} 
                        className="text-rose-500 p-2.5 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-widest pl-3 pr-3.5"
                      >
                        <Trash2 size={15} /> Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
