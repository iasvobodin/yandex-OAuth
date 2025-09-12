import fetch from 'node-fetch';

function getCookieValue(cookieHeader, name) {
    if (!cookieHeader) return null;
    const pairs = cookieHeader.split(';').map(s => s.trim());
    const found = pairs.find(p => p.startsWith(name + '='));
    return found ? decodeURIComponent(found.split('=').slice(1).join('=')) : null;
}

export default async function handler(req, res) {
    const accessToken = getCookieValue(req.headers.cookie, 'accessToken');
    if (!accessToken) return res.status(401).json({ error: 'No access token' });

    const X_ORG_ID = process.env.X_ORG_ID || req.headers['x-org-id'] || '<YOUR_X_ORG_ID>';

    try {
        const trackerRes = await fetch('https://api.tracker.yandex.net/v3/queues/', {
            method: 'GET',
            headers: {
                'Authorization': `OAuth ${accessToken}`,
                'X-Org-ID': X_ORG_ID,
                'Accept': 'application/json'
            }
        });

        if (trackerRes.status === 401) {
            return res.status(401).json({ error: 'Unauthorized by Tracker — token invalid or expired' });
        }

        const data = await trackerRes.json();
        res.status(trackerRes.status).json(data);

    } catch (err) {
        console.error('Tracker request failed', err);
        res.status(500).json({ error: err.message || 'Internal error' });
    }
}
