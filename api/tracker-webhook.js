import nodemailer from "nodemailer";

export default async function handler(req, res) {
    console.log("=== Tracker Webhook Triggered ===");
    try {
        if (req.method !== "POST") {
            console.warn("Invalid method:", req.method);
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { issueKey } = req.body;
        console.log("Received issueKey:", issueKey);

        if (!issueKey) {
            console.error("No issueKey in body");
            return res.status(400).json({ error: "No issueKey provided" });
        }

        const token = process.env.YANDEX_TRACKER_TOKEN;
        const orgId = process.env.YANDEX_ORG_ID;

        console.log("Using OrgId:", orgId);

        const headers = {
            "Authorization": `OAuth ${token}`,
            "X-Org-Id": orgId,
            "Content-Type": "application/json"
        };

        // === 1. Основная информация о задаче ===
        const issueResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}`, { headers });
        console.log("Issue API status:", issueResp.status);

        if (!issueResp.ok) {
            const text = await issueResp.text();
            console.error("Tracker issue error:", text);
            return res.status(issueResp.status).json({ error: "Failed to fetch issue", details: text });
        }
        const issue = await issueResp.json();
        console.log("Issue summary:", issue.summary);

        // === 2. Вложения ===
        const attachResp = await fetch(`https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments`, { headers });
        console.log("Attachments API status:", attachResp.status);

        let attachments = [];
        if (attachResp.ok) {
            const data = await attachResp.json();
            attachments = Array.isArray(data) ? data : [];
        } else {
            console.warn("No attachments, response:", await attachResp.text());
        }
        console.log("Found attachments:", attachments.length);

        // === 3. Скачиваем вложения ===
        const files = [];
        for (const att of attachments) {
            try {
                console.log(`Fetching attachment: ${att.name} (${att.id})`);
                const fileResp = await fetch(
                    `https://api.tracker.yandex.net/v2/issues/${issueKey}/attachments/${att.id}`,
                    { headers: { ...headers, Accept: "application/octet-stream" } }
                );
                if (fileResp.ok) {
                    const buffer = Buffer.from(await fileResp.arrayBuffer());
                    files.push({
                        filename: att.name,
                        content: buffer
                    });
                    console.log(`Attachment ${att.name} added (${buffer.length} bytes)`);
                } else {
                    console.warn(`Failed to fetch attachment ${att.id}:`, await fileResp.text());
                }
            } catch (err) {
                console.error("Attachment fetch error:", err);
            }
        }


        // === 4. Отправляем письмо ===
        console.log("Preparing email...");
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
            to: "iasvobodin@gmail.com", // TODO: заменить на реальный адрес
            subject: `Re: ${issue.key}: ${issue.summary}`, // важно для комментариев
            text: issue.description || "Нет описания",
            attachments: files
        };

        console.log("Sending email to:", mailOptions.to);
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);

        res.status(200).json({ success: true, sentFiles: files.length });
    } catch (err) {
        console.error("Webhook handler error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
}
