import { type Box, World, makeBox, makeWall } from './solver';

// A box of four infinitely thin walls with a tower of ten cubes in it. Drag a cube with the mouse:
// a spring pulls the grabbed point towards the pointer (the line), up to a strength you choose.
const cv=document.getElementById('cv') as HTMLCanvasElement,g=cv.getContext('2d')!;
const strEl=document.getElementById('str') as HTMLInputElement,strV=document.getElementById('strv')!,cpsEl=document.getElementById('cps') as HTMLInputElement;
const statsEl=document.getElementById('stats')!;
const W=12,H=9,S=.7;                                   // the box's inside, metres; cube size
let world:World;
function reset(){
  world=new World();
  // corners counter-clockwise, so every wall's normal faces in (it would work either way round)
  world.addWall(makeWall(0,0,W,0));world.addWall(makeWall(W,0,W,H));world.addWall(makeWall(W,H,0,H));world.addWall(makeWall(0,H,0,0));
  for(let i=0;i<10;i++)world.add(makeBox(W/2,S/2+i*S,S/2,S/2));
  worst=0;escaped=0;
}
let worst=0,escaped=0;
reset();
document.getElementById('reset')!.addEventListener('click',reset);
const strength=()=>Math.round(10**+strEl.value);       // the pull's maximum, in multiples of the cube's weight
const showStr=()=>{strV.textContent='×'+strength()+' weight'};strEl.addEventListener('input',showStr);showStr();

// view: fit the box with a margin; y up
let scale=1,ox=0,oy=0;
function resize(){const dpr=devicePixelRatio||1;cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;
  scale=Math.min(cv.width/(W+2),cv.height/(H+2));ox=(cv.width-W*scale)/2;oy=(cv.height+H*scale)/2}
addEventListener('resize',resize);resize();
const toWorld=(e:PointerEvent)=>{const dpr=devicePixelRatio||1;return{x:(e.clientX*dpr-ox)/scale,y:(oy-e.clientY*dpr)/scale}};
const sx=(x:number)=>ox+x*scale,sy=(y:number)=>oy-y*scale;

function inside(b:Box,x:number,y:number){const c=Math.cos(b.a),s=Math.sin(b.a),dx=x-b.x,dy=y-b.y,lx=c*dx+s*dy,ly=-s*dx+c*dy;return Math.abs(lx)<=b.hw&&Math.abs(ly)<=b.hh}
cv.addEventListener('pointerdown',e=>{const p=toWorld(e),b=world.boxes.find(b=>inside(b,p.x,p.y));if(!b)return;
  const c=Math.cos(b.a),s=Math.sin(b.a),dx=p.x-b.x,dy=p.y-b.y;
  world.grab={b,lx:c*dx+s*dy,ly:-s*dx+c*dy,tx:p.x,ty:p.y,maxForce:0,imp:[0,0]};cv.setPointerCapture(e.pointerId);cv.classList.add('drag')});
cv.addEventListener('pointermove',e=>{if(!world.grab)return;const p=toWorld(e);world.grab.tx=p.x;world.grab.ty=p.y});
const drop=()=>{world.grab=null;cv.classList.remove('drag')};
cv.addEventListener('pointerup',drop);cv.addEventListener('pointercancel',drop);

let last=performance.now();
function frame(now:number){
  const dt=Math.min(1/30,(now-last)/1000);last=now;
  if(world.grab)world.grab.maxForce=strength()*10/world.grab.b.invM;
  const t0=performance.now();world.step(dt);const ms=performance.now()-t0;
  const pen=world.wallPenetration();worst=Math.max(worst,pen);
  escaped=Math.max(escaped,world.boxes.filter(b=>b.x<0||b.x>W||b.y<0||b.y>H).length);
  draw();
  statsEl.textContent=`substeps ${String(world.substeps).padStart(3)}${world.slowed?'  (slowed down)':''}   solver ${ms.toFixed(1)} ms\n`+
    `deepest into a wall: now ${(pen*1000).toFixed(1)} mm, worst ${(worst*1000).toFixed(1)} mm\nmost cubes ever outside the box: ${escaped}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const COLS=['#e07a5f','#f2cc8f','#81b29a','#3d85c6','#c27ba0','#e9c46a','#2a9d8f','#f4a261','#8d99ae','#b5838d'];
function draw(){
  g.fillStyle='#16181d';g.fillRect(0,0,cv.width,cv.height);
  const px=Math.max(1,Math.round(devicePixelRatio||1));
  world.boxes.forEach((b,i)=>{const c=Math.cos(b.a),s=Math.sin(b.a);g.beginPath();
    for(const[lx,ly]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const x=b.x+c*lx*b.hw-s*ly*b.hh,y=b.y+s*lx*b.hw+c*ly*b.hh;g.lineTo(sx(x),sy(y))}
    g.closePath();g.fillStyle=COLS[i];g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=px;g.stroke()});
  g.strokeStyle='#e8eaee';g.lineWidth=px;g.beginPath();                 // the walls: one device pixel, as thin as can be drawn
  for(const w of world.walls){g.moveTo(sx(w.ax),sy(w.ay));g.lineTo(sx(w.bx),sy(w.by))}g.stroke();
  if(cpsEl.checked){g.fillStyle='#ff4d6d';const c=world.contacts;for(let i=0;i<c.length;i+=2){g.beginPath();g.arc(sx(c[i]),sy(c[i+1]),3*px,0,7);g.fill()}}
  const gr=world.grab;
  if(gr){const b=gr.b,c=Math.cos(b.a),s=Math.sin(b.a),ax=b.x+c*gr.lx-s*gr.ly,ay=b.y+s*gr.lx+c*gr.ly;   // the pull: from the grabbed point to the pointer
    g.strokeStyle='#ffd166';g.lineWidth=2*px;g.beginPath();g.moveTo(sx(ax),sy(ay));g.lineTo(sx(gr.tx),sy(gr.ty));g.stroke();
    g.fillStyle='#ffd166';for(const[x,y]of[[ax,ay],[gr.tx,gr.ty]]){g.beginPath();g.arc(sx(x),sy(y),4*px,0,7);g.fill()}}
}
// For scripted tests.
declare global{interface Window{demo:unknown}}
window.demo={get world(){return world},setStrength:(v:number)=>{strEl.value=String(v);showStr()},get worst(){return worst},get escaped(){return escaped}};
