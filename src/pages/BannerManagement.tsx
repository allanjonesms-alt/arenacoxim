import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';
import { Save, Plus, Trash2, Edit2, Loader2, Link2, Eye, EyeOff, Activity } from 'lucide-react';
import { motion } from 'motion/react';

export interface Banner {
  id: string;
  imageUrlDesktop: string;
  imageUrlMobile: string;
  link: string;
  active: boolean;
  clicks: number;
}

export default function BannerManagement() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    link: '',
    active: true,
    imageUrlDesktop: '',
    imageUrlMobile: ''
  });

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'banners'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
      setBanners(list);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'banners');
    } finally {
      setLoading(false);
    }
  };

  const handleDesktopImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const ratio = img.height / img.width;
          const desktopWidth = Math.min(img.width, 1200);
          const desktopHeight = desktopWidth * ratio;
          
          const canvasDesktop = document.createElement('canvas');
          canvasDesktop.width = desktopWidth;
          canvasDesktop.height = desktopHeight;
          const ctxDesktop = canvasDesktop.getContext('2d');
          if (ctxDesktop) {
            ctxDesktop.fillStyle = '#f9fafb';
            ctxDesktop.fillRect(0, 0, desktopWidth, desktopHeight);
            ctxDesktop.drawImage(img, 0, 0, desktopWidth, desktopHeight);
            const desktopBase64 = canvasDesktop.toDataURL('image/jpeg', 0.85);
            setFormData(prev => ({ ...prev, imageUrlDesktop: desktopBase64, imageUrlMobile: prev.imageUrlMobile || desktopBase64 }));
          }
        } catch (err) {
          console.error("Error processing image:", err);
          alert("Erro ao processar imagem desktop.");
        }
      };
      img.onerror = () => {
        alert("Erro ao carregar a imagem. Verifique se o arquivo é válido.");
      }
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMobileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const ratio = img.height / img.width;
          const mobileWidth = Math.min(img.width, 600);
          const mobileHeight = mobileWidth * ratio;
          
          const canvasMobile = document.createElement('canvas');
          canvasMobile.width = mobileWidth;
          canvasMobile.height = mobileHeight;
          const ctxMobile = canvasMobile.getContext('2d');
          if (ctxMobile) {
            ctxMobile.fillStyle = '#f9fafb';
            ctxMobile.fillRect(0, 0, mobileWidth, mobileHeight);
            ctxMobile.drawImage(img, 0, 0, mobileWidth, mobileHeight);
            const mobileBase64 = canvasMobile.toDataURL('image/jpeg', 0.85);
            setFormData(prev => ({ ...prev, imageUrlMobile: mobileBase64 }));
          }
        } catch (err) {
          console.error("Error processing mobile image:", err);
          alert("Erro ao processar imagem mobile.");
        }
      };
      img.onerror = () => {
        alert("Erro ao carregar a imagem.");
      }
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.imageUrlDesktop || !formData.imageUrlMobile) {
      alert("Por favor, faça o upload de uma imagem para o banner.");
      return;
    }
    
    if (!formData.link) {
      alert("Por favor, informe o link de destino do banner.");
      return;
    }
    
    let validLink = formData.link.trim();
    if (validLink && !validLink.startsWith('http://') && !validLink.startsWith('https://')) {
      validLink = 'https://' + validLink;
    }
    
    setIsSaving(true);
    try {
      const isNew = !editingBanner;
      const bannerId = isNew ? doc(collection(db, 'banners')).id : editingBanner.id;
      
      const payload: Partial<Banner> = {
        imageUrlDesktop: formData.imageUrlDesktop,
        imageUrlMobile: formData.imageUrlMobile,
        link: validLink,
        active: formData.active,
      };
      
      if (isNew) {
        payload.clicks = 0;
        (payload as any).createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'banners', bannerId), payload, { merge: true });
      
      setShowModal(false);
      fetchBanners();
    } catch (error) {
      console.error("Error saving banner:", error);
      handleFirestoreError(error, OperationType.WRITE, 'banners');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'banners', id));
      fetchBanners();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'banners');
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, active: !b.active } : b));
      await setDoc(doc(db, 'banners', banner.id), { active: !banner.active }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'banners');
      fetchBanners(); // revert on error
    }
  };

  const openNewModal = () => {
    setEditingBanner(null);
    setFormData({ link: '', active: true, imageUrlDesktop: '', imageUrlMobile: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowModal(true);
  };

  const openEditModal = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      link: banner.link || '',
      active: banner.active,
      imageUrlDesktop: banner.imageUrlDesktop || '',
      imageUrlMobile: banner.imageUrlMobile || ''
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowModal(true);
  };

  if (loading && banners.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 text-primary-yellow animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-primary-blue">Banners</h2>
          <p className="text-gray-500 text-sm font-medium">Cadastre promoções e patrocínios (ex: Shopee)</p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 bg-primary-yellow hover:bg-yellow-400 text-black px-6 py-3 rounded-2xl font-black uppercase tracking-widest shadow-sm hover:shadow transition-all"
        >
          <Plus className="w-5 h-5" />
          Novo Banner
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {banners.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-3xl border border-gray-100 italic text-gray-400 font-medium">
            Nenhum banner cadastrado. Clique em Novo Banner para adicionar.
          </div>
        ) : (
          banners.map((banner) => (
            <div key={banner.id} className={`bg-white rounded-3xl border transition-all ${banner.active ? 'border-primary-blue/20 shadow-sm' : 'border-gray-100 opacity-70'} overflow-hidden`}>
              <div className="relative bg-gray-50 p-4 rounded-t-3xl border-b border-gray-100">
                <div className="grid grid-cols-3 gap-4 items-center">
                  <div className="col-span-2">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">Desktop Preview</span>
                    <div className="bg-white p-1 rounded-xl border border-gray-200/60 shadow-sm">
                      <img src={banner.imageUrlDesktop} alt="Desktop Banner" className="w-full h-10 object-contain rounded-lg" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">Mobile Preview</span>
                    <div className="bg-white p-1 rounded-xl border border-gray-200/60 shadow-sm flex justify-center">
                      <img src={banner.imageUrlMobile || banner.imageUrlDesktop} alt="Mobile Banner" className="h-10 w-auto object-contain rounded-lg" />
                    </div>
                  </div>
                </div>
                {!banner.active && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                    <span className="bg-gray-800 text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest">Inativo</span>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => handleToggleActive(banner)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${banner.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                      {banner.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {banner.active ? 'Ativo' : 'Inativo'}
                    </button>
                    <div className="flex items-center gap-1.5 text-primary-blue text-xs font-bold uppercase tracking-wider" title="Cliques">
                      <Activity className="w-4 h-4" />
                      {banner.clicks || 0} cliques
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <button onClick={() => openEditModal(banner)} className="p-2 text-gray-400 hover:text-primary-blue bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {confirmDeleteId === banner.id ? (
                      <div className="absolute right-0 bg-white border border-rose-150 p-2 rounded-2xl flex items-center gap-1.5 shadow-lg z-10 animate-in fade-in zoom-in-95 duration-150">
                        <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter mr-1">Apagar?</span>
                        <button
                          onClick={() => {
                            handleDelete(banner.id);
                            setConfirmDeleteId(null);
                          }}
                          className="bg-rose-500 hover:bg-rose-600 text-white text-[9px] font-black uppercase px-2 py-1 rounded-xl shadow-sm transition-all"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-500 text-[9px] font-black uppercase px-2 py-1 rounded-xl transition-all"
                        >
                          Não
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(banner.id)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-xl hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-start gap-2 bg-gray-50 p-3 rounded-2xl">
                  <Link2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <a href={banner.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-gray hover:text-primary-blue transition-colors break-all line-clamp-2">
                    {banner.link || 'Sem link configurado'}
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black uppercase tracking-tight text-primary-gray italic mb-6">
              {editingBanner ? 'Editar Banner' : 'Novo Banner'}
            </h3>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest pl-1 mb-2">Imagem Desktop (obrigatório)</label>
                  <div className="flex items-center gap-4">
                    {formData.imageUrlDesktop && (
                      <img src={formData.imageUrlDesktop} alt="Preview Desktop" className="w-24 h-12 object-contain rounded-lg border border-gray-200" />
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleDesktopImageUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-gray-100 file:text-primary-gray hover:file:bg-gray-200 transition-colors cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 italic font-medium pl-1">Proporção ideal: mais largo que alto (ex: 1200x180).</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest pl-1 mb-2">Imagem Mobile (opcional)</label>
                  <div className="flex items-center gap-4">
                    {formData.imageUrlMobile && formData.imageUrlMobile !== formData.imageUrlDesktop && (
                      <img src={formData.imageUrlMobile} alt="Preview Mobile" className="w-12 h-16 object-contain rounded-lg border border-gray-200" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMobileImageUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-gray-100 file:text-primary-gray hover:file:bg-gray-200 transition-colors cursor-pointer"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 italic font-medium pl-1">Proporção ideal: mais quadrado (ex: 600x300). Se não enviar, usará a imagem de Desktop.</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest pl-1 mb-2">Link de Destino</label>
                <input
                  type="text"
                  value={formData.link}
                  onChange={e => setFormData({ ...formData, link: e.target.value })}
                  placeholder="https://s.shopee.com.br/...."
                  className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-sm focus:ring-2 focus:ring-primary-blue focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formData.active}
                  onChange={e => setFormData({ ...formData, active: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-primary-blue focus:ring-primary-blue bg-white"
                />
                <label htmlFor="activeCheck" className="text-sm font-bold text-primary-gray uppercase tracking-tight cursor-pointer">
                  Banner Ativo publicamente
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors disabled:opacity-50" disabled={isSaving}>
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="flex flex-1 sm:flex-none justify-center items-center gap-2 px-8 py-3 bg-primary-blue hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-blue-200 disabled:opacity-50">
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 text-primary-yellow" />}
                  {isSaving ? 'Salvando...' : 'Salvar Banner'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
