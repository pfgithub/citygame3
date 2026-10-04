import { clamp, lerp } from '../util';
import { box } from './colliders';
import type { Group, Mesh } from 'three';
import type { Art } from '../render/mesh';
import type { Pt, Rect, RectCol } from '../types';
import { addStair, ffurn, fwall } from './floors';

// One line, three stations LINE_D apart. Trains run a one-way loop: east on the south
// track, west on the north track, crossing over just before each terminus so that a
// terminus only ever uses one platform edge.
// Stations are identical boxes; everything is built at an x offset.
export const LINE_D=500,TL=74,TW=2.9,TRUN=9,TDWELL=2,DOCK=108,TDW=1.3;
// screens: the platform screen walls. The rest is filled in when the scene is built: the
// concourse and platform groups, the platform's picture (for its signs), and the screen doors.
export interface Station{dx:number,name:string,screens:Rect[],g1:Group,g2:Group,art:Art,doors:[Mesh,Mesh][][]}
export const STATIONS=([{dx:0,name:'Central'},{dx:LINE_D,name:'Harbor'},{dx:2*LINE_D,name:'Arena'}] as Station[]);
export const TDOORS:number[]=[];for(let i=0;i<4;i++)for(const d of[4.2,9.3,14.3])TDOORS.push(i*18.5+d);   // door offsets along a train
export const TRACKY=[103.9,120.2];   // top edge of the train on the north / south track
export const EDGEY=[106.8,120];      // platform screen wall on each side
export const CONC={x:104,y:102,w:38,h:15},PLAT={x:100,y:107,w:90,h:13};
function buildStation(st:Station){
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
    const scr=(a:number,b:number)=>{st.screens.push({x:a,y:ey,w:b-a,h:.2});box(a,ey,b-a,.2,-2.5,-1.5)};
    for(const o of TDOORS){scr(c,dx+DOCK+o);c=dx+DOCK+o+TDW}scr(c,dx+190)}
  for(let x=106;x<188;x+=9){if(x>124&&x<141)continue;
    ffurn(-2,dx+x-.3,109.6,.6,.6,'#6f757d');ffurn(-2,dx+x-.3,116.8,.6,.6,'#6f757d')}
  for(const x of[108,152,170])ffurn(-2,dx+x,113.2,2.2,.6,'#7a6248');
}
STATIONS.forEach(buildStation);
// Ticket gates: the gaps between the turnstile posts. An arm bars each one unless you hold a
// ticket (or are already inside and on your way out).
// o: how far the arm has swung aside; pivot is set when the scene is built.
export interface Gate{cx:number,y:number,cy:number,o:number,pivot:Group}
export const GATES:Gate[]=[];
for(const st of STATIONS)for(let k=0;k<8;k++)GATES.push({cx:st.dx+121,y:105.3+k*1.1,cy:105.7+k*1.1,o:0} as Gate);
// The loop, as the platform edges a train calls at in order (k: 0 = north track, 1 = south track).
export const STOPS=[{si:0,k:1},{si:1,k:1},{si:2,k:0},{si:1,k:0}];
export const CROSS=[{a:760,b:900},{a:250,b:390}];     // train x over which it changes track: before Arena, before Central
export const stopX=(i:number)=>DOCK+STATIONS[STOPS[i].si].dx;
export function trainY(leg:number,x:number){ // top edge of a train at x while running from stop `leg` to the next
  const c=leg===1?CROSS[0]:leg===3?CROSS[1]:null;if(!c)return TRACKY[STOPS[leg].k];
  const t=clamp((x-c.a)/(c.b-c.a));return lerp(TRACKY[1],TRACKY[0],t*t*(3-2*t));
}
// A train is at stop i of the loop (or running from it to the next). t: time dwelt, u: how far
// along the run, door: how far open; vx, vy: its velocity. g and doors are its meshes, set when the scene is built.
export interface Train{i:number,x:number,y:number,vx:number,vy:number,phase:'dwell'|'closing'|'run',t:number,u:number,door:number,col:string,g:Group,doors:[Mesh,Mesh][][]}
export const TRAINS=['#d2452f','#2f6fd2','#e0a526'].map((col,i)=>({i,x:stopX(i),y:TRACKY[STOPS[i].k],vx:0,vy:0,phase:'dwell',t:0,u:0,door:0,col}) as Train);
// The solid parts of a train where it is right now: hull walls, and the doors down each side.
export function trainParts(tr:Pt){
  const x=tr.x,y=tr.y,t=.15,z={za:-2.5,zb:-1.5};
  const walls:RectCol[]=[{x,y,w:t,h:TW,...z},{x:x+TL-t,y,w:t,h:TW,...z}],doors:RectCol[][]=[[],[]];
  for(const k of[0,1]){const wy=k?y:y+TW-t;let c=x;   // the door side faces the platform: south wall on the north track
    for(const o of TDOORS){walls.push({x:c,y:wy,w:x+o-c,h:t,...z});doors[k].push({x:x+o,y:wy,w:TDW,h:t,...z});c=x+o+TDW}
    walls.push({x:c,y:wy,w:x+TL-c,h:t,...z})}
  return{walls,doors};
}
export const sideOpen=(tr:Train,k:number)=>tr.phase!=='run'&&STOPS[tr.i].k===k?tr.door:0;
export const dockedDoor=(si:number,k:number)=>{for(const tr of TRAINS){const s=STOPS[tr.i];if(s.k===k&&s.si===si&&tr.phase!=='run')return tr.door}return 0};
