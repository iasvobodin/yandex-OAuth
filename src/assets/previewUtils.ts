import heic2any from "heic2any";

// Типы
export interface UploadFile {
  file: File;
  name: string;
  progress: number;
  statusClass: string;
  statusText: string;
  thumbnail: string | null;
  uploaded?: boolean;
  serverSavedAs?: string;
  error?: string;
}

// Проверка типа файла
export const isImageFile = (file: File): boolean => {
  const ext = file.name.toLowerCase();
  return [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".heic",
    ".heif",
  ].some((e) => ext.endsWith(e));
};

export const isHEICFile = (file: File): boolean => {
  const ext = file.name.toLowerCase();
  const mime = file.type || "image/heic"; // Fallback MIME-тип
  return (
    ext.endsWith(".heic") ||
    ext.endsWith(".heif") ||
    mime.includes("heic") ||
    mime.includes("heif")
  );
};

// Превью для обычных изображений
export const createImageThumbnail = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      console.log(
        `FileReader result for ${file.name}: ${result.slice(0, 50)}...`
      ); // Дополнительное логирование
      const img = new Image();
      img.onload = () => {
        const maxSize = 200;
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject("Canvas ctx error");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject("Image load error");
      img.src = result;
    };
    reader.onerror = () => reject("File read error");
    reader.readAsDataURL(file);
  });

// Проверка поддержки HEIC в браузере
export const testHEICSupport = async (file: File): Promise<boolean> => {
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
};

// Превью для HEIC/HEIF
export const createImageThumbnailHEIC = async (
  file: File,
  log: (msg: string) => void
): Promise<string> => {
  try {
    // Сначала проверяем нативную поддержку
    if (await testHEICSupport(file)) {
      log(
        `HEIC файл ${file.name} поддерживается нативно, используем createImageBitmap`
      );
      const bitmap = await createImageBitmap(file);
      const maxSize = 200;
      let { width, height } = bitmap;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context for HEIC");
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.7);
    }

    // Fallback на heic2any
    log(
      `HEIC файл ${file.name} не поддерживается нативно, используем heic2any`
    );
    const conversionResult = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 1,
    });
    let jpegBlob: Blob = Array.isArray(conversionResult)
      ? conversionResult[0]
      : conversionResult;
    const jpegFile = new File(
      [jpegBlob],
      file.name.replace(/\.heic?$/i, ".jpg"),
      {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }
    );
    return await createImageThumbnail(jpegFile);
  } catch (error) {
    log(
      `⚠️ Ошибка обработки HEIC ${file.name}: ${JSON.stringify(error, null, 2)}`
    );
    // Попробовать стандартное создание
    try {
      return await createImageThumbnail(file);
    } catch (standardError) {
      log(`⚠️ Стандартное создание превью HEIC не удалось: ${standardError}`);
    }
    // Final fallback
    return createFallbackThumbnail("HEIC");
  }
};

// Упрощённое превью для видео с несколькими попытками
export const createVideoThumbnail = (
  file: File,
  log: (msg: string) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const seekTimes = [0.1, 0.5, 1.5, 3];
    let currentSeekIndex = 0;

    const trySeek = () => {
      if (currentSeekIndex >= seekTimes.length) {
        cleanup();
        reject(new Error("No valid video frame found"));
        return;
      }
      video.currentTime = seekTimes[currentSeekIndex];
    };

    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, 1, 1).data;
        if (imageData[3] !== 0) {
          // Не пустой кадр
          const maxSize = 200;
          let width = canvas.width;
          let height = canvas.height;
          if (width > maxSize || height > maxSize) {
            const scaledCanvas = document.createElement("canvas");
            const scaledCtx = scaledCanvas.getContext("2d");
            if (!scaledCtx) throw new Error("No scaled canvas context");
            if (width > height && width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
            scaledCanvas.width = width;
            scaledCanvas.height = height;
            scaledCtx.drawImage(canvas, 0, 0, width, height);
            resolve(scaledCanvas.toDataURL("image/jpeg", 0.7));
          } else {
            resolve(canvas.toDataURL("image/jpeg", 0.7));
          }
          cleanup();
        } else {
          log(
            `⚠️ Пустой кадр на ${seekTimes[currentSeekIndex]} сек для ${file.name}`
          );
          currentSeekIndex++;
          trySeek();
        }
      } catch (err) {
        log(`⚠️ Ошибка захвата кадра: ${err}`);
        currentSeekIndex++;
        trySeek();
      }
    });

    video.addEventListener("loadeddata", trySeek);
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Video loading error"));
    });

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Video load timeout"));
    }, 15000); // Увеличенный таймаут

    function cleanup() {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(url);
      video.remove();
    }
  });
};

// Fallback превью
export const createFallbackThumbnail = (
  type: "IMAGE" | "VIDEO" | "HEIC" | "FILE"
): string => {
  const text =
    type === "VIDEO"
      ? "VIDEO"
      : type === "HEIC"
      ? "HEIC"
      : type === "IMAGE"
      ? "IMG"
      : "FILE";
  const color =
    type === "VIDEO"
      ? "#ff6b6b"
      : type === "HEIC"
      ? "#4ecdc4"
      : type === "IMAGE"
      ? "#45b7d1"
      : "#96ceb4";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="${color}" opacity="0.2"/>
      <rect x="10" y="10" width="180" height="180" fill="none" stroke="${color}" stroke-width="2"/>
      <text x="50%" y="50%" font-size="24" text-anchor="middle" fill="${color}" dy=".3em" font-family="Arial, sans-serif">${text}</text>
    </svg>
  `;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
};
