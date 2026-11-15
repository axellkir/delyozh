# ДЕЛЁЖ

Пошаговая стратегия про Москву 90-х в духе «Героев»: карта, герои, города, тактический бой.
Сейчас — 2–3 игрока по очереди за одним компьютером.

Играть: https://delyozh.axellkir.tech

## Локально

```bash
npm install
npm start        # http://localhost:8777
npm test         # бот доигрывает три партии в Chrome без окна
```

Сборки нет: `index.html` + `js/*.js`, обычные скрипты с общими глобалами. `npm run build` только
кладёт копию в `dist/` и вписывает номер версии.

## Выпуск версии

```bash
npm run release              # 0.1.0 → 0.1.1
BUMP=minor npm run release   # 0.1.1 → 0.2.0
```

Команда ставит тег `vX.Y.Z` и пушит его. Дальше GitHub Actions (`.github/workflows/release.yml`):
тесты → архив в Releases → выкладка на сервер → проверка, что сервер отдаёт эту версию.
Номер версии виден в правом нижнем углу меню.

Обычный пуш в `main` только прогоняет тесты (`ci.yml`), на сервер ничего не уходит.

## Сервер

nginx отдаёт `/var/www/delyozh`, конфиг — `deploy/nginx-delyozh.conf`. Выкладывает пользователь
`deploy`: его ключ умеет только писать в папку сайта. Ключ и адрес лежат в секретах репозитория
(`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) и переменных (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_DOMAIN`).

Планы — в [docs/BACKLOG.md](docs/BACKLOG.md).
