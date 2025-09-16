import nodemailer from "nodemailer";

export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { issueKey } = req.body;
        if (!issueKey) {
            return res.status(400).json({ error: "No issueKey provided" });
        }

        const token = process.env.YANDEX_TRACKER_TOKEN;
        const orgId = process.env.YANDEX_ORG_ID;

        const headers = {
            "Authorization": `OAuth ${token}`,
            "X-Org-Id": orgId,
            "Content-Type": "application/json"
        };

        // === 1. Основная информация о задаче ===
        const issueResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}`, { headers });
        if (!issueResp.ok) {
            const text = await issueResp.text();
            console.error("Tracker issue error:", text);
            return res.status(issueResp.status).json({ error: "Failed to fetch issue", details: text });
        }
        const issue = await issueResp.json();

        // === 2. Вложения ===
        const attachResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments`, { headers });
        let attachments = [];
        if (attachResp.ok) {
            const data = await attachResp.json();
            attachments = Array.isArray(data) ? data : [];
        } else {
            const text = await attachResp.text();
            console.warn("No attachments or error:", text);
        }

        // === 3. Скачиваем вложения (если есть) ===
        const files = [];
        for (const att of attachments) {
            try {
                const fileResp = await fetch(
                    `https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}`,
                    { headers }
                );
                if (fileResp.ok) {
                    const buffer = Buffer.from(await fileResp.arrayBuffer());
                    files.push({
                        filename: att.name,
                        content: buffer
                    });
                } else {
                    console.warn(`Failed to fetch attachment ${att.id}:`, await fileResp.text());
                }
            } catch (err) {
                console.error("Attachment fetch error:", err);
            }
        }

        // === 4. Отправляем письмо ===
        const transporter = nodemailer.createTransport({
            host: "smtp.yandex.ru",
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS
            }
        });

        await transporter.sendMail({
            from: `"QA Bot" <${process.env.MAIL_USER}>`,
            to: "supplier@example.com", // можно подставлять из кастомного поля
            subject: `Брак: ${issue.summary} (${issue.key})`,
            text: issue.description || "Нет описания",
            attachments: files
        });

        res.status(200).json({ success: true, sentFiles: files.length });
    } catch (err) {
        console.error("Webhook handler error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
}
