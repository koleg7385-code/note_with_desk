# NoteWithDesk 0.2.1 — доска, связи и итоги в базах

**Дата:** 26 октября 2026
**Установщик:** `NoteWithDesk-Setup-0.2.1.exe`

Точечное обновление по итогам аудита: доска стала удобнее (текст видно, связи тянутся с любой стороны, стрелки настраиваются, рисунок отменяется), а базы данных научились считать суммы.

## 🆕 Новое

### Доска
- Текстовый узел больше не теряется на фоне: постоянная рамка, при наведении — светлее, слева появилась ручка перетаскивания.
- Новый текстовый узел сразу готов к вводу: курсор уже в поле.
- На каждой из четырёх сторон узла теперь пара точек — выход и приём, с увеличенной зоной попадания (16×16). Тянуть связь можно откуда угодно и в любом направлении.
- Мини-тулбар стрелки переехал на `EdgeLabelRenderer`: позиционируется по самой кривой, а не поиском SVG-пути в DOM.
- В тулбаре стрелки появились толщина (2 px / 4 px) и кнопка «Развернуть стрелку»; пунктир и цвет остались.
- `Ctrl+Z` отменяет последний нарисованный штрих (и последнее стирание ластиком). `Backspace` больше не удаляет узел с доски — только `Delete`.
- Петли на себя и дубликаты связей не создаются.

### Базы данных
- Каждый шаблон сам объявляет свои вкладки. У «Таблицы финансов» осталась только таблица — галерея и календарь там были бесполезны.
- Календарь показывается только если в базе есть колонка с датой.
- В табличном виде появилась строка итогов: для каждой числовой колонки считается сумма.
- В финансовой базе итог считается как баланс: «Доход» прибавляется, «Расход» вычитается, «Перевод» не влияет. Отрицательный баланс подсвечивается красным.

## 🛠 Исправлено
- **Связи на доске больше не исчезают.** React Flow отбрасывал все стрелки, если у узлов не были измерены точки привязки, а замер откладывался в `requestAnimationFrame`, который в фоновой панели мог не сработать. Теперь замер выполняется синхронно после загрузки узлов и связей.
- Мини-тулбар стрелки не закрывается после смены цвета или толщины — выделение сохраняется при обновлении данных из базы.
- Подпись стрелки больше не перехватывает клики по самой линии.
- Точки привязки не мешают редактировать текст: они активны только при наведении на узел.

## ⚙️ Под капотом
- Схема Dexie не менялась: `DatabaseDoc.views` и `Edge.width` — неиндексируемые поля, миграция не нужна.
- Новая функция `availableViews(doc)` в `db/database.ts` решает, какие вкладки показывать.
- Новая функция `reverseEdge(id)` в `db/repo.ts` меняет местами узлы и точки привязки стрелки.
- Формат JSON-бэкапа не изменился.

## ⬆️ Обновление с 0.2.0
- Ставьте 0.2.1 в ту же папку — папка `data` рядом с `.exe` не тронется.
- Базы финансов, созданные до 0.2.1, сохранят прежний набор вкладок: ограничение «только таблица» задаётся шаблоном при создании.
- Установщик не подписан, поэтому SmartScreen может показать предупреждение.

---

# NoteWithDesk 0.2.1 — Board, Links and Database Totals

**Date:** October 26, 2026
**Installer:** `NoteWithDesk-Setup-0.2.1.exe`

A focused update based on the audit: the board is easier to use (text is visible, links can be dragged from any side, arrows are configurable, drawing can be undone), and databases can sum things up.

## 🆕 Added

### Board
- Text nodes no longer disappear into the background: a permanent frame that brightens on hover, plus a drag handle on the left.
- A newly created text node is ready to type in immediately — the cursor is already there.
- Every side of a node now has a pair of handles (out and in) with a larger 16×16 hit area. Links can be dragged from anywhere in any direction.
- The edge mini-toolbar now lives on `EdgeLabelRenderer`: it is positioned from the curve itself instead of querying the SVG path in the DOM.
- The toolbar gained thickness (2 px / 4 px) and a “Reverse arrow” button; dashed style and color are still there.
- `Ctrl+Z` undoes the last drawn stroke (and the last eraser pass). `Backspace` no longer deletes a node — only `Delete` does.
- Self-loops and duplicate links are rejected.

### Databases
- Each template declares its own tabs. Finance is table-only now — gallery and calendar were useless there.
- The calendar appears only when the database has a date column.
- The table view has a totals row: each number column shows its sum.
- In the finance database the total is a balance: income is added, expense is subtracted, transfer is ignored. A negative balance is highlighted in red.

## 🛠 Fixed
- **Board links no longer vanish.** React Flow dropped every edge when node handle bounds had not been measured, and the measurement was deferred to `requestAnimationFrame`, which might never run in a background panel. Measurement now happens synchronously after nodes and edges load.
- The edge toolbar stays open after changing color or thickness — selection survives database updates.
- The edge label no longer swallows clicks on the line itself.
- Handles no longer get in the way of editing text: they are active only while the node is hovered.

## ⚙️ Under the hood
- The Dexie schema is unchanged: `DatabaseDoc.views` and `Edge.width` are unindexed fields, no migration needed.
- New `availableViews(doc)` in `db/database.ts` decides which tabs to show.
- New `reverseEdge(id)` in `db/repo.ts` swaps an edge’s nodes and handles.
- The JSON backup format is unchanged.

## ⬆️ Upgrading from 0.2.0
- Install 0.2.1 into the same folder — the `data` folder next to the `.exe` is left untouched.
- Finance databases created before 0.2.1 keep their old tab set: the table-only restriction comes from the template at creation time.
- The installer is unsigned, so SmartScreen may show a warning.
