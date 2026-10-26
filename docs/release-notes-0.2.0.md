# NoteWithDesk 0.2.0 — дерево страниц, базы данных, доска и установщик

**Дата:** 26 октября 2026
**Установщик:** `NoteWithDesk-Setup-0.2.0.exe`

Крупное обновление: приложение стало ближе к Notion. Появились вложенные страницы и библиотека, базы данных с тремя представлениями и шаблонами, рисование на доске, обложки и полноценный установщик с версионированными сборками.

## 🆕 Новое

### Дерево страниц и библиотека
- Любая страница или доска может содержать подстраницы (`parentId`); ветки сворачиваются стрелкой.
- При наведении на элемент появляются «+» (мгновенная подстраница) и «•••» (действия).
- Контекстное меню: избранное, дублирование (доска — вместе с узлами и связями), переименование, «Открыть сбоку» (Side Peek), создание подстраницы/поддоски, удаление.
- Удаление уносит всё поддерево, а не оставляет осиротевшие страницы.
- Кликабельные хлебные крошки над открытой страницей.
- Вкладка «📚 Библиотека»: «Недавние», «⭐ Избранное», «Все файлы» — таблица с датой изменения и путём-источником.
- Действия в шапке: избранное, «На всю ширину», удаление.

### Базы данных
- Новый тип страницы — «База данных».
- Три представления: таблица, галерея карточек, календарь месяца.
- Типы колонок: текст, число, статус, дата, галочка; строки и колонки добавляются кнопками «+».
- В календаре на каждом дне есть «+», запись открывается и редактируется по клику.
- Модальное окно «Шаблоны» с живыми превью: Tasks Tracker, Projects, таблица финансов, учёба и оценки. Плюс пустая база.
- Кнопки быстрого старта внизу пустой страницы создают базу внутри неё в один клик.

### Доска
- Вместо нижней панели — мини-тулбар над стрелкой: цвет, пунктир, подпись, удаление.
- Точки привязки скрыты и появляются только при наведении на карточку.
- Свободное рисование маркером и ластиком поверх холста; штрихи сохраняются в базе.
- Текст без рамки — отдельный узел-подпись.
- Обрезка фото ✂️ прямо на доске: рамка → «Применить» → новый фрагмент, исходник не портится.

### Заметки
- Крупнее и комфортнее текст: 17 px, межстрочный интервал 1.85.
- Переключатель «На всю ширину» в шапке страницы; выбор запоминается.
- Обложка над заголовком: шесть градиентов или своя картинка.
- Обрезка картинок прямо в документе.

### Приложение и установка
- Тёмная иконка с открытой книгой и закладкой — `build/icon.ico`; подключена в Electron и electron-builder.
- NSIS-установщик: не one-click, можно выбрать папку установки, данные не удаляются при удалении приложения.
- Каждая сборка складывается в `releases/v<версия>`.
- Папка `data` хранится строго внутри папки установленной программы: установка новой версии поверх старой сохраняет заметки и картинки.
- Новые команды: `npm run app:icon`, `npm run app:build`.

## 🛠 Исправлено
- Заголовок страницы больше не раздувается на сотни пикселей при первом рендере и не задвигает редактор вниз — высота пересчитывается при изменении ширины.
- Новый узел на доске больше не скрывает все связи: узел сразу получает измеренные размеры.
- Цвета статусов стали осмысленными: «Готово» — зелёный, «В работе» — синий, «Не начато» — серый, «Расход» — красный.
- Выбранная связь подсвечивается толщиной, а не перекрашивается в синий — выбранный пользователем цвет сохраняется.
- В превью «Таблица финансов» столбцы графика снова нормальной высоты.

## ⚙️ Под капотом
- Схема Dexie осталась версии 2: все новые поля неиндексируемые, миграция не нужна, старые данные читаются как есть.
- Дерево работает поверх `pages.parentId` и `boards.parentId`, где родителем может быть и страница, и доска (`listTree`, `getTrail`, `archiveItemTree`).
- Формат JSON-бэкапа не изменился: старые копии импортируются.
- Обновлена документация: `docs/architecture.md` и `docs/roadmap.md`.

