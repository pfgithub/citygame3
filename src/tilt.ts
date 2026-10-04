import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

// Phone tilt as a 3D window (the motion-sensor mode of github.com/pfgithub/phone3d): the screen is a
// pane of glass lying on the floor the pointer is on, the eye stays put as the phone rotates around
// the centre of its screen, and the camera is moved to the eye with an off-axis frustum, so the
// floor stays fixed to the screen while everything above or below it shifts with parallax.
// tiltEye() is that eye in screen coordinates (x right, y up, z out of the glass), 1 unit from it.
const hasSensor=typeof DeviceOrientationEvent!=='undefined'&&matchMedia('(pointer:coarse)').matches;
const KEY='ctg.tilt.v1';
let on=false,cur:Quaternion|null=null,base:Quaternion|null=null,lastSample=-1e9,lastFrame=performance.now();
const eye=new Vector3(0,0,1),target=new Vector3(),Z=new Vector3(0,0,1);
// W3C device orientation: intrinsic Z(alpha), X(beta), Y(gamma), turned into the current screen axes.
function orientation(a:number,b:number,g:number,screenAngle:number){
  const d=MathUtils.degToRad;
  return new Quaternion().setFromEuler(new Euler(d(b),d(g),d(a),'ZXY'))
    .multiply(new Quaternion().setFromAxisAngle(Z,-d(screenAngle)));
}
addEventListener('deviceorientation',e=>{
  if(!on||e.alpha===null||e.beta===null||e.gamma===null)return;
  cur=orientation(e.alpha,e.beta,e.gamma,screen.orientation?.angle??0);lastSample=performance.now();
  if(!base)base=cur.clone();   // the first sample is straight on
});
// A new screen orientation means new axes: start again from the next sample.
screen.orientation?.addEventListener('change',()=>{cur=base=null});
export function tiltEye(){
  const now=performance.now(),dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  target.copy(Z);
  if(on&&base&&cur&&now-lastSample<1000)target.applyQuaternion(base).applyQuaternion(cur.clone().invert());
  // past ~81 degrees there is no view from in front of the glass: hold the last one
  if(target.z>.15)eye.lerp(target,1-Math.exp(-dt*35));
  return eye;
}

const btn=document.getElementById('tilt') as HTMLButtonElement,ctr=document.getElementById('recentre') as HTMLButtonElement;
function set(v:boolean){
  on=v;cur=base=null;btn.textContent=on?'3D tilt: on':'3D tilt: off';ctr.style.display=on?'':'none';
  try{localStorage.setItem(KEY,on?'1':'')}catch(_){}
}
if(hasSensor){
  btn.style.display='';
  btn.addEventListener('click',async()=>{
    btn.blur();if(on){set(false);return}
    // iOS asks for permission, and only from inside a tap
    const ask=(DeviceOrientationEvent as unknown as {requestPermission?:()=>Promise<string>}).requestPermission;
    if(ask){try{if(await ask.call(DeviceOrientationEvent)!=='granted')return}catch(_){return}}
    set(true);
  });
  ctr.addEventListener('click',()=>{ctr.blur();base=null});   // the next sample is straight on again
  let saved=false;try{saved=localStorage.getItem(KEY)==='1'}catch(_){}
  set(saved&&!(DeviceOrientationEvent as unknown as {requestPermission?:unknown}).requestPermission);
}
