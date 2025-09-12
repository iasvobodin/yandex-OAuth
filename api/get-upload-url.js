// api/get-upload-url.js
import fetch from 'node-fetch';
import { getCookie } from '../utils/helpers.js'; // Используем ту же вспомогательную функцию

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(request.headers.cookie, 'accessToken');
    if (!accessToken) {
        return response.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    const { fileName, folder, subfolder } = request.body;
    if (!fileName || !folder || !subfolder) {
        return response.status(400).json({ error: 'Missing file or folder information.' });
    }

    try {
        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folder}`;
        const encodedBaseFolder = encodeURIComponent(baseFolder);

        // 1. Проверяем и создаем папку
        const checkFolderRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });
        if (checkFolderRes.status === 404) {
            await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
                method: "PUT",
                headers: { Authorization: `OAuth ${accessToken}` }
            });
        }

        // 2. Получаем ссылку для загрузки от Яндекса
        const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
        const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;

        const uploadRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedBaseFolder}/${encodeURIComponent(newFileName)}&overwrite=true`, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.href) throw new Error("Failed to get upload URL");

        // Возвращаем клиенту подписанный URL и новое имя файла
        response.status(200).json({
            uploadUrl: uploadData.href,
            newFileName: newFileName
        });

    } catch (err) {
        console.error(err);
        response.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}

function getRandomSuffix(length = 3) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Убедитесь, что эта вспомогательная функция доступна.
// Если она в другом файле, импортируйте её.
function getCookie(cookieHeader, name) {
    const cookies = cookieHeader?.split(';') || [];
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}