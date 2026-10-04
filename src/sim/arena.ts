import { R, REGIONS, regionAt } from '../constants';
import { PB } from './player';
import { P, S } from '../state';
import { angDiff, clamp, lerp, mulberry32, segDist } from '../util';
import { CAT, type Body, addCircle, drive, force, kick, lv, mass, mkBody, rod, rope, track, untrack } from '../physics';
import { wall } from '../world/colliders';
import { FIELD, WEAPONS, type Weapon } from '../world/arena';
import type { Mesh, MeshBasicMaterial, ShapeGeometry } from 'three';
import type { Pt } from '../types';

// A creature: sp is its top speed, max its full health; dead counts down to its respawn, flash
// is how long it shows a hit, cd how long until it can be hit again by the same swing, atk how
// long until it can bite again. wx, wy: where it is wandering to, wt how long it keeps at it.
// A live creature is a body (made when it spawns, gone when it dies); blows are kicks to it.
export interface Creature extends Body{r:number,max:number,sp:number,col:string,hp:number,dead:number,
  flash:number,cd:number,atk:number,wx:number,wy:number,wt:number}
type Moving=Body&{px:number,py:number};   // a body that remembers where it was last tick
type Flier=Body&{px:number,py:number};
// The fight: whatever the current weapon (cur) has in play, the player's health (hp) and the
// shove they are getting (kx, ky), and the mouse buttons (down, plus click / rclick this tick).
// pv: the player's velocity; ease: the camera gliding back after a missile; cdw: weapon cooldown;
// msg: how long the knocked-out message stays up.
export interface Arena{boom:(Flier&{t:number})|null,whip:Moving[]|null,well:{x:number,y:number,t:number}|null,
  shot:{x:number,y:number,a:number,t:number}|null,pv:Pt,shapes:{pts:Pt[],t:number,m?:Mesh<ShapeGeometry,MeshBasicMaterial>}[],
  hp:number,kx:number,ky:number,msg:number,ease:number,cdw:number,sp:{dx:number,dy:number,len:number,a:number,tip:Pt|null,out:boolean}|null,
  orbs:(Flier&{fly:number,dead?:number})[],rclick:boolean,cur:Weapon|null,down:boolean,click:boolean,kills:number,
  bow:{dx:number,dy:number,px:number,py:number}|null,ball:Moving|null,fuel:number,lastDrop:Pt|null,puddles:{x:number,y:number,t:number}[],
  arrows:(Flier&{life:number,dmg:number,sp:number,t:number})[],missile:(Flier&{h:number,want:number,life:number})|null,
  blast:{x:number,y:number,t:number,r:number}|null,lasso:{pts:Pt[],len:number}|null,tip:Pt|null,creatures:Creature[],up?:boolean,crack?:number}

// Top-down (mouse) mode only. Walking onto a pad takes that weapon.
export const A:Arena={boom:null,whip:null,well:null,shot:null,pv:{x:0,y:0},shapes:[],hp:100,kx:0,ky:0,msg:0,ease:0,cdw:0,sp:null,orbs:[],rclick:false,cur:null,down:false,click:false,kills:0,bow:null,ball:null,fuel:1,lastDrop:null,puddles:[],arrows:[],missile:null,blast:null,lasso:null,tip:null,creatures:[]};
const crng=mulberry32(99);
const ROPE=50;                       // metres of lasso
// The creatures keep to the sand.
{const f=FIELD;for(const[x,y,w,h]of[[f.x0-5,f.y0-5,f.x1-f.x0+10,5],[f.x0-5,f.y1,f.x1-f.x0+10,5],[f.x0-5,f.y0,5,f.y1-f.y0],[f.x1,f.y0,5,f.y1-f.y0]])wall(x,y,w,h,CAT.CRWALL,CAT.CREATURE)}
// A body that goes through everything (thrown and flung things that find their own targets).
function flier(x:number,y:number,r:number,kg:number,mask=0,damp=0){const o=track({x,y,px:x,py:y} as Flier,mkBody('dynamic',x,y,0,{fixedRot:true,damp}));
  addCircle(o.id,0,0,r,CAT.PROJ,mask,{density:kg/(Math.PI*r*r)});return o}
