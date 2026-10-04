import * as THREE from 'three';
import { GLASS, MB, art, facade, shade, slab } from './mesh';
import { SUBCOVER, drawOutdoor } from './paint';
import { scene } from './renderer';
import { BARRIERS } from '../sim/traffic';
import { P } from '../state';
import { lerp, mulberry32 } from '../util';
import { BOLLARDS, FOUNT, HPLANT, OUT, type Tree } from '../world/outdoors';
import type { Art } from './mesh';
import { LINE_D, STATIONS } from '../world/subway';
import { RINKB } from '../world/surfaces';

export const OUTG=new THREE.Group();scene.add(OUTG);
export const CANOPIES:{t:Tree,m:THREE.Mesh<THREE.IcosahedronGeometry,THREE.MeshLambertMaterial>}[]=[];
{
  const subHole=(dx:number)=>({x:dx+110,y:92,w:3,h:10});
  OUTG.add(slab({x:-90,y:-90,w:380,h:340},[subHole(0)],0,art(-90,-90,380,340,9,drawOutdoor)));
  OUTG.add(slab({x:290,y:-50,w:210,h:240},[],0,art(290,-50,210,240,9,drawOutdoor)));
  OUTG.add(slab({x:500,y:-50,w:240,h:200},[subHole(LINE_D)],0,art(500,-50,240,200,9,drawOutdoor)));
  OUTG.add(slab({x:1000,y:-60,w:220,h:220},[subHole(2*LINE_D)],0,art(1000,-60,220,220,9,drawOutdoor)));
  const mb=new MB(),gl=new MB(),hr=mulberry32(5);
  const FAC=['#b9a996','#a7b0b8','#c2b8a3','#9aa3ad','#c9bca8','#a5aa9f','#b39c8f'];
  for(const b of OUT.roofs){
    const small=b.w<12&&b.h<12,h=facade(mb,b,small?1:3+Math.floor(hr()*6),FAC[Math.floor(hr()*FAC.length)],b.color);
    for(const d of b.details)mb.box(d.x,d.y,d.w,d.h,h,h+(d.c==='#c3c6ca'?1.1:.35),shade(d.c),d.c)}
  for(const t of OUT.trees){mb.cyl(t.x,t.y,.28,0,2.4+t.r*.4,'#5a4632','#5a4632',6)}
  const ico=new THREE.IcosahedronGeometry(1,1),cm={};
  for(const t of OUT.trees){const m=new THREE.Mesh(ico,new THREE.MeshLambertMaterial({color:t.c,flatShading:true}));
    m.position.set(t.x,2.2+t.r*.8,t.y);m.scale.set(t.r,t.r*.8,t.r);OUTG.add(m);CANOPIES.push({t,m})}
  for(const l of OUT.lamps){mb.cyl(l.x,l.y,.07,0,5.4,'#33363c','#33363c',6);mb.box(l.x-.3,l.y-.3,.6,.6,5.4,5.6,'#d9cfa0','#fff2c0')}
  for(const c of OUT.cars){mb.box(c.x,c.y,c.w,c.h,.22,.85,shade(c.c,.85),c.c);mb.box(c.x+c.w*.24,c.y+.14,c.w*.48,c.h-.28,.85,1.38,'#26303b',c.c)}
  for(const b of OUT.benches){mb.box(b.x,b.y,b.w,b.h,0,.46,'#5f452d','#7a5a3c')}
  for(const[x,y,w,h]of[...OUT.planters.map(p=>[p.x,p.y,p.w,p.h]),...HPLANT])mb.box(x,y,w,h,0,.5,'#8d8778','#5c9a58');
  for(const f of OUT.fence){const L=Math.hypot(f[2]-f[0],f[3]-f[1]),n=Math.round(L/2.5),x=Math.min(f[0],f[2]),y=Math.min(f[1],f[3]);
    for(let k=0;k<=n;k++)mb.box(lerp(f[0],f[2],k/n)-.06,lerp(f[1],f[3],k/n)-.06,.12,.12,0,1.15,'#2f3a33');
    for(const ry of[.5,1.02])mb.box(x-.03,y-.03,Math.abs(f[2]-f[0])+.06,Math.abs(f[3]-f[1])+.06,ry,ry+.06,'#2f3a33')}
  for(const r of RINKB)mb.box(r.x,r.y,r.w,r.h,0,.95,'#f4f1ea','#c94f3d');
  for(const x of BOLLARDS)mb.cyl(x,61,.22,0,.7,'#2c2f35','#3a3d44',8);
  mb.cyl(FOUNT.x,FOUNT.y,FOUNT.r,0,.5,'#a39d8e','#b9b3a4',24);mb.cyl(FOUNT.x,FOUNT.y,FOUNT.r-.35,0,.52,'#6fb3d6','#6fb3d6',24);
  mb.cyl(FOUNT.x,FOUNT.y,.35,0,1.3,'#cfcabd','#e5e1d6',10);
  for(const[x,y,w,h]of BARRIERS)mb.box(x,y,w,h,0,1,'#e8762c','#f4f1ea');
  for(const st of STATIONS){const dx=st.dx;
    mb.cyl(dx+108.6,90.8,.1,0,3,'#2a2d33','#2a2d33',6);mb.cyl(dx+108.6,90.8,.75,3,3.12,'#1f5fb5','#1f5fb5',16);
    const c=SUBCOVER;gl.box(dx+c.x,c.y,c.w,c.h,2.6,2.72,'#7fa6bd','#8fb4c8');
    for(const[px,py]of[[c.x,c.y],[c.x+c.w-.15,c.y],[c.x,c.y+c.h-.15],[c.x+c.w-.15,c.y+c.h-.15]])mb.box(dx+px,py,.15,.15,0,2.6,'#56616d')}
  OUTG.add(mb.mesh(),gl.mesh(GLASS));
}

// Sharp ground near the player. The whole-district ground pictures above are only about ten
// pixels per metre; the nine 48 m squares around the player are repainted at 26 and laid just
// over them, one new square per frame as the player moves.
const TILE=48,TILES=new Map<string,{m:THREE.Mesh,a:Art,i:number,j:number}>();
export function updateTiles(){
  if(P.z<-.9)return;
  const ci=Math.floor(P.x/TILE),cj=Math.floor(P.y/TILE);let made=false;
  for(let i=ci-1;i<=ci+1&&!made;i++)for(let j=cj-1;j<=cj+1&&!made;j++){const k=i+','+j;if(TILES.has(k))continue;
    const x=i*TILE,y=j*TILE,a=art(x,y,TILE,TILE,26,drawOutdoor);a.mat.polygonOffset=true;a.mat.polygonOffsetFactor=-1;a.mat.polygonOffsetUnits=-1;
    const m=slab({x,y,w:TILE,h:TILE},STATIONS.map(st=>({x:st.dx+110,y:92,w:3,h:10})),.012,a);OUTG.add(m);TILES.set(k,{m,a,i,j});made=true}
  for(const[k,t]of TILES)if(Math.abs(t.i-ci)>2||Math.abs(t.j-cj)>2){OUTG.remove(t.m);t.m.geometry.dispose();t.a.mat.dispose();t.a.tex.dispose();TILES.delete(k)}
}
