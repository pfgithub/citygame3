import { R } from '../constants';
import { solidAt } from './collide';
import { P } from '../state';
import { clamp, inRect } from '../util';
import { FL } from '../world/floors';
import { OUT } from '../world/outdoors';
import { TL, TW } from '../world/subway';
import { TTOP } from '../world/tower';
import type { Train } from '../world/subway';
import type { Pt, Rect } from '../types';

// A seat is either a spot (a chair; out: 0, you stand up where you sat) or a stretch: `p` along
// its length (between min and max), `q` across, in the frame of the train it belongs to if any.
// out: how far from its middle you step to stand up; rect: the seat itself, if it is not in a train.
export interface Spot extends Pt{out:number,horiz?:undefined,rect?:undefined}
export interface Stretch{p:number,q:number,horiz:boolean,min:number,max:number,tr:Train|null,rect:Rect|null,out:number}
export type Seat=Spot|Stretch;
interface Bench extends Rect{z:number}

// Seats you can sit on in first person: the loose chairs around desks and tables.
export const CHAIRS:(Pt&{z:number})[]=[];
for(let z=0;z<=TTOP;z++)for(const f of FL[z].furn)if(f.r!==undefined&&f.ghost&&(f.color==='#3b4350'||f.color==='#b5563f'))CHAIRS.push({x:f.cx,y:f.cy,z});
// Long seats: benches (park, plazas, quay, stations), sofas, the bed, and the seating in the
// trains. You sit wherever along them you back in, and can shuffle along once seated.
const BENCHES:Bench[]=[...OUT.benches.map(b=>({...b,z:0}))];
for(let z=-2;z<=TTOP;z++)for(const f of FL[z].furn)if(f.r===undefined&&!f.ghost&&(f.color==='#7a6248'||f.color==='#5d6f86'||f.color==='#e8e2d6'))BENCHES.push({x:f.x,y:f.y,w:f.w,h:f.h,z});
const TSEATS:(Rect&{loose:boolean})[]=[];for(let i=0;i<4;i++)for(const[a,b]of[[.8,3.9],[5.8,9],[10.9,14],[15.9,17.7]])for(const sy of[.15,TW-.6])TSEATS.push({x:i*TL/4+a,y:sy,w:b-a,h:.45,loose:true});
export const seatXY=(st:Seat):Pt=>st.horiz===undefined?st:{x:(st.tr?st.tr.x:0)+(st.horiz?st.p:st.q),y:(st.tr?st.tr.y:0)+(st.horiz?st.q:st.p)};
// Where to put the player's feet when they get up: off the seat towards where they are looking
// if that is clear, otherwise off whichever side of the seat is. Never through a wall.
export function standSpot(st:Seat){
  const s=seatXY(st);if(!st.out)return s;
  const fx=Math.cos(P.a),fy=Math.sin(P.a),dirs:[number,number][]=[[fx,fy]];
  if(st.horiz!==undefined){const n:[number,number][]=st.horiz?[[0,1],[0,-1]]:[[1,0],[-1,0]];n.sort((a,b)=>(b[0]*fx+b[1]*fy)-(a[0]*fx+a[1]*fy));dirs.push(...n)}
  for(const[dx,dy]of dirs){
    const tx=s.x+dx*st.out,ty=s.y+dy*st.out;if(solidAt(tx,ty,R-.02))continue;
    let clear=true;for(let k=1;k<8&&clear;k++){const x=s.x+dx*st.out*k/8,y=s.y+dy*st.out*k/8;
      if(st.rect&&inRect(x,y,st.rect))continue;                    // still over the seat itself
      if(solidAt(x,y,0))clear=false}
    if(clear)return{x:tx,y:ty}}
  return null;
}
export function seatBehind():Seat|null{
  const c=Math.cos(P.a),sn=Math.sin(P.a),behind=(x:number,y:number,reach:number)=>{const dx=x-P.x,dy=y-P.y,d=Math.hypot(dx,dy);return d<reach&&dx*c+dy*sn<-.45*d};
  const ch=CHAIRS.find(q=>q.z===P.z&&behind(q.x,q.y,.62));if(ch)return{x:ch.x,y:ch.y,out:0};
  const stretch=(r:Rect&{loose?:boolean},tr:Train|null):Stretch|null=>{const ox=tr?tr.x:0,oy=tr?tr.y:0,horiz=r.w>r.h,half=Math.min(r.w,r.h)/2,e=Math.min(.3,Math.max(r.w,r.h)/2);
    const min=(horiz?r.x:r.y)+e,max=(horiz?r.x+r.w:r.y+r.h)-e,p=clamp(horiz?P.x-ox:P.y-oy,min,max),q=horiz?r.y+r.h/2:r.x+r.w/2;
    return behind(ox+(horiz?p:q),oy+(horiz?q:p),half+R+.25)?{p,q,horiz,min,max,tr,rect:tr?null:r,out:r.loose?.45:half+R+.07}:null};
  for(const b of BENCHES)if(b.z===P.z){const st=stretch(b,null);if(st)return st}
  if(P.train)for(const r of TSEATS){const st=stretch(r,P.train);if(st)return st}
  return null;
}
