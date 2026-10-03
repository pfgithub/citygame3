import { PEDS } from './peds';
import { P, S } from '../state';
import { clamp, mulberry32 } from '../util';
import { CARC } from '../world/outdoors';

// The demo region ends in barriers across the sidewalks only; the roads run on through.
export const BARRIERS=[[-.6,66,.6,4],[-.6,82,.6,4],[200,66,.6,4],[200,82,.6,4],[86,-.6,4,.6],[100,-.6,4,.6],[86,160,4,.6],[100,160,4,.6]];
// Four lanes through one signalled crossroads. `c` is the lane's centre line, `stop` where the
// front of a car waits. Group 0 is the avenue, group 1 the cross street.
export const LANES=[{ax:'x',dir:1,c:77.8,stop:85.4,sig:0,a:-60,b:558},{ax:'x',dir:-1,c:74.2,stop:104.6,sig:0,a:-60,b:558},
  {ax:'y',dir:1,c:92.5,stop:65.4,sig:1,a:-60,b:220},{ax:'y',dir:-1,c:97.5,stop:86.6,sig:1,a:-60,b:220}];
export const SIG_T=26;
export function sigState(g){const t=S.time%SIG_T;return g===0?(t<12?'g':t<14?'y':'r'):(t<15?'r':t<23?'g':t<25?'y':'r')}
export const CARS=[];
{const tr=mulberry32(21);LANES.forEach((ln,li)=>{const n=ln.ax==='x'?7:3;
  for(let i=0;i<n;i++)CARS.push({ln,s:ln.a+(i+tr()*.5)*(ln.b-ln.a)/n,v:8,len:4.3+tr()*.5,col:CARC[Math.floor(tr()*CARC.length)]})})}
export const carRect=c=>c.ln.ax==='x'?{x:c.s-c.len/2,y:c.ln.c-.92,w:c.len,h:1.84}:{x:c.ln.c-.92,y:c.s-c.len/2,w:1.84,h:c.len};
// Things a driver brakes for besides lights and the car in front: [x,y] spots on the road.
export function roadUsers(){const u=[];if(P.z===0&&P.x<700)u.push(P);if(typeof PEDS!=='undefined')for(const q of PEDS)if(q.on)u.push(q);return u}
export function updateTraffic(dt){
  const users=roadUsers();
  for(const c of CARS){const ln=c.ln,d=ln.dir,front=c.s+d*c.len/2;
    let free=1e9;                                                       // clear road ahead of the bumper, metres
    for(const o of CARS)if(o!==c&&o.ln===ln){const g=(o.s-c.s)*d-(o.len+c.len)/2;if(g>-1&&g<free)free=g-1.6}
    if(ln===LANES[0])free=Math.min(free,ln.b-c.s);                      // road ends: slow to the turning place
    if(c.turn>0)free=0;
    const st=sigState(ln.sig),ds=(ln.stop-front)*d;
    if(ds>-.5&&(st==='r'||(st==='y'&&ds>c.v*c.v/12)))free=Math.min(free,ds-.4);
    for(const u of users){const along=((ln.ax==='x'?u.x:u.y)-front)*d,lat=Math.abs((ln.ax==='x'?u.y:u.x)-ln.c);
      if(lat<1.7&&along>-1&&along<40)free=Math.min(free,along-1.6)}
    const want=Math.min(11,Math.sqrt(2*5*Math.max(0,free)));            // the speed it could still stop from
    c.v+=clamp(want-c.v,-12*dt,3*dt);if(c.v<.05&&want<.05)c.v=0;
    c.s+=d*c.v*dt;
    if(ln.ax==='x'){ // the avenue is a loop: turn round at the harbour end, and (out of sight) at the west end
      if(d>0&&c.s>=ln.b-.05){if(CARS.some(o=>o.ln===LANES[1]&&o.s>ln.b-9)){c.s=ln.b-.05;c.v=0}else{c.ln=LANES[1];c.s=ln.b;c.v=0;c.turn=1}}else if(d<0&&c.s<ln.a){c.ln=LANES[0];c.s=ln.a}
      if(c.turn>0)c.turn=Math.max(0,c.turn-dt/1.6);
    }else if(d>0&&c.s>ln.b)c.s-=ln.b-ln.a;else if(d<0&&c.s<ln.a)c.s+=ln.b-ln.a;
  }
}
