import * as THREE from 'three';
import { WALL_H, Y } from '../constants';
import { ptrEl, updateHud } from '../hud';
import { arenaSync } from './arena';
import { FPONLY, setBox } from './mesh';
import { doorHalf, doorOpen } from './paint';
import { HALF_FOV, QUAD, RT, camera, qcam, qscene, renderer, scene } from './renderer';
import { MYLID, TOPONLY } from './sceneBuildings';
import { CANOPIES, OUTG, updateTiles } from './sceneCity';
import { SIGNALS } from './sceneMovers';
import { TUNNEL } from './sceneSubway';
import { BOAT } from '../sim/boat';
import { DOOR_SWING } from '../sim/door';
import { DCARS, DOOR_SWING_CAR } from '../sim/driving';
import { PEDS } from '../sim/peds';
import { CARS, sigState } from '../sim/traffic';
import { gatesOpen } from '../sim/trains';
import { CAM, P, S } from '../state';
import { clamp, inRect, lerp } from '../util';
import { type Building, BUILDINGS } from '../world/buildings';
import { type Lift, LIFTS, STAIRS } from '../world/floors';
import { DOCK, EDGEY, GATES, STATIONS, TDOORS, TDW, TRAINS, TW, dockedDoor, sideOpen } from '../world/subway';
import { MYDOOR, MYFLAT, MYRECT } from '../world/tower';
import { EYE, TILT, tiltEye } from '../tilt';

