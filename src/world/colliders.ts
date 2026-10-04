import type { Col } from '../types';

export const COL:Col[]=[];
export function box(x:number,y:number,w:number,h:number,za=-.5,zb=.5,opq=false,pen?:number){COL.push({x,y,w,h,za,zb,opq,pen})}   // opq: blocks line of sight
export function circ(cx:number,cy:number,r:number,za=-.5,zb=.5){COL.push({cx,cy,r,za,zb})}
