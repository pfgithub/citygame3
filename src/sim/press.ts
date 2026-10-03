import { Y } from '../constants';
import { P, S } from '../state';
import { LIFTS } from '../world/floors';
import { STATIONS } from '../world/subway';

// Things you can press in first person by putting the crosshair on them and clicking.
// pos() gives where the thing is right now (or null if it is not on the player's level).
export const PRESS=[];
export function aimedPress(){
  if(!S.fp)return null;
  const ex=P.x,ey=Y(P.z)+S.eyeH,ez=P.y,cp=Math.cos(S.pitch),dx=Math.cos(P.a)*cp,dy=Math.sin(S.pitch),dz=Math.sin(P.a)*cp;let best=null,bd=2.2;
  for(const t of PRESS){const q=t.pos();if(!q)continue;
    const vx=q.x-ex,vy=q.h-ey,vz=q.y-ez,along=vx*dx+vy*dy+vz*dz;if(along<.1||along>bd)continue;
    if(Math.hypot(vx-dx*along,vy-dy*along,vz-dz*along)<t.r){bd=along;best=t}}
  return best;
}
// Lift buttons: a panel of floor buttons on the car's east wall, and a call button beside the door on every floor.
export const panelOf=l=>{const n=l.zmax-l.zmin+1,cols=n>5?2:1,rows=Math.ceil(n/cols);return{n,cols,rows,pw:cols*.13,ph:rows*.11,cy:l.y+1.05,ch:1.3}};
for(const l of LIFTS){const pn=panelOf(l);
  for(let i=0;i<pn.n;i++){const f=l.zmin+i,col=i%pn.cols,row=Math.floor(i/pn.cols);
    PRESS.push({r:.05,tip:()=>'Floor '+(f+1),act:()=>{S.pendingBtn=f},
      pos:()=>P.lift===l?{x:l.x+l.w-.2,y:pn.cy+((col+.5)/pn.cols-.5)*pn.pw,h:Y(l.z)+pn.ch+((row+.5)/pn.rows-.5)*pn.ph}:null})}
  for(let z=l.zmin;z<=l.zmax;z++)PRESS.push({r:.09,tip:()=>'Call the lift',act:()=>{l.want=z},
    pos:()=>Math.abs(P.z-z)<.01&&P.lift!==l?{x:l.dr.x+l.dr.w+.32,y:l.y+2.43,h:Y(z)+1.1}:null});
}
for(const st of STATIONS)for(let k=0;k<3;k++)PRESS.push({r:.32,tip:()=>P.ticket?'Ticket machine  ·  you already have a ticket':'Ticket machine  ·  buy a ticket',act:()=>{P.ticket=true},
  pos:()=>P.z===-1?{x:st.dx+114.75+k*1.5,y:102.72,h:Y(-1)+1.25}:null});
