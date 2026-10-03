import { CAR, DOORPT, OFFICE } from './office';
import { OFFROOF } from './outdoors';
import { TDOORPT, TLIFT, TOWER, TROOF, TTOP } from './tower';

export const BUILDINGS=[
  {rect:OFFICE,door:DOORPT,roof:OFFROOF,top:2,awning:'#8c3f37',bIn:0},
  {rect:TOWER,door:TDOORPT,roof:TROOF,top:TTOP,awning:'#3d5a80',bIn:0}];
CAR.owner=BUILDINGS[0];TLIFT.owner=BUILDINGS[1];
