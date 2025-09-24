<template>
  <div id="app-container">
    <h2 id="info">{{ infoText }}</h2>

    <div id="controls">
      <input
        type="file"
        id="fileInput"
        accept="image/*,image/heic,image/heif,video/*"
        multiple
        style="display: none"
        ref="fileInputRef"
        @change="handleFileChange"
      />
      <button
        id="authBtn"
        @click="handleAuth"
        v-show="authBtnVisible"
      >
        Авторизоваться
      </button>
      <button id="QUEUES" @click="checkQueues">
        Проверка очередей в трекере
      </button>
      <button id="selectBtn" :disabled="!isAuthorized" @click="selectFiles">
        Выбрать фотографии
      </button>
      <button
        id="uploadBtn"
        :disabled="!isAuthorized || filesToUpload.length === 0 || isUploading"
        @click="uploadFiles"
      >
        {{ isUploading ? 'Загрузка...' : 'Загрузить выбранные фото' }}
      </button>
    </div>

    <!-- Показываем предупреждение если есть -->
    <div v-if="warningMessage" class="warning-banner">
      ⚠️ {{ warningMessage }}
    </div>

    <div v-if="filesToUpload.length > 0" class="upload-summary">
      Выбрано файлов: {{ filesToUpload.length }} | 
      Загружено: {{ uploadedCount }} | 
      Ошибок: {{ errorCount }}
    </div>

    <div id="preview">
      <div v-for="(file, index) in filesToUpload" :key="`${file.name}-${index}`" class="thumb">
        <img v-if="file.thumbnail" :src="file.thumbnail" :alt="file.name" loading="lazy" />
        <div v-else class="icon-placeholder">📎</div>
        <div class="file-info" :title="file.name">{{ truncateFileName(file.name) }}</div>
        <div class="progress-container">
          <div
            class="progress-bar"
            :style="{ width: file.progress + '%' }"
          ></div>
        </div>
        <div :class="['status', file.statusClass]">{{ file.statusText }}</div>
      </div>
    </div>

    <pre id="output">{{ outputLog }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import type { Ref } from "vue";
// @ts-ignore
import { heicTo } from "heic-to";

const AUTH_URL = "/api/auth";
const GET_UPLOAD_URL = "/api/get-upload-url";

// Интерфейсы
interface UploadFile {
  file: File;
  name: string;
  progress: number;
  statusClass: 'waiting' | 'uploading' | 'success' | 'error';
  statusText: string;
  thumbnail: string | null;
}

interface QueueItem {
  name: string;
}

interface UploadUrlResponse {
  uploadUrl: string;
  newFileName: string;
  warning?: string;
}

// Реактивные переменные
const filesToUpload: Ref<UploadFile[]> = ref([]);
const outputLog = ref<string>("");
const isAuthorized = ref<boolean>(false);
const authBtnVisible = ref<boolean>(true);
const infoText = ref<string>("Вы загружаете фотографии на общий диск");
const isUploading = ref<boolean>(false);
const warningMessage = ref<string>("");

const fileInputRef = ref<HTMLInputElement | null>(null);

// Вычисляемые свойства
const uploadedCount = computed(() => 
  filesToUpload.value.filter(f => f.statusClass === 'success').length
);

const errorCount = computed(() => 
  filesToUpload.value.filter(f => f.statusClass === 'error').length
);

// Константы из URL/sessionStorage
let folderName: string = "Фото";
let subfolderName: string = "Новая папка";

// MIME типы для быстрой проверки
const HEIC_SIGNATURES = [
  "ftypheic", "ftypheif", "ftypheix", "ftyphevc", 
  "ftyphevx", "ftypmif1", "ftypmsf1"
];

// Утилиты
const log = (msg: string): void => {
  console.log(msg);
  outputLog.value += msg + "\n";
};

const truncateFileName = (name: string, maxLength: number = 25): string => {
  if (name.length <= maxLength) return name;
  const ext = name.split('.').pop();
  const nameWithoutExt = name.slice(0, name.lastIndexOf('.'));
  const truncated = nameWithoutExt.slice(0, maxLength - (ext?.length || 0) - 4) + '...';
  return ext ? `${truncated}.${ext}` : truncated;
};

// Инициализация при загрузке
onMounted(() => {
  initializeFromUrl();
  checkAuthStatus();
});

const initializeFromUrl = (): void => {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.has("folder") || urlParams.has("subfolder")) {
    const data = {
      folder: urlParams.get("folder"),
      subfolder: urlParams.get("subfolder"),
    };
    sessionStorage.setItem("uploadData", JSON.stringify(data));
  }

  const storedData = sessionStorage.getItem("uploadData");
  if (storedData) {
    try {
      const data = JSON.parse(storedData);
      folderName = data.folder || folderName;
      subfolderName = data.subfolder || subfolderName;
    } catch (e) {
      console.error("Ошибка парсинга данных из sessionStorage:", e);
    }
  }
  
  infoText.value = `Вы загружаете файлы в папку "${folderName}" под именем "${subfolderName}-***"`;
};

