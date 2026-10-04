import { inRect } from '../util';
import { box } from './colliders';
import { POND } from './outdoors';
import type { Rect } from '../types';

// Two kinds of ground change how you move: the ice rink on the harbour square (you keep your
// momentum and can only nudge it) and the park pond (shallow enough to wade, slowly).
export const RINK={x:566.5,y:89.5,w:29,h:17},RINKB:Rect[]=[];
for(const[x,y,w,h]of[[566.3,89.3,11.7,.2],[584,89.3,11.7,.2],[566.3,106.5,29.4,.2],[566.3,89.3,.2,17.4],[595.5,89.3,.2,17.4]]){RINKB.push({x,y,w,h});box(x,y,w,h)}
export type Surface='ice'|'water'|null;
export function surfaceAt(x:number,y:number,z:number):Surface{
  if(z!==0)return null;if(inRect(x,y,RINK))return'ice';
  const dx=(x-POND.x)/POND.rx,dy=(y-POND.y)/POND.ry;return dx*dx+dy*dy<1?'water':null;
}
