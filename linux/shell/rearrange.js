// DING stores top-left coordinates in the global desktop coordinate system.
const inside = (m,x,y) => x>=m.x && y>=m.y && x<m.x+m.width && y<m.y+m.height;
const center = t => ({cx:t.x+44,cy:t.y+40});
export function planMove(kind, rows, monitors, pet, visible) {
    const current = monitors.find(m=>inside(m,pet.x,pet.y));
    if (!current) return null;
    const sources = rows.filter(t=>t.launcher && inside(current,t.x+44,t.y+40) && visible(center(t)))
        .sort((a,b)=>Math.hypot(a.x+44-pet.x,a.y+40-pet.y)-Math.hypot(b.x+44-pet.x,b.y+40-pet.y));
    const item = sources[0];
    if (!item) return null;
    let other = null, dest = null;
    if (kind === 'swap') {
        other = sources[1] ?? rows.find(t=>t.launcher && t!==item && visible(center(t)) &&
            monitors.some(m=>inside(m,t.x+44,t.y+40)));
        if (!other) return null;
        dest = [other.x,other.y];
    } else {
        const screens = kind === 'transfer' ? monitors.filter(m=>m!==current &&
            !(m.x===current.x && m.y===current.y)) : [current];
        for (const m of screens) {
            const free = [];
            for (let y=m.y+48; y < m.y+m.height-100; y+=128) {
                for (let x=m.x+24; x < m.x+m.width-96; x+=128) {
                    if (rows.some(t=>Math.abs(t.x-x)<96 && Math.abs(t.y-y)<96)) continue;
                    if (visible({cx:x+44,cy:y+40})) free.push([x,y]);
                }
            }
            free.sort((a,b)=>Math.hypot(a[0]-item.x,a[1]-item.y)-Math.hypot(b[0]-item.x,b[1]-item.y));
            if (free.length) {dest=free[0];break;}
        }
        if (!dest) return null;
    }
    const {cx,cy} = center(item);
    const facing = Math.sign(dest[0]-item.x) || (cx<current.x+current.width/2 ? -1 : 1);
    const x = Math.max(current.x+48,Math.min(current.x+current.width-48,cx-facing*70));
    const y = Math.max(current.y+82,Math.min(current.y+current.height-82,cy+(kind==='boot'?-12:34)));
    return {kind,item,other,dest,cx,cy,x,y,facing,editor:false,
        duration:kind==='boot'?1.15:Math.max(1,Math.min(8,Math.hypot(dest[0]-item.x,dest[1]-item.y)/270))};
}
export function moveProgress(route,age) {
    const t = Math.min(1, Math.max(0,(age-(route.kind==='boot'?.38:.20))/route.duration));
    return route.kind==='boot' ? 1-(1-t)**2 : t*t*(3-2*t);
}
