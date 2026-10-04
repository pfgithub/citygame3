import Box2DFactory from 'box2d-compat';
import type { b2BodyId, b2JointId, b2ShapeId } from 'box2d-compat';

// Box2D v3 (compiled to wasm). Everything that moves is a body in this one world: it is pushed
// about by finite forces and Box2D integrates it, with continuous collision on (every dynamic
// body is a bullet), so nothing is ever placed or teleported. The world is top-down: no gravity.
export const B=await Box2DFactory();
export type BodyId=b2BodyId;export type ShapeId=b2ShapeId;export type JointId=b2JointId;
const wd=B.b2DefaultWorldDef();wd.gravity=new B.b2Vec2(0,0);wd.enableContinuous=true;wd.enableSleep=false;wd.maximumLinearSpeed=1000;
const W=B.b2CreateWorld(wd);
const V=new B.b2Vec2(0,0),ROT0=B.b2MakeRot(0),FILT=B.b2DefaultShapeDef().filter;
const vec=(x:number,y:number)=>{V.x=x;V.y=y;return V};

// Collision categories. Floors are bits L(-2)..L(9): a wall is solid on the floor levels it spans,
// and the player only collides with walls on the level they are on (see setPlayerFilter).
export const lv=(k:number)=>1<<(k+2);
export function bands(za:number,zb:number){let m=0;for(let k=-2;k<=9;k++)if(k-.5>=za-1e-6&&k+.5<=zb+1e-6)m|=lv(k);return m}
export const CAT={PLAYER:1<<13,PED:1<<14,CAR:1<<15,CREATURE:1<<16,CRWALL:1<<17,WEAPON:1<<18,PROJ:1<<19,
  HULL:1<<20,WATERWALL:1<<21,RAIL:1<<22,CARONLY:1<<23,TRAIN:1<<24};
export const ALL=0x3fffffff;

// ---- bodies and shapes
interface BodyOpts{bullet?:boolean,fixedRot?:boolean,damp?:number,adamp?:number,vx?:number,vy?:number}
export function mkBody(kind:'static'|'dynamic',x:number,y:number,a=0,o:BodyOpts={}):BodyId{
  const bd=B.b2DefaultBodyDef();
  bd.type=kind==='static'?B.b2BodyType.b2_staticBody:B.b2BodyType.b2_dynamicBody;
  bd.position=vec(x,y);const rot=B.b2MakeRot(a);bd.rotation=rot;rot.delete();
  if(kind==='dynamic')bd.isBullet=o.bullet!==false;              // continuous collision against other moving bodies too
  if(o.fixedRot){const ml=bd.motionLocks;ml.angularZ=true;bd.motionLocks=ml}
  if(o.vx||o.vy)bd.linearVelocity=vec(o.vx??0,o.vy??0);
  if(o.damp)bd.linearDamping=o.damp;if(o.adamp)bd.angularDamping=o.adamp;
  const id=B.b2CreateBody(W,bd);bd.delete();return id;
}
interface ShapeOpts{density?:number,friction?:number,restitution?:number}
function shapeDef(cat:number,mask:number,o:ShapeOpts){
  const sd=B.b2DefaultShapeDef();sd.filter.categoryBits=cat;sd.filter.maskBits=mask;sd.density=o.density??1;
  const m=sd.material;m.friction=o.friction??0;m.restitution=o.restitution??0;sd.material=m;return sd}
// A box centred at (cx, cy) in the body's frame, half extents hw, hh.
export function addBox(id:BodyId,cx:number,cy:number,hw:number,hh:number,cat:number,mask:number,o:ShapeOpts={},ang=0):ShapeId{
  const sd=shapeDef(cat,mask,o),rot=ang?B.b2MakeRot(ang):ROT0,pg=B.b2MakeOffsetBox(hw,hh,vec(cx,cy),rot);
  const s=B.b2CreatePolygonShape(id,sd,pg);sd.delete();pg.delete();if(ang)rot.delete();return s}
export function addCircle(id:BodyId,cx:number,cy:number,r:number,cat:number,mask:number,o:ShapeOpts={}):ShapeId{
  const sd=shapeDef(cat,mask,o),c=new B.b2Circle();c.center=vec(cx,cy);c.radius=r;
  const s=B.b2CreateCircleShape(id,sd,c);sd.delete();c.delete();return s}
// Filters are only sent to Box2D when they change (changing one drops the shape's contacts).
const FCACHE=new Map<string,number>();
const skey=(s:ShapeId)=>s.index1+':'+s.generation+':'+s.world0;
export function setFilter(s:ShapeId,cat:number,mask:number){
  const k=skey(s),v=cat*1.0e10+mask;if(FCACHE.get(k)===v)return;FCACHE.set(k,v);
  FILT.categoryBits=cat;FILT.maskBits=mask;FILT.groupIndex=0;B.b2Shape_SetFilter(s,FILT)}
