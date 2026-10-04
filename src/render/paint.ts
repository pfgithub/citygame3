import { BARRIERS } from '../sim/traffic';
import { etas } from '../sim/trains';
import { S } from '../state';
import { lerp, mulberry32 } from '../util';
import { FIELD, WEAPONS } from '../world/arena';
import { FL } from '../world/floors';
import { CAR, OFFICE } from '../world/office';
import { BOLLARDS, FOUNT, HPLANT, OUT, PATHS, PLAZA, POND } from '../world/outdoors';
import { CONC, PLAT, STATIONS, STOPS } from '../world/subway';
import type { Lift } from '../world/floors';
import type { Rect } from '../types';
import { RINK } from '../world/surfaces';
import { FLATDOORS, MYFLAT, MYRECT, TLIFT, TOWER, TTOP } from '../world/tower';

// The world is rendered in 3D (three.js) from straight above. The 2D canvas
// painters below are kept as texture artists: they paint the ground and each
// floor once, and those pictures are laid onto the 3D floors.
type G=CanvasRenderingContext2D;
export const VB={x0:0,y0:0,x1:0,y1:0};   // the part of the world being painted
const vis=(x:number,y:number,w:number,h:number)=>x<VB.x1&&x+w>VB.x0&&y<VB.y1&&y+h>VB.y0;
function text(g:G,s:string,x:number,y:number,size:number,color:string,rot=0,align:CanvasTextAlign='center'){g.save();g.translate(x,y);g.rotate(rot);g.scale(size/20,size/20);
  g.font='600 20px system-ui,sans-serif';g.textAlign=align;g.textBaseline='middle';g.fillStyle=color;g.fillText(s,0,0);g.restore()}
function rrect(g:G,x:number,y:number,w:number,h:number,r:number){g.beginPath();g.roundRect(x,y,w,h,r)}
function disc(g:G,x:number,y:number,r:number){g.beginPath();g.arc(x,y,r,0,6.2832)}

const C={road:'#4b4f57',walk:'#c8c5bc',curb:'#a9a69d',inner:'#aaa79e',grass:'#7fae6b',path:'#dccfae',wall:'#30333a',dark:'#14161a'};

