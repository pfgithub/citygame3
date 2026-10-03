// All world coordinates are metres. z is the floor level as a float (0 = street).
export const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const rnd=mulberry32(11);
export const rr=(a,b)=>a+(b-a)*rnd();
export const pick=a=>a[Math.floor(rnd()*a.length)];
export const inRect=(px,py,r)=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h;
export function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;
  const t=clamp(((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy||1));return Math.hypot(px-x1-dx*t,py-y1-dy*t)}
export const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
