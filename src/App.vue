

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
  @click="() => uploadFiles(filesToUpload.map(f => f.file), folderName, subfolderName, log)"
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

const AUTH_URL = '/api/auth';
// const GET_UPLOAD_URL = '/api/get-upload-url';

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
const outputLog = ref<string>('');
const isAuthorized = ref<boolean>(false);
const authBtnVisible = ref<boolean>(true);
const infoText = ref<string>('Вы загружаете фотографии на общий диск');

const fileInputRef = ref<HTMLInputElement | null>(null);

let folderName: string = 'Фото';
let subfolderName: string = 'Новая папка';

// Логгирование
const log = (msg: string) => {
  outputLog.value += msg + '\n';
  console.log(msg); // Добавляем консольный лог для отладки
};

// Проверка статуса авторизации при загрузке страницы
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

// Авторизация и выбор файлов
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

interface QueueItem {
  name: string;
}

// проверка очереди в трекере
const checkQueues = async () => {
  try {
    const res = await fetch("/api/get-queues", { method: 'GET' });
    if (res.ok) {
      const data: QueueItem[] = await res.json();
      const names = data.map(item => item.name);
      log(`✅ Очереди получены`);
      log(JSON.stringify(names, null, 2));
    } else {
      log('⚠️ что то не так');
      return;
    }
  } catch (err) {
    log('❌ Произошла Ошибка работы с трекером');
  }
};

const handleAuth = (): void => {
  log('Инициируем авторизацию...');
  window.location.href = AUTH_URL;
};

const selectFiles = (): void => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
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
      let uploadFile: File = file;
      let thumbnail: string | null = null;

      // Проверяем, является ли файл изображением
      if (file.type.startsWith('image/') || isImageFile(file)) {
        try {
          // Специальная обработка для HEIC/HEIF на iOS
          if (isHEICFile(file) || file.type === '') {
            log(`Обнаружен HEIC/HEIF файл: ${file.name}`);
            uploadFile = await processHEICFile(file);
          } else {
            // Конвертируем обычные изображения в JPEG
            uploadFile = await convertImageToJpeg(file);
          }
          
          // Создаем thumbnail для превью
          thumbnail = await createImageThumbnail(uploadFile);
          log(`✅ Изображение обработано: ${uploadFile.name}`);
        } catch (e) {
          log(`⚠️ Ошибка обработки изображения "${file.name}": ${e}. Используем оригинал.`);
          uploadFile = file;
          try {
            thumbnail = await createImageThumbnail(file);
          } catch (thumbError) {
            log(`⚠️ Ошибка создания превью для "${file.name}"`);
          }
        }
      } else if (file.type.startsWith('video/')) {
        uploadFile = file; // видео не конвертируем
        try {
          thumbnail = await createVideoThumbnail(file);
        } catch (e) {
          log(`⚠️ Ошибка создания превью для видео "${file.name}"`);
        }
      } else {
        log(`⚠️ Неизвестный тип файла: ${file.name}`);
        uploadFile = file;
      }

      filesToUpload.value.push({
        file: uploadFile,
        name: uploadFile.name,
        progress: 0,
        statusClass: 'waiting',
        statusText: '⏳ Ожидает',
        thumbnail,
      });
    } catch (error) {
      log(`❌ Критическая ошибка при обработке файла "${file.name}": ${error}`);
    }
  }

  // Очищаем input для возможности повторного выбора тех же файлов
  target.value = '';
};

// Определяем файл как изображение по расширению (для случаев когда MIME type пустой)
const isImageFile = (file: File): boolean => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic', '.heif'];
  const fileName = file.name.toLowerCase();
  return imageExtensions.some(ext => fileName.endsWith(ext));
};

// Определяем HEIC файл
const isHEICFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.heic') || fileName.endsWith('.heif') || 
         file.type === 'image/heic' || file.type === 'image/heif';
};

// Обработка HEIC файлов
const processHEICFile = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    // Пытаемся прочитать HEIC как обычное изображение
    // Современные браузеры на iOS могут поддерживать HEIC нативно
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Не удалось получить контекст canvas');
        }

        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Не удалось конвертировать HEIC'));
            return;
          }
          
          const newFileName = getFileNameWithoutExt(file.name) + '.jpg';
          const convertedFile = new File([blob], newFileName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          
          resolve(convertedFile);
        }, 'image/jpeg', 0.9);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      // Если не удалось загрузить как изображение, возвращаем оригинальный файл
      log(`⚠️ Не удалось обработать HEIC файл "${file.name}", отправляем оригинал`);
      resolve(file);
    };
    
    // Создаем URL для изображения
    try {
      const url = URL.createObjectURL(file);
      img.src = url;
      
      // Освобождаем URL через 30 секунд
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30000);
    } catch (error) {
      reject(error);
    }
  });
};

// Создание превью для изображений
const createImageThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxSize = 200; // максимальный размер превью
          
          let { width, height } = img;
          
          // Масштабируем изображение для превью
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
    video.muted = true; // Важно для автовоспроизведения на мобильных
    
    const cleanup = () => {
      URL.revokeObjectURL(video.src);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    
    const onLoadedMetadata = () => {
      video.currentTime = Math.min(1, video.duration / 4); // Берем кадр из первой четверти
    };
    
    const onSeeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Не удалось получить контекст canvas');
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    
    const onError = () => {
      cleanup();
      reject(new Error('Ошибка создания превью видео'));
    };
    
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    
    try {
      video.src = URL.createObjectURL(file);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};

const convertImageToJpeg = (file: File): Promise<File> => {
  return new Promise<File>((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = e => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas context недоступен');
          }

          // Устанавливаем белый фон для изображений с прозрачностью
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('Не удалось конвертировать изображение'));
              return;
            }
            
            const newFileName = getFileNameWithoutExt(file.name) + '.jpg';
            const newFile = new File([blob], newFileName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            
            resolve(newFile);
          }, 'image/jpeg', 0.9);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
};

const getFileNameWithoutExt = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex !== -1 ? name.substring(0, dotIndex) : name;
};

// Логика загрузки
async function uploadFiles(files: File[], folder: string, subfolder: string, log: (msg: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append("folder", folder);
    formData.append("subfolder", subfolder);

    for (const file of files) {
      formData.append("file", file, file.name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        log(`⬆️ Загрузка: ${percent}%`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resp = JSON.parse(xhr.responseText);

          if (resp.results && Array.isArray(resp.results)) {
            resp.results.forEach((r: any) => {
              if (r.error) {
                log(`❌ Ошибка: ${r.originalName} → ${r.error}`);
              } else {
                log(`✅ Файл "${r.originalName}" сохранён как "${r.savedAs}" в папке "${r.folder}"`);
              }
            });
          } else {
            log("⚠️ Ответ сервера не содержит результатов.");
          }

          resolve();
        } catch (e) {
          reject(new Error("Ошибка парсинга ответа сервера"));
        }
      } else {
        reject(new Error(`Ошибка загрузки: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Ошибка сети при загрузке"));
    xhr.send(formData);
  });
}

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