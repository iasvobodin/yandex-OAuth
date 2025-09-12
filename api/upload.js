// api/upload.js
import fetch from 'node-fetch';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
    api: {
        bodyParser: false,
    },
};

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

function getRandomSuffix(length = 3) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(request.headers.cookie, 'accessToken');

    if (!accessToken) {
        return response.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    try {
        const form = formidable({});
        const [fields, files] = await form.parse(request);

        const file = files.file[0];
        const folder = fields.folder[0];
        const subfolder = fields.subfolder[0];

        if (!file || !folder || !subfolder) {
            return response.status(400).json({ error: 'Missing file or folder information.' });
        }

        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folder}`;
        const encodedBaseFolder = encodeURIComponent(baseFolder);

        // Проверяем и создаем папку
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

        // Получаем ссылку для загрузки
        const ext = path.extname(file.originalFilename);
        const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;

        const uploadUrlRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedBaseFolder}/${encodeURIComponent(newFileName)}&overwrite=true`, {
            method: "GET",
            headers: { Authorization: `OAuth ${accessToken}` }
        });

        const uploadData = await uploadUrlRes.json();
        if (!uploadData.href) throw new Error("Failed to get upload URL");

        // Загружаем файл на Яндекс.Диск
        const fileStream = fs.createReadStream(file.filepath);
        await fetch(uploadData.href, {
            method: "PUT",
            body: fileStream,
            headers: {
                'Content-Type': file.mimetype,
                'Content-Length': file.size
            }
        });

        response.status(200).json({ message: `Файл "${file.originalFilename}" сохранён как "${newFileName}" в "${folder}".` });

    } catch (err) {
        console.error(err);
        response.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}