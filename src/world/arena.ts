import { circ } from './colliders';
import { building, fenceSeg, lamp } from './outdoors';

export const FIELD={x0:1053,y0:-7,x1:1167,y1:72.5};
export interface Weapon{id:string,name:string,c:string,help:string,x:number,y:number}   // x, y: its pad
export const WEAPONS=([
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
  {id:'shot',name:'Shotgun',c:'#3a3d44',help:'click to fire a cone behind you; the recoil throws you forward'}] as Weapon[]);
WEAPONS.forEach((w,i)=>{w.x=1059+i*8.5;w.y=82});
building(1012,-48,40,196);building(1168,-48,40,196);building(1052,-48,116,40);building(1052,106,116,40);
fenceSeg(1052,74,1104,74);fenceSeg(1119,74,1168,74);
for(const[x,y]of[[1060,88],[1160,88],[1060,100],[1160,100]])lamp(x,y);
circ(1108.6,90.8,.12);
