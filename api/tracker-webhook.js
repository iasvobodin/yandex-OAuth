import nodemailer from "nodemailer";

export default async function handler(req, res) {
    console.log("=== Tracker Webhook Triggered ===");

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { issueKey } = req.body;
        if (!issueKey) return res.status(400).json({ error: "No issueKey provided" });
        console.log("Received issueKey:", issueKey);
        const trigger = req.headers["x-tracker-trigger"];
        console.log("Trigger:", trigger);
        console.log("Body:", req.body);
        console.log("Headers:", req.headers);
        const trackerToken = process.env.YANDEX_TRACKER_TOKEN;
        const orgId = process.env.YANDEX_ORG_ID;
        const diskToken = process.env.YANDEX_TRACKER_TOKEN;

        const trackerHeaders = {
            "Authorization": `OAuth ${trackerToken}`,
            "X-Org-Id": orgId,
            "Content-Type": "application/json"
        };

        // 1️⃣ Получаем данные задачи
        const issueResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}`, { headers: trackerHeaders });
        if (!issueResp.ok) throw new Error(await issueResp.text());
        const issue = await issueResp.json();
        console.log("Issue summary:", issue.summary);

        // 2️⃣ Получаем email поставщика из локального поля
        // Название поля берём как "supplier_email", если оно пустое — fallback
        const supplierEmail = issue.customFields?.supplier_email?.value || "iasvobodin@gmail.com";
        console.log("Supplier email:", supplierEmail);

        // 3️⃣ Получаем вложения
        const attachResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments`, { headers: trackerHeaders });
        const attachments = attachResp.ok ? (await attachResp.json()) : [];
        console.log("Found attachments:", attachments.length);

        // 4️⃣ Создаём папку на Диске
        const folderName = issueKey;
        const baseFolder = `Системы ТАУ - Общее/Фото ТАУ контроль/${folderName}`;
        const encodedBaseFolder = encodeURIComponent(baseFolder);

        const checkFolderRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
            method: "GET",
            headers: { Authorization: `OAuth ${diskToken}` }
        });

        if (checkFolderRes.status === 404) {
            await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
                method: "PUT",
                headers: { Authorization: `OAuth ${diskToken}` }
            });
            await new Promise(r => setTimeout(r, 500));
        }

        // 5️⃣ Загружаем файлы на Диск
        for (const att of attachments) {
            try {
                const fileResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}/content`, {
                    headers: { ...trackerHeaders, Accept: "application/octet-stream" }
                });
                if (!fileResp.ok) continue;

                const buffer = Buffer.from(await fileResp.arrayBuffer());
                const safeFileName = encodeURIComponent(att.name);
                const filePath = `${encodedBaseFolder}/${safeFileName}`;

                const uploadUrlRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources/upload?path=${filePath}&overwrite=true`, {
                    method: "GET",
                    headers: { Authorization: `OAuth ${diskToken}` }
                });
                const uploadData = await uploadUrlRes.json();
                if (!uploadUrlRes.ok || !uploadData.href) continue;

                await fetch(uploadData.href, { method: "PUT", body: buffer });
                console.log(`Uploaded ${att.name}`);
            } catch (err) {
                console.error("Attachment upload error:", err);
            }
        }

        // 6️⃣ Публикуем папку и получаем публичный URL
        await fetch(`https://cloud-api.yandex.net/v1/disk/resources/publish?path=${encodedBaseFolder}`, {
            method: "PUT",
            headers: { Authorization: `OAuth ${diskToken}` }
        });

        const infoRes = await fetch(`https://cloud-api.yandex.net/v1/disk/resources?path=${encodedBaseFolder}`, {
            headers: { Authorization: `OAuth ${diskToken}` }
        });
        const folderUrl = (await infoRes.json()).public_url;
        console.log("Folder public URL:", folderUrl);

        // 7️⃣ Отправка письма
        let bodyText = issue.description || "Нет описания";
        if (folderUrl) bodyText += `\n\nВсе файлы по задаче доступны здесь:\n${folderUrl}`;

        const transporter = nodemailer.createTransport({
            host: "smtp.yandex.ru",
            port: 465,
            secure: true,
            auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
        });

        const mailOptions = {
            from: `"QC TAU" <${process.env.MAIL_USER}>`,
            to: supplierEmail,
            subject: `Re: ${issue.key}: ${issue.summary}`,
            text: bodyText
        };

        const infoMail = await transporter.sendMail(mailOptions);
        console.log("Email sent:", infoMail.messageId);

        res.status(200).json({ success: true, folderUrl, emailId: infoMail.messageId });

    } catch (err) {
        console.error("Webhook handler error:", err);
        res.status(500).json({ error: err.message });
    }
}
