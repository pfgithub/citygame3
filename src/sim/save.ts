import { A, equip } from './arena';
import { DCARS } from './driving';
import { CAM, P, S, SAVE } from '../state';

let savedAt=0;
// Saved once a second while playing, and when the page is hidden or closed.
export function autoSave(){if(S.time-savedAt>1){savedAt=S.time;savePosition()}}
export function savePosition(){
  if(P.lift||P.train||P.boat)return;
  try{localStorage.setItem(SAVE,JSON.stringify({x:+P.x.toFixed(3),y:+P.y.toFixed(3),z:+P.z.toFixed(4),a:+P.a.toFixed(3),t:P.ticket}))}catch(_){}
}
// Forget the saved spot and go back to where a new game starts.
export function resetSave(){
  try{localStorage.removeItem(SAVE)}catch(_){}
  P.x=68;P.y=68.2;P.z=0;P.a=-Math.PI/2;P.lift=P.train=P.sit=P.boat=P.car=null;for(const c of DCARS){Object.assign(c,c.home);c.vx=c.vy=0}P.ticket=false;S.pitch=0;CAM.x=P.x;CAM.y=P.y;A.kx=A.ky=0;A.hp=100;equip(null);
}
addEventListener('pagehide',savePosition);document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition()});
