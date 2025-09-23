<template>
  <div id="app-container">
    <h2 id="info">{{ infoText }}</h2>

    <div id="controls">
      <input
        type="file"
        id="fileInput"
        accept="image/*,video/*,.heic,.heif"
        multiple
        capture="environment"
        style="display: none"
        ref="fileInputRef"
        @change="handleFileChange"
      />
      <button id="authBtn" @click="handleAuth" :style="{ display: authBtnVisible ? 'block' : 'none' }">
        Авторизоваться
      </button>
      <button id="QUEUES" @click="checkQueues">
        Проверка очередей в трекере
      </button>
      <button id="selectBtn" :disabled="!isAuthorized" @click="selectFiles">Выбрать фотографии</button>
      <button
        :disabled="!isAuthorized || filesToUpload.length === 0"
        @click="startUpload"
      >
        Загрузить выбранные фото
      </button>
    </div>

    <div id="preview">
      <div v-for="(file, index) in filesToUpload" :key="index" class="thumb">
        <img v-if="file.thumbnail" :src="file.thumbnail" alt="thumbnail" />
        <div v-else class="icon-placeholder">📎</div>
        <div class="file-info">{{ file.name }}</div>
        <div class="progress-container">
          <div class="progress-bar" :style="{ width: file.progress + '%' }"></div>
        </div>
        <div :class="['status', file.statusClass]">{{ file.statusText }}</div>
      </div>
    </div>

    <pre id="output">{{ outputLog }}</pre>
  </div>
<UploadComponent/>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Ref } from 'vue';
import heic2any from 'heic2any';
import UploadComponent from './components/UploadComponent.vue';

interface UploadFile {
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

const filesToUpload: Ref<UploadFile[]> = ref([]);
const outputLog = ref<string>('');
const isAuthorized = ref<boolean>(false);
const authBtnVisible = ref<boolean>(true);
const infoText = ref<string>('Вы загружаете фотографии на общий диск');
const fileInputRef = ref<HTMLInputElement | null>(null);

let folderName: string = 'Фото';
let subfolderName: string = 'Новая папка';

const log = (msg: string) => {
  outputLog.value += msg + '\n';
  console.log(msg);
};

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('folder') || urlParams.has('subfolder')) {
    const data = {
      folder: urlParams.get('folder'),
      subfolder: urlParams.get('subfolder'),
    };
    sessionStorage.setItem('uploadData', JSON.stringify(data));
  }

  const storedData = sessionStorage.getItem('uploadData');
  if (storedData) {
    const data = JSON.parse(storedData);
    folderName = data.folder || folderName;
    subfolderName = data.subfolder || subfolderName;
  }
  infoText.value = `Вы загружаете файлы в папку "${folderName}" под именем "${subfolderName}-***"`;

  checkAuthStatus();
});

// простая HEAD-проверка авторизации
const AUTH_URL = '/api/auth';
const checkAuthStatus = async () => {
  try {
    const res = await fetch(AUTH_URL, { method: 'HEAD' });
    if (res.ok) {
      log('✅ Авторизация успешна!');
      authBtnVisible.value = false;
      isAuthorized.value = true;
    } else {
      log('⚠️ Требуется авторизация.');
      authBtnVisible.value = true;
      isAuthorized.value = false;
    }
  } catch (err) {
    log('❌ Произошла ошибка при проверке авторизации.');
    authBtnVisible.value = true;
    isAuthorized.value = false;
  }
};

const handleAuth = (): void => {
  log('Инициируем авторизацию...');
  window.location.href = AUTH_URL;
};

