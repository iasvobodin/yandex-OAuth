<template>
  <div id="app-container">
    <h2 id="info">{{ infoText }}</h2>

    <div id="controls">
      <input
        type="file"
        id="fileInput"
        accept="image/*,video/*"
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
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Ref } from 'vue';

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
  filesToUpload.value = [];

  for (const file of files) {
    log(`Обработка файла: ${file.name}, тип: ${file.type}, размер: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    try {
      let thumbnail: string | null = null;

      if (file.type.startsWith('image/') || isImageFile(file)) {
        try {
          // HEIC: сначала пробуем создать превью нативно
          if (isHEICFile(file)) {
            log(`Обнаружен HEIC/HEIF файл: ${file.name}`);
            try {
              thumbnail = await createImageThumbnailHEIC(file);
            } catch (e) {
              log(`⚠️ HEIC preview failed: ${e}`);
              thumbnail = null;
            }
          } else {
            thumbnail = await createImageThumbnail(file);
          }
        } catch (e) {
          log(`⚠️ Ошибка при создании превью изображения: ${e}`);
          thumbnail = null;
        }
      } else if (file.type.startsWith('video/')) {
        try {
          thumbnail = await createVideoThumbnail(file);
        } catch (e) {
          log(`⚠️ Не удалось создать превью для видео: ${e}`);
          thumbnail = null;
        }
      }

      filesToUpload.value.push({
        file,
        name: file.name,
        progress: 0,
        statusClass: 'waiting',
        statusText: '⏳ Ожидает',
        thumbnail,
      });
    } catch (err) {
      log(`❌ Критическая ошибка при обработке файла "${file.name}": ${err}`);
    }
  }

  target.value = '';
};

const isImageFile = (file: File): boolean => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'];
  const fileName = file.name.toLowerCase();
  return imageExtensions.some(ext => fileName.endsWith(ext));
};

const isHEICFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
};

// try native createImageBitmap (works in some browsers for HEIC), fallback to DataURL->Image canvas approach
const createImageThumbnailHEIC = async (file: File): Promise<string> => {
  // Попробуем createImageBitmap (может работать в iOS Safari)
  try {
    if (('createImageBitmap' in window)) {
      const bitmap = await (window as any).createImageBitmap(file);
      const maxSize = 200;
      let width = bitmap.width;
      let height = bitmap.height;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Нет context 2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.7);
    }
  } catch (e) {
    console.warn('createImageBitmap для HEIC не сработал:', e);
  }

  // fallback: попробовать прочитать как DataURL (если браузер может декодировать)
  return createImageThumbnail(file);
};

const createImageThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxSize = 200;
          let { width, height } = img;

          if (width > height) {
            if (width > maxSize) {
              height = (height * maxSize) / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = (width * maxSize) / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Не удалось получить контекст canvas');
          }

          // белый фон на случай прозрачности
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Ошибка загрузки изображения для превью'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
};

const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    let resolved = false;
    const cleanup = () => {
      URL.revokeObjectURL(video.src);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    const onLoadedMetadata = () => {
      try {
        // выбираем время кадра: 0.5s или 1/4 продолжительности
        const t = Math.min(0.5, (video.duration || 0.5) / 4);
        video.currentTime = t;
      } catch (e) {
        // safari может кидать
        onSeeked();
      }
    };

    const onSeeked = () => {
      if (resolved) return;
      try {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
        canvas.width = Math.min(w, 800);
        canvas.height = Math.min(h, 800);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Нет context 2d для видео');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolved = true;
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onError = () => {
      cleanup();
      if (!resolved) {
        reject(new Error('Ошибка при создании превью видео'));
      }
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    video.src = URL.createObjectURL(file);

    // safety timeout: если кадр не получен за 3 с — откл.
    setTimeout(() => {
      if (!resolved) {
        try { onSeeked(); } catch(e) { /* ignore */ }
      }
    }, 3500);
  });
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

// Загрузка файлов — параллельно или последовательно (здесь последовательная, чтобы не создавать много одновременных XHR)
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
    xhr.responseType = 'json';

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

// check queues (оставил как было)
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
.thumb img { width: 180px; height: auto; border-radius: 6px; margin-bottom: 8px; }
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
