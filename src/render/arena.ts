import * as THREE from 'three';
import { regionAt } from '../constants';
import { UNIT } from './mesh';
import { OUTG } from './sceneCity';
import { A } from '../sim/arena';
import { P, S } from '../state';

const ARG=new THREE.Group();OUTG.add(ARG);
const ICO=new THREE.IcosahedronGeometry(1,1),DISC=new THREE.CylinderGeometry(1,1,1,16);
function stick(m:THREE.Object3D,x1:number,z1:number,x2:number,z2:number,y:number,th:number){const dx=x2-x1,dz=z2-z1,L=Math.hypot(dx,dz);m.visible=L>.01;
  m.position.set((x1+x2)/2,y,(z1+z2)/2);m.scale.set(Math.max(L,.001),th,th);m.rotation.y=-Math.atan2(dz,dx)}
const pool=<T extends THREE.Object3D>(n:number,mk:()=>T)=>Array.from({length:n},()=>{const m=mk();m.visible=false;ARG.add(m);return m});
const lam=(c:string)=>new THREE.MeshLambertMaterial({color:c}),bas=(c:string,o?:number)=>new THREE.MeshBasicMaterial({color:c,transparent:o!==undefined,opacity:o===undefined?1:o,depthWrite:o===undefined});
const AV={
  body:A.creatures.map(()=>{const m=new THREE.Mesh(ICO,new THREE.MeshLambertMaterial({flatShading:true}));ARG.add(m);return m}),
  bar:pool(A.creatures.length,()=>new THREE.Mesh(UNIT,bas('#e5484d'))),
  arrow:pool(12,()=>new THREE.Mesh(UNIT,lam('#6b4a32'))),
  pud:pool(60,()=>new THREE.Mesh<THREE.CylinderGeometry,THREE.Material>(DISC,lam('#3b2f25'))),
  tracer:pool(7,()=>new THREE.Mesh(UNIT,bas('#ffe9a8',.8))),
  boom:pool(1,()=>new THREE.Mesh(UNIT,lam('#c98a3a')))[0],
  well:pool(1,()=>new THREE.Mesh(DISC,bas('#2a1f45',.75)))[0],
  orb:pool(24,()=>new THREE.Mesh(ICO,lam('#4aa3c7'))),
  rope:pool(140,()=>new THREE.Mesh(UNIT,lam('#b08a4f'))),
  line:pool(4,()=>new THREE.Mesh(UNIT,lam('#e9e4d6'))),          // bow string / aim, chain, sword blade, sword guard
  dot:pool(1,()=>new THREE.Mesh(DISC,bas('#ffffff',.7)))[0],
  ball:pool(1,()=>new THREE.Mesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:'#3a3d44',flatShading:true})))[0],
  missile:pool(1,()=>new THREE.Mesh(UNIT,lam('#6f8f3c')))[0],
  blast:pool(1,()=>new THREE.Mesh(ICO,bas('#ffb347',.6)))[0],
  fuel:lam('#3b2f25'),flame:bas('#ff8a2a'),wood:lam('#7a5a3c'),pale:lam('#e9e4d6'),steel:lam('#4f6f9a'),
};
export function arenaSync(){
  ARG.visible=regionAt(P.x)===2;if(!ARG.visible)return;
  A.creatures.forEach((c,i)=>{const m=AV.body[i],b=AV.bar[i];m.visible=!c.dead;b.visible=!c.dead&&c.hp<c.max;
    if(c.dead)return;
    const sq=1+Math.sin(S.time*6+i)*.05;m.position.set(c.x,c.r*.8,c.y);m.scale.set(c.r*sq,c.r*.8/sq,c.r*sq);m.rotation.y=Math.atan2(-c.vy,c.vx);
    m.material.color.set(c.col);m.material.emissive.setScalar(c.flash>0?.7:0);
    const w=1.4*c.hp/c.max;b.position.set(c.x-(1.4-w)/2,c.r*1.7+.5,c.y-c.r-.2);b.scale.set(Math.max(w,.01),.12,.16)});
  AV.arrow.forEach((m,i)=>{const a=A.arrows[i];if(!a){m.visible=false;return}const s=Math.hypot(a.vx,a.vy);stick(m,a.x-a.vx/s*1.1,a.y-a.vy/s*1.1,a.x,a.y,1,.07)});
  AV.pud.forEach((m,i)=>{const p=A.puddles[i];m.visible=!!p;if(!p)return;const on=p.t>1;m.material=on?AV.flame:AV.fuel;
    const h=on?.5+.45*Math.sin(S.time*17+i*2.1):.04,r=on?1.25:Math.min(1.1,.4+p.t);m.position.set(p.x,h/2+.02,p.y);m.scale.set(r,h,r)});
  const l=A.lasso,pts=l?[...l.pts,{x:P.x,y:P.y}]:[];
  AV.rope.forEach((m,i)=>{if(i<pts.length-1)stick(m,pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y,.25,.1);else m.visible=false});
  if(A.cur&&A.cur.id==='whip'&&A.whip){const w=A.whip;AV.rope.forEach((m,i)=>{if(i<w.length-1)stick(m,w[i].x,w[i].y,w[i+1].x,w[i+1].y,.5,i===w.length-2?.14:.07)})}
  // the area a released lasso struck: a filled patch that fades away
  A.shapes=A.shapes.filter(sh=>{
    if(sh.t>.8){if(sh.m){ARG.remove(sh.m);sh.m.geometry.dispose();sh.m.material.dispose()}return false}
    if(!sh.m){const g=new THREE.ShapeGeometry(new THREE.Shape(sh.pts.map(q=>new THREE.Vector2(q.x,q.y))));
      sh.m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:'#fff3c4',transparent:true,depthWrite:false,side:THREE.DoubleSide}));
      sh.m.rotation.x=Math.PI/2;sh.m.position.y=.12;ARG.add(sh.m)}
    sh.m.material.opacity=.6*(1-sh.t/.8);return true});
  for(const m of AV.line)m.visible=false;AV.dot.visible=AV.ball.visible=false;
  const id=A.cur&&A.cur.id;
  if(id==='bow'&&A.bow){const b=A.bow;
    stick(AV.line[0],P.x,P.y,P.x+b.px,P.y+b.py,1,.09);                                   // the pull
    AV.dot.visible=true;AV.dot.position.set(P.x+b.dx,.9,P.y+b.dy);AV.dot.scale.set(.3,.05,.3)}
  if(id==='ball'&&A.ball){const b=A.ball;stick(AV.line[0],P.x,P.y,b.x,b.y,.6,.08);
    AV.ball.visible=true;AV.ball.position.set(b.x,.6,b.y);AV.ball.scale.setScalar(.5);AV.ball.rotation.y+=.2}
  if(id==='spear'){const a=A.sp?A.sp.a:P.a,r=1.8+(A.sp?A.sp.len:0),c=Math.cos(a),s=Math.sin(a);
    stick(AV.line[0],P.x+c*.3,P.y+s*.3,P.x+c*(r-.35),P.y+s*(r-.35),1,.08);AV.line[0].material=AV.wood;   // the shaft stays in hand and reaches out
    stick(AV.line[1],P.x+c*(r-.4),P.y+s*(r-.4),P.x+c*r,P.y+s*r,1,.16)}
  else if(id!=='shield')AV.line[0].material=AV.pale;
  if(id==='shield'){const c=Math.cos(P.a),s=Math.sin(P.a),f=A.up?.75:.2,hw=A.up?.95:.5;
    stick(AV.line[0],P.x+c*f+s*hw,P.y+s*f-c*hw,P.x+c*f-s*hw,P.y+s*f+c*hw,.9,A.up?.3:.16);AV.line[0].material=AV.steel}
  AV.tracer.forEach((m,i)=>{const sh=A.shot;if(!sh){m.visible=false;return}const a=sh.a+(i-3)*.16,r0=1+sh.t*40,r1=Math.min(9,r0+3);
    stick(m,sh.x+Math.cos(a)*r0,sh.y+Math.sin(a)*r0,sh.x+Math.cos(a)*r1,sh.y+Math.sin(a)*r1,1,.07)});
  {const b=A.boom;AV.boom.visible=!!b;if(b){const a=S.time*22;stick(AV.boom,b.x-Math.cos(a)*.6,b.y-Math.sin(a)*.6,b.x+Math.cos(a)*.6,b.y+Math.sin(a)*.6,1,.16)}}
  {const w=A.well;AV.well.visible=!!w;if(w){const r=1+w.t*1.1+Math.sin(S.time*14)*.12;AV.well.position.set(w.x,.08,w.y);AV.well.scale.set(r,.06,r)}}
  AV.orb.forEach((m,i)=>{const o=A.orbs[i];m.visible=!!o;if(o){m.position.set(o.x,.45,o.y);m.scale.setScalar(.32)}});
  const ms=A.missile;AV.missile.visible=!!ms;
  if(ms){stick(AV.missile,ms.x-Math.cos(ms.a)*.6,ms.y-Math.sin(ms.a)*.6,ms.x+Math.cos(ms.a)*.6,ms.y+Math.sin(ms.a)*.6,1.2,.3)}
  const bl=A.blast;AV.blast.visible=!!bl;if(bl){AV.blast.position.set(bl.x,1,bl.y);AV.blast.scale.setScalar(.5+bl.t/.45*bl.r);AV.blast.material.opacity=.7*(1-bl.t/.45)}
}