export function drawOutdoor(g:G){
  g.fillStyle=C.road;g.fillRect(VB.x0,VB.y0,VB.x1-VB.x0,VB.y1-VB.y0);
  if(VB.x0>850){drawArenaGround(g);return}
  if(VB.x1>540){g.save();g.beginPath();g.rect(540,VB.y0-1,VB.x1-539,VB.y1-VB.y0+2);g.clip();drawHarborGround(g);g.restore()}
  if(VB.x0<540){g.save();g.beginPath();g.rect(VB.x0-1,VB.y0-1,541-VB.x0,VB.y1-VB.y0+2);g.clip();
  // blocks
  const blocks:[number,number,number,number][]=[[-90,-90,180,160],[100,-90,480,160],[-90,82,180,170],[100,82,480,170]];
  g.fillStyle=C.walk;for(const b of blocks)g.fillRect(...b);
  g.strokeStyle=C.curb;g.lineWidth=.25;for(const b of blocks)g.strokeRect(...b);
  g.fillStyle=C.inner;g.fillRect(-90,-90,176,156);g.fillRect(-90,86,176,166);g.fillRect(104,86,476,166);g.fillRect(200.6,-90,380,156);
  // paving joints on the sidewalks
  g.strokeStyle='rgba(0,0,0,.07)';g.lineWidth=.06;g.beginPath();
  for(let x=Math.floor(VB.x0/2)*2;x<Math.min(VB.x1,540);x+=2){if(x>88&&x<102)continue;g.moveTo(x,66);g.lineTo(x,70);g.moveTo(x,82);g.lineTo(x,86)}
  for(let y=Math.floor(VB.y0/2)*2;y<VB.y1;y+=2){if(y>68&&y<84)continue;g.moveTo(86,y);g.lineTo(90,y);g.moveTo(100,y);g.lineTo(104,y)}
  g.stroke();
  // road markings
  g.strokeStyle='#e2c44c';g.lineWidth=.14;g.beginPath();
  for(const o of[-.15,.15]){g.moveTo(-90,76+o);g.lineTo(85,76+o);g.moveTo(105,76+o);g.lineTo(552,76+o);
    g.moveTo(95+o,-90);g.lineTo(95+o,65);g.moveTo(95+o,87);g.lineTo(95+o,250)}
  g.stroke();
  g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=.12;g.setLineDash([1.2,1.2]);g.beginPath();
  for(const y of[72.4,79.6]){g.moveTo(-90,y);g.lineTo(85,y);g.moveTo(105,y);g.lineTo(552,y)}
  g.stroke();g.setLineDash([]);
  g.fillStyle='rgba(255,255,255,.8)';
  for(let y=70.4;y<81.6;y+=1.1){g.fillRect(86.6,y,2.8,.55);g.fillRect(100.6,y,2.8,.55)}
  for(let x=90.4;x<99.6;x+=1.1){g.fillRect(x,66.6,.55,2.8);g.fillRect(x,82.6,.55,2.8)}
  g.fillRect(85.2,76.4,.4,5.6);g.fillRect(104.4,70,.4,5.6);g.fillRect(90,65.2,4.6,.4);g.fillRect(95.4,86.4,4.6,.4);
  // road-closed barriers at the edge of the demo region
  for(const[x,y,w,h]of BARRIERS){
    g.fillStyle='#e8762c';g.fillRect(x,y,w,h);g.fillStyle='#f4f1ea';
    if(w<h)for(let k=y+.5;k<y+h;k+=2)g.fillRect(x,k,w,1);else for(let k=x+.5;k<x+w;k+=2)g.fillRect(k,y,1,h)}
  // park
  g.fillStyle=C.grass;g.fillRect(104,-90,96.3,156);
  g.fillStyle='rgba(255,255,255,.05)';for(let i=0;i<14;i++)g.fillRect(104,i*10-40,96.3,5);
  g.strokeStyle=C.path;g.lineCap='round';g.lineJoin='round';g.lineWidth=3;g.beginPath();
  for(const s of PATHS){g.moveTo(s[0],s[1]);g.lineTo(s[2],s[3])}g.stroke();g.lineCap='butt';
  g.fillStyle=C.path;disc(g,FOUNT.x,FOUNT.y,7.4);g.fill();
  g.fillStyle='#b9b3a4';disc(g,FOUNT.x,FOUNT.y,FOUNT.r);g.fill();
  g.fillStyle='#6fb3d6';disc(g,FOUNT.x,FOUNT.y,FOUNT.r-.35);g.fill();
  g.lineWidth=.08;
  for(let k=0;k<3;k++){const q=(S.time*.5+k/3)%1;g.strokeStyle=`rgba(255,255,255,${(.6*(1-q)).toFixed(3)})`;disc(g,FOUNT.x,FOUNT.y,.3+q*1.8);g.stroke()}
  g.fillStyle='#e5e1d6';disc(g,FOUNT.x,FOUNT.y,.35);g.fill();
  g.fillStyle='#b5a77f';g.beginPath();g.ellipse(POND.x,POND.y,POND.rx+.6,POND.ry+.6,0,0,6.2832);g.fill();
  g.fillStyle='#5fa3c9';g.beginPath();g.ellipse(POND.x,POND.y,POND.rx,POND.ry,0,0,6.2832);g.fill();
  g.fillStyle='rgba(255,255,255,.12)';g.beginPath();g.ellipse(POND.x-2,POND.y-1.5,POND.rx*.6,POND.ry*.45,0,0,6.2832);g.fill();
  g.strokeStyle='#2f3a33';g.lineWidth=.14;g.beginPath();for(const f of OUT.fence){g.moveTo(f[0],f[1]);g.lineTo(f[2],f[3])}g.stroke();
  g.fillStyle='#2f3a33';for(const f of OUT.fence){const L=Math.hypot(f[2]-f[0],f[3]-f[1]),n=Math.round(L/2.5);
    for(let k=0;k<=n;k++)g.fillRect(lerp(f[0],f[2],k/n)-.13,lerp(f[1],f[3],k/n)-.13,.26,.26)}
  // plaza
  g.fillStyle='#d6cfc0';g.fillRect(PLAZA.x,PLAZA.y,PLAZA.w,PLAZA.h);
  g.strokeStyle='rgba(0,0,0,.08)';g.lineWidth=.06;g.beginPath();
  for(let x=PLAZA.x;x<=PLAZA.x+PLAZA.w;x+=2){g.moveTo(x,PLAZA.y);g.lineTo(x,PLAZA.y+PLAZA.h)}
  for(let y=PLAZA.y;y<=PLAZA.y+PLAZA.h;y+=2){g.moveTo(PLAZA.x,y);g.lineTo(PLAZA.x+PLAZA.w,y)}g.stroke();
  for(const p of OUT.planters){g.fillStyle='#8d8778';g.fillRect(p.x,p.y,p.w,p.h);g.fillStyle='#5c9a58';g.fillRect(p.x+.2,p.y+.2,p.w-.4,p.h-.4)}
  g.fillStyle='#2a2d33';disc(g,108.6,90.8,.12);g.fill();
  g.fillStyle='#1f5fb5';disc(g,108.6,90.2,.75);g.fill();text(g,'M',108.6,90.25,1,'#fff');
  text(g,'SUBWAY',111.5,90.6,.7,'rgba(40,44,52,.75)');
  g.restore()}
  g.fillStyle='#8c3f37';g.fillRect(66.8,66,2.4,1.5);text(g,'OFFICE',68,66.75,.48,'rgba(255,255,255,.75)');
  g.fillStyle='#3d5a80';g.fillRect(32.8,66,2.4,1.5);text(g,'APARTMENTS',34,66.75,.3,'rgba(255,255,255,.8)');
}
function drawArenaGround(g:G){
  const x0=VB.x0-1,w=VB.x1-VB.x0+2,f=FIELD;
  g.fillStyle='#c4bfb2';g.fillRect(x0,VB.y0-1,w,VB.y1-VB.y0+2);
  g.strokeStyle='rgba(0,0,0,.07)';g.lineWidth=.06;g.beginPath();
  for(let x=1052;x<=1168;x+=2){g.moveTo(x,74);g.lineTo(x,106)}for(let y=74;y<=106;y+=2){g.moveTo(1052,y);g.lineTo(1168,y)}g.stroke();
  g.fillStyle='#d6c193';g.fillRect(1052,-8,116,82);                       // sand
  g.strokeStyle='rgba(120,90,40,.16)';g.lineWidth=.25;for(const r of[8,18,28]){disc(g,1110,33,r);g.stroke()}
  g.fillStyle='rgba(120,90,40,.08)';for(let i=0;i<220;i++){const q=mulberry32(i+7);g.fillRect(1053+q()*114,-7+q()*80,.6+q()*1.6,.15)}
  g.strokeStyle='#2f3a33';g.lineWidth=.14;g.beginPath();for(const s of OUT.fence){g.moveTo(s[0],s[1]);g.lineTo(s[2],s[3])}g.stroke();
  for(const p of WEAPONS){g.fillStyle='#3a3d44';disc(g,p.x,p.y,1.55);g.fill();g.fillStyle=p.c;disc(g,p.x,p.y,1.35);g.fill();
    g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=.08;disc(g,p.x,p.y,1.05);g.stroke();
    text(g,p.name.toUpperCase(),p.x,p.y+2.3,.55,'rgba(40,44,52,.8)')}
  text(g,'WEAPONS  ·  step on a pad',1111,78.2,.6,'rgba(40,44,52,.6)');
  text(g,'ARENA',1110,33,6,'rgba(120,90,40,.14)');
  g.fillStyle='#2a2d33';disc(g,1108.6,90.8,.12);g.fill();
  g.fillStyle='#1f5fb5';disc(g,1108.6,90.2,.75);g.fill();text(g,'M',1108.6,90.25,1,'#fff');
  text(g,'SUBWAY',1111.5,90.6,.7,'rgba(40,44,52,.75)');
}
function drawHarborGround(g:G){
  const x0=VB.x0-1,w=VB.x1-VB.x0+2;
  g.fillStyle='#c4bfb2';g.fillRect(x0,VB.y0-1,w,VB.y1-VB.y0+2);
  g.strokeStyle='rgba(0,0,0,.07)';g.lineWidth=.06;g.beginPath();
  for(let x=564;x<=676;x+=2){g.moveTo(x,72);g.lineTo(x,108)}for(let y=72;y<=108;y+=2){g.moveTo(564,y);g.lineTo(676,y)}g.stroke();
  g.fillStyle='#a39e92';g.fillRect(x0,60,w,12);
  // ice rink
  {const r=RINK;g.fillStyle='#e8f3f8';g.fillRect(r.x,r.y,r.w,r.h);
    g.strokeStyle='rgba(120,170,200,.35)';g.lineWidth=.1;g.strokeRect(r.x+1.5,r.y+1.5,r.w-3,r.h-3);disc(g,r.x+r.w/2,r.y+r.h/2,3);g.stroke();
    g.beginPath();g.moveTo(r.x+r.w/2,r.y);g.lineTo(r.x+r.w/2,r.y+r.h);g.stroke();
    g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();
    g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=.04;const q=mulberry32(4);g.beginPath();
    for(let i=0;i<70;i++){const x=r.x+q()*r.w,y=r.y+q()*r.h,a=q()*6.3,l=1+q()*3;g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l,y+Math.sin(a)*l,x+Math.cos(a+.8)*l*1.6,y+Math.sin(a+.8)*l*1.6)}g.stroke();g.restore();
    text(g,'ICE RINK',r.x+r.w/2,r.y-1.2,.6,'rgba(40,44,52,.6)')}
  // the avenue arrives from the west and ends in a turning place
  g.fillStyle=C.walk;g.fillRect(x0,66,566-x0,20);g.fillStyle=C.road;g.fillRect(x0,70,564-x0,12);disc(g,564,76,6);g.fill();
  g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=.14;disc(g,564,76,2.2);g.stroke();
  // water
  g.fillStyle='#4f8db3';g.fillRect(x0,VB.y0-1,w,60-(VB.y0-1));
  g.strokeStyle='rgba(255,255,255,.14)';g.lineWidth=.12;g.setLineDash([2.2,5]);
  for(let y=Math.floor(VB.y0/3)*3;y<59;y+=3){g.lineDashOffset=-S.time*1.2+y*2.3;g.beginPath();g.moveTo(x0,y);g.lineTo(x0+w,y);g.stroke()}
  g.setLineDash([]);g.lineDashOffset=0;
  for(const[x,y,bw,bh,c]of[[583,49,7,2.6,'#e9e6df'],[599,45,5,2,'#c94f3d'],[644,51,8,2.8,'#e9e6df'],[660,45.5,5,2,'#3d6fc9']] as [number,number,number,number,string][]){
    const by=y+Math.sin(S.time*.8+x)*.12;
    g.fillStyle='rgba(0,0,0,.15)';rrect(g,x+.3,by+.3,bw,bh,bh*.45);g.fill();
    g.fillStyle=c;rrect(g,x,by,bw,bh,bh*.45);g.fill();
    g.fillStyle='rgba(0,0,0,.18)';rrect(g,x+bw*.25,by+bh*.25,bw*.45,bh*.5,.3);g.fill()}
  g.fillStyle='#77736a';g.fillRect(x0,59.6,w,.5);
  // pier
  g.fillStyle='#a58a63';g.fillRect(617,42,6,18.2);
  g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=.05;g.beginPath();for(let y=42.5;y<60;y+=.5){g.moveTo(617,y);g.lineTo(623,y)}g.stroke();
  g.strokeStyle='#2f3a33';g.lineWidth=.14;g.beginPath();for(const f of OUT.fence){g.moveTo(f[0],f[1]);g.lineTo(f[2],f[3])}g.stroke();
  g.fillStyle='#3a3d44';for(const x of BOLLARDS){disc(g,x,61,.22);g.fill()}
  for(const[x,y,pw,ph]of HPLANT){g.fillStyle='#8d8778';g.fillRect(x,y,pw,ph);g.fillStyle='#5c9a58';g.fillRect(x+.2,y+.2,pw-.4,ph-.4)}
  g.fillStyle='#2a2d33';disc(g,608.6,90.8,.12);g.fill();
  g.fillStyle='#1f5fb5';disc(g,608.6,90.2,.75);g.fill();text(g,'M',608.6,90.25,1,'#fff');
  text(g,'SUBWAY',611.5,90.6,.7,'rgba(40,44,52,.75)');
  text(g,'HARBOR',620,66,2.2,'rgba(0,0,0,.1)');
}
function grid(g:G,r:Rect,step:number,color:string){g.strokeStyle=color;g.lineWidth=.04;g.beginPath();
  for(let x=r.x;x<=r.x+r.w+.01;x+=step){g.moveTo(x,r.y);g.lineTo(x,r.y+r.h)}
  for(let y=r.y;y<=r.y+r.h+.01;y+=step){g.moveTo(r.x,y);g.lineTo(r.x+r.w,y)}g.stroke()}
