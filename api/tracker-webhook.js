import nodemailer from "nodemailer";

export default async function handler(req, res) {
    console.log("=== Tracker Webhook Triggered ===");

    if (req.method !== "POST") {
        console.warn("Invalid method:", req.method);
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { issueKey } = req.body;
        console.log("Received issueKey:", issueKey);

        if (!issueKey) return res.status(400).json({ error: "No issueKey provided" });

        const trackerToken = process.env.YANDEX_TRACKER_TOKEN;
        const orgId = process.env.YANDEX_ORG_ID;
        const diskToken = process.env.YANDEX_TRACKER_TOKEN; // OAuth для Диска
        const folderName = issueKey; // название папки на Диске

        const trackerHeaders = {
            "Authorization": `OAuth ${trackerToken}`,
            "X-Org-Id": orgId,
            "Content-Type": "application/json"
        };

        // 1️⃣ Получаем данные задачи
        const issueResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}`, { headers: trackerHeaders });
        if (!issueResp.ok) {
            const text = await issueResp.text();
            console.error("Tracker issue error:", text);
            return res.status(issueResp.status).json({ error: "Failed to fetch issue", details: text });
        }
        const issue = await issueResp.json();
        console.log("Issue summary:", issue.summary);

        // 2️⃣ Получаем список вложений
        const attachResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments`, { headers: trackerHeaders });
        const attachments = attachResp.ok ? (await attachResp.json()) : [];
        console.log("Found attachments:", attachments.length);

        // 3️⃣ Создаём папку на Яндекс.Диске
        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folderName}`;
        const encodedBaseFolder = encodeURIComponent(baseFolder);

        const checkFolderRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
            method: "GET",
            headers: { Authorization: `OAuth ${diskToken}` }
        });

        if (checkFolderRes.status === 404) {
            console.log("Creating folder on Yandex.Disk:", baseFolder);
            await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
                method: "PUT",
                headers: { Authorization: `OAuth ${diskToken}` }
            });
            await new Promise(r => setTimeout(r, 500)); // небольшая пауза
        }

        // 4️⃣ Загружаем все вложения в папку
        for (const att of attachments) {
            try {
                console.log(`Fetching attachment: ${att.name} (${att.id})`);
                const fileResp = await fetch(
                    `https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}/content`,
                    { headers: { ...trackerHeaders, Accept: "application/octet-stream" } }
                );

                if (!fileResp.ok) {
                    console.warn(`Failed to fetch attachment ${att.id}:`, await fileResp.text());
                    continue;
                }

                const buffer = Buffer.from(await fileResp.arrayBuffer());
                const safeFileName = encodeURIComponent(att.name);
                const filePath = `${encodedBaseFolder}/${safeFileName}`;

                // Получаем upload_url
                const uploadUrlRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${filePath}&overwrite=true`, {
                    method: "GET",
                    headers: { Authorization: `OAuth ${diskToken}` }
                });
                const uploadData = await uploadUrlRes.json();
                if (!uploadUrlRes.ok || !uploadData.href) {
                    console.error("Failed to get upload URL for file:", att.name, uploadData);
                    continue;
                }

                await fetch(uploadData.href, { method: "PUT", body: buffer });
                console.log(`Uploaded ${att.name} to Yandex.Disk`);

            } catch (err) {
                console.error("Attachment upload error:", err);
            }
        }

        // 5️⃣ Создаём публичную ссылку на всю папку
        const publishRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodedBaseFolder}`, {
            method: "PUT",
            headers: { Authorization: `OAuth ${diskToken}` }
        });

        if (!publishRes.ok) {
            console.warn("Failed to publish folder:", await publishRes.text());
        }

        const infoRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
            headers: { Authorization: `OAuth ${diskToken}` }
        });
        const info = await infoRes.json();
        const folderUrl = info.public_url;
        console.log("Folder public URL:", folderUrl);

        // 6️⃣ Формируем письмо
        let bodyText = issue.description || "Нет описания";
        if (folderUrl) bodyText += `\n\nВсе файлы по задаче доступны здесь:\n${folderUrl}`;

        const transporter = nodemailer.createTransport({
            host: "smtp.yandex.ru",
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS
            }
        });

        const mailOptions = {
            from: `"QC TAU" <${process.env.MAIL_USER}>`,
            to: "iasvobodin@gmail.com",
            subject: `Re: ${issue.key}: ${issue.summary}`,
            text: bodyText
        };

        console.log("Sending email to:", mailOptions.to);
        const infoMail = await transporter.sendMail(mailOptions);
        console.log("Email sent:", infoMail.messageId);

        res.status(200).json({ success: true, folderUrl, emailId: infoMail.messageId });

    } catch (err) {
        console.error("Webhook handler error:", err);
        res.status(500).json({ error: err.message });
    }
}
