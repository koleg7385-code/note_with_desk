/**
 * Мост в десктопную оболочку Electron: там сохранение и открытие файла идут
 * через системные диалоги, чтобы файлы не оказывались самопроизвольно на диске C.
 * В браузере работают обычные скачивание и выбор файла.
 */
export interface DesktopBridge {
  saveJson(name: string, text: string): Promise<boolean>
  openJson(): Promise<string | null>
  platform: string
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

export const isDesktop = () => Boolean(window.desktop)

export async function saveTextFile(name: string, text: string): Promise<boolean> {
  if (window.desktop) return window.desktop.saveJson(name, text)

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export function openTextFile(): Promise<string | null> {
  if (window.desktop) return window.desktop.openJson()

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}