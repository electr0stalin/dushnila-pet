const KNOCK_INTERVAL = 15 * 60;
export class KnockClock {
    constructor(now, interval = KNOCK_INTERVAL) { this.interval = interval; this.next = now + interval; }
    due(now, available) {
        if (!available || now < this.next) return false;
        this.next += this.interval * (1 + Math.floor((now-this.next)/this.interval));
        return true;
    }
}

// Seconds from the start of window_knock02, measured at the seven impacts.
const impacts = [.05,.23,.41,.60,.78,.97,1.14];
export function knockFrame(age) {
    return impacts.some(t => age >= t-.022 && age < t+.068) ? 'tap' : 'fist';
}

function inset(value, start, size) {
    const margin = Math.min(88, size/2);
    return Math.max(start+margin, Math.min(start+size-margin, value));
}
export function crossing(pet, from, monitors) {
    if (!from) return null;
    const lanes = [];
    for (const to of monitors) {
        const left = to.x+to.width <= from.x, right = to.x >= from.x+from.width;
        const up = to.y+to.height <= from.y, down = to.y >= from.y+from.height;
        if (!(left || right || up || down)) continue;
        const horizontal = left || right;
        const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
        const size = horizontal ? 'width' : 'height', span = horizontal ? 'height' : 'width';
        const dir = horizontal ? (right ? 1 : -1) : (down ? 1 : -1);
        const lo = Math.max(from[cross],to[cross]), hi = Math.min(from[cross]+from[span],to[cross]+to[span]);
        const lane = hi > lo ? inset(pet[cross],lo,hi-lo) : pet[cross];
        const start = {}, end = {};
        start[axis] = inset(dir>0 ? Infinity : -Infinity, from[axis],from[size]);
        end[axis] = inset(dir>0 ? -Infinity : Infinity, to[axis],to[size]);
        start[cross] = inset(lane,from[cross],from[span]);
        end[cross] = inset(start[cross],to[cross],to[span]);
        const distance = Math.hypot(end.x-start.x,end.y-start.y);
        const back = {...start};
        back[axis] = inset(start[axis]-dir*135,from[axis],from[size]);
        lanes.push({start,end,back,distance,horizontal,dir});
    }
    return lanes.sort((a,b)=>a.distance-b.distance)[0] ?? null;
}

// Duration in seconds, sprite, prop, speech.
export const stories = {
    protest: [
        [1.3, 'windup', '📦', 'У меня заявление.'],
        [3.4, 'proud', '🪧', 'ХВАТИТ РАБОТАТЬ'],
        [2.6, 'point', '🪧', 'Даже на пикет один вышел.'],
    ],
    faint: [
        [1.4, 'land', '', 'Что-то душно стало…'],
        [6, 10, '', ''],
        [2.5, 'laugh', '', 'Да живой я. Проверял.'],
    ],
    ufo: [
        [2, 'point', '🛸', 'А эти ещё из какого отдела?'],
        [2.6, 'air', '🛸', 'Меня хотя бы из чата удалите!'],
        [2.8, 'land', '🛸', 'Даже этим я не нужен!'],
    ],
};

export function storyPhase(name, age) {
    for (const [index, [duration, frame, prop, line]] of stories[name].entries()) {
        if (age < duration) return {index, frame, prop, line, t: age / duration};
        age -= duration;
    }
    return null;
}

// Only the foreground window's public title and application class are used.
export function isGoogleChat(title, ...classes) {
    const app = classes.filter(Boolean).join(' ');
    if (/chat\.google\.com|(?:^|[\s._-])google[- ]chat(?:$|[\s._-])/i.test(app)) return true;
    const page = (title ?? '').replace(/\(\d+\+?\)/g, '').trim();
    if (/(?:\bGoogle\s+(?:Chat\b|Чат)|Чат\s+Google\b|\bchat\.google\.com\b)/i.test(page)) return true;
    if (!/firefox|chrom(?:e|ium)|brave|msedge|vivaldi/i.test(app)) return false;
    const parts = page.split(/\s+[-–—·]\s+|\s*\|\s*/);
    return parts.some(part => /^(?:Chat|Чат)$/i.test(part.trim()));
}
