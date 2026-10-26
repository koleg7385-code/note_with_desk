const { app, BrowserWindow, dialog, ipcMain, net, protocol } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

// ЖЁСТКОЕ ПРАВИЛО: база и профиль Chromium живут в папке data строго внутри папки
// установленной программы. Установщик новой версии кладёт файлы в ту же папку,
// а data/ не трогает — поэтому обновление поверх старой версии сохраняет заметки.
// В режиме разработки папка данных лежит в корне проекта.
const installDir = app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..')
const dataPath = path.join(installDir, 'data')

fs.mkdirSync(dataPath, { recursive: true })

app.setPath('userData', dataPath)
app.setPath('sessionData', dataPath)
app.setAppUserModelId('local.note-with-desk')

const isDev = !app.isPackaged && !process.env.NWD_PROD
const smoke = Boolean(process.env.NWD_SMOKE)
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const distDir = path.join(__dirname, '..', 'dist')

// Своя схема вместо file://: у страницы появляется настоящий origin,
// иначе браузерный движок отказывает IndexedDB на локальных файлах.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    backgroundColor: '#191919',
    autoHideMenuBar: true,
    show: !smoke,
    title: 'Заметки и доска',
    // Иконка окна (в установленной версии её же берёт ярлык из exe).
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  if (isDev) {
    window.loadURL(devServerUrl)
  } else {
    window.loadURL('app://local/index.html')
  }

  window.webContents.on('did-finish-load', () => {
    console.log(`[electron] окно загружено, данные: ${dataPath}`)
    // Самопроверка: база должна открываться на выбранном origin, иначе local-first не работает.
    // Даём React смонтироваться и Dexie создать базу, иначе список всегда пустой.
    const inspect = async () => {
      try {
        const bodyLength = await window.webContents.executeJavaScript('document.body.innerText.length')
        const databases = await window.webContents.executeJavaScript(
          'indexedDB.databases().then((list) => list.map((item) => item.name))',
        )
        console.log(
          `[electron] страница: ${bodyLength} символов, базы в профиле: ${JSON.stringify(databases)}`,
        )
      } catch (error) {
        console.error('[electron] IndexedDB недоступна:', error)
      }
      if (smoke) setTimeout(() => app.quit(), 300)
    }

    if (smoke) setTimeout(inspect, 2500)
    else inspect()
  })
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
    const filePath = path.join(distDir, relative)

    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Экспорт и импорт идут через системные диалоги: пользователь сам решает, куда писать.
  ipcMain.handle('backup:save', async (_event, payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Сохранить базу',
      defaultPath: path.join(installDir, payload.name),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePath) return false
    await fs.promises.writeFile(filePath, payload.text, 'utf8')
    return true
  })

  ipcMain.handle('backup:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Открыть базу',
      defaultPath: installDir,
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (canceled || !filePaths[0]) return null
    return fs.promises.readFile(filePaths[0], 'utf8')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})