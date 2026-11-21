"""Read and update DING's stored layout without moving launcher files."""
import fcntl
import json
import os
import re
import sys
import tempfile
import time

from gi.repository import Gio, GLib

POSITION = 'metadata::nautilus-icon-position'
FLAGS = Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS
ATTRS = 'standard::type,standard::name,standard::is-hidden,standard::is-symlink,' + POSITION


def manual_layout():
    schema = Gio.SettingsSchemaSource.get_default().lookup('org.gnome.shell.extensions.ding', True)
    if not schema:
        return True
    settings = Gio.Settings.new_full(schema, None, None)
    return not any(schema.has_key(k) and settings.get_boolean(k) for k in ('keep-arranged', 'keep-stacked'))


def inventory(directory):
    rows = []
    listing = directory.enumerate_children(ATTRS, FLAGS, None)
    try:
        for info in listing:
            raw = info.get_attribute_string(POSITION) or ''
            if info.get_is_hidden() or not re.fullmatch(r'-?\d+,-?\d+', raw):
                continue
            name = info.get_name()
            x, y = map(int, raw.split(','))
            row = dict(name=name, x=x, y=y, launcher=False)
            rows.append(row)
            if (not name.endswith('.desktop') or info.get_is_symlink() or
                    info.get_file_type() != Gio.FileType.REGULAR):
                continue
            app = Gio.DesktopAppInfo.new_from_filename(directory.get_child(name).get_path())
            if app:
                identity = ' '.join([name, app.get_name(), os.path.basename(app.get_executable() or '')])
                icon = app.get_icon()
                row.update(launcher=True, icon=icon.to_string() if icon else '',
                           editor=bool(re.search(r'visual studio code|\bvs\s?code\b|\bcodex\b|\bcode\b',identity,re.I)))
    finally:
        listing.close(None)
    return rows


def changes(rows, args):
    by_name = {r['name']: r for r in rows if r['launcher']}
    def original(key):
        ref = args[key]
        row = by_name.get(ref['name'])
        if not row or (row['x'],row['y']) != (ref['x'],ref['y']):
            raise ValueError('layout changed')
        return row
    a = original('item')
    if args.get('other'):
        b = original('other')
        if a == b:
            raise ValueError('same launcher')
        return [(a,(b['x'],b['y'])), (b,(a['x'],a['y']))]
    x,y = args['dest']
    if any(abs(r['x']-x)<96 and abs(r['y']-y)<96 for r in rows):
        raise ValueError('occupied destination')
    return [(a,(x,y))]


def apply(directory, edits):
    done = []
    def saved(file):
        return file.query_info(POSITION, FLAGS, None).get_attribute_string(POSITION)
    def write(file, value):
        if not file.set_attribute_string(POSITION,value,FLAGS,None):
            raise ValueError('position write failed')
    try:
        for row, dest in edits:
            file = directory.get_child(row['name'])
            before = f"{row['x']},{row['y']}"
            after = f'{dest[0]},{dest[1]}'
            if saved(file) != before:
                raise ValueError('layout changed')
            write(file, after)
            done.append((file,before,after))
        # A visible directory entry creates real folder-monitor events even for
        # read-only launchers. Remove only our uniquely created temporary file.
        with tempfile.NamedTemporaryFile(dir=directory.get_path(), prefix='Dushnila-refresh-'):
            pass
        time.sleep(0.75)
        for file, before, after in done:
            actual = saved(file)
            if actual == before or not actual:
                raise ValueError(f'{file.get_basename()}: position reverted')
            dx, dy = map(int, after.split(','))
            x, y = map(int, actual.split(','))
            if abs(x-dx) > 64 or abs(y-dy) > 64:
                raise ValueError(f'{file.get_basename()}: expected {after}, got {actual}')
    except (ValueError,OSError,GLib.Error):
        for file,before,after in reversed(done):
            if saved(file) == after:
                write(file,before)
        raise
    return True


def main():
    args = json.loads(sys.argv[1])
    path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP)
    if not path or path == os.path.expanduser('~'):
        return None
    directory = Gio.File.new_for_path(path)
    if args['action'] == 'list':
        return dict(rows=inventory(directory),manual=manual_layout())
    if args['action'] != 'move' or not manual_layout():
        return False
    fd = os.open(path,os.O_RDONLY | os.O_DIRECTORY)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX | fcntl.LOCK_NB)
        return apply(directory, changes(inventory(directory),args))
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except (OSError, ValueError, GLib.Error, AttributeError) as err:
        print(json.dumps({'error': str(err)}))
