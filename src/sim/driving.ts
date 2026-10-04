import { R } from '../constants';
import { A } from './arena';
import { NEAR, gather, solidAt } from './collide';
import { CARS, carRect } from './traffic';
import { P, S } from '../state';
import { angDiff, clamp } from '../util';
import { STAIRS } from '../world/floors';
import { surfaceAt } from '../world/surfaces';
import type { Group, Mesh } from 'three';
import type { Disc, Pt, Rect } from '../types';

// Two cars you can take. You get in through the driver's door: open it, then back into the
// seat as with any chair (top-down, the door opens as you walk up and you step in). Top-down,
// the pointer leads and the car follows it; in first person it is W/S and A/D. Grip depends on the ground, so ice and the pond matter.
// door: how far open (0..1), dv how fast it is swinging, grab whether it is held; exiting: getting
// out (top-down). thr, st: throttle and steering asked for; steer: where the wheel actually is;
// ax, ay: the pointer the car chases (top-down), relative to the car. home: where it was parked.
// g, pivot (the door) and dash (seen from the driver's seat) are set when the scene is built.
export interface DCar{x:number,y:number,a:number,col:string,door:number,dv:number,grab:boolean,exiting:boolean,vx:number,vy:number,
  thr:number,st:number,steer:number,ax:number,ay:number,len:number,home:{x:number,y:number,a:number},g:Mesh,pivot:Group,dash:Mesh}
