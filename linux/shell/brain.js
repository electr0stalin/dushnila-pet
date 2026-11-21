export const originals = ['тебя в гугле забанили?', 'кому интересно твоё мнение?', 'руки мыл?', 'потом днище порвет!', 'у меня всё работает!'];
const jokes = {
    glasses: ['МАКС!!!!'],
    helmet: ['Вперёд в прод!'],
    found: ['Анттиценности какие-то'],
    chat: ['вот дебилы'],
    proud: ['так-то получше будет'],
    knock: ['курить пойдешь ?'],
    jump: ['Держи монитор, я прыгаю!', 'Мигрирую в соседнюю зону.', 'Там пиксели свежее.', 'Балансировщик решил, что мне туда.'],
    click: ['Тикет завёл или просто тычешь?', 'У тебя на мышке только одна кнопка?', 'Ты так и в прод деплоишь?', 'Логи читали. Они тоже против.', 'О, эксперт по нажатию кнопок.', 'Пять минут без меня продержишься?', 'Опять чинишь прод силой мысли?', 'Это фича. Баг у нас по четвергам.', 'Твой YAML опять пробел потерял.', 'Сначала кофе. Потом твой инцидент.', 'Мне тоже нужен доступ. К тишине.', 'На моей машине даже ты работаешь.', "Опять мышкой по продакшену ходишь?", "На шестой клик нужен аппрув.", "Ты меня в избранное добавь, раз так часто заходишь.", "В тикете так и напиши: само нажалось.", "У тебя кнопка залипла или я нравлюсь?", "Я тебе кто, кнопка Retry?"],
    smoke: ['Пайплайн идёт. Успею на перекур.', 'У меня технологический перерыв.', 'Пока образ тянется, посижу.', "Чай остынет. Прод подождёт.", "Сижу, наблюдаю за нагрузкой. Своей.", "Кофе кончился. Осталась философия."],
    push: ['Подвинься. Тут моё место.', 'Всё, миграция закончена.', 'Кто так парковал ярлыки?', "Подвинься на один пиксель. Ладно, на сто.", "Здесь по плану зона отдыха."],
    mock: ['такое еще кто-то использует ?!'],
    rage: ['Всё. Теперь моя очередь кликать.', 'Мышку на стол. Медленно.', "Теперь ты проходишь капчу.", "Кто тут заказывал ручное управление?"],
    hold: ['Мышь изъята до ревью.', 'Курсор на испытательном сроке.', "Мышку заберу под расписку.", "Стой. У тебя курсор без пропуска."],
    kick: ['Иди покликай в staging.', 'Откатил твой курсор.', "Передал мышь следующей смене.", "Лови обратную связь."],
    tired: ['Всё, у меня обед по SLA.', 'На этот цирк лимиты кончились.', "Всё. Горизонтальное масштабирование.", "Устал быть единственным, кто тут бегает."],
    wake: ['Это был плановый простой.', 'Кто снял меня с техработ?', "А дежурный точно я?", "Пять минуточек. Это оценка в рабочих днях."],
};
export function makeSpeaker(random = Math.random) {
    const bags = {};
    function draw(key, lines) {
        if (!bags[key]?.length) {
            bags[key] = [...lines];
            for (let i = lines.length - 1; i > 0; --i) {
                const j = Math.floor(random() * (i + 1));
                [bags[key][i], bags[key][j]] = [bags[key][j], bags[key][i]];
            }
        }
        return bags[key].pop();
    }
    let original = false;
    return kind => {
        if (kind === 'click' && (original = !original))
            return draw('original', originals);
        return draw(kind, jokes[kind]);
    };
}