function spawn(c:Creature){
  const k=crng();
  Object.assign(c,k<.5?{r:.5,max:35,sp:4.2,col:'#7d4fb0'}:k<.85?{r:.75,max:70,sp:3.1,col:'#3f8f5a'}:{r:1.15,max:160,sp:2.1,col:'#b0453f'});
  do{c.x=lerp(FIELD.x0+2,FIELD.x1-2,crng());c.y=lerp(FIELD.y0+2,FIELD.y1-2,crng())}while(Math.hypot(c.x-P.x,c.y-P.y)<14);
  c.hp=c.max;c.dead=0;c.flash=0;c.cd=0;c.atk=0;c.wx=c.x;c.wy=c.y;c.wt=0;
  track(c,mkBody('dynamic',c.x,c.y,0,{fixedRot:true,damp:.5}));addCircle(c.id,0,0,c.r,CAT.CREATURE,CAT.PLAYER|CAT.CREATURE|CAT.CRWALL|CAT.WEAPON,{density:120,restitution:.2});
}
for(let i=0;i<14;i++){const c={vx:0,vy:0} as Creature;spawn(c);A.creatures.push(c)}
function hurt(c:Creature,d:number,kx=0,ky=0){
  if(c.dead)return;
  const k=Math.hypot(kx,ky);if(k>24){kx*=24/k;ky*=24/k}
  c.hp-=d;c.flash=.18;kick(c.id,kx,ky);
  if(c.hp<=0)die(c);
}
function die(c:Creature){c.dead=2.5;A.kills++;untrack(c)}
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
export function equip(w:Weapon|null){A.cur=w;A.bow=A.lasso=A.tip=null;A.sp=A.well=null;
  if(A.missile)untrack(A.missile);if(A.boom)untrack(A.boom);A.missile=A.boom=null;
  if(A.whip)for(const n of A.whip.slice(1))untrack(n);if(A.ball)untrack(A.ball);A.whip=A.ball=null;
  const c=Math.cos(P.a),s=Math.sin(P.a);
  if(w&&w.id==='whip'){ // a light rope of rigid links, pinned to the hand
    A.whip=[{id:PB.id,x:P.x,y:P.y,px:P.x,py:P.y,a:0,vx:0,vy:0,w:0}];
    for(let i=1;i<9;i++){const n=flier(P.x-c*.45*i,P.y-s*.45*i,.05,.06,0,1.8);rod(A.whip[i-1].id,n.id,.45);A.whip.push(n)}}
  if(w&&w.id==='ball'){ // a 280 kg ball on a 2.4 m chain
    const b=track({x:P.x-c*1.2,y:P.y-s*1.2,px:P.x,py:P.y} as Moving,mkBody('dynamic',P.x-c*1.2,P.y-s*1.2,0,{fixedRot:true}));
    addCircle(b.id,0,0,.45,CAT.WEAPON,lv(0)|CAT.CREATURE,{density:280/(Math.PI*.45*.45),restitution:.3});rope(PB.id,b.id,2.4);A.ball=b}}

