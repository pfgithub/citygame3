import { A } from './arena';
import { P } from '../state';
import { angDiff, clamp } from '../util';
import { CAT, type Body, addBox, force, inertia, mass, mkBody, setFilter, steer, torque, track } from '../physics';
import { wall } from '../world/colliders';
import type { Mesh, Group } from 'three';

// A small launch tied up at the harbour pier. Step aboard through the gap in the rail, hold
// the mouse button to take the tiller: sideways steers, forward and back is the throttle.
// rud: the tiller, thr: the throttle; held: someone has hold of the tiller. Its meshes (g, and
// the tiller) are set when the scene is built. An 800 kg body: the propeller, the keel and the
// mooring lines are forces on it, and whoever is aboard stands on its deck inside its rails.
export const BOAT=track({x:624.7,y:48.5,rud:0,thr:0,docked:true,held:false} as {x:number,y:number,rud:number,thr:number,docked:boolean,held:boolean,g:Group,tiller:Mesh}&Body,
  mkBody('dynamic',624.7,48.5,-Math.PI/2,{damp:.05,adamp:.3}));
addBox(BOAT.id,0,0,2.75,1.2,CAT.HULL,CAT.WATERWALL,{density:800/(5.5*2.4),restitution:.2});addBox(BOAT.id,3,0,.35,.7,CAT.HULL,CAT.WATERWALL,{density:1});
// the rails, which only someone aboard bumps into; the gap amidships on the port side is open while it is tied up
for(const[x,y,w,h]of[[2.65,0,.1,1.3],[-2.65,0,.1,1.3],[0,1.2,2.75,.1],[-2,-1.2,.75,.1],[2,-1.2,.75,.1]])addBox(BOAT.id,x,y,w,h,CAT.RAIL,CAT.PLAYER);
const GAP=addBox(BOAT.id,0,-1.2,1.25,.1,CAT.RAIL,CAT.PLAYER);
const BERTH={x:624.7,y:48.5,a:-Math.PI/2},WATER={x0:569,y0:24,x1:671,y1:56.5},PIER={x:617,y:42,w:6,h:18};
// The harbour basin: the quay all round, and the pier.
{const m=1.5,w=WATER;for(const[x,y,ww,hh]of[[w.x0-m-5,w.y0-m-5,w.x1-w.x0+2*m+10,5],[w.x0-m-5,w.y1+m,w.x1-w.x0+2*m+10,5],[w.x0-m-5,w.y0-m,5,w.y1-w.y0+2*m],[w.x1+m,w.y0-m,5,w.y1-w.y0+2*m]])
  wall(x,y,ww,hh,CAT.WATERWALL,CAT.HULL);wall(PIER.x,PIER.y,PIER.w,PIER.h,CAT.WATERWALL,CAT.HULL)}
export function tiller(dx:number,dy:number){BOAT.rud=clamp(BOAT.rud+dx*.003,-.7,.7);BOAT.thr=clamp(BOAT.thr-dy*.003,-.4,1)}
// Pull the boat towards its berth like a mooring line: a spring, with damping.
function moor(k:number){const b=BOAT,m=mass(b.id);force(b.id,(k*k*(BERTH.x-b.x)-2*k*b.vx)*m,(k*k*(BERTH.y-b.y)-2*k*b.vy)*m);steer(b,BERTH.a,k/(2*Math.PI))}
export function updateBoat(dt:number){
  const b=BOAT;
  if(!P.boat&&b.docked&&P.z===0&&P.x>623.45&&P.x<626&&P.y>45.8&&P.y<51.2)P.boat=true;   // stepped off the pier onto the deck
  if(P.boat&&b.docked&&P.x<623.3)P.boat=false;                                          // back over the side onto the pier
  setFilter(GAP,b.docked?0:CAT.RAIL,CAT.PLAYER);
  b.held=P.boat&&A.down;
  if(!b.held){b.rud*=Math.exp(-dt*4);b.thr*=Math.exp(-dt*.6)}       // let go: the tiller centres and the engine idles down
  if(b.docked){if(b.held&&Math.abs(b.thr)>.08)b.docked=false;else{moor(3);return}}
  const fx=Math.cos(b.a),fy=Math.sin(b.a),vf=b.vx*fx+b.vy*fy,vl=-b.vx*fy+b.vy*fx,m=mass(b.id);
  const af=(b.thr*7-vf)*.8,al=-vl*3;                                  // the propeller, and the keel resisting sideways drift
  force(b.id,(af*fx-al*fy)*m,(af*fy+al*fx)*m);
  torque(b.id,clamp((vf*b.rud*.22-b.w)*2,-3,3)*inertia(b.id));       // the rudder turns it as it moves through the water
  if(!b.held&&Math.hypot(b.vx,b.vy)<1.6&&Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<2.6){ // drifting in by the berth: it ties itself up
    moor(1.6);
    if(Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<.08&&Math.abs(angDiff(BERTH.a,b.a))<.03&&Math.hypot(b.vx,b.vy)<.1){b.thr=0;b.docked=true}}
}
