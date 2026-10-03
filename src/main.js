import * as THREE from 'three';
import './style.css';

// ---------------------------------------------------------------- utilities
// All world coordinates are metres. z is the floor level as a float (0 = street).
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=mulberry32(11);
const rr=(a,b)=>a+(b-a)*rnd();
const pick=a=>a[Math.floor(rnd()*a.length)];
const inRect=(px,py,r)=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h;
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;
  const t=clamp(((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy||1));return Math.hypot(px-x1-dx*t,py-y1-dy*t)}

// Walkable surface regions: the city, and the harbour at the far end of the subway line.
const REGIONS=[{x0:0,y0:0,x1:200,y1:160},{x0:560,y0:42,x1:680,y1:130},{x0:1052,y0:-8,x1:1168,y1:106}];
const regionAt=x=>x<400?0:x<900?1:2;   // which stop of the line a given x belongs to
const R=0.25;                       // player radius (shoulder width 0.5 m)
const VIEW_OUT=34, VIEW_IN=12;      // metres visible across the short screen side
const SPEED_IN=3.6;                 // m/s for scripted input (tests); the mouse itself has no speed limit

// ---------------------------------------------------------------- colliders
const COL=[];
function box(x,y,w,h,za=-.5,zb=.5,opq=false,pen){COL.push({x,y,w,h,za,zb,opq,pen})}   // opq: blocks line of sight
function circ(cx,cy,r,za=-.5,zb=.5){COL.push({cx,cy,r,za,zb})}

// ---------------------------------------------------------------- floors
const FL={};
for(let z=-2;z<=9;z++)FL[z]={z,walls:[],furn:[],wins:[]};
function fwall(z,x,y,w,h,opq=true){FL[z].walls.push({x,y,w,h});box(x,y,w,h,z-.5,z+.5,opq)}
function ffurn(z,x,y,w,h,color,o={}){FL[z].furn.push({x,y,w,h,color,...o});if(!o.ghost)box(x,y,w,h,z-.5,z+.5,!!o.opq)}
function fround(z,cx,cy,r,color,o={}){FL[z].furn.push({cx,cy,r,color,...o});if(!o.ghost)circ(cx,cy,r,z-.5,z+.5)}

// Stairs: a rectangle; dir is the direction of ascent. The player's z is a pure
// function of how far along the rectangle they are standing.
const STAIRS=[];
function addStair(x,y,w,h,dir,zl,zh){
  const s={x,y,w,h,dir,zl,zh,sides:[]};STAIRS.push(s);
  const t=.2,vert=dir==='N'||dir==='S';
  const side=(X,Y,Wd,Hd)=>{s.sides.push({x:X,y:Y,w:Wd,h:Hd});box(X,Y,Wd,Hd,zl-.5,zh+.5,true)};
  if(vert){side(x-t,y-t,t,h+2*t);side(x+w,y-t,t,h+2*t)}else{side(x-t,y-t,w+2*t,t);side(x-t,y+h,w+2*t,t)}
  const ends={N:[x,y-t,w,t],S:[x,y+h,w,t],W:[x-t,y,t,h],E:[x+w,y,t,h]};
  const opp={N:'S',S:'N',E:'W',W:'E'};
  // The ends block movement and sight from the level that can't use them, but
  // are not drawn: from on the stairs they would look like a wall across the exit.
  box(...ends[dir],zl-.5,zl+.5,true,0);        // top end, for whoever is on the lower level
  box(...ends[opp[dir]],zh-.5,zh+.5,true,0);   // bottom end, for whoever is on the upper level
  s.rail=ends[opp[dir]];
  return s;
}
function stairT(s,px,py){switch(s.dir){
  case'N':return(s.y+s.h-py)/s.h;case'S':return(py-s.y)/s.h;
  case'W':return(s.x+s.w-px)/s.w;default:return(px-s.x)/s.w}}

// ---------------------------------------------------------------- office building
const OFFICE={x:54,y:46,w:28,h:20};
const DOORPT={x:68,y:65.85};
// Lifts: a 2.2 m car whose door faces south. `door` is how far open it is (0..1).
const LIFTS=[];
function addLift(x,y,zmin,zmax){
  const l={x,y,w:2.2,h:2.2,dr:{x:x+.5,y:y+2.2,w:1.2,h:.2},call:{x:x-.7,y:y+2.4,w:3.6,h:3.2},zmin,zmax,z:zmin,door:0,target:null,src:null,moving:false,want:null,openT:0};
  for(let z=zmin;z<=zmax;z++){fwall(z,x-.2,y-.3,2.6,.3);fwall(z,x-.2,y-.3,.2,2.7);fwall(z,x+2.2,y-.3,.2,2.7);fwall(z,x-.2,y+2.2,.7,.2);fwall(z,x+1.7,y+2.2,.7,.2)}
  LIFTS.push(l);return l;
}
const CAR=addLift(70,46.6,0,2);
// Outer wall with windows: solid to walk into, but sight passes through the panes.
const WIN={first:2,step:3,len:1.9};
function winStarts(z,horiz,south){const o=OFFICE,a=horiz?o.x:o.y,n=horiz?o.w:o.h,r=[];
  for(let v=a+WIN.first;v<a+n-2;v+=WIN.step)if(!(horiz&&south&&z===0&&v>=65&&v<=70))r.push(v);return r}
function owall(z,x,y,w,h){
  const rec={x,y,w,h,wins:[],len:WIN.len};FL[z].walls.push(rec);
  const horiz=w>h,a=horiz?x:y,b=a+(horiz?w:h);let c=a;
  const piece=(p,q)=>{if(q-p>.01)horiz?box(p,y,q-p,h,z-.5,z+.5,true):box(x,p,w,q-p,z-.5,z+.5,true)};
  for(const v of winStarts(z,horiz,y>OFFICE.y+1)){if(v<a||v+WIN.len>b)continue;
    rec.wins.push(v);piece(c,v);horiz?box(v,y,WIN.len,h,z-.5,z+.5):box(x,v,w,WIN.len,z-.5,z+.5);c=v+WIN.len}
  piece(c,b);
}
for(const z of[0,1,2]){
  owall(z,54,46,28,.3);owall(z,54,46,.3,20);owall(z,81.7,46,.3,20);
  if(z===0){owall(0,54,65.7,13,.3);owall(0,69,65.7,13,.3)}else owall(z,54,65.7,28,.3);
}
const stA=addStair(74,49,1.4,6,'N',0,1);
const stB=addStair(75.6,49,1.4,6,'S',1,2);
ffurn(0,75.6,49,1.4,6,'#3a3d44',{opq:1});          // solid under the upper flight
ffurn(2,74,49,1.4,6,'#22252a');            // void above the lower flight

// floor 0: lobby
ffurn(0,63,55.5,10,1.3,'#8a6a4a');                       // reception desk
fround(0,66,54.6,.3,'#3b4350',{ghost:1});fround(0,70,54.6,.3,'#3b4350',{ghost:1});
ffurn(0,55.2,58,1,3.2,'#5d6f86');ffurn(0,55.2,62,3.2,1,'#5d6f86'); // sofas
fround(0,58.6,59.6,.55,'#c9b79a');                       // coffee table
ffurn(0,80,58,1,3.2,'#5d6f86');
for(const[x,y]of[[55.1,47.1],[80.9,64.9],[55.1,64.9],[66.2,64.9],[69.8,64.9],[80.9,47.1]])fround(0,x,y,.42,'#4f8a55');
fwall(0,62,46.3,.2,5);fwall(0,54.3,53.5,4.3,.2);fwall(0,60,53.5,2.2,.2);          // back room
ffurn(0,54.6,46.6,4,.8,'#9aa0a8');ffurn(0,60.6,47,1.1,3.4,'#9aa0a8');
// floor 1: open office
for(const cx of[57,62,67])for(const cy of[51,56.5,62]){
  if(cx===67&&cy===51)continue;
  ffurn(1,cx-1.5,cy-.75,3,1.5,'#d8cdb8');
  for(const[dx,dy]of[[-.75,-1.15],[.75,-1.15],[-.75,1.15],[.75,1.15]])fround(1,cx+dx,cy+dy,.26,'#3b4350',{ghost:1});
  for(const[dx,dy]of[[-.75,-.35],[.75,-.35],[-.75,.35],[.75,.35]])ffurn(1,cx+dx-.3,cy+dy-.1,.6,.2,'#23262b',{ghost:1});
}
fwall(1,74,58,1,.2);fwall(1,76.3,58,5.4,.2);fwall(1,74,58,.2,7.7);      // meeting room
ffurn(1,76,60.6,3.6,2.4,'#8a6a4a',{rad:1.1});
for(const x of[76.6,77.8,79])for(const y of[60.1,63.5])fround(1,x,y,.26,'#3b4350',{ghost:1});
ffurn(1,55,47,5,.7,'#9aa0a8');fround(1,55.1,64.9,.42,'#4f8a55');fround(1,80.9,47.1,.42,'#4f8a55');
ffurn(1,64,46.6,4,.6,'#7b8089');
// floor 2: canteen / lounge
ffurn(2,54.6,48,1.1,9,'#8a6a4a');ffurn(2,56.9,48,.7,7,'#b9bcc2');
for(const[x,y]of[[62,50],[66,53.5],[61.5,57.5],[66.5,61],[59,62.5],[72,60],[77,62.5],[79,58]]){
  fround(2,x,y,.6,'#e3dccd');
  for(let k=0;k<4;k++)fround(2,x+Math.cos(k*1.57+.6)*1.02,y+Math.sin(k*1.57+.6)*1.02,.24,'#b5563f',{ghost:1});
}
ffurn(2,78.4,48,3,1,'#5d6f86');ffurn(2,80.5,49.4,1,3,'#5d6f86');
for(const[x,y]of[[80.9,64.9],[55.1,64.9],[69.2,49.6]])fround(2,x,y,.42,'#4f8a55');

// ---------------------------------------------------------------- subway
// One line, three stations LINE_D apart. Trains run a one-way loop: east on the south
// track, west on the north track, crossing over just before each terminus so that a
// terminus only ever uses one platform edge.
// Stations are identical boxes; everything is built at an x offset.
const LINE_D=500,TL=74,TW=2.9,TRUN=9,TDWELL=2,DOCK=108,TDW=1.3;
const STATIONS=[{dx:0,name:'Central'},{dx:LINE_D,name:'Harbor'},{dx:2*LINE_D,name:'Arena'}];
const TDOORS=[];for(let i=0;i<4;i++)for(const d of[4.2,9.3,14.3])TDOORS.push(i*18.5+d);   // door offsets along a train
const TRACKY=[103.9,120.2];   // top edge of the train on the north / south track
const EDGEY=[106.8,120];      // platform screen wall on each side
const CONC={x:104,y:102,w:38,h:15},PLAT={x:100,y:107,w:90,h:13};
function buildStation(st){
  const dx=st.dx;
  addStair(dx+110,92,3,10,'N',-1,0);       // street -> concourse
  addStair(dx+128,112,10,3,'W',-2,-1);     // concourse -> platform
  fwall(-1,dx+103.7,101.7,6.1,.3);fwall(-1,dx+113.2,101.7,29.1,.3);
  fwall(-1,dx+103.7,101.7,.3,15.6);fwall(-1,dx+142,101.7,.3,15.6);fwall(-1,dx+103.7,117,38.6,.3);
  fwall(-1,dx+120.9,102,.2,3);fwall(-1,dx+120.9,114.1,.2,2.9);
  for(let k=0;k<9;k++)ffurn(-1,dx+120.4,105+k*1.1,1.2,.3,'#8e949c',{turn:1});
  ffurn(-1,dx+120.4,114.1-.3,1.2,.3,'#8e949c');
  for(let k=0;k<3;k++)ffurn(-1,dx+114.2+k*1.5,102,1.1,.7,'#3f6fb0');
  ffurn(-1,dx+104,108,.5,3,'#e9e4d6');ffurn(-1,dx+124,102,6,.35,'#e9e4d6');
  ffurn(-1,dx+105.5,116.3,2,.6,'#7a6248');ffurn(-1,dx+109,116.3,2,.6,'#7a6248');
  fwall(-2,dx+99.7,106.8,.3,13.4);fwall(-2,dx+190,106.8,.3,13.4);
  // platform screen walls, with a gap wherever a docked train has a door
  st.screens=[];
  for(const ey of EDGEY){let c=dx+100;
    const scr=(a,b)=>{st.screens.push({x:a,y:ey,w:b-a,h:.2});box(a,ey,b-a,.2,-2.5,-1.5)};
    for(const o of TDOORS){scr(c,dx+DOCK+o);c=dx+DOCK+o+TDW}scr(c,dx+190)}
  for(let x=106;x<188;x+=9){if(x>124&&x<141)continue;
    ffurn(-2,dx+x-.3,109.6,.6,.6,'#6f757d');ffurn(-2,dx+x-.3,116.8,.6,.6,'#6f757d')}
  for(const x of[108,152,170])ffurn(-2,dx+x,113.2,2.2,.6,'#7a6248');
}
STATIONS.forEach(buildStation);
// Ticket gates: the gaps between the turnstile posts. An arm bars each one unless you hold a
// ticket (or are already inside and on your way out).
const GATES=[];
for(const st of STATIONS)for(let k=0;k<8;k++)GATES.push({cx:st.dx+121,y:105.3+k*1.1,cy:105.7+k*1.1,o:0});
const gatesOpen=()=>P.ticket||P.paid;
// The loop, as the platform edges a train calls at in order (k: 0 = north track, 1 = south track).
const STOPS=[{si:0,k:1},{si:1,k:1},{si:2,k:0},{si:1,k:0}];
const CROSS=[{a:760,b:900},{a:250,b:390}];     // train x over which it changes track: before Arena, before Central
const stopX=i=>DOCK+STATIONS[STOPS[i].si].dx;
function trainY(leg,x){ // top edge of a train at x while running from stop `leg` to the next
  const c=leg===1?CROSS[0]:leg===3?CROSS[1]:null;if(!c)return TRACKY[STOPS[leg].k];
  const t=clamp((x-c.a)/(c.b-c.a));return lerp(TRACKY[1],TRACKY[0],t*t*(3-2*t));
}
const TRAINS=['#d2452f','#2f6fd2','#e0a526'].map((col,i)=>({i,x:stopX(i),y:TRACKY[STOPS[i].k],phase:'dwell',t:0,u:0,door:0,col}));
// The solid parts of a train where it is right now: hull walls, and the doors down each side.
function trainParts(tr){
  const x=tr.x,y=tr.y,t=.15,z={za:-2.5,zb:-1.5};
  const walls=[{x,y,w:t,h:TW,...z},{x:x+TL-t,y,w:t,h:TW,...z}],doors=[[],[]];
  for(const k of[0,1]){const wy=k?y:y+TW-t;let c=x;   // the door side faces the platform: south wall on the north track
    for(const o of TDOORS){walls.push({x:c,y:wy,w:x+o-c,h:t,...z});doors[k].push({x:x+o,y:wy,w:TDW,h:t,...z});c=x+o+TDW}
    walls.push({x:c,y:wy,w:x+TL-c,h:t,...z})}
  return{walls,doors};
}
const sideOpen=(tr,k)=>tr.phase!=='run'&&STOPS[tr.i].k===k?tr.door:0;
const dockedDoor=(si,k)=>{for(const tr of TRAINS){const s=STOPS[tr.i];if(s.k===k&&s.si===si&&tr.phase!=='run')return tr.door}return 0};
// A train may leave once the edge ahead is empty and, where the loop doubles back on a
// shared stretch of track near a terminus, the train coming the other way has cleared it.
function canGo(T,tr){
  const N=STOPS.length,n=(tr.i+1)%N;
  if(T.some(o=>o!==tr&&(o.phase==='run'?(o.i+1)%N===n:o.i===n)))return false;
  if(tr.i===3)return!T.some(o=>o.phase==='run'&&o.i===0&&o.x<CROSS[1].b+TL+20);
  if(tr.i===1)return!T.some(o=>o.phase==='run'&&o.i===2&&o.x>CROSS[0].a-TL-20);
  return true;
}
// Advance a set of trains. `blocked(tr)` says whether something is standing in a doorway.
function stepTrains(T,dt,blocked){
  for(const tr of T){
    if(tr.phase==='dwell'){tr.door=Math.min(1,tr.door+dt/.8);tr.t+=dt;if(tr.t>TDWELL&&canGo(T,tr))tr.phase='closing'}   // waits with its doors open
    else if(tr.phase==='closing'){
      if(blocked(tr))tr.door=Math.min(1,tr.door+dt/.8);
      else{tr.door=Math.max(0,tr.door-dt/.8);if(tr.door===0){tr.phase='run';tr.u=0}}
    }else{
      tr.u=Math.min(1,tr.u+dt/TRUN);const u=tr.u,n=(tr.i+1)%STOPS.length;
      tr.x=lerp(stopX(tr.i),stopX(n),u*u*u*(u*(u*6-15)+10));tr.y=trainY(tr.i,tr.x);
      if(u>=1){tr.i=n;tr.y=TRACKY[STOPS[n].k];tr.phase='dwell';tr.t=0}
    }
  }
}
function updateTrains(dt){
  const under=Math.abs(P.z+2)<.01;
  const on=under?TRAINS.find(tr=>P.x>tr.x&&P.x<tr.x+TL&&P.y>tr.y&&P.y<tr.y+TW):null,ox=on&&on.x,oy=on&&on.y;
  stepTrains(TRAINS,dt,tr=>under&&Math.abs(P.y-(STOPS[tr.i].k?120.175:106.825))<R+.23&&TDOORS.some(o=>P.x>tr.x+o-R&&P.x<tr.x+o+TDW+R));   // doors never close on the player (someone sat beside one is not in the way)
  P.train=on||null;
  if(on){const dx=on.x-ox,dy=on.y-oy;P.x+=dx;P.y+=dy;CAM.x+=dx;CAM.y+=dy}   // riders are carried along, and so is the camera
}
// Seconds until the next train opens its doors at each stop of the loop, by running the timetable forward.
let etaAt=-1,ETA=[];
function etas(){
  if(Math.abs(time-etaAt)<.5)return ETA;
  etaAt=time;const T=TRAINS.map(t=>({...t,g:null,doors:null}));ETA=STOPS.map((_,j)=>T.some(t=>t.i===j&&t.phase!=='run')?0:null);
  for(let s=0;s<120&&ETA.includes(null);s+=.25){stepTrains(T,.25,()=>false);for(const t of T)if(t.phase==='dwell'&&ETA[t.i]===null)ETA[t.i]=s+.25}
  return ETA;
}
// Colliders that move or open: rebuilt every tick.
const DYN=[];
function buildDyn(){
  DYN.length=0;
  // lift doors are shut unless the car is on the player's floor and open
  for(const l of LIFTS)if(!(Math.abs(P.z-l.z)<.01&&l.door>.8))DYN.push({...l.dr,za:l.zmin-.5,zb:l.zmax+.5});
  if(MYDOOR.open<.8)DYN.push({...MYDOOR,za:MYDOOR.z-.5,zb:MYDOOR.z+.5});
  if(P.z<-.5&&P.z>-1.5){ // concourse: which side of the gates we are on, and the arms if they are locked
    const lx=P.x-STATIONS[regionAt(P.x)].dx;if(lx>121.4)P.paid=true;else if(lx<120.6)P.paid=false;
    if(!FP&&!P.ticket&&lx>114&&lx<118.5&&P.y<103.6)P.ticket=true;        // top-down: walking up to a machine buys one
    if(!gatesOpen())for(const g of GATES)if(Math.abs(g.cx-P.x)<3)DYN.push({x:g.cx-.1,y:g.y,w:.2,h:.8,za:-1.5,zb:-.5});
  }else if(P.z<=-1.5)P.paid=true;else P.paid=false;
  if(P.z>-.5&&P.z<.5&&P.x<700)for(const c of CARS){const r=carRect(c);if(Math.abs(r.x+r.w/2-P.x)<12&&Math.abs(r.y+r.h/2-P.y)<12)DYN.push({...r,za:-.5,zb:.5})}
  for(const c of DCARS)if(c!==P.car&&Math.abs(c.x-P.x)<8&&Math.abs(c.y-P.y)<8)for(const e of carEnds(c))DYN.push({cx:e.x,cy:e.y,r:CR,za:-.5,zb:.5});
  if(!BOAT.docked)DYN.push({x:622.9,y:47,w:.2,h:3,za:-.5,zb:.5});   // no boat at the berth: the gap in the rail is roped off
  DYN.push({x:623.4,y:45.6,w:.2,h:1.4,za:-.5,zb:.5},{x:623.4,y:50,w:.2,h:1.4,za:-.5,zb:.5});
  if(P.z>-1.5)return;
  for(const tr of TRAINS){if(Math.abs(tr.x+TL/2-P.x)>TL)continue;const p=trainParts(tr);DYN.push(...p.walls);for(const k of[0,1])if(sideOpen(tr,k)<.8)DYN.push(...p.doors[k])}
  STATIONS.forEach((st,si)=>{for(let k=0;k<2;k++)if(dockedDoor(si,k)<.8)
    for(const o of TDOORS)DYN.push({x:st.dx+DOCK+o,y:EDGEY[k],w:TDW,h:.2,za:-2.5,zb:-1.5})});
}

