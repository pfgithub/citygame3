import { A } from './arena';
import { CAM, P, S } from '../state';
import { angDiff, clamp } from '../util';
import type { Mesh, Group } from 'three';

// A small launch tied up at the harbour pier. Step aboard through the gap in the rail, hold
// the mouse button to take the tiller: sideways steers, forward and back is the throttle.
// rud: the tiller, thr: the throttle; held: someone has hold of the tiller. Its meshes (g, and
// the tiller) are set when the scene is built.
export const BOAT={x:624.7,y:48.5,a:-Math.PI/2,v:0,rud:0,thr:0,docked:true,held:false} as {x:number,y:number,a:number,v:number,rud:number,thr:number,docked:boolean,held:boolean,g:Group,tiller:Mesh};
const BERTH={x:624.7,y:48.5,a:-Math.PI/2},WATER={x0:569,y0:24,x1:671,y1:56.5},PIER={x:617,y:42,w:6,h:18};
export function boatPlace(){const b=BOAT,q=P.boat!,c=Math.cos(b.a),s=Math.sin(b.a);P.x=b.x+q.lx*c-q.ly*s;P.y=b.y+q.lx*s+q.ly*c}
export function tiller(dx:number,dy:number){BOAT.rud=clamp(BOAT.rud+dx*.003,-.7,.7);BOAT.thr=clamp(BOAT.thr-dy*.003,-.4,1)}
export function updateBoat(dt:number){
  const b=BOAT,ox=P.x,oy=P.y;
  if(!P.boat&&b.docked&&P.z===0&&P.x>623.45&&P.x<626&&P.y>45.8&&P.y<51.2){ // stepped off the pier onto the deck
    const c=Math.cos(b.a),s=Math.sin(b.a),dx=P.x-b.x,dy=P.y-b.y;P.boat={lx:dx*c+dy*s,ly:-dx*s+dy*c}}
  b.held=!!P.boat&&A.down;
  if(!b.held){b.rud*=Math.exp(-dt*4);b.thr*=Math.exp(-dt*.6)}       // let go: the tiller centres and the engine idles down
  if(b.docked){if(b.held&&Math.abs(b.thr)>.08)b.docked=false;else{b.v=0;return}}
  const a0=b.a;
  b.v+=(b.thr*7-b.v)*Math.min(1,dt*.8);b.a+=b.v*b.rud*.22*dt;
  b.x+=Math.cos(b.a)*b.v*dt;b.y+=Math.sin(b.a)*b.v*dt;
  const w=WATER;if(b.x<w.x0||b.x>w.x1||b.y<w.y0||b.y>w.y1){b.x=clamp(b.x,w.x0,w.x1);b.y=clamp(b.y,w.y0,w.y1);b.v*=.6}
  {const m=1.5,r=PIER,nx=clamp(b.x,r.x-m,r.x+r.w+m),ny=clamp(b.y,r.y-m,r.y+r.h+m);     // bump off the pier
    if(nx===b.x&&ny===b.y){const l=b.x-(r.x-m),rr=r.x+r.w+m-b.x,t=b.y-(r.y-m),k=Math.min(l,rr,t);
      if(k===l)b.x=r.x-m;else if(k===rr)b.x=r.x+r.w+m;else b.y=r.y-m;b.v*=.9}}
  if(!b.held&&Math.abs(b.v)<1.6&&Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<2.6){ // drifting in by the berth: it ties itself up
    const k=Math.min(1,dt*2.5);b.x+=(BERTH.x-b.x)*k;b.y+=(BERTH.y-b.y)*k;b.a+=angDiff(BERTH.a,b.a)*k;b.v*=1-k;
    if(Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<.04&&Math.abs(angDiff(BERTH.a,b.a))<.02){b.x=BERTH.x;b.y=BERTH.y;b.a=BERTH.a;b.v=b.thr=0;b.docked=true}}
  if(P.boat){boatPlace();if(S.fp)P.a+=b.a-a0;CAM.x+=P.x-ox;CAM.y+=P.y-oy}   // whoever is aboard goes with it, and so does the camera
}
