import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const sections = {
    "Стук по экрану": [
        "auto-knock",
        "minutes",
        "sound"
    ],
    "Берсерк": [
        "rage",
        "clicks",
        "rage-seconds",
        "hold-seconds"
    ],
    "Рабочий стол": [
        "icons",
        "jumps",
        "jump-every",
        "stories"
    ],
    "Реакции": [
        "glasses",
        "ssh",
        "chat"
    ]
};

export default class Preferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);
        for (const [title, keys] of Object.entries(sections)) {
            const group = new Adw.PreferencesGroup({title});
            page.add(group);
            for (const key of keys) {
                const spec = settings.settings_schema.get_key(key);
                const row = new Adw.ActionRow({title: spec.get_summary()});
                group.add(row);
                let control, property;
                if (spec.get_default_value().get_type_string() === 'b') {
                    control = new Gtk.Switch();
                    property = 'active';
                } else {
                    const [low, high] = spec.get_range().get_child_value(1).get_variant().deep_unpack();
                    control = Gtk.SpinButton.new_with_range(low, high, 1);
                    control.set_value(settings.get_int(key));
                    control.connect('value-changed', () => settings.set_int(key, control.get_value_as_int()));
                    const handler = settings.connect('changed::' + key, () => control.set_value(settings.get_int(key)));
                    window.connect('close-request', () => { settings.disconnect(handler); return false; });
                }
                control.valign = Gtk.Align.CENTER;
                row.add_suffix(control);
                row.activatable_widget = control;
                if (property) settings.bind(key, control, property, Gio.SettingsBindFlags.DEFAULT);
            }
        }
    }
}
