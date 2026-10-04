// Shapes shared across the game. World x/y are metres on the ground plane.
export interface Pt{x:number,y:number}
export interface Rect{x:number,y:number,w:number,h:number}
export interface Disc{cx:number,cy:number,r:number}
// A collider spans floor levels za..zb (the player collides while za <= z < zb).
export interface RectCol extends Rect{za:number,zb:number,opq?:boolean,pen?:number,r?:undefined}
export interface DiscCol extends Disc{za:number,zb:number}
export type Col=RectCol|DiscCol;