## ⬆️ Обновление с 0.1.0
- Установите 0.2.0 в ту же папку — `data` рядом с `.exe` не тронется.
- Установщик не подписан, поэтому SmartScreen может показать предупреждение.
- По умолчанию NSIS ставит приложение в профиль пользователя на диске C. Если данные нужны на другом диске, выберите папку установки на нём — `data` будет лежать рядом с `.exe`.

---

# NoteWithDesk 0.2.0 — Page Tree, Databases, Board Tools and Installer

**Date:** October 26, 2026
**Installer:** `NoteWithDesk-Setup-0.2.0.exe`

A large update that brings the app much closer to Notion: nested pages and a library, databases with three views and templates, freehand drawing on the board, covers, and a proper installer with versioned builds.

## 🆕 Added

### Page tree and library
- Any page or board can contain subpages (`parentId`); branches collapse with an arrow.
- Hovering a row reveals “+“ (instant subpage) and “•••” (actions).
- Context menu: favorite, duplicate (boards include nodes and edges), rename, “Open in side peek”, create subpage/subboard, delete.
- Deleting removes the whole subtree and never leaves orphaned pages behind.
- Clickable breadcrumbs above the open page.
- New “📚 Library” tab: Recent, ⭐ Favorites, All files — a table with the modified date and source path.
- Header actions: favorite, “Full width”, delete.

### Databases
- New page type: “Database”.
- Three views: table, card gallery, month calendar.
- Column types: text, number, status, date, checkbox; rows and columns are added with “+” buttons.
- Every calendar day has a “+”, and entries open for editing on click.
- Templates modal with live previews: Tasks Tracker, Projects, Finance, Courses & Grades, plus a blank database.
- Quick-start buttons at the bottom of an empty page create a database inside it in one click.

### Board
- The bottom edge panel is gone; a small toolbar appears above the arrow with color, dashed style, label and delete.
- Connection handles are hidden until the card is hovered.
- Freehand marker and eraser over the canvas; strokes are persisted.
- Borderless text is a separate node.
- ✂️ Image cropping on the board: draw a frame, hit Apply, and a new cropped asset is created without touching the original.

### Notes
- Larger, more comfortable body text: 17 px, line height 1.85.
- “Full width” toggle in the page header; the choice is remembered.
- Cover above the title: six gradients or your own image.
- Image cropping directly inside the document.

### App and installer
- Dark open-book icon with a bookmark — `build/icon.ico`; wired into Electron and electron-builder.
- NSIS installer: not one-click, install directory can be changed, app data is kept on uninstall.
- Each build goes to `releases/v<version>`.
- The `data` folder lives strictly inside the installed program folder, so installing a new version over the old one preserves notes and images.
- New scripts: `npm run app:icon`, `npm run app:build`.

## 🛠 Fixed
- The page title no longer grows to hundreds of pixels on first render and pushes the editor below the fold — its height is recalculated when the width changes.
- A newly added board node no longer hides every edge: nodes get measured dimensions immediately.
- Status colors are now meaningful: Done is green, In progress is blue, Not started is gray, Expense is red.
- A selected edge is highlighted by stroke width instead of being repainted blue, so the user’s chosen color survives.
- The Finance template preview shows properly sized bars again.

## ⚙️ Under the hood
- The Dexie schema stays at version 2: all new fields are unindexed, no migration is required, and existing data keeps working.
- The tree is built on `pages.parentId` and `boards.parentId`, where a parent can be either a page or a board (`listTree`, `getTrail`, `archiveItemTree`).
- The JSON backup format is unchanged: older backups still import.
- Documentation updated: `docs/architecture.md` and `docs/roadmap.md`.

## ⬆️ Upgrading from 0.1.0
- Install 0.2.0 into the same folder — the `data` folder next to the `.exe` is left untouched.
- The installer is unsigned, so SmartScreen may show a warning.
- By default NSIS installs into the user profile on drive C. If you want the data on another drive, pick an install folder there — `data` will sit next to the `.exe`.
