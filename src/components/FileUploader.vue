<script setup lang="ts">
import { ref } from 'vue'

const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const uploadProgress = ref(0)

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const file = input.files[0]
  let uploadFile: File

  if (file.type.startsWith('image/')) {
    // 🔹 Конвертируем картинку в JPEG через Canvas
    uploadFile = await convertImageToJpeg(file)
  } else if (file.type.startsWith('video/')) {
    // 🔹 Видео оставляем как есть
    uploadFile = file
  } else {
    console.warn('Unsupported file type:', file.type)
    return
  }

  await uploadToYandex(uploadFile)
}

// Конвертация изображения в JPEG через Canvas
async function convertImageToJpeg(file: File): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas context not available'))

        ctx.drawImage(img, 0, 0)

        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error('Failed to convert image'))
            const newFile = new File([blob], getFileNameWithoutExt(file.name) + '.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now()
            })
            resolve(newFile)
          },
          'image/jpeg',
          0.9 // качество JPEG
        )
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Получение ссылки от Яндекс.Диска и загрузка
async function uploadToYandex(file: File) {
  try {
    isUploading.value = true
    uploadProgress.value = 0

    // ⚡️ Запрос на получение ссылки
    const urlRes = await fetch(`/api/get-upload-url?path=${encodeURIComponent(file.name)}`, {
      method: 'GET'
    })

    if (!urlRes.ok) {
      const errText = await urlRes.text()
      throw new Error('Failed to get upload URL: ' + errText)
    }

    const { href } = await urlRes.json()

    // ⚡️ Загружаем файл PUT-запросом
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', href, true)

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        uploadProgress.value = Math.round((e.loaded / e.total) * 100)
      }
    }

    xhr.onload = () => {
      isUploading.value = false
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('Upload success:', file.name)
      } else {
        console.error('Upload failed:', xhr.responseText)
      }
    }

    xhr.onerror = () => {
      isUploading.value = false
      console.error('Upload error')
    }

    xhr.send(file)
  } catch (err) {
    isUploading.value = false
    console.error(err)
  }
}

// Вспомогательная функция: имя файла без расширения
function getFileNameWithoutExt(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  return dotIndex !== -1 ? name.substring(0, dotIndex) : name
}
</script>

<template>
  <div>
    <input
      type="file"
      ref="fileInput"
      @change="onFileChange"
      accept="image/*,video/*"
    />

    <div v-if="isUploading">
      Загрузка: {{ uploadProgress }}%
    </div>
  </div>
</template>
