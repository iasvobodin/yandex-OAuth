import fetch from 'node-fetch';
import Busboy from 'busboy';
import path from 'path';
import { getCookie, getRandomSuffix } from '../utils/helpers.js';

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const accessToken = getCookie(req.headers.cookie, 'accessToken');
    if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized: Access token not found in cookies.' });
    }

    try {
        const busboy = Busboy({ headers: req.headers });
        let folder = '';
        let subfolder = '';
        const uploads = [];

        busboy.on('field', (name, val) => {
            if (name === 'folder') folder = val;
            if (name === 'subfolder') subfolder = val;
        });

        busboy.on('file', async (fieldname, file, filename, encoding, mimetype) => {
            try {
                if (!folder || !subfolder) {
                    throw new Error('Missing folder or subfolder');
                }

                const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folder}`;
                const encodedBaseFolder = encodeURIComponent(baseFolder);

                // Проверяем/создаём папку
                const checkFolderRes = await fetch(
                    `https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`,
                    { method: 'GET', headers: { Authorization: `OAuth ${accessToken}` } }
                );

                if (checkFolderRes.status === 404) {
                    await fetch(
                        `https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`,
                        { method: 'PUT', headers: { Authorization: `OAuth ${accessToken}` } }
                    );
                }

                // Формируем имя
                const ext = path.extname(filename);
                const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;
                const encodedPath = `${encodedBaseFolder}/${encodeURIComponent(newFileName)}`;

                // Получаем ссылку для загрузки
                const uploadUrlRes = await fetch(
                    `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedPath}&overwrite=true`,
                    { method: 'GET', headers: { Authorization: `OAuth ${accessToken}` } }
                );

                const uploadData = await uploadUrlRes.json();
                if (!uploadData.href) throw new Error('Failed to get upload URL');

                // Стримим в Яндекс.Диск
                const uploadResp = await fetch(uploadData.href, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': mimetype },
                });

                if (!uploadResp.ok) throw new Error(`Upload failed with ${uploadResp.status}`);

                uploads.push({
                    originalName: filename,
                    savedAs: newFileName,
                    folder: baseFolder,
                    path: `${baseFolder}/${newFileName}`,
                });
            } catch (err) {
                console.error('Upload error:', err);
                uploads.push({
                    originalName: filename,
                    error: err.message,
                });
            }
        });

        busboy.on('finish', () => {
            res.status(200).json({
                message: 'Загрузка завершена',
                results: uploads,
            });
        });

        req.pipe(busboy);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
}
