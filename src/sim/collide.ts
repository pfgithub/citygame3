import { R, REGIONS, regionAt } from '../constants';
import { BOAT } from './boat';
import { CR, DCARS, carEnds } from './driving';
import { CARS, carRect } from './traffic';
import { gatesOpen } from './trains';
import { P, S } from '../state';
import { clamp } from '../util';
import { COL } from '../world/colliders';
import { LIFTS } from '../world/floors';
import { DOCK, EDGEY, GATES, STATIONS, TDOORS, TDW, TL, TRAINS, dockedDoor, sideOpen, trainParts } from '../world/subway';
import { MYDOOR } from '../world/tower';

// Colliders that move or open: rebuilt every tick.
export const DYN=[];
export function buildDyn(){
  DYN.length=0;
  // lift doors are shut unless the car is on the player's floor and open
  for(const l of LIFTS)if(!(Math.abs(P.z-l.z)<.01&&l.door>.8))DYN.push({...l.dr,za:l.zmin-.5,zb:l.zmax+.5});
  if(MYDOOR.open<.8)DYN.push({...MYDOOR,za:MYDOOR.z-.5,zb:MYDOOR.z+.5});
  if(P.z<-.5&&P.z>-1.5){ // concourse: which side of the gates we are on, and the arms if they are locked
    const lx=P.x-STATIONS[regionAt(P.x)].dx;if(lx>121.4)P.paid=true;else if(lx<120.6)P.paid=false;
    if(!S.fp&&!P.ticket&&lx>114&&lx<118.5&&P.y<103.6)P.ticket=true;        // top-down: walking up to a machine buys one
    if(!gatesOpen())for(const g of GATES)if(Math.abs(g.cx-P.x)<3)DYN.push({x:g.cx-.1,y:g.y,w:.2,h:.8,za:-1.5,zb:-.5});
  }else if(P.z<=-1.5)P.paid=true;else P.paid=false;
  if(P.z>-.5&&P.z<.5&&P.x<700)for(const c of CARS){const r=carRect(c);if(Math.abs(r.x+r.w/2-P.x)<12&&Math.abs(r.y+r.h/2-P.y)<12)DYN.push({...r,za:-.5,zb:.5})}
  for(const c of DCARS)if(c!==P.car&&Math.abs(c.x-P.x)<8&&Math.abs(c.y-P.y)<8)for(const e of carEnds(c))DYN.push({cx:e.x,cy:e.y,r:CR,za:-.5,zb:.5});
  if(!BOAT.docked)DYN.push({x:622.9,y:47,w:.2,h:3,za:-.5,zb:.5});   // no boat at the berth: the gap in the rail is roped off
  DYN.push({x:623.4,y:45.6,w:.2,h:1.4,za:-.5,zb:.5},{x:623.4,y:50,w:.2,h:1.4,za:-.5,zb:.5});
  if(P.z>-1.5)return;
  for(const tr of TRAINS){if(Math.abs(tr.x+TL/2-P.x)>TL)continue;const p=trainParts(tr);DYN.push(...p.walls);for(const k of[0,1])if(sideOpen(tr,k)<.8)DYN.push(...p.doors[k])}
  STATIONS.forEach((st,si)=>{for(let k=0;k<2;k++)if(dockedDoor(si,k)<.8)
    for(const o of TDOORS)DYN.push({x:st.dx+DOCK+o,y:EDGEY[k],w:TDW,h:.2,za:-2.5,zb:-1.5})});
}
// Is there something solid within r of this spot, on the player's level?
export function solidAt(x,y,r){
  for(const list of[COL,DYN])for(const c of list){
    if(P.z<c.za||P.z>=c.zb)continue;
    if(c.r!==undefined){if(Math.hypot(x-c.cx,y-c.cy)<c.r+r)return true}
    else if(x>c.x-r&&x<c.x+c.w+r&&y>c.y-r&&y<c.y+c.h+r&&Math.hypot(x-clamp(x,c.x,c.x+c.w),y-clamp(y,c.y,c.y+c.h))<=r)return true}
  return false;
}
// Static colliders near where the player is about to be; collide() only tests these.
export const NEAR=[];
export function gather(x0,y0,x1,y1){
  NEAR.length=0;
  for(const c of COL){
    if(c.r!==undefined){if(c.cx+c.r<x0||c.cx-c.r>x1||c.cy+c.r<y0||c.cy-c.r>y1)continue}
    else if(c.x+c.w<x0||c.x>x1||c.y+c.h<y0||c.y>y1)continue;
    NEAR.push(c);
  }
}
export function collide(){
  if(P.sit||P.boat||P.car)return;                        // seated: a bench is solid, and you are on it
  for(let it=0;it<4;it++){
    const n=NEAR.length,m=n+DYN.length;
    for(let i=0;i<m;i++){
      const c=i<n?NEAR[i]:DYN[i-n];if(P.z<c.za||P.z>=c.zb)continue;
      if(c.r!==undefined){
        const dx=P.x-c.cx,dy=P.y-c.cy,d=Math.hypot(dx,dy),m=R+c.r;
        if(d<m){if(d>1e-6){P.x+=dx/d*(m-d);P.y+=dy/d*(m-d)}else P.x+=m}
      }else{
        const nx=clamp(P.x,c.x,c.x+c.w),ny=clamp(P.y,c.y,c.y+c.h),dx=P.x-nx,dy=P.y-ny,d2=dx*dx+dy*dy;
        if(d2>=R*R)continue;
        if(d2>1e-9){const d=Math.sqrt(d2);P.x+=dx/d*(R-d);P.y+=dy/d*(R-d)}
        else{const l=P.x-c.x,r=c.x+c.w-P.x,t=P.y-c.y,b=c.y+c.h-P.y,m=Math.min(l,r,t,b);
          if(m===l)P.x=c.x-R;else if(m===r)P.x=c.x+c.w+R;else if(m===t)P.y=c.y-R;else P.y=c.y+c.h+R}
      }
    }
  }
  if(P.z>-.5){ // the edge of the world: the city, the harbour road and the harbour are one piece; the arena is its own
    if(P.x>900){const r=REGIONS[2];P.x=clamp(P.x,r.x0+R,r.x1-R);P.y=clamp(P.y,r.y0+R,r.y1-R)}
    else{P.x=clamp(P.x,R,680-R);const y0=P.x<200?0:P.x<560?40:42,y1=P.x<200?160:P.x<560?112:130;P.y=clamp(P.y,y0+R,y1-R)}}
}
