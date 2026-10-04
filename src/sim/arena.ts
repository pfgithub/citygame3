import { R, REGIONS, regionAt } from '../constants';
import { CAM, P, S } from '../state';
import { angDiff, clamp, lerp, mulberry32, segDist } from '../util';
import { FIELD, WEAPONS, type Weapon } from '../world/arena';
import type { Mesh, MeshBasicMaterial, ShapeGeometry } from 'three';
import type { Pt } from '../types';

// A creature: sp is its top speed, max its full health; dead counts down to its respawn, flash
// is how long it shows a hit, cd how long until it can be hit again by the same swing, atk how
// long until it can bite again. wx, wy: where it is wandering to, wt how long it keeps at it.
export interface Creature extends Pt{vx:number,vy:number,r:number,max:number,sp:number,col:string,hp:number,dead:number,
  flash:number,cd:number,atk:number,wx:number,wy:number,wt:number}
type Moving=Pt&{px:number,py:number};   // a point that remembers where it was last tick
// The fight: whatever the current weapon (cur) has in play, the player's health (hp) and the
// shove they are getting (kx, ky), and the mouse buttons (down, plus click / rclick this tick).
// pv: the player's velocity; ease: the camera gliding back after a missile; cdw: weapon cooldown;
// msg: how long the knocked-out message stays up.
export interface Arena{boom:{x:number,y:number,vx:number,vy:number,t:number}|null,whip:Moving[]|null,well:{x:number,y:number,t:number}|null,
  shot:{x:number,y:number,a:number,t:number}|null,last:Pt|null,pv:Pt,shapes:{pts:Pt[],t:number,m?:Mesh<ShapeGeometry,MeshBasicMaterial>}[],
  hp:number,kx:number,ky:number,msg:number,ease:number,cdw:number,sp:{dx:number,dy:number,len:number,a:number,tip:Pt|null,out:boolean}|null,
  orbs:{x:number,y:number,vx:number,vy:number,fly:number,dead?:number}[],rclick:boolean,cur:Weapon|null,down:boolean,click:boolean,kills:number,
  bow:{dx:number,dy:number,px:number,py:number}|null,ball:Moving|null,fuel:number,lastDrop:Pt|null,puddles:{x:number,y:number,t:number}[],
  arrows:{x:number,y:number,vx:number,vy:number,life:number,dmg:number}[],missile:{x:number,y:number,a:number,want:number,life:number}|null,
  blast:{x:number,y:number,t:number,r:number}|null,lasso:{pts:Pt[],len:number}|null,tip:Pt|null,creatures:Creature[],up?:boolean,crack?:number}

// Top-down (mouse) mode only. Walking onto a pad takes that weapon.
export const A:Arena={boom:null,whip:null,well:null,shot:null,last:null,pv:{x:0,y:0},shapes:[],hp:100,kx:0,ky:0,msg:0,ease:0,cdw:0,sp:null,orbs:[],rclick:false,cur:null,down:false,click:false,kills:0,bow:null,ball:null,fuel:1,lastDrop:null,puddles:[],arrows:[],missile:null,blast:null,lasso:null,tip:null,creatures:[]};
const crng=mulberry32(99);
const ROPE=50;                       // metres of lasso
function spawn(c:Creature){
  const k=crng();
  Object.assign(c,k<.5?{r:.5,max:35,sp:4.2,col:'#7d4fb0'}:k<.85?{r:.75,max:70,sp:3.1,col:'#3f8f5a'}:{r:1.15,max:160,sp:2.1,col:'#b0453f'});
  do{c.x=lerp(FIELD.x0+2,FIELD.x1-2,crng());c.y=lerp(FIELD.y0+2,FIELD.y1-2,crng())}while(Math.hypot(c.x-P.x,c.y-P.y)<14);
  c.hp=c.max;c.vx=c.vy=0;c.dead=0;c.flash=0;c.cd=0;c.atk=0;c.wx=c.x;c.wy=c.y;c.wt=0;
}
for(let i=0;i<14;i++){const c={} as Creature;spawn(c);A.creatures.push(c)}
function hurt(c:Creature,d:number,kx=0,ky=0){
  if(c.dead)return;
  const k=Math.hypot(kx,ky);if(k>24){kx*=24/k;ky*=24/k}
  c.hp-=d;c.flash=.18;c.vx+=kx;c.vy+=ky;
  if(c.hp<=0){c.dead=2.5;A.kills++}
}
function inPoly(x:number,y:number,pts:Pt[]){let ins=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)ins=!ins}
  return ins}
