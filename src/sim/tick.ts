import { R, SPEED_IN, VIEW_IN, VIEW_OUT } from '../constants';
import { A, inArena, mouseCaptured, updateArena } from './arena';
import { BOAT, boatPlace, tiller, updateBoat } from './boat';
import { buildDyn, collide, gather } from './collide';
import { doorMouse, updateMyDoor } from './door';
import { DCARS, carDoorMouse, carSeatBehind, carSpeed, carStepIn, enterCar, updateCarDoors, updateDriving } from './driving';
import { updatePeds } from './peds';
import { aimedPress } from './press';
import { autoSave } from './save';
import { seatBehind, seatXY, standSpot } from './seats';
import { updateTraffic } from './traffic';
import { updateTrains } from './trains';
import { CAM, P, S, input, keys } from '../state';
import { angDiff, clamp, inRect, lerp } from '../util';
import { BUILDINGS } from '../world/buildings';
import { type Lift, LIFTS, STAIRS, stairT } from '../world/floors';
import { surfaceAt } from '../world/surfaces';
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
  updateTrains(dt);updatePeds(dt);updateTraffic(dt);buildDyn();
  // You are the mouse pointer: it moves across the world exactly as far as the
  // mouse moved across the screen, however fast that is.
  let wx,wy;
  if(input.override){const sp=SPEED_IN*S.view/VIEW_IN*dt;wx=input.override.x*sp;wy=input.override.y*sp}
  else if(S.fp){ // mouse looks, WASD walks, Shift runs
    const heldCar=DCARS.find(c=>c.grab);
    if(MYDOOR.grab)doorMouse(input.dx,input.dy);        // a held handle takes the mouse; otherwise it looks around
    else if(heldCar)carDoorMouse(heldCar,input.dx,input.dy);
    else if(P.boat&&A.down)tiller(input.dx,input.dy);
    else{P.a+=input.dx*.0024;S.pitch=clamp(S.pitch-input.dy*.0024,-1.45,1.45)}
    let f=0,r=0;if(keys.has('KeyW'))f+=1;if(keys.has('KeyS'))f-=1;if(keys.has('KeyD'))r+=1;if(keys.has('KeyA'))r-=1;
    if(P.car){P.car.thr=f;P.car.st=r;f=r=0}             // at the wheel the keys drive
    if(P.sit){ // seated: settle onto the chair; walking forward stands you up
      const st=P.sit,c=Math.cos(P.a),sn=Math.sin(P.a);
      const up=f>0?standSpot(st):null;
      if(up){P.x=up.x;P.y=up.y;P.sit=null}                // get up, stepping clear of the seat
      else{
        if(r&&st.horiz!==undefined)st.p=clamp(st.p+Math.sign(st.horiz?-sn:c)*r*1.3*dt,st.min,st.max);   // A/D shuffle along a bench
        const q=seatXY(st),k=Math.min(1,dt*10);P.x+=(q.x-P.x)*k;P.y+=(q.y-P.y)*k;f=r=0}
    }else if(f<0&&r===0&&!P.car){ // backing into a chair you are facing away from sits you down; a car seat puts you at the wheel
      const cs=carSeatBehind();if(cs)enterCar(cs);else P.sit=seatBehind();
    }
    const m=Math.hypot(f,r)||1,sp=(keys.has('ShiftLeft')||keys.has('ShiftRight')?8.5:4)*dt/m,c=Math.cos(P.a),sn=Math.sin(P.a);
    wx=(f*c-r*sn)*sp;wy=(f*sn+r*c)*sp;
  }else if(P.car){const c=P.car,k=S.dpr*S.view/Math.min(S.w,S.h);c.ax+=input.dx*k;c.ay+=input.dy*k;   // the mouse moves the pointer the car chases
    const d=Math.hypot(c.ax,c.ay);if(d>14){c.ax*=14/d;c.ay*=14/d}wx=wy=0}
  else if(P.boat&&A.down){tiller(input.dx,input.dy);wx=wy=0}
  else{const k=S.dpr*S.view/Math.min(S.w,S.h);wx=input.dx*k;wy=input.dy*k}
  let amx=0,amy=0;if(!input.override&&mouseCaptured()){amx=wx;amy=wy;wx=wy=0}
  const hx=wx,hy=wy;                                   // where the player meant to go, before any shove
  if(A.kx||A.ky){wx+=A.kx*dt;wy+=A.ky*dt;const d=Math.exp(-dt*5);A.kx*=d;A.ky*=d;if(Math.hypot(A.kx,A.ky)<.05)A.kx=A.ky=0}
  input.dx=input.dy=0;
  if(P.boat){ // aboard: you walk about the deck, in the boat's own frame
    const b=BOAT,q=P.boat,c=Math.cos(b.a),s=Math.sin(b.a);
    q.lx=clamp(q.lx+wx*c+wy*s,-2.3,2.3);q.ly=clamp(q.ly-wx*s+wy*c,b.docked&&Math.abs(q.lx)<1.25?-2:-.85,.85);wx=wy=0;boatPlace();   // (you can only step off amidships, at the gap in the rail)
    if(b.docked&&P.x<623.3)P.boat=null;                 // back over the side onto the pier
  }
  updateBoat(dt);
  updateCarDoors(dt);
  if(P.car){if(!S.fp&&A.click&&carSpeed(P.car)<1)P.car.exiting=true;          // top-down: a click when stopped opens the door and you get out
    wx=wy=0;if(P.car)updateDriving(dt)}
  else if(!S.fp){const c=carStepIn();if(c)enterCar(c)}
  // Surfaces. Ordinarily the pointer goes exactly where the mouse says. On ice the mouse only
  // pushes: speed builds, and carries on when you stop. In water you wade: slow, and sluggish.
  const sf=P.boat||P.sit||P.lift||P.car?null:surfaceAt(P.x,P.y,P.z),px0=P.x,py0=P.y;
  if(sf==='ice'){P.vx+=wx*.9;P.vy+=wy*.9;const f=Math.exp(-dt*.45),sp=Math.hypot(P.vx,P.vy),k=sp>30?30/sp:1;P.vx*=f*k;P.vy*=f*k;wx=P.vx*dt;wy=P.vy*dt}
  else if(sf==='water'){let tx=wx/dt*.4,ty=wy/dt*.4;const sp=Math.hypot(tx,ty);if(sp>4){tx*=4/sp;ty*=4/sp}
    const k=Math.min(1,dt*4);P.vx+=(tx-P.vx)*k;P.vy+=(ty-P.vy)*k;wx=P.vx*dt;wy=P.vy*dt}
  else{P.vx=wx/dt;P.vy=wy/dt;const sp=Math.hypot(P.vx,P.vy);if(sp>25){P.vx*=25/sp;P.vy*=25/sp}}   // so you arrive on the ice with the speed you had
  const dist=Math.hypot(wx,wy);
  if(dist>1e-6){ // small steps so nothing is tunnelled through, whatever the speed
    const n=Math.min(6000,Math.ceil(dist/.08));
    gather(Math.min(P.x,P.x+wx)-1.5,Math.min(P.y,P.y+wy)-1.5,Math.max(P.x,P.x+wx)+1.5,Math.max(P.y,P.y+wy)+1.5);
    for(let i=0;i<n;i++){
      const bx=P.x,by=P.y;P.x+=wx/n;P.y+=wy/n;collide();updateZ();
      if(Math.abs(P.x-bx)+Math.abs(P.y-by)<1e-5)break;   // pinned against something: the rest of the flick goes nowhere
    }
  }
  if(sf){P.vx=(P.x-px0)/dt;P.vy=(P.y-py0)/dt}          // whatever a wall or the boards stopped is gone
  if(!S.fp&&Math.hypot(hx,hy)>.01)P.a+=angDiff(Math.atan2(hy,hx),P.a)*Math.min(1,Math.hypot(hx,hy)*4);   // the pointer faces the way it last moved
  gather(P.x-1.5,P.y-1.5,P.x+1.5,P.y+1.5);
  if(!S.fp)P.sit=null;
  S.eyeH+=((P.sit?1.12:1.65)-S.eyeH)*Math.min(1,dt*7);
  if(!P.lift)S.pendingBtn=null;
  for(const l of LIFTS)updateLift(l,dt);
  updateMyDoor(dt);collide();updateZ();updateIndoor(dt);
  if(S.fp&&A.click&&!MYDOOR.grab){const t=aimedPress();if(t)t.act()}
  updateArena(dt,amx,amy);if(A.ball)collide();   // (a swinging ball may have tugged the player)
  // the camera trails the pointer a little but never lets it stray far from the centre
  // (a drawn bow pulls the camera towards the drag point; a missile takes it along)
  // (a missile takes the camera with it; a drawn bow nudges it towards where the shot will go)
  let fx=P.x,fy=P.y;
  if(P.car){fx+=P.car.vx*.45;fy+=P.car.vy*.45}          // look ahead down the road
  if(inArena()){if(A.missile){fx=A.missile.x;fy=A.missile.y}else if(A.bow){fx-=A.bow.px*.6;fy-=A.bow.py*.6}}
  const easing=A.ease>0;if(easing)A.ease-=dt;                      // gliding back after a missile: slower, and unclamped
  const f=1-Math.exp(-dt*(easing?3.5:9));CAM.x+=(fx-CAM.x)*f;CAM.y+=(fy-CAM.y)*f;
  const ox=fx-CAM.x,oy=fy-CAM.y,o=Math.hypot(ox,oy),lim=S.view*.16;
  if(o>lim&&!easing){CAM.x=fx-ox/o*lim;CAM.y=fy-oy/o*lim}
}
