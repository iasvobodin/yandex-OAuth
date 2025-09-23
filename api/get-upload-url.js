// api/get-upload-url.js
import path from 'path';
import { getCookie, getRandomSuffix } from '../utils/helpers.js'; // у тебя уже был helper
// NOTE: не используем node-fetch: Vercel/Node 18+ имеет глобальный fetch

export const config = {
    api: {
        bodyParser: true, // small JSON body — ok
    },
};

function encodePathForYandex(p) {
    // Yandex Disk API expects path encoded as URI component
    return encodeURIComponent(p);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const accessToken = getCookie(req.headers.cookie || '', 'accessToken');
        if (!accessToken) {
            res.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
            return;
        }

        const { folder, subfolder, filename } = req.body || {};
        if (!folder || !subfolder || !filename) {
            res.status(400).json({ error: 'Missing folder, subfolder or filename in body' });
            return;
        }

        // Соберём базовую папку (как в твоём примере)
        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folder}`;

        // Проверим/создадим папку
        const checkUrl = `https://cloud-api.yandex.net/v1/disk/resources?path=${encodePathForYandex(baseFolder)}`;
        const checkRes = await fetch(checkUrl, { method: 'GET', headers: { Authorization: `OAuth ${accessToken}` } });

        if (checkRes.status === 404) {
            // создать папку
            const createRes = await fetch(checkUrl, { method: 'PUT', headers: { Authorization: `OAuth ${accessToken}` } });
            if (!createRes.ok) {
                const text = await createRes.text();
                throw new Error(`Failed to create folder: ${createRes.status} ${text}`);
            }
        } else if (!checkRes.ok) {
            const text = await checkRes.text();
            throw new Error(`Failed to check folder: ${checkRes.status} ${text}`);
        }

        // сформируем уникальное имя файла: subfolder__<random><ext>
        const ext = path.extname(filename) || '';
        const savedAs = `${subfolder}__${getRandomSuffix()}${ext}`;
        const fullPath = `${baseFolder}/${savedAs}`;
        const uploadUrl = `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodePathForYandex(fullPath)}&overwrite=true`;

        const uploadUrlRes = await fetch(uploadUrl, { method: 'GET', headers: { Authorization: `OAuth ${accessToken}` } });
        if (!uploadUrlRes.ok) {
            const text = await uploadUrlRes.text();
            throw new Error(`Failed to get upload URL from Yandex: ${uploadUrlRes.status} ${text}`);
        }
        const uploadData = await uploadUrlRes.json();

        if (!uploadData.href) {
            throw new Error('Yandex returned no href for upload');
        }

        // Возвращаем href клиенту
        res.status(200).json({ href: uploadData.href, path: fullPath, savedAs });
    } catch (err) {
        console.error('get-upload-url error:', err);
        res.status(500).json({ error: String(err) });
    }
}