// Where two rope segments cross, or null.
function segX(a:Pt,b:Pt,c:Pt,d:Pt){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)return null;
  const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;
  return t>1e-6&&t<=1&&u>=0&&u<=1?{x:a.x+rx*t,y:a.y+ry*t}:null;
}
// The closed loops in a rope path. Walks the path; each time it crosses itself the loop
// just completed is cut off and the walk carries on from the crossing.
function ropeLoops(pts:Pt[]){
  // an end that stops just short of the rope still counts as closing the loop
  const e=pts[pts.length-1];let near=-1,nd=1.6;
  for(let i=0;i<pts.length-8;i++){const d=Math.hypot(pts[i].x-e.x,pts[i].y-e.y);if(d<nd){nd=d;near=i}}
  if(near>=0)pts=[...pts,pts[near],pts[near+1]||pts[near]];
  const loops:Pt[][]=[],w=[pts[0]];
  for(let k=1;k<pts.length;k++){const q=pts[k];
    for(let again=true;again;){again=false;const a=w[w.length-1];
      for(let i=w.length-3;i>=0;i--){const X=segX(a,q,w[i],w[i+1]);
        if(X){const lp=[X,...w.slice(i+1)];let ar=0;for(let m=0;m<lp.length;m++){const u=lp[m],v=lp[(m+1)%lp.length];ar+=u.x*v.y-v.x*u.y}
          if(Math.abs(ar)/2>1)loops.push(lp);
          w.length=i+1;w.push(X);again=true;break}}}
    w.push(q)}
  return loops;
}
export function equip(w:Weapon|null){A.cur=w;A.bow=A.missile=A.lasso=A.tip=null;A.sp=A.boom=A.well=null;
  A.whip=w&&w.id==='whip'?Array.from({length:9},()=>({x:P.x,y:P.y,px:P.x,py:P.y})):null;A.ball=w&&w.id==='ball'?{x:P.x,y:P.y,px:P.x,py:P.y}:null}
