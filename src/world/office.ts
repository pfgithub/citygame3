import { box } from './colliders';
import { FL, type WinWall, addLift, addStair, ffurn, fround, fwall } from './floors';

export const OFFICE={x:54,y:46,w:28,h:20};
export const DOORPT={x:68,y:65.85};
export const CAR=addLift(70,46.6,0,2);
// Outer wall with windows: solid to walk into, but sight passes through the panes.
const WIN={first:2,step:3,len:1.9};
function winStarts(z:number,horiz:boolean,south:boolean){const o=OFFICE,a=horiz?o.x:o.y,n=horiz?o.w:o.h,r:number[]=[];
  for(let v=a+WIN.first;v<a+n-2;v+=WIN.step)if(!(horiz&&south&&z===0&&v>=65&&v<=70))r.push(v);return r}
function owall(z:number,x:number,y:number,w:number,h:number){
  const rec:WinWall={x,y,w,h,wins:[],len:WIN.len};FL[z].walls.push(rec);
  const horiz=w>h,a=horiz?x:y,b=a+(horiz?w:h);let c=a;
  const piece=(p:number,q:number)=>{if(q-p>.01)horiz?box(p,y,q-p,h,z-.5,z+.5,true):box(x,p,w,q-p,z-.5,z+.5,true)};
  for(const v of winStarts(z,horiz,y>OFFICE.y+1)){if(v<a||v+WIN.len>b)continue;
    rec.wins.push(v);piece(c,v);horiz?box(v,y,WIN.len,h,z-.5,z+.5):box(x,v,w,WIN.len,z-.5,z+.5);c=v+WIN.len}
  piece(c,b);
}
for(const z of[0,1,2]){
  owall(z,54,46,28,.3);owall(z,54,46,.3,20);owall(z,81.7,46,.3,20);
  if(z===0){owall(0,54,65.7,13,.3);owall(0,69,65.7,13,.3)}else owall(z,54,65.7,28,.3);
}
addStair(74,49,1.4,6,'N',0,1);
addStair(75.6,49,1.4,6,'S',1,2);
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
