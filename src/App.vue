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
        :style="{ display: authBtnVisible ? 'block' : 'none' }"
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
        :disabled="!isAuthorized || filesToUpload.length === 0"
        @click="uploadFiles"
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
import { ref, onMounted } from "vue";
import type { Ref } from "vue";
// import heic2any from "heic2any";
// @ts-ignore
import { isHeic, heicTo } from "heic-to";

const AUTH_URL = "/api/auth";
const GET_UPLOAD_URL = "/api/get-upload-url";

// Интерфейс для типизации объектов файлов
interface UploadFile {
  file: File;
  name: string;
  progress: number;
  statusClass: string;
  statusText: string;
  thumbnail: string | null;
}

const filesToUpload: Ref<UploadFile[]> = ref([]);
const outputLog = ref<string>("");
const isAuthorized = ref<boolean>(false);
const authBtnVisible = ref<boolean>(true);
const infoText = ref<string>("Вы загружаете фотографии на общий диск");

const fileInputRef = ref<HTMLInputElement | null>(null);

let folderName: string = "Фото";
let subfolderName: string = "Новая папка";

// Логгирование
const log = (msg: string) => {
  outputLog.value += msg + "\n";
};

// Проверка статуса авторизации при загрузке страницы
onMounted(() => {
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
    const data = JSON.parse(storedData);
    folderName = data.folder || folderName;
    subfolderName = data.subfolder || subfolderName;
  }
  infoText.value = `Вы загружаете файлы в папку "${folderName}" под именем "${subfolderName}-***"`;

  checkAuthStatus();
});

// Авторизация и выбор файлов
const checkAuthStatus = async () => {
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
interface QueueItem {
  name: string;
  // добавьте другие свойства, которые вам нужны, чтобы избежать ошибок в будущем
}
// проверка очереди в трекере
const checkQueues = async () => {
  try {
    const res = await fetch("/api/get-queues", { method: "GET" });
    if (res.ok) {
      log(`✅ Очереди получены${JSON.stringify(res)}`);
    } else {
      log("⚠️ что то не так");
      return;
    }
    // Получаем данные в формате JSON
    const data: QueueItem[] = await res.json();
    const names = data.map((item) => item.name); // Ошибка исчезнет, так как item теперь имеет тип QueueItem
    // Теперь data содержит JSON-ответ, и его можно использовать
    log(`✅ Очереди получены`);
    log(JSON.stringify(names, null, 2)); // Выводим отформатированный JSON
  } catch (err) {
    log("❌ Произошла Ошибка работы с трекером");
  }
};

const handleAuth = (): void => {
  log("Инициируем авторизацию...");
  window.location.href = AUTH_URL;
};

const selectFiles = (): void => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
};

// src/utils/heicToJpeg.ts
// @ts-ignore — если нет типов
import initLibHeif from "libheif-js/wasm-bundle";

async function isReallyHeic(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = new TextDecoder().decode(header);
  return (
    ascii.includes("ftypheic") ||
    ascii.includes("ftypheif") ||
    ascii.includes("ftypheix") ||
    ascii.includes("ftyphevc") ||
    ascii.includes("ftyphevx") ||
    ascii.includes("ftypmif1") ||
    ascii.includes("ftypmsf1")
  );
}

// Вспомогательная функция для замены расширения
function replaceExtension(filename: string, newExt: string) {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(0, idx) + "." + newExt : filename + "." + newExt;
}

async function getFileFormat(file: File): Promise<string> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = new TextDecoder().decode(header);
  
  // Проверяем на известные сигнатуры (магические числа)
  if (ascii.includes("ftypheic") || ascii.includes("ftypheif") || ascii.includes("ftypheix")) {
    return 'heic';
  } else if (header[0] === 0xFF && header[1] === 0xD8) { // Проверка на JPEG
    return 'jpeg';
  } else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) { // Проверка на PNG
    return 'png';
  } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) { // Проверка на GIF
    return 'gif';
  } else if (ascii.includes("ftypmp4")) { // Проверка на MP4
      return 'mp4';
  }
  
  // Если не удалось определить по заголовку, возвращаем тип, который предоставил браузер
  return file.type.split('/')[1] || 'unknown';
}