// Авторизация
const checkAuthStatus = async (): Promise<void> => {
  try {
    const res = await fetch(AUTH_URL, { method: "HEAD" });
    if (res.ok) {
      log("✅ Авторизация успешна!");
      authBtnVisible.value = false;
      isAuthorized.value = true;
    } else {
      log("⚠️ Требуется авторизация.");
      authBtnVisible.value = true;
      isAuthorized.value = false;
    }
  } catch (err) {
    log("❌ Произошла ошибка при проверке авторизации.");
    authBtnVisible.value = true;
    isAuthorized.value = false;
  }
};

const handleAuth = (): void => {
  log("Инициируем авторизацию...");
  window.location.href = AUTH_URL;
};

// Проверка очередей
const checkQueues = async (): Promise<void> => {
  try {
    const res = await fetch("/api/get-queues", { method: "GET" });
    if (!res.ok) {
      log("⚠️ Ошибка получения очередей");
      return;
    }

    const data: QueueItem[] = await res.json();
    const names = data.map((item) => item.name);
    log(`✅ Очереди получены:`);
    log(JSON.stringify(names, null, 2));
  } catch (err) {
    log("❌ Произошла ошибка работы с трекером");
    console.error(err);
  }
};

// Работа с файлами
const selectFiles = (): void => {
  fileInputRef.value?.click();
};

// Оптимизированная проверка HEIC
const isReallyHeic = async (file: File): Promise<boolean> => {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = new TextDecoder().decode(header);
  return HEIC_SIGNATURES.some(sig => ascii.includes(sig));
};

// const getFileFormat = async (file: File): Promise<string> => {
//   const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
//   const ascii = new TextDecoder().decode(header);

//   // Быстрая проверка по сигнатурам
//   if (HEIC_SIGNATURES.some(sig => ascii.includes(sig))) return "heic";
//   if (header[0] === 0xff && header[1] === 0xd8) return "jpeg";
//   if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) return "png";
//   if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) return "gif";
//   if (ascii.includes("ftypmp4")) return "mp4";

//   return file.type.split("/")[1] || "unknown";
// };

const replaceExtension = (filename: string, newExt: string): string => {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(0, idx) + "." + newExt : filename + "." + newExt;
};

const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true; // Добавляем для автоплея

    const videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;

    const cleanup = () => URL.revokeObjectURL(videoUrl);

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.1); // 10% от длительности или 1 сек
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 800); // Ограничиваем размер
        canvas.height = Math.min(video.videoHeight, 600);
        
        const context = canvas.getContext("2d");
        if (!context) {
          cleanup();
          reject(new Error("Не удалось получить контекст canvas"));
          return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7); // Сжимаем
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Ошибка создания превью видео."));
    };

    // Таймаут на случай зависания
    setTimeout(() => {
      cleanup();
      reject(new Error("Таймаут создания превью"));
    }, 10000);
  });
};