// ---- what to show
// A view is {k, b}: storey k of building b cut open (b=null: nothing cut open,
// every building shown from outside), or {lift}: only the inside of a lift car.
interface View{k?:number,b?:Building|null,lift?:Lift}
function applyView(v:View){
  const k=v.k as number;   // (undefined for a lift: every comparison with it is false)
  const up=!v.lift&&k>=0;
  OUTG.visible=up;
  for(const b of BUILDINGS){const mine=up&&v.b===b;b.ext.visible=up&&!mine;b.levels.forEach((g,i)=>g.visible=mine&&i<=k)}
  for(const s of STAIRS){
    const on=v.lift?false:s.owner?up&&v.b===s.owner&&k>=s.zl:k===s.zl||k===s.zh||(up&&s.zh===0);
    s.low.visible=on;s.high.visible=on&&k>=s.zh}
  for(const l of LIFTS)l.car.visible=v.lift===l||(up&&v.b===l.owner&&Math.floor(l.z+.01)<=k);
  for(const st of STATIONS){st.g1.visible=!v.lift&&k===-1;st.g2.visible=!v.lift&&k===-2}
  TUNNEL.visible=!v.lift&&k===-2;for(const tr of TRAINS)tr.g.visible=TUNNEL.visible;
}
// The frame is a blend of two views, and the blend is driven by position:
// height on a staircase, distance through a doorway, how far a lift's doors are open.
function views():[View,View|null,number]{
  const z=P.z;
  if(P.lift)return[{k:Math.round(z),b:P.lift.owner},{lift:P.lift},1-P.lift.door];
  const s=STAIRS.find(s=>z>s.zl&&z<s.zh&&inRect(P.x,P.y,s));   // the flight the player is actually on
  if(s)return[{k:s.zl,b:s.owner},{k:s.zh,b:s.owner},(z-s.zl)/(s.zh-s.zl)];
  const L=Math.round(z);
  if(L<0)return[{k:L,b:null},null,0];
  const mine=BUILDINGS.reduce((a,b)=>b.bIn>a.bIn?b:a);
  if(L>0)return[{k:L,b:BUILDINGS.find(b=>inRect(P.x,P.y,b.rect))||mine},null,0];
  return[{k:0,b:null},{k:0,b:mine},mine.bIn];
}
let signT=0;
const SKY=new THREE.Color('#a9cfee'),NIGHT=new THREE.Color('#14161a');
export function render(){
  // moving parts
  for(const l of LIFTS){l.car.position.y=Y(l.z)+.03;
    l.doors.forEach((pr,i)=>{const z=l.zmin+i,d=l.dr,hw=doorHalf(l,doorOpen(l,z)),y=Y(z)+.03;
      setBox(pr[0],d.x,d.y+.04,hw,d.h-.08,y,y+2.2);setBox(pr[1],d.x+d.w-hw,d.y+.04,hw,d.h-.08,y,y+2.2)})}
  {const d=MYDOOR;d.pivot.rotation.y=-d.open*DOOR_SWING;d.lever.rotation.z=d.handle*.8}
  for(const tr of TRAINS){tr.g.position.set(tr.x,0,tr.y);const y=Y(-2);
    for(const k of[0,1]){const hw=TDW/2*(1-sideOpen(tr,k)*.92),wy=(k?0:TW-.15)+.02;
      tr.doors[k].forEach((pr,i)=>{const x=TDOORS[i];setBox(pr[0],x,wy,hw,.11,y,y+2.1);setBox(pr[1],x+TDW-hw,wy,hw,.11,y,y+2.1)})}}
  STATIONS.forEach((st,si)=>{for(let k=0;k<2;k++){const hw=TDW/2*(1-dockedDoor(si,k)*.92),y=Y(-2);
    st.doors[k].forEach((pr,i)=>{const x=st.dx+DOCK+TDOORS[i];setBox(pr[0],x,EDGEY[k]+.03,hw,.14,y,y+2.1);setBox(pr[1],x+TDW-hw,EDGEY[k]+.03,hw,.14,y,y+2.1)})}});
  for(const g of GATES){ // an unlocked arm swings away from you as you come through
    const d=Math.hypot(P.x-g.cx,P.y-g.cy),o=P.z===-1&&gatesOpen()?clamp((1.05-d)/.6):0;
    g.o+=(o-g.o)*.35;g.pivot.rotation.y=(P.x<g.cx?1:-1)*g.o*1.45}
  for(const q of PEDS){const sat=q.sit>0&&!!q.seat,walking=Math.hypot(q.vx,q.vy)>.3;q.g.position.set(q.x,sat?-.3:walking?Math.abs(Math.sin(S.time*7+q.sp*40))*.035:0,q.y);q.g.rotation.y=-q.hd}
  for(const c of CARS){c.g.position.set(c.x,0,c.y);c.g.rotation.y=-c.a}
  for(const sg of SIGNALS){const st=sigState(sg.g);sg.lamp.material.color.set(st==='g'?'#3fd06a':st==='y'?'#f0b63a':'#e5484d')}
  for(const c of DCARS){c.g.position.set(c.x,0,c.y);c.g.rotation.y=-c.a;c.dash.visible=S.fp&&P.car===c;c.pivot.rotation.y=-c.door*DOOR_SWING_CAR}
  {const b=BOAT;b.g.position.set(b.x,Math.sin(S.time*1.3)*.02,b.y);b.g.rotation.y=-b.a;
    b.tiller.position.set(-1.55,.75,0);b.tiller.scale.set(1.3,.06,.06);b.tiller.rotation.y=b.rud;b.tiller.visible=true}
  arenaSync();updateTiles();
  if(P.z<-1.5&&S.time-signT>1){signT=S.time;for(const st of STATIONS)st.art.paint()}     // platform countdown signs
  if(P.z>-.9)for(const c of CANOPIES){const t=c.t,a=S.fp?1:lerp(.22,1,clamp((Math.hypot(P.x-t.x,P.y-t.y)-t.r+.4)/1.6));   // canopies fade when the pointer is under them
    const mt=c.m.material,tr=a<.995;mt.opacity=a;
    if(mt.transparent!==tr){mt.transparent=tr;mt.depthWrite=!tr;mt.needsUpdate=true}}   // three bakes "opaque" into the shader, so a switch needs a rebuild
  for(const m of FPONLY)m.visible=S.fp;
  for(const l of LIFTS){l.paintPanel();l.hall.visible=S.fp}
  for(const m of TOPONLY)m.visible=!S.fp;
  {const home=P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT),o=home?0:1-MYDOOR.open;MYLID.material.opacity=o;MYLID.visible=!S.fp&&o>.01}
  scene.background=S.fp?SKY:NIGHT;   // underground is fully roofed over, so the sky only shows up the entrance stairs
  if(S.fp){ // everything exists at once, seen from eye height
    OUTG.visible=TUNNEL.visible=true;
    for(const b of BUILDINGS){b.ext.visible=false;for(const g of b.levels)g.visible=true}
    for(const s of STAIRS)s.low.visible=s.high.visible=true;
    for(const l of LIFTS)l.car.visible=true;
    for(const st of STATIONS)st.g1.visible=st.g2.visible=true;
    for(const tr of TRAINS)tr.g.visible=true;
    const dc=P.car,ey=dc?1.2:Y(P.z)+S.eyeH,cp=Math.cos(S.pitch),ex=dc?P.x+Math.sin(dc.a)*.38-Math.cos(dc.a)*.25:P.x,ez=dc?P.y-Math.cos(dc.a)*.38-Math.sin(dc.a)*.25:P.y;
    camera.aspect=S.w/S.h;camera.fov=72;camera.near=.12;camera.far=500;camera.up.set(0,1,0);
    camera.position.set(ex,ey,ez);camera.lookAt(ex+Math.cos(P.a)*cp,ey+Math.sin(S.pitch),ez+Math.sin(P.a)*cp);camera.updateProjectionMatrix();
    renderer.setRenderTarget(null);renderer.render(scene,camera);updateHud();return;
  }
  camera.near=1;
  // camera: straight down, high enough that `view` metres span the short side of the screen
  const hgt=S.view/2/Math.tan(HALF_FOV),ty=Y(P.z),e=tiltEye();
  // The screen is a pane of glass `gy` up: the floor the pointer is on, or with 3D tilt on, the tops
  // of its walls. The camera stays square to it, at the eye (straight above unless the phone is
  // tilted, see tilt.ts) `d` away, with a frustum through the screen's edges.
  const m=Math.min(S.w,S.h),sw=S.view*S.w/m,sh=S.view*S.h/m,gy=ty+WALL_H*TILT.mix,d=lerp(hgt,S.view*EYE,TILT.mix);
  const ex=e.x*d,ey=e.y*d,ez=e.z*d,n=camera.near/ez;
  camera.far=d+90;camera.position.set(CAM.x+ex,gy+ez,CAM.y-ey);camera.up.set(0,0,-1);camera.lookAt(CAM.x+ex,gy,CAM.y-ey);camera.updateMatrixWorld();
  camera.projectionMatrix.makePerspective((-sw/2-ex)*n,(sw/2-ex)*n,(sh/2-ey)*n,(-sh/2-ey)*n,camera.near,camera.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const[A,B,f]=views();
  renderer.setRenderTarget(null);
  if(!B||f<.004){applyView(A);renderer.render(scene,camera)}
  else if(f>.996){applyView(B);renderer.render(scene,camera)}
  else{
    applyView(A);renderer.render(scene,camera);
    applyView(B);renderer.setRenderTarget(RT);renderer.render(scene,camera);renderer.setRenderTarget(null);
    QUAD.material.opacity=f;renderer.autoClear=false;renderer.render(qscene,qcam);renderer.autoClear=true;
  }
  // the player: a mouse pointer with its tip on the spot
  const v=new THREE.Vector3(P.x+(P.car?P.car.ax:0),ty+.05,P.y+(P.car?P.car.ay:0)).project(camera);
  ptrEl.style.transform=`translate(${((v.x+1)/2*innerWidth).toFixed(1)}px,${((1-v.y)/2*innerHeight).toFixed(1)}px)`;
  updateHud();
}