// ---------------------------------------------------------------- outdoors
const OUT={roofs:[],trees:[],lamps:[],cars:[],benches:[],planters:[],fence:[]};
const ROOFC=['#9a8f84','#8b949c','#a39a8a','#7f8791','#b0a595','#8a8f86','#9c8a80','#a6a096'];
function roofDetails(x,y,w,h){const d=[];const n=Math.floor(w*h/260)+2;
  for(let i=0;i<n;i++){const k=rnd();const dw=k<.6?rr(1.4,2.6):rr(3,5),dh=k<.6?rr(1.4,2.6):rr(1.5,2.5);
    d.push({x:rr(x+2,x+w-2-dw),y:rr(y+2,y+h-2-dh),w:dw,h:dh,c:k<.6?'#c3c6ca':'#a9d3e6'})}return d}
function building(x,y,w,h){OUT.roofs.push({x,y,w,h,color:pick(ROOFC),details:roofDetails(x,y,w,h)});box(x,y,w,h,-.5,.5,true)}
pick(ROOFC);roofDetails(-40,40,90,26);   // (lot now holds the apartment tower; keeps the random sequence stable)
building(-40,-40,80,76);building(44,-40,42,82);
building(-40,86,82,30);building(46,86,40,26);building(-40,120,66,80);building(30,116,56,84);
building(140,86,100,28);building(104,116,44,84);building(152,118,88,82);
const OFFROOF={...OFFICE,color:'#8f97a1',details:roofDetails(54,46,28,15)};
const PARK={x:104,y:0,w:96,h:66}, PLAZA={x:104,y:86,w:32,h:26};
const PATHS=[[120,66,120,50],[120,50,150,33],[172,66,172,50],[172,50,150,33],[104,32,150,33],
  [150,33,150,0],[150,33,168,24],[120,50,112,14],[112,14,150,8],[150,8,186,34],[186,34,172,50]];
const FOUNT={x:150,y:33,r:2.6}, POND={x:181,y:17,rx:11,ry:7};
circ(FOUNT.x,FOUNT.y,FOUNT.r);
function fenceSeg(x1,y1,x2,y2){OUT.fence.push([x1,y1,x2,y2]);
  box(Math.min(x1,x2)-.08,Math.min(y1,y2)-.08,Math.abs(x2-x1)+.16,Math.abs(y2-y1)+.16)}
fenceSeg(104,66,118,66);fenceSeg(122,66,170,66);fenceSeg(174,66,200,66);
fenceSeg(104,0,104,30);fenceSeg(104,34,104,66);
OUT.fence.push([104,0,200,0]);fenceSeg(200,0,200,66);
function tree(x,y,r,solid){OUT.trees.push({x,y,r,c:pick(['#3f7d45','#4a8a4c','#37703f','#558f4a'])});if(solid)circ(x,y,.3)}
for(let i=0;i<420;i++){
  const x=rr(106,238),y=rr(-38,64),inW=x<200&&y>0,r=rr(2,3.8);
  if(inW){let ok=true;
    for(const s of PATHS)if(segDist(x,y,s[0],s[1],s[2],s[3])<2.6){ok=false;break}
    if(Math.hypot(x-FOUNT.x,y-FOUNT.y)<8.5)ok=false;
    if(((x-POND.x)/(POND.rx+3))**2+((y-POND.y)/(POND.ry+3))**2<1)ok=false;
    if(!ok)continue}
  else if(x<201.5&&y>-1.5)continue;
  if(OUT.trees.some(t=>Math.hypot(t.x-x,t.y-y)<4.4))continue;
  tree(x,y,r,inW);
}
for(let i=OUT.trees.length-1;i>=0;i--)if(OUT.trees[i].x>201)OUT.trees.splice(i,1);   // (the land east of the park is built on now)
function bench(x,y,w,h){OUT.benches.push({x,y,w,h});box(x,y,w,h)}
for(let k=0;k<6;k++){const a=k*Math.PI/3+.52,bx=FOUNT.x+Math.cos(a)*6.3,by=FOUNT.y+Math.sin(a)*6.3;
  Math.abs(Math.cos(a))>.7?bench(bx-.3,by-.9,.6,1.8):bench(bx-.9,by-.3,1.8,.6)}
bench(117.6,56,.6,1.8);bench(173.8,56,.6,1.8);bench(128,30.2,1.8,.6);bench(166,13,1.8,.6);
// plaza
for(const[x,y,w,h]of[[117,88,1.4,8],[117,100,1.4,8],[126,90,6,1.4],[126,104,6,1.4]]){OUT.planters.push({x,y,w,h});box(x,y,w,h)}
bench(126.9,91.8,1.8,.6);bench(130.3,91.8,1.8,.6);bench(126.9,103,1.8,.6);bench(130.3,103,1.8,.6);
tree(129,97.5,3.2,true);tree(106.5,108,2.6,true);
circ(108.6,90.8,.12);
// street furniture
function lamp(x,y){OUT.lamps.push({x,y});circ(x,y,.12)}
for(let x=6;x<200;x+=14){if(x>82&&x<108)continue;lamp(x,69.4);lamp(x+7,82.6);
  if(Math.abs(x+7-68)>5&&!(x+7>82&&x+7<108))tree(x+7,68.9,1.9,true);
  if(!(x>82&&x<108)&&!(x>104&&x<137))tree(x,83.1,1.9,true)}
for(let y=8;y<160;y+=14){if(y>62&&y<90)continue;lamp(89.4,y);lamp(100.6,y+7>62&&y+7<90?y:y+7)}
const CARC=['#b33b34','#2f5d9b','#e4e4e2','#2b2d31','#8a8f96','#d7b23c','#3c7a57','#6b4a8a'];
function car(x,y){const c={x,y,w:rr(4.2,4.8),h:1.85,c:pick(CARC)};OUT.cars.push(c);box(c.x,c.y,c.w,c.h)}
for(const x of[6,12.5,26,39,45.5,58,74,112,125,131.5,152,165,184])car(x,70.2);
for(const x of[10,23,29.5,50,63,69.5,116,138,144.5,158,177,190])car(x,79.95);

// harbour: the surface around the second station
const HARBOR={x:560,y:42,w:120,h:88},HPLANT=[[590,78,6,1.4],[628,78,6,1.4]],BOLLARDS=[];
pick(ROOFC);roofDetails(520,56,44,90);   // (this block was split to let the avenue through; keeps the random sequence stable)
building(676,56,44,90);building(564,108,50,40);building(618,108,58,40);building(644,82,9,6);
fenceSeg(564,60,617,60);fenceSeg(623,60,676,60);fenceSeg(617,42,617,60);fenceSeg(623,42,623,47);fenceSeg(623,50,623,60);fenceSeg(617,42,623,42);   // (gap in the pier rail where the boat ties up)
for(let x=570;x<676;x+=8){if(x>612&&x<628)continue;circ(x,61,.22);BOLLARDS.push(x)}
for(const x of[580,596,640,656])bench(x,63.5,1.8,.6);
for(const x of[574,598,634,662])lamp(x,73);
for(const[x,y,w,h]of HPLANT)box(x,y,w,h);
tree(585,86,2.8,true);tree(600,98,2.4,true);tree(634,98,2.6,true);tree(664,92,3,true);
circ(608.6,90.8,.12);

// ---------------------------------------------------------------- apartment tower
// Ten identical floors: a corridor with flats on both sides, a stair core and a
// lift. Every flat door is locked except the player's own.
const TOWER={x:22,y:44,w:24,h:22},TDOORPT={x:34,y:65.85},TTOP=9,MYFLAT={z:6,id:'03'};
const MYRECT={x:28.2,y:56,w:5.8,h:9.7};
building(-40,40,58,26);
const TROOF={...TOWER,color:'#a39184',details:roofDetails(22,44,24,18)};
const TLIFT=addLift(38.4,51.6,0,TTOP);
const FLATDOORS=[];
function wallWin(z,x,y,w,h,starts,len){
  const rec={x,y,w,h,wins:[],len};FL[z].walls.push(rec);
  const horiz=w>h,a=horiz?x:y,b=a+(horiz?w:h);let c=a;
  const piece=(p,q)=>{if(q-p>.01)horiz?box(p,y,q-p,h,z-.5,z+.5,true):box(x,p,w,q-p,z-.5,z+.5,true)};
  for(const v of starts){if(v<a||v+len>b)continue;
    rec.wins.push(v);piece(c,v);horiz?box(v,y,len,h,z-.5,z+.5):box(x,v,w,len,z-.5,z+.5);c=v+len}
  piece(c,b);
}
for(let z=0;z<=TTOP;z++){
  const wx=[],wy=[];for(let v=23.5;v<44;v+=3)wx.push(v);for(let v=45.5;v<64;v+=3)wy.push(v);
  wallWin(z,22,44,24,.3,wx,1.8);wallWin(z,22,44,.3,22,wy,1.8);wallWin(z,45.7,44,.3,22,wy,1.8);
  if(z===0){wallWin(0,22,65.7,11,.3,wx,1.8);wallWin(0,35,65.7,11,.3,wx,1.8)}else wallWin(z,22,65.7,24,.3,wx,1.8);
  // corridor walls, leaving gaps for flat doors, the stair landings and the lift
  for(const[a,b]of[[22.3,25],[26,30.3],[31.5,36.5],[37.7,38.2],[40.8,43],[44,45.7]])fwall(z,a,53.8,b-a,.2);
  for(const[a,b]of z===0?[[22.3,24.7],[25.7,28.2],[40,42.4],[43.4,45.7]]:[[22.3,24.7],[25.7,30.6],[31.6,36.6],[37.6,42.4],[43.4,45.7]])fwall(z,a,55.8,b-a,.2);
  for(const x of z===0?[28,40]:[28,34,40])fwall(z,x,56,.2,9.7);
  fwall(z,29.8,44.3,.2,9.5);fwall(z,41,44.3,.2,9.5);
  fwall(z,30,50.4,11,.2);fwall(z,38.2,50.6,.2,.7);
  ffurn(z,30,44.3,11,6.1,'#2a2c31',{opq:1});       // service risers behind the core
  const flats=[['01',25,53.8],['02',24.7,55.8],['03',30.6,55.8],['04',36.6,55.8],['05',42.4,55.8],['06',43,53.8]];
  for(const[id,x,y]of flats){
    if(z===0&&(id==='03'||id==='04'))continue;      // the lobby takes their place
    const d={z,x,y,w:1,h:.2,name:(z+1)+id,mine:z===MYFLAT.z&&id===MYFLAT.id,open:0};
    FLATDOORS.push(d);if(!d.mine)box(x,y,1,.2,z-.5,z+.5,true);
  }
  // scissor stairs: flights alternate between two lanes and directions
  if(z<TTOP)z%2===0?addStair(31.6,50.8,4.8,1.3,'E',z,z+1):addStair(31.6,52.3,4.8,1.3,'W',z,z+1);
}
ffurn(0,31.6,52.3,4.8,1.3,'#3a3d44',{opq:1});ffurn(TTOP,31.6,52.3,4.8,1.3,'#3a3d44',{opq:1});
const MYDOOR=FLATDOORS.find(d=>d.mine);MYDOOR.h=0;MYDOOR.v=0;MYDOOR.grab=false;
// lobby
ffurn(0,28.3,57,.45,4.2,'#9aa0a8');ffurn(0,38.7,57.5,1,3.2,'#5d6f86');
for(const[x,y]of[[32.4,65],[35.6,65],[28.9,65],[39.4,65]])fround(0,x,y,.38,'#4f8a55');
{ // the player's flat
  const z=MYFLAT.z;
  fwall(z,30.2,56,.15,1.9);fwall(z,28.2,58.8,2.15,.15);                    // bathroom
  ffurn(z,28.35,56.15,.5,.7,'#f1f1ee');ffurn(z,29.2,56.1,.75,.45,'#f1f1ee');ffurn(z,28.3,57.65,1,1.1,'#bfe0ea');
  ffurn(z,33.35,56.3,.65,3.2,'#b9bcc2');ffurn(z,33.3,59.6,.7,.7,'#e4e6e9'); // kitchen
  fround(z,31.7,60.4,.55,'#c9a877');
  for(let k=0;k<3;k++)fround(z,31.7+Math.cos(k*2.1+1)*.95,60.4+Math.sin(k*2.1+1)*.95,.22,'#3b4350',{ghost:1});
  ffurn(z,28.35,59.6,.95,2.4,'#5d6f86');fround(z,30,60.8,.38,'#c9b79a');   // sofa, coffee table
  fwall(z,28.2,62.6,3.6,.15);fwall(z,32.9,62.6,1.1,.15);                    // bedroom
  ffurn(z,28.35,63.5,2.05,1.7,'#e8e2d6');ffurn(z,28.4,63.65,.5,1.4,'#ffffff',{ghost:1});
  ffurn(z,32.1,65,1.8,.6,'#8a6a4a');fround(z,33,64.6,.24,'#3b4350',{ghost:1});
  ffurn(z,33.05,62.8,.9,.55,'#7b6a58');fround(z,33.55,61.6,.32,'#4f8a55');
}
// ---------------------------------------------------------------- arena (third station's surface)
const FIELD={x0:1053,y0:-7,x1:1167,y1:72.5};
const WEAPONS=[
  {id:'bow',name:'Bow',c:'#8a6a4a',help:'hold click and pull back, release to shoot the other way'},
  {id:'ball',name:'Spike ball',c:'#5b616a',help:'heavy: it drags behind you and slows you down; circle the mouse to get it swinging'},
  {id:'fire',name:'Fire',c:'#d2642f',help:'click or drag to pour fuel; it lights a moment later'},
  {id:'missile',name:'Missile',c:'#6f8f3c',help:'click to launch, steer with the mouse, click again to detonate'},
  {id:'lasso',name:'Lasso',c:'#b08a4f',help:'hold click and run rings round enemies, release to snap it tight'},
  {id:'spear',name:'Spear',c:'#9aa3ad',help:'hold click and drag towards an enemy to thrust; pull back and thrust again'},
  {id:'stomp',name:'Stomp',c:'#c75d8a',help:'click to hit everything right around you'},
  {id:'orbs',name:'Orbs',c:'#4aa3c7',help:'click to drop an orb (8 at most), right-click to fling the nearby ones away from you'},
  {id:'boom',name:'Boomerang',c:'#c98a3a',help:'click to throw it the way you are heading; it comes back to wherever you are'},
  {id:'whip',name:'Whip',c:'#6b4a32',help:'it trails behind you; reverse direction sharply to crack the tip'},
  {id:'shield',name:'Shield',c:'#4f6f9a',help:'hold click to raise it: it blocks bites from the front, and charging with it rams enemies'},
  {id:'well',name:'Gravity well',c:'#5a3f8a',help:'hold click to charge a well that drags enemies in; release to burst it'},
  {id:'shot',name:'Shotgun',c:'#3a3d44',help:'click to fire a cone behind you; the recoil throws you forward'}];
WEAPONS.forEach((w,i)=>{w.x=1059+i*8.5;w.y=82});
building(1012,-48,40,196);building(1168,-48,40,196);building(1052,-48,116,40);building(1052,106,116,40);
fenceSeg(1052,74,1104,74);fenceSeg(1119,74,1168,74);
for(const[x,y]of[[1060,88],[1160,88],[1060,100],[1160,100]])lamp(x,y);
circ(1108.6,90.8,.12);

// ---------------------------------------------------------------- surfaces
// Two kinds of ground change how you move: the ice rink on the harbour square (you keep your
// momentum and can only nudge it) and the park pond (shallow enough to wade, slowly).
const RINK={x:566.5,y:89.5,w:29,h:17},RINKB=[];
for(const[x,y,w,h]of[[566.3,89.3,11.7,.2],[584,89.3,11.7,.2],[566.3,106.5,29.4,.2],[566.3,89.3,.2,17.4],[595.5,89.3,.2,17.4]]){RINKB.push({x,y,w,h});box(x,y,w,h)}
function surfaceAt(x,y,z){
  if(z!==0)return null;if(inRect(x,y,RINK))return'ice';
  const dx=(x-POND.x)/POND.rx,dy=(y-POND.y)/POND.ry;return dx*dx+dy*dy<1?'water':null;
}

