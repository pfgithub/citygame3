import { elevEl, ptrEl } from './hud';
import { cv } from './render/renderer';
import { A } from './sim/arena';
import { resetSave } from './sim/save';
import { P, S, input, keys } from './state';
import { clamp } from './util';

// Desktop: click to lock the pointer, then the mouse drives. Touch: drag like a trackpad.
export const hintEl=document.getElementById('hint'),TOUCH=matchMedia('(pointer:coarse)').matches;
export const locked=()=>document.pointerLockElement===cv;
export function showHint(){hintEl.textContent=TOUCH?(S.fp?'Drag to look around':'Drag to move the pointer'):S.fp?'Click to look  ·  WASD to walk, Shift to run  ·  click things to use them  ·  Esc to let go':'Click to take the mouse  ·  Esc to let go  ·  in a lift: scroll or 1–0';hintEl.style.opacity=locked()?0:1}
document.addEventListener('pointerlockchange',showHint);
export const liftStep=d=>{const l=P.lift;if(l&&!S.fp)S.pendingBtn=clamp((S.pendingBtn??l.target??Math.round(l.z))+d,l.zmin,l.zmax)};
export const fpEl=document.getElementById('fp');
export function setFP(on){S.fp=on;S.pitch=0;fpEl.textContent=S.fp?'Top-down view (F)':'First person (F)';ptrEl.style.display=S.fp?'none':'';document.getElementById('xh').style.display=S.fp?'block':'none';showHint()}
fpEl.addEventListener('click',()=>{setFP(!S.fp);fpEl.blur()});
document.getElementById('reset').addEventListener('click',e=>{resetSave();e.target.blur()});
setFP(false);
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
addEventListener('keydown',e=>{
  keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)setFP(!S.fp);
  if(e.code==='KeyR'&&e.shiftKey&&!e.repeat)resetSave();
  if(/^Digit\d$/.test(e.code)&&P.lift&&!S.fp)S.pendingBtn=(+e.code.slice(5)+9)%10;   // 1..9, and 0 for the tenth floor
  if(e.code==='ArrowUp'||e.code==='ArrowDown'){liftStep(e.code==='ArrowUp'?1:-1);e.preventDefault()}});
addEventListener('wheel',e=>{liftStep(e.deltaY<0?1:-1);e.preventDefault()},{passive:false});
export let finger=null;
cv.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'){if(!locked()){const r=cv.requestPointerLock({unadjustedMovement:true});if(r&&r.catch)r.catch(()=>cv.requestPointerLock())}
    else if(e.button===0){A.down=true;A.click=true}else if(e.button===2)A.rclick=true}
  else if(!finger){finger={id:e.pointerId,x:e.clientX,y:e.clientY};hintEl.style.opacity=0;try{cv.setPointerCapture(e.pointerId)}catch(_){}}
  e.preventDefault()});
cv.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse'){if(locked()){input.dx+=e.movementX;input.dy+=e.movementY}}
  else if(finger&&e.pointerId===finger.id){input.dx+=e.clientX-finger.x;input.dy+=e.clientY-finger.y;finger.x=e.clientX;finger.y=e.clientY}});
export const endFinger=e=>{if(finger&&e.pointerId===finger.id)finger=null};
addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===0)A.down=false});
cv.addEventListener('pointerup',endFinger);cv.addEventListener('pointercancel',endFinger);
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
elevEl.addEventListener('pointerdown',e=>{e.preventDefault();const f=e.target.dataset&&e.target.dataset.f;if(P.lift&&f!==undefined)S.pendingBtn=+f});
