import { ALL, GROUND, addBox, addCircle, bands, setFilter, type ShapeId } from '../physics';
import type { Col, RectCol } from '../types';

// Every collider is also a fixed shape in the physics world, solid on the floor levels za..zb.
export const COL:Col[]=[];
export function box(x:number,y:number,w:number,h:number,za=-.5,zb=.5,opq=false,pen?:number){COL.push({x,y,w,h,za,zb,opq,pen});addBox(GROUND,x+w/2,y+h/2,w/2,h/2,bands(za,zb),ALL)}   // opq: blocks line of sight
export function circ(cx:number,cy:number,r:number,za=-.5,zb=.5){COL.push({cx,cy,r,za,zb});addCircle(GROUND,cx,cy,r,bands(za,zb),ALL)}
// Something that opens and shuts (doors, gate arms, rope): a fixed shape that is switched off
// while open. `skip` leaves out a level (a lift door is open only on the floor the car is at).
export interface Gate extends RectCol{on:boolean,sh:ShapeId,bits:number,skip:number}
export const GATES_ALL:Gate[]=[];
export function gate(x:number,y:number,w:number,h:number,za:number,zb:number):Gate{
  const bits=bands(za,zb),g={x,y,w,h,za,zb,on:true,bits,skip:0,sh:addBox(GROUND,x+w/2,y+h/2,w/2,h/2,bits,ALL)};GATES_ALL.push(g);return g}
export function setGate(g:Gate,on:boolean,skip=0){g.on=on;g.skip=skip;setFilter(g.sh,on?g.bits&~skip:0,ALL)}
// Walls only some things bump into: the edge of the walkable world, and the like.
export function wall(x:number,y:number,w:number,h:number,cat:number,mask:number){addBox(GROUND,x+w/2,y+h/2,w/2,h/2,cat,mask)}