export const DCARS=[{x:21.5,y:71.15,a:0,col:'#e0a526'},{x:652,y:76,a:Math.PI,col:'#3f9a63'}].map(c=>({...c,door:0,dv:0,grab:false,exiting:false,vx:0,vy:0,thr:0,st:0,steer:0,ax:0,ay:0,len:4.4,home:{x:c.x,y:c.y,a:c.a}}) as DCar);
export const carEnds=(c:DCar):Pt[]=>{const fx=Math.cos(c.a)*1.3,fy=Math.sin(c.a)*1.3;return[{x:c.x+fx,y:c.y+fy},{x:c.x,y:c.y},{x:c.x-fx,y:c.y-fy}]};   // the car as three discs of radius CR along its length
export const CR=.95;
export const carSpeed=(c:DCar)=>Math.hypot(c.vx,c.vy);
// Car-local coordinates: lx forward, ly to the right. The driver sits left of centre; the
// door is hinged at its front edge and swings out from the left side.
const carPt=(c:DCar,lx:number,ly:number)=>({x:c.x+lx*Math.cos(c.a)-ly*Math.sin(c.a),y:c.y+lx*Math.sin(c.a)+ly*Math.cos(c.a)});
export const SEAT=[-.05,-.38],HINGE=[.55,-.94],DOOR_L=1.1,DOOR_SWING_CAR=1.2;
function carDoorSeg(c:DCar){const t=c.door*DOOR_SWING_CAR,h=carPt(c,HINGE[0],HINGE[1]),e=carPt(c,HINGE[0]-Math.cos(t)*DOOR_L,HINGE[1]-Math.sin(t)*DOOR_L);return{h,e}}
// The car whose door the crosshair is on (first person), from outside or from the driver's seat.
export function aimedCarDoor(){
  if(!S.fp||P.z!==0)return null;
  const ex=P.car?carPt(P.car,SEAT[0]-.2,SEAT[1]).x:P.x,ey=P.car?carPt(P.car,SEAT[0]-.2,SEAT[1]).y:P.y,dx=Math.cos(P.a),dy=Math.sin(P.a);
  for(const c of DCARS){if(P.car&&P.car!==c)continue;
    const{h,e}=carDoorSeg(c),ux=e.x-h.x,uy=e.y-h.y,den=dx*uy-dy*ux;if(Math.abs(den)<1e-6)continue;
    const t=((h.x-ex)*uy-(h.y-ey)*ux)/den,u=((h.x-ex)*dy-(h.y-ey)*dx)/den;if(t<.05||t>2.4||u<0||u>1)continue;
    const hgt=(P.car?1.2:S.eyeH)+t*Math.tan(S.pitch);if(hgt>.2&&hgt<1.5)return c}
  return null;
}
// A held car door follows the mouse the way it looks on screen: whichever way its free edge
// would move across the view, dragging that way opens it.
export function carDoorMouse(c:DCar,dx:number,dy:number){
  const t=.6,lx=Math.sin(t),ly=-Math.cos(t),wx=lx*Math.cos(c.a)-ly*Math.sin(c.a),wy=lx*Math.sin(c.a)+ly*Math.cos(c.a);   // which way the edge travels, mid-swing
  const side=wx*-Math.sin(P.a)+wy*Math.cos(P.a);
  c.dv+=clamp((Math.abs(side)>.15?dx*Math.sign(side):dy)*.008,-.14,.14);   // (seen end-on, pulling the mouse back opens it)
}
export function enterCar(c:DCar){P.car=c;P.sit=null;c.ax=c.ay=0;c.exiting=false;if(S.fp){P.a=c.a;S.pitch=0}}
export function exitCar(){
  const c=P.car;if(!c||carSpeed(c)>2.5)return;
  for(const side of[-1.75,1.75]){const q=carPt(c,-.3,side);          // out of the driver's door if there is room
    if(!solidAt(q.x,q.y,R)){P.car=null;P.x=q.x;P.y=q.y;c.vx=c.vy=c.thr=0;return}}
}
// Backing towards an open driver's door (first person) / stepping in at one (top-down).
export function carSeatBehind(){
  const fx=Math.cos(P.a),fy=Math.sin(P.a);
  return DCARS.find(c=>{if(c.door<.6||P.z!==0)return false;const q=carPt(c,SEAT[0],SEAT[1]),dx=q.x-P.x,dy=q.y-P.y,d=Math.hypot(dx,dy);return d<1.45&&dx*fx+dy*fy<-.3*d})||null;
}
export const carStepIn=()=>P.z!==0||P.boat||P.sit?null:DCARS.find(c=>{const q=carPt(c,SEAT[0],SEAT[1]);return c.door>.6&&Math.hypot(q.x-P.x,q.y-P.y)<1.03})||null;
const atCarDoor=(c:DCar)=>{const q=carPt(c,-.1,-1.5);return P.z===0&&!P.car&&Math.hypot(q.x-P.x,q.y-P.y)<1.6};
export function updateCarDoors(dt:number){
  for(const c of DCARS){
    if(!S.fp){ // top-down: the door opens for you as you come up to it, and shuts behind you
      c.grab=false;c.dv=0;
      const want=P.car===c?(c.exiting?1:0):atCarDoor(c)?1:0;c.door=want?Math.min(1,c.door+dt/.3):Math.max(0,c.door-dt/.3);
      if(c.exiting&&P.car===c&&c.door>.6)exitCar();
      if(P.car!==c)c.exiting=false;
      continue}
    if(c.grab){if(!A.down)c.grab=false}else if(A.click&&aimedCarDoor()===c)c.grab=true;
    if(P.car===c&&carSpeed(c)>2)c.dv-=8*dt;                           // pulling away swings it shut
    c.door+=c.dv*dt;c.dv*=Math.exp(-dt*2.2);
    if(c.door<=0){c.door=0;if(c.dv<0)c.dv=0}else if(c.door>=1){c.door=1;if(c.dv>0)c.dv=0}
    if(!c.grab&&c.door<.04&&c.dv<=0)c.door=0;
  }
}
export const nearCar=()=>P.car||P.z!==0?null:DCARS.find(c=>Math.hypot(c.x-P.x,c.y-P.y)<4)||null;
export function updateDriving(dt:number){
  const c=P.car;if(!c)return;
  const fx=Math.cos(c.a),fy=Math.sin(c.a),sf=surfaceAt(c.x,c.y,0),a0=c.a;
  if(P.car===c&&S.fp&&c.door>.6&&carSpeed(c)<1&&(c.thr>0||c.st<0)){exitCar();return}   // door open, stopped: forward or left is out of the car
  if(!S.fp){ // the pointer leads: steer at it, and go faster the further off it is
    const d=Math.hypot(c.ax,c.ay),want=Math.atan2(c.ay,c.ax),da=angDiff(want,c.a);
    if(d<1.6){c.thr=0;c.st=0}
    else if(Math.abs(da)<2.2){c.thr=clamp((d-1.6)/7,0,1);c.st=clamp(da*1.3,-.6,.6)}
    else{c.thr=-.6;c.st=clamp(-angDiff(want,c.a+Math.PI)*1.3,-.6,.6)}       // it is behind: back up towards it
  }
  if(c.door>.2)c.thr=0;                                                // it will not pull away with the door open
  c.steer+=clamp(c.st*(S.fp?.55:1)-c.steer,-2.2*dt,2.2*dt);
  let vf=c.vx*fx+c.vy*fy,vl=-c.vx*fy+c.vy*fx;
  const push=sf==='ice'?.3:1;
  if(c.thr>0)vf+=(vf<0?14:9*push)*c.thr*dt;else if(c.thr<0)vf+=(vf>0?14*push:5*push)*c.thr*dt;else vf*=Math.exp(-dt*(sf==='ice'?.15:1.3));
  vf=clamp(vf,-6,sf==='water'?4:22);if(sf==='water')vf*=Math.exp(-dt*2.5);
  vl*=Math.exp(-dt*(sf==='ice'?.5:sf==='water'?6:14));                  // sideways grip: on ice there is almost none
  c.a+=vf/2.6*Math.tan(c.steer)*dt;
  const gx=Math.cos(c.a),gy=Math.sin(c.a);c.vx=gx*vf-gy*vl;c.vy=gy*vf+gx*vl;
  c.x+=c.vx*dt;c.y+=c.vy*dt;
  // collisions: the car's discs are pushed out of anything solid at street level
  gather(c.x-4,c.y-4,c.x+4,c.y+4);
  const solids:(Rect|Disc)[]=[...NEAR.filter(o=>o.za<=0&&o.zb>0),...CARS.map(carRect),...STAIRS.filter(s=>s.zh===0)];
  for(const o of DCARS)if(o!==c)for(const e of carEnds(o))solids.push({cx:e.x,cy:e.y,r:CR});
  for(let it=0;it<3;it++)for(const e of carEnds(c))for(const o of solids){let nx:number,ny:number,pen:number;
    if('cx' in o){const dx=e.x-o.cx,dy=e.y-o.cy,d=Math.hypot(dx,dy)||1e-6;pen=CR+o.r-d;nx=dx/d;ny=dy/d}
    else{const qx=clamp(e.x,o.x,o.x+o.w),qy=clamp(e.y,o.y,o.y+o.h),dx=e.x-qx,dy=e.y-qy,d=Math.hypot(dx,dy);
      if(d<1e-6){const l=e.x-o.x,r=o.x+o.w-e.x,t=e.y-o.y,b=o.y+o.h-e.y,m=Math.min(l,r,t,b);nx=m===l?-1:m===r?1:0;ny=m===t?-1:m===b?1:0;if(nx)ny=0;pen=CR+m}else{pen=CR-d;nx=dx/d;ny=dy/d}}
    if(pen>0){c.x+=nx*pen;c.y+=ny*pen;e.x+=nx*pen;e.y+=ny*pen;const vn=c.vx*nx+c.vy*ny;if(vn<0){c.vx-=nx*vn*1.2;c.vy-=ny*vn*1.2;c.vx*=.92;c.vy*=.92}}}
  if(c.x<900){c.x=clamp(c.x,1.2,678.8);const y0=c.x<200?0:c.x<560?40:42,y1=c.x<200?160:c.x<560?112:130;c.y=clamp(c.y,y0+1.2,y1-1.2)}
  P.x=c.x;P.y=c.y;P.z=0;if(S.fp)P.a+=c.a-a0;
}
