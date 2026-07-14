import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ZoomIn, ZoomOut, Move, Check, X, RefreshCw } from 'lucide-react';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (croppedImageBase64: string) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onConfirm,
}) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [removeWhiteBg, setRemoveWhiteBg] = useState(true);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const viewPortSize = 300; // 300x300 pixels viewport in UI

  // Recalculate default fitting image sizes
  const [dim, setDim] = useState({
    baseW: 0,
    baseH: 0,
    fitScale: 1,
  });

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    // We want the image to cover the 300x300 viewport
    const scale = Math.max(viewPortSize / naturalW, viewPortSize / naturalH);
    const baseW = naturalW * scale;
    const baseH = naturalH * scale;

    setDim({
      baseW,
      baseH,
      fitScale: scale,
    });

    // Centered initially
    setPosition({
      x: (viewPortSize - baseW) / 2,
      y: (viewPortSize - baseH) / 2,
    });
    setZoom(1);
  };

  // Keep image position bounded so that the image always covers the viewport
  const clampPosition = (x: number, y: number, currentZoom: number) => {
    const w = dim.baseW * currentZoom;
    const h = dim.baseH * currentZoom;

    // Minimum negative offset is viewportSize - enlargedSize (which is a negative number)
    // Maximum offset is 0
    let minX = viewPortSize - w;
    let minY = viewPortSize - h;

    let clampedX = Math.min(0, Math.max(minX, x));
    let clampedY = Math.min(0, Math.max(minY, y));

    return { x: clampedX, y: clampedY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const x = e.clientX - dragStart.current.x;
    const y = e.clientY - dragStart.current.y;
    setPosition(clampPosition(x, y, zoom));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mobile Touch Support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      dragStart.current = {
        x: touch.clientX - position.x,
        y: touch.clientY - position.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const x = touch.clientX - dragStart.current.x;
    const y = touch.clientY - dragStart.current.y;
    setPosition(clampPosition(x, y, zoom));
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    // Adjust position when zooming to keep it bounded
    setPosition((prev) => clampPosition(prev.x, prev.y, newZoom));
  };

  const cropAndSave = () => {
    const imgElement = imageRef.current;
    if (!imgElement) return;

    const canvas = document.createElement('canvas');
    // Save image to a high-quality 400x400 size for performance and storage
    const outputSize = 400;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Clear to maintain transparency
      ctx.clearRect(0, 0, outputSize, outputSize);

      // Drawing ratio between canvas and UI viewport
      const ratio = outputSize / viewPortSize;

      const destX = position.x * ratio;
      const destY = position.y * ratio;
      const destW = dim.baseW * zoom * ratio;
      const destH = dim.baseH * zoom * ratio;

      ctx.drawImage(imgElement, destX, destY, destW, destH);

      // Remove white background if selected (chroma keying)
      if (removeWhiteBg) {
        try {
          const imgData = ctx.getImageData(0, 0, outputSize, outputSize);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // If the pixel is very close to white, make it transparent
            if (r > 215 && g > 215 && b > 215) {
              data[i + 3] = 0; // Alpha = 0 (fully transparent)
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (err) {
          console.error("Error setting transparent background on player photo crop:", err);
        }
      }

      // Export as PNG to preserve transparent background
      const dataUrl = canvas.toDataURL('image/png');
      onConfirm(dataUrl);
    }
  };

  // Sync zoom/position boundaries when dim edits or resets
  useEffect(() => {
    if (imageSrc && imageRef.current) {
      // Setup image reload trigger
      imageRef.current.src = imageSrc;
    }
  }, [imageSrc]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase text-primary-blue tracking-widest italic leading-none">
                  Ajustar Foto
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">
                  Posicione a foto do craque
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full hover:bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cropping viewport Area */}
            <div className="p-8 flex flex-col items-center justify-center bg-gray-50">
              <div
                ref={containerRef}
                className="relative overflow-hidden bg-gray-200 shadow-inner select-none cursor-move border-4 border-white shadow-xl"
                style={{
                  width: `${viewPortSize}px`,
                  height: `${viewPortSize}px`,
                  borderRadius: '2rem',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                {/* Image being dragged/zoomed */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Ajuste"
                  onLoad={handleImageLoad}
                  className="absolute pointer-events-none max-w-none origin-top-left"
                  style={{
                    width: dim.baseW ? `${dim.baseW * zoom}px` : 'auto',
                    height: dim.baseH ? `${dim.baseH * zoom}px` : 'auto',
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    transition: isDragging ? 'none' : 'transform 0.05s ease-out',
                  }}
                  draggable={false}
                />

                {/* Dark masking layer focusing a circle inside */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {/* Visual Crop Guideline Overlay (Circle representation of the photo) */}
                  <div
                    className="w-64 h-64 rounded-full border-[3px] border-primary-yellow border-dashed shadow-[0_0_0_9999px_rgba(27,94,32,0.4)] animate-pulse"
                    style={{ animationDuration: '4s' }}
                  />
                </div>

                {/* Corner guide overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 mix-blend-overlay">
                  <div className="flex justify-between">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
                    <div className="w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
                    <div className="w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
                  </div>
                </div>

                {/* Drag Indicator Tooltip */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none">
                  <Move className="w-3.5 h-3.5 text-white/90" />
                  <span className="text-[9px] font-black text-white uppercase tracking-wider">
                    Arraste para posicionar
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <p className="text-[10px] text-gray-500 font-bold text-center mt-5 uppercase tracking-wider max-w-[260px] leading-relaxed">
                Utilize o toque ou o mouse para arrastar a foto e posicionar o rosto centralizado no círculo tracejado.
              </p>
            </div>

            {/* Controls */}
            <div className="p-6 bg-white border-t border-gray-50 space-y-5">
              {/* Zoom Controls */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleZoomChange(Math.max(1, zoom - 0.2))}
                  className="w-10 h-10 max-h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-primary-blue transition-colors border border-gray-100 shadow-sm"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>

                <div className="flex-1 flex items-center gap-3 bg-gray-50 px-4 py-2.5 rounded-2xl border border-gray-100 shadow-inner">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Zoom</span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="flex-1 accent-primary-blue cursor-pointer h-1.5 rounded-lg bg-gray-200"
                  />
                  <span className="text-[10px] font-black text-primary-blue min-w-[30px] text-right font-mono">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleZoomChange(Math.min(3, zoom + 0.2))}
                  className="w-10 h-10 max-h-10 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-primary-blue transition-colors border border-gray-100 shadow-sm"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
              </div>

              {/* Automatic White Background Removal Filter Toggle */}
              <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                <input
                  type="checkbox"
                  id="crop-remove-white-bg"
                  checked={removeWhiteBg}
                  onChange={(e) => setRemoveWhiteBg(e.target.checked)}
                  className="w-4.5 h-4.5 text-primary-blue rounded border-slate-200 focus:ring-primary-blue accent-primary-blue cursor-pointer"
                />
                <label htmlFor="crop-remove-white-bg" className="text-[10px] sm:text-[11px] font-bold uppercase text-slate-600 tracking-wider cursor-pointer leading-tight">
                  Tirar fundo branco da foto do craque automaticamente
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-gray-100 text-gray-600 hover:bg-gray-200 py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={cropAndSave}
                  className="flex-1 bg-primary-blue text-white hover:bg-blue-700 py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-blue-200 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 text-primary-yellow" />
                  Confirmar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
