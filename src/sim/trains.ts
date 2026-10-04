import { R } from '../constants';
import { CAM, P, S } from '../state';
import { lerp } from '../util';
import { type Train, CROSS, STOPS, TDOORS, TDW, TDWELL, TL, TRACKY, TRAINS, TRUN, TW, stopX, trainY } from '../world/subway';

export const gatesOpen=()=>P.ticket||P.paid;
// A train may leave once the edge ahead is empty and, where the loop doubles back on a
// shared stretch of track near a terminus, the train coming the other way has cleared it.
// (Trains in a timetable run-through are copies without meshes.)
type TrainState=Omit<Train,'g'|'doors'>;
function canGo(T:TrainState[],tr:TrainState){
  const N=STOPS.length,n=(tr.i+1)%N;
  if(T.some(o=>o!==tr&&(o.phase==='run'?(o.i+1)%N===n:o.i===n)))return false;
  if(tr.i===3)return!T.some(o=>o.phase==='run'&&o.i===0&&o.x<CROSS[1].b+TL+20);
  if(tr.i===1)return!T.some(o=>o.phase==='run'&&o.i===2&&o.x>CROSS[0].a-TL-20);
  return true;
}
// Advance a set of trains. `blocked(tr)` says whether something is standing in a doorway.
function stepTrains(T:TrainState[],dt:number,blocked:(tr:TrainState)=>boolean){
  for(const tr of T){
    if(tr.phase==='dwell'){tr.door=Math.min(1,tr.door+dt/.8);tr.t+=dt;if(tr.t>TDWELL&&canGo(T,tr))tr.phase='closing'}   // waits with its doors open
    else if(tr.phase==='closing'){
      if(blocked(tr))tr.door=Math.min(1,tr.door+dt/.8);
      else{tr.door=Math.max(0,tr.door-dt/.8);if(tr.door===0){tr.phase='run';tr.u=0}}
    }else{
      tr.u=Math.min(1,tr.u+dt/TRUN);const u=tr.u,n=(tr.i+1)%STOPS.length;
      tr.x=lerp(stopX(tr.i),stopX(n),u*u*u*(u*(u*6-15)+10));tr.y=trainY(tr.i,tr.x);
      if(u>=1){tr.i=n;tr.y=TRACKY[STOPS[n].k];tr.phase='dwell';tr.t=0}
    }
  }
}
export function updateTrains(dt:number){
  const under=Math.abs(P.z+2)<.01;
  const on=under?TRAINS.find(tr=>P.x>tr.x&&P.x<tr.x+TL&&P.y>tr.y&&P.y<tr.y+TW):null,ox=on?on.x:0,oy=on?on.y:0;
  stepTrains(TRAINS,dt,tr=>under&&Math.abs(P.y-(STOPS[tr.i].k?120.175:106.825))<R+.23&&TDOORS.some(o=>P.x>tr.x+o-R&&P.x<tr.x+o+TDW+R));   // doors never close on the player (someone sat beside one is not in the way)
  P.train=on||null;
  if(on){const dx=on.x-ox,dy=on.y-oy;P.x+=dx;P.y+=dy;CAM.x+=dx;CAM.y+=dy}   // riders are carried along, and so is the camera
}
// Seconds until the next train opens its doors at each stop of the loop, by running the timetable forward.
let etaAt=-1,ETA:(number|null)[]=[];
export function etas(){
  if(Math.abs(S.time-etaAt)<.5)return ETA;
  etaAt=S.time;const T:TrainState[]=TRAINS.map(({g,doors,...t})=>t);ETA=STOPS.map((_,j)=>T.some(t=>t.i===j&&t.phase!=='run')?0:null);
  for(let s=0;s<120&&ETA.includes(null);s+=.25){stepTrains(T,.25,()=>false);for(const t of T)if(t.phase==='dwell'&&ETA[t.i]===null)ETA[t.i]=s+.25}
  return ETA;
}
