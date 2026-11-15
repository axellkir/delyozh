# Чем можно усилить дизайн: библиотеки, инструменты, скиллы

Поиск от 15 ноября 2026. Что уже взято в игру, что стоит взять и от чего лучше отказаться.

## Взято

| Что | Зачем | Лицензия |
|---|---|---|
| **Press Start 2P** | Пиксельный шрифт заголовков. У него нормальная кириллица (латиница, кириллица, греческий) | SIL OFL 1.1, файлы и лицензия в `assets/fonts/` |

## Стоит попробовать

| Что | Зачем | Замечания |
|---|---|---|
| **PixelLab** | Генерация пиксельных персонажей с анимацией по скелету и поворотами на 4–8 направлений — то, чего не хватает нашим двухкадровым бойцам | По условиям сервиса автор владеет результатом и может использовать его коммерчески; нужно соблюдать Open RAIL-M. Перед использованием перечитать условия своего тарифа |
| **Retro Diffusion** | Генерация пиксель-арта и анимаций, есть HTTP API и плагин для Aseprite | Заявлено использование в личных и коммерческих проектах; сами условия сервиса я не читал — проверить перед использованием |
| **Aseprite** | Редактор пиксель-арта: дорисовать и поправить то, что выдала нейросеть, собрать анимации | Платный, де-факто стандарт |
| **ZzFX / ZzFXM** | Крошечный синтезатор звуков и музыки без файлов, с редактором звуков в браузере | У нас уже свой синтез на Web Audio; ZzFX пригодится, если захочется быстро накрутить много разных эффектов |
| **jsfxr** | Порт sfxr: ретро-звуки с готовыми пресетами (монетка, взрыв, прыжок) | То же назначение, что ZzFX |

## Не берём

| Что | Почему |
|---|---|
| **Pixelify Sans** | В кириллице ошибки: перепутаны К и Ќ, строчная «б» выглядит как цифра 6 |
| **NES.css, 98.css, RPGUI, snes.css** | Готовые ретро-наборы интерфейса. Перекрашивают все кнопки и окна разом и тянут свои шрифты без кириллицы. Приёмы оттуда (пиксельные рамки, «вдавленные» кнопки) проще повторить в своём CSS под стиль игры |

## Скиллы и плагины Claude

Специальных плагинов под игры и пиксель-арт в каталоге нет. Из общих дизайнерских:

- **Design** (уже включён): `design-critique` — разбор экрана по иерархии, читаемости и согласованности; `accessibility-review` — контраст и управление с клавиатуры.
- **frontend-design** (Anthropic) — скилл для аккуратной вёрстки интерфейсов.
- **UI Design Review** (сообщество) — смотрит на отрисованный экран на телефоне и десктопе и выдаёт список правок по важности.

## Источники

- [Cyrillic on Google Fonts: Display typefaces, part 2 — type.today](https://type.today/en/journal/display2)
- [Handjet — v-fonts.com](https://v-fonts.com/tags/C40)
- [10 retro CSS frameworks — dev.to](https://dev.to/khangnd/10-retro-css-frameworks-to-relive-your-childhood-nph)
- [NES.css](https://best-of-web.builder.io/library/nostalgic-css/NES.css), [98.css](https://best-of-web.builder.io/library/jdan/98.css), [snes.css](https://www.npmjs.com/package/snes.css)
- [PixelLab — Terms of Service](https://www.pixellab.ai/termsofservice)
- [Best AI Pixel Art and Sprite Generators for Games in 2026 — Cinevva](https://app.cinevva.com/guides/ai-pixel-art-generators)
- [Retro Diffusion — API examples](https://github.com/Retro-Diffusion/api-examples), [страница на itch.io](https://astropulse.itch.io/retrodiffusion)
- [ZzFX — npm](https://npmjs.com/package/zzfx), [ZzFXM](https://keithclark.co.uk/articles/zzfxm/), [jsfxr](https://sfxr.me)
