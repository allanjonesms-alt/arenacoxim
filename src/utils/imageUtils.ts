/**
 * Utility functions for image compression and optimization to prevent exceeding
 * Firestore document size limits (1 MB = 1,048,576 bytes).
 */

export async function compressBase64Image(
  dataUrl: string,
  maxDimension = 280,
  maxKb = 100
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl; // Not a base64 image data URL (could be an http/https URL or empty)
  }

  // Calculate current approximate size in KB
  const currentKb = Math.round((dataUrl.length * 3) / 4 / 1024);
  
  // If already small enough (under maxKb), return as is
  if (currentKb <= maxKb) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // Scale down dimensions if needed
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const isPng = dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/webp');
        let compressedUrl = '';

        if (isPng) {
          // Always keep PNG or WebP format for transparency support
          compressedUrl = canvas.toDataURL('image/png');
          
          // Downscale canvas further if still above maxKb
          let curW = width;
          let curH = height;
          while ((compressedUrl.length * 3) / 4 / 1024 > maxKb && curW > 80) {
            curW = Math.round(curW * 0.8);
            curH = Math.round(curH * 0.8);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = curW;
            tempCanvas.height = curH;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCtx.drawImage(canvas, 0, 0, curW, curH);
              compressedUrl = tempCanvas.toDataURL('image/png');
            } else {
              break;
            }
          }
        } else {
          // Standard JPEG compression for non-PNG images
          compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
        }

        // Final check on size; if JPEG is still slightly above maxKb, lower quality
        let quality = 0.8;
        while ((compressedUrl.length * 3) / 4 / 1024 > maxKb && quality > 0.3 && !compressedUrl.startsWith('data:image/png')) {
          quality -= 0.15;
          compressedUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(compressedUrl);
      } catch (err) {
        console.error("Error compressing base64 image:", err);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

export async function compressFileToDataUrl(
  file: File,
  maxDimension = 256,
  maxKb = 80
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      if (!result) {
        reject(new Error("Falha ao ler o arquivo."));
        return;
      }
      try {
        const compressed = await compressBase64Image(result, maxDimension, maxKb);
        resolve(compressed);
      } catch (err) {
        resolve(result);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
