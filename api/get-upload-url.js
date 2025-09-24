// api/get-upload-url.js
import { getCookie, getRandomSuffix } from '../utils/helpers.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(request.headers.cookie, 'accessToken');
    if (!accessToken) {
        console.error("❌ Нет accessToken в куках");
        return response.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    let { fileName, folder, subfolder } = request.body;
    if (!fileName || !folder || !subfolder) {
        console.error("❌ Не хватает параметров:", { fileName, folder, subfolder });
        return response.status(400).json({ error: 'Missing file or folder information.' });
    }

    try {
        console.log("➡ Исходные данные:", { fileName, folder, subfolder });

        // нормализуем (важно для iPhone)
        fileName = fileName.normalize('NFC');
        folder = folder.normalize('NFC');
        subfolder = subfolder.normalize('NFC');

        console.log("🔧 После normalize:", { fileName, folder, subfolder });

        // путь кодируем сегментами
        const baseFolderSegments = [
            'Системы ТАУ - Общее',
            'Фото ТАУ контроль',
            folder
        ];
        const baseFolder = baseFolderSegments.map(s => encodeURIComponent(s)).join('/');

        console.log("📂 baseFolder (кодированный):", baseFolder);

        // 1. Проверяем папку
        const checkFolderUrl = `https://cloud-api.yandex.net/v1/disk/resources?path=${baseFolder}`;
        console.log("🔎 Проверяем папку:", checkFolderUrl);

        const checkFolderRes = await fetch(checkFolderUrl, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        if (checkFolderRes.status === 404) {
            console.log("📁 Папка не найдена → создаём");
            await fetch(checkFolderUrl, {
                method: "PUT",
                headers: { Authorization: `OAuth ${accessToken}` }
            });
        }

        // 2. Имя файла
        const ext = fileName.includes(".")
            ? fileName.slice(fileName.lastIndexOf("."))
            : "";
        const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;
        const encodedFileName = encodeURIComponent(newFileName);

        console.log("📝 Имя файла:", { original: fileName, newFileName, encodedFileName });

        // 3. Получаем upload URL
        const uploadUrlReq = `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${baseFolder}/${encodedFileName}&overwrite=true`;
        console.log("🌍 Запрос upload URL:", uploadUrlReq);

        const uploadRes = await fetch(uploadUrlReq, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            console.error("❌ Ошибка от Яндекса:", uploadRes.status, errorText);
            throw new Error("Failed to get upload URL");
        }

        const uploadData = await uploadRes.json();
        console.log("✅ Успешный ответ Яндекса:", uploadData);

        if (!uploadData.href) throw new Error("Failed to get upload URL");

        // 4. Возвращаем клиенту
        response.status(200).json({
            uploadUrl: uploadData.href,
            newFileName
        });

    } catch (err) {
        console.error("💥 Ошибка в get-upload-url:", err);
        response.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}