const handleFileChange = async (event: Event) => {
  filesToUpload.value = [];
  const files = Array.from((event.target as HTMLInputElement).files || []);

  for (const file of files) {
    let fileToUpload: File = file;
    let thumbnail: string | null = null;



      // Шаг 1: Создаем новый File-объект с гарантированным расширением
        let newFileName = file.name;
        const ff = await getFileFormat(file)
        log(`ИМЯ ФАЙЛА ${newFileName|| 'НЕТ'}, ТИП ФАЙЛА ${file.type|| 'НЕТ'}, ${ff}`)
        // Проверяем, есть ли точка в имени файла
        if (newFileName.lastIndexOf('.') === -1) {
            // Если расширения нет, добавляем его на основе MIME-типа
            log('нет раcширения у файла')
            if (file.type === "image/jpeg") {
                newFileName = newFileName + '.jpeg';
            }
        }

    try {
      // Проверяем HEIC / HEIF и конвертируем
      if (await isReallyHeic(file)) {
        log(`⚠ Подозрение на HEIC: "${file.name}"`);
        try {
          const jpegBlob = await heicTo({
            blob: file,
            type: "image/jpeg",
            quality: 0.9,
          });
          if (jpegBlob) {
            fileToUpload = new File([jpegBlob], replaceExtension(file.name, "jpg"), {
              type: "image/jpeg",
            });
            log(`✅ Конвертирован в JPEG: "${fileToUpload.name}"`);
          } else {
            log(`❌ heic-to вернул null для "${file.name}", оставляем оригинал`);
          }
        } catch (err) {
          log(`❌ Ошибка конвертации HEIC "${file.name}": ${err}`);
        }
      }

      // Создаем новый, "чистый" файл для всех последующих операций
      const cleanFileForOperations = new File([fileToUpload], newFileName, {
        type: fileToUpload.type,
      });

      // Создаем превью, используя только cleanFileForOperations
      if (cleanFileForOperations.type.startsWith("image/")) {
        thumbnail = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => {
            log(`❌ Ошибка чтения файла "${cleanFileForOperations.name}" для превью`);
            resolve(null);
          };
          reader.readAsDataURL(cleanFileForOperations);
        });
      } else if (cleanFileForOperations.type.startsWith("video/")) {
        try {
          thumbnail = await createVideoThumbnail(cleanFileForOperations);
        } catch (e) {
          log(`❌ Ошибка создания превью видео "${cleanFileForOperations.name}": ${e}`);
        }
      }

      filesToUpload.value.push({
        file: cleanFileForOperations, // Сохраняем "чистый" файл
        name: cleanFileForOperations.name,
        progress: 0,
        statusClass: "waiting",
        statusText: "⏳ Ожидает",
        thumbnail,
      });

    } catch (err: any) {
      log(`❌ Ошибка обработки файла "${file.name}": ${err}`);
    }
  }
};

const createVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    // Создаем URL для видео и сразу сохраняем ссылку на него
    const videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;

    video.onloadedmetadata = () => {
      video.currentTime = 1;
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        
        // Освобождаем URL после использования
        URL.revokeObjectURL(videoUrl);
        
        resolve(dataUrl);
      } else {
        URL.revokeObjectURL(videoUrl); // Гарантированно освобождаем URL в случае ошибки
        reject(new Error("Не удалось получить контекст canvas"));
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(videoUrl); // Гарантированно освобождаем URL в случае ошибки
      reject(new Error("Ошибка создания превью видео."));
    };
  });
};


const uploadFiles = async (): Promise<void> => {
  if (filesToUpload.value.length === 0) {
    log("Нет файлов для загрузки.");
    return;
  }

  log("Начинаем загрузку...");
  for (const fileItem of filesToUpload.value) {
    try {
      fileItem.statusClass = "uploading";
      fileItem.statusText = "⬆ Загрузка...";
      fileItem.progress = 0;

      // Используем "чистый" файл, который уже готов к загрузке
      const fileForUpload = fileItem.file;

      // Получаем ссылку на upload
      const getUrlRes = await fetch(GET_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileForUpload.name,
          fileType: fileForUpload.type,
          folder: folderName,
          newNameForFile: subfolderName,
        }),
      });

      if (!getUrlRes.ok) {
        const errorText = await getUrlRes.text();
        throw new Error(`Failed to get upload URL: ${getUrlRes.status} ${errorText}`);
      }

      const { uploadUrl, newFileName } = (await getUrlRes.json()) as {
        uploadUrl: string;
        newFileName: string;
      };

      log(`🔗 Upload URL для "${fileForUpload.name}": ${uploadUrl}`);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            fileItem.progress = Math.round((e.loaded / e.total) * 100);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Ошибка загрузки: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Сетевая ошибка"));
        
        // Отправляем файл
        xhr.send(fileForUpload);
      });

      log(`✅ Файл "${fileForUpload.name}" загружен как "${newFileName}"`);
      fileItem.statusClass = "success";
      fileItem.statusText = "✅ Загружено";
      fileItem.progress = 100;

    } catch (err: any) {
      log(`❌ Ошибка при загрузке "${fileItem.name}": ${err.message}`);
      fileItem.statusClass = "error";
      fileItem.statusText = "❌ Ошибка";
      fileItem.progress = 100;
    }
  }

  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

</script>

<style scoped>
/* Ваши стили остаются без изменений */
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
}

button:hover {
  background: #357abd;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
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
}

.thumb img {
  width: 180px;
  height: auto;
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
  transition: width 0.2s ease;
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
}
</style>
