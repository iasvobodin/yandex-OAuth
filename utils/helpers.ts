// utils/helpers.ts

export function getCookie(
  cookieHeader: string | undefined,
  name: string
): string | null {
  const cookies = cookieHeader?.split(";") || [];
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieValue || "");
    }
  }
  return null;
}

export function getRandomSuffix(length: number = 3): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getMimeTypeFromExtension(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    // HEIC и HEIF
    heic: "image/heic",
    heif: "image/heic",
  };
  return mimeMap[extension] || "application/octet-stream";
}

export function buildClaimEmail(issue: any) {
  const defaults = {
    supplierEmail: "supplier@example.com",
    claimNumber: "CLAIM-12345",
    recipientName: "Mr. Ivanov",
    invoiceNumber: "INV-56789",
    manufacturerPartNumber: "ABC-1001",
    quantity: 10,
    serialNumbers: "SN001, SN002, SN003",
    description: "Power module 24V",
    mpProductNumber: "MP-2400",
    discrepancyDescription: "Overheating during test",
    typeOfProduction: "incoming inspection",
    responseTimeframe: 5,
    proposedAction1: "Full replacement of defective items",
    proposedAction2: "Repair at your cost",
    attachments: "test protocol, defect photos",
    yourName: "Ivan Svobodin",
    yourPosition: "QC Engineer",
    yourCompany: "ООО Системы ТАУ",
  };

  const mailData: Record<string, any> = {};
  for (const key of Object.keys(defaults)) {
    const customKey = Object.keys(issue).find((k) => k.endsWith(key));
    mailData[key] = customKey
      ? issue[customKey]
      : defaults[key as keyof typeof defaults];
  }

  const subject = `Re: ${issue.key}: ${issue.summary}`;

  // 📌 plain text
  const bodyText = `
Dear ${mailData.recipientName},
This letter serves as a formal complaint regarding a discrepancy in the quality of the products we received on ${mailData.invoiceNumber}. We have identified an issue with the following item(s) and require your immediate attention to resolve this matter.
________________________________________
Product Details
• Manufacturer Part Number: ${mailData.manufacturerPartNumber}
• Quantity: ${mailData.quantity}
• Serial Numbers: ${mailData.serialNumbers}
• Description: ${mailData.description}
• PartNumber: ${mailData.mpProductNumber}
________________________________________
Description of Discrepancy
• Defect Description: ${mailData.discrepancyDescription}
• Additional Information: The defect was identified during ${mailData.typeOfProduction}.
________________________________________
Proposed Actions
To rectify this issue, we propose the following solutions and expect a response within ${mailData.responseTimeframe} business days.
• Proposed Action 1: ${mailData.proposedAction1}
• Proposed Action 2: ${mailData.proposedAction2} by necessity

Attachments: Please find the attached documents for your reference, including ${mailData.attachments}.
We look forward to your prompt response.
Sincerely,
${mailData.yourName} ${mailData.yourPosition} ${mailData.yourCompany}

---

Уважаемый(-ая) ${mailData.recipientName},
Настоящим письмом мы официально предъявляем претензию относительно несоответствия качества продукции, которую мы получили ${mailData.invoiceNumber}. Мы обнаружили проблему со следующими изделиями и просим вашего незамедлительного внимания для урегулирования этой ситуации.
________________________________________
Детали продукции
• Партномер производителя: ${mailData.manufacturerPartNumber}
• Количество: ${mailData.quantity}
• Серийные номера: ${mailData.serialNumbers}
• Описание: ${mailData.description}
• Артикул : ${mailData.mpProductNumber}
________________________________________
Описание несоответствия
• Описание дефекта: ${mailData.discrepancyDescription}
• Дополнительная : Дефект был обнаружен во время ${mailData.typeOfProduction}.
________________________________________
Предлагаемые действия
Для исправления данной ситуации мы предлагаем следующие варианты решения и ожидаем ответа в течение ${mailData.responseTimeframe} рабочих дней.
• Предлагаемое действие 1: ${mailData.proposedAction1}
• Предлагаемое действие 2: ${mailData.proposedAction2} по необходимости

Приложения: К письму прилагаются следующие документы для ознакомления: ${mailData.attachments}.
Мы ждем вашего скорейшего ответа.
С уважением,
${mailData.yourName} ${mailData.yourPosition} ${mailData.yourCompany}
`;

  // 📌 html версия (с таблицами для читабельности)
  const bodyHtml = `
  <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.4">
    <p>Dear <b>${mailData.recipientName}</b>,</p>
    <p>This letter serves as a formal complaint regarding a discrepancy in the quality of the products we received on <b>${mailData.invoiceNumber}</b>.</p>
    <h3>Product Details</h3>
    <ul>
      <li><b>Manufacturer Part Number:</b> ${mailData.manufacturerPartNumber}</li>
      <li><b>Quantity:</b> ${mailData.quantity}</li>
      <li><b>Serial Numbers:</b> ${mailData.serialNumbers}</li>
      <li><b>Description:</b> ${mailData.description}</li>
      <li><b>PartNumber:</b> ${mailData.mpProductNumber}</li>
    </ul>
    <h3>Description of Discrepancy</h3>
    <ul>
      <li><b>Defect Description:</b> ${mailData.discrepancyDescription}</li>
      <li><b>Additional Information:</b> The defect was identified during ${mailData.typeOfProduction}</li>
    </ul>
    <h3>Proposed Actions</h3>
    <ul>
      <li>Proposed Action 1: ${mailData.proposedAction1}</li>
      <li>Proposed Action 2: ${mailData.proposedAction2} by necessity</li>
    </ul>
    <p><b>Attachments:</b> ${mailData.attachments}</p>
    <p>We look forward to your prompt response.</p>
    <p>Sincerely,<br>
    ${mailData.yourName}<br>
    ${mailData.yourPosition}<br>
    ${mailData.yourCompany}</p>
    <hr>
    <p><b>Уважаемый(-ая) ${mailData.recipientName},</b></p>
    <p>Настоящим письмом мы официально предъявляем претензию относительно несоответствия качества продукции, которую мы получили <b>${mailData.invoiceNumber}</b>.</p>
    <h3>Детали продукции</h3>
    <ul>
      <li><b>Партномер производителя:</b> ${mailData.manufacturerPartNumber}</li>
      <li><b>Количество:</b> ${mailData.quantity}</li>
      <li><b>Серийные номера:</b> ${mailData.serialNumbers}</li>
      <li><b>Описание:</b> ${mailData.description}</li>
      <li><b>Артикул:</b> ${mailData.mpProductNumber}</li>
    </ul>
    <h3>Описание несоответствия</h3>
    <ul>
      <li><b>Описание дефекта:</b> ${mailData.discrepancyDescription}</li>
      <li><b>Дополнительная:</b> Дефект был обнаружен во время ${mailData.typeOfProduction}</li>
    </ul>
    <h3>Предлагаемые действия</h3>
    <ul>
      <li>Предлагаемое действие 1: ${mailData.proposedAction1}</li>
      <li>Предлагаемое действие 2: ${mailData.proposedAction2} по необходимости</li>
    </ul>
    <p><b>Приложения:</b> ${mailData.attachments}</p>
    <p>Мы ждем вашего скорейшего ответа.</p>
    <p>С уважением,<br>
    ${mailData.yourName}<br>
    ${mailData.yourPosition}<br>
    ${mailData.yourCompany}</p>
  </div>
`;

  return { to: mailData.supplierEmail, subject, bodyText, bodyHtml };
}
