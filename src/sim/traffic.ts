import { DCARS, carEnds } from './driving';
import { PEDS } from './peds';
import { P, S } from '../state';
import { clamp, mulberry32 } from '../util';
import { CAT, type Body, addBox, mass, mkBody, force, steer, track } from '../physics';
import { CARC } from '../world/outdoors';
import type { Mesh } from 'three';
import type { Pt } from '../types';

// The demo region ends in barriers across the sidewalks only; the roads run on through.
export const BARRIERS:[number,number,number,number][]=[[-.6,66,.6,4],[-.6,82,.6,4],[200,66,.6,4],[200,82,.6,4],[86,-.6,4,.6],[100,-.6,4,.6],[86,160,4,.6],[100,160,4,.6]];
// Two loops of road through one signalled crossroads: the avenue (east on the south lane, turning
// round at the harbour end and, out of sight, at the west end) and the cross street. A loop is
// a path of points with the distance along it (s) at each; `stops` are where the front of a car
// waits for signal group `sig` (0: the avenue, 1: the cross street); `arcs` are the turning places.
export interface Loop{pts:Pt[],s:number[],L:number,stops:{s:number,sig:number}[],arcs:[number,number][]}
function loop(a:Pt,b:Pt,c:Pt,d:Pt,stops:Pt[],sig:number):Loop{
  const pts:Pt[]=[],arcs:[number,number][]=[];
  // straight a->b, half circle b->c, straight c->d, half circle d->a
  const half=(p:Pt,q:Pt,ux:number,uy:number)=>{const cx=(p.x+q.x)/2,cy=(p.y+q.y)/2,r=Math.hypot(p.x-cx,p.y-cy);
    for(let i=1;i<12;i++){const t=Math.PI*i/12;pts.push({x:cx+(p.x-cx)*Math.cos(t)+ux*r*Math.sin(t),y:cy+(p.y-cy)*Math.cos(t)+uy*r*Math.sin(t)})}};
  const L1=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/L1,uy=(b.y-a.y)/L1;
  pts.push(a,b);half(b,c,ux,uy);pts.push(c,d);half(d,a,-ux,-uy);
  const s=[0];for(let i=1;i<=pts.length;i++){const p=pts[i-1],q=pts[i%pts.length];s.push(s[i-1]+Math.hypot(q.x-p.x,q.y-p.y))}
  const L=s[pts.length];arcs.push([s[1],s[13]],[s[14],L]);
  const lp={pts,s,L,stops:[] as {s:number,sig:number}[],arcs};lp.stops=stops.map(p=>({s:project(lp,p.x,p.y),sig}));return lp;
}
export function pathAt(lp:Loop,s:number){s=((s%lp.L)+lp.L)%lp.L;let i=0;while(lp.s[i+1]<s)i++;
  const p=lp.pts[i],q=lp.pts[(i+1)%lp.pts.length],t=(s-lp.s[i])/(lp.s[i+1]-lp.s[i]||1);return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,a:Math.atan2(q.y-p.y,q.x-p.x)}}
// The distance along the loop of the point on it nearest (x, y).
function project(lp:Loop,x:number,y:number){let best=0,bd=1e18;
  for(let i=0;i<lp.pts.length;i++){const p=lp.pts[i],q=lp.pts[(i+1)%lp.pts.length],dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy||1,t=clamp(((x-p.x)*dx+(y-p.y)*dy)/l2),
    ex=p.x+dx*t-x,ey=p.y+dy*t-y,d=ex*ex+ey*ey;if(d<bd){bd=d;best=lp.s[i]+t*(lp.s[i+1]-lp.s[i])}}
  return best}
export const LOOPS=[loop({x:-60,y:77.8},{x:558,y:77.8},{x:558,y:74.2},{x:-60,y:74.2},[{x:85.4,y:77.8},{x:104.6,y:74.2}],0),
  loop({x:92.5,y:-60},{x:92.5,y:220},{x:97.5,y:220},{x:97.5,y:-60},[{x:92.5,y:65.4},{x:97.5,y:86.6}],1)];