// ---------------------------------------------------------------- harbour road
// The avenue runs on east from the park to the harbour square: 360 m of street with a
// building line on both sides and three dead-end alleys.
{const cr=mulberry32(31);
  fenceSeg(200,114,200,118);
  building(520,20,44,46);building(520,86,44,60);
  const row=(x0,x1,north)=>{let x=x0;while(x<x1-.1){let w=22+Math.floor(cr()*24);if(x1-x-w<18)w=x1-x;const d=32+Math.floor(cr()*16);building(x,north?66-d:86,w,d);x+=w}};
  row(200.1,300,true);row(308,430,true);row(438,520,true);row(240,350,false);row(358,520,false);
  fenceSeg(300,40.4,308,40.4);fenceSeg(430,40.4,438,40.4);fenceSeg(350,111.6,358,111.6);
  const mouth=x=>(x>297&&x<311)||(x>427&&x<441)||(x>347&&x<361);
  for(let x=214;x<556;x+=14){lamp(x,69.4);lamp(x+7,82.6);if(!mouth(x+7))tree(x+7,68.9,1.9,true);if(!mouth(x))tree(x,83.1,1.9,true)}
  for(let x=206;x<548;x+=6.4)if(cr()<.42)car(x,70.2);
  for(let x=209;x<548;x+=6.4)if(cr()<.42)car(x,79.95);
}

const BUILDINGS=[
  {rect:OFFICE,door:DOORPT,roof:OFFROOF,top:2,awning:'#8c3f37',bIn:0},
  {rect:TOWER,door:TDOORPT,roof:TROOF,top:TTOP,awning:'#3d5a80',bIn:0}];
CAR.owner=BUILDINGS[0];TLIFT.owner=BUILDINGS[1];

// Seats you can sit on in first person: the loose chairs around desks and tables.
const CHAIRS=[];
for(let z=0;z<=TTOP;z++)for(const f of FL[z].furn)if(f.r!==undefined&&f.ghost&&(f.color==='#3b4350'||f.color==='#b5563f'))CHAIRS.push({x:f.cx,y:f.cy,z});
// Long seats: benches (park, plazas, quay, stations), sofas, the bed, and the seating in the
// trains. You sit wherever along them you back in, and can shuffle along once seated.
const BENCHES=[...OUT.benches.map(b=>({...b,z:0}))];
for(let z=-2;z<=TTOP;z++)for(const f of FL[z].furn)if(f.r===undefined&&!f.ghost&&(f.color==='#7a6248'||f.color==='#5d6f86'||f.color==='#e8e2d6'))BENCHES.push({x:f.x,y:f.y,w:f.w,h:f.h,z});
const TSEATS=[];for(let i=0;i<4;i++)for(const[a,b]of[[.8,3.9],[5.8,9],[10.9,14],[15.9,17.7]])for(const sy of[.15,TW-.6])TSEATS.push({x:i*TL/4+a,y:sy,w:b-a,h:.45,loose:true});
// A seat is either a spot (chair) or a stretch: `p` along its length, `q` across, in the frame
// of the train it belongs to if any.
const seatXY=st=>st.horiz===undefined?st:{x:(st.tr?st.tr.x:0)+(st.horiz?st.p:st.q),y:(st.tr?st.tr.y:0)+(st.horiz?st.q:st.p)};
// Is there something solid within r of this spot, on the player's level?
function solidAt(x,y,r){
  for(const list of[COL,DYN])for(const c of list){
    if(P.z<c.za||P.z>=c.zb)continue;
    if(c.r!==undefined){if(Math.hypot(x-c.cx,y-c.cy)<c.r+r)return true}
    else if(x>c.x-r&&x<c.x+c.w+r&&y>c.y-r&&y<c.y+c.h+r&&Math.hypot(x-clamp(x,c.x,c.x+c.w),y-clamp(y,c.y,c.y+c.h))<=r)return true}
  return false;
}
// Where to put the player's feet when they get up: off the seat towards where they are looking
// if that is clear, otherwise off whichever side of the seat is. Never through a wall.
function standSpot(st){
  const s=seatXY(st);if(!st.out)return s;
  const fx=Math.cos(P.a),fy=Math.sin(P.a),dirs=[[fx,fy]];
  if(st.horiz!==undefined){const n=st.horiz?[[0,1],[0,-1]]:[[1,0],[-1,0]];n.sort((a,b)=>(b[0]*fx+b[1]*fy)-(a[0]*fx+a[1]*fy));dirs.push(...n)}
  for(const[dx,dy]of dirs){
    const tx=s.x+dx*st.out,ty=s.y+dy*st.out;if(solidAt(tx,ty,R-.02))continue;
    let clear=true;for(let k=1;k<8&&clear;k++){const x=s.x+dx*st.out*k/8,y=s.y+dy*st.out*k/8;
      if(st.rect&&inRect(x,y,st.rect))continue;                    // still over the seat itself
      if(solidAt(x,y,0))clear=false}
    if(clear)return{x:tx,y:ty}}
  return null;
}
function seatBehind(){
  const c=Math.cos(P.a),sn=Math.sin(P.a),behind=(x,y,reach)=>{const dx=x-P.x,dy=y-P.y,d=Math.hypot(dx,dy);return d<reach&&dx*c+dy*sn<-.45*d};
  const ch=CHAIRS.find(q=>q.z===P.z&&behind(q.x,q.y,.62));if(ch)return{x:ch.x,y:ch.y,out:0};
  const stretch=(r,tr)=>{const ox=tr?tr.x:0,oy=tr?tr.y:0,horiz=r.w>r.h,half=Math.min(r.w,r.h)/2,e=Math.min(.3,Math.max(r.w,r.h)/2);
    const min=(horiz?r.x:r.y)+e,max=(horiz?r.x+r.w:r.y+r.h)-e,p=clamp(horiz?P.x-ox:P.y-oy,min,max),q=horiz?r.y+r.h/2:r.x+r.w/2;
    return behind(ox+(horiz?p:q),oy+(horiz?q:p),half+R+.25)?{p,q,horiz,min,max,tr,rect:tr?null:r,out:r.loose?.45:half+R+.07}:null};
  for(const b of BENCHES)if(b.z===P.z){const st=stretch(b,null);if(st)return st}
  if(P.train)for(const r of TSEATS){const st=stretch(r,P.train);if(st)return st}
  return null;
}

// ---------------------------------------------------------------- state
const P={car:null,vx:0,vy:0,boat:null,ticket:false,paid:false,x:68,y:68.2,z:0,a:-Math.PI/2,lift:null,train:null,walk:0};
let view=VIEW_OUT,indoor=0,bIn=0,time=0,pendingBtn=null;
// The player's position is kept across page loads. Only places that will still make sense
// later are saved: not the inside of a lift or a train, which will have moved on.
const SAVE='ctg.position.v1';
try{const v=JSON.parse(localStorage.getItem(SAVE)||'null');
  if(v&&[v.x,v.y,v.z,v.a].every(Number.isFinite)&&v.z>=-2&&v.z<=9){P.x=v.x;P.y=v.y;P.z=v.z;P.a=v.a;P.ticket=!!v.t}}catch(_){}
// A save made while stuck inside someone else's flat (an old bug) is put back in the corridor.
if(Number.isInteger(P.z)&&P.z>=0&&P.z<=TTOP&&inRect(P.x,P.y,TOWER)){
  const hall=P.y>53.8&&P.y<56,core=P.x>30&&P.x<41&&P.y>50.4&&P.y<=53.8,home=P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT),lobby=P.z===0&&P.x>28&&P.x<40.2&&P.y>=56;
  if(!hall&&!core&&!home&&!lobby){P.x=34;P.y=54.9}
}
let savedAt=0;
function savePosition(){
  if(P.lift||P.train||P.boat)return;
  try{localStorage.setItem(SAVE,JSON.stringify({x:+P.x.toFixed(3),y:+P.y.toFixed(3),z:+P.z.toFixed(4),a:+P.a.toFixed(3),t:P.ticket}))}catch(_){}
}
// Forget the saved spot and go back to where a new game starts.
function resetSave(){
  try{localStorage.removeItem(SAVE)}catch(_){}
  P.x=68;P.y=68.2;P.z=0;P.a=-Math.PI/2;P.lift=P.train=P.sit=P.boat=P.car=null;for(const c of DCARS){Object.assign(c,c.home);c.vx=c.vy=0}P.ticket=false;pitch=0;CAM.x=P.x;CAM.y=P.y;A.kx=A.ky=0;A.hp=100;equip(null);
}
addEventListener('pagehide',savePosition);document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition()});
// Mouse / finger travel since the last tick, in CSS pixels. input.override is a scripted direction for tests.
const input={dx:0,dy:0,override:null};
const keys=new Set();
let FP=false,pitch=0,eyeH=1.65;                // first-person mode: P.a is the heading, pitch the look up/down
const CAM={x:P.x,y:P.y};

// ---------------------------------------------------------------- traffic
// The demo region ends in barriers across the sidewalks only; the roads run on through.
const BARRIERS=[[-.6,66,.6,4],[-.6,82,.6,4],[200,66,.6,4],[200,82,.6,4],[86,-.6,4,.6],[100,-.6,4,.6],[86,160,4,.6],[100,160,4,.6]];
// Four lanes through one signalled crossroads. `c` is the lane's centre line, `stop` where the
// front of a car waits. Group 0 is the avenue, group 1 the cross street.
const LANES=[{ax:'x',dir:1,c:77.8,stop:85.4,sig:0,a:-60,b:558},{ax:'x',dir:-1,c:74.2,stop:104.6,sig:0,a:-60,b:558},
  {ax:'y',dir:1,c:92.5,stop:65.4,sig:1,a:-60,b:220},{ax:'y',dir:-1,c:97.5,stop:86.6,sig:1,a:-60,b:220}];
const SIG_T=26;
function sigState(g){const t=time%SIG_T;return g===0?(t<12?'g':t<14?'y':'r'):(t<15?'r':t<23?'g':t<25?'y':'r')}
const CARS=[];
{const tr=mulberry32(21);LANES.forEach((ln,li)=>{const n=ln.ax==='x'?7:3;
  for(let i=0;i<n;i++)CARS.push({ln,s:ln.a+(i+tr()*.5)*(ln.b-ln.a)/n,v:8,len:4.3+tr()*.5,col:CARC[Math.floor(tr()*CARC.length)]})})}
const carRect=c=>c.ln.ax==='x'?{x:c.s-c.len/2,y:c.ln.c-.92,w:c.len,h:1.84}:{x:c.ln.c-.92,y:c.s-c.len/2,w:1.84,h:c.len};
// Things a driver brakes for besides lights and the car in front: [x,y] spots on the road.
function roadUsers(){const u=[];if(P.z===0&&P.x<700)u.push(P);if(typeof PEDS!=='undefined')for(const q of PEDS)if(q.on)u.push(q);return u}
function updateTraffic(dt){
  const users=roadUsers();
  for(const c of CARS){const ln=c.ln,d=ln.dir,front=c.s+d*c.len/2;
    let free=1e9;                                                       // clear road ahead of the bumper, metres
    for(const o of CARS)if(o!==c&&o.ln===ln){const g=(o.s-c.s)*d-(o.len+c.len)/2;if(g>-1&&g<free)free=g-1.6}
    if(ln===LANES[0])free=Math.min(free,ln.b-c.s);                      // road ends: slow to the turning place
    if(c.turn>0)free=0;
    const st=sigState(ln.sig),ds=(ln.stop-front)*d;
    if(ds>-.5&&(st==='r'||(st==='y'&&ds>c.v*c.v/12)))free=Math.min(free,ds-.4);
    for(const u of users){const along=((ln.ax==='x'?u.x:u.y)-front)*d,lat=Math.abs((ln.ax==='x'?u.y:u.x)-ln.c);
      if(lat<1.7&&along>-1&&along<40)free=Math.min(free,along-1.6)}
    const want=Math.min(11,Math.sqrt(2*5*Math.max(0,free)));            // the speed it could still stop from
    c.v+=clamp(want-c.v,-12*dt,3*dt);if(c.v<.05&&want<.05)c.v=0;
    c.s+=d*c.v*dt;
    if(ln.ax==='x'){ // the avenue is a loop: turn round at the harbour end, and (out of sight) at the west end
      if(d>0&&c.s>=ln.b-.05){if(CARS.some(o=>o.ln===LANES[1]&&o.s>ln.b-9)){c.s=ln.b-.05;c.v=0}else{c.ln=LANES[1];c.s=ln.b;c.v=0;c.turn=1}}else if(d<0&&c.s<ln.a){c.ln=LANES[0];c.s=ln.a}
      if(c.turn>0)c.turn=Math.max(0,c.turn-dt/1.6);
    }else if(d>0&&c.s>ln.b)c.s-=ln.b-ln.a;else if(d<0&&c.s<ln.a)c.s+=ln.b-ln.a;
  }
}

// ---------------------------------------------------------------- pedestrians
// People walk a small network of sidewalk and park-path points. `x` marks a way out of the
// district (they leave and someone else arrives), and crossings wait for the lights.
const PN={wn:[2,68,'x'],t:[34,68],o:[68,68],nw:[88,68],ne:[102,68],g1:[120,68],g2:[172,68],en:[198,68],
  ws:[2,84,'x'],sw:[88,84],se:[102,84],pl:[111.5,84],es:[198,84],a1:[304,68],a1x:[304,43,'x'],a2:[434,68],a2x:[434,43,'x'],b1:[354,84],b1x:[354,109,'x'],hn:[561,68],hs:[561,84],hq:[590,66],hqe:[660,66],hsq:[600,84],hsub:[611.5,91,'x'],nn:[88,2,'x'],ne2:[102,2,'x'],wg:[102,32],ss:[88,158,'x'],ss2:[102,158,'x'],
  td:[34,66.3,'x'],od:[68,66.3,'x'],sub:[111.5,91,'x'],p1:[120,50],p2:[172,50],fw:[143.5,36.5],fe:[156.5,36.5],fn:[150,26.5],pn:[150,6]};
const PE=[['wn','t'],['t','o'],['o','nw'],['nw','ne',1],['ne','g1'],['g1','g2'],['g2','en'],['ws','sw'],['sw','se',1],['se','pl'],['pl','es'],
  ['nn','nw'],['nw','sw',0],['sw','ss'],['ne2','wg'],['wg','ne'],['ne','se',0],['se','ss2'],['t','td'],['o','od'],['pl','sub'],
  ['en','a1'],['a1','a2'],['a2','hn'],['a1','a1x'],['a2','a2x'],['es','b1'],['b1','hs'],['b1','b1x'],['hn','hq'],['hq','hqe'],['hq','hsq'],['hs','hsq'],['hsq','hsub'],
  ['g1','p1'],['p1','fw'],['g2','p2'],['p2','fe'],['fw','fe'],['fw','fn'],['fe','fn'],['fn','pn'],['wg','fw']];   // third item: the signal group whose traffic the crossing cuts across
const PADJ={};for(const k in PN)PADJ[k]=[];
for(const[a,b,x]of PE){const d=Math.hypot(PN[a][0]-PN[b][0],PN[a][1]-PN[b][1]);PADJ[a].push({to:b,d,x});PADJ[b].push({to:a,d,x})}
const PEXITS=Object.keys(PN).filter(k=>PN[k][2]),PSEATS=OUT.benches.filter(b=>b.x<700).map(b=>({x:b.x+b.w/2,y:b.y+b.h/2,near:Object.keys(PN).reduce((m,k)=>Math.hypot(PN[k][0]-b.x,PN[k][1]-b.y)<Math.hypot(PN[m][0]-b.x,PN[m][1]-b.y)?k:m),taken:false}));
function pedPath(a,b){ // shortest way through the network
  const dist={[a]:0},prev={},todo=new Set(Object.keys(PN));
  while(todo.size){let u=null;for(const k of todo)if(dist[k]!==undefined&&(u===null||dist[k]<dist[u]))u=k;if(u===null||u===b)break;todo.delete(u);
    for(const e of PADJ[u])if(dist[e.to]===undefined||dist[u]+e.d<dist[e.to]){dist[e.to]=dist[u]+e.d;prev[e.to]=u}}
  const path=[b];while(path[0]!==a&&prev[path[0]])path.unshift(prev[path[0]]);return path;
}
// May someone step off the kerb now? Only while the traffic they would cross has a red with enough of it left.
function mayCross(g,len){const t=time%SIG_T,need=(len-4)/1.4+1;   // (the road itself is 4 m narrower than kerb-node to kerb-node)
 return g===0?(t>=14.3&&t+need<SIG_T+.3):(t>=25.3||t+need<14.7)}
const prng=mulberry32(77),PEDS=[];
function pedGoal(q){
  if(prng()<.3){const free=PSEATS.filter(s=>!s.taken);if(free.length){const st=free[Math.floor(prng()*free.length)];st.taken=true;q.seat=st;q.path=pedPath(q.at,st.near);return}}
  let d;do{d=PEXITS[Math.floor(prng()*PEXITS.length)]}while(d===q.at);q.seat=null;q.path=pedPath(q.at,d);
}
for(let i=0;i<46;i++){const at=Object.keys(PN)[Math.floor(prng()*Object.keys(PN).length)];
  const q={at,x:PN[at][0],y:PN[at][1],sp:1.15+prng()*.5,off:(prng()-.5)*1.8,sit:0,on:false,a:0,col:['#3b5b8a','#8a3b3b','#3f7d5a','#6b6f78','#a0763a','#5a3f8a','#2f3138','#b8a070'][i%8]};
  pedGoal(q);PEDS.push(q)}
