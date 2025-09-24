// utils/helpers.js

export function getCookie(cookieHeader, name) {
  const cookies = cookieHeader?.split(";") || [];
  for (const cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieValue || "");
    }
  }
  return null;
}

export function getRandomSuffix(length = 3) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getMimeTypeFromExtension(filePath) {
  const extension = (filePath.split(".").pop() || "").toLowerCase();
  const mimeMap = {
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
    heif: "image/heic"
  };
  return mimeMap[extension] || "application/octet-stream";
}

export function buildClaimEmail(issue) {
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
    yourCompany: "ООО Системы ТАУ"
  };

  const mailData = {};
  for (const key of Object.keys(defaults)) {
    const customKey = Object.keys(issue).find(k => k.endsWith(key));
    mailData[key] = customKey ? issue[customKey] : defaults[key];
  }

  const subject = `Re: ${issue.key}: ${issue.summary}`;

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

  const bodyHtml = `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#000">

  <!-- ENGLISH VERSION -->
  <p>Dear <b>${mailData.recipientName}</b>,</p>
  <p>This letter serves as a formal complaint regarding a discrepancy in the quality of the products we received on <b>${mailData.invoiceNumber}</b>.</p>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Product Details</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Manufacturer Part Number</td><td style="padding:5px">${mailData.manufacturerPartNumber}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Quantity</td><td style="padding:5px">${mailData.quantity}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Serial Numbers</td><td style="padding:5px">${mailData.serialNumbers}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Description</td><td style="padding:5px">${mailData.description}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Part Number</td><td style="padding:5px">${mailData.mpProductNumber}</td></tr>
  </table>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Description of Discrepancy</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Defect Description</td><td style="padding:5px">${mailData.discrepancyDescription}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Additional Information</td><td style="padding:5px">The defect was identified during ${mailData.typeOfProduction}</td></tr>
  </table>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Proposed Actions</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Proposed Action 1</td><td style="padding:5px">${mailData.proposedAction1}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Proposed Action 2</td><td style="padding:5px">${mailData.proposedAction2}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Response Timeframe</td><td style="padding:5px">${mailData.responseTimeframe} business days</td></tr>
  </table>

  <p><b>Attachments:</b> ${mailData.attachments}</p>
  <p>We look forward to your prompt response.</p>
  <p>Sincerely,<br>${mailData.yourName}<br>${mailData.yourPosition}<br>${mailData.yourCompany}</p>

  <hr style="margin:20px 0;border:none;border-top:1px solid #ccc">

  <!-- RUSSIAN VERSION -->
  <p><b>Уважаемый(-ая) ${mailData.recipientName},</b></p>
  <p>Настоящим письмом мы официально предъявляем претензию относительно несоответствия качества продукции, которую мы получили <b>${mailData.invoiceNumber}</b>.</p>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Детали продукции</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Партномер производителя</td><td style="padding:5px">${mailData.manufacturerPartNumber}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Количество</td><td style="padding:5px">${mailData.quantity}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Серийные номера</td><td style="padding:5px">${mailData.serialNumbers}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Описание</td><td style="padding:5px">${mailData.description}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Артикул</td><td style="padding:5px">${mailData.mpProductNumber}</td></tr>
  </table>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Описание несоответствия</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Описание дефекта</td><td style="padding:5px">${mailData.discrepancyDescription}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Дополнительная информация</td><td style="padding:5px">Дефект был обнаружен во время ${mailData.typeOfProduction}</td></tr>
  </table>

  <h3 style="border-bottom:1px solid #ccc;padding-bottom:3px">Предлагаемые действия</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:15px">
    <tr><td style="padding:5px;font-weight:bold">Предлагаемое действие 1</td><td style="padding:5px">${mailData.proposedAction1}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Предлагаемое действие 2</td><td style="padding:5px">${mailData.proposedAction2}</td></tr>
    <tr><td style="padding:5px;font-weight:bold">Срок ответа</td><td style="padding:5px">${mailData.responseTimeframe} рабочих дней</td></tr>
  </table>

  <p><b>Приложения:</b> ${mailData.attachments}</p>
  <p>Мы ждем вашего скорейшего ответа.</p>
  <p>С уважением,<br>${mailData.yourName}<br>${mailData.yourPosition}<br>${mailData.yourCompany}</p>
</div>
`

  return { to: mailData.supplierEmail, subject, bodyText, bodyHtml };
}
