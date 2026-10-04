// Walkable surface regions: the city, and the harbour at the far end of the subway line.
export const REGIONS=[{x0:0,y0:0,x1:200,y1:160},{x0:560,y0:42,x1:680,y1:130},{x0:1052,y0:-8,x1:1168,y1:106}];
export const regionAt=(x:number)=>x<400?0:x<900?1:2;   // which stop of the line a given x belongs to
export const R=0.25;                       // player radius (shoulder width 0.5 m)
export const VIEW_OUT=34, VIEW_IN=12;      // metres visible across the short screen side
export const SPEED_IN=3.6;                 // m/s for scripted input (tests); the mouse itself has no speed limit
export const LH=3.6,WALL_H=2.7,Y=(z:number)=>z*LH;            // storey height, wall height, level -> metres up