function updatePeds(dt){
  for(const q of PEDS){
    if(q.sit>0){q.sit-=dt;if(q.sit<=0){q.seat.taken=false;q.seat=null;pedGoal(q)}continue}
    let tx,ty,edge=null;
    if(q.path.length>1){const n=PN[q.path[1]],a=PN[q.at];edge=PADJ[q.at].find(e=>e.to===q.path[1]);
      const dx=n[0]-a[0],dy=n[1]-a[1],L=Math.hypot(dx,dy)||1,o=edge.x===undefined?q.off:q.off*.6;tx=n[0]-dy/L*o;ty=n[1]+dx/L*o;   // keep to one side of the path
      if(edge.x!==undefined&&!q.on){if(!mayCross(edge.x,L)){q.wait=true;continue}q.on=true}}
    else if(q.seat){tx=q.seat.x;ty=q.seat.y}
    else{ // reached a way out: someone new arrives somewhere else
      q.at=PEXITS[Math.floor(prng()*PEXITS.length)];q.x=PN[q.at][0];q.y=PN[q.at][1];pedGoal(q);continue}
    q.wait=false;
    const dx=tx-q.x,dy=ty-q.y,d=Math.hypot(dx,dy),st=q.sp*(q.on?1.25:1)*dt;
    if(d<=st+.05){q.x=tx;q.y=ty;
      if(q.path.length>1){q.at=q.path[1];q.path.shift();q.on=false}else{q.sit=8+prng()*18}}
    else{q.x+=dx/d*st;q.y+=dy/d*st;q.a=Math.atan2(dy,dx)}
    if(P.z===0){const rr=P.car?1.9:.55,ex=q.x-P.x,ey=q.y-P.y,e=Math.hypot(ex,ey);if(e<rr&&e>1e-6){q.x+=ex/e*(rr-e);q.y+=ey/e*(rr-e)}}   // step round the player (or get out of the way of their car)
  }
}

// ---------------------------------------------------------------- driving
// Two cars you can take. You get in through the driver's door: open it, then back into the
// seat as with any chair (top-down, the door opens as you walk up and you step in). Top-down,
// the pointer leads and the car follows it; in first person it is W/S and A/D. Grip depends on the ground, so ice and the pond matter.
const DCARS=[{x:21.5,y:71.15,a:0,col:'#e0a526'},{x:652,y:76,a:Math.PI,col:'#3f9a63'}].map(c=>({...c,door:0,dv:0,grab:false,exiting:false,vx:0,vy:0,thr:0,st:0,steer:0,ax:0,ay:0,len:4.4,home:{x:c.x,y:c.y,a:c.a}}));
const carEnds=c=>{const fx=Math.cos(c.a)*1.3,fy=Math.sin(c.a)*1.3;return[{x:c.x+fx,y:c.y+fy},{x:c.x,y:c.y},{x:c.x-fx,y:c.y-fy}]};   // the car as three discs of radius CR along its length
const CR=.95;
const carSpeed=c=>Math.hypot(c.vx,c.vy);
// Car-local coordinates: lx forward, ly to the right. The driver sits left of centre; the
// door is hinged at its front edge and swings out from the left side.
const carPt=(c,lx,ly)=>({x:c.x+lx*Math.cos(c.a)-ly*Math.sin(c.a),y:c.y+lx*Math.sin(c.a)+ly*Math.cos(c.a)});
const SEAT=[-.05,-.38],HINGE=[.55,-.94],DOOR_L=1.1,DOOR_SWING_CAR=1.2;
function carDoorSeg(c){const t=c.door*DOOR_SWING_CAR,h=carPt(c,HINGE[0],HINGE[1]),e=carPt(c,HINGE[0]-Math.cos(t)*DOOR_L,HINGE[1]-Math.sin(t)*DOOR_L);return{h,e}}
// The car whose door the crosshair is on (first person), from outside or from the driver's seat.
function aimedCarDoor(){
  if(!FP||P.z!==0)return null;
  const ex=P.car?carPt(P.car,SEAT[0]-.2,SEAT[1]).x:P.x,ey=P.car?carPt(P.car,SEAT[0]-.2,SEAT[1]).y:P.y,dx=Math.cos(P.a),dy=Math.sin(P.a);
  for(const c of DCARS){if(P.car&&P.car!==c)continue;
    const{h,e}=carDoorSeg(c),ux=e.x-h.x,uy=e.y-h.y,den=dx*uy-dy*ux;if(Math.abs(den)<1e-6)continue;
    const t=((h.x-ex)*uy-(h.y-ey)*ux)/den,u=((h.x-ex)*dy-(h.y-ey)*dx)/den;if(t<.05||t>2.4||u<0||u>1)continue;
    const hgt=(P.car?1.2:eyeH)+t*Math.tan(pitch);if(hgt>.2&&hgt<1.5)return c}
  return null;
}
// A held car door follows the mouse the way it looks on screen: whichever way its free edge
// would move across the view, dragging that way opens it.
function carDoorMouse(c,dx,dy){
  const t=.6,lx=Math.sin(t),ly=-Math.cos(t),wx=lx*Math.cos(c.a)-ly*Math.sin(c.a),wy=lx*Math.sin(c.a)+ly*Math.cos(c.a);   // which way the edge travels, mid-swing
  const side=wx*-Math.sin(P.a)+wy*Math.cos(P.a);
  c.dv+=clamp((Math.abs(side)>.15?dx*Math.sign(side):dy)*.008,-.14,.14);   // (seen end-on, pulling the mouse back opens it)
}
function enterCar(c){P.car=c;P.sit=null;c.ax=c.ay=0;c.exiting=false;if(FP){P.a=c.a;pitch=0}}
function exitCar(){
  const c=P.car;if(!c||carSpeed(c)>2.5)return;
  for(const side of[-1.75,1.75]){const q=carPt(c,-.3,side);          // out of the driver's door if there is room
    if(!solidAt(q.x,q.y,R)){P.car=null;P.x=q.x;P.y=q.y;c.vx=c.vy=c.thr=0;return}}
}
// Backing towards an open driver's door (first person) / stepping in at one (top-down).
function carSeatBehind(){
  const fx=Math.cos(P.a),fy=Math.sin(P.a);
  return DCARS.find(c=>{if(c.door<.6||P.z!==0)return false;const q=carPt(c,SEAT[0],SEAT[1]),dx=q.x-P.x,dy=q.y-P.y,d=Math.hypot(dx,dy);return d<1.45&&dx*fx+dy*fy<-.3*d})||null;
}
const carStepIn=()=>P.z!==0||P.boat||P.sit?null:DCARS.find(c=>{const q=carPt(c,SEAT[0],SEAT[1]);return c.door>.6&&Math.hypot(q.x-P.x,q.y-P.y)<1.03})||null;
const atCarDoor=c=>{const q=carPt(c,-.1,-1.5);return P.z===0&&!P.car&&Math.hypot(q.x-P.x,q.y-P.y)<1.6};
function updateCarDoors(dt){
  for(const c of DCARS){
    if(!FP){ // top-down: the door opens for you as you come up to it, and shuts behind you
      c.grab=false;c.dv=0;
      const want=P.car===c?(c.exiting?1:0):atCarDoor(c)?1:0;c.door=want?Math.min(1,c.door+dt/.3):Math.max(0,c.door-dt/.3);
      if(c.exiting&&P.car===c&&c.door>.6)exitCar();
      if(P.car!==c)c.exiting=false;
      continue}
    if(c.grab){if(!A.down)c.grab=false}else if(A.click&&aimedCarDoor()===c)c.grab=true;
    if(P.car===c&&carSpeed(c)>2)c.dv-=8*dt;                           // pulling away swings it shut
    c.door+=c.dv*dt;c.dv*=Math.exp(-dt*2.2);
    if(c.door<=0){c.door=0;if(c.dv<0)c.dv=0}else if(c.door>=1){c.door=1;if(c.dv>0)c.dv=0}
    if(!c.grab&&c.door<.04&&c.dv<=0)c.door=0;
  }
}
const nearCar=()=>P.car||P.z!==0?null:DCARS.find(c=>Math.hypot(c.x-P.x,c.y-P.y)<4)||null;
function updateDriving(dt){
  const c=P.car;if(!c)return;
  const fx=Math.cos(c.a),fy=Math.sin(c.a),sf=surfaceAt(c.x,c.y,0),a0=c.a;
  if(P.car===c&&FP&&c.door>.6&&carSpeed(c)<1&&(c.thr>0||c.st<0)){exitCar();return}   // door open, stopped: forward or left is out of the car
  if(!FP){ // the pointer leads: steer at it, and go faster the further off it is
    const d=Math.hypot(c.ax,c.ay),want=Math.atan2(c.ay,c.ax),da=angDiff(want,c.a);
    if(d<1.6){c.thr=0;c.st=0}
    else if(Math.abs(da)<2.2){c.thr=clamp((d-1.6)/7,0,1);c.st=clamp(da*1.3,-.6,.6)}
    else{c.thr=-.6;c.st=clamp(-angDiff(want,c.a+Math.PI)*1.3,-.6,.6)}       // it is behind: back up towards it
  }
  if(c.door>.2)c.thr=0;                                                // it will not pull away with the door open
  c.steer+=clamp(c.st*(FP?.55:1)-c.steer,-2.2*dt,2.2*dt);
  let vf=c.vx*fx+c.vy*fy,vl=-c.vx*fy+c.vy*fx;
  const push=sf==='ice'?.3:1;
  if(c.thr>0)vf+=(vf<0?14:9*push)*c.thr*dt;else if(c.thr<0)vf+=(vf>0?14*push:5*push)*c.thr*dt;else vf*=Math.exp(-dt*(sf==='ice'?.15:1.3));
  vf=clamp(vf,-6,sf==='water'?4:22);if(sf==='water')vf*=Math.exp(-dt*2.5);
  vl*=Math.exp(-dt*(sf==='ice'?.5:sf==='water'?6:14));                  // sideways grip: on ice there is almost none
  c.a+=vf/2.6*Math.tan(c.steer)*dt;
  const gx=Math.cos(c.a),gy=Math.sin(c.a);c.vx=gx*vf-gy*vl;c.vy=gy*vf+gx*vl;
  c.x+=c.vx*dt;c.y+=c.vy*dt;
  // collisions: the car's discs are pushed out of anything solid at street level
  gather(c.x-4,c.y-4,c.x+4,c.y+4);
  const solids=[...NEAR.filter(o=>o.za<=0&&o.zb>0),...CARS.map(carRect),...STAIRS.filter(s=>s.zh===0)];
  for(const o of DCARS)if(o!==c)for(const e of carEnds(o))solids.push({cx:e.x,cy:e.y,r:CR});
  for(let it=0;it<3;it++)for(const e of carEnds(c))for(const o of solids){let nx,ny,pen;
    if(o.r!==undefined&&o.cx!==undefined){const dx=e.x-o.cx,dy=e.y-o.cy,d=Math.hypot(dx,dy)||1e-6;pen=CR+o.r-d;nx=dx/d;ny=dy/d}
    else{const qx=clamp(e.x,o.x,o.x+o.w),qy=clamp(e.y,o.y,o.y+o.h),dx=e.x-qx,dy=e.y-qy,d=Math.hypot(dx,dy);
      if(d<1e-6){const l=e.x-o.x,r=o.x+o.w-e.x,t=e.y-o.y,b=o.y+o.h-e.y,m=Math.min(l,r,t,b);nx=m===l?-1:m===r?1:0;ny=m===t?-1:m===b?1:0;if(nx)ny=0;pen=CR+m}else{pen=CR-d;nx=dx/d;ny=dy/d}}
    if(pen>0){c.x+=nx*pen;c.y+=ny*pen;e.x+=nx*pen;e.y+=ny*pen;const vn=c.vx*nx+c.vy*ny;if(vn<0){c.vx-=nx*vn*1.2;c.vy-=ny*vn*1.2;c.vx*=.92;c.vy*=.92}}}
  if(c.x<900){c.x=clamp(c.x,1.2,678.8);const y0=c.x<200?0:c.x<560?40:42,y1=c.x<200?160:c.x<560?112:130;c.y=clamp(c.y,y0+1.2,y1-1.2)}
  P.x=c.x;P.y=c.y;P.z=0;if(FP)P.a+=c.a-a0;
}

// ---------------------------------------------------------------- boat
// A small launch tied up at the harbour pier. Step aboard through the gap in the rail, hold
// the mouse button to take the tiller: sideways steers, forward and back is the throttle.
const BOAT={x:624.7,y:48.5,a:-Math.PI/2,v:0,rud:0,thr:0,docked:true,held:false};
const BERTH={x:624.7,y:48.5,a:-Math.PI/2},WATER={x0:569,y0:24,x1:671,y1:56.5},PIER={x:617,y:42,w:6,h:18};
function boatPlace(){const b=BOAT,q=P.boat,c=Math.cos(b.a),s=Math.sin(b.a);P.x=b.x+q.lx*c-q.ly*s;P.y=b.y+q.lx*s+q.ly*c}
function tiller(dx,dy){BOAT.rud=clamp(BOAT.rud+dx*.003,-.7,.7);BOAT.thr=clamp(BOAT.thr-dy*.003,-.4,1)}
function updateBoat(dt){
  const b=BOAT,ox=P.x,oy=P.y;
  if(!P.boat&&b.docked&&P.z===0&&P.x>623.45&&P.x<626&&P.y>45.8&&P.y<51.2){ // stepped off the pier onto the deck
    const c=Math.cos(b.a),s=Math.sin(b.a),dx=P.x-b.x,dy=P.y-b.y;P.boat={lx:dx*c+dy*s,ly:-dx*s+dy*c}}
  b.held=!!P.boat&&A.down;
  if(!b.held){b.rud*=Math.exp(-dt*4);b.thr*=Math.exp(-dt*.6)}       // let go: the tiller centres and the engine idles down
  if(b.docked){if(b.held&&Math.abs(b.thr)>.08)b.docked=false;else{b.v=0;return}}
  const a0=b.a;
  b.v+=(b.thr*7-b.v)*Math.min(1,dt*.8);b.a+=b.v*b.rud*.22*dt;
  b.x+=Math.cos(b.a)*b.v*dt;b.y+=Math.sin(b.a)*b.v*dt;
  const w=WATER;if(b.x<w.x0||b.x>w.x1||b.y<w.y0||b.y>w.y1){b.x=clamp(b.x,w.x0,w.x1);b.y=clamp(b.y,w.y0,w.y1);b.v*=.6}
  {const m=1.5,r=PIER,nx=clamp(b.x,r.x-m,r.x+r.w+m),ny=clamp(b.y,r.y-m,r.y+r.h+m);     // bump off the pier
    if(nx===b.x&&ny===b.y){const l=b.x-(r.x-m),rr=r.x+r.w+m-b.x,t=b.y-(r.y-m),k=Math.min(l,rr,t);
      if(k===l)b.x=r.x-m;else if(k===rr)b.x=r.x+r.w+m;else b.y=r.y-m;b.v*=.9}}
  if(!b.held&&Math.abs(b.v)<1.6&&Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<2.6){ // drifting in by the berth: it ties itself up
    const k=Math.min(1,dt*2.5);b.x+=(BERTH.x-b.x)*k;b.y+=(BERTH.y-b.y)*k;b.a+=angDiff(BERTH.a,b.a)*k;b.v*=1-k;
    if(Math.hypot(b.x-BERTH.x,b.y-BERTH.y)<.04&&Math.abs(angDiff(BERTH.a,b.a))<.02){b.x=BERTH.x;b.y=BERTH.y;b.a=BERTH.a;b.v=b.thr=0;b.docked=true}}
  if(P.boat){boatPlace();if(FP)P.a+=b.a-a0;CAM.x+=P.x-ox;CAM.y+=P.y-oy}   // whoever is aboard goes with it, and so does the camera
}

// ---------------------------------------------------------------- arena combat
// Top-down (mouse) mode only. Walking onto a pad takes that weapon.
const A={boom:null,whip:null,well:null,shot:null,last:null,pv:{x:0,y:0},shapes:[],hp:100,kx:0,ky:0,msg:0,ease:0,cdw:0,sp:null,orbs:[],rclick:false,cur:null,down:false,click:false,kills:0,bow:null,ball:null,fuel:1,lastDrop:null,puddles:[],arrows:[],missile:null,blast:null,lasso:null,tip:null,creatures:[]};
const crng=mulberry32(99);
const ROPE=50;                       // metres of lasso
const angDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function spawn(c){
  const k=crng();
  Object.assign(c,k<.5?{r:.5,max:35,sp:4.2,col:'#7d4fb0'}:k<.85?{r:.75,max:70,sp:3.1,col:'#3f8f5a'}:{r:1.15,max:160,sp:2.1,col:'#b0453f'});
  do{c.x=lerp(FIELD.x0+2,FIELD.x1-2,crng());c.y=lerp(FIELD.y0+2,FIELD.y1-2,crng())}while(Math.hypot(c.x-P.x,c.y-P.y)<14);
  c.hp=c.max;c.vx=c.vy=0;c.dead=0;c.flash=0;c.cd=0;c.atk=0;c.wx=c.x;c.wy=c.y;c.wt=0;
}
for(let i=0;i<14;i++){const c={};spawn(c);A.creatures.push(c)}
function hurt(c,d,kx=0,ky=0){
  if(c.dead)return;
  const k=Math.hypot(kx,ky);if(k>24){kx*=24/k;ky*=24/k}
  c.hp-=d;c.flash=.18;c.vx+=kx;c.vy+=ky;
  if(c.hp<=0){c.dead=2.5;A.kills++}
}
function inPoly(x,y,pts){let ins=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)ins=!ins}
  return ins}
// Where two rope segments cross, or null.
function segX(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;if(Math.abs(den)<1e-9)return null;
  const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;
  return t>1e-6&&t<=1&&u>=0&&u<=1?{x:a.x+rx*t,y:a.y+ry*t}:null;
}
// The closed loops in a rope path. Walks the path; each time it crosses itself the loop
// just completed is cut off and the walk carries on from the crossing.
function ropeLoops(pts){
  // an end that stops just short of the rope still counts as closing the loop
  const e=pts[pts.length-1];let near=-1,nd=1.6;
  for(let i=0;i<pts.length-8;i++){const d=Math.hypot(pts[i].x-e.x,pts[i].y-e.y);if(d<nd){nd=d;near=i}}
  if(near>=0)pts=[...pts,pts[near],pts[near+1]||pts[near]];
  const loops=[],w=[pts[0]];
  for(let k=1;k<pts.length;k++){const q=pts[k];
    for(let again=true;again;){again=false;const a=w[w.length-1];
      for(let i=w.length-3;i>=0;i--){const X=segX(a,q,w[i],w[i+1]);
        if(X){const lp=[X,...w.slice(i+1)];let ar=0;for(let m=0;m<lp.length;m++){const u=lp[m],v=lp[(m+1)%lp.length];ar+=u.x*v.y-v.x*u.y}
          if(Math.abs(ar)/2>1)loops.push(lp);
          w.length=i+1;w.push(X);again=true;break}}}
    w.push(q)}
  return loops;
}
function equip(w){A.cur=w;A.bow=A.missile=A.lasso=A.tip=null;A.sp=A.boom=A.well=null;
  A.whip=w&&w.id==='whip'?Array.from({length:9},()=>({x:P.x,y:P.y,px:P.x,py:P.y})):null;A.ball=w&&w.id==='ball'?{x:P.x,y:P.y,px:P.x,py:P.y}:null}
