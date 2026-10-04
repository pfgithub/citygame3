import { A } from './arena';
import { P, S } from '../state';
import { clamp } from '../util';
import { MYDOOR } from '../world/tower';

// The player's own front door unlocks and slides open as they walk up to it.
// The player's front door is hinged on its west edge and swings into the flat; `open` is how far
// (0..1 of DOOR_SWING) and `h` how far the handle is turned. Top-down it opens by itself as you
// walk up. In first person you work it by hand: click the handle and drag down to turn it, then
// drag sideways to swing the door.
export const DOOR_SWING=1.75,HANDLE=.84;
// Is the crosshair on the door leaf (wherever it has swung to), within arm's reach?
export function aimingAtDoor(){
  const d=MYDOOR;if(!S.fp||Math.abs(P.z-d.z)>.01)return false;
  const a=d.open*DOOR_SWING,ux=Math.cos(a),uy=Math.sin(a),dx=Math.cos(P.a),dy=Math.sin(P.a),hx=d.x-P.x,hy=d.y+.1-P.y,den=dx*uy-dy*ux;
  if(Math.abs(den)<1e-6)return false;
  const t=(hx*uy-hy*ux)/den,sAlong=(hx*dy-hy*dx)/den;                     // along the gaze, along the door
  if(t<.05||t>2.6||sAlong<0||sAlong>d.w)return false;
  const hgt=S.eyeH+t*Math.tan(S.pitch);return hgt>0&&hgt<2.1;
}
// While the door is held: up/down works the lever, sideways leans on the door. The lever has
// to be down to unlatch a shut door; once it is ajar the lever no longer matters.
export function doorMouse(dx:number,dy:number){
  const d=MYDOOR,side=P.y<d.y+.1?1:-1;                 // from inside the flat the door comes towards you instead
  d.h=clamp(d.h+dy*.006,0,1);
  if(d.open>0||d.h>=.85)d.v+=clamp(dx*.004,-.05,.05)*side;       // a heavy door: the hand can only lean on it, speed has to build
}
export function updateMyDoor(dt:number){
  const d=MYDOOR;
  if(!S.fp){d.grab=false;
    const near=Math.abs(P.z-d.z)<.01&&Math.hypot(P.x-(d.x+.5),P.y-(d.y+.1))<1.5;
    d.open=near?Math.min(1,d.open+dt/.35):Math.max(0,d.open-dt/.35);d.h=0;d.v=0;return}
  if(d.grab){if(!A.down)d.grab=false}
  else if(A.click&&aimingAtDoor())d.grab=true;
  if(!d.grab)d.h=Math.max(0,d.h-dt*6);                              // let go and the lever springs back up
  d.open+=d.v*dt;d.v*=Math.exp(-dt*1.6);                            // it keeps swinging after you let go, and slows on its hinges
  if(d.open<=0){d.open=0;if(d.v<0)d.v=0}else if(d.open>=1){d.open=1;if(d.v>0)d.v=0}
  if(!d.grab&&d.open<.03&&d.v<=0)d.open=0;                          // nearly shut and not held: it clicks to
}
