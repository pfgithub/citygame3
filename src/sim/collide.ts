import { regionAt } from '../constants';
import { BOAT } from './boat';
import { CR, DCARS, carEnds } from './driving';
import { CARS, carDiscs } from './traffic';
import { gatesOpen } from './trains';
import { P, S } from '../state';
import { clamp } from '../util';
import { lv } from '../physics';
import { COL, GATES_ALL, type Gate, gate, setGate, wall } from '../world/colliders';
import { LIFTS } from '../world/floors';
import { DOCK, EDGEY, GATES, STATIONS, TDOORS, TDW, dockedDoor } from '../world/subway';
import { MYDOOR } from '../world/tower';
import type { Col } from '../types';

// The edge of the walkable world: the city, the harbour road and the harbour are one piece, the
// arena is its own. Solid on the ground floor and above (the stations below reach further out).
{const up=lv(0)|lv(1)|lv(2)|lv(3)|lv(4)|lv(5)|lv(6)|lv(7)|lv(8)|lv(9),m=0x3fffffff;
  for(const[x,y,w,h]of[[-5,-5,5,170],[0,-5,200,5],[200,-5,360,45],[560,-5,125,47],[680,42,5,93],[560,130,120,5],[200,112,360,53],[0,160,200,5],
    [1047,-13,5,124],[1168,-13,5,124],[1052,-13,116,5],[1052,106,116,5]])wall(x,y,w,h,up,m)}
// Things that open and shut.
const LIFTDOOR=LIFTS.map(l=>gate(l.dr.x,l.dr.y,l.dr.w,l.dr.h,l.zmin-.5,l.zmax+.5));
const FRONT=gate(MYDOOR.x,MYDOOR.y,MYDOOR.w,MYDOOR.h,MYDOOR.z-.5,MYDOOR.z+.5);
const ARMS=GATES.map(g=>gate(g.cx-.1,g.y,.2,.8,-1.5,-.5));
const SCREEN=STATIONS.map(st=>EDGEY.map(ey=>TDOORS.map(o=>gate(st.dx+DOCK+o,ey,TDW,.2,-2.5,-1.5))));
const ROPE=gate(622.9,47,.2,3,-.5,.5);                       // no boat at the berth: the gap in the rail is roped off
gate(623.4,45.6,.2,1.4,-.5,.5);gate(623.4,50,.2,1.4,-.5,.5);
export function updateGates(){
  // a lift's doors are shut on every floor except the one it stands at with them open
  LIFTS.forEach((l,i)=>{const f=Math.round(l.z);setGate(LIFTDOOR[i],true,Math.abs(l.z-f)<.01&&l.door>.8?lv(f):0)});
  setGate(FRONT,MYDOOR.open<.8);
  if(P.z<-.5&&P.z>-1.5){ // concourse: which side of the gates we are on
    const lx=P.x-STATIONS[regionAt(P.x)].dx;if(lx>121.4)P.paid=true;else if(lx<120.6)P.paid=false;
    if(!S.fp&&!P.ticket&&lx>114&&lx<118.5&&P.y<103.6)P.ticket=true;        // top-down: walking up to a machine buys one
  }else if(P.z<=-1.5)P.paid=true;else P.paid=false;
  for(const a of ARMS)setGate(a,!gatesOpen());
  SCREEN.forEach((sides,si)=>sides.forEach((doors,k)=>{const on=dockedDoor(si,k)<.8;for(const g of doors)setGate(g,on)}));
  setGate(ROPE,!BOAT.docked);
}
// Is there something solid within r of this spot, on the player's level?
const hit=(c:Col,x:number,y:number,r:number)=>c.r!==undefined?Math.hypot(x-c.cx,y-c.cy)<c.r+r
  :x>c.x-r&&x<c.x+c.w+r&&y>c.y-r&&y<c.y+c.h+r&&Math.hypot(x-clamp(x,c.x,c.x+c.w),y-clamp(y,c.y,c.y+c.h))<=r;
const shut=(g:Gate)=>g.on&&!(g.skip&lv(Math.floor(P.z+.5)));
export function solidAt(x:number,y:number,r:number){
  for(const c of COL)if(P.z>=c.za&&P.z<c.zb&&hit(c,x,y,r))return true;
  for(const g of GATES_ALL)if(P.z>=g.za&&P.z<g.zb&&shut(g)&&hit(g,x,y,r))return true;
  if(Math.abs(P.z)<.01){
    for(const c of DCARS)if(c!==P.car)for(const e of carEnds(c))if(Math.hypot(x-e.x,y-e.y)<CR+r)return true;
    for(const c of CARS)for(const e of carDiscs(c))if(Math.hypot(x-e.x,y-e.y)<.95+r)return true;
  }
  return false;
}