const handleFileChange = async (event: Event): Promise<void> => {
  const files = Array.from((event.target as HTMLInputElement).files || []);
  if (files.length === 0) return;

  filesToUpload.value = [];
  warningMessage.value = ""; // Сбрасываем предупреждение

  log(`Начинаем обработку ${files.length} файлов...`);

  // Обрабатываем файлы параллельно, но с ограничением
  const BATCH_SIZE = 3;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(file => processFile(file))
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        filesToUpload.value.push(result.value);
      } else if (result.status === 'rejected') {
        log(`❌ Ошибка обработки файла "${batch[idx].name}": ${result.reason}`);
      }
    });
  }

  log(`Обработано файлов: ${filesToUpload.value.length}/${files.length}`);
};

const processFile = async (file: File): Promise<UploadFile | null> => {
  try {
    let fileToUpload: File = file;
    let thumbnail: string | null = null;

    // Исправляем имя файла если нужно
    let newFileName = file.name;
    
    if (newFileName.lastIndexOf(".") === -1) {
      log(`Добавляем расширение к файлу: ${newFileName}`);
      if (file.type === "image/jpeg") {
        newFileName = newFileName + ".jpeg";
      }
    }

    // Конвертация HEIC
    if (await isReallyHeic(file)) {
      log(`🔄 Конвертируем HEIC: "${file.name}"`);
      try {
        const jpegBlob = await heicTo({
          blob: file,
          type: "image/jpeg",
          quality: 0.9,
        });
        
        if (jpegBlob) {
          fileToUpload = new File(
            [jpegBlob],
            replaceExtension(file.name, "jpg"),
            { type: "image/jpeg" }
          );
          log(`✅ Конвертирован: "${fileToUpload.name}"`);
        }
      } catch (err) {
        log(`❌ Ошибка конвертации HEIC "${file.name}": ${err}`);
      }
    }

    // Создаем финальный файл
    const cleanFile = new File([fileToUpload], newFileName, {
      type: fileToUpload.type,
    });

    // Создаем превью
    if (cleanFile.type.startsWith("image/")) {
      thumbnail = await createImageThumbnail(cleanFile);
    } else if (cleanFile.type.startsWith("video/")) {
      try {
        thumbnail = await createVideoThumbnail(cleanFile);
      } catch (e) {
        log(`⚠️ Не удалось создать превью для видео "${cleanFile.name}"`);
      }
    }

    return {
      file: cleanFile,
      name: cleanFile.name,
      progress: 0,
      statusClass: 'waiting',
      statusText: "⏳ Ожидает",
      thumbnail,
    };
  } catch (err) {
    console.error(`Ошибка обработки файла "${file.name}":`, err);
    return null;
  }
};

const createImageThumbnail = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => {
      log(`❌ Ошибка чтения файла "${file.name}" для превью`);
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
};

// Загрузка файлов
const uploadFiles = async (): Promise<void> => {
  if (filesToUpload.value.length === 0) {
    log("Нет файлов для загрузки.");
    return;
  }

  isUploading.value = true;
  log(`Начинаем загрузку ${filesToUpload.value.length} файлов...`);

  try {
    for (const fileItem of filesToUpload.value) {
      if (fileItem.statusClass === 'success') continue; // Пропускаем уже загруженные

      await uploadSingleFile(fileItem);
    }
  } finally {
    isUploading.value = false;
    // Очищаем input
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
    log(`Загрузка завершена. Успешно: ${uploadedCount.value}, Ошибок: ${errorCount.value}`);
  }
};