const selectFiles = (): void => {
  fileInputRef.value?.click();
};

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);

  if (files.length === 0) {
    log('Файлы не выбраны');
    return;
  }

  log(`Выбрано файлов: ${files.length}`);
  
  // Очищаем предыдущие файлы только если выбираем новые
  filesToUpload.value = [];

  for (const file of files) {
    log(`Обработка файла: ${file.name}, тип: ${file.type}, размер: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    try {
      let thumbnail: string | null = null;

      // Создаем базовый объект файла
      const uploadFile: UploadFile = {
        file,
        name: file.name,
        progress: 0,
        statusClass: 'waiting',
        statusText: '⏳ Ожидает',
        thumbnail: null,
      };

      filesToUpload.value.push(uploadFile);

      // Асинхронно создаем превью
      if (file.type.startsWith('image/') || isImageFile(file)) {
        try {
          if (isHEICFile(file)) {
            log(`Обнаружен HEIC/HEIF файл: ${file.name}`);
            thumbnail = await createImageThumbnailHEIC(file);
          } else {
            thumbnail = await createImageThumbnail(file);
          }
        } catch (e) {
          log(`⚠️ Ошибка при создании превью изображения: ${e}`);
          thumbnail = await createFallbackThumbnail(file.type.includes('video') ? 'VIDEO' : 'IMAGE');
        }
      } else if (file.type.startsWith('video/')) {
        try {
          thumbnail = await createVideoThumbnail(file);
        } catch (e) {
          log(`⚠️ Не удалось создать превью для видео: ${e}`);
          thumbnail = await createFallbackThumbnail('VIDEO');
        }
      } else {
        thumbnail = await createFallbackThumbnail('FILE');
      }

      // Обновляем превью для конкретного файла
      const fileIndex = filesToUpload.value.findIndex(f => f.file === file);
      if (fileIndex !== -1) {
        filesToUpload.value[fileIndex].thumbnail = thumbnail;
      }

    } catch (err) {
      log(`❌ Критическая ошибка при обработке файла "${file.name}": ${err}`);
    }
  }

  target.value = '';
};

// === Определение типа файла ===
const isImageFile = (file: File): boolean => {
  const ext = file.name.toLowerCase();
  return ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.heic','.heif'].some(e => ext.endsWith(e));
};

const isHEICFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith('.heic') ||
  file.name.toLowerCase().endsWith('.heif') ||
  file.type.includes('heic') ||
  file.type.includes('heif');

// === Превью для обычных изображений ===
const createImageThumbnail = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas ctx error');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => reject('Image load error');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject('File read error');
    reader.readAsDataURL(file);
  });

// === Превью для HEIC/HEIF с использованием heic2any ===
const createImageThumbnailHEIC = async (file: File): Promise<string> => {
  try {
    // Конвертируем HEIC/HEIF в JPEG используя heic2any
    const conversionResult = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 1, // Качество JPEG (0.0 - 1.0)
    });

    // heic2any возвращает Blob или массив Blob
    let jpegBlob: Blob;
    if (Array.isArray(conversionResult)) {
      jpegBlob = conversionResult[0]; // Берем первый Blob если вернулся массив
    } else {
      jpegBlob = conversionResult;
    }

    // Создаем File из Blob для единообразия
    const jpegFile = new File([jpegBlob], file.name.replace(/\.heic?$/i, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified
    });

    // Используем стандартную функцию создания превью для JPEG
    return await createImageThumbnail(jpegFile);

  } catch (conversionError) {
 log(`⚠️ Ошибка конвертации HEIC в JPEG: ${JSON.stringify(conversionError, null, 2)}`);
    
    // Fallback 1: Пробуем createImageBitmap если конвертация не удалась
    try {
      if ('createImageBitmap' in window) {
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
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context for HEIC fallback');
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.7);
      }
    } catch (bitmapError) {
      log(`⚠️ createImageBitmap fallback также не удался: ${bitmapError}`);
    }

    // Fallback 2: Пробуем как обычное изображение (может сработать в некоторых браузерах)
    try {
      return await createImageThumbnail(file);
    } catch (standardError) {
      log(`⚠️ Стандартное создание превью также не удалось: ${standardError}`);
    }

    // Final Fallback: Возвращаем красивую иконку HEIC
    return createFallbackThumbnail('HEIC');
  }
};

// === Исправленная функция превью для видео ===
const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous'; // Важно для CORS

    let isSuccess = false;
    let isError = false;

    const cleanup = () => {
      if (!isSuccess) {
        URL.revokeObjectURL(url);
      }
      video.remove();
    };

    const onSuccess = (canvas: HTMLCanvasElement) => {
      if (isSuccess || isError) return;
      isSuccess = true;
      
      try {
        // Масштабируем если нужно
        const maxSize = 200;
        let { width, height } = canvas;
        
        if (width > maxSize || height > maxSize) {
          const scaledCanvas = document.createElement('canvas');
          const scaledCtx = scaledCanvas.getContext('2d');
          if (!scaledCtx) throw new Error('No scaled canvas context');
          
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
          resolve(scaledCanvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    };

    const onError = (error: string) => {
      if (isSuccess || isError) return;
      isError = true;
      cleanup();
      reject(new Error(error));
    };

video.addEventListener('loadeddata', async () => {
  const seekTimes = [0.1, 0.5, 1.5, 3];
  for (const seekTime of seekTimes) {
    try {
      video.currentTime = seekTime;
      await new Promise((res) => video.addEventListener('seeked', res, { once: true }));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, 1, 1).data;
      if (imageData[3] !== 0) {
        onSuccess(canvas);
        return;
      }
    } catch (err) {
      log(`⚠️ Пропущен кадр на ${seekTime} сек: ${err}`);
    }
  }
  onError('No valid video frame found');
});

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          onError('No canvas context available');
          return;
        }

        // Рисуем видео на canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Проверяем что canvas не пустой
        const imageData = ctx.getImageData(0, 0, 1, 1).data;
        if (imageData[3] === 0) { // Если альфа-канал прозрачный
          onError('Video frame is empty');
          return;
        }

        onSuccess(canvas);
      } catch (err) {
        onError(`Error drawing video frame: ${err}`);
      }
    });

    video.addEventListener('error', () => {
      onError('Video loading error');
    });

    video.addEventListener('canplay', () => {
      // Пытаемся воспроизвести чтобы активировать декодирование
      video.play().catch(() => {
        // Игнорируем ошибки autoplay, это нормально
      });
    });

    // Таймаут на случай если видео не загрузится
    const timeoutId = setTimeout(() => {
      onError('Video load timeout');
    }, 10000);

    // Очистка таймаута при успехе/ошибке
    const clearTimeoutSafe = () => {
      if (timeoutId) clearTimeout(timeoutId);
    };

    video.addEventListener('loadeddata', clearTimeoutSafe);
    video.addEventListener('error', clearTimeoutSafe);
  });
};

// === Альтернативная упрощенная версия для видео ===
// const createVideoThumbnailSimple = (file: File): Promise<string> => {
//   return new Promise((resolve, reject) => {
//     const video = document.createElement('video');
//     const url = URL.createObjectURL(file);
    
//     video.src = url;
//     video.muted = true;
//     video.playsInline = true;
//     video.currentTime = 1; // Берем кадр на 1 секунде

//     video.onseeked = () => {
//       try {
//         const canvas = document.createElement('canvas');
//         canvas.width = video.videoWidth;
//         canvas.height = video.videoHeight;
//         const ctx = canvas.getContext('2d');
        
//         if (ctx) {
//           ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
//           // Масштабируем
//           const maxSize = 200;
//           let width = canvas.width;
//           let height = canvas.height;
          
//           if (width > maxSize || height > maxSize) {
//             const scaledCanvas = document.createElement('canvas');
//             const scaledCtx = scaledCanvas.getContext('2d');
//             if (scaledCtx) {
//               if (width > height && width > maxSize) {
//                 height = Math.round((height * maxSize) / width);
//                 width = maxSize;
//               } else if (height > maxSize) {
//                 width = Math.round((width * maxSize) / height);
//                 height = maxSize;
//               }
              
//               scaledCanvas.width = width;
//               scaledCanvas.height = height;
//               scaledCtx.drawImage(canvas, 0, 0, width, height);
//               resolve(scaledCanvas.toDataURL('image/jpeg', 0.7));
//             } else {
//               resolve(canvas.toDataURL('image/jpeg', 0.7));
//             }
//           } else {
//             resolve(canvas.toDataURL('image/jpeg', 0.7));
//           }
//         } else {
//           reject(new Error('No canvas context'));
//         }
//       } catch (err) {
//         reject(err);
//       } finally {
//         URL.revokeObjectURL(url);
//       }
//     };

//     video.onerror = () => {
//       URL.revokeObjectURL(url);
//       reject(new Error('Video error'));
//     };

//     // Таймаут
//     setTimeout(() => {
//       if (video.readyState < 2) { // HAVE_CURRENT_DATA
//         URL.revokeObjectURL(url);
//         reject(new Error('Video load timeout'));
//       }
//     }, 5000);
//   });
// };

// === Fallback превью ===
const createFallbackThumbnail = (type: 'IMAGE' | 'VIDEO' | 'HEIC' | 'FILE'): string => {
  const text = type === 'VIDEO' ? 'VIDEO' : 
               type === 'HEIC' ? 'HEIC' : 
               type === 'IMAGE' ? 'IMG' : 'FILE';
  
  const color = type === 'VIDEO' ? '#ff6b6b' : 
                type === 'HEIC' ? '#4ecdc4' : 
                type === 'IMAGE' ? '#45b7d1' : '#96ceb4';
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <rect width="100%" height="100%" fill="${color}" opacity="0.2"/>
      <rect x="10" y="10" width="180" height="180" fill="none" stroke="${color}" stroke-width="2"/>
      <text x="50%" y="50%" font-size="24" text-anchor="middle" fill="${color}" dy=".3em" font-family="Arial, sans-serif">${text}</text>
    </svg>
  `;
  
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
};

// Получаем upload href от сервера (сервер создаёт папку при необходимости)
async function getUploadHref(filename: string): Promise<{ href: string; path: string; savedAs: string }> {
  const resp = await fetch('/api/get-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder: folderName, subfolder: subfolderName, filename }),
    credentials: 'same-origin',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Ошибка получения upload URL: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data; // { href, path, savedAs }
}

// Загрузка файлов
const startUpload = async () => {
  if (!isAuthorized.value) {
    log('⚠️ Не авторизованы');
    return;
  }

  for (const f of filesToUpload.value) {
    if (f.uploaded) continue;
    f.statusClass = 'uploading';
    f.statusText = '⬆️ Получаем URL...';
    try {
      const { href, savedAs } = await getUploadHref(f.name);
      f.statusText = '⬆️ Загружаем...';
      await uploadDirectToYandex(href, f);
      f.uploaded = true;
      f.serverSavedAs = savedAs;
      f.statusClass = 'success';
      f.statusText = `✅ Загружен как ${savedAs}`;
      log(`Файл ${f.name} загружен как ${savedAs}`);
    } catch (err: any) {
      f.statusClass = 'error';
      f.statusText = `❌ Ошибка: ${err.message || err}`;
      f.error = String(err);
      log(`Ошибка загрузки ${f.name}: ${err}`);
    }
  }
};

// XHR PUT к upload.href, чтобы иметь прогресс
function uploadDirectToYandex(href: string, uploadFile: UploadFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', href, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        uploadFile.progress = percent;
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadFile.progress = 100;
        resolve();
      } else {
        reject(new Error(`Upload failed HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));

    xhr.send(uploadFile.file);
  });
}

// check queues
const checkQueues = async () => {
  try {
    const res = await fetch("/api/get-queues", { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      const names = data.map((item: any) => item.name);
      log(`✅ Очереди получены`);
      log(JSON.stringify(names, null, 2));
    } else {
      log('⚠️ что то не так при получении очередей');
    }
  } catch (err) {
    log('❌ Произошла Ошибка работы с трекером');
  }
};
</script>

<style scoped>
/* стили оставлены как в твоём шаблоне */
body {
  font-family: Arial, sans-serif;
  padding: 15px;
  margin: 0;
  background: #fafafa;
  color: #333;
}
h2 { font-size: 1.2rem; margin-bottom: 15px; text-align: center; }
#controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 15px; }
button { padding: 10px 16px; cursor: pointer; border: none; border-radius: 6px; background: #4a90e2; color: white; font-size: 0.9rem; flex: 1 1 auto; max-width: 220px; }
button:hover { background: #357abd; }
button:disabled { background: #ccc; cursor: not-allowed; }
#preview { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; margin-top: 10px; }
.thumb { display: flex; flex-direction: column; align-items: center; border: 1px solid #ccc; border-radius: 8px; padding: 10px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
.thumb img { width: 180px; height: 180px; object-fit: contain; border-radius: 6px; margin-bottom: 8px; background: #f5f5f5; }
.icon-placeholder { font-size: 50px; height: 150px; display: flex; align-items: center; justify-content: center; }
.file-info { font-size: 0.85rem; text-align: center; margin-bottom: 6px; word-break: break-word; }
.progress-container { width: 100%; background: #eee; border-radius: 6px; overflow: hidden; height: 8px; margin-bottom: 6px; }
.progress-bar { height: 100%; width: 0%; background: #4a90e2; transition: width 0.2s ease; }
.status { font-size: 0.85rem; font-weight: bold; text-align: center; }
.status.waiting { color: #888; }
.status.uploading { color: #e69500; }
.status.success { color: #2d9d2d; }
.status.error { color: #d93025; }
#output { background: #f4f4f4; padding: 10px; overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap; border-radius: 6px; margin-top: 20px; }
</style>