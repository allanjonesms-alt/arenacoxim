import React, { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { Banner } from '../pages/BannerManagement';

interface ShopeeBannerProps {
  className?: string;
}

export default function ShopeeBanner({ className = '' }: ShopeeBannerProps) {
  const [randomBanner, setRandomBanner] = useState<Banner | null>(null);

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const q = query(collection(db, 'banners'), where('active', '==', true));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const activeBanners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Banner));
          const idx = Math.floor(Math.random() * activeBanners.length);
          setRandomBanner(activeBanners[idx]);
        }
      } catch (err) {
        console.error("Erro ao carregar banners:", err);
      }
    };
    fetchBanners();
  }, []);

  const handleBannerClick = async () => {
    if (randomBanner) {
      try {
        const bannerRef = doc(db, 'banners', randomBanner.id);
        await updateDoc(bannerRef, {
          clicks: increment(1)
        });
      } catch (e) {
        console.error("Erro ao registrar clique", e);
      }
    }
  };

  if (!randomBanner) return null;

  return (
    <a 
      href={randomBanner.link} 
      target="_blank" 
      rel="noopener noreferrer"
      onClick={handleBannerClick}
      className={`block w-full relative overflow-hidden group transition-all duration-300 hover:shadow-lg border border-gray-100 hover:border-gray-200 ${className || 'rounded-2xl mb-6'}`}
    >
      <picture className="block w-full">
        <source media="(min-width: 640px)" srcSet={randomBanner.imageUrlDesktop} />
        <img 
          src={randomBanner.imageUrlMobile || randomBanner.imageUrlDesktop} 
          alt="Ofertas" 
          referrerPolicy="no-referrer"
          className="w-full h-auto object-contain transition-transform duration-700 group-hover:scale-105"
        />
      </picture>
      <div className="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors duration-300 pointer-events-none"></div>
      <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md text-white px-2 py-1 rounded-lg flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <span>Acessar Link</span>
        <ExternalLink className="w-3 h-3" />
      </div>
    </a>
  );
}
