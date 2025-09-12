// api/auth.js
import { URLSearchParams } from 'url';

export default async function handler(request, response) {
    const accessToken = request.cookies?.accessToken;

    if (request.method === 'HEAD' && accessToken) {
        return response.status(200).end();
    }

    const CLIENT_ID = process.env.CLIENT_ID;
    const REDIRECT_URI = process.env.REDIRECT_URI;
    const SCOPE = "cloud_api:disk.read cloud_api:disk.write";

    const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;

    response.redirect(authUrl);
}