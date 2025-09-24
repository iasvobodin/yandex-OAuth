// api/get-upload-url.js
import { getCookie, getRandomSuffix } from '../utils/helpers.js';

// Функция для правильного кодирования пути для Яндекс.Диска
function encodeYandexPath(pathSegments) {
    return pathSegments
        .map(segment => segment.normalize('NFC'))
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(request.headers.cookie, 'accessToken');
    if (!accessToken) {
        console.error("❌ Нет accessToken в куках");
        return response.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    let { fileName, folder, newNameForFile } = request.body;
    if (!fileName || !folder || !newNameForFile) {
        console.error("❌ Не хватает параметров:", { fileName, folder, newNameForFile });
        return response.status(400).json({ error: 'Missing file or folder information.' });
    }

    try {
        console.log("➡ Исходные данные:", { fileName, folder, newNameForFile });

        // Нормализуем все строки для iPhone
        fileName = fileName.normalize('NFC').trim();
        folder = folder.normalize('NFC').trim();
        newNameForFile = newNameForFile.normalize('NFC').trim();

        console.log("🔧 После normalize:", { fileName, folder, newNameForFile });

        // Создаем путь к базовой папке
        let baseFolderSegments = [
            'Системы ТАУ - Общее',
            'Фото ТАУ контроль',
            folder
        ];

        // 1. Проверяем доступ к основной папке
        let hasAccessToMainFolder = true;
        let warningMessage = null;

        const mainFolderPath = encodeURIComponent('Системы ТАУ - Общее');
        const mainFolderUrl = `https://cloud-api.yandex.net/v1/disk/resources?path=${mainFolderPath}`;

        console.log('🔐 Проверяем доступ к основной папке: Системы ТАУ - Общее');
        const mainFolderCheck = await fetch(mainFolderUrl, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        if (mainFolderCheck.status === 404) {
            hasAccessToMainFolder = false;
            warningMessage = "⚠️ Нет доступа к общей папке 'Системы ТАУ - Общее'. Файлы будут загружены в ваш личный аккаунт.";
            console.warn(warningMessage);

            // Меняем базовые сегменты для личного аккаунта
            baseFolderSegments = [
                'Фото ТАУ контроль',
                folder
            ];
        }

        // 2. Создаем папки поэтапно (важно для iPhone!)
        let currentPath = '';
        for (let i = 0; i < baseFolderSegments.length; i++) {
            const segment = baseFolderSegments[i];
            currentPath += (currentPath ? '/' : '') + encodeURIComponent(segment.normalize('NFC'));

            const checkUrl = `https://cloud-api.yandex.net/v1/disk/resources?path=${currentPath}`;
            console.log(`📁 Проверяем папку ${i + 1}/${baseFolderSegments.length}:`, segment);

            const checkRes = await fetch(checkUrl, {
                method: "GET",
                headers: { Authorization: `OAuth ${accessToken}` }
            });

            if (checkRes.status === 404) {
                console.log(`📁 Создаем папку: ${segment}`);
                const createRes = await fetch(checkUrl, {
                    method: "PUT",
                    headers: { Authorization: `OAuth ${accessToken}` }
                });

                if (!createRes.ok) {
                    const errorText = await createRes.text();
                    console.error("❌ Ошибка создания папки:", createRes.status, errorText);
                    throw new Error(`Failed to create folder: ${segment}`);
                }

                // Небольшая задержка для iOS
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        const baseFolder = encodeYandexPath(baseFolderSegments);
        console.log("📂 baseFolder (итоговый):", baseFolder);

        // 2. Формируем имя файла
        const ext = fileName.includes(".")
            ? fileName.slice(fileName.lastIndexOf("."))
            : "";
        const newFileName = `${newNameForFile}__${getRandomSuffix()}${ext}`;

        console.log("📝 Имя файла:", { original: fileName, newFileName });

        // 3. Получаем upload URL с правильно кодированным путем
        const fullPath = `${baseFolder}/${encodeURIComponent(newFileName.normalize('NFC'))}`;
        const uploadUrlReq = `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${fullPath}&overwrite=true`;

        console.log("🌍 Запрос upload URL:", uploadUrlReq);

        const uploadRes = await fetch(uploadUrlReq, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            console.error("❌ Ошибка от Яндекса:", uploadRes.status, errorText);

            // Дополнительная отладка для iPhone
            console.error("🔍 Путь который не найден:", fullPath);
            console.error("🔍 Декодированный путь:", decodeURIComponent(fullPath));

            throw new Error("Failed to get upload URL");
        }

        const uploadData = await uploadRes.json();
        console.log("✅ Успешный ответ Яндекса:", uploadData);

        if (!uploadData.href) throw new Error("Failed to get upload URL");

        // 4. Возвращаем клиенту
        const result = {
            uploadUrl: uploadData.href,
            newFileName
        };

        // Добавляем предупреждение если нет доступа к общей папке
        if (warningMessage) {
            result.warning = warningMessage;
        }

        response.status(200).json(result);

    } catch (err) {
        console.error("💥 Ошибка в get-upload-url:", err);
        response.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}