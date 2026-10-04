import { P, S, SAVE } from '../state';

let savedAt=0;
// Saved once a second while playing, and when the page is hidden or closed.
export function autoSave(){if(S.time-savedAt>1){savedAt=S.time;savePosition()}}
function savePosition(){
  if(resetting||P.lift||P.train||P.boat)return;
  try{localStorage.setItem(SAVE,JSON.stringify({x:+P.x.toFixed(3),y:+P.y.toFixed(3),z:+P.z.toFixed(4),a:+P.a.toFixed(3),t:P.ticket}))}catch(_){}
}
// Forget the saved spot and start a new game where a new game starts (bodies are never moved
// by hand, so this starts the world afresh).
let resetting=false;
export function resetSave(){
  resetting=true;try{localStorage.removeItem(SAVE)}catch(_){}
  location.reload();
}
addEventListener('pagehide',savePosition);document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition()});
