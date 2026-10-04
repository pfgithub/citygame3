import { pick, rnd, rr, segDist } from '../util';
import { box, circ } from './colliders';
import { OFFICE } from './office';
import type { Pt, Rect } from '../types';

export type Seg=[number,number,number,number];   // x1,y1,x2,y2
export interface RoofDetail extends Rect{c:string}
export interface Roof extends Rect{color:string,details:RoofDetail[]}
export interface Tree extends Pt{r:number,c:string}
export interface ParkedCar extends Rect{c:string}

export const OUT={roofs:[] as Roof[],trees:[] as Tree[],lamps:[] as Pt[],cars:[] as ParkedCar[],benches:[] as Rect[],planters:[] as Rect[],fence:[] as Seg[]};
const ROOFC=['#9a8f84','#8b949c','#a39a8a','#7f8791','#b0a595','#8a8f86','#9c8a80','#a6a096'];
export function roofDetails(x:number,y:number,w:number,h:number){const d:RoofDetail[]=[];const n=Math.floor(w*h/260)+2;
  for(let i=0;i<n;i++){const k=rnd();const dw=k<.6?rr(1.4,2.6):rr(3,5),dh=k<.6?rr(1.4,2.6):rr(1.5,2.5);
    d.push({x:rr(x+2,x+w-2-dw),y:rr(y+2,y+h-2-dh),w:dw,h:dh,c:k<.6?'#c3c6ca':'#a9d3e6'})}return d}
export function building(x:number,y:number,w:number,h:number){OUT.roofs.push({x,y,w,h,color:pick(ROOFC),details:roofDetails(x,y,w,h)});box(x,y,w,h,-.5,.5,true)}
pick(ROOFC);roofDetails(-40,40,90,26);   // (lot now holds the apartment tower; keeps the random sequence stable)
building(-40,-40,80,76);building(44,-40,42,82);
building(-40,86,82,30);building(46,86,40,26);building(-40,120,66,80);building(30,116,56,84);
building(140,86,100,28);building(104,116,44,84);building(152,118,88,82);
export const OFFROOF:Roof={...OFFICE,color:'#8f97a1',details:roofDetails(54,46,28,15)};
export const PARK={x:104,y:0,w:96,h:66}, PLAZA={x:104,y:86,w:32,h:26};
export const PATHS:Seg[]=[[120,66,120,50],[120,50,150,33],[172,66,172,50],[172,50,150,33],[104,32,150,33],
  [150,33,150,0],[150,33,168,24],[120,50,112,14],[112,14,150,8],[150,8,186,34],[186,34,172,50]];
export const FOUNT={x:150,y:33,r:2.6}, POND={x:181,y:17,rx:11,ry:7};
circ(FOUNT.x,FOUNT.y,FOUNT.r);
export function fenceSeg(x1:number,y1:number,x2:number,y2:number){OUT.fence.push([x1,y1,x2,y2]);
  box(Math.min(x1,x2)-.08,Math.min(y1,y2)-.08,Math.abs(x2-x1)+.16,Math.abs(y2-y1)+.16)}
fenceSeg(104,66,118,66);fenceSeg(122,66,170,66);fenceSeg(174,66,200,66);
fenceSeg(104,0,104,30);fenceSeg(104,34,104,66);
OUT.fence.push([104,0,200,0]);fenceSeg(200,0,200,66);
export function tree(x:number,y:number,r:number,solid:boolean){OUT.trees.push({x,y,r,c:pick(['#3f7d45','#4a8a4c','#37703f','#558f4a'])});if(solid)circ(x,y,.3)}
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
function bench(x:number,y:number,w:number,h:number){OUT.benches.push({x,y,w,h});box(x,y,w,h)}
for(let k=0;k<6;k++){const a=k*Math.PI/3+.52,bx=FOUNT.x+Math.cos(a)*6.3,by=FOUNT.y+Math.sin(a)*6.3;
  Math.abs(Math.cos(a))>.7?bench(bx-.3,by-.9,.6,1.8):bench(bx-.9,by-.3,1.8,.6)}
bench(117.6,56,.6,1.8);bench(173.8,56,.6,1.8);bench(128,30.2,1.8,.6);bench(166,13,1.8,.6);
// plaza
for(const[x,y,w,h]of[[117,88,1.4,8],[117,100,1.4,8],[126,90,6,1.4],[126,104,6,1.4]]){OUT.planters.push({x,y,w,h});box(x,y,w,h)}
bench(126.9,91.8,1.8,.6);bench(130.3,91.8,1.8,.6);bench(126.9,103,1.8,.6);bench(130.3,103,1.8,.6);
tree(129,97.5,3.2,true);tree(106.5,108,2.6,true);
circ(108.6,90.8,.12);
// street furniture
export function lamp(x:number,y:number){OUT.lamps.push({x,y});circ(x,y,.12)}
for(let x=6;x<200;x+=14){if(x>82&&x<108)continue;lamp(x,69.4);lamp(x+7,82.6);
  if(Math.abs(x+7-68)>5&&!(x+7>82&&x+7<108))tree(x+7,68.9,1.9,true);
  if(!(x>82&&x<108)&&!(x>104&&x<137))tree(x,83.1,1.9,true)}
for(let y=8;y<160;y+=14){if(y>62&&y<90)continue;lamp(89.4,y);lamp(100.6,y+7>62&&y+7<90?y:y+7)}
export const CARC=['#b33b34','#2f5d9b','#e4e4e2','#2b2d31','#8a8f96','#d7b23c','#3c7a57','#6b4a8a'];
export function car(x:number,y:number){const c={x,y,w:rr(4.2,4.8),h:1.85,c:pick(CARC)};OUT.cars.push(c);box(c.x,c.y,c.w,c.h)}
for(const x of[6,12.5,26,39,45.5,58,74,112,125,131.5,152,165,184])car(x,70.2);
for(const x of[10,23,29.5,50,63,69.5,116,138,144.5,158,177,190])car(x,79.95);

// harbour: the surface around the second station
export const HARBOR={x:560,y:42,w:120,h:88},HPLANT:Seg[]=[[590,78,6,1.4],[628,78,6,1.4]],BOLLARDS:number[]=[];
pick(ROOFC);roofDetails(520,56,44,90);   // (this block was split to let the avenue through; keeps the random sequence stable)
building(676,56,44,90);building(564,108,50,40);building(618,108,58,40);building(644,82,9,6);
fenceSeg(564,60,617,60);fenceSeg(623,60,676,60);fenceSeg(617,42,617,60);fenceSeg(623,42,623,47);fenceSeg(623,50,623,60);fenceSeg(617,42,623,42);   // (gap in the pier rail where the boat ties up)
for(let x=570;x<676;x+=8){if(x>612&&x<628)continue;circ(x,61,.22);BOLLARDS.push(x)}
for(const x of[580,596,640,656])bench(x,63.5,1.8,.6);
for(const x of[574,598,634,662])lamp(x,73);
for(const[x,y,w,h]of HPLANT)box(x,y,w,h);
tree(585,86,2.8,true);tree(600,98,2.4,true);tree(634,98,2.6,true);tree(664,92,3,true);
circ(608.6,90.8,.12);
