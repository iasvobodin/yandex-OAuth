// Проверка авторизации
export const checkAuthStatus = async (
  log: (msg: string) => void
): Promise<boolean> => {
  try {
    const res = await fetch("/api/auth", { method: "HEAD" });
    if (res.ok) {
      log("✅ Авторизация успешна!");
      return true;
    } else {
      log("⚠️ Требуется авторизация.");
      return false;
    }
  } catch (err) {
    log("❌ Произошла ошибка при проверке авторизации.");
    return false;
  }
};

// Получение URL для загрузки
export const getUploadHref = async (
  filename: string,
  folderName: string,
  subfolderName: string
  //   log: (msg: string) => void
): Promise<{ href: string; path: string; savedAs: string }> => {
  const resp = await fetch("/api/get-upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: folderName,
      subfolder: subfolderName,
      filename,
    }),
    credentials: "same-origin",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Ошибка получения upload URL: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data;
};

// Проверка очередей
export const checkQueues = async (
  log: (msg: string) => void
): Promise<void> => {
  try {
    const res = await fetch("/api/get-queues", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      const names = data.map((item: any) => item.name);
      log(`✅ Очереди получены`);
      log(JSON.stringify(names, null, 2));
    } else {
      log("⚠️ Что-то не так при получении очередей");
    }
  } catch (err) {
    log("❌ Произошла ошибка работы с трекером");
  }
};
