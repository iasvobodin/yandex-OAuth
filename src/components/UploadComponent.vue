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
      <button id="QUEUES" @click="handleCheckQueues">
        Проверка очередей в трекере
      </button>
      <button id="selectBtn" :disabled="!isAuthorized" @click="selectFiles">Выбрать фотографии</button>
      <button
        :disabled="!isAuthorized || filesToUpload.length === 0"
        @click="startUpload"
      >
        Загрузить выбранные фото
      </button>
      <button @click="clearLog" v-if="outputLog.length > 0">Очистить лог</button>
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
        <button v-if="file.error" @click="retryUpload(index)" class="retry-btn">Повторить</button>
      </div>
    </div>
    <pre id="output">{{ outputLog }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Ref } from 'vue';
import {
  type UploadFile,
  isImageFile,
  isHEICFile,
  createImageThumbnail,
  createImageThumbnailHEIC,
  createVideoThumbnail,
  createFallbackThumbnail,
} from '../assets/previewUtils';
import { checkAuthStatus, checkQueues } from '../assets/apiUtils';
import { createLogger, clearLog as clearLogUtil } from '../assets/logUtils';

const filesToUpload: Ref<UploadFile[]> = ref([]);
const outputLog = ref<string>('');
const log = createLogger(outputLog);
const isAuthorized = ref<boolean>(false);
const authBtnVisible = ref<boolean>(true);
const infoText = ref<string>('Вы загружаете фотографии на общий диск');
const fileInputRef = ref<HTMLInputElement | null>(null);
let folderName: string = 'Фото';
let subfolderName: string = 'Новая папка';
const MAX_FILES = 20;

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
  checkAuthStatus(log).then((authorized) => {
    isAuthorized.value = authorized;
    authBtnVisible.value = !authorized;
  });
});

const handleAuth = (): void => {
  log('Инициируем авторизацию...');
  window.location.href = '/api/auth';
};

const selectFiles = (): void => {
  fileInputRef.value?.click();
};

