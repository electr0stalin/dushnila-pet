#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
uuid=dushnila@desktop.local
data="${XDG_DATA_HOME:-$HOME/.local/share}"
dest="$data/dushnila-pet-desktop"
ext="$data/gnome-shell/extensions/$uuid"
install -d "$ext/frames" "$ext/sounds" "$dest" "$data/applications"
install -d "$ext/schemas"
install -m644 shell/schemas/*.xml "$ext/schemas/"
glib-compile-schemas --strict "$ext/schemas"
install -m644 shell/{prefs.js,metadata.json,extension.js,activities.js,rearrange.js,brain.js,frameBounds.js,desktop.py} "$ext/"
install -m644 shell/frames/*.svg shell/frames/*.png "$ext/frames/"
install -m644 shell/sounds/*.wav "$ext/sounds/"
install -m644 ssh.bash "$dest/"
hook='[ -r "${XDG_DATA_HOME:-$HOME/.local/share}/dushnila-pet-desktop/ssh.bash" ] && . "${XDG_DATA_HOME:-$HOME/.local/share}/dushnila-pet-desktop/ssh.bash"'
if ! grep -Fqx -- "$hook" "$HOME/.bashrc" 2>/dev/null; then
    printf '\n%s\n' "$hook" >> "$HOME/.bashrc"
fi
install -m755 launch.sh "$dest/"
install -m644 icon.png "$dest/"
app="$data/applications/dushnila-pet.desktop"
python3 - "$dest" "$app" <<'PY'
from pathlib import Path
import sys
base, out=map(Path,sys.argv[1:])
def desktop_string(s):
    return s.replace('\\','\\\\').replace('\n','\\n').replace('\r','\\r')
exec_path = str(base/'launch.sh').replace('%','%%')
for c in ('\\','"','`','$'):
    exec_path = exec_path.replace(c,'\\'+c)
exe = '"' + desktop_string(exec_path) + '"'
out.write_text(f"""[Desktop Entry]
Type=Application
Name=Душнила
Comment=Позвать питомца на рабочий стол
Exec={exe}
Icon={desktop_string(str(base/'icon.png'))}
Terminal=false
Categories=Game;
Actions=Settings;Stop;

[Desktop Action Settings]
Name=Настройки Душнилы
Exec=gnome-extensions prefs dushnila@desktop.local

[Desktop Action Stop]
Name=Убрать питомца
Exec={exe} stop
""", encoding='utf-8')
PY
desk=$(xdg-user-dir DESKTOP 2>/dev/null || true)
if [ -n "$desk" ] && [ "$desk" != "$HOME" ]; then
    install -d "$desk"
    install -m755 "$app" "$desk/dushnila-pet.desktop"
    gio set "$desk/dushnila-pet.desktop" metadata::trusted true 2>/dev/null || true
fi
printf '%s\n' 'Установлено. Ярлык «Душнила» появился в меню приложений.'
if command -v gnome-extensions >/dev/null && gnome-extensions info "$uuid" >/dev/null 2>&1; then
    "$dest/launch.sh"
else
    printf '%s\n' 'Для первой загрузки расширения выйди из сеанса Ubuntu, войди снова и нажми ярлык.'
fi
