// api/get-upload-url.js
import fetch from 'node-fetch';
import { getCookie, getRandomSuffix, getMimeTypeFromExtension } from '../utils/helpers.js';
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(request.headers.cookie, 'accessToken');
    if (!accessToken) {
        return response.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    const { fileName, folder, subfolder, fileType } = request.body;
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

        // // 2. Получаем ссылку для загрузки от Яндекса
        // const ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";

        // if (!ext && fileType) {
        //     const mimeToExt = {
        //         jpg: 'image/jpeg',
        //         jpeg: 'image/jpeg',
        //         png: 'image/png',
        //         gif: 'image/gif',
        //         webp: 'image/webp',
        //         svg: 'image/svg+xml',
        //         pdf: 'application/pdf',
        //         txt: 'text/plain',
        //         // Добавляем расширения HEIC и HEIF
        //         heic: 'image/heic',
        //         heif: 'image/heic'
        //     };
        //     ext = mimeToExt[file.type] || '';
        // }

        const newFileName = `${subfolder}__${getRandomSuffix()}${fileName.slice(fileName.lastIndexOf('.'))}`;

        // const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;

        const uploadRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedBaseFolder}/${encodeURIComponent(newFileName)}&overwrite=true`, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
            const errorText = await res.text();
            console.error('Yandex response:', res.status, errorText);
            throw new Error("Failed to get upload URL");
        }
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

