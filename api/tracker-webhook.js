import nodemailer from "nodemailer";

export default async function handler(req, res) {
    try {
        const { issueKey } = req.body;

        if (!issueKey) {
            return res.status(400).json({ error: "No issueKey provided" });
        }

        // 1. Получаем данные задачи через API Яндекс.Трекера
        const token = process.env.YANDEX_TRACKER_TOKEN; // положить в Vercel Environment Variables
        const orgId = process.env.YANDEX_ORG_ID;

        const headers = {
            "Authorization": `OAuth ${token}`,
            "X-Org-Id": orgId,
            "Content-Type": "application/json"
        };

        // Основная информация о задаче
        const issueResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}`, {
            headers
        });
        const issue = await issueResp.json();

        // Вложения
        const attachResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments`, {
            headers
        });
        const attachments = await attachResp.json();

        // 2. Скачиваем вложения (если нужно именно вложить в письмо)
        const files = [];
        for (const att of attachments) {
            const fileResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}`, {
                headers
            });
            const buffer = Buffer.from(await fileResp.arrayBuffer());
            files.push({
                filename: att.name,
                content: buffer
            });
        }

        // 3. Формируем письмо
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
            to: "iasvobodin@gmail.com", // можно хранить в кастомном поле задачи и подставлять сюда
            subject: `Брак: ${issue.summary} (${issue.key})`,
            text: issue.description,
            attachments: files // прикладываем файлы
        });

        res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
}
