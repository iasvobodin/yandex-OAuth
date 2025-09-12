// api/callback.js
import { URLSearchParams } from 'url';
import fetch from 'node-fetch';

export default async function handler(request, response) {
    const { code } = request.query;

    if (!code) {
        return response.status(400).json({ error: 'Authorization code not provided.' });
    }

    const CLIENT_ID = process.env.CLIENT_ID;
    const CLIENT_SECRET = process.env.CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI;

    try {
        const yandexTokenUrl = 'https://oauth.yandex.ru/token';
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        });

        const tokenResponse = await fetch(yandexTokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return response.status(400).json({ error: tokenData.error, description: tokenData.error_description });
        }

        response.setHeader('Set-Cookie', `accessToken=${tokenData.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${tokenData.expires_in}`);
        response.redirect('/');

    } catch (err) {
        console.error(err);
        response.status(500).json({ error: 'Internal Server Error.' });
    }
}