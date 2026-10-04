import type { Group, Mesh } from 'three';
import type { Pt, Rect } from '../types';
import { CAR, DOORPT, OFFICE } from './office';
import { OFFROOF, type Roof } from './outdoors';
import { TDOORPT, TLIFT, TOWER, TROOF, TTOP } from './tower';

// The two buildings you can go into. top: the highest storey; bIn: how far inside the player
// is (0..1). ext (the closed exterior) and levels (one group per storey) are set when the
// scene is built.
export interface Building{rect:Rect,door:Pt,roof:Roof,top:number,awning:string,bIn:number,ext:Mesh,levels:Group[]}
export const BUILDINGS=[
  {rect:OFFICE,door:DOORPT,roof:OFFROOF,top:2,awning:'#8c3f37',bIn:0},
  {rect:TOWER,door:TDOORPT,roof:TROOF,top:TTOP,awning:'#3d5a80',bIn:0}] as Building[];
CAR.owner=BUILDINGS[0];TLIFT.owner=BUILDINGS[1];