const OFLOOR=['#ddd6c8','#b7c1cc','#d2bd9c'];
export function drawOfficeFloor(g:G,z:number){
  const F=FL[z],o=OFFICE;
  g.fillStyle=OFLOOR[z];g.fillRect(o.x,o.y,o.w,o.h);
  if(z===0){grid(g,o,2,'rgba(0,0,0,.09)');g.fillStyle='#8c3f37';g.fillRect(66.2,61.5,3.6,4.2);
    g.fillStyle='rgba(255,255,255,.12)';g.fillRect(66.5,61.8,3,3.6)}
  else if(z===1)grid(g,o,1,'rgba(255,255,255,.12)');
  else{g.strokeStyle='rgba(0,0,0,.08)';g.lineWidth=.04;g.beginPath();for(let y=o.y;y<o.y+o.h;y+=.4){g.moveTo(o.x,y);g.lineTo(o.x+o.w,y)}g.stroke()}
  if(z===1){g.fillStyle='rgba(120,190,220,.18)';g.fillRect(74.2,58.2,7.5,7.5)}
  text(g,String(z+1),79.6,56,3.2,'rgba(0,0,0,.07)');
  drawLift(g,CAR,z);
}
export const doorOpen=(l:Lift,z:number)=>Math.abs(l.z-z)<.01?l.door:0;
export const doorHalf=(l:Lift,o:number)=>l.dr.w/2*(1-o*.92);
function drawLift(g:G,l:Lift,z:number){
  g.fillStyle='rgba(240,182,58,.35)';g.fillRect(l.x+.3,l.y+2.4,1.6,1.1);
  text(g,'LIFT',l.x+1.1,l.y+2.95,.42,'rgba(40,44,52,.7)');
  g.fillStyle='#1b1d21';g.fillRect(l.x,l.y,l.w,l.h+.2);
}
export function drawTowerFloor(g:G,z:number){
  if(z>TTOP)return;
  const t=TOWER;
  g.fillStyle='#cdbfa6';g.fillRect(t.x,t.y,t.w,t.h);                          // flats
  if(z===MYFLAT.z){const m=MYRECT;
    g.fillStyle='#d9c8a4';g.fillRect(m.x,m.y,m.w,m.h);
    g.strokeStyle='rgba(0,0,0,.07)';g.lineWidth=.04;g.beginPath();for(let x=m.x;x<m.x+m.w;x+=.35){g.moveTo(x,m.y);g.lineTo(x,m.y+m.h)}g.stroke();
    g.fillStyle='#dfe7ea';g.fillRect(28.2,56,2,2.8);grid(g,{x:28.2,y:56,w:2,h:2.8},.4,'rgba(0,0,0,.08)');
    g.fillStyle='#a9584a';g.fillRect(29.4,59.5,1.6,2.6);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(29.55,59.65,1.3,2.3)}
  g.fillStyle='#8e98a3';g.fillRect(22.3,54,23.4,1.8);                          // corridor carpet
  g.fillStyle='rgba(255,255,255,.1)';g.fillRect(22.3,54.75,23.4,.3);
  g.fillStyle='#b8b7b2';g.fillRect(30,50.6,8.2,3.2);                           // stair core
  if(z===0){g.fillStyle='#ddd6c8';g.fillRect(28.2,54,11.8,11.7);grid(g,{x:28.2,y:54,w:11.8,h:11.7},1.5,'rgba(0,0,0,.08)');
    g.fillStyle='#3d5a80';g.fillRect(32.6,62.5,2.8,3.2);text(g,'MAIL',29.6,59.1,.36,'rgba(40,44,52,.6)',Math.PI/2)}
  text(g,String(z+1),44.4,54.9,1.2,'rgba(255,255,255,.4)');
  for(const d of FLATDOORS)if(d.z===z)text(g,d.name,d.x+.5,d.y<55?54.42:55.4,.3,d.mine?'#fff':'rgba(255,255,255,.6)');
  drawLift(g,TLIFT,z);
}
export const SUBCOVER={x:109.5,y:93.3,w:4,h:9.2};
export function drawConcourse(g:G){
  const F=FL[-1],c=CONC;
  for(const st of STATIONS){
    if(!vis(st.dx+c.x,c.y,c.w,c.h))continue;
    g.save();g.translate(st.dx,0);
    g.fillStyle='#d3cdbf';g.fillRect(c.x,c.y,c.w,c.h);grid(g,c,1,'rgba(0,0,0,.07)');
    g.fillStyle='rgba(31,95,181,.16)';g.fillRect(121.6,102,20.4,15);
    g.fillStyle='#e7c63f';g.fillRect(110,102,3,.3);g.fillRect(127.6,112,.3,3);
    text(g,'TICKETS',116.3,103.3,.42,'rgba(40,44,52,.65)');
    text(g,'TRAINS  ›',124.6,113.5,.6,'rgba(40,44,52,.7)');
    text(g,'‹  EXIT',116,109.5,.6,'rgba(40,44,52,.7)');
    text(g,st.name.toUpperCase(),132,106.5,1.3,'rgba(31,60,110,.22)');
    g.restore();
  }
}
// What the sign over a platform edge says: where trains from here go next, and how long until one.
function trainSign(si:number,k:number){
  const j=STOPS.findIndex(s=>s.si===si&&s.k===k);
  if(j<0)return'no trains from this side';
  const e=etas()[j];
  return'to '+STATIONS[STOPS[(j+1)%STOPS.length].si].name+'  ·  '+(e===0?'boarding':e===null?'delayed':Math.ceil(e)+' s');
}
export function drawPlatform(g:G){
  const F=FL[-2],p=PLAT,x0=VB.x0-1,w=VB.x1-VB.x0+2;
  g.fillStyle='#0f1013';g.fillRect(x0,VB.y0-1,w,VB.y1-VB.y0+2);
  for(const st of STATIONS)if(vis(st.dx+96,103.3,98,20.4)){g.fillStyle='#24262b';g.fillRect(st.dx+96,103.3,98,20.4)}
  // the two running tunnels
  for(const ty of[103.3,120.2]){
    g.fillStyle='#2a2c31';g.fillRect(x0,ty,w,3.5);
    g.strokeStyle='#4a4038';g.lineWidth=.22;g.beginPath();for(let x=Math.floor(x0/.7)*.7;x<x0+w;x+=.7){g.moveTo(x,ty+.55);g.lineTo(x,ty+2.95)}g.stroke();
    g.strokeStyle='#9aa0a8';g.lineWidth=.08;g.beginPath();for(const o of[1.03,2.47]){g.moveTo(x0,ty+o);g.lineTo(x0+w,ty+o)}g.stroke();
    g.fillStyle='#ffe9a8';for(let x=Math.floor(x0/10)*10;x<x0+w;x+=10)g.fillRect(x,ty===103.3?ty:ty+3.38,.7,.12);
  }
  STATIONS.forEach((st,si)=>{
    if(!vis(st.dx+96,103,98,21))return;
    g.save();g.translate(st.dx,0);
    g.fillStyle='#c5c3bd';g.fillRect(p.x,p.y,p.w,p.h);grid(g,p,1,'rgba(0,0,0,.06)');
    g.fillStyle='#e7c63f';g.fillRect(p.x,p.y+.2,p.w,.4);g.fillRect(p.x,p.y+p.h-.6,p.w,.4);
    text(g,'‹  EXIT',143,113.5,.6,'rgba(40,44,52,.7)');
    text(g,st.name.toUpperCase(),164,113.5,1.6,'rgba(0,0,0,.13)');
    for(let k=0;k<2;k++){const ty=k?118.7:108.3;
      for(const sx of[118,150,178])text(g,trainSign(si,k),sx,ty,.5,'rgba(40,44,52,.75)')}
    g.restore();
  });
}