export const inArena=()=>!S.fp&&P.z===0&&regionAt(P.x)===2;
// While the bow is drawn or a missile is flying, the mouse drives that instead of the player.
export const mouseCaptured=()=>inArena()&&!!(A.bow||A.missile||A.sp);
function explode(){
  const m=A.missile!;A.missile=null;untrack(m);A.blast={x:m.x,y:m.y,t:0,r:4.5};A.ease=1.3;   // the camera drifts back to the player
  for(const c of A.creatures){const dx=c.x-m.x,dy=c.y-m.y,d=Math.hypot(dx,dy);
    if(d<4.5)hurt(c,95*(1-d/4.5*.6),dx/(d||1)*20,dy/(d||1)*20)}
}
export function updateArena(dt:number,mx:number,my:number){
  const click=A.click,rclick=A.rclick;                               // (cleared at the end of the tick)
  if(regionAt(P.x)!==2)return;
  if(!inArena()){if(A.cur)equip(null);A.kx=A.ky=0;return}
  A.msg-=dt;A.hp=Math.min(100,A.hp+dt*3);
  for(const w of WEAPONS)if(A.cur!==w&&Math.hypot(P.x-w.x,P.y-w.y)<1.4)equip(w);
  const live=A.creatures.filter(c=>!c.dead),id=A.cur&&A.cur.id;
  A.pv.x=P.vx;A.pv.y=P.vy;

  if(id==='bow'){
    // The drag point is where the hand wants the string; the string follows at its own pace.
    if(click&&!A.bow)A.bow={dx:0,dy:0,px:0,py:0};
    const b=A.bow;
    if(b){
      b.dx+=mx;b.dy+=my;const d=Math.hypot(b.dx,b.dy);if(d>6){b.dx*=6/d;b.dy*=6/d}
      const ex=b.dx-b.px,ey=b.dy-b.py,e=Math.hypot(ex,ey),st=Math.min(e,7*dt);if(e>1e-6){b.px+=ex/e*st;b.py+=ey/e*st}
      if(!A.down){const pl=Math.hypot(b.px,b.py),sp=14+7*pl;
        if(pl>.4){const a=Object.assign(flier(P.x,P.y,.05,.05,lv(0)),{life:2.5,dmg:15+12*pl,sp,t:0});kick(a.id,-b.px/pl*sp,-b.py/pl*sp,2500);A.arrows.push(a)}
        A.bow=null}
    }
  }else if(id==='ball'){
    // A heavy ball on a chain (a rope joint). It only gains speed slowly however hard it is
    // pulled, the ground scrubs speed off, and its momentum drags the player about.
    const b=A.ball!;drive(b,0,0,dt,4,dt);                                    // ground friction
    const vx=b.vx,vy=b.vy,sp=Math.hypot(vx,vy);
    if(sp>3)for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,b.px,b.py,b.x,b.y)<c.r+.45){hurt(c,Math.min(80,sp*3.6),vx*.8,vy*.8);c.cd=.35}
    b.px=b.x;b.py=b.y;
  }else if(id==='fire'){
    if(A.down&&A.fuel>=.07&&(click||!A.lastDrop||Math.hypot(P.x-A.lastDrop.x,P.y-A.lastDrop.y)>.75)){
      A.puddles.push({x:P.x,y:P.y,t:0});A.lastDrop={x:P.x,y:P.y};A.fuel-=.07;if(A.puddles.length>60)A.puddles.shift()}
    if(!A.down)A.fuel=Math.min(1,A.fuel+dt*.3);
  }else if(id==='missile'){
    if(click){if(A.missile)explode();else A.missile=Object.assign(flier(P.x,P.y,.15,2),{h:P.a,want:P.a,life:5})}
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
    if(click&&!A.boom){A.boom=Object.assign(flier(P.x,P.y,.3,.4),{t:0});kick(A.boom.id,Math.cos(P.a)*27,Math.sin(P.a)*27,800)}
  }else if(id==='whip'){
    // A light rope pinned to the hand. Only the very tip hurts, and only when it is really moving,
    // which is what a sharp change of direction does to it.
    const w=A.whip!;w[0].x=P.x;w[0].y=P.y;
    const t=w[w.length-1],vx=t.vx,vy=t.vy,sp=Math.hypot(vx,vy);A.crack=sp;
    if(sp>22)for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,t.px,t.py,t.x,t.y)<c.r+.35){hurt(c,Math.min(85,sp*1.5),vx*.4,vy*.4);c.cd=.3}
    for(const n of w){n.px=n.x;n.py=n.y}
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
      if(A.down){const pull=3+w.t*3;for(const c of live){const dx=w.x-c.x,dy=w.y-c.y,d=Math.hypot(dx,dy);if(d<10&&d>.3){const m=mass(c.id)*pull*6;force(c.id,dx/d*m,dy/d*m)}}}
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
    if(click){A.orbs.push(Object.assign(flier(P.x,P.y,.32,1),{fly:0}));
      const idle=A.orbs.filter(o=>!o.fly);if(idle.length>8){untrack(idle[0]);A.orbs.splice(A.orbs.indexOf(idle[0]),1)}}
    if(rclick)for(const o of A.orbs){const dx=o.x-P.x,dy=o.y-P.y,d=Math.hypot(dx,dy);
      if(!o.fly&&d<7){const c=d>.05?dx/d:Math.cos(P.a),sn=d>.05?dy/d:Math.sin(P.a);kick(o.id,c*24,sn*24,600);o.fly=1.6}}
  }
  for(const o of A.orbs)if(o.fly){ // flung orbs burst on the first creature they meet
    o.fly-=dt;
    for(const c of live)if(!o.dead&&segDist(c.x,c.y,o.px,o.py,o.x,o.y)<c.r+.3){hurt(c,40,o.vx*.6,o.vy*.6);o.dead=1}
    if(o.fly<=0||o.x<REGIONS[2].x0||o.x>REGIONS[2].x1||o.y<REGIONS[2].y0||o.y>REGIONS[2].y1)o.dead=1}
  else drive(o,0,0,.2,20,dt);                                              // a dropped orb stays put
  for(const o of A.orbs){o.px=o.x;o.py=o.y;if(o.dead)untrack(o)}
  A.orbs=A.orbs.filter(o=>!o.dead);
  for(const sh of A.shapes)sh.t+=dt;

  if(id!=='shield')A.up=false;
  if(A.shot){A.shot.t+=dt;if(A.shot.t>.14)A.shot=null}
  { // boomerang: thrown out, then pulled back towards wherever the player now is; hits on the way out and back
    const b=A.boom;
    if(b){const dx=P.x-b.x,dy=P.y-b.y,d=Math.hypot(dx,dy)||1,m=mass(b.id);b.t+=dt;
      let ax=dx/d*40,ay=dy/d*40;
      if(b.t>.9){const al=(b.vx*dx+b.vy*dy)/d;ax-=(b.vx-dx/d*al)*2.5;ay-=(b.vy-dy/d*al)*2.5}   // later on, bleed off sideways drift so it actually arrives
      force(b.id,ax*m,ay*m);
      for(const c of live)if(c.cd<=0&&segDist(c.x,c.y,b.px,b.py,b.x,b.y)<c.r+.4){hurt(c,32,b.vx*.5,b.vy*.5);c.cd=.45}
      b.px=b.x;b.py=b.y;if((b.t>.35&&d<1.2)||b.t>5){untrack(b);A.boom=null}}
  }
  { // missile: slow, constant speed, turned by the mouse
    const m=A.missile;
    if(m){
      if(Math.hypot(mx,my)>.03)m.want=Math.atan2(my,mx);
      m.h+=clamp(angDiff(m.want,m.h),-2.8*dt,2.8*dt);drive(m,Math.cos(m.h)*9,Math.sin(m.h)*9,.08,120,dt);m.life-=dt;
      if(m.life<=0||m.x<REGIONS[2].x0||m.x>REGIONS[2].x1||m.y<REGIONS[2].y0||m.y>REGIONS[2].y1||live.some(c=>Math.hypot(c.x-m.x,c.y-m.y)<c.r+.35))explode();
    }
    if(A.blast){A.blast.t+=dt;if(A.blast.t>.45)A.blast=null}
  }
  for(const a of A.arrows){ // arrows fly straight and stop in the first thing they hit
    a.life-=dt;a.t+=dt;
    for(const c of live)if(a.life>0&&segDist(c.x,c.y,a.px,a.py,a.x,a.y)<c.r+.1){hurt(c,a.dmg,a.vx*.4,a.vy*.4);a.life=0}
    if(a.t>.15&&Math.hypot(a.vx,a.vy)<a.sp*.5)a.life=0;                  // it hit a wall
    a.px=a.x;a.py=a.y;if(a.x<REGIONS[2].x0||a.x>REGIONS[2].x1||a.y<REGIONS[2].y0||a.y>REGIONS[2].y1)a.life=0;
    if(a.life<=0)untrack(a);
  }
  A.arrows=A.arrows.filter(a=>a.life>0);
  for(const p of A.puddles){p.t+=dt;if(p.t>1&&p.t<4.5)for(const c of live)if(Math.hypot(c.x-p.x,c.y-p.y)<1.35+c.r*.5){c.flash=Math.max(c.flash,.06);hurt2(c,30*dt)}}
  A.puddles=A.puddles.filter(p=>p.t<4.5);

  // creatures: wander until the player steps onto the sand, then close in
  const hunted=P.y<FIELD.y1+1&&!P.ghost;
  for(const c of A.creatures){
    if(c.dead){c.dead-=dt;if(c.dead<=0)spawn(c);continue}
    c.flash-=dt;c.cd-=dt;c.wt-=dt;c.atk-=dt;
    if(!hunted&&c.wt<=0){c.wt=2+crng()*4;c.wx=lerp(FIELD.x0+2,FIELD.x1-2,crng());c.wy=lerp(FIELD.y0+2,FIELD.y1-2,crng())}
    const tx=hunted?P.x:c.wx,ty=hunted?P.y:c.wy,dx=tx-c.x,dy=ty-c.y,d=Math.hypot(dx,dy)||1,stop=hunted?c.r+R+.05:.5;
    const sp=d>stop?(hunted?c.sp:c.sp*.4):0;
    if(!(A.well&&A.down&&Math.hypot(A.well.x-c.x,A.well.y-c.y)<10))drive(c,dx/d*sp,dy/d*sp,.25,12,dt);   // (caught in a well, it can only struggle)
    {const ex=c.x-P.x,ey=c.y-P.y,e=Math.hypot(ex,ey)||1e-6,m=c.r+R;
      if(hunted&&c.atk<=0&&e<m+.3){ // a bite: damage and a shove, both bigger from bigger creatures
        c.atk=.9;
        if(A.up&&ex*Math.cos(P.a)+ey*Math.sin(P.a)>e*.3){kick(c.id,ex/e*9,ey/e*9);c.flash=.1}   // caught on the shield
        else{A.hp-=c.r<.6?7:c.r<1?13:24;const kb=15+c.r*13;A.kx-=ex/e*kb;A.ky-=ey/e*kb;kick(c.id,ex/e*3,ey/e*3)}}}
  }
  if(A.hp<=0&&!P.ghost){ // knocked out: carried back to the plaza, outside the fence
    P.ghost={pts:[{x:1111.5,y:88}],sp:9};A.hp=100;A.kx=A.ky=0;A.msg=3;A.puddles.length=0;equip(null);
  }
}
function hurt2(c:Creature,d:number){c.hp-=d;if(c.hp<=0&&!c.dead)die(c)}   // damage over time: no flinch