// Новый обработчик для checkQueues
const handleCheckQueues = async (): Promise<void> => {
  await checkQueues(log);
};

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length === 0) {
    log('Файлы не выбраны');
    return;
  }
  if (files.length > MAX_FILES) {
    log(`Выбрано слишком много файлов (${files.length}). Максимум: ${MAX_FILES}`);
    return;
  }
  log(`Выбрано файлов: ${files.length}`);

  filesToUpload.value = [];
  for (const file of files) {
    if (file.size === 0) {
      log(`⚠️ Файл ${file.name} пустой, пропускаем`);
      continue;
    }
    log(`Обработка файла: ${file.name}, тип: ${file.type}, размер: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    try {
      const uploadFile: UploadFile = {
        file,
        name: file.name,
        progress: 0,
        statusClass: 'waiting',
        statusText: '⏳ Ожидает',
        thumbnail: null,
      };
      filesToUpload.value.push(uploadFile);

      let thumbnail: string | null = null;
      if (isImageFile(file) || file.type.startsWith('image/')) {
        if (isHEICFile(file)) {
          thumbnail = await createImageThumbnailHEIC(file, log);
        } else {
          thumbnail = await createImageThumbnail(file);
        }
      } else if (file.type.startsWith('video/')) {
        thumbnail = await createVideoThumbnail(file, log);
      } else {
        thumbnail = createFallbackThumbnail('FILE');
      }
      const fileIndex = filesToUpload.value.findIndex(f => f.file === file);
      if (fileIndex !== -1) {
        filesToUpload.value[fileIndex].thumbnail = thumbnail;
      }
    } catch (err) {
      log(`❌ Критическая ошибка при обработке файла "${file.name}": ${err}`);
      const fileIndex = filesToUpload.value.findIndex(f => f.file === file);
      if (fileIndex !== -1) {
        filesToUpload.value[fileIndex].thumbnail = createFallbackThumbnail('FILE');
      }
    }
  }
  target.value = '';
};

const startUpload = async () => {
  if (!isAuthorized.value) {
    log('⚠️ Не авторизованы');
    return;
  }
  for (const f of filesToUpload.value) {
    if (f.uploaded) continue;
    await uploadFile(f);
  }
};

const uploadFile = async (f: UploadFile) => {
  f.statusClass = 'uploading';
  f.statusText = '⬆️ Загружаем на сервер...';
  try {
    const formData = new FormData();
    formData.append('file', f.file);
    formData.append('filename', f.name);
    formData.append('folder', folderName);
    formData.append('subfolder', subfolderName);

    // let uploadedBytes = 0;
    // let lastUpdate = 0;
    // const throttleMs = 200;

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    const data = await response.json();
    const result = data.results.find((r: any) => r.originalName === f.name);
    if (result.error) {
      throw new Error(result.error);
    }

    f.uploaded = true;
    f.serverSavedAs = result.savedAs;
    f.statusClass = 'success';
    f.statusText = `✅ Загружен как ${result.savedAs}`;
    f.error = undefined;
    f.progress = 100;
    log(`Файл ${f.name} загружен как ${result.savedAs}`);
  } catch (err: any) {
    f.statusClass = 'error';
    f.statusText = `❌ Ошибка: ${err.message || err}. Попробуйте повторить`;
    f.error = String(err);
    log(`Ошибка загрузки ${f.name}: ${err}`);
  }
};

const retryUpload = (index: number) => {
  const f = filesToUpload.value[index];
  if (f) {
    log(`Повторная попытка загрузки ${f.name}`);
    uploadFile(f);
  }
};

const clearLog = () => {
  clearLogUtil(outputLog);
};
</script>

<style scoped>
body {
  font-family: Arial, sans-serif;
  padding: 1rem;
  margin: 0;
  background: #fafafa;
  color: #333;
}
h2 { font-size: 1.2rem; margin-bottom: 1rem; text-align: center; }
#controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.625rem; margin-bottom: 1rem; }
button { padding: 0.625rem 1rem; cursor: pointer; border: none; border-radius: 0.375rem; background: #4a90e2; color: white; font-size: 0.9rem; flex: 1 1 auto; max-width: 13.75rem; }
button:hover { background: #357abd; }
button:disabled { background: #ccc; cursor: not-allowed; }
#preview { display: grid; grid-template-columns: repeat(auto-fill, minmax(13.75rem, 1fr)); gap: 0.9375rem; margin-top: 0.625rem; }
.thumb { display: flex; flex-direction: column; align-items: center; border: 1px solid #ccc; border-radius: 0.5rem; padding: 0.625rem; background: white; box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.05); }
.thumb img { width: 11.25rem; height: 11.25rem; object-fit: contain; border-radius: 0.375rem; margin-bottom: 0.5rem; background: #f5f5f5; }
.icon-placeholder { font-size: 3.125rem; height: 9.375rem; display: flex; align-items: center; justify-content: center; }
.file-info { font-size: 0.85rem; text-align: center; margin-bottom: 0.375rem; word-break: break-word; }
.progress-container { width: 100%; background: #eee; border-radius: 0.375rem; overflow: hidden; height: 0.5rem; margin-bottom: 0.375rem; }
.progress-bar { height: 100%; width: 0%; background: #4a90e2; transition: width 0.2s ease; }
.status { font-size: 0.85rem; font-weight: bold; text-align: center; }
.status.waiting { color: #888; }
.status.uploading { color: #e69500; }
.status.success { color: #2d9d2d; }
.status.error { color: #d93025; }
.retry-btn { margin-top: 0.5rem; padding: 0.375rem 0.75rem; background: #ff9800; color: white; border: none; border-radius: 0.25rem; cursor: pointer; }
.retry-btn:hover { background: #f57c00; }
#output { background: #f4f4f4; padding: 0.625rem; overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap; border-radius: 0.375rem; margin-top: 1.25rem; }
</style>