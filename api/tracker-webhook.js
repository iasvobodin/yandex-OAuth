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
        const diskToken = process.env.YANDEX_DISK_TOKEN; // OAuth для Диска
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
        }

        // 4️⃣ Загружаем файлы на Диск и получаем публичные ссылки
        const links = [];

        for (const att of attachments) {
            try {
                console.log(`Fetching attachment: ${att.name} (${att.id})`);
                const fileResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}`, {
                    headers: { ...trackerHeaders, Accept: "application/octet-stream" }
                });

                if (!fileResp.ok) {
                    console.warn(`Failed to fetch attachment ${att.id}:`, await fileResp.text());
                    continue;
                }

                const buffer = Buffer.from(await fileResp.arrayBuffer());

                const filePath = `${baseFolder}/${att.name}`;
                const encodedFilePath = encodeURIComponent(filePath);

                // Получаем upload_url
                const uploadUrlRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodedFilePath}&overwrite=true`, {
                    method: "GET",
                    headers: { Authorization: `OAuth ${diskToken}` }
                });
                const uploadData = await uploadUrlRes.json();
                const uploadUrl = uploadData.href;

                // Загружаем файл
                await fetch(uploadUrl, { method: "PUT", body: buffer });
                console.log(`Uploaded ${att.name} to Yandex.Disk`);

                // Публикуем и получаем публичную ссылку
                await fetch(`https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodedFilePath}`, {
                    method: "PUT",
                    headers: { Authorization: `OAuth ${diskToken}` }
                });

                const infoRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedFilePath}`, {
                    headers: { Authorization: `OAuth ${diskToken}` }
                });
                const info = await infoRes.json();
                if (info.public_url) links.push({ name: att.name, url: info.public_url });
            } catch (err) {
                console.error("Attachment upload error:", err);
            }
        }

        console.log("Public links:", links);

        // 5️⃣ Формируем письмо
        let bodyText = issue.description || "Нет описания";
        if (links.length > 0) {
            bodyText += "\n\nФайлы по задаче:\n" + links.map(l => `- ${l.name}: ${l.url}`).join("\n");
        }

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
            to: process.env.MAIL_TO,
            subject: `Re: ${issue.key}: ${issue.summary}`,
            text: bodyText
        };

        console.log("Sending email to:", mailOptions.to);
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);

        res.status(200).json({ success: true, filesUploaded: links.length, emailId: info.messageId });

    } catch (err) {
        console.error("Webhook handler error:", err);
        res.status(500).json({ error: err.message });
    }
}
