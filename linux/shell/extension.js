import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import {frameBounds} from './frameBounds.js';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {KnockClock, knockFrame, crossing, stories, storyPhase, isGoogleChat} from './activities.js';
import {planMove,moveProgress} from './rearrange.js';
import {Brain, makeSpeaker} from './brain.js';

const anim = {idle:[0,0,1],walk:[4,5],hello:[2,3],annoyed:[3,7],rage:[7,6],chase:[4,5],hold:[7,3],tired:[8,9],sleep:[10,11]};
const boxes = [[66, 15, 135, 191], [67, 15, 135, 191], [52, 15, 139, 191], [63, 18, 164, 191], [56, 12, 145, 187], [62, 13, 142, 186], [59, 11, 144, 189], [51, 11, 168, 187], [46, 54, 158, 190], [43, 61, 153, 190], [14, 80, 177, 181], [16, 69, 177, 182]];
const hot = new Set(['rage','chase','hold']);
export default class Dushnila extends Extension {
    enable() {
        this.launchers = [];
        this.sceneNumber = 0;
        this.settings = this.getSettings();
        const resetKnock = () => {
            this.knockClock = new KnockClock(GLib.get_monotonic_time()/1e6, this.settings.get_int('minutes') * 60);
        };
        resetKnock();
        this.settingsSignal = this.settings.connect('changed', (_settings, key) => {
            if (key === 'minutes' || key === 'auto-knock') resetKnock();
            if (key === 'rage' && !this.settings.get_boolean(key) && hot.has(this.brain?.state)) this.endRage();
        });
        this.moveNumber = 0;
        this.manualLayout = false;
        this.jobs = new Set();
        this.nextScan = 0;
        this.drag = null;
        this.sprites = new Map();
        this.body = new St.Icon({reactive:false, icon_size:164, width:164, height:164});
        this.bubble = new St.Label({reactive:false, style:'font-weight:bold;font-size:14px;color:#232420;background-color:#fff4d8;border:2px solid #272722;border-radius:10px;padding:5px 9px;'});
        this.prop = new St.Icon({icon_size:44, reactive:false});
        Main.layoutManager.addTopChrome(this.prop, {affectsStruts:false});
        this.prop.hide();
        this.accessory = new St.Label({reactive:false, style:'font-size:36px;'});
        Main.layoutManager.addTopChrome(this.accessory, {affectsStruts:false});
        this.accessory.hide();
        this.storyIndex = 0;
        this.storyAt = GLib.get_monotonic_time() + 75000000;
        this.memoryDir = GLib.build_filenamev([GLib.get_user_state_dir(), 'dushnila-pet']);
        this.memoryPath = GLib.build_filenamev([this.memoryDir, 'wakeups']);
        this.wakeups = 0;
        try {
            const [ok, bytes] = GLib.file_get_contents(this.memoryPath);
            const count = Number(new TextDecoder().decode(bytes));
            if (ok && Number.isSafeInteger(count) && count > 0) this.wakeups = count;
        } catch (_) { /* First run. */ }
        this.partner = new St.Icon({icon_size:44, reactive:false});
        Main.layoutManager.addTopChrome(this.partner,{affectsStruts:false});
        this.partner.hide();
        Main.layoutManager.addTopChrome(this.body, {affectsStruts:false});
        this.glasses = new St.Icon({reactive:false, icon_size:26,
            gicon:new Gio.FileIcon({file:this.dir.get_child('frames').get_child('glasses.svg')})});
        Main.layoutManager.addTopChrome(this.glasses, {affectsStruts:false});
        this.glasses.hide();
        const cueDir = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'dushnila-pet']);
        GLib.mkdir_with_parents(cueDir, 0o700);
        this.sshCue = GLib.build_filenamev([cueDir, 'ssh']);
        GLib.unlink(this.sshCue);
        this.hitbox = new St.Widget({reactive:true});
        Main.layoutManager.addTopChrome(this.hitbox, {affectsStruts:false});
        Main.layoutManager.addTopChrome(this.bubble, {affectsStruts:false});
        this.bubble.hide();
        const m = Main.layoutManager.primaryMonitor ?? {x:0,y:0,width:800,height:600};
        this.pet = {x:m.x + m.width*.73,y:m.y + m.height - 145,dir:-1};
        this.monitorsChanged = Main.layoutManager.connect('monitors-changed', () => {
            const monitors = Main.layoutManager.monitors;
            if (!monitors.length) return;
            if (this.brain?.crossing || this.brain?.route?.kind) this.brain.calm();
            if (!monitors.some(q => this.pet.x>=q.x && this.pet.x<q.x+q.width &&
                this.pet.y>=q.y && this.pet.y<q.y+q.height)) {
                const q = Main.layoutManager.primaryMonitor ?? monitors[0];
                this.pet.x = q.x + q.width/2;
                this.pet.y = q.y + q.height/2;
            }
        });
        this.nextChatCheck = 0;
        this.chatSeen = false;
        this.speak = makeSpeaker();
        this.brain = new Brain(kind => this.say(this.speak(kind)));
        this.hitbox.connect('button-press-event', (_a,e) => {
            if (e.get_button() === 3 && !hot.has(this.brain.state) && !this.drag &&
                (e.get_state() & Clutter.ModifierType.SHIFT_MASK)) {
                this.openPreferences();
            } else if (e.get_button() === 1 && (e.get_state() & Clutter.ModifierType.CONTROL_MASK)) {
                if (this.brain.canKnock() || this.brain.state === 'story') this.startStory();
            } else if (e.get_button() === 1 && (e.get_state() & Clutter.ModifierType.SHIFT_MASK)) {
                if (!this.brain.canKnock() || !this.settings.get_boolean('icons')) return Clutter.EVENT_STOP;
                const r = this.chooseMove();
                if (r) {
                    this.brain.route = r;
                    this.brain.enter('approach');
                } else if (!this.manualLayout) {
                    this.say('Расстановка недоступна. Проверь настройки DING и журнал Душнилы.');
                } else {
                    this.say('Нет доступного ярлыка. Открой рабочий стол и передвинь ярлык .desktop вручную.');
                }
            } else if (e.get_button() === 2) {
                this.brain.knock(this.controls);
            } else if (e.get_button() === 3) {
                if (this.drag?.moved) this.dropPet();
                this.drag = null;
                this.release();
                this.brain.calm();
                this.say('Ладно. Живи пока.');
            } else if (e.get_button() === 1 && !hot.has(this.brain.state)) {
                const [x,y] = e.get_coords();
                this.drag = {x,y,moved:false};
            }
            return Clutter.EVENT_STOP;
        });
        this.hitbox.connect('motion-event', (_a,e) => {
            if (!this.drag) return Clutter.EVENT_PROPAGATE;
            const [x,y] = e.get_coords();
            const d = this.drag;
            if (!d.moved && Math.hypot(x-d.x,y-d.y)>7) {
                d.moved = true;
                d.started = GLib.get_monotonic_time();
                this.grab = global.stage.grab(this.hitbox);
                this.brain.enter('idle');
                this.bubble.hide();
            }
            if (d.moved) {
                this.pet.x=x;
                this.pet.y=y+37;
                this.paint();
            }
            return Clutter.EVENT_STOP;
        });
        this.hitbox.connect('button-release-event', (_a,e) => {
            if (e.get_button() === 1 && this.drag) {
                if (!this.drag.moved) {
                    const sleeping = this.brain.state === 'sleep';
                    if (this.brain.state === 'story' && this.story === 'faint' && this.phase === 1) {
                        this.brain.enter('hello');
                        this.say('Чего надо?');
                    } else {
                        this.brain.click(this.settings.get_boolean('rage'), this.settings.get_int('clicks'),
                            this.settings.get_boolean('glasses'));
                        if (this.brain.state === 'rage')
                            this.rageUntil = GLib.get_monotonic_time() + this.settings.get_int('rage-seconds') * 1e6;
                    }
                    if (sleeping) {
                        this.wakeups++;
                        try {
                            GLib.mkdir_with_parents(this.memoryDir, 0o700);
                            GLib.file_set_contents(this.memoryPath, String(this.wakeups));
                        } catch (err) { console.warn(err); }
                        if (this.wakeups > 1) this.say('Опять будишь? Уже ' + this.wakeups + '-й раз!');
                    }
                }
                if (this.drag.moved) this.dropPet();
                this.drag=null;
            }
            return Clutter.EVENT_STOP;
        });
        this.controls = {
            sound: () => { if (this.settings.get_boolean('sound')) this.playSound('window_knock02.wav'); },
            jumpEvery: () => this.settings.get_int('jump-every'),
            crossing: () => this.settings.get_boolean('jumps') && crossing(this.pet,this.monitor(this.pet.x,this.pet.y),Main.layoutManager.monitors),
            plan: () => this.plan(),
            visible: r => this.visible(r),
            animateMove: (r,age,pet) => this.animateMove(r,age,pet),
            commitMove: (r,done) => this.commitMove(r,done),
            catch: () => {
                this.grab = global.stage.grab(this.hitbox);
                this.holdTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.settings.get_int('hold-seconds') * 1000, () => {
                    this.holdTimer = 0;
                    this.endRage();
                    return GLib.SOURCE_REMOVE;
                });
            },
            pin: () => this.warp(this.pet.x,this.pet.y),
        };
        this.lastFrame = null;
        this.last = GLib.get_monotonic_time();
        this.say('руки мыл?');
        this.paint();
        this.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 32, () => {
            try {
                const now = GLib.get_monotonic_time();
                const dt = Math.min(.1,(now-this.last)/1e6);
                this.last = now;
                if (hot.has(this.brain.state) && now >= this.rageUntil) this.endRage();
                if (now >= this.nextScan) {
                    this.nextScan = now + 18000000;
                    this.queryDesktop({action:'list'}, data => { if (data?.error) console.warn('Душнила: ' + data.error); this.launchers = data?.rows ?? []; this.manualLayout = data?.manual === true; });
                }
                if (this.drag && (Main.sessionMode.isLocked || Main.overview.visible)) {
                    if (this.drag.moved) this.dropPet();
                    this.drag = null;
                }
                const [x,y] = global.get_pointer();
                const m = this.monitor(this.pet.x,this.pet.y);
                if (!m) return GLib.SOURCE_CONTINUE;
                const available = !this.drag && !Main.sessionMode.isLocked && !Main.overview.visible && this.brain.canKnock();
                if (this.brain.state === 'hold' && (Main.sessionMode.isLocked || Main.overview.visible)) {
                    this.release();
                    this.brain.calm();
                }
                if (this.settings.get_boolean('auto-knock') && this.knockClock.due(now/1e6, available && this.brain.canKnock())) this.brain.knock(this.controls);
                if (now >= this.nextChatCheck) {
                    this.nextChatCheck = now + 250000;
                    const canReact = available && !['sleep','tired','knock'].includes(this.brain.state);
                    if (canReact && GLib.file_test(this.sshCue, GLib.FileTest.EXISTS) && GLib.unlink(this.sshCue) === 0) {
                        if (this.settings.get_boolean('ssh')) {
                            this.brain.enter('helmet');
                            this.bubble.hide();
                        }
                    }
                    const win = global.display.focus_window;
                    const chat = this.settings.get_boolean('chat') && isGoogleChat(win?.get_title(), win?.get_wm_class(), win?.get_wm_class_instance?.());
                    if (!chat) this.chatSeen = false;
                    else if (!this.chatSeen && canReact && this.brain.state !== 'helmet') {
                        this.chatSeen = true;
                        this.brain.enter('pockets','chat');
                    }
                }
                if (available && this.brain.state === 'idle' && now >= this.storyAt)
                    this.startStory();
                if (!this.drag) this.brain.step(dt,this.pet,{x,y},{left:m.x+48,right:m.x+m.width-48},this.controls);
                this.paint();
                return GLib.SOURCE_CONTINUE;
            } catch (err) {
                this.release();
                this.timer = 0;
                console.error(err);
                Main.notify('Душнила', 'Ошибка анимации. Подробности в журнале GNOME Shell.');
                return GLib.SOURCE_REMOVE;
            }
        });
    }
    endRage() {
        this.release();
        this.brain.clicks = 0;
        this.brain.enter('sleep');
    }
    startStory() {
        if (!this.settings.get_boolean('stories')) return;
        const names = Object.keys(stories);
        this.story = names[this.storyIndex++ % names.length];
        this.phase = -1;
        this.storyAt = GLib.get_monotonic_time() + (90 + Math.random()*90)*1e6;
        this.brain.enter('story');
    }
    playSound(filename) {
        const path = this.dir.get_child('sounds').get_child(filename).get_path();
        const players = [
            ['pw-play', path], ['paplay', path], ['aplay', '-q', path],
            ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'error', path],
        ];
        this.runPlayers(players, 'Не удалось воспроизвести ' + filename + '. Проверь аудиовыход и проигрыватель.');
    }
    runPlayers(players, failureMessage) {
        const jobs = this.jobs;
        const tryNext = () => {
            while (players.length) {
                const [name,...args] = players.shift();
                const exe = GLib.find_program_in_path(name);
                if (!exe) continue;
                try {
                    const job = Gio.Subprocess.new([exe,...args], Gio.SubprocessFlags.NONE);
                    jobs.add(job);
                    job.wait_check_async(null, (proc,result) => {
                        if (!jobs.delete(proc)) return;
                        try { proc.wait_check_finish(result); }
                        catch (error) {
                            console.warn('Душнила: ' + name + ': ' + error.message);
                            tryNext();
                        }
                    });
                    return;
                } catch (error) { console.warn('Душнила: ' + name + ': ' + error.message); }
            }
            if (failureMessage) Main.notify('Душнила', failureMessage);
        };
        tryNext();
    }
    queryDesktop(args, callback) {
        let job;
        try {
            job = Gio.Subprocess.new(['/usr/bin/python3', this.dir.get_child('desktop.py').get_path(),
                JSON.stringify(args)], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            // A started two-file commit must finish even if the extension is disabled.
            const jobs = this.jobs;
            if (args.action !== 'move') jobs.add(job);
            job.communicate_utf8_async(null, null, (process, result) => {
                if (args.action === 'move' ? (!this.brain || jobs !== this.jobs) : !jobs.delete(process)) return;
                try {
                    const [,out] = process.communicate_utf8_finish(result);
                    callback(JSON.parse(out));
                } catch { callback(null); }
            });
        } catch { callback(null); }
    }
    visible(r) {
        if (Main.overview.visible || Main.sessionMode.isLocked) return false;
        return !global.get_window_actors().some(actor => {
            const win = actor.meta_window;
            if (!actor.visible || !win || !win.showing_on_its_workspace() ||
                !win.located_on_workspace(global.workspace_manager.get_active_workspace()) ||
                win.get_window_type() === Meta.WindowType.DESKTOP ||
                win.get_wm_class()?.toLowerCase().includes('desktop-icons')) return false;
            const rect = win.get_frame_rect();
            return r.cx >= rect.x && r.cx < rect.x + rect.width &&
                r.cy >= rect.y && r.cy < rect.y + rect.height;
        });
    }
    plan() {
        const m = this.monitor(this.pet.x,this.pet.y);
        const editorTurn = (++this.sceneNumber % 2) === 0;
        if (!editorTurn) {
            const move = this.chooseMove();
            if (move) return move;
        }
        const candidates = this.launchers.filter(t => t.launcher && t.editor && editorTurn && t.x >= m.x && t.x < m.x+m.width-52 &&
            t.y >= m.y && t.y < m.y+m.height-56 &&
            this.visible({cx:t.x+44,cy:t.y+40}));
        const item = candidates[Math.floor(Math.random()*candidates.length)];
        if (!item) {
            if (!editorTurn) return null;
            const apps = Shell.AppSystem.get_default();
            const app = ['code.desktop','code_code.desktop','code-insiders.desktop',
                'com.visualstudio.code.desktop','codex.desktop','com.openai.codex.desktop']
                .map(id => apps.lookup_app(id)).find(Boolean);
            if (!app) return null;
            this.prop.gicon = app.get_app_info()?.get_icon() ?? new Gio.ThemedIcon({name:'application-x-executable'});
            const cx = Math.max(m.x+105,Math.min(m.x+m.width-105,this.pet.x + this.pet.dir*135));
            const cy = Math.max(m.y+110,Math.min(m.y+m.height-66,this.pet.y+44));
            const facing = cx < m.x+m.width/2 ? -1 : 1;
            const r = {cx,cy,x:cx-facing*46,y:cy-27,facing,editor:true,item:null,offset:0};
            return this.visible(r) ? r : null;
        }
        const cx = item.x+44;
        const cy = item.y+40;
        const facing = cx < m.x+m.width/2 ? -1 : 1;
        const r = {cx,cy,x:cx-facing*46,y:Math.max(m.y+82,Math.min(m.y+m.height-82,cy-27)),
            facing,editor:true,item,offset:0};
        return this.visible(r) ? r : null;
    }
    chooseMove() {
        if (!this.manualLayout || !this.settings.get_boolean('icons')) return null;
        const kinds = ['swap','boot','transfer'];
        for (let n=0; n<kinds.length; n++) {
            const kind = kinds[this.moveNumber++ % kinds.length];
            const route = planMove(kind,this.launchers,Main.layoutManager.monitors,this.pet,r=>this.visible(r));
            if (route) {
                const icon = item => {
                    try { if (item.icon) return Gio.Icon.new_for_string(item.icon); } catch {}
                    return new Gio.ThemedIcon({name:'application-x-executable'});
                };
                this.prop.gicon = icon(route.item);
                if (route.other) this.partner.gicon = icon(route.other);
                return route;
            }
        }
        return null;
    }
    animateMove(r,age,pet) {
        const p = moveProgress(r,age);
        const dx=r.dest[0]-r.item.x, dy=r.dest[1]-r.item.y;
        const cx=r.cx+dx*p, cy=r.cy+dy*p;
        if (!this.visible({cx,cy}) || !this.visible({cx:r.dest[0]+44,cy:r.dest[1]+40})) return -1;
        const arc=4*p*(1-p);
        const lift=r.kind==='boot'?65*arc:0;
        this.prop.set_position(Math.round(cx-22),Math.round(cy-22-lift));
        this.prop.rotation_angle_z=r.kind==='boot'?r.facing*36*arc:0;
        if (r.other)
            this.partner.set_position(Math.round(r.dest[0]+22-dx*p), Math.round(r.dest[1]+18-dy*p-48*arc));
        if (r.kind!=='boot') {
            pet.x=r.x+dx*p;
            pet.y=r.y+dy*p;
            if (p===1) {
                const m=this.monitor(r.dest[0]+44,r.dest[1]+40);
                pet.x=Math.max(m.x+48,Math.min(m.x+m.width-48,pet.x));
                pet.y=Math.max(m.y+82,Math.min(m.y+m.height-82,pet.y));
            }
        }
        return p;
    }
    commitMove(r,done) {
        this.queryDesktop({action:'move',item:r.item,other:r.other,dest:r.dest}, ok => {
            this.nextScan=0;
            if (ok?.error) console.warn('Душнила: ' + ok.error);
            done(ok===true);
            if (ok !== true) this.say('Не удалось переместить ярлык. Подробности в журнале Душнилы.');
        });
    }
    monitor(x,y) {
        return Main.layoutManager.monitors.find(m => x>=m.x && y>=m.y && x<m.x+m.width && y<m.y+m.height)
            ?? Main.layoutManager.primaryMonitor;
    }
    warp(x,y) {
        const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
        backend.get_default_seat().warp_pointer(Math.round(x),Math.round(y));
    }
    say(text) {
        this.bubble.text = text;
        this.until = GLib.get_monotonic_time() + 2400000;
        this.bubble.show();
    }
    paint() {
        let scene = null;
        if (this.brain.state === 'story') {
            scene = storyPhase(this.story, this.brain.age);
            if (!scene) this.brain.enter('idle');
            else if (scene.index !== this.phase) {
                this.phase = scene.index;
                if (scene.line) this.say(scene.line);
                else this.bubble.hide();
            }
        }
        const {state,age} = this.brain;
        const fps = hot.has(state) ? 9 : state==='walk' ? 5 : 1.8;
        const order = anim[state] ?? [0];
        let frame = order[Math.floor(age*fps)%order.length];
        if (['walk','approach','lineup','runup'].includes(state)) frame = 'w'+(Math.floor(this.brain.distance/10)%8);
        if (state === 'helmet') {
            const phase = [0.25,0.7,1.15,1.75,2.4].filter(limit => age >= limit).length;
            frame = 'hardhat' + phase;
        }
        if (state === 'knock') frame = age < 1.85 ? knockFrame(age) : 3;
        if (state === 'flight') frame = 'air';
        if (state === 'landing') frame = 'land';
        if (state === 'smoke') frame = age%3 < 1.15 ? 'inhale' : 'exhale';
        if (state === 'point' || state === 'push') frame = 'point';
        const r = this.brain.route;
        if (state === 'haul' || state === 'settle') {
            if (r.kind==='boot') frame = age<.38 && state==='haul' ? 'windup' : 'boot';
            else frame = 'shove'+(Math.floor(age*4)%2);
        }
        if (state==='proud') frame='proud';
        if (state === 'laugh') frame = 'laugh';
        if (scene) frame = scene.frame;
        if (state === 'blind') {
            const origin = this.brain.glassesOrigin ?? this.pet;
            const fall = Math.min(1, age/.55);
            this.glasses.set_position(Math.round(origin.x-12 + origin.dir*Math.min(32,(origin.reach ?? 112)*.32)*fall),
                Math.round(origin.y-57 + 120*fall*fall));
            this.glasses.rotation_angle_z = origin.dir*15*fall;
            this.glasses.show();
            const colorFrame = Math.floor((age-4.3)*10) % 16;
            if (age < .7 || (age >= 7.2 && age < 8.4)) frame = 'look';
            else if (age >= 3.9 && age < 4.3) frame = 'stumble';
            else if (age >= 4.3 && age < 6.5) frame = 'fallen' + colorFrame;
            else if (age >= 6.5 && age < 7.2) frame = 'rising' + colorFrame;
            else frame = 'search' + (Math.floor(this.brain.distance/10) % 8);
        } else this.glasses.hide();
        if (state === 'pickup') frame = 'pickup';
        if (state === 'wipe') frame = 'wipe' + (Math.floor(age*5)%2);
        if (state === 'puton') frame = age < 1.15 ? 'puton' : 0;
        if (state === 'pockets') frame = age < .4 || age > 3 ? 'pockets0' : 'pockets1';
        if (this.drag?.moved) {
            const seconds = (GLib.get_monotonic_time()-this.drag.started)/1e6;
            frame = 'carry' + [0,1,2,1][Math.floor(seconds*4)%4];
        }
        const lift = scene && this.story === 'ufo' && scene.index === 1
            ? Math.sin(Math.PI * scene.t) : 0;
        if (scene?.prop) {
            this.accessory.text = scene.prop;
            const overhead = this.story === 'ufo';
            this.accessory.set_position(this.pet.x + (overhead ? -20 : 28),
                this.pet.y + (overhead ? -90 : -36));
            this.accessory.show();
        } else this.accessory.hide();
        this.body.opacity = Math.round(255 * (1-lift));
        const key = (hot.has(state)?'h':'') + frame;
        const moving = state==='haul' || state==='settle';
        if (moving && r.other) this.partner.show(); else this.partner.hide();
        if (moving) {
            if (state==='haul' && age===0) this.animateMove(r,0,this.pet);
            this.prop.show();
        } else if (r && !r.item && this.visible(r)) {
            this.prop.rotation_angle_z=0;
            if (state === 'push') r.offset = Math.min(1,age/.65)*29*r.facing;
            this.prop.set_position(Math.round(r.cx-22+r.offset), Math.round(r.cy-22));
            this.prop.show();
        } else this.prop.hide();
        if (key !== this.lastFrame) {
            if (!this.sprites.has(key)) {
                const file = this.dir.get_child('frames').get_child(key+'.png');
                this.sprites.set(key,new Gio.FileIcon({file}));
            }
            this.body.gicon = this.sprites.get(key);
            this.lastFrame = key;
        }
        this.body.set_pivot_point(.5,.5);
        this.body.scale_x = (['pickup','blind','walk','chase','approach','point','push','laugh','lineup','runup','flight','landing','haul','settle'].includes(state)) && this.pet.dir>0 ? -1 : 1;
        this.body.set_position(Math.round(this.pet.x-82),Math.round(this.pet.y-82));
        this.body.translation_y = state === 'laugh' ? -Math.abs(Math.sin(age*12))*3 : -60*lift;
        this.body.rotation_angle_z = state === 'laugh' ? Math.sin(age*12)*2 : 0;
        const box = frameBounds[frame] ?? boxes[frame];
        const left = this.body.scale_x < 0 ? 200-box[2] : box[0];
        this.hitbox.set_position(Math.round(this.pet.x-82+left*.82), Math.round(this.pet.y-82+box[1]*.82));
        this.hitbox.set_size(Math.ceil((box[2]-box[0])*.82), Math.ceil((box[3]-box[1])*.82));
        if (state==='sleep') {this.bubble.text='z Z z';this.bubble.show();}
        else if (this.until < GLib.get_monotonic_time()) this.bubble.hide();
        if (this.bubble.visible) {
            const m = this.monitor(this.pet.x,this.pet.y);
            const [,w] = this.bubble.get_preferred_width(-1);
            this.bubble.set_position(Math.round(Math.max(m.x,Math.min(m.x+m.width-w,this.pet.x-w/2))),
                Math.round(this.pet.y < m.y+125 ? this.pet.y+75 : this.pet.y-112));
        }
    }
    dropPet() {
        this.release();
        const [x,y] = global.get_pointer();
        const m = this.monitor(x,y);
        if (m) {
            this.pet.x = Math.max(m.x+48, Math.min(m.x+m.width-48, x));
            this.pet.y = Math.max(m.y+82, Math.min(m.y+m.height-82, y+37));
        }
    }
    release() {
        if (this.holdTimer) GLib.Source.remove(this.holdTimer);
        this.holdTimer = 0;
        this.grab?.dismiss();
        this.grab = null;
    }
    disable() {
        this.settings.disconnect(this.settingsSignal);
        this.settings = null;
        if (this.monitorsChanged) Main.layoutManager.disconnect(this.monitorsChanged);
        this.monitorsChanged = 0;
        if (this.timer) GLib.Source.remove(this.timer);
        this.timer = 0;
        this.release();
        for (const job of this.jobs) job.force_exit();
        this.jobs.clear();
        this.glasses?.destroy();
        this.accessory?.destroy();
        this.partner?.destroy();
        this.prop?.destroy();
        this.bubble?.destroy();
        this.body?.destroy();
        this.hitbox?.destroy();
        this.hitbox = null;
        this.body = this.bubble = this.brain = this.sprites = this.controls = null;
    }
}