const uploadSingleFile = async (fileItem: UploadFile): Promise<void> => {
  try {
    fileItem.statusClass = 'uploading';
    fileItem.statusText = "⬆ Загрузка...";
    fileItem.progress = 0;

    // Получаем URL для загрузки
    const getUrlRes = await fetch(GET_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: fileItem.file.name,
        fileType: fileItem.file.type,
        folder: folderName,
        newNameForFile: subfolderName,
      }),
    });

    if (!getUrlRes.ok) {
      const errorText = await getUrlRes.text();
      throw new Error(`Ошибка получения URL: ${getUrlRes.status} ${errorText}`);
    }

    const { uploadUrl, newFileName, warning }: UploadUrlResponse = await getUrlRes.json();

    // Обрабатываем предупреждение (показываем только один раз)
    if (warning && !warningMessage.value) {
      warningMessage.value = warning;
      log(`⚠️ ${warning}`);
    }

    // Загружаем файл
    await uploadFileToYandex(fileItem, uploadUrl);

    log(`✅ "${fileItem.file.name}" → "${newFileName}"`);
    fileItem.statusClass = 'success';
    fileItem.statusText = "✅ Загружено";
    fileItem.progress = 100;

  } catch (err: any) {
    log(`❌ Ошибка загрузки "${fileItem.name}": ${err.message}`);
    fileItem.statusClass = 'error';
    fileItem.statusText = "❌ Ошибка";
    fileItem.progress = 100;
  }
};

const uploadFileToYandex = (fileItem: UploadFile, uploadUrl: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        fileItem.progress = Math.round((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Сетевая ошибка"));
    xhr.ontimeout = () => reject(new Error("Таймаут загрузки"));

    xhr.timeout = 300000; // 5 минут
    xhr.send(fileItem.file);
  });
};
</script>

<style scoped>
body {
  font-family: Arial, sans-serif;
  padding: 15px;
  margin: 0;
  background: #fafafa;
  color: #333;
}

h2 {
  font-size: 1.2rem;
  margin-bottom: 15px;
  text-align: center;
}

#controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 15px;
}

button {
  padding: 10px 16px;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  background: #4a90e2;
  color: white;
  font-size: 0.9rem;
  flex: 1 1 auto;
  max-width: 220px;
  transition: background-color 0.2s;
}

button:hover:not(:disabled) {
  background: #357abd;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.warning-banner {
  background: #fff3cd;
  color: #856404;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #ffeaa7;
  margin-bottom: 15px;
  text-align: center;
  font-weight: 500;
}

.upload-summary {
  background: #e8f4f8;
  color: #31708f;
  padding: 10px;
  border-radius: 6px;
  text-align: center;
  margin-bottom: 15px;
  font-size: 0.9rem;
}

#preview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 15px;
  margin-top: 10px;
}

.thumb {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s;
}

.thumb:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.thumb img {
  width: 180px;
  height: auto;
  max-height: 180px;
  object-fit: cover;
  border-radius: 6px;
  margin-bottom: 8px;
}

.icon-placeholder {
  font-size: 50px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-info {
  font-size: 0.85rem;
  text-align: center;
  margin-bottom: 6px;
  word-break: break-word;
}

.progress-container {
  width: 100%;
  background: #eee;
  border-radius: 6px;
  overflow: hidden;
  height: 8px;
  margin-bottom: 6px;
}

.progress-bar {
  height: 100%;
  width: 0%;
  background: #4a90e2;
  transition: width 0.3s ease;
}

.status {
  font-size: 0.85rem;
  font-weight: bold;
  text-align: center;
}

.status.waiting {
  color: #888;
}

.status.uploading {
  color: #e69500;
}

.status.success {
  color: #2d9d2d;
}

.status.error {
  color: #d93025;
}

#output {
  background: #f4f4f4;
  padding: 10px;
  overflow-x: auto;
  font-size: 0.8rem;
  white-space: pre-wrap;
  border-radius: 6px;
  margin-top: 20px;
  max-height: 300px;
  overflow-y: auto;
}
</style>