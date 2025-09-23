import formidable from 'formidable';
import { pipeline } from 'stream';
import { promisify } from 'util';
import path from 'path';
import { PassThrough } from 'stream';
import http from 'http';

const pump = promisify(pipeline);

// Получить cookie
function getCookie(cookies, name) {
    if (!cookies) return null;
    const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`));
    return match ? match[2] : null;
}

// Рандомный суффикс
function getRandomSuffix() {
    return Math.random().toString(36).substring(2, 8);
}

// Нормализация MIME-типа для iPhone файлов
function normalizeMimeType(filename, mimeType) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.heic' || ext === '.heif') {
        return mimeType || 'image/heic';
    }
    if (ext === '.mov' || ext === '.mp4') {
        return mimeType || 'video/mp4';
    }
    return mimeType || 'application/octet-stream';
}

// Обработчик для Vercel
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }

    const accessToken = getCookie(req.headers.cookie, 'accessToken');
    if (!accessToken) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'Unauthorized: no accessToken' }));
    }

    const form = formidable({
        multiples: true,
        fileWriteStreamHandler: () => new PassThrough(), // Не сохраняем на диск
    });

    try {
        const [fields, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error('Formidable error:', err);
                    reject(new Error('Upload parse failed'));
                } else {
                    resolve([fields, files]);
                }
            });
        });

        const folder = Array.isArray(fields.folder) ? fields.folder[0] : fields.folder || '';
        const subfolder = Array.isArray(fields.subfolder) ? fields.subfolder[0] : fields.subfolder || '';
        if (!folder || !subfolder) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Missing folder or subfolder' }));
        }

        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folder}`;
        const encodedBaseFolder = encodeURIComponent(baseFolder);

        // Проверяем/создаём папку на Яндекс.Диске
        const checkRes = await fetch(
            `https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`,
            { headers: { Authorization: `OAuth ${accessToken}` } }
        );
        if (checkRes.status === 404) {
            const createRes = await fetch(
                `https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`,
                { method: 'PUT', headers: { Authorization: `OAuth ${accessToken}` } }
            );
            if (!createRes.ok) {
                throw new Error(`Failed to create folder: ${createRes.status} ${createRes.statusText}`);
            }
        } else if (!checkRes.ok) {
            throw new Error(`Failed to check folder: ${checkRes.status} ${checkRes.statusText}`);
        }

        const results = [];
        const fileArray = Array.isArray(files.file) ? files.file : files.file ? [files.file] : [];
        for (const file of fileArray) {
            const originalFilename = file.originalFilename || 'unknown';
            const ext = path.extname(originalFilename).toLowerCase();
            const newFileName = `${subfolder}__${getRandomSuffix()}${ext}`;
            const encodedPath = `${encodedBaseFolder}/${encodeURIComponent(newFileName)}`;

            try {
                // Получаем ссылку для загрузки
                const uploadUrlRes = await fetch(
                    `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedPath}&overwrite=true`,
                    { headers: { Authorization: `OAuth ${accessToken}` } }
                );
                if (!uploadUrlRes.ok) {
                    throw new Error(`Failed to get upload URL: ${uploadUrlRes.status} ${uploadUrlRes.statusText}`);
                }
                const uploadData = await uploadUrlRes.json();
                if (!uploadData.href) {
                    throw new Error('No upload href');
                }

                // Стриминг файла
                const readStream = file._writeStream || (file.filepath ? require('fs').createReadStream(file.filepath) : null);
                if (!readStream) {
                    throw new Error('No valid read stream for file');
                }

                const putRes = await fetch(uploadData.href, {
                    method: 'PUT',
                    body: readStream,
                    headers: {
                        'Content-Type': normalizeMimeType(originalFilename, file.mimetype || ''),
                    },
                });

                if (!putRes.ok) {
                    throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
                }

                results.push({
                    originalName: originalFilename,
                    savedAs: newFileName,
                    folder: baseFolder,
                    path: `${baseFolder}/${newFileName}`,
                });
            } catch (err) {
                console.error(`Error uploading ${originalFilename}:`, err);
                results.push({
                    originalName: originalFilename,
                    error: err.message || 'Upload failed',
                });
            } finally {
                // Очистка временных файлов, если использовались
                if (file.filepath) {
                    try {
                        require('fs').unlinkSync(file.filepath);
                    } catch (cleanupErr) {
                        console.error(`Failed to cleanup ${file.filepath}:`, cleanupErr);
                    }
                }
            }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Загрузка завершена', results }));
    } catch (err) {
        console.error('Server error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
}