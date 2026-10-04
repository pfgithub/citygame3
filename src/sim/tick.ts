import { R, SPEED_IN, VIEW_IN, VIEW_OUT } from '../constants';
import { A, inArena, mouseCaptured, updateArena } from './arena';
import { BOAT, tiller, updateBoat } from './boat';
import { updateGates } from './collide';
import { doorMouse, updateMyDoor } from './door';
import { DCARS, carDoorMouse, carSeatBehind, carSpeed, carStepIn, enterCar, updateCarDoors, updateDriving } from './driving';
import { updatePeds } from './peds';
import { afterStep, movePlayer, playerFilter } from './player';
import { aimedPress } from './press';
import { autoSave } from './save';
import { seatBehind, standSpot } from './seats';
import { updateTraffic } from './traffic';
import { updateTrains } from './trains';
import { CAM, P, S, input, keys } from '../state';
import { angDiff, clamp, inRect, lerp } from '../util';
import { step } from '../physics';
import { BUILDINGS } from '../world/buildings';
import { type Lift, LIFTS, STAIRS, stairT } from '../world/floors';
import { MYDOOR } from '../world/tower';

function updateZ(){
  if(P.lift){if(!inRect(P.x,P.y,P.lift))P.lift=null;else{P.z=P.lift.z;return}}
  for(const l of LIFTS)if(inRect(P.x,P.y,l)&&Math.abs(P.z-l.z)<.01){P.lift=l;P.z=l.z;return}
  for(const s of STAIRS){
    if(P.z<s.zl-.01||P.z>s.zh+.01||!inRect(P.x,P.y,s))continue;
    P.z=lerp(s.zl,s.zh,clamp(stairT(s,P.x,P.y)));return;
  }
  P.z=Math.round(P.z);
}
function updateLift(l:Lift,dt:number){
  const d=l.dr,inside=P.lift===l,sameZ=Math.abs(P.z-l.z)<.01;
  const blocked=sameZ&&P.x>d.x-R-.05&&P.x<d.x+d.w+R+.05&&Math.abs(P.y-(d.y+.1))<R+.25;
  const f=Math.round(P.z);
  const nearCall=!S.fp&&!inside&&Math.abs(P.z-f)<.01&&f>=l.zmin&&f<=l.zmax&&inRect(P.x,P.y,l.call);   // top-down: walking up calls it
  l.openT-=dt;
  if(!l.moving){
    if(inside){if(S.pendingBtn!==null){if(S.pendingBtn!==l.z&&S.pendingBtn>=l.zmin&&S.pendingBtn<=l.zmax){l.target=S.pendingBtn;l.src='btn'}S.pendingBtn=null}}
    else{
      if(l.src==='btn'){l.target=null;l.src=null}
      if(nearCall){if(l.z!==f){l.target=f;l.src='call'}else l.target=null}
      if(l.want!==null){if(l.z!==l.want){l.target=l.want;l.src='call'}else l.openT=4;l.want=null}}   // first person: a hall button was pressed
  }
  const step=dt/.7;
  if(l.target!==null&&l.target!==l.z){
    if(!l.moving){
      if(blocked)l.door=Math.min(1,l.door+step);
      else{l.door=Math.max(0,l.door-step);if(l.door===0)l.moving=true}
    }else{
      const dz=l.target-l.z,s=dt*1.1;
      if(Math.abs(dz)<=s){l.z=l.target;l.moving=false;l.target=null;if(l.src==='call')l.openT=5;l.src=null}else l.z+=Math.sign(dz)*s;
    }
  }else{
    l.target=null;
    const want=inside||blocked||(nearCall&&f===l.z)||l.openT>0;
    l.door=want?Math.min(1,l.door+step):Math.max(0,l.door-step);
  }
  if(inside)P.z=l.z;
}
function updateIndoor(dt:number){
  // Everything here is a function of where the player stands, not of time.
  S.bIn=0;
  for(const b of BUILDINGS){const d=Math.hypot(P.x-b.door.x,P.y-b.door.y);
    b.bIn=P.z>.01?1:P.z<-.01?0:inRect(P.x,P.y,b.rect)?clamp(.5+d/8):clamp(.5-d/8);S.bIn=Math.max(S.bIn,b.bIn)}
  S.indoor=Math.max(S.bIn,clamp(-P.z)*.5);
  const target=P.car?VIEW_OUT*(1.1+.5*Math.min(1,carSpeed(P.car)/20)):lerp(VIEW_OUT,VIEW_IN,S.indoor);   // driving: pull back, more at speed
  S.view+=(target-S.view)*(1-Math.exp(-dt*12));
}
export function tick(dt:number){
  S.time+=dt;autoSave();
  updateTrains(dt);updatePeds(dt);updateTraffic(dt);updateGates();
  // You are the mouse pointer: it moves across the world exactly as far as the mouse moved
  // across the screen, however fast that is, and your body chases it (see player.ts).
  let wx=0,wy=0,want:{x:number,y:number}|null=null;
  if(input.override){const sp=SPEED_IN*S.view/VIEW_IN;want={x:input.override.x*sp,y:input.override.y*sp}}
  else if(S.fp){ // mouse looks, WASD walks, Shift runs
    const heldCar=DCARS.find(c=>c.grab);
    if(MYDOOR.grab)doorMouse(input.dx,input.dy);        // a held handle takes the mouse; otherwise it looks around
    else if(heldCar)carDoorMouse(heldCar,input.dx,input.dy);
    else if(P.boat&&A.down)tiller(input.dx,input.dy);
    else{P.a+=input.dx*.0024;S.pitch=clamp(S.pitch-input.dy*.0024,-1.45,1.45)}
    let f=0,r=0;if(keys.has('KeyW'))f+=1;if(keys.has('KeyS'))f-=1;if(keys.has('KeyD'))r+=1;if(keys.has('KeyA'))r-=1;
    if(P.car){P.car.thr=f;P.car.st=r;f=r=0}             // at the wheel the keys drive
    if(P.sit){ // seated: walking forward stands you up; A/D shuffle along a bench
      const st=P.sit,c=Math.cos(P.a),sn=Math.sin(P.a);
      const up=f>0?standSpot(st):null;
      if(up){const tr=st.horiz!==undefined?st.tr:null;P.sit=null;P.ghost={pts:[tr?{x:up.x-tr.x,y:up.y-tr.y}:up],sp:2.5,tr}}   // get up, stepping clear of the seat
      else if(r&&st.horiz!==undefined)st.p=clamp(st.p+Math.sign(st.horiz?-sn:c)*r*1.3*dt,st.min,st.max);
      f=r=0;
    }else if(f<0&&r===0&&!P.car&&!P.ghost){ // backing into a chair you are facing away from sits you down; a car seat puts you at the wheel
      const cs=carSeatBehind();if(cs)enterCar(cs);else P.sit=seatBehind();
    }
    const m=Math.hypot(f,r)||1,sp=(keys.has('ShiftLeft')||keys.has('ShiftRight')?8.5:4)/m,c=Math.cos(P.a),sn=Math.sin(P.a);
    want={x:(f*c-r*sn)*sp,y:(f*sn+r*c)*sp};
  }else if(P.car){const c=P.car,k=S.dpr*S.view/Math.min(S.w,S.h);c.ax+=input.dx*k;c.ay+=input.dy*k;   // the mouse moves the pointer the car chases
    const d=Math.hypot(c.ax,c.ay);if(d>14){c.ax*=14/d;c.ay*=14/d}}
  else if(P.boat&&A.down)tiller(input.dx,input.dy);
  else{const k=S.dpr*S.view/Math.min(S.w,S.h);wx=input.dx*k;wy=input.dy*k}
  let amx=0,amy=0;if(!input.override&&mouseCaptured()){amx=wx;amy=wy;wx=wy=0}
  const hx=want?want.x*dt:wx,hy=want?want.y*dt:wy;      // where the player meant to go, before any shove
  let sx=0,sy=0;if(A.kx||A.ky){sx=A.kx*dt;sy=A.ky*dt;const d=Math.exp(-dt*5);A.kx*=d;A.ky*=d;if(Math.hypot(A.kx,A.ky)<.05)A.kx=A.ky=0}
  input.dx=input.dy=0;
  if(!S.fp&&P.sit){const up=standSpot(P.sit);P.sit=null;if(up)P.ghost={pts:[up],sp:2.5}}   // (no sitting top-down)
  updateBoat(dt);updateCarDoors(dt);
  if(P.car){if(!S.fp&&A.click&&carSpeed(P.car)<1)P.car.exiting=true}          // top-down: a click when stopped opens the door and you get out
  else if(!S.fp){const c=carStepIn();if(c)enterCar(c)}
  updateDriving(dt);
  playerFilter();movePlayer(dt,wx,wy,sx,sy,want);
  if(!S.fp&&Math.hypot(hx,hy)>.01)P.a+=angDiff(Math.atan2(hy,hx),P.a)*Math.min(1,Math.hypot(hx,hy)*4);   // the pointer faces the way it last moved
  updateArena(dt,amx,amy);
  // the physics step: everything moves
  const ca=P.car?P.car.a:0,ba=BOAT.a,bx=BOAT.x,by=BOAT.y;
  step(dt);afterStep();
  if(S.fp&&P.car)P.a+=P.car.a-ca;                        // the view turns with the car or the boat
  if(P.boat){if(S.fp)P.a+=BOAT.a-ba;CAM.x+=BOAT.x-bx;CAM.y+=BOAT.y-by}   // and the camera goes along with the boat
  updateZ();playerFilter();
  S.eyeH+=((P.sit?1.12:1.65)-S.eyeH)*Math.min(1,dt*7);
  if(!P.lift)S.pendingBtn=null;
  for(const l of LIFTS)updateLift(l,dt);
  updateMyDoor(dt);updateIndoor(dt);
  if(S.fp&&A.click&&!MYDOOR.grab){const t=aimedPress();if(t)t.act()}
  A.click=A.rclick=false;
  // the camera trails the pointer a little but never lets it stray far from the centre
  // (a missile takes the camera with it; a drawn bow nudges it towards where the shot will go)
  let fx=P.x,fy=P.y;
  if(P.car){fx+=P.car.vx*.45;fy+=P.car.vy*.45}          // look ahead down the road
  if(inArena()){if(A.missile){fx=A.missile.x;fy=A.missile.y}else if(A.bow){fx-=A.bow.px*.6;fy-=A.bow.py*.6}}
  const easing=A.ease>0;if(easing)A.ease-=dt;                      // gliding back after a missile: slower, and unclamped
  const f=1-Math.exp(-dt*(easing?3.5:9));CAM.x+=(fx-CAM.x)*f;CAM.y+=(fy-CAM.y)*f;
  const ox=fx-CAM.x,oy=fy-CAM.y,o=Math.hypot(ox,oy),lim=S.view*.16;
  if(o>lim&&!easing){CAM.x=fx-ox/o*lim;CAM.y=fy-oy/o*lim}
}