export class Brain {
    constructor(say) {
        this.say = say;
        this.clicks = 0;
        this.energy = 100;
        this.route = null;
        this.distance = 0;
        this.walks = 0;
        this.enter('idle');
    }
    enter(state, line) {
        if (state !== 'blind') this.glassesOrigin = null;
        if (state === 'helmet') this.helmetLine = false;
        this.state = state;
        if (!['approach','push','haul','settle','point','laugh','smoke'].includes(state)) this.route = null;
        if (!['lineup','runup','flight','landing'].includes(state)) this.crossing = null;
        this.age = 0;
        if (line) this.say(line);
    }
    calm() {
        this.clicks = 0;
        this.enter('idle');
    }
    click(rage = true, threshold = 16, glasses = true) {
        if (this.state === 'sleep') {
            this.energy = Math.max(52, this.energy);
            this.clicks = 0;
            this.enter('hello','wake');
        } else if (['idle','walk','hello','annoyed','approach','push','point','laugh','smoke','blind','pickup','wipe','puton','pockets'].includes(this.state)) {
            this.clicks++;
            if (rage && this.clicks >= threshold) this.enter('rage','rage');
            else if (glasses && this.clicks === 10) this.enter('blind','glasses');
            else if (!['blind','pickup','wipe','puton'].includes(this.state)) this.enter(this.clicks >= 7 ? 'annoyed' : 'hello','click');
        }
    }
    canKnock() {
        return ['idle','walk','smoke','approach','point','push','laugh','sleep','hello','annoyed','tired'].includes(this.state);
    }
    knock(controls) {
        if (!this.canKnock()) return;
        this.enter('knock','knock');
        controls.sound();
    }
    step(dt, pet, target, bounds, controls) {
        this.age += dt;
        switch (this.state) {
        case 'idle':
            if (this.age >= 4) {
                this.walks++;
                const jumpEvery = controls.jumpEvery();
                if (this.walks % jumpEvery === Math.ceil(jumpEvery/2) % jumpEvery && (this.crossing = controls.crossing())) {
                    const {start} = this.crossing;
                    const nearEdge = Math.hypot(start.x-pet.x,start.y-pet.y)<105;
                    this.enter(nearEdge ? 'lineup' : 'runup','jump');
                } else if (this.walks % 2 === 0) {
                    this.route = controls.plan();
                    this.enter(this.route ? 'approach' : 'smoke', this.route ? null : 'smoke');
                } else this.enter('walk');
            }
            break;
        case 'hello': case 'annoyed':
            if (this.age >= 2.5) this.enter('idle');
            break;
        case 'walk':
            const step = 72 * Math.min(1, this.age * 4, Math.max(.2,(3-this.age)*4)) * dt;
            this.distance += step;
            pet.x += pet.dir * step;
            if (pet.x <= bounds.left || pet.x >= bounds.right) {
                pet.x = Math.min(bounds.right, Math.max(bounds.left, pet.x));
                pet.dir *= -1;
            }
            this.energy -= dt;
            if (this.energy <= 0) this.enter('tired','tired');
            else if (this.age >= 3) this.enter('idle');
            break;
        case 'blind': {
            if (!this.glassesOrigin) {
                const roomLeft = pet.x - bounds.left;
                const roomRight = bounds.right - pet.x;
                const dir = roomLeft < 115 ? 1 : roomRight < 115 ? -1 : pet.dir;
                this.glassesOrigin = {x:pet.x, y:pet.y, dir,
                    reach:Math.max(0, Math.min(112, dir > 0 ? roomRight : roomLeft))};
            }
            const origin = this.glassesOrigin;
            const t = this.age;
            const move = (start, end, from, to) => from + (to-from) *
                Math.max(0, Math.min(1, (t-start)/(end-start)));
            let offset = 0, dir = origin.dir;
            if (t < 2.1) offset = move(.7, 2.1, 0, 1);
            else if (t < 4.3) {
                offset = t < 3.9 ? move(2.1,3.9,1,.32) : move(3.9,4.3,.32,.08);
                dir = -origin.dir;
            } else if (t < 8.4) {
                offset = .08;
                dir = t < 7.8 ? -origin.dir : origin.dir;
            } else if (t < 9.6) offset = move(8.4,9.6,.08,.82);
            else {
                offset = move(9.6,10.8,.82,0);
                dir = -origin.dir;
            }
            const next = Math.min(bounds.right, Math.max(bounds.left, origin.x + offset*origin.reach*origin.dir));
            this.distance += Math.abs(next-pet.x);
            pet.x = next;
            pet.dir = dir;
            if (t >= 10.8) {
                pet.dir = origin.dir;
                this.enter('pickup');
            }
            break;
        }
        case 'pickup':
            if (this.age >= .85) this.enter('wipe');
            break;
        case 'wipe':
            if (this.age >= 1.8) this.enter('puton','found');
            break;
        case 'puton':
            if (this.age >= 2.5) this.enter('idle');
            break;
        case 'pockets':
            if (this.age >= 3.3) this.enter('idle');
            break;
        case 'knock':
            if (this.age >= 2.5) this.enter('idle');
            break;
        case 'lineup': case 'runup': {
            const preparing = this.state === 'lineup';
            const start = preparing ? this.crossing.back : this.crossing.start;
            const {end} = this.crossing;
            const dx = start.x-pet.x, dy = start.y-pet.y;
            const d = Math.hypot(dx,dy);
            const step = Math.min(d, dt*(120+Math.min(1,this.age)*300));
            if (Math.abs(dx)>2) pet.dir = Math.sign(dx);
            if (d) { pet.x += dx*step/d; pet.y += dy*step/d; }
            this.distance += step;
            if (d <= step) {
                if (preparing) { this.enter('runup'); break; }
                if (end.x !== start.x) pet.dir = Math.sign(end.x-start.x);
                this.enter('flight');
            }
            break;
        }
        case 'flight': {
            const {start,end,horizontal,dir} = this.crossing;
            const t = Math.min(1,this.age/.82);
            const arc = 4*t*(1-t);
            pet.x = start.x+(end.x-start.x)*t;
            pet.y = start.y+(end.y-start.y)*t;
            if (horizontal) pet.y -= 62*arc;
            else pet.x += 38*arc*(pet.dir || dir);
            if (t === 1) this.enter('landing');
            break;
        }
        case 'landing':
            if (this.age >= .38) this.enter('idle');
            break;
        case 'approach': {
            const r = this.route;
            if (!controls.visible(r)) { this.enter('idle'); break; }
            const dx = r.x - pet.x, dy = r.y - pet.y;
            const length = Math.hypot(dx, dy);
            const step = Math.min(length, 96 * dt * Math.min(1, .25 + this.age * 3));
            if (Math.abs(dx) > 2) pet.dir = Math.sign(dx);
            if (length > 1) {
                pet.x += dx / length * step;
                pet.y += dy / length * step;
                this.distance += step;
            } else {
                pet.dir = r.facing;
                this.enter(r.kind ? 'haul' : r.editor ? 'point' : 'push', r.editor ? null : 'push');
            }
            break;
        }
        case 'haul': {
            const r = this.route;
            const progress = controls.animateMove(r, this.age, pet);
            if (progress < 0) this.enter('idle');
            else if (progress >= 1) {
                this.enter('settle');
                controls.commitMove(r, ok => {
                    if (this.state === 'settle' && this.route === r)
                        this.enter(ok ? 'proud' : 'idle', ok ? 'proud' : null);
                });
            }
            break;
        }
        case 'settle':
            break;
        case 'proud':
            if (this.age >= 2.6) this.enter('smoke','smoke');
            break;
        case 'push':
            if (!controls.visible(this.route)) { this.enter('idle'); break; }
            if (this.age >= .8) {
                this.enter('smoke','smoke');
            }
            break;
        case 'point':
            if (!controls.visible(this.route)) this.enter('idle');
            else if (this.age >= 1) this.enter('laugh','mock');
            break;
        case 'laugh':
            if (this.age > 2.8) this.enter('idle');
            break;
        case 'smoke':
            if (this.age > 6.5) this.enter('idle');
            break;
        case 'rage':
            if (this.age >= .85) this.enter('chase');
            break;
        case 'chase': {
            const dx = target.x - pet.x, dy = target.y - pet.y;
            const dist = Math.hypot(dx,dy), stride = Math.min(dist, dt * 490);
            if (Math.abs(dx) > 4) pet.dir = Math.sign(dx);
            if (dist) { pet.x += dx / dist * stride; pet.y += dy / dist * stride; }
            this.energy -= stride * .033 + dt;
            if (this.energy <= 0) this.enter('tired','tired');
            else if (dist-stride <= 12) {
                controls.catch();
                this.enter('hold','hold');
            }
            break;
        }
        case 'hold':
            controls.pin();
            break;
        case 'helmet':
            if (!this.helmetLine && this.age >= 2.4) {
                this.helmetLine = true;
                this.say('helmet');
            }
            if (this.age >= 6) this.enter('idle');
            break;
        case 'tired':
            if (this.age > 2.1) { this.clicks = 0; this.enter('sleep'); }
            break;
        case 'sleep':
            this.energy = Math.min(100, this.energy + dt * 4);
            if (this.energy >= 100 && this.age >= 24) this.calm();
            break;
        }
    }
}