export const inArena=()=>!S.fp&&P.z===0&&regionAt(P.x)===2;
// While the bow is drawn or a missile is flying, the mouse drives that instead of the player.
export const mouseCaptured=()=>inArena()&&!!(A.bow||A.missile||A.sp);
function explode(){
  const m=A.missile!;A.missile=null;A.blast={x:m.x,y:m.y,t:0,r:4.5};A.ease=1.3;   // the camera drifts back to the player
  for(const c of A.creatures){const dx=c.x-m.x,dy=c.y-m.y,d=Math.hypot(dx,dy);
    if(d<4.5)hurt(c,95*(1-d/4.5*.6),dx/(d||1)*20,dy/(d||1)*20)}
}
export function updateArena(dt:number,mx:number,my:number){
  const click=A.click,rclick=A.rclick;A.click=A.rclick=false;
  if(regionAt(P.x)!==2)return;
  if(!inArena()){if(A.cur)equip(null);A.kx=A.ky=0;return}
  A.msg-=dt;A.hp=Math.min(100,A.hp+dt*3);
  for(const w of WEAPONS)if(A.cur!==w&&Math.hypot(P.x-w.x,P.y-w.y)<1.4)equip(w);
  const live=A.creatures.filter(c=>!c.dead),id=A.cur&&A.cur.id;
  if(A.last){A.pv.x=(P.x-A.last.x)/dt;A.pv.y=(P.y-A.last.y)/dt}A.last={x:P.x,y:P.y};

  if(id==='bow'){
    // The drag point is where the hand wants the string; the string follows at its own pace.
    if(click&&!A.bow)A.bow={dx:0,dy:0,px:0,py:0};
    const b=A.bow;
    if(b){
      b.dx+=mx;b.dy+=my;const d=Math.hypot(b.dx,b.dy);if(d>6){b.dx*=6/d;b.dy*=6/d}
      const ex=b.dx-b.px,ey=b.dy-b.py,e=Math.hypot(ex,ey),st=Math.min(e,7*dt);if(e>1e-6){b.px+=ex/e*st;b.py+=ey/e*st}
      if(!A.down){const pl=Math.hypot(b.px,b.py),sp=14+7*pl;
        if(pl>.4)A.arrows.push({x:P.x,y:P.y,vx:-b.px/pl*sp,vy:-b.py/pl*sp,life:2.5,dmg:15+12*pl});
        A.bow=null}
    }
  }else if(id==='ball'){
    // A heavy weight on a chain. The chain can swing it round freely, but it only gains speed
    // slowly however hard it is pulled, and the ground scrubs speed off. Whatever the ball will
    // not give, the player has to: you cannot outrun it, and its momentum drags you about.
    const b=A.ball!,L=2.4,GAIN=10*dt*dt,FRIC=4*dt*dt,HAUL=9*dt*dt;
    let sx=b.x-b.px,sy=b.y-b.py;const s0=Math.hypot(sx,sy),s1=Math.min(1.2,Math.max(0,s0-FRIC));
    if(s0>1e-9){sx*=s1/s0;sy*=s1/s0}
    const ox=b.x,oy=b.y;b.px=ox;b.py=oy;b.x+=sx;b.y+=sy;
    let dx=b.x-P.x,dy=b.y-P.y,d=Math.hypot(dx,dy);
    if(d>L){const e=d-L;b.x-=dx/d*e*.2;b.y-=dy/d*e*.2;                       // the taut chain tugs the ball...
      let ux=b.x-ox,uy=b.y-oy,s2=Math.hypot(ux,uy);const hi=s1+GAIN,lo=Math.max(0,s1-HAUL);
      if(s2<1e-9){ux=sx;uy=sy;s2=s1}
      // ...but can neither speed it up quickly nor stop it dead: a ball that runs out of chain
      // keeps most of its speed and takes the player with it
      const want=clamp(s2,lo,hi);if(s2>1e-9&&want!==s2){b.x=ox+ux*want/s2;b.y=oy+uy*want/s2}
      dx=b.x-P.x;dy=b.y-P.y;d=Math.hypot(dx,dy);
      if(d>L){P.x=b.x-dx/d*L;P.y=b.y-dy/d*L}}                                 // so the player is hauled back to the end of the chain
    const vx=(b.x-b.px)/dt,vy=(b.y-b.py)/dt,sp=Math.hypot(vx,vy);
    if(sp>3)for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,b.px,b.py,b.x,b.y)<c.r+.45){hurt(c,Math.min(80,sp*3.6),vx*.8,vy*.8);c.cd=.35}
  }else if(id==='fire'){
    if(A.down&&A.fuel>=.07&&(click||!A.lastDrop||Math.hypot(P.x-A.lastDrop.x,P.y-A.lastDrop.y)>.75)){
      A.puddles.push({x:P.x,y:P.y,t:0});A.lastDrop={x:P.x,y:P.y};A.fuel-=.07;if(A.puddles.length>60)A.puddles.shift()}
    if(!A.down)A.fuel=Math.min(1,A.fuel+dt*.3);
  }else if(id==='missile'){
    if(click){if(A.missile)explode();else A.missile={x:P.x,y:P.y,a:P.a,want:P.a,life:5}}
  }else if(id==='lasso'){
    if(click&&!A.lasso)A.lasso={pts:[{x:P.x,y:P.y}],len:0};
    const l=A.lasso;
    if(l){
      const q=l.pts[l.pts.length-1],d=Math.hypot(P.x-q.x,P.y-q.y);
      if(d>.4){l.pts.push({x:P.x,y:P.y});l.len+=d}
      while(l.len>ROPE&&l.pts.length>2){ // out of rope: the far end gets dragged along
        const a=l.pts[0],b=l.pts[1],sg=Math.hypot(b.x-a.x,b.y-a.y),ex=l.len-ROPE;
        if(sg<=ex){l.pts.shift();l.len-=sg}else{a.x+=(b.x-a.x)*ex/sg;a.y+=(b.y-a.y)*ex/sg;l.len-=ex}}
      if(!A.down){ // let go: the rope vanishes and every loop it closed hits what is inside (two loops round one creature hit twice)
        for(const lp of ropeLoops([...l.pts,{x:P.x,y:P.y}])){A.shapes.push({pts:lp,t:0});for(const c of live)if(inPoly(c.x,c.y,lp))hurt(c,90)}
        A.lasso=null}
    }
  }else if(id==='spear'){
    // Held: you plant your feet and the drag is the thrust. The shaft reaches as far as you have
    // dragged, in that direction; it only hurts while the point is driving forward.
    if(click&&!A.sp)A.sp={dx:0,dy:0,len:0,a:P.a,tip:null,out:true};
    const sp=A.sp;
    if(sp){
      if(A.down&&sp.out){sp.dx+=mx;sp.dy+=my;const d=Math.hypot(sp.dx,sp.dy);if(d>4.5){sp.dx*=4.5/d;sp.dy*=4.5/d}
        if(d>.15)sp.a=Math.atan2(sp.dy,sp.dx);sp.len=Math.min(4.5,d)}
      else{sp.out=false;sp.len-=dt*22;if(sp.len<=0){P.a=sp.a;A.sp=null}}
      if(A.sp){const c=Math.cos(sp.a),sn=Math.sin(sp.a),r=1.8+sp.len,tx=P.x+c*r,ty=P.y+sn*r;
        if(sp.tip){const fs=((tx-sp.tip.x)*c+(ty-sp.tip.y)*sn)/dt;
          if(fs>5)for(const cr of live)if(cr.cd<=0&&segDist(cr.x,cr.y,P.x+c*r*.4,P.y+sn*r*.4,tx,ty)<cr.r+.15){hurt(cr,Math.min(75,14+fs*1.4),c*fs*.6,sn*fs*.6);cr.cd=.35}}
        sp.tip={x:tx,y:ty}}
    }
  }else if(id==='boom'){
    if(click&&!A.boom)A.boom={x:P.x,y:P.y,vx:Math.cos(P.a)*27,vy:Math.sin(P.a)*27,t:0};
  }else if(id==='whip'){
    // A light rope pinned to the hand. Only the very tip hurts, and only when it is really moving,
    // which is what a sharp change of direction does to it.
    const w=A.whip!,SEG=.45;
    for(let i=1;i<w.length;i++){const n=w[i];let sx=(n.x-n.px)*.97,sy=(n.y-n.py)*.97;const sl=Math.hypot(sx,sy);if(sl>1.4){sx*=1.4/sl;sy*=1.4/sl}
      n.px=n.x;n.py=n.y;n.x+=sx;n.y+=sy}
    for(let it=0;it<6;it++){w[0].x=P.x;w[0].y=P.y;
      for(let i=1;i<w.length;i++){const a=w[i-1],n=w[i],dx=n.x-a.x,dy=n.y-a.y,d=Math.hypot(dx,dy)||1e-6,e=(d-SEG)/d;
        if(i===1){n.x-=dx*e;n.y-=dy*e}else{n.x-=dx*e*.5;n.y-=dy*e*.5;a.x+=dx*e*.5;a.y+=dy*e*.5}}}
    const t=w[w.length-1],vx=(t.x-t.px)/dt,vy=(t.y-t.py)/dt,sp=Math.hypot(vx,vy);A.crack=sp;
    if(sp>22)for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,t.px,t.py,t.x,t.y)<c.r+.35){hurt(c,Math.min(85,sp*1.5),vx*.4,vy*.4);c.cd=.3}
  }else if(id==='shield'){
    // Raised while held. Charging rams whatever is in front, as hard as you are moving.
    A.up=A.down;
    const sp=Math.hypot(A.pv.x,A.pv.y);
    if(A.up&&sp>4){const c=Math.cos(P.a),sn=Math.sin(P.a);
      for(const cr of live){const dx=cr.x-P.x,dy=cr.y-P.y,d=Math.hypot(dx,dy);
        if(cr.cd<=0&&d<cr.r+1.3&&dx*c+dy*sn>d*.35){hurt(cr,Math.min(65,sp*2.2),c*sp*.9,sn*sp*.9);cr.cd=.4}}}
  }else if(id==='well'){
    if(click&&!A.well)A.well={x:P.x,y:P.y,t:0};
    const w=A.well;
    if(w){w.t=Math.min(2.5,w.t+dt);
      if(A.down){const pull=3+w.t*3;for(const c of live){const dx=w.x-c.x,dy=w.y-c.y,d=Math.hypot(dx,dy);if(d<10&&d>.3){const m=Math.min(d,pull*dt);c.x+=dx/d*m;c.y+=dy/d*m}}}
      else{const caught=live.filter(c=>Math.hypot(c.x-w.x,c.y-w.y)<3.5);    // burst: worse the more it has gathered
        for(const c of caught){const dx=c.x-w.x,dy=c.y-w.y,d=Math.hypot(dx,dy)||1;hurt(c,Math.min(110,(18+12*caught.length)*(.5+w.t/5)),dx/d*14,dy/d*14)}
        A.blast={x:w.x,y:w.y,t:0,r:3.5};A.well=null}}
  }else if(id==='shot'){
    A.cdw-=dt;
    if(click&&A.cdw<=0){A.cdw=.7;const a=P.a+Math.PI,c=Math.cos(a),sn=Math.sin(a);A.shot={x:P.x,y:P.y,a,t:0};
      for(const cr of live){const dx=cr.x-P.x,dy=cr.y-P.y,d=Math.hypot(dx,dy);
        if(d<9+cr.r&&dx*c+dy*sn>d*.88)hurt(cr,55*(1-d/9*.6),dx/d*18,dy/d*18)}
      A.kx-=c*16;A.ky-=sn*16}                                              // recoil
  }else if(id==='stomp'){
    A.cdw-=dt;
    if(click&&A.cdw<=0){A.cdw=.35;A.blast={x:P.x,y:P.y,t:0,r:2.2};
      for(const c of live){const dx=c.x-P.x,dy=c.y-P.y,d=Math.hypot(dx,dy);if(d<2.4+c.r)hurt(c,45,dx/(d||1)*16,dy/(d||1)*16)}}
  }else if(id==='orbs'){
    if(click){A.orbs.push({x:P.x,y:P.y,vx:0,vy:0,fly:0});
      const idle=A.orbs.filter(o=>!o.fly);if(idle.length>8)A.orbs.splice(A.orbs.indexOf(idle[0]),1)}
    if(rclick)for(const o of A.orbs){const dx=o.x-P.x,dy=o.y-P.y,d=Math.hypot(dx,dy);
      if(!o.fly&&d<7){const c=d>.05?dx/d:Math.cos(P.a),sn=d>.05?dy/d:Math.sin(P.a);o.vx=c*24;o.vy=sn*24;o.fly=1.6}}
  }
  for(const o of A.orbs)if(o.fly){ // flung orbs burst on the first creature they meet
    const nx=o.x+o.vx*dt,ny=o.y+o.vy*dt;o.fly-=dt;
    for(const c of live)if(!o.dead&&segDist(c.x,c.y,o.x,o.y,nx,ny)<c.r+.3){hurt(c,40,o.vx*.6,o.vy*.6);o.dead=1}
    o.x=nx;o.y=ny;if(o.fly<=0||nx<REGIONS[2].x0||nx>REGIONS[2].x1||ny<REGIONS[2].y0||ny>REGIONS[2].y1)o.dead=1}
  A.orbs=A.orbs.filter(o=>!o.dead);
  for(const sh of A.shapes)sh.t+=dt;

  if(id!=='shield')A.up=false;
  if(A.shot){A.shot.t+=dt;if(A.shot.t>.14)A.shot=null}
  { // boomerang: thrown out, then pulled back towards wherever the player now is; hits on the way out and back
    const b=A.boom;
    if(b){const dx=P.x-b.x,dy=P.y-b.y,d=Math.hypot(dx,dy)||1;b.t+=dt;b.vx+=dx/d*40*dt;b.vy+=dy/d*40*dt;
      if(b.t>.9){const k=Math.exp(-dt*2.5),sp=Math.hypot(b.vx,b.vy),al=(b.vx*dx+b.vy*dy)/d;   // later on, bleed off sideways drift so it actually arrives
        b.vx=dx/d*al+(b.vx-dx/d*al)*k;b.vy=dy/d*al+(b.vy-dy/d*al)*k}
      const nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;
      for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,b.x,b.y,nx,ny)<c.r+.4){hurt(c,32,b.vx*.5,b.vy*.5);c.cd=.45}
      b.x=nx;b.y=ny;if((b.t>.35&&d<1.2)||b.t>5)A.boom=null}
  }
  { // missile: slow, constant speed, turned by the mouse
    const m=A.missile;
    if(m){
      if(Math.hypot(mx,my)>.03)m.want=Math.atan2(my,mx);
      m.a+=clamp(angDiff(m.want,m.a),-2.8*dt,2.8*dt);m.x+=Math.cos(m.a)*9*dt;m.y+=Math.sin(m.a)*9*dt;m.life-=dt;
      if(m.life<=0||m.x<REGIONS[2].x0||m.x>REGIONS[2].x1||m.y<REGIONS[2].y0||m.y>REGIONS[2].y1||live.some(c=>Math.hypot(c.x-m.x,c.y-m.y)<c.r+.35))explode();
    }
    if(A.blast){A.blast.t+=dt;if(A.blast.t>.45)A.blast=null}
  }
  for(const a of A.arrows){ // arrows fly straight and stop in the first thing they hit
    const nx=a.x+a.vx*dt,ny=a.y+a.vy*dt;a.life-=dt;
    for(const c of live)if(a.life>0&&segDist(c.x,c.y,a.x,a.y,nx,ny)<c.r+.1){hurt(c,a.dmg,a.vx*.4,a.vy*.4);a.life=0}
    a.x=nx;a.y=ny;if(nx<REGIONS[2].x0||nx>REGIONS[2].x1||ny<REGIONS[2].y0||ny>REGIONS[2].y1)a.life=0;
  }
  A.arrows=A.arrows.filter(a=>a.life>0);
  for(const p of A.puddles){p.t+=dt;if(p.t>1&&p.t<4.5)for(const c of live)if(Math.hypot(c.x-p.x,c.y-p.y)<1.35+c.r*.5){c.flash=Math.max(c.flash,.06);hurt2(c,30*dt)}}
  A.puddles=A.puddles.filter(p=>p.t<4.5);

  // creatures: wander until the player steps onto the sand, then close in
  const hunted=P.y<FIELD.y1+1;
  for(const c of A.creatures){
    if(c.dead){c.dead-=dt;if(c.dead<=0)spawn(c);continue}
    c.flash-=dt;c.cd-=dt;c.wt-=dt;c.atk-=dt;
    if(!hunted&&c.wt<=0){c.wt=2+crng()*4;c.wx=lerp(FIELD.x0+2,FIELD.x1-2,crng());c.wy=lerp(FIELD.y0+2,FIELD.y1-2,crng())}
    const tx=hunted?P.x:c.wx,ty=hunted?P.y:c.wy,dx=tx-c.x,dy=ty-c.y,d=Math.hypot(dx,dy)||1,stop=hunted?c.r+R+.05:.5;
    const sp=d>stop?(hunted?c.sp:c.sp*.4):0,f=Math.min(1,dt*4);
    c.vx+=(dx/d*sp-c.vx)*f;c.vy+=(dy/d*sp-c.vy)*f;
    c.x+=c.vx*dt;c.y+=c.vy*dt;
    for(const o of A.creatures){if(o===c||o.dead)continue;const ex=c.x-o.x,ey=c.y-o.y,e=Math.hypot(ex,ey),m=c.r+o.r;
      if(e<m&&e>1e-6){c.x+=ex/e*(m-e)*.5;c.y+=ey/e*(m-e)*.5}}
    {const ex=c.x-P.x,ey=c.y-P.y,e=Math.hypot(ex,ey)||1e-6,m=c.r+R;
      if(hunted&&c.atk<=0&&e<m+.3){ // a bite: damage and a shove, both bigger from bigger creatures
        c.atk=.9;
        if(A.up&&ex*Math.cos(P.a)+ey*Math.sin(P.a)>e*.3){c.vx+=ex/e*9;c.vy+=ey/e*9;c.flash=.1}   // caught on the shield
        else{A.hp-=c.r<.6?7:c.r<1?13:24;const kb=15+c.r*13;A.kx-=ex/e*kb;A.ky-=ey/e*kb;c.vx+=ex/e*3;c.vy+=ey/e*3}}
      if(e<m){c.x+=ex/e*(m-e);c.y+=ey/e*(m-e)}}
    c.x=clamp(c.x,FIELD.x0+c.r,FIELD.x1-c.r);c.y=clamp(c.y,FIELD.y0+c.r,FIELD.y1-c.r);
  }
  if(A.hp<=0){ // knocked out: wake up back in the plaza, outside the fence
    P.x=1111.5;P.y=88;CAM.x=P.x;CAM.y=P.y;A.hp=100;A.kx=A.ky=0;A.msg=3;A.puddles.length=0;equip(null);
    for(const c of A.creatures)if(!c.dead&&c.y>55){c.y-=30}
  }
}
function hurt2(c:Creature,d:number){c.hp-=d;if(c.hp<=0&&!c.dead){c.dead=2.5;A.kills++}}   // damage over time: no flinch
