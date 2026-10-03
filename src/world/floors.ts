import { Y } from '../constants';
import { box, circ } from './colliders';

export const FL={};
for(let z=-2;z<=9;z++)FL[z]={z,walls:[],furn:[],wins:[]};
export function fwall(z,x,y,w,h,opq=true){FL[z].walls.push({x,y,w,h});box(x,y,w,h,z-.5,z+.5,opq)}
export function ffurn(z,x,y,w,h,color,o={}){FL[z].furn.push({x,y,w,h,color,...o});if(!o.ghost)box(x,y,w,h,z-.5,z+.5,!!o.opq)}
export function fround(z,cx,cy,r,color,o={}){FL[z].furn.push({cx,cy,r,color,...o});if(!o.ghost)circ(cx,cy,r,z-.5,z+.5)}

// Stairs: a rectangle; dir is the direction of ascent. The player's z is a pure
// function of how far along the rectangle they are standing.
export const STAIRS=[];
export function addStair(x,y,w,h,dir,zl,zh){
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
export function stairT(s,px,py){switch(s.dir){
  case'N':return(s.y+s.h-py)/s.h;case'S':return(py-s.y)/s.h;
  case'W':return(s.x+s.w-px)/s.w;default:return(px-s.x)/s.w}}

// Lifts: a 2.2 m car whose door faces south. `door` is how far open it is (0..1).
export const LIFTS=[];
export function addLift(x,y,zmin,zmax){
  const l={x,y,w:2.2,h:2.2,dr:{x:x+.5,y:y+2.2,w:1.2,h:.2},call:{x:x-.7,y:y+2.4,w:3.6,h:3.2},zmin,zmax,z:zmin,door:0,target:null,src:null,moving:false,want:null,openT:0};
  for(let z=zmin;z<=zmax;z++){fwall(z,x-.2,y-.3,2.6,.3);fwall(z,x-.2,y-.3,.2,2.7);fwall(z,x+2.2,y-.3,.2,2.7);fwall(z,x-.2,y+2.2,.7,.2);fwall(z,x+1.7,y+2.2,.7,.2)}
  LIFTS.push(l);return l;
}
