#!/usr/bin/env bash
set -eu
uuid=dushnila@desktop.local
inform() {
    printf '%s\n' "$1" >&2
    if command -v notify-send >/dev/null; then notify-send 'Душнила' "$1" || true; fi
}
if ! command -v gnome-extensions >/dev/null; then
    inform 'Этот выпуск работает в GNOME Shell. Выбери сеанс Ubuntu или GNOME на экране входа.'
    exit 1
fi
if ! gnome-extensions info "$uuid" >/dev/null 2>&1; then
    inform 'Выйди из учётной записи Ubuntu, войди снова и нажми ярлык «Душнила».'
    exit 1
fi
if [ "${1:-}" = stop ]; then
    gnome-extensions disable "$uuid"
else
    if [ "$(gsettings get org.gnome.shell disable-user-extensions)" = true ]; then
        inform 'В приложении «Расширения» включи общий переключатель и снова нажми ярлык.'
        exit 1
    fi
    gnome-extensions enable "$uuid"
    if ! LC_ALL=C gnome-extensions info "$uuid" | grep -Eq 'State: (ACTIVE|ENABLED)'; then
        inform 'GNOME не активировал питомца. Проверь состояние в приложении «Расширения».'
        exit 1
    fi
fi
