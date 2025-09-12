// utils/helpers.js

export function getCookie(cookieHeader, name) {
    const cookies = cookieHeader?.split(';') || [];
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.trim().split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

export function getRandomSuffix(length = 3) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export const getMimeTypeFromExtension = (filePath) => {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        pdf: 'application/pdf',
        txt: 'text/plain',
        // Добавляем расширения HEIC и HEIF
        heic: 'image/heic',
        heif: 'image/heic'
    };
    return mimeMap[extension] || 'application/octet-stream';
};