export const SIG_T=26;
export function sigState(g:number){const t=S.time%SIG_T;return g===0?(t<12?'g':t<14?'y':'r'):(t<15?'r':t<23?'g':t<25?'y':'r')}
// A car in traffic: a 1.2 t body driven round its loop by engine, brakes and tyres. s is how far
// round the loop its middle is. g is its mesh, set when the scene is built.
export interface TCar extends Body{lp:Loop,s:number,len:number,col:string,g:Mesh}
export const CARS:TCar[]=[];
{const tr=mulberry32(21);LOOPS.forEach((lp,li)=>{const n=li===0?7:3,half=(lp.arcs[0][0]);
  for(const side of[0,1])for(let i=0;i<n;i++){const len=4.3+tr()*.5,s=side*lp.arcs[0][1]+(i+tr()*.5)*half/n,p=pathAt(lp,s);
    const c={lp,s,len,col:CARC[Math.floor(tr()*CARC.length)],x:p.x,y:p.y} as TCar;
    track(c,mkBody('dynamic',p.x,p.y,p.a,{vx:Math.cos(p.a)*8,vy:Math.sin(p.a)*8}));
    addBox(c.id,0,0,len/2,.92,CAT.CAR,CAT.PLAYER|CAT.CAR|CAT.PED,{density:1200/(len*1.84),friction:.3,restitution:.1});CARS.push(c)}})}
// The car as three discs along its length (for checking whether a spot is clear of it).
export const carDiscs=(c:TCar):Pt[]=>{const fx=Math.cos(c.a)*1.3,fy=Math.sin(c.a)*1.3;return[{x:c.x+fx,y:c.y+fy},{x:c.x,y:c.y},{x:c.x-fx,y:c.y-fy}]};
// Things a driver brakes for besides lights and the car in front: [x,y] spots on the road.
function roadUsers(){const u:Pt[]=[];if(P.z===0&&P.x<700)u.push(P);for(const q of PEDS)if(q.on)u.push(q);return u}
const mod=(v:number,L:number)=>((v%L)+L)%L;
export function updateTraffic(dt:number){
  const users=roadUsers();
  for(const c of CARS){const lp=c.lp;
    {const s=project(lp,c.x,c.y);c.s=s}
    const front=c.s+c.len/2,h=pathAt(lp,front),hx=Math.cos(h.a),hy=Math.sin(h.a);
    let free=1e9;                                                       // clear road ahead of the bumper, metres
    for(const o of CARS)if(o!==c&&o.lp===lp){const g=mod(o.s-c.s,lp.L)-(o.len+c.len)/2;if(g>-1&&g<free)free=g-1.6}
    for(const st of lp.stops){const ds=mod(st.s-front+3,lp.L)-3,sg=sigState(st.sig),v=Math.hypot(c.vx,c.vy);   // (a car that braked a little late, and is only just over the line, still waits)
      if(ds<80&&((sg==='r'&&(ds>-.5||v<3))||(sg==='y'&&ds>v*v/10)))free=Math.min(free,ds-.4)}
    const ahead=(u:Pt,w:number)=>{const ex=u.x-h.x,ey=u.y-h.y,along=ex*hx+ey*hy,lat=Math.abs(-ex*hy+ey*hx);
      if(lat<w&&along>-1&&along<40)free=Math.min(free,along-1.6)};
    for(const u of users)ahead(u,1.7);
    for(const o of CARS)if(o.lp!==lp)for(const e of carDiscs(o))ahead(e,1.9);   // (cross traffic still in the junction)
    for(const o of DCARS)for(const e of carEnds(o))ahead(e,1.9);              // (and the cars people drive)
    let want=Math.min(11,Math.sqrt(2*5*Math.max(0,free)));            // the speed it could still stop from
    for(const[a,b]of lp.arcs){const d=mod(a-front,lp.L),on=mod(c.s-a,lp.L)<b-a;want=Math.min(want,on?3:Math.sqrt(9+2*4*d))}   // slow for the turning places
    // steer at a point a little way up the road; tyres hold it to the road, engine and brakes set the pace
    const t=pathAt(lp,front+1.5+Math.hypot(c.vx,c.vy)*.3),dx=t.x-c.x,dy=t.y-c.y,ta=Math.atan2(dy,dx);
    const fx=Math.cos(c.a),fy=Math.sin(c.a),vf=c.vx*fx+c.vy*fy,vl=-c.vx*fy+c.vy*fx;
    const af=clamp((want-vf)/.2,-12,3),al=clamp(-vl/.12,-8,8),m=mass(c.id);   // (the tyres resist sliding sideways)
    force(c.id,(af*fx-al*fy)*m,(af*fy+al*fx)*m);
    steer(c,ta,1.6*Math.min(1,Math.abs(vf)/2),0,40);                       // (a car only turns while it rolls)
  }
}
