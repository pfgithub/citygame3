import * as THREE from 'three';
import { LH, WALL_H, Y } from '../constants';
import { VB } from './paint';
import { renderer, scene } from './renderer';
import { S } from '../state';
import { FL, type Furn, type Stair, type Wall } from '../world/floors';
import type { Disc, Rect } from '../types';

// Mesh builder: boxes and cylinders with per-vertex colour, merged into one mesh.
type Col=string|THREE.Color;
type V3=number[];
const colCache:Record<string,THREE.Color>={};
const rgb=(c:Col)=>typeof c!=='string'?c:(colCache[c]||(colCache[c]=new THREE.Color(c)));
export const shade=(c:Col,k=.8)=>rgb(c).clone().multiplyScalar(k);
const VMAT=new THREE.MeshLambertMaterial({vertexColors:true});
export const GLASS=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.42,depthWrite:false});
export const GLOW=new THREE.MeshBasicMaterial({vertexColors:true});
export class MB{
  p:number[]=[];n:number[]=[];c:number[]=[];
  tri(a:V3,b:V3,c:V3,n:V3,col:Col){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    if((uy*vz-uz*vy)*n[0]+(uz*vx-ux*vz)*n[1]+(ux*vy-uy*vx)*n[2]<0){const t=b;b=c;c=t}   // keep the front face outward
    const k=rgb(col);this.p.push(...a,...b,...c);for(let i=0;i<3;i++){this.n.push(...n);this.c.push(k.r,k.g,k.b)}}
  quad(a:V3,b:V3,c:V3,d:V3,n:V3,col:Col){this.tri(a,b,c,n,col);this.tri(a,c,d,n,col)}
  // x,z,w,d are the 2D footprint (world x / world y); y0..y1 is the height span
  box(x:number,z:number,w:number,d:number,y0:number,y1:number,side:Col,top=side){const X=x+w,Z=z+d;
    this.quad([x,y1,z],[x,y1,Z],[X,y1,Z],[X,y1,z],[0,1,0],top);
    this.quad([x,y0,z],[X,y0,z],[X,y1,z],[x,y1,z],[0,0,-1],side);
    this.quad([x,y0,Z],[X,y0,Z],[X,y1,Z],[x,y1,Z],[0,0,1],side);
    this.quad([x,y0,z],[x,y0,Z],[x,y1,Z],[x,y1,z],[-1,0,0],side);
    this.quad([X,y0,z],[X,y0,Z],[X,y1,Z],[X,y1,z],[1,0,0],side)}
  lid(x:number,z:number,w:number,d:number,y:number,col:Col){this.quad([x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],[0,-1,0],col)}   // a face seen from underneath
  cyl(cx:number,cz:number,r:number,y0:number,y1:number,side:Col,top=side,seg=10){
    for(let i=0;i<seg;i++){const a=i/seg*6.2832,b=(i+1)/seg*6.2832,m=(a+b)/2;
      const ax=cx+Math.cos(a)*r,az=cz+Math.sin(a)*r,bx=cx+Math.cos(b)*r,bz=cz+Math.sin(b)*r;
      this.quad([ax,y0,az],[bx,y0,bz],[bx,y1,bz],[ax,y1,az],[Math.cos(m),0,Math.sin(m)],side);
      this.tri([cx,y1,cz],[ax,y1,az],[bx,y1,bz],[0,1,0],top)}}
  mesh(mat:THREE.Material=VMAT){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    return new THREE.Mesh(g,mat)}
}
// What a slab is covered with: a material, and where on it each point of the world falls.
export interface Surf{mat:THREE.Material,uv:(wx:number,wy:number)=>[number,number]}
// A 2D painting of a rectangle of the world, as a texture.
export interface Art extends Surf,Rect{tex:THREE.CanvasTexture,mat:THREE.MeshLambertMaterial,paint:()=>void}
export function art(x:number,y:number,w:number,h:number,ppm:number,fn:(g:CanvasRenderingContext2D)=>void){
  ppm=Math.min(ppm,4096/w,4096/h);
  const c=document.createElement('canvas');c.width=Math.round(w*ppm);c.height=Math.round(h*ppm);
  const a={x,y,w,h,tex:new THREE.CanvasTexture(c)} as Art;a.tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  a.mat=new THREE.MeshLambertMaterial({map:a.tex});
  a.uv=(wx,wy)=>[(wx-x)/w,1-(wy-y)/h];
  a.paint=()=>{const g=c.getContext('2d')!;g.setTransform(c.width/w,0,0,c.height/h,-x*c.width/w,-y*c.height/h);
    VB.x0=x;VB.y0=y;VB.x1=x+w;VB.y1=y+h;const t=S.time;S.time=0;fn(g);S.time=t;a.tex.needsUpdate=true};   // (painted at time 0 so neighbouring pictures match)
  a.paint();return a;
}
// A flat floor: `rect` minus rectangular holes (stairwells, lift shafts), textured.
export function slab(rect:Rect,holes:Rect[],yy:number,a:Surf){
  const xs=[rect.x,rect.x+rect.w],zs=[rect.y,rect.y+rect.h];
  for(const h of holes){for(const v of[h.x,h.x+h.w])if(v>rect.x&&v<rect.x+rect.w)xs.push(v);
    for(const v of[h.y,h.y+h.h])if(v>rect.y&&v<rect.y+rect.h)zs.push(v)}
  xs.sort((p,q)=>p-q);zs.sort((p,q)=>p-q);
  const pos:number[]=[],uv:number[]=[],nor:number[]=[];
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const x0=xs[i],x1=xs[i+1],z0=zs[j],z1=zs[j+1];if(x1-x0<1e-6||z1-z0<1e-6)continue;
    const mx=(x0+x1)/2,mz=(z0+z1)/2;if(holes.some(h=>mx>h.x&&mx<h.x+h.w&&mz>h.y&&mz<h.y+h.h))continue;
    for(const[px,pz]of[[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){pos.push(px,yy,pz);uv.push(...a.uv(px,pz));nor.push(0,1,0)}}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  return new THREE.Mesh(g,a.mat);
}
// A box whose position and size change every frame (doors).
export const UNIT=new THREE.BoxGeometry(1,1,1);
export function dynBox(parent:THREE.Object3D,color:string){const m=new THREE.Mesh(UNIT,new THREE.MeshLambertMaterial({color}));parent.add(m);return m}
export function setBox(m:THREE.Object3D,x:number,z:number,w:number,d:number,y0:number,y1:number){m.visible=w>.02&&d>.02;m.position.set(x+w/2,(y0+y1)/2,z+d/2);m.scale.set(Math.max(w,.001),y1-y0,Math.max(d,.001))}
export const WALLS='#d3cec3',WTOP='#30333a';
function wall3d(mb:MB,gl:MB,w:Wall,y0:number){
  if(!w.wins||!w.wins.length){mb.box(w.x,w.y,w.w,w.h,y0,y0+WALL_H,WALLS,WTOP);return}
  // sill and lintel run the whole length; between them, piers alternate with glass
  const horiz=w.w>w.h,a=horiz?w.x:w.y,b=a+(horiz?w.w:w.h);let c=a;
  const seg=(m:MB,p:number,q:number,ya:number,yb:number,s:string,t:string)=>{if(q-p>.01)horiz?m.box(p,w.y,q-p,w.h,ya,yb,s,t):m.box(w.x,p,w.w,q-p,ya,yb,s,t)};
  seg(mb,a,b,y0,y0+.9,WALLS,WALLS);seg(mb,a,b,y0+2.15,y0+WALL_H,WALLS,WTOP);
  for(const v of w.wins){if(v<a||v+w.len>b)continue;seg(mb,c,v,y0+.9,y0+2.15,WALLS,WALLS);seg(gl,v,v+w.len,y0+.9,y0+2.15,'#a9d6ec','#a9d6ec');c=v+w.len}
  seg(mb,c,b,y0+.9,y0+2.15,WALLS,WALLS);
}
function furn3d(mb:MB,f:Furn,y0:number){
  const c=f.color;
  if(f.r!==undefined){const plant=c==='#4f8a55',h=plant?1.15:f.ghost?.46:.74;
    mb.cyl(f.cx,f.cy,f.r,y0,y0+h,shade(c),c,plant?7:12);return}
  let a=0,b=.76;
  if(f.opq||c==='#6f757d')b=WALL_H;
  else if(f.ghost){if(c==='#23262b'){a=.76;b=1.12}else{a=.5;b=.6}}
  else if(c==='#5d6f86'||c==='#e8e2d6'||c==='#7a6248')b=.48;      // sofas, bed, benches
  else if(c==='#3f6fb0'||c==='#e4e6e9'||c==='#9aa0a8')b=1.7;       // ticket machines, fridge, cabinets
  else if(c==='#bfe0ea')b=.12;else if(c==='#22252a')b=1;else if(f.turn)b=1;
  mb.box(f.x,f.y,f.w,f.h,y0+a,y0+b,shade(c),c);
}
export const FPONLY:THREE.Object3D[]=[];                      // meshes that only exist in first person: ceilings, roofs, wall tops
export const fpAdd=<T extends THREE.Object3D>(parent:THREE.Object3D,m:T)=>{m.visible=false;FPONLY.push(m);parent.add(m);return m};
export const CEILB={mat:new THREE.MeshLambertMaterial({color:'#e9e6df',side:THREE.DoubleSide}),uv:()=>[0,0]} as Surf;   // plaster ceilings indoors
export const CEIL={mat:new THREE.MeshLambertMaterial({color:'#3a3d44',side:THREE.DoubleSide}),uv:()=>[0,0]} as Surf;
export const inR=(o:Rect|Disc,r:Rect)=>{const cx='cx' in o?o.cx:o.x+o.w/2,cy='cx' in o?o.cy:o.y+o.h/2;return cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h};
export function levelParts(g:THREE.Object3D,z:number,rect:Rect){
  const mb=new MB(),gl=new MB(),y0=Y(z)+.03;
  const up=new MB();   // walls stop short of the ceiling so the top-down view stays readable; this closes the gap
  for(const w of FL[z].walls)if(inR(w,rect)){wall3d(mb,gl,w,y0);up.box(w.x,w.y,w.w,w.h,y0+WALL_H,y0+LH-.04,WALLS)}
  for(const f of FL[z].furn)if(inR(f,rect)){furn3d(mb,f,y0);if(f.r===undefined&&(f.opq||f.color==='#6f757d'))up.box(f.x,f.y,f.w,f.h,y0+WALL_H,y0+LH-.04,shade(f.color))}
  g.add(mb.mesh());if(gl.p.length)g.add(gl.mesh(GLASS));fpAdd(g,up.mesh());
  return mb;
}
// plain facade: a block with ribbon windows on every storey
export function facade(mb:MB,r:Rect,floors:number,side:Col,top:Col){
  const h=floors*LH+.4;mb.box(r.x,r.y,r.w,r.h,0,h,side,top);
  for(let f=0;f<floors;f++){const ya=f*LH+1.1,yb=ya+1.3,m=Math.min(1.2,r.w*.12,r.h*.12),e=.05,k='#5f7789';
    mb.box(r.x+m,r.y-e,r.w-2*m,e,ya,yb,k);mb.box(r.x+m,r.y+r.h,r.w-2*m,e,ya,yb,k);
    mb.box(r.x-e,r.y+m,e,r.h-2*m,ya,yb,k);mb.box(r.x+r.w,r.y+m,e,r.h-2*m,ya,yb,k)}
  return h;
}
export function stairMeshes(s:Stair){
  const lo=new MB(),hi=new MB(),y0=Y(s.zl),rise=Y(s.zh)-y0,vert=s.dir==='N'||s.dir==='S',L=vert?s.h:s.w,n=Math.round(L/.32);
  for(let i=0;i<n;i++){const a=i/n*L,b=(i+1)/n*L,top=y0+(i+1)/n*rise;
    if(s.dir==='N')lo.box(s.x,s.y+s.h-b,s.w,b-a,y0,top,'#8f8b82','#cbc7bd');
    else if(s.dir==='S')lo.box(s.x,s.y+a,s.w,b-a,y0,top,'#8f8b82','#cbc7bd');
    else if(s.dir==='E')lo.box(s.x+a,s.y,b-a,s.h,y0,top,'#8f8b82','#cbc7bd');
    else lo.box(s.x+s.w-b,s.y,b-a,s.h,y0,top,'#8f8b82','#cbc7bd')}
  for(const w of s.sides){lo.box(w.x,w.y,w.w,w.h,y0,y0+WALL_H,WALLS,WTOP);hi.box(w.x,w.y,w.w,w.h,y0+WALL_H,Y(s.zh)+(s.owner?WALL_H:1.05),WALLS,WTOP)}
  // railing across the open end of the stairwell on the upper floor, so the drop is visibly fenced off
  {const[x,z,w,d]=s.rail;hi.box(x,z,w,d,Y(s.zh),Y(s.zh)+1.05,WALLS,WTOP)}
  s.low=lo.mesh();s.high=hi.mesh();scene.add(s.low,s.high);
  if(s.owner){const up=new MB();for(const w of s.sides)up.box(w.x,w.y,w.w,w.h,Y(s.zh)+WALL_H,Y(s.zh)+LH-.04,WALLS);fpAdd(scene,up.mesh())}
}
