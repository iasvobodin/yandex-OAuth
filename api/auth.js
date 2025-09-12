// api/auth.js
import { URLSearchParams } from 'url';

export default async function handler(request, response) {
    // Получаем куки, чтобы проверить, есть ли уже токен доступа.
    const accessToken = request.cookies?.accessToken;

    // Если куки уже есть и запрос не является перенаправлением,
    // просто возвращаем 200 OK. Это позволяет клиенту узнать, что он авторизован.
    if (accessToken && request.method === 'HEAD') {
        return response.status(200).end();
    }

    const CLIENT_ID = process.env.CLIENT_ID;
    const REDIRECT_URI = process.env.REDIRECT_URI;
    const SCOPE = "cloud_api:disk.read cloud_api:disk.write tracker:write tracker:read";

    const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;

    // Перенаправляем браузер пользователя на страницу авторизации Яндекса.
    response.redirect(authUrl);
}