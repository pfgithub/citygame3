import { R } from '../constants';
import { A } from './arena';
import { BOAT } from './boat';
import { seatXY } from './seats';
import { P, S } from '../state';
import { CAT, addCircle, drive, force, lv, mass, mkBody, setFilter, track } from '../physics';
import { surfaceAt } from '../world/surfaces';

// The player's body: a 70 kg disc that only ever moves by the force their legs can put down.
export const PB=track({x:P.x,y:P.y},mkBody('dynamic',P.x,P.y,0,{fixedRot:true}));
const SHAPE=addCircle(PB.id,0,0,R,CAT.PLAYER,lv(0),{density:70/(Math.PI*R*R)});
// Collides with the walls of the level it is on (and on the street, with traffic, people and
// creatures; on a platform, with the trains). Aboard the boat only its rails count. Carried
// (seated, driving, stepping clear of a seat or a car) it collides with nothing.
export const carried=()=>!!(P.car||P.sit||P.ghost);
export function playerFilter(){
  const k=Math.floor(P.z+.5);
  setFilter(SHAPE,CAT.PLAYER,carried()?0:P.boat?CAT.RAIL:lv(k)|(k===0?CAT.CAR|CAT.PED|CAT.CREATURE:0)|(k===-2?CAT.TRAIN:0));
}
// The velocity of whatever the player stands on: a train, or the deck of the boat.
function frameVel(){
  if(P.boat){const b=BOAT;return{x:b.vx-b.w*(P.y-b.y),y:b.vy+b.w*(P.x-b.x)}}
  if(P.train){const t=P.train;return{x:t.vx,y:t.vy}}
  return{x:0,y:0};
}
// Where a carried player is being taken, and how fast that spot is itself moving.
function holdTarget(){
  if(P.car)return{x:P.car.x,y:P.car.y,vx:P.car.vx,vy:P.car.vy,sp:40};
  if(P.sit){const q=seatXY(P.sit),t=P.sit.horiz!==undefined?P.sit.tr:null;return{x:q.x,y:q.y,vx:t?t.vx:0,vy:t?t.vy:0,sp:3}}
  const g=P.ghost;if(!g)return null;
  const ox=g.tr?g.tr.x:0,oy=g.tr?g.tr.y:0,vx=g.tr?g.tr.vx:0,vy=g.tr?g.tr.vy:0;   // (in a train, the spots go along with it)
  while(g.pts.length>1&&Math.hypot(g.pts[0].x+ox-PB.x,g.pts[0].y+oy-PB.y)<.08)g.pts.shift();
  const x=g.pts[0].x+ox,y=g.pts[0].y+oy;
  if(Math.hypot(x-PB.x,y-PB.y)<.06&&Math.hypot(PB.vx-vx,PB.vy-vy)<.5){P.ghost=null;return null}
  return{x,y,vx,vy,sp:g.sp};
}
const VMAX=300,LEASH=10,OMEGA=12,BRAKE=.85;
let stuck=0;                                  // how long the body has made no headway towards the pointer
// Move the player for one tick. Top-down, (ux, uy) is how far the mouse moved the pointer and
// (sx, sy) how far a blow shoves it; in first person (or a scripted test) `want` is the velocity
// asked for. Either way the body gets there by force alone, up to amax.
export function movePlayer(dt:number,ux:number,uy:number,sx:number,sy:number,want:{x:number,y:number}|null){
  const h=holdTarget();
  if(h){let dx=h.x-PB.x,dy=h.y-PB.y;const d=Math.hypot(dx,dy),k=Math.min(OMEGA*1.5,h.sp/(d||1));dx*=k;dy*=k;
    drive(PB,h.vx+dx,h.vy+dy,1/30,600,dt);P.tx=PB.x;P.ty=PB.y;return}
  const f=frameVel(),sf=P.boat||P.lift?null:surfaceAt(PB.x,PB.y,P.z),amax=sf==="water"?12:A.ball?70:1e5;
  let vx:number,vy:number;                              // the velocity the legs aim for, relative to the ground underfoot
  if(want){vx=want.x;vy=want.y;P.tx=PB.x;P.ty=PB.y}
  else{ // the pointer leads; the body chases it, and the pointer never gets far ahead
    P.tx+=ux+sx+f.x*dt;P.ty+=uy+sy+f.y*dt;
    let ex=P.tx-PB.x,ey=P.ty-PB.y;const e=Math.hypot(ex,ey),lim=sf==='water'?1:LEASH;
    if(e>lim){P.tx=PB.x+ex/e*lim;P.ty=PB.y+ey/e*lim;ex*=lim/e;ey*=lim/e}
    // Head for the pointer as fast as it is still possible to stop exactly on it, braking with
    // only part of the force there is (so there is always some in hand). Box2D raises the velocity
    // over its 4 substeps, so a step to end velocity v travels dt*(.375 v0 + .625 v); the speed
    // aimed for is the one that, after this step, leaves room to stop: v = sqrt(2 a d_after).
    // Close in, cover most of what is left each step. The body never goes past the pointer and back.
    const d=Math.min(e,lim),rx=PB.vx-f.x,ry=PB.vy-f.y,ux_=d>1e-6?ex/d:0,uy_=d>1e-6?ey/d:0;
    const c=2*BRAKE*amax,A_=d-.375*dt*(rx*ux_+ry*uy_),q=.625*c*dt;
    const sp=A_>0?Math.min(VMAX,(-q+Math.sqrt(q*q+4*c*A_))/2):0;
    const lx=(.8*ex/dt-.375*rx)/.625,ly=(.8*ey/dt-.375*ry)/.625;
    if(Math.hypot(lx,ly)<sp||A_<=0){vx=lx;vy=ly}else{vx=ux_*sp;vy=uy_*sp}
    const el=Math.hypot(ex,ey),toward=el>1e-6?((PB.vx-f.x)*ex+(PB.vy-f.y)*ey)/el:0;
    stuck=el>.2&&toward<.5?stuck+dt:0;
    if(stuck>.15){const k=Math.min(1,dt*8);P.tx-=ex*k;P.ty-=ey*k}       // pressed against something: let the pointer come back to it
  }
  if(sf==='ice'){ // the feet only push: whatever the mouse or the keys ask for comes as a nudge, and you glide on
    const m=mass(PB.id),u=want?{x:want.x,y:want.y}:{x:ux/dt,y:uy/dt};
    let ax=.9*u.x-.45*(PB.vx-f.x),ay=.9*u.y-.45*(PB.vy-f.y);const a=Math.hypot(ax,ay);if(a>40){ax*=40/a;ay*=40/a}
    force(PB.id,ax*m,ay*m);P.tx=PB.x;P.ty=PB.y;return}
  const cap=sf==='water'?4:VMAX,sp=Math.hypot(vx,vy);if(sp>cap){vx*=cap/sp;vy*=cap/sp}
  drive(PB,f.x+vx,f.y+vy,want&&sf!=='water'?1/30:dt,amax,dt);   // (chasing the pointer, reach the speed aimed for within the step)
}
// After the physics step.
export function afterStep(){P.x=PB.x;P.y=PB.y;P.vx=PB.vx;P.vy=PB.vy;if(S.fp&&!P.ghost){P.tx=PB.x;P.ty=PB.y}}
