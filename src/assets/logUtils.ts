import { type Ref } from "vue";

// Ограниченный лог (максимум 100 строк)
export const createLogger = (outputLog: Ref<string>) => {
  const maxLines = 100;
  const log = (msg: string) => {
    const lines = outputLog.value.split("\n");
    if (lines.length >= maxLines) {
      lines.shift(); // Удаляем первую строку
    }
    outputLog.value = [...lines, msg].join("\n");
    console.log(msg);
  };
  return log;
};

// Очистка лога
export const clearLog = (outputLog: Ref<string>) => {
  outputLog.value = "";
};