const inArena=()=>!FP&&P.z===0&&regionAt(P.x)===2;
// While the bow is drawn or a missile is flying, the mouse drives that instead of the player.
const mouseCaptured=()=>inArena()&&!!(A.bow||A.missile||A.sp);
function explode(){
  const m=A.missile;A.missile=null;A.blast={x:m.x,y:m.y,t:0,r:4.5};A.ease=1.3;   // the camera drifts back to the player
  for(const c of A.creatures){const dx=c.x-m.x,dy=c.y-m.y,d=Math.hypot(dx,dy);
    if(d<4.5)hurt(c,95*(1-d/4.5*.6),dx/(d||1)*20,dy/(d||1)*20)}
}
function updateArena(dt,mx,my){
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
    const b=A.ball,L=2.4,GAIN=10*dt*dt,FRIC=4*dt*dt,HAUL=9*dt*dt;
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
    const w=A.whip,SEG=.45;
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
function hurt2(c,d){c.hp-=d;if(c.hp<=0&&!c.dead){c.dead=2.5;A.kills++}}   // damage over time: no flinch

// ---------------------------------------------------------------- simulation
// Static colliders near where the player is about to be; collide() only tests these.
const NEAR=[];
function gather(x0,y0,x1,y1){
  NEAR.length=0;
  for(const c of COL){
    if(c.r!==undefined){if(c.cx+c.r<x0||c.cx-c.r>x1||c.cy+c.r<y0||c.cy-c.r>y1)continue}
    else if(c.x+c.w<x0||c.x>x1||c.y+c.h<y0||c.y>y1)continue;
    NEAR.push(c);
  }
}
function collide(){
  if(P.sit||P.boat||P.car)return;                        // seated: a bench is solid, and you are on it
  for(let it=0;it<4;it++){
    const n=NEAR.length,m=n+DYN.length;
    for(let i=0;i<m;i++){
      const c=i<n?NEAR[i]:DYN[i-n];if(P.z<c.za||P.z>=c.zb)continue;
      if(c.r!==undefined){
        const dx=P.x-c.cx,dy=P.y-c.cy,d=Math.hypot(dx,dy),m=R+c.r;
        if(d<m){if(d>1e-6){P.x+=dx/d*(m-d);P.y+=dy/d*(m-d)}else P.x+=m}
      }else{
        const nx=clamp(P.x,c.x,c.x+c.w),ny=clamp(P.y,c.y,c.y+c.h),dx=P.x-nx,dy=P.y-ny,d2=dx*dx+dy*dy;
        if(d2>=R*R)continue;
        if(d2>1e-9){const d=Math.sqrt(d2);P.x+=dx/d*(R-d);P.y+=dy/d*(R-d)}
        else{const l=P.x-c.x,r=c.x+c.w-P.x,t=P.y-c.y,b=c.y+c.h-P.y,m=Math.min(l,r,t,b);
          if(m===l)P.x=c.x-R;else if(m===r)P.x=c.x+c.w+R;else if(m===t)P.y=c.y-R;else P.y=c.y+c.h+R}
      }
    }
  }
  if(P.z>-.5){ // the edge of the world: the city, the harbour road and the harbour are one piece; the arena is its own
    if(P.x>900){const r=REGIONS[2];P.x=clamp(P.x,r.x0+R,r.x1-R);P.y=clamp(P.y,r.y0+R,r.y1-R)}
    else{P.x=clamp(P.x,R,680-R);const y0=P.x<200?0:P.x<560?40:42,y1=P.x<200?160:P.x<560?112:130;P.y=clamp(P.y,y0+R,y1-R)}}
}
function updateZ(){
  if(P.lift){if(!inRect(P.x,P.y,P.lift))P.lift=null;else{P.z=P.lift.z;return}}
  for(const l of LIFTS)if(inRect(P.x,P.y,l)&&Math.abs(P.z-l.z)<.01){P.lift=l;P.z=l.z;return}
  for(const s of STAIRS){
    if(P.z<s.zl-.01||P.z>s.zh+.01||!inRect(P.x,P.y,s))continue;
    P.z=lerp(s.zl,s.zh,clamp(stairT(s,P.x,P.y)));return;
  }
  P.z=Math.round(P.z);
}
function updateLift(l,dt){
  const d=l.dr,inside=P.lift===l,sameZ=Math.abs(P.z-l.z)<.01;
  const blocked=sameZ&&P.x>d.x-R-.05&&P.x<d.x+d.w+R+.05&&Math.abs(P.y-(d.y+.1))<R+.25;
  const f=Math.round(P.z);
  const nearCall=!FP&&!inside&&Math.abs(P.z-f)<.01&&f>=l.zmin&&f<=l.zmax&&inRect(P.x,P.y,l.call);   // top-down: walking up calls it
  l.openT-=dt;
  if(!l.moving){
    if(inside){if(pendingBtn!==null){if(pendingBtn!==l.z&&pendingBtn>=l.zmin&&pendingBtn<=l.zmax){l.target=pendingBtn;l.src='btn'}pendingBtn=null}}
    else{
      if(l.src==='btn'){l.target=null;l.src=null}
      if(nearCall){if(l.z!==f){l.target=f;l.src='call'}else l.target=null}
      if(l.want!==null){if(l.z!==l.want){l.target=l.want;l.src='call'}else l.openT=4;l.want=null}}   // first person: a hall button was pressed
  }
  const step=dt/.7;
  if(l.target!==null&&l.target!==l.z){
    if(!l.moving){
      if(blocked)l.door=Math.min(1,l.door+step);
      else{l.door=Math.max(0,l.door-step);if(l.door===0)l.moving=true}
    }else{
      const dz=l.target-l.z,s=dt*1.1;
      if(Math.abs(dz)<=s){l.z=l.target;l.moving=false;l.target=null;if(l.src==='call')l.openT=5;l.src=null}else l.z+=Math.sign(dz)*s;
    }
  }else{
    l.target=null;
    const want=inside||blocked||(nearCall&&f===l.z)||l.openT>0;
    l.door=want?Math.min(1,l.door+step):Math.max(0,l.door-step);
  }
  if(inside)P.z=l.z;
}
// The player's own front door unlocks and slides open as they walk up to it.
// Things you can press in first person by putting the crosshair on them and clicking.
// pos() gives where the thing is right now (or null if it is not on the player's level).
const PRESS=[];
function aimedPress(){
  if(!FP)return null;
  const ex=P.x,ey=Y(P.z)+eyeH,ez=P.y,cp=Math.cos(pitch),dx=Math.cos(P.a)*cp,dy=Math.sin(pitch),dz=Math.sin(P.a)*cp;let best=null,bd=2.2;
  for(const t of PRESS){const q=t.pos();if(!q)continue;
    const vx=q.x-ex,vy=q.h-ey,vz=q.y-ez,along=vx*dx+vy*dy+vz*dz;if(along<.1||along>bd)continue;
    if(Math.hypot(vx-dx*along,vy-dy*along,vz-dz*along)<t.r){bd=along;best=t}}
  return best;
}
// Lift buttons: a panel of floor buttons on the car's east wall, and a call button beside the door on every floor.
const panelOf=l=>{const n=l.zmax-l.zmin+1,cols=n>5?2:1,rows=Math.ceil(n/cols);return{n,cols,rows,pw:cols*.13,ph:rows*.11,cy:l.y+1.05,ch:1.3}};
for(const l of LIFTS){const pn=panelOf(l);
  for(let i=0;i<pn.n;i++){const f=l.zmin+i,col=i%pn.cols,row=Math.floor(i/pn.cols);
    PRESS.push({r:.05,tip:()=>'Floor '+(f+1),act:()=>{pendingBtn=f},
      pos:()=>P.lift===l?{x:l.x+l.w-.2,y:pn.cy+((col+.5)/pn.cols-.5)*pn.pw,h:Y(l.z)+pn.ch+((row+.5)/pn.rows-.5)*pn.ph}:null})}
  for(let z=l.zmin;z<=l.zmax;z++)PRESS.push({r:.09,tip:()=>'Call the lift',act:()=>{l.want=z},
    pos:()=>Math.abs(P.z-z)<.01&&P.lift!==l?{x:l.dr.x+l.dr.w+.32,y:l.y+2.43,h:Y(z)+1.1}:null});
}
for(const st of STATIONS)for(let k=0;k<3;k++)PRESS.push({r:.32,tip:()=>P.ticket?'Ticket machine  ·  you already have a ticket':'Ticket machine  ·  buy a ticket',act:()=>{P.ticket=true},
  pos:()=>P.z===-1?{x:st.dx+114.75+k*1.5,y:102.72,h:Y(-1)+1.25}:null});
// The player's front door is hinged on its west edge and swings into the flat; `open` is how far
// (0..1 of DOOR_SWING) and `h` how far the handle is turned. Top-down it opens by itself as you
// walk up. In first person you work it by hand: click the handle and drag down to turn it, then
// drag sideways to swing the door.
const DOOR_SWING=1.75,HANDLE=.84;
// Is the crosshair on the door leaf (wherever it has swung to), within arm's reach?
function aimingAtDoor(){
  const d=MYDOOR;if(!FP||Math.abs(P.z-d.z)>.01)return false;
  const a=d.open*DOOR_SWING,ux=Math.cos(a),uy=Math.sin(a),dx=Math.cos(P.a),dy=Math.sin(P.a),hx=d.x-P.x,hy=d.y+.1-P.y,den=dx*uy-dy*ux;
  if(Math.abs(den)<1e-6)return false;
  const t=(hx*uy-hy*ux)/den,sAlong=(hx*dy-hy*dx)/den;                     // along the gaze, along the door
  if(t<.05||t>2.6||sAlong<0||sAlong>d.w)return false;
  const hgt=eyeH+t*Math.tan(pitch);return hgt>0&&hgt<2.1;
}
// While the door is held: up/down works the lever, sideways leans on the door. The lever has
// to be down to unlatch a shut door; once it is ajar the lever no longer matters.
function doorMouse(dx,dy){
  const d=MYDOOR,side=P.y<d.y+.1?1:-1;                 // from inside the flat the door comes towards you instead
  d.h=clamp(d.h+dy*.006,0,1);
  if(d.open>0||d.h>=.85)d.v+=clamp(dx*.004,-.05,.05)*side;       // a heavy door: the hand can only lean on it, speed has to build
}
function updateMyDoor(dt){
  const d=MYDOOR;
  if(!FP){d.grab=false;
    const near=Math.abs(P.z-d.z)<.01&&Math.hypot(P.x-(d.x+.5),P.y-(d.y+.1))<1.5;
    d.open=near?Math.min(1,d.open+dt/.35):Math.max(0,d.open-dt/.35);d.h=0;d.v=0;return}
  if(d.grab){if(!A.down)d.grab=false}
  else if(A.click&&aimingAtDoor())d.grab=true;
  if(!d.grab)d.h=Math.max(0,d.h-dt*6);                              // let go and the lever springs back up
  d.open+=d.v*dt;d.v*=Math.exp(-dt*1.6);                            // it keeps swinging after you let go, and slows on its hinges
  if(d.open<=0){d.open=0;if(d.v<0)d.v=0}else if(d.open>=1){d.open=1;if(d.v>0)d.v=0}
  if(!d.grab&&d.open<.03&&d.v<=0)d.open=0;                          // nearly shut and not held: it clicks to
}
function updateIndoor(dt){
  // Everything here is a function of where the player stands, not of time.
  bIn=0;
  for(const b of BUILDINGS){const d=Math.hypot(P.x-b.door.x,P.y-b.door.y);
    b.bIn=P.z>.01?1:P.z<-.01?0:inRect(P.x,P.y,b.rect)?clamp(.5+d/8):clamp(.5-d/8);bIn=Math.max(bIn,b.bIn)}
  indoor=Math.max(bIn,clamp(-P.z)*.5);
  const target=P.car?VIEW_OUT*(1.1+.5*Math.min(1,carSpeed(P.car)/20)):lerp(VIEW_OUT,VIEW_IN,indoor);   // driving: pull back, more at speed
  view+=(target-view)*(1-Math.exp(-dt*12));
}
function tick(dt){
  time+=dt;if(time-savedAt>1){savedAt=time;savePosition()}
  updateTrains(dt);updatePeds(dt);updateTraffic(dt);buildDyn();
  // You are the mouse pointer: it moves across the world exactly as far as the
  // mouse moved across the screen, however fast that is.
  let wx,wy;
  if(input.override){const sp=SPEED_IN*view/VIEW_IN*dt;wx=input.override.x*sp;wy=input.override.y*sp}
  else if(FP){ // mouse looks, WASD walks, Shift runs
    const heldCar=DCARS.find(c=>c.grab);
    if(MYDOOR.grab)doorMouse(input.dx,input.dy);        // a held handle takes the mouse; otherwise it looks around
    else if(heldCar)carDoorMouse(heldCar,input.dx,input.dy);
    else if(P.boat&&A.down)tiller(input.dx,input.dy);
    else{P.a+=input.dx*.0024;pitch=clamp(pitch-input.dy*.0024,-1.45,1.45)}
    let f=0,r=0;if(keys.has('KeyW'))f+=1;if(keys.has('KeyS'))f-=1;if(keys.has('KeyD'))r+=1;if(keys.has('KeyA'))r-=1;
    if(P.car){P.car.thr=f;P.car.st=r;f=r=0}             // at the wheel the keys drive
    if(P.sit){ // seated: settle onto the chair; walking forward stands you up
      const st=P.sit,c=Math.cos(P.a),sn=Math.sin(P.a);
      const up=f>0?standSpot(st):null;
      if(up){P.x=up.x;P.y=up.y;P.sit=null}                // get up, stepping clear of the seat
      else{
        if(r&&st.horiz!==undefined)st.p=clamp(st.p+Math.sign(st.horiz?-sn:c)*r*1.3*dt,st.min,st.max);   // A/D shuffle along a bench
        const q=seatXY(st),k=Math.min(1,dt*10);P.x+=(q.x-P.x)*k;P.y+=(q.y-P.y)*k;f=r=0}
    }else if(f<0&&r===0&&!P.car){ // backing into a chair you are facing away from sits you down; a car seat puts you at the wheel
      const cs=carSeatBehind();if(cs)enterCar(cs);else P.sit=seatBehind();
    }
    const m=Math.hypot(f,r)||1,sp=(keys.has('ShiftLeft')||keys.has('ShiftRight')?8.5:4)*dt/m,c=Math.cos(P.a),sn=Math.sin(P.a);
    wx=(f*c-r*sn)*sp;wy=(f*sn+r*c)*sp;
  }else if(P.car){const c=P.car,k=DPR*view/Math.min(W,H);c.ax+=input.dx*k;c.ay+=input.dy*k;   // the mouse moves the pointer the car chases
    const d=Math.hypot(c.ax,c.ay);if(d>14){c.ax*=14/d;c.ay*=14/d}wx=wy=0}
  else if(P.boat&&A.down){tiller(input.dx,input.dy);wx=wy=0}
  else{const k=DPR*view/Math.min(W,H);wx=input.dx*k;wy=input.dy*k}
  let amx=0,amy=0;if(!input.override&&mouseCaptured()){amx=wx;amy=wy;wx=wy=0}
  const hx=wx,hy=wy;                                   // where the player meant to go, before any shove
  if(A.kx||A.ky){wx+=A.kx*dt;wy+=A.ky*dt;const d=Math.exp(-dt*5);A.kx*=d;A.ky*=d;if(Math.hypot(A.kx,A.ky)<.05)A.kx=A.ky=0}
  input.dx=input.dy=0;
  if(P.boat){ // aboard: you walk about the deck, in the boat's own frame
    const b=BOAT,q=P.boat,c=Math.cos(b.a),s=Math.sin(b.a);
    q.lx=clamp(q.lx+wx*c+wy*s,-2.3,2.3);q.ly=clamp(q.ly-wx*s+wy*c,b.docked&&Math.abs(q.lx)<1.25?-2:-.85,.85);wx=wy=0;boatPlace();   // (you can only step off amidships, at the gap in the rail)
    if(b.docked&&P.x<623.3)P.boat=null;                 // back over the side onto the pier
  }
  updateBoat(dt);
  updateCarDoors(dt);
  if(P.car){if(!FP&&A.click&&carSpeed(P.car)<1)P.car.exiting=true;          // top-down: a click when stopped opens the door and you get out
    wx=wy=0;if(P.car)updateDriving(dt)}
  else if(!FP){const c=carStepIn();if(c)enterCar(c)}
  // Surfaces. Ordinarily the pointer goes exactly where the mouse says. On ice the mouse only
  // pushes: speed builds, and carries on when you stop. In water you wade: slow, and sluggish.
  const sf=P.boat||P.sit||P.lift||P.car?null:surfaceAt(P.x,P.y,P.z),px0=P.x,py0=P.y;
  if(sf==='ice'){P.vx+=wx*.9;P.vy+=wy*.9;const f=Math.exp(-dt*.45),sp=Math.hypot(P.vx,P.vy),k=sp>30?30/sp:1;P.vx*=f*k;P.vy*=f*k;wx=P.vx*dt;wy=P.vy*dt}
  else if(sf==='water'){let tx=wx/dt*.4,ty=wy/dt*.4;const sp=Math.hypot(tx,ty);if(sp>4){tx*=4/sp;ty*=4/sp}
    const k=Math.min(1,dt*4);P.vx+=(tx-P.vx)*k;P.vy+=(ty-P.vy)*k;wx=P.vx*dt;wy=P.vy*dt}
  else{P.vx=wx/dt;P.vy=wy/dt;const sp=Math.hypot(P.vx,P.vy);if(sp>25){P.vx*=25/sp;P.vy*=25/sp}}   // so you arrive on the ice with the speed you had
  const dist=Math.hypot(wx,wy);
  if(dist>1e-6){ // small steps so nothing is tunnelled through, whatever the speed
    const n=Math.min(6000,Math.ceil(dist/.08));
    gather(Math.min(P.x,P.x+wx)-1.5,Math.min(P.y,P.y+wy)-1.5,Math.max(P.x,P.x+wx)+1.5,Math.max(P.y,P.y+wy)+1.5);
    for(let i=0;i<n;i++){
      const bx=P.x,by=P.y;P.x+=wx/n;P.y+=wy/n;collide();updateZ();
      if(Math.abs(P.x-bx)+Math.abs(P.y-by)<1e-5)break;   // pinned against something: the rest of the flick goes nowhere
    }
  }
  if(sf){P.vx=(P.x-px0)/dt;P.vy=(P.y-py0)/dt}          // whatever a wall or the boards stopped is gone
  if(!FP&&Math.hypot(hx,hy)>.01)P.a+=angDiff(Math.atan2(hy,hx),P.a)*Math.min(1,Math.hypot(hx,hy)*4);   // the pointer faces the way it last moved
  gather(P.x-1.5,P.y-1.5,P.x+1.5,P.y+1.5);
  if(!FP)P.sit=null;
  eyeH+=((P.sit?1.12:1.65)-eyeH)*Math.min(1,dt*7);
  if(!P.lift)pendingBtn=null;
  for(const l of LIFTS)updateLift(l,dt);
  updateMyDoor(dt);collide();updateZ();updateIndoor(dt);
  if(FP&&A.click&&!MYDOOR.grab){const t=aimedPress();if(t)t.act()}
  updateArena(dt,amx,amy);if(A.ball)collide();   // (a swinging ball may have tugged the player)
  // the camera trails the pointer a little but never lets it stray far from the centre
  // (a drawn bow pulls the camera towards the drag point; a missile takes it along)
  // (a missile takes the camera with it; a drawn bow nudges it towards where the shot will go)
  let fx=P.x,fy=P.y;
  if(P.car){fx+=P.car.vx*.45;fy+=P.car.vy*.45}          // look ahead down the road
  if(inArena()){if(A.missile){fx=A.missile.x;fy=A.missile.y}else if(A.bow){fx-=A.bow.px*.6;fy-=A.bow.py*.6}}
  const easing=A.ease>0;if(easing)A.ease-=dt;                      // gliding back after a missile: slower, and unclamped
  const f=1-Math.exp(-dt*(easing?3.5:9));CAM.x+=(fx-CAM.x)*f;CAM.y+=(fy-CAM.y)*f;
  const ox=fx-CAM.x,oy=fy-CAM.y,o=Math.hypot(ox,oy),lim=view*.16;
  if(o>lim&&!easing){CAM.x=fx-ox/o*lim;CAM.y=fy-oy/o*lim}
}

// ---------------------------------------------------------------- rendering
// The world is rendered in 3D (three.js) from straight above. The 2D canvas
// painters below are kept as texture artists: they paint the ground and each
// floor once, and those pictures are laid onto the 3D floors.
const cv=document.getElementById('c');
let W=0,H=0,DPR=1;const VB={x0:0,y0:0,x1:0,y1:0};
const vis=(x,y,w,h)=>x<VB.x1&&x+w>VB.x0&&y<VB.y1&&y+h>VB.y0;
function text(g,s,x,y,size,color,rot=0,align='center'){g.save();g.translate(x,y);g.rotate(rot);g.scale(size/20,size/20);
  g.font='600 20px system-ui,sans-serif';g.textAlign=align;g.textBaseline='middle';g.fillStyle=color;g.fillText(s,0,0);g.restore()}
function rrect(g,x,y,w,h,r){g.beginPath();g.roundRect(x,y,w,h,r)}
function disc(g,x,y,r){g.beginPath();g.arc(x,y,r,0,6.2832)}

const C={road:'#4b4f57',walk:'#c8c5bc',curb:'#a9a69d',inner:'#aaa79e',grass:'#7fae6b',path:'#dccfae',wall:'#30333a',dark:'#14161a'};

function drawOutdoor(g){
  g.fillStyle=C.road;g.fillRect(VB.x0,VB.y0,VB.x1-VB.x0,VB.y1-VB.y0);
  if(VB.x0>850){drawArenaGround(g);return}
  if(VB.x1>540){g.save();g.beginPath();g.rect(540,VB.y0-1,VB.x1-539,VB.y1-VB.y0+2);g.clip();drawHarborGround(g);g.restore()}
  if(VB.x0<540){g.save();g.beginPath();g.rect(VB.x0-1,VB.y0-1,541-VB.x0,VB.y1-VB.y0+2);g.clip();
  // blocks
  const blocks=[[-90,-90,180,160],[100,-90,480,160],[-90,82,180,170],[100,82,480,170]];
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
  for(let k=0;k<3;k++){const q=(time*.5+k/3)%1;g.strokeStyle=`rgba(255,255,255,${(.6*(1-q)).toFixed(3)})`;disc(g,FOUNT.x,FOUNT.y,.3+q*1.8);g.stroke()}
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
function drawArenaGround(g){
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
function drawHarborGround(g){
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
  for(let y=Math.floor(VB.y0/3)*3;y<59;y+=3){g.lineDashOffset=-time*1.2+y*2.3;g.beginPath();g.moveTo(x0,y);g.lineTo(x0+w,y);g.stroke()}
  g.setLineDash([]);g.lineDashOffset=0;
  for(const[x,y,bw,bh,c]of[[583,49,7,2.6,'#e9e6df'],[599,45,5,2,'#c94f3d'],[644,51,8,2.8,'#e9e6df'],[660,45.5,5,2,'#3d6fc9']]){
    const by=y+Math.sin(time*.8+x)*.12;
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
function grid(g,r,step,color){g.strokeStyle=color;g.lineWidth=.04;g.beginPath();
  for(let x=r.x;x<=r.x+r.w+.01;x+=step){g.moveTo(x,r.y);g.lineTo(x,r.y+r.h)}
  for(let y=r.y;y<=r.y+r.h+.01;y+=step){g.moveTo(r.x,y);g.lineTo(r.x+r.w,y)}g.stroke()}
const OFLOOR={0:'#ddd6c8',1:'#b7c1cc',2:'#d2bd9c'};
function drawOfficeFloor(g,z){
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
const doorOpen=(l,z)=>Math.abs(l.z-z)<.01?l.door:0;
const doorHalf=(l,o)=>l.dr.w/2*(1-o*.92);
function drawLift(g,l,z){
  g.fillStyle='rgba(240,182,58,.35)';g.fillRect(l.x+.3,l.y+2.4,1.6,1.1);
  text(g,'LIFT',l.x+1.1,l.y+2.95,.42,'rgba(40,44,52,.7)');
  g.fillStyle='#1b1d21';g.fillRect(l.x,l.y,l.w,l.h+.2);
}
function drawTowerFloor(g,z){
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
const SUBCOVER={x:109.5,y:93.3,w:4,h:9.2};
function drawConcourse(g){
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
function trainSign(si,k){
  const j=STOPS.findIndex(s=>s.si===si&&s.k===k);
  if(j<0)return'no trains from this side';
  const e=etas()[j];
  return'to '+STATIONS[STOPS[(j+1)%STOPS.length].si].name+'  ·  '+(e===0?'boarding':e===null?'delayed':Math.ceil(e)+' s');
}
function drawPlatform(g){
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
// ---------------------------------------------------------------- 3D scene
const LH=3.6,WALL_H=2.7,Y=z=>z*LH;            // storey height, wall height, level -> metres up
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
const scene=new THREE.Scene();scene.background=new THREE.Color('#14161a');
scene.add(new THREE.AmbientLight(0xffffff,.6));
{const sun=new THREE.DirectionalLight(0xffffff,.45);sun.position.set(-.45,1,-.3);scene.add(sun)}
const camera=new THREE.PerspectiveCamera(35,1,1,400);
const HALF_FOV=17.5*Math.PI/180;              // half the view angle across the short screen side
let RT=null;
const qscene=new THREE.Scene(),qcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const QUAD=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false}));
qscene.add(QUAD);
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);W=Math.round(innerWidth*DPR);H=Math.round(innerHeight*DPR);
  renderer.setPixelRatio(DPR);renderer.setSize(innerWidth,innerHeight,false);
  if(RT)RT.dispose();RT=new THREE.WebGLRenderTarget(W,H,{samples:4});QUAD.material.map=RT.texture;
}
addEventListener('resize',resize);resize();

// Mesh builder: boxes and cylinders with per-vertex colour, merged into one mesh.
const colCache={};
const rgb=c=>c.isColor?c:(colCache[c]||(colCache[c]=new THREE.Color(c)));
const shade=(c,k=.8)=>rgb(c).clone().multiplyScalar(k);
const VMAT=new THREE.MeshLambertMaterial({vertexColors:true});
const GLASS=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.42,depthWrite:false});
const GLOW=new THREE.MeshBasicMaterial({vertexColors:true});
class MB{
  constructor(){this.p=[];this.n=[];this.c=[]}
  tri(a,b,c,n,col){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    if((uy*vz-uz*vy)*n[0]+(uz*vx-ux*vz)*n[1]+(ux*vy-uy*vx)*n[2]<0){const t=b;b=c;c=t}   // keep the front face outward
    const k=rgb(col);this.p.push(...a,...b,...c);for(let i=0;i<3;i++){this.n.push(...n);this.c.push(k.r,k.g,k.b)}}
  quad(a,b,c,d,n,col){this.tri(a,b,c,n,col);this.tri(a,c,d,n,col)}
  // x,z,w,d are the 2D footprint (world x / world y); y0..y1 is the height span
  box(x,z,w,d,y0,y1,side,top=side){const X=x+w,Z=z+d;
    this.quad([x,y1,z],[x,y1,Z],[X,y1,Z],[X,y1,z],[0,1,0],top);
    this.quad([x,y0,z],[X,y0,z],[X,y1,z],[x,y1,z],[0,0,-1],side);
    this.quad([x,y0,Z],[X,y0,Z],[X,y1,Z],[x,y1,Z],[0,0,1],side);
    this.quad([x,y0,z],[x,y0,Z],[x,y1,Z],[x,y1,z],[-1,0,0],side);
    this.quad([X,y0,z],[X,y0,Z],[X,y1,Z],[X,y1,z],[1,0,0],side)}
  lid(x,z,w,d,y,col){this.quad([x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d],[0,-1,0],col)}   // a face seen from underneath
  cyl(cx,cz,r,y0,y1,side,top=side,seg=10){
    for(let i=0;i<seg;i++){const a=i/seg*6.2832,b=(i+1)/seg*6.2832,m=(a+b)/2;
      const ax=cx+Math.cos(a)*r,az=cz+Math.sin(a)*r,bx=cx+Math.cos(b)*r,bz=cz+Math.sin(b)*r;
      this.quad([ax,y0,az],[bx,y0,bz],[bx,y1,bz],[ax,y1,az],[Math.cos(m),0,Math.sin(m)],side);
      this.tri([cx,y1,cz],[ax,y1,az],[bx,y1,bz],[0,1,0],top)}}
  mesh(mat=VMAT){const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    return new THREE.Mesh(g,mat)}
}
// A 2D painting of a rectangle of the world, as a texture.
function art(x,y,w,h,ppm,fn){
  ppm=Math.min(ppm,4096/w,4096/h);
  const c=document.createElement('canvas');c.width=Math.round(w*ppm);c.height=Math.round(h*ppm);
  const a={x,y,w,h,tex:new THREE.CanvasTexture(c)};a.tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  a.mat=new THREE.MeshLambertMaterial({map:a.tex});
  a.uv=(wx,wy)=>[(wx-x)/w,1-(wy-y)/h];
  a.paint=()=>{const g=c.getContext('2d');g.setTransform(c.width/w,0,0,c.height/h,-x*c.width/w,-y*c.height/h);
    VB.x0=x;VB.y0=y;VB.x1=x+w;VB.y1=y+h;const t=time;time=0;fn(g);time=t;a.tex.needsUpdate=true};   // (painted at time 0 so neighbouring pictures match)
  a.paint();return a;
}
// A flat floor: `rect` minus rectangular holes (stairwells, lift shafts), textured.
function slab(rect,holes,yy,a){
  const xs=[rect.x,rect.x+rect.w],zs=[rect.y,rect.y+rect.h];
  for(const h of holes){for(const v of[h.x,h.x+h.w])if(v>rect.x&&v<rect.x+rect.w)xs.push(v);
    for(const v of[h.y,h.y+h.h])if(v>rect.y&&v<rect.y+rect.h)zs.push(v)}
  xs.sort((p,q)=>p-q);zs.sort((p,q)=>p-q);
  const pos=[],uv=[],nor=[];
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
const UNIT=new THREE.BoxGeometry(1,1,1);
function dynBox(parent,color){const m=new THREE.Mesh(UNIT,new THREE.MeshLambertMaterial({color}));parent.add(m);return m}
function setBox(m,x,z,w,d,y0,y1){m.visible=w>.02&&d>.02;m.position.set(x+w/2,(y0+y1)/2,z+d/2);m.scale.set(Math.max(w,.001),y1-y0,Math.max(d,.001))}
const WALLS='#d3cec3',WTOP='#30333a';
function wall3d(mb,gl,w,y0){
  if(!w.wins||!w.wins.length){mb.box(w.x,w.y,w.w,w.h,y0,y0+WALL_H,WALLS,WTOP);return}
  // sill and lintel run the whole length; between them, piers alternate with glass
  const horiz=w.w>w.h,a=horiz?w.x:w.y,b=a+(horiz?w.w:w.h);let c=a;
  const seg=(m,p,q,ya,yb,s,t)=>{if(q-p>.01)horiz?m.box(p,w.y,q-p,w.h,ya,yb,s,t):m.box(w.x,p,w.w,q-p,ya,yb,s,t)};
  seg(mb,a,b,y0,y0+.9,WALLS,WALLS);seg(mb,a,b,y0+2.15,y0+WALL_H,WALLS,WTOP);
  for(const v of w.wins){if(v<a||v+w.len>b)continue;seg(mb,c,v,y0+.9,y0+2.15,WALLS,WALLS);seg(gl,v,v+w.len,y0+.9,y0+2.15,'#a9d6ec','#a9d6ec');c=v+w.len}
  seg(mb,c,b,y0+.9,y0+2.15,WALLS,WALLS);
}
function furn3d(mb,f,y0){
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
const FPONLY=[];                      // meshes that only exist in first person: ceilings, roofs, wall tops
const fpAdd=(parent,m)=>{m.visible=false;FPONLY.push(m);parent.add(m);return m};
const CEILB={mat:new THREE.MeshLambertMaterial({color:'#e9e6df',side:THREE.DoubleSide}),uv:()=>[0,0]};   // plaster ceilings indoors
const CEIL={mat:new THREE.MeshLambertMaterial({color:'#3a3d44',side:THREE.DoubleSide}),uv:()=>[0,0]};
const inR=(o,r)=>{const cx=o.r!==undefined?o.cx:o.x+o.w/2,cy=o.r!==undefined?o.cy:o.y+o.h/2;return cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h};
function levelParts(g,z,rect){
  const mb=new MB(),gl=new MB(),y0=Y(z)+.03;
  const up=new MB();   // walls stop short of the ceiling so the top-down view stays readable; this closes the gap
  for(const w of FL[z].walls)if(inR(w,rect)){wall3d(mb,gl,w,y0);up.box(w.x,w.y,w.w,w.h,y0+WALL_H,y0+LH-.04,WALLS)}
  for(const f of FL[z].furn)if(inR(f,rect)){furn3d(mb,f,y0);if(f.opq||f.color==='#6f757d')up.box(f.x,f.y,f.w,f.h,y0+WALL_H,y0+LH-.04,shade(f.color))}
  g.add(mb.mesh());if(gl.p.length)g.add(gl.mesh(GLASS));fpAdd(g,up.mesh());
  return mb;
}
// plain facade: a block with ribbon windows on every storey
function facade(mb,r,floors,side,top){
  const h=floors*LH+.4;mb.box(r.x,r.y,r.w,r.h,0,h,side,top);
  for(let f=0;f<floors;f++){const ya=f*LH+1.1,yb=ya+1.3,m=Math.min(1.2,r.w*.12,r.h*.12),e=.05,k='#5f7789';
    mb.box(r.x+m,r.y-e,r.w-2*m,e,ya,yb,k);mb.box(r.x+m,r.y+r.h,r.w-2*m,e,ya,yb,k);
    mb.box(r.x-e,r.y+m,e,r.h-2*m,ya,yb,k);mb.box(r.x+r.w,r.y+m,e,r.h-2*m,ya,yb,k)}
  return h;
}
function stairMeshes(s){
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

// ---- outdoors (street level, both regions)
const OUTG=new THREE.Group();scene.add(OUTG);
const CANOPIES=[];
{
  const subHole=dx=>({x:dx+110,y:92,w:3,h:10});
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
const TILE=48,TILES=new Map();
function updateTiles(){
  if(P.z<-.9)return;
  const ci=Math.floor(P.x/TILE),cj=Math.floor(P.y/TILE);let made=false;
  for(let i=ci-1;i<=ci+1&&!made;i++)for(let j=cj-1;j<=cj+1&&!made;j++){const k=i+','+j;if(TILES.has(k))continue;
    const x=i*TILE,y=j*TILE,a=art(x,y,TILE,TILE,26,drawOutdoor);a.mat.polygonOffset=true;a.mat.polygonOffsetFactor=-1;a.mat.polygonOffsetUnits=-1;
    const m=slab({x,y,w:TILE,h:TILE},STATIONS.map(st=>({x:st.dx+110,y:92,w:3,h:10})),.012,a);OUTG.add(m);TILES.set(k,{m,a,i,j});made=true}
  for(const[k,t]of TILES)if(Math.abs(t.i-ci)>2||Math.abs(t.j-cj)>2){OUTG.remove(t.m);t.m.geometry.dispose();t.a.mat.dispose();t.a.tex.dispose();TILES.delete(k)}
}

// ---- enterable buildings: a closed exterior, and one open-topped group per storey
for(const b of BUILDINGS){
  const r=b.rect,ext=new MB();
  const h=facade(ext,r,b.top+1,shade(b.roof.color,.92),b.roof.color);
  for(const d of b.roof.details)ext.box(d.x,d.y,d.w,d.h,h,h+(d.c==='#c3c6ca'?1.1:.35),shade(d.c),d.c);
  ext.box(b.door.x-1.6,r.y+r.h,3.2,1.6,2.9,3.05,shade(b.awning),b.awning);        // awning over the entrance
  ext.box(b.door.x-1,r.y+r.h,2,.08,0,2.4,'#1b1d21');
  b.ext=ext.mesh();scene.add(b.ext);
  {const rf=new MB();rf.box(r.x,r.y,r.w,r.h,Y(b.top+1),Y(b.top+1)+.4,shade(b.roof.color,.92),b.roof.color);
    for(const d of b.roof.details)rf.box(d.x,d.y,d.w,d.h,h,h+(d.c==='#c3c6ca'?1.1:.35),shade(d.c),d.c);
    rf.box(b.door.x-1.6,r.y+r.h,3.2,1.6,2.9,3.05,shade(b.awning),b.awning);fpAdd(scene,rf.mesh())}
  b.levels=[];
  for(let z=0;z<=b.top;z++){
    const g=new THREE.Group(),holes=[];
    for(const s of STAIRS)if(s.zh===z&&inR(s,r))holes.push(s);
    for(const l of LIFTS)if(l.owner===b&&z>l.zmin)holes.push({x:l.x,y:l.y,w:l.w,h:l.h+.2});
    g.add(slab(r,holes,Y(z)+.03,art(r.x,r.y,r.w,r.h,28,gg=>b.rect===OFFICE?drawOfficeFloor(gg,z):drawTowerFloor(gg,z))));
    const mb=levelParts(g,z,r);
    scene.add(g);b.levels.push(g);
    // first person: a proper ceiling under the floor above (open where the stairs and lift go up), with light panels
    {const up=[];if(z<b.top){for(const s of STAIRS)if(s.zh===z+1&&inR(s,r))up.push(s);for(const l of LIFTS)if(l.owner===b)up.push({x:l.x,y:l.y,w:l.w,h:l.h+.2})}
      const cy=Y(z+1)-.02,lt=new MB();fpAdd(scene,slab(r,up,cy,CEILB));
      for(let x=r.x+3;x<r.x+r.w-1;x+=5)for(let y=r.y+3;y<r.y+r.h-1;y+=5){
        if(up.some(h=>x+1.2>h.x&&x<h.x+h.w&&y+.4>h.y&&y<h.y+h.h))continue;lt.lid(x,y,1.2,.35,cy-.01,'#fffbe8')}
      fpAdd(scene,lt.mesh(GLOW))}
  }
}
for(const s of STAIRS){s.owner=BUILDINGS.find(b=>inR(s,b.rect))||null;stairMeshes(s)}
// lifts: the car, and a pair of sliding doors on every floor
for(const l of LIFTS){
  const mb=new MB();mb.box(l.x,l.y,l.w,l.h+.2,-.02,.04,'#c9cdd3');
  mb.box(l.x+.06,l.y+.06,l.w-.12,.08,.04,1,'#8f959d');mb.box(l.x+.06,l.y+.2,.08,l.h-.3,.04,1,'#8f959d');mb.box(l.x+l.w-.14,l.y+.2,.08,l.h-.3,.04,1,'#8f959d');
  l.car=mb.mesh();scene.add(l.car);
  {const c=new MB();c.lid(l.x,l.y,l.w,l.h+.2,2.35,'#d9dce0');fpAdd(l.car,c.mesh());const lt=new MB();lt.lid(l.x+.6,l.y+.9,1,.3,2.34,'#fffbe8');fpAdd(l.car,lt.mesh(GLOW))}
  {const pn=panelOf(l),cv2=document.createElement('canvas');cv2.width=pn.cols*64;cv2.height=pn.rows*54;
    const tex=new THREE.CanvasTexture(cv2),pl=new THREE.Mesh(new THREE.PlaneGeometry(pn.pw,pn.ph),new THREE.MeshBasicMaterial({map:tex}));
    pl.rotation.y=-Math.PI/2;pl.position.set(l.x+l.w-.145,pn.ch,pn.cy);l.car.add(pl);
    l.paintPanel=()=>{const key=l.target+'|'+Math.round(l.z)+'|'+(P.lift===l?pendingBtn:'');if(key===l.panelKey)return;l.panelKey=key;
      const g=cv2.getContext('2d');g.fillStyle='#3a3d44';g.fillRect(0,0,cv2.width,cv2.height);
      for(let i=0;i<pn.n;i++){const f=l.zmin+i,x=(i%pn.cols+.5)*64,y=cv2.height-(Math.floor(i/pn.cols)+.5)*54,on=l.target===f||(P.lift===l&&pendingBtn===f),here=Math.round(l.z)===f&&l.target===null;
        g.fillStyle=on?'#f0b63a':here?'#cfd3d9':'#1c1e22';g.beginPath();g.arc(x,y,21,0,7);g.fill();g.strokeStyle='#cfd3d9';g.lineWidth=3;g.stroke();
        g.fillStyle=on||here?'#1c1e22':'#f2f3f5';g.font='600 24px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(f+1,x,y+1)}
      tex.needsUpdate=true};
    const hb=new MB();for(let z=l.zmin;z<=l.zmax;z++){const x=l.dr.x+l.dr.w+.32,y=l.y+2.4;hb.box(x-.07,y,.14,.025,Y(z)+1,Y(z)+1.2,'#3a3d44');hb.box(x-.035,y+.02,.07,.02,Y(z)+1.065,Y(z)+1.135,'#f0b63a')}
    scene.add(l.hall=hb.mesh())}
  {const up=new MB();for(let z=l.zmin;z<=l.zmax;z++)up.box(l.dr.x,l.dr.y,l.dr.w,l.dr.h,Y(z)+2.23,Y(z)+LH-.01,WALLS);fpAdd(scene,up.mesh())}
  l.doors=[];for(let z=l.zmin;z<=l.zmax;z++){const g=l.owner.levels[z];l.doors.push([dynBox(g,'#aeb4bc'),dynBox(g,'#aeb4bc')])}
}
// flat doors
{const b=BUILDINGS[1],up=new MB();
  for(const d of FLATDOORS)up.box(d.x,d.y,d.w,d.h,Y(d.z)+2.13,Y(d.z)+LH-.01,WALLS);
  fpAdd(scene,up.mesh());
  for(const d of FLATDOORS){const g=b.levels[d.z];
    if(d.mine){const y=Y(d.z)+.03,mb=new MB(),hb=new MB();
      mb.box(0,-.04,d.w,.08,0,2.1,'#3f9a63','#2f7a4d');
      for(const sz of[-.1,.06])hb.box(-.13,sz,.15,.04,-.02,.02,'#d9c27a');      // lever handles, one per face
      d.pivot=new THREE.Group();d.pivot.position.set(d.x,y,d.y+.1);d.pivot.add(mb.mesh());
      d.lever=new THREE.Group();d.lever.position.set(HANDLE+.06,1,0);d.lever.add(hb.mesh());d.pivot.add(d.lever);g.add(d.pivot)}
    else{const mb=new MB();mb.box(d.x,d.y+.04,d.w,d.h-.08,Y(d.z)+.03,Y(d.z)+2.1,'#6b4a32','#54392a');g.add(mb.mesh())}}
}

// Lids over the flats, for the top-down view: other people's homes are never seen into, and
// the player's own is covered until its door opens.
const TOPONLY=[];let MYLID=null;
{const b=BUILDINGS[1],N=[['01',22.3,44.3,7.5,9.5],['06',41.2,44.3,4.5,9.5]],S=[['02',22.3,5.7],['03',28.2,5.8],['04',34.2,5.8],['05',40.2,5.5]];
  for(let z=0;z<=TTOP;z++){const mb=new MB(),y=Y(z)+WALL_H+.05;
    for(const[id,x,yy,w,h]of[...N,...S.map(([id,x,w])=>[id,x,56,w,9.7])]){
      if(z===0&&(id==='03'||id==='04'))continue;
      if(z===MYFLAT.z&&id===MYFLAT.id){
        MYLID=new THREE.Mesh(UNIT,new THREE.MeshLambertMaterial({color:'#6c6f77',transparent:true}));
        setBox(MYLID,x,yy,w,h,y,y+.1);b.levels[z].add(MYLID);continue}
      mb.box(x,yy,w,h,y,y+.1,'#4b4e55','#6c6f77')}
    const m=mb.mesh();b.levels[z].add(m);TOPONLY.push(m)}
}

// ---- subway
const TUNNEL=new THREE.Group();scene.add(TUNNEL);
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

// ---- arena: creatures and weapons (all dynamic)
const ARG=new THREE.Group();OUTG.add(ARG);
const ICO=new THREE.IcosahedronGeometry(1,1),DISC=new THREE.CylinderGeometry(1,1,1,16);
function stick(m,x1,z1,x2,z2,y,th){const dx=x2-x1,dz=z2-z1,L=Math.hypot(dx,dz);m.visible=L>.01;
  m.position.set((x1+x2)/2,y,(z1+z2)/2);m.scale.set(Math.max(L,.001),th,th);m.rotation.y=-Math.atan2(dz,dx)}
const pool=(n,mk)=>Array.from({length:n},()=>{const m=mk();m.visible=false;ARG.add(m);return m});
const lam=c=>new THREE.MeshLambertMaterial({color:c}),bas=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:o!==undefined,opacity:o===undefined?1:o,depthWrite:o===undefined});
const AV={
  body:A.creatures.map(()=>{const m=new THREE.Mesh(ICO,new THREE.MeshLambertMaterial({flatShading:true}));ARG.add(m);return m}),
  bar:pool(A.creatures.length,()=>new THREE.Mesh(UNIT,bas('#e5484d'))),
  arrow:pool(12,()=>new THREE.Mesh(UNIT,lam('#6b4a32'))),
  pud:pool(60,()=>new THREE.Mesh(DISC,lam('#3b2f25'))),
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
function arenaSync(){
  ARG.visible=regionAt(P.x)===2;if(!ARG.visible)return;
  A.creatures.forEach((c,i)=>{const m=AV.body[i],b=AV.bar[i];m.visible=!c.dead;b.visible=!c.dead&&c.hp<c.max;
    if(c.dead)return;
    const sq=1+Math.sin(time*6+i)*.05;m.position.set(c.x,c.r*.8,c.y);m.scale.set(c.r*sq,c.r*.8/sq,c.r*sq);m.rotation.y=Math.atan2(-c.vy,c.vx);
    m.material.color.set(c.col);m.material.emissive.setScalar(c.flash>0?.7:0);
    const w=1.4*c.hp/c.max;b.position.set(c.x-(1.4-w)/2,c.r*1.7+.5,c.y-c.r-.2);b.scale.set(Math.max(w,.01),.12,.16)});
  AV.arrow.forEach((m,i)=>{const a=A.arrows[i];if(!a){m.visible=false;return}const s=Math.hypot(a.vx,a.vy);stick(m,a.x-a.vx/s*1.1,a.y-a.vy/s*1.1,a.x,a.y,1,.07)});
  AV.pud.forEach((m,i)=>{const p=A.puddles[i];m.visible=!!p;if(!p)return;const on=p.t>1;m.material=on?AV.flame:AV.fuel;
    const h=on?.5+.45*Math.sin(time*17+i*2.1):.04,r=on?1.25:Math.min(1.1,.4+p.t);m.position.set(p.x,h/2+.02,p.y);m.scale.set(r,h,r)});
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
    stick(AV.line[0],P.x+c*.3,P.y+s*.3,P.x+c*(r-.35),P.y+s*(r-.35),1,.08);   // the shaft stays in hand and reaches outAV.line[0].material=AV.wood;
    stick(AV.line[1],P.x+c*(r-.4),P.y+s*(r-.4),P.x+c*r,P.y+s*r,1,.16)}
  else if(id!=='shield')AV.line[0].material=AV.pale;
  if(id==='shield'){const c=Math.cos(P.a),s=Math.sin(P.a),f=A.up?.75:.2,hw=A.up?.95:.5;
    stick(AV.line[0],P.x+c*f+s*hw,P.y+s*f-c*hw,P.x+c*f-s*hw,P.y+s*f+c*hw,.9,A.up?.3:.16);AV.line[0].material=AV.steel}
  AV.tracer.forEach((m,i)=>{const sh=A.shot;if(!sh){m.visible=false;return}const a=sh.a+(i-3)*.16,r0=1+sh.t*40,r1=Math.min(9,r0+3);
    stick(m,sh.x+Math.cos(a)*r0,sh.y+Math.sin(a)*r0,sh.x+Math.cos(a)*r1,sh.y+Math.sin(a)*r1,1,.07)});
  {const b=A.boom;AV.boom.visible=!!b;if(b){const a=time*22;stick(AV.boom,b.x-Math.cos(a)*.6,b.y-Math.sin(a)*.6,b.x+Math.cos(a)*.6,b.y+Math.sin(a)*.6,1,.16)}}
  {const w=A.well;AV.well.visible=!!w;if(w){const r=1+w.t*1.1+Math.sin(time*14)*.12;AV.well.position.set(w.x,.08,w.y);AV.well.scale.set(r,.06,r)}}
  AV.orb.forEach((m,i)=>{const o=A.orbs[i];m.visible=!!o;if(o){m.position.set(o.x,.45,o.y);m.scale.setScalar(.32)}});
  const ms=A.missile;AV.missile.visible=!!ms;
  if(ms){stick(AV.missile,ms.x-Math.cos(ms.a)*.6,ms.y-Math.sin(ms.a)*.6,ms.x+Math.cos(ms.a)*.6,ms.y+Math.sin(ms.a)*.6,1.2,.3)}
  const bl=A.blast;AV.blast.visible=!!bl;if(bl){AV.blast.position.set(bl.x,1,bl.y);AV.blast.scale.setScalar(.5+bl.t/.45*bl.r);AV.blast.material.opacity=.7*(1-bl.t/.45)}
}

// ticket gate arms: hinged on the post, pushed aside by whoever walks through
for(const g of GATES){g.pivot=new THREE.Group();g.pivot.position.set(g.cx,Y(-1),g.y);
  const mb=new MB();mb.box(-.03,0,.06,.78,.95,1.03,'#c9cdd3');mb.box(-.05,0,.1,.1,.6,1.05,'#8e949c');g.pivot.add(mb.mesh());
  STATIONS[regionAt(g.cx)].g1.add(g.pivot)}

// traffic: moving cars and the signals
for(const c of CARS){const mb=new MB(),L=c.len;
  mb.box(-L/2,-.92,L,1.84,.22,.85,shade(c.col,.85),c.col);mb.box(-L*.26,-.78,L*.48,1.56,.85,1.38,'#26303b',c.col);
  mb.box(L/2-.04,-.8,.06,.4,.5,.7,'#fff6c8');mb.box(L/2-.04,.4,.06,.4,.5,.7,'#fff6c8');
  mb.box(-L/2-.02,-.8,.06,.4,.5,.7,'#c03a34');mb.box(-L/2-.02,.4,.06,.4,.5,.7,'#c03a34');
  c.g=mb.mesh();c.g.rotation.y=c.ln.ax==='x'?(c.ln.dir>0?0:Math.PI):(c.ln.dir>0?-Math.PI/2:Math.PI/2);OUTG.add(c.g)}
const SIGNALS=[[85.4,82.7,0],[104.6,69.3,0],[89.3,65.4,1],[100.7,86.6,1]].map(([x,y,g])=>{
  const mb=new MB();mb.cyl(x,y,.08,0,4,'#33363c','#33363c',6);mb.box(x-.25,y-.25,.5,.5,3.9,5.1,'#1f2126');OUTG.add(mb.mesh());
  const lamp=new THREE.Mesh(UNIT,new THREE.MeshBasicMaterial());lamp.position.set(x,4.75,y);lamp.scale.set(.62,.9,.62);OUTG.add(lamp);return{lamp,g}});

// pedestrians
for(const q of PEDS){const mb=new MB();
  mb.cyl(0,0,.2,0,.75,shade('#2b2f38',1),'#2b2f38',8);mb.cyl(0,0,.22,.75,1.42,shade(q.col),q.col,8);mb.cyl(0,0,.125,1.42,1.68,'#d9b48f','#4a3324',8);
  q.g=mb.mesh();OUTG.add(q.g)}

// the cars you can drive
for(const c of DCARS){const mb=new MB(),L=c.len;
  mb.box(-L/2,-.92,L,1.84,.22,.85,shade(c.col,.85),c.col);mb.box(-L*.26,-.78,L*.48,1.56,.85,1.38,'#26303b',c.col);
  mb.box(L/2-.04,-.8,.06,.4,.5,.7,'#fff6c8');mb.box(L/2-.04,.4,.06,.4,.5,.7,'#fff6c8');
  mb.box(-L/2-.02,-.8,.06,.4,.5,.7,'#c03a34');mb.box(-L/2-.02,.4,.06,.4,.5,.7,'#c03a34');
  mb.box(L*.2,-.92,.5,1.84,.84,.9,'#ffffff');                                  // a stripe, to tell them from the traffic
  mb.box(HINGE[0]-DOOR_L,-.925,DOOR_L,.01,.3,1.3,'#1c1e22');                    // the doorway, seen when the door is open
  c.g=mb.mesh();OUTG.add(c.g);
  {const dm=new MB();dm.box(-DOOR_L,-.03,DOOR_L,.06,.28,.86,shade(c.col,.8),c.col);dm.box(-DOOR_L,-.03,DOOR_L,.06,.86,1.32,'#3b4652');dm.box(-DOOR_L+.08,-.07,.2,.04,.72,.78,'#d9dce0');
    c.pivot=new THREE.Group();c.pivot.position.set(HINGE[0],0,HINGE[1]-.02);c.pivot.add(dm.mesh());c.g.add(c.pivot)}
  const hd=new MB();hd.box(.55,-.9,1.6,1.8,.84,.9,shade(c.col,.9),c.col);hd.box(.5,-.32,.1,.5,.9,1.05,'#1c1e22');c.dash=fpAdd(c.g,hd.mesh())}   // bonnet and wheel, seen from the driver's seat

// the boat
{const g=new THREE.Group(),mb=new MB();
  mb.box(-2.75,-1.2,5.5,2.4,.0,.04,'#8a6a4a');                                           // deck
  for(const[x,z,w,d]of[[-2.75,-1.2,5.5,.14],[-2.75,1.06,5.5,.14],[-2.75,-1.2,.14,2.4],[2.61,-1.2,.14,2.4]])mb.box(x,z,w,d,0,.5,'#e9e6df','#c94f3d');
  mb.box(2.75,-.7,.5,1.4,0,.42,'#e9e6df','#c94f3d');mb.box(3.25,-.3,.35,.6,0,.36,'#e9e6df','#c94f3d');    // bow
  mb.box(-2.5,-.35,.6,.7,.04,.55,'#3a3d44');                                               // engine
  g.add(mb.mesh());BOAT.tiller=dynBox(g,'#5a4632');BOAT.g=g;OUTG.add(g)}

// ---- what to show
// A view is {k, b}: storey k of building b cut open (b=null: nothing cut open,
// every building shown from outside), or {lift}: only the inside of a lift car.
function applyView(v){
  const up=!v.lift&&v.k>=0;
  OUTG.visible=up;
  for(const b of BUILDINGS){const mine=up&&v.b===b;b.ext.visible=up&&!mine;b.levels.forEach((g,i)=>g.visible=mine&&i<=v.k)}
  for(const s of STAIRS){
    const on=v.lift?false:s.owner?up&&v.b===s.owner&&v.k>=s.zl:v.k===s.zl||v.k===s.zh||(up&&s.zh===0);
    s.low.visible=on;s.high.visible=on&&v.k>=s.zh}
  for(const l of LIFTS)l.car.visible=v.lift===l||(up&&v.b===l.owner&&Math.floor(l.z+.01)<=v.k);
  for(const st of STATIONS){st.g1.visible=!v.lift&&v.k===-1;st.g2.visible=!v.lift&&v.k===-2}
  TUNNEL.visible=!v.lift&&v.k===-2;for(const tr of TRAINS)tr.g.visible=TUNNEL.visible;
}
// The frame is a blend of two views, and the blend is driven by position:
// height on a staircase, distance through a doorway, how far a lift's doors are open.
function views(){
  const z=P.z;
  if(P.lift)return[{k:Math.round(z),b:P.lift.owner},{lift:P.lift},1-P.lift.door];
  const s=STAIRS.find(s=>z>s.zl&&z<s.zh&&inRect(P.x,P.y,s));   // the flight the player is actually on
  if(s)return[{k:s.zl,b:s.owner},{k:s.zh,b:s.owner},(z-s.zl)/(s.zh-s.zl)];
  const L=Math.round(z);
  if(L<0)return[{k:L,b:null},null,0];
  const mine=BUILDINGS.reduce((a,b)=>b.bIn>a.bIn?b:a);
  if(L>0)return[{k:L,b:BUILDINGS.find(b=>inRect(P.x,P.y,b.rect))||mine},null,0];
  return[{k:0,b:null},{k:0,b:mine},mine.bIn];
}
let signT=0;
const SKY=new THREE.Color('#a9cfee'),NIGHT=new THREE.Color('#14161a');
function render(){
  // moving parts
  for(const l of LIFTS){l.car.position.y=Y(l.z)+.03;
    l.doors.forEach((pr,i)=>{const z=l.zmin+i,d=l.dr,hw=doorHalf(l,doorOpen(l,z)),y=Y(z)+.03;
      setBox(pr[0],d.x,d.y+.04,hw,d.h-.08,y,y+2.2);setBox(pr[1],d.x+d.w-hw,d.y+.04,hw,d.h-.08,y,y+2.2)})}
  {const d=MYDOOR;d.pivot.rotation.y=-d.open*DOOR_SWING;d.lever.rotation.z=d.h*.8}
  for(const tr of TRAINS){tr.g.position.set(tr.x,0,tr.y);const y=Y(-2);
    for(const k of[0,1]){const hw=TDW/2*(1-sideOpen(tr,k)*.92),wy=(k?0:TW-.15)+.02;
      tr.doors[k].forEach((pr,i)=>{const x=TDOORS[i];setBox(pr[0],x,wy,hw,.11,y,y+2.1);setBox(pr[1],x+TDW-hw,wy,hw,.11,y,y+2.1)})}}
  STATIONS.forEach((st,si)=>{for(let k=0;k<2;k++){const hw=TDW/2*(1-dockedDoor(si,k)*.92),y=Y(-2);
    st.doors[k].forEach((pr,i)=>{const x=st.dx+DOCK+TDOORS[i];setBox(pr[0],x,EDGEY[k]+.03,hw,.14,y,y+2.1);setBox(pr[1],x+TDW-hw,EDGEY[k]+.03,hw,.14,y,y+2.1)})}});
  for(const g of GATES){ // an unlocked arm swings away from you as you come through
    const d=Math.hypot(P.x-g.cx,P.y-g.cy),o=P.z===-1&&gatesOpen()?clamp((1.05-d)/.6):0;
    g.o+=(o-g.o)*.35;g.pivot.rotation.y=(P.x<g.cx?1:-1)*g.o*1.45}
  for(const q of PEDS){const sat=q.sit>0;q.g.position.set(q.x,sat?-.3:Math.abs(Math.sin(time*7+q.sp*40))*(q.wait?0:.035),q.y);q.g.rotation.y=-q.a}
  for(const c of CARS){const r=carRect(c);
    if(c.turn>0){const u=1-c.turn;c.g.position.set(c.ln.b+Math.sin(Math.PI*u)*2.2,0,lerp(LANES[0].c,LANES[1].c,u));c.g.rotation.y=-Math.PI*u*-1+0}   // swinging round at the harbour end
    else{c.g.position.set(r.x+r.w/2,0,r.y+r.h/2);c.g.rotation.y=c.ln.ax==='x'?(c.ln.dir>0?0:Math.PI):(c.ln.dir>0?-Math.PI/2:Math.PI/2)}}
  for(const sg of SIGNALS){const st=sigState(sg.g);sg.lamp.material.color.set(st==='g'?'#3fd06a':st==='y'?'#f0b63a':'#e5484d')}
  for(const c of DCARS){c.g.position.set(c.x,0,c.y);c.g.rotation.y=-c.a;c.dash.visible=FP&&P.car===c;c.pivot.rotation.y=-c.door*DOOR_SWING_CAR}
  {const b=BOAT;b.g.position.set(b.x,Math.sin(time*1.3)*.02,b.y);b.g.rotation.y=-b.a;
    b.tiller.position.set(-1.55,.75,0);b.tiller.scale.set(1.3,.06,.06);b.tiller.rotation.y=b.rud;b.tiller.visible=true}
  arenaSync();updateTiles();
  if(P.z<-1.5&&time-signT>1){signT=time;for(const st of STATIONS)st.art.paint()}     // platform countdown signs
  if(P.z>-.9)for(const c of CANOPIES){const t=c.t,a=FP?1:lerp(.22,1,clamp((Math.hypot(P.x-t.x,P.y-t.y)-t.r+.4)/1.6));   // canopies fade when the pointer is under them
    const mt=c.m.material,tr=a<.995;mt.opacity=a;
    if(mt.transparent!==tr){mt.transparent=tr;mt.depthWrite=!tr;mt.needsUpdate=true}}   // three bakes "opaque" into the shader, so a switch needs a rebuild
  for(const m of FPONLY)m.visible=FP;
  for(const l of LIFTS){l.paintPanel();l.hall.visible=FP}
  for(const m of TOPONLY)m.visible=!FP;
  {const home=P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT),o=home?0:1-MYDOOR.open;MYLID.material.opacity=o;MYLID.visible=!FP&&o>.01}
  scene.background=FP?SKY:NIGHT;   // underground is fully roofed over, so the sky only shows up the entrance stairs
  if(FP){ // everything exists at once, seen from eye height
    OUTG.visible=TUNNEL.visible=true;
    for(const b of BUILDINGS){b.ext.visible=false;for(const g of b.levels)g.visible=true}
    for(const s of STAIRS)s.low.visible=s.high.visible=true;
    for(const l of LIFTS)l.car.visible=true;
    for(const st of STATIONS)st.g1.visible=st.g2.visible=true;
    for(const tr of TRAINS)tr.g.visible=true;
    const dc=P.car,ey=dc?1.2:Y(P.z)+eyeH,cp=Math.cos(pitch),ex=dc?P.x+Math.sin(dc.a)*.38-Math.cos(dc.a)*.25:P.x,ez=dc?P.y-Math.cos(dc.a)*.38-Math.sin(dc.a)*.25:P.y;
    camera.aspect=W/H;camera.fov=72;camera.near=.12;camera.far=500;camera.up.set(0,1,0);
    camera.position.set(ex,ey,ez);camera.lookAt(ex+Math.cos(P.a)*cp,ey+Math.sin(pitch),ez+Math.sin(P.a)*cp);camera.updateProjectionMatrix();
    renderer.setRenderTarget(null);renderer.render(scene,camera);updateHud();return;
  }
  camera.near=1;
  // camera: straight down, high enough that `view` metres span the short side of the screen
  const hgt=view/2/Math.tan(HALF_FOV),ty=Y(P.z);
  camera.aspect=W/H;camera.fov=2*Math.atan(Math.tan(HALF_FOV)*H/Math.min(W,H))*180/Math.PI;
  camera.far=hgt+90;camera.position.set(CAM.x,ty+hgt,CAM.y);camera.up.set(0,0,-1);camera.lookAt(CAM.x,ty,CAM.y);camera.updateProjectionMatrix();
  const[A,B,f]=views();
  renderer.setRenderTarget(null);
  if(!B||f<.004){applyView(A);renderer.render(scene,camera)}
  else if(f>.996){applyView(B);renderer.render(scene,camera)}
  else{
    applyView(A);renderer.render(scene,camera);
    applyView(B);renderer.setRenderTarget(RT);renderer.render(scene,camera);renderer.setRenderTarget(null);
    QUAD.material.opacity=f;renderer.autoClear=false;renderer.render(qscene,qcam);renderer.autoClear=true;
  }
  // the player: a mouse pointer with its tip on the spot
  const v=new THREE.Vector3(P.x+(P.car?P.car.ax:0),ty+.05,P.y+(P.car?P.car.ay:0)).project(camera);
  ptrEl.style.transform=`translate(${((v.x+1)/2*innerWidth).toFixed(1)}px,${((1-v.y)/2*innerHeight).toFixed(1)}px)`;
  updateHud();
}
const ptrEl=document.getElementById('ptr');
const locEl=document.getElementById('loc'),elevEl=document.getElementById('elev');let lastLoc='',hudLift=null;
function locName(){return(P.car?'Driving  ·  ':'')+locBase()}
function locBase(){
  if(P.lift){const l=P.lift;return'Lift · '+(l.moving?(l.target>l.z?'going up':'going down')+' · '+(Math.round(l.z)+1):'Floor '+(Math.round(l.z)+1))}
  if(P.train){const t=P.train;return'Train · '+(t.phase==='run'?'to '+STATIONS[STOPS[(t.i+1)%STOPS.length].si].name:'at '+STATIONS[STOPS[t.i].si].name)}
  const ri=regionAt(P.x),sn=STATIONS[ri].name;
  if(P.z<-1.5)return sn+' Station · Platform';if(P.z<-.5)return sn+' Station · Concourse';
  if(P.z<-.01)return sn+' Station entrance';
  if(ri===2)return'Arena'+(A.cur?' · '+A.cur.name:'');
  if(P.boat)return'Harbor  ·  aboard the boat';
  if(surfaceAt(P.x,P.y,P.z)==='ice')return'Ice rink';
  if(surfaceAt(P.x,P.y,P.z)==='water')return'Park pond  ·  wading';
  if(P.x>=562&&P.x<900)return P.y<60?'Harbor Pier':P.y<72?'Harbor Quay':'Harbor Square';
  if(inRect(P.x,P.y,OFFICE))return'Office · '+(P.z%1?'Stairs':'Floor '+(Math.round(P.z)+1));
  if(inRect(P.x,P.y,TOWER)){
    if(P.z%1)return'Apartments · Stairs';
    if(P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT))return'Home · Flat '+MYDOOR.name;
    for(const d of FLATDOORS)if(d.z===P.z&&Math.hypot(P.x-(d.x+.5),P.y-(d.y+.1))<.9)return d.mine?'Flat '+d.name+' · your key fits':'Flat '+d.name+' · locked';
    return'Apartments · '+(P.z===0?'Lobby':'Floor '+(P.z+1));
  }
  if(inRect(P.x,P.y,PARK))return'Park';if(inRect(P.x,P.y,PLAZA))return'Station Plaza';
  if(P.x>200&&P.x<562)return P.y>=66&&P.y<=86?'Harbor Road':'Alley off Harbor Road';
  if(P.y>=66&&P.y<=86)return'Main Avenue';if(P.x>=86&&P.x<=104)return'Cross Street';return'Back alley';
}
const wpEl=document.getElementById('wp'),hpEl=document.getElementById('hp');let lastWp='';
function updateHud(){
  const fight=regionAt(P.x)===2&&P.z===0&&!FP;
  hpEl.style.display=fight?'block':'none';if(fight)hpEl.firstChild.style.width=Math.max(0,A.hp)+'%';
  const ap=aimedPress();
  const fpTip=!FP?'':ap?ap.tip()+'  ·  click':P.sit?(P.sit.horiz===undefined?'Sitting  ·  walk forward to stand up':'Sitting  ·  A / D to shuffle along, walk forward to stand up'):MYDOOR.grab?(MYDOOR.open<=0&&MYDOOR.h<.85?'drag down to unlatch':'drag sideways to swing the door'):
    aimingAtDoor()?(MYDOOR.open>0?'Door  ·  hold click and drag sideways':'Door  ·  hold click, drag down to unlatch, then sideways'):'';
  const lx=P.x-STATIONS[regionAt(P.x)].dx;
  const dcar=aimedCarDoor(),nc=nearCar();
  const wp=P.car?(FP?(P.car.door>.6?'Door open  ·  W or A to get out, or drag it shut to drive':dcar?'Door  ·  hold click and drag to open it (when stopped) and get out':'W / S to drive and brake, A / D to steer  ·  to get out: stop and open the door')
      :'The car follows the pointer: further away is faster, bring it back to brake  ·  click when stopped to get out'):
    FP&&dcar?(dcar.door>.6?'Door open  ·  turn round and back into the seat':'Car door  ·  hold click and drag to open'):FP&&nc&&nc.door>.6?'Back into the driver\'s seat to get in':!FP&&nc?'Walk up to the driver\'s door and step in':P.boat?(BOAT.docked?'Aboard  ·  hold click to take the tiller: forward for throttle, sideways to steer':'Tiller  ·  sideways steers, forward / back is the throttle  ·  drift in by the pier to tie up'):fpTip?fpTip:P.z===-1&&!gatesOpen()&&lx>118.6&&lx<121?'The gates are locked  ·  get a ticket from the machines':P.z===-1&&P.ticket&&lx>113.5&&lx<119&&P.y<104.5?'You have a ticket':regionAt(P.x)!==2||P.z!==0?'':FP?'Weapons work in top-down view (F)':A.msg>0?'You were knocked out  ·  back outside the gate':
    !A.cur?'Step on a pad to take a weapon  ·  kills '+A.kills:
    A.cur.name+': '+A.cur.help+(A.cur.id==='fire'?'  ·  fuel '+Math.round(A.fuel*100)+'%':'')+'  ·  kills '+A.kills;
  if(wp!==lastWp){lastWp=wp;wpEl.textContent=wp;wpEl.style.display=wp?'block':'none'}
  const l=locName();if(l!==lastLoc){lastLoc=l;locEl.textContent=l}
  if(P.lift!==hudLift){ // (re)build the floor buttons for whichever lift we are in
    hudLift=P.lift;elevEl.innerHTML='';
    if(hudLift){const n=hudLift.zmax-hudLift.zmin+1,cols=n>5?2:1;elevEl.style.setProperty('--cols',cols);
      const fs=[];for(let f=hudLift.zmax;f>=hudLift.zmin;f--)fs.push(f);
      if(cols===2)for(let i=0;i<fs.length;i+=2)[fs[i],fs[i+1]]=[fs[i+1],fs[i]];   // read left-to-right, top floor at the top
      for(const f of fs){const b=document.createElement('button');b.dataset.f=f;b.textContent=f+1;elevEl.appendChild(b)}}
  }
  elevEl.style.display=hudLift&&!FP?'grid':'none';   // first person uses the buttons in the car instead
  if(P.lift){const l=P.lift;for(const b of elevEl.children){const f=+b.dataset.f;b.classList.toggle('on',l.target===f||pendingBtn===f||(l.target===null&&l.z===f))}}
}

// ---------------------------------------------------------------- input
// Desktop: click to lock the pointer, then the mouse drives. Touch: drag like a trackpad.
const hintEl=document.getElementById('hint'),TOUCH=matchMedia('(pointer:coarse)').matches;
const locked=()=>document.pointerLockElement===cv;
function showHint(){hintEl.textContent=TOUCH?(FP?'Drag to look around':'Drag to move the pointer'):FP?'Click to look  ·  WASD to walk, Shift to run  ·  click things to use them  ·  Esc to let go':'Click to take the mouse  ·  Esc to let go  ·  in a lift: scroll or 1–0';hintEl.style.opacity=locked()?0:1}
document.addEventListener('pointerlockchange',showHint);
const liftStep=d=>{const l=P.lift;if(l&&!FP)pendingBtn=clamp((pendingBtn??l.target??Math.round(l.z))+d,l.zmin,l.zmax)};
const fpEl=document.getElementById('fp');
function setFP(on){FP=on;pitch=0;fpEl.textContent=FP?'Top-down view (F)':'First person (F)';ptrEl.style.display=FP?'none':'';document.getElementById('xh').style.display=FP?'block':'none';showHint()}
fpEl.addEventListener('click',()=>{setFP(!FP);fpEl.blur()});
document.getElementById('reset').addEventListener('click',e=>{resetSave();e.target.blur()});
setFP(false);
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
addEventListener('keydown',e=>{
  keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)setFP(!FP);
  if(e.code==='KeyR'&&e.shiftKey&&!e.repeat)resetSave();
  if(/^Digit\d$/.test(e.code)&&P.lift&&!FP)pendingBtn=(+e.code.slice(5)+9)%10;   // 1..9, and 0 for the tenth floor
  if(e.code==='ArrowUp'||e.code==='ArrowDown'){liftStep(e.code==='ArrowUp'?1:-1);e.preventDefault()}});
addEventListener('wheel',e=>{liftStep(e.deltaY<0?1:-1);e.preventDefault()},{passive:false});
let finger=null;
cv.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'){if(!locked()){const r=cv.requestPointerLock({unadjustedMovement:true});if(r&&r.catch)r.catch(()=>cv.requestPointerLock())}
    else if(e.button===0){A.down=true;A.click=true}else if(e.button===2)A.rclick=true}
  else if(!finger){finger={id:e.pointerId,x:e.clientX,y:e.clientY};hintEl.style.opacity=0;try{cv.setPointerCapture(e.pointerId)}catch(_){}}
  e.preventDefault()});
cv.addEventListener('pointermove',e=>{
  if(e.pointerType==='mouse'){if(locked()){input.dx+=e.movementX;input.dy+=e.movementY}}
  else if(finger&&e.pointerId===finger.id){input.dx+=e.clientX-finger.x;input.dy+=e.clientY-finger.y;finger.x=e.clientX;finger.y=e.clientY}});
const endFinger=e=>{if(finger&&e.pointerId===finger.id)finger=null};
addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button===0)A.down=false});
cv.addEventListener('pointerup',endFinger);cv.addEventListener('pointercancel',endFinger);
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
elevEl.addEventListener('pointerdown',e=>{e.preventDefault();const f=e.target.dataset&&e.target.dataset.f;if(P.lift&&f!==undefined)pendingBtn=+f});

// ---------------------------------------------------------------- loop
let last=performance.now();
function frame(now){const dt=clamp((now-last)/1000,0,.05);last=now;tick(dt);render();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
window.G={P,A,DCARS,exitCar,enterCar,PEDS,CARS,BOAT,resetSave,MYDOOR,CHAIRS,STOPS,WEAPONS,setFP,keys,CAR,TLIFT,TRAINS,input,tick,render,press:f=>{pendingBtn=f},get view(){return view},get bIn(){return bIn}};
