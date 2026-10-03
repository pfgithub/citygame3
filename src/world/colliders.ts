export const COL=[];
export function box(x,y,w,h,za=-.5,zb=.5,opq=false,pen){COL.push({x,y,w,h,za,zb,opq,pen})}   // opq: blocks line of sight
export function circ(cx,cy,r,za=-.5,zb=.5){COL.push({cx,cy,r,za,zb})}
