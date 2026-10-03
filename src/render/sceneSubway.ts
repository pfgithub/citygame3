import * as THREE from 'three';
import { LH, Y } from '../constants';
import { CEIL, GLASS, GLOW, MB, art, dynBox, fpAdd, levelParts, shade, slab } from './mesh';
import { drawConcourse, drawPlatform } from './paint';
import { cv, scene } from './renderer';
import { clamp, lerp } from '../util';
import { CONC, CROSS, STATIONS, TDOORS, TL, TRACKY, TRAINS, TW, trainParts } from '../world/subway';

export const TUNNEL=new THREE.Group();scene.add(TUNNEL);
for(const st of STATIONS){
  const dx=st.dx,zone={x:dx+90,y:95,w:110,h:35};
  st.g1=new THREE.Group();st.g2=new THREE.Group();scene.add(st.g1,st.g2);
  st.g1.add(slab({x:dx+CONC.x,y:CONC.y,w:CONC.w,h:CONC.h},[{x:dx+128,y:112,w:10,h:3}],Y(-1),art(dx+CONC.x,CONC.y,CONC.w,CONC.h,24,drawConcourse)));
  levelParts(st.g1,-1,zone);
  st.art=art(dx+96,103.3,98,20.4,20,drawPlatform);
  st.g2.add(slab({x:dx+96,y:103.3,w:98,h:20.4},[],Y(-2),st.art));
  levelParts(st.g2,-2,zone);
  const gl=new MB();for(const r of st.screens)gl.box(r.x,r.y+.04,r.w,r.h-.08,Y(-2),Y(-2)+2.1,'#96cde6','#96cde6');
  st.g2.add(gl.mesh(GLASS));
  fpAdd(scene,slab({x:dx+CONC.x-.3,y:CONC.y-.3,w:CONC.w+.6,h:CONC.h+.6},[],Y(0)-.3,CEIL));
  fpAdd(scene,slab({x:dx+96,y:103.3,w:98,h:20.4},[{x:dx+128,y:112,w:10,h:3}],Y(-1)-.35,CEIL));   // well clear of the concourse floor above, or the two flicker
  st.doors=[0,1].map(()=>TDOORS.map(()=>[dynBox(st.g2,'#eef0f2'),dynBox(st.g2,'#eef0f2')]));
}
{ // running tunnels between and beyond the stations
  const a=art(280,103.3,7,3.5,32,drawPlatform);a.tex.wrapS=THREE.RepeatWrapping;
  const RH=LH-.35;   // rock stops at the tunnel ceiling, safely below the concourse floor that overlaps it in plan
  const mb=new MB(),glow=new MB(),y=Y(-2),X1=STATIONS[STATIONS.length-1].dx+400,gaps=[];
  {let c=-150;for(const st of STATIONS){gaps.push([c,st.dx+96]);c=st.dx+194}gaps.push([c,X1])}
  for(const[x0,x1]of gaps)for(const ty of[103.3,120.2]){
    const m=slab({x:x0,y:ty,w:x1-x0,h:3.5},[],y,{mat:a.mat,uv:(wx,wy)=>[wx/7,1-(wy-ty)/3.5]});TUNNEL.add(m);
    fpAdd(TUNNEL,slab({x:x0,y:ty,w:x1-x0,h:3.5},[],Y(-1)-.35,CEIL))}
  // crossover caverns: the rock between the two tunnels is opened up and a track swings across
  const caves=CROSS.map(c=>({c,x0:c.a-12,x1:c.b+TL+12}));
  for(const[x0,x1]of gaps){let c=x0;
    for(const cv of caves.filter(v=>v.x0>x0&&v.x1<x1).sort((p,q)=>p.x0-q.x0)){mb.box(c,106.8,cv.x0-c,13.4,y,y+RH,'#2a2c31','#0f1013');c=cv.x1}
    mb.box(c,106.8,x1-c,13.4,y,y+RH,'#2a2c31','#0f1013')}
  for(const cv of caves){const r={x:cv.x0,y:106.8,w:cv.x1-cv.x0,h:13.4};
    TUNNEL.add(slab(r,[],y,art(r.x,r.y,r.w,r.h,12,g=>{
      g.fillStyle='#24262b';g.fillRect(r.x,r.y,r.w,r.h);
      const yc=xc=>{const t=clamp((xc-TL/2-cv.c.a)/(cv.c.b-cv.c.a));return lerp(TRACKY[1],TRACKY[0],t*t*(3-2*t))+TW/2};
      g.strokeStyle='#4a4038';g.lineWidth=.22;g.beginPath();for(let x=r.x;x<r.x+r.w;x+=.7){g.moveTo(x,yc(x)-1.2);g.lineTo(x,yc(x)+1.2)}g.stroke();
      g.strokeStyle='#9aa0a8';g.lineWidth=.08;for(const o of[-.72,.72]){g.beginPath();for(let x=r.x;x<=r.x+r.w;x+=.5)g.lineTo(x,yc(x)+o);g.stroke()}})));
    fpAdd(TUNNEL,slab(r,[],Y(-1)-.35,CEIL))}
  mb.box(-150,101.3,X1+150,2,y,y+RH,'#2a2c31','#0f1013');mb.box(-150,123.7,X1+150,2,y,y+RH,'#2a2c31','#0f1013');
  for(let x=-150;x<X1;x+=10){glow.box(x,103.3,.7,.1,y+2,y+2.25,'#ffe9a8');glow.box(x,123.6,.7,.1,y+2,y+2.25,'#ffe9a8')}
  TUNNEL.add(mb.mesh(),glow.mesh(GLOW));
}
for(const tr of TRAINS){ // built around a local origin; the group is moved to wherever the train is
  const g=new THREE.Group(),mb=new MB(),p=trainParts({x:0,y:0}),y=Y(-2),cl=TL/4;
  mb.box(0,0,TL,TW,y-.02,y+.04,'#d5d8dc');
  for(let i=1;i<4;i++)mb.box(i*cl-.3,.15,.6,TW-.3,y+.04,y+.07,'#8a8f96');
  for(const w of p.walls)mb.box(w.x,w.y,w.w,w.h,y,y+2.1,'#565c65',tr.col);
  for(let i=0;i<4;i++)for(const[a,b]of[[.8,3.9],[5.8,9],[10.9,14],[15.9,17.7]])for(const sy of[.15,TW-.6])mb.box(i*cl+a,sy,b-a,.45,y,y+.45,shade(tr.col),tr.col);
  g.add(mb.mesh());tr.g=g;scene.add(g);
  {const rf=new MB();rf.box(0,0,TL,TW,y+2.1,y+2.2,tr.col);rf.lid(0,0,TL,TW,y+2.1,'#e9ecef');fpAdd(g,rf.mesh());
    const lt=new MB();for(let x=2;x<TL-2;x+=4.6)lt.lid(x,TW/2-.12,1.6,.24,y+2.09,'#fffbe8');fpAdd(g,lt.mesh(GLOW))}
  tr.doors=[0,1].map(()=>TDOORS.map(()=>[dynBox(g,'#e9ecef'),dynBox(g,'#e9ecef')]));
}