export const destroy=(id:BodyId)=>{if(B.b2Body_IsValid(id))B.b2DestroyBody(id)};
export const mass=(id:BodyId)=>B.b2Body_GetMass(id);
export const inertia=(id:BodyId)=>B.b2Body_GetRotationalInertia(id);

// ---- joints
// A rope: no force until it is pulled tight at `max`, then it will not stretch.
export function rope(a:BodyId,b:BodyId,max:number):JointId{
  const jd=B.b2DefaultDistanceJointDef();jd.base.bodyIdA=a;jd.base.bodyIdB=b;
  jd.length=max;jd.enableSpring=true;jd.hertz=0;jd.dampingRatio=0;jd.enableLimit=true;jd.minLength=0;jd.maxLength=max;
  const j=B.b2CreateDistanceJoint(W,jd);jd.delete();return j}
// A rigid link of fixed length.
export function rod(a:BodyId,b:BodyId,len:number):JointId{
  const jd=B.b2DefaultDistanceJointDef();jd.base.bodyIdA=a;jd.base.bodyIdB=b;jd.length=len;jd.enableSpring=false;
  const j=B.b2CreateDistanceJoint(W,jd);jd.delete();return j}

// ---- forces (only ever forces: they are cleared after every step)
export function force(id:BodyId,fx:number,fy:number){if((fx||fy)&&B.b2Body_IsValid(id))B.b2Body_ApplyForceToCenter(id,vec(fx,fy),true)}
export function torque(id:BodyId,t:number){if(t&&B.b2Body_IsValid(id))B.b2Body_ApplyTorque(id,t,true)}
// Push a body towards velocity (vx, vy) with an acceleration of at most amax: a = (v_want - v)/tau.
export function drive(o:Body,vx:number,vy:number,tau:number,amax:number,dt:number){
  const t=Math.max(tau,dt);let ax=(vx-o.vx)/t,ay=(vy-o.vy)/t;const a=Math.hypot(ax,ay);if(a>amax){ax*=amax/a;ay*=amax/a}
  if(!B.b2Body_IsValid(o.id))return 0;const m=mass(o.id);force(o.id,ax*m,ay*m);return Math.hypot(ax,ay);
}
// Turn a body towards angle `want` (and spin rate `w0` once there) with a critically damped torque.
export function steer(o:Body,want:number,hz:number,w0=0,amax=60){
  const d=Math.atan2(Math.sin(want-o.a),Math.cos(want-o.a)),k=(2*Math.PI*hz);
  const al=Math.max(-amax,Math.min(amax,k*k*d+2*k*(w0-o.w)));if(al&&B.b2Body_IsValid(o.id))torque(o.id,al*inertia(o.id));
}
// A sharp blow: a change of velocity delivered as a large but finite force over the next few steps.
interface Kick{id:BodyId,dvx:number,dvy:number,rate:number}
const KICKS:Kick[]=[];
export function kick(id:BodyId,dvx:number,dvy:number,rate=300){if(dvx||dvy)KICKS.push({id,dvx,dvy,rate})}

// ---- the bodies the game keeps an eye on: after every step their position (x, y), angle a
// and velocity (vx, vy, and w for spin) are read back.
export interface Body{id:BodyId,x:number,y:number,a:number,vx:number,vy:number,w:number}
const TRACKED=new Set<Body>();
export function track<T extends {x:number,y:number}>(o:T,id:BodyId):T&Body{const b=o as T&Body;b.id=id;b.a??=0;b.vx??=0;b.vy??=0;b.w??=0;read(b);TRACKED.add(b);return b}
export function untrack(o:Body){TRACKED.delete(o);destroy(o.id)}
export function read(o:Body){
  const p=B.b2Body_GetPosition(o.id),r=B.b2Body_GetRotation(o.id),v=B.b2Body_GetLinearVelocity(o.id);
  o.x=p.x;o.y=p.y;o.a=Math.atan2(r.s,r.c);o.vx=v.x;o.vy=v.y;o.w=B.b2Body_GetAngularVelocity(o.id);p.delete();r.delete();v.delete();
}

export function step(dt:number){
  if(dt<=0)return;
  for(let i=KICKS.length-1;i>=0;i--){const k=KICKS[i];
    if(!B.b2Body_IsValid(k.id)){KICKS.splice(i,1);continue}
    const d=Math.hypot(k.dvx,k.dvy),s=Math.min(1,k.rate*dt/d),m=mass(k.id);
    force(k.id,k.dvx*s*m/dt,k.dvy*s*m/dt);k.dvx*=1-s;k.dvy*=1-s;if(s>=1)KICKS.splice(i,1)}
  B.b2World_Step(W,dt,4);
  for(const o of TRACKED)read(o);
}
// One static body holds all the fixed walls of the city.
export const GROUND=mkBody('static',0,0);
