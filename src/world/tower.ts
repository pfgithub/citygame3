import { box } from './colliders';
import type { Group } from 'three';
import type { Rect } from '../types';
import { FL, type WinWall, addLift, addStair, ffurn, fround, fwall } from './floors';
import { type Roof, building, roofDetails } from './outdoors';

// Ten identical floors: a corridor with flats on both sides, a stair core and a
// lift. Every flat door is locked except the player's own.
export const TOWER={x:22,y:44,w:24,h:22},TDOORPT={x:34,y:65.85},TTOP=9,MYFLAT={z:6,id:'03'};
export const MYRECT={x:28.2,y:56,w:5.8,h:9.7};
building(-40,40,58,26);
export const TROOF:Roof={...TOWER,color:'#a39184',details:roofDetails(22,44,24,18)};
export const TLIFT=addLift(38.4,51.6,0,TTOP);
// Flat doors; only the player's own (`mine`) opens. `open` is how far (0..1).
export interface FlatDoor extends Rect{z:number,name:string,mine:boolean,open:number}
// The player's own door also has a handle: `handle` is how far it is turned, v how fast the door
// is swinging, grab whether it is held.
// pivot and lever are its meshes, set when the scene is built.
export interface MyDoor extends FlatDoor{handle:number,v:number,grab:boolean,pivot:Group,lever:Group}
export const FLATDOORS:FlatDoor[]=[];
function wallWin(z:number,x:number,y:number,w:number,h:number,starts:number[],len:number){
  const rec:WinWall={x,y,w,h,wins:[],len};FL[z].walls.push(rec);
  const horiz=w>h,a=horiz?x:y,b=a+(horiz?w:h);let c=a;
  const piece=(p:number,q:number)=>{if(q-p>.01)horiz?box(p,y,q-p,h,z-.5,z+.5,true):box(x,p,w,q-p,z-.5,z+.5,true)};
  for(const v of starts){if(v<a||v+len>b)continue;
    rec.wins.push(v);piece(c,v);horiz?box(v,y,len,h,z-.5,z+.5):box(x,v,w,len,z-.5,z+.5);c=v+len}
  piece(c,b);
}
for(let z=0;z<=TTOP;z++){
  const wx:number[]=[],wy:number[]=[];for(let v=23.5;v<44;v+=3)wx.push(v);for(let v=45.5;v<64;v+=3)wy.push(v);
  wallWin(z,22,44,24,.3,wx,1.8);wallWin(z,22,44,.3,22,wy,1.8);wallWin(z,45.7,44,.3,22,wy,1.8);
  if(z===0){wallWin(0,22,65.7,11,.3,wx,1.8);wallWin(0,35,65.7,11,.3,wx,1.8)}else wallWin(z,22,65.7,24,.3,wx,1.8);
  // corridor walls, leaving gaps for flat doors, the stair landings and the lift
  for(const[a,b]of[[22.3,25],[26,30.3],[31.5,36.5],[37.7,38.2],[40.8,43],[44,45.7]])fwall(z,a,53.8,b-a,.2);
  for(const[a,b]of z===0?[[22.3,24.7],[25.7,28.2],[40,42.4],[43.4,45.7]]:[[22.3,24.7],[25.7,30.6],[31.6,36.6],[37.6,42.4],[43.4,45.7]])fwall(z,a,55.8,b-a,.2);
  for(const x of z===0?[28,40]:[28,34,40])fwall(z,x,56,.2,9.7);
  fwall(z,29.8,44.3,.2,9.5);fwall(z,41,44.3,.2,9.5);
  fwall(z,30,50.4,11,.2);fwall(z,38.2,50.6,.2,.7);
  ffurn(z,30,44.3,11,6.1,'#2a2c31',{opq:1});       // service risers behind the core
  const flats:[string,number,number][]=[['01',25,53.8],['02',24.7,55.8],['03',30.6,55.8],['04',36.6,55.8],['05',42.4,55.8],['06',43,53.8]];
  for(const[id,x,y]of flats){
    if(z===0&&(id==='03'||id==='04'))continue;      // the lobby takes their place
    const d={z,x,y,w:1,h:.2,name:(z+1)+id,mine:z===MYFLAT.z&&id===MYFLAT.id,open:0};
    FLATDOORS.push(d);if(!d.mine)box(x,y,1,.2,z-.5,z+.5,true);
  }
  // scissor stairs: flights alternate between two lanes and directions
  if(z<TTOP)z%2===0?addStair(31.6,50.8,4.8,1.3,'E',z,z+1):addStair(31.6,52.3,4.8,1.3,'W',z,z+1);
}
ffurn(0,31.6,52.3,4.8,1.3,'#3a3d44',{opq:1});ffurn(TTOP,31.6,52.3,4.8,1.3,'#3a3d44',{opq:1});
export const MYDOOR=FLATDOORS.find(d=>d.mine) as MyDoor;MYDOOR.handle=0;MYDOOR.v=0;MYDOOR.grab=false;
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
