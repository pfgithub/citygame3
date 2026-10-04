import { VIEW_OUT } from './constants';
import { inRect } from './util';
import type { Lift } from './world/floors';
import type { Train } from './world/subway';
import type { DCar } from './sim/driving';
import type { Seat } from './sim/seats';
import { MYFLAT, MYRECT, TOWER, TTOP } from './world/tower';

// Shared mutable state. fp: first-person mode (P.a is the heading, pitch the look up/down).
// w, h, dpr: the canvas size in device pixels.
// view: metres across the short side of the screen; indoor, bIn: how far indoors the player is
// (0..1); pendingBtn: a lift floor button pressed and not yet acted on.
export const S={time:0,view:VIEW_OUT,indoor:0,bIn:0,pendingBtn:null as number|null,fp:false,pitch:0,eyeH:1.65,w:0,h:0,dpr:1};
// The player. a: heading; vx, vy: velocity (it matters on ice and in water). They may be at the
// wheel of a car, aboard the boat (at lx, ly in its frame), in a lift or a train, or sitting.
// ticket: holds a subway ticket; paid: is past the gates.
export interface Player{x:number,y:number,z:number,a:number,vx:number,vy:number,car:DCar|null,boat:{lx:number,ly:number}|null,
  ticket:boolean,paid:boolean,lift:Lift|null,train:Train|null,sit:Seat|null,walk:number}
export const P:Player={car:null,vx:0,vy:0,boat:null,ticket:false,paid:false,x:68,y:68.2,z:0,a:-Math.PI/2,lift:null,train:null,sit:null,walk:0};
// The player's position is kept across page loads. Only places that will still make sense
// later are saved: not the inside of a lift or a train, which will have moved on.
export const SAVE='ctg.position.v1';
try{const v=JSON.parse(localStorage.getItem(SAVE)||'null');
  if(v&&[v.x,v.y,v.z,v.a].every(Number.isFinite)&&v.z>=-2&&v.z<=9){P.x=v.x;P.y=v.y;P.z=v.z;P.a=v.a;P.ticket=!!v.t}}catch(_){}
// A save made while stuck inside someone else's flat (an old bug) is put back in the corridor.
if(Number.isInteger(P.z)&&P.z>=0&&P.z<=TTOP&&inRect(P.x,P.y,TOWER)){
  const hall=P.y>53.8&&P.y<56,core=P.x>30&&P.x<41&&P.y>50.4&&P.y<=53.8,home=P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT),lobby=P.z===0&&P.x>28&&P.x<40.2&&P.y>=56;
  if(!hall&&!core&&!home&&!lobby){P.x=34;P.y=54.9}
}
// Mouse / finger travel since the last tick, in CSS pixels. input.override is a scripted direction for tests.
export const input={dx:0,dy:0,override:null as {x:number,y:number}|null};
export const keys=new Set<string>();
export const CAM={x:P.x,y:P.y};
