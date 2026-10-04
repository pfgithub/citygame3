import { regionAt } from './constants';
import { A } from './sim/arena';
import { BOAT } from './sim/boat';
import { aimingAtDoor } from './sim/door';
import { aimedCarDoor, nearCar } from './sim/driving';
import { aimedPress } from './sim/press';
import { gatesOpen } from './sim/trains';
import { P, S } from './state';
import { inRect } from './util';
import { OFFICE } from './world/office';
import { PARK, PLAZA } from './world/outdoors';
import { STATIONS, STOPS } from './world/subway';
import { surfaceAt } from './world/surfaces';
import { FLATDOORS, MYDOOR, MYFLAT, MYRECT, TOWER } from './world/tower';
import type { Lift } from './world/floors';

const el=(id:string)=>document.getElementById(id) as HTMLElement;
export const ptrEl=el('ptr');
const locEl=el('loc');export const elevEl=el('elev');let lastLoc='',hudLift:Lift|null=null;
function locName(){return(P.car?'Driving  ·  ':'')+locBase()}
function locBase(){
  if(P.lift){const l=P.lift;return'Lift · '+(l.moving?(l.target!>l.z?'going up':'going down')+' · '+(Math.round(l.z)+1):'Floor '+(Math.round(l.z)+1))}
  if(P.train){const t=P.train;return'Train · '+(t.phase==='run'?'to '+STATIONS[STOPS[(t.i+1)%STOPS.length].si].name:'at '+STATIONS[STOPS[t.i].si].name)}
  const ri=regionAt(P.x),sn=STATIONS[ri].name;
  if(P.z<-1.5)return sn+' Station · Platform';if(P.z<-.5)return sn+' Station · Concourse';
  if(P.z<-.01)return sn+' Station entrance';
  if(ri===2)return'Arena'+(A.cur?' · '+A.cur.name:'');
  if(P.boat)return'Harbor  ·  aboard the boat';
  if(surfaceAt(P.x,P.y,P.z)==='ice')return'Ice rink';
  if(surfaceAt(P.x,P.y,P.z)==='water')return'Park pond  ·  wading';
  if(P.x>=562&&P.x<900)return P.y<60?'Harbor Pier':P.y<72?'Harbor Quay':'Harbor Square';
  if(inRect(P.x,P.y,OFFICE))return'Office · '+(P.z%1?'Stairs':'Floor '+(Math.round(P.z)+1));
  if(inRect(P.x,P.y,TOWER)){
    if(P.z%1)return'Apartments · Stairs';
    if(P.z===MYFLAT.z&&inRect(P.x,P.y,MYRECT))return'Home · Flat '+MYDOOR.name;
    for(const d of FLATDOORS)if(d.z===P.z&&Math.hypot(P.x-(d.x+.5),P.y-(d.y+.1))<.9)return d.mine?'Flat '+d.name+' · your key fits':'Flat '+d.name+' · locked';
    return'Apartments · '+(P.z===0?'Lobby':'Floor '+(P.z+1));
  }
  if(inRect(P.x,P.y,PARK))return'Park';if(inRect(P.x,P.y,PLAZA))return'Station Plaza';
  if(P.x>200&&P.x<562)return P.y>=66&&P.y<=86?'Harbor Road':'Alley off Harbor Road';
  if(P.y>=66&&P.y<=86)return'Main Avenue';if(P.x>=86&&P.x<=104)return'Cross Street';return'Back alley';
}
const wpEl=el('wp'),hpEl=el('hp');let lastWp='';
export function updateHud(){
  const fight=regionAt(P.x)===2&&P.z===0&&!S.fp;
  hpEl.style.display=fight?'block':'none';if(fight)(hpEl.firstChild as HTMLElement).style.width=Math.max(0,A.hp)+'%';
  const ap=aimedPress();
  const fpTip=!S.fp?'':ap?ap.tip()+'  ·  click':P.sit?(P.sit.horiz===undefined?'Sitting  ·  walk forward to stand up':'Sitting  ·  A / D to shuffle along, walk forward to stand up'):MYDOOR.grab?(MYDOOR.open<=0&&MYDOOR.handle<.85?'drag down to unlatch':'drag sideways to swing the door'):
    aimingAtDoor()?(MYDOOR.open>0?'Door  ·  hold click and drag sideways':'Door  ·  hold click, drag down to unlatch, then sideways'):'';
  const lx=P.x-STATIONS[regionAt(P.x)].dx;
  const dcar=aimedCarDoor(),nc=nearCar();
  const wp=P.car?(S.fp?(P.car.door>.6?'Door open  ·  W or A to get out, or drag it shut to drive':dcar?'Door  ·  hold click and drag to open it (when stopped) and get out':'W / S to drive and brake, A / D to steer  ·  to get out: stop and open the door')
      :'The car follows the pointer: further away is faster, bring it back to brake  ·  click when stopped to get out'):
    S.fp&&dcar?(dcar.door>.6?'Door open  ·  turn round and back into the seat':'Car door  ·  hold click and drag to open'):S.fp&&nc&&nc.door>.6?'Back into the driver\'s seat to get in':!S.fp&&nc?'Walk up to the driver\'s door and step in':P.boat?(BOAT.docked?'Aboard  ·  hold click to take the tiller: forward for throttle, sideways to steer':'Tiller  ·  sideways steers, forward / back is the throttle  ·  drift in by the pier to tie up'):fpTip?fpTip:P.z===-1&&!gatesOpen()&&lx>118.6&&lx<121?'The gates are locked  ·  get a ticket from the machines':P.z===-1&&P.ticket&&lx>113.5&&lx<119&&P.y<104.5?'You have a ticket':regionAt(P.x)!==2||P.z!==0?'':S.fp?'Weapons work in top-down view (F)':A.msg>0?'You were knocked out  ·  back outside the gate':
    !A.cur?'Step on a pad to take a weapon  ·  kills '+A.kills:
    A.cur.name+': '+A.cur.help+(A.cur.id==='fire'?'  ·  fuel '+Math.round(A.fuel*100)+'%':'')+'  ·  kills '+A.kills;
  if(wp!==lastWp){lastWp=wp;wpEl.textContent=wp;wpEl.style.display=wp?'block':'none'}
  const l=locName();if(l!==lastLoc){lastLoc=l;locEl.textContent=l}
  if(P.lift!==hudLift){ // (re)build the floor buttons for whichever lift we are in
    hudLift=P.lift;elevEl.innerHTML='';
    if(hudLift){const n=hudLift.zmax-hudLift.zmin+1,cols=n>5?2:1;elevEl.style.setProperty('--cols',String(cols));
      const fs:number[]=[];for(let f=hudLift.zmax;f>=hudLift.zmin;f--)fs.push(f);
      if(cols===2)for(let i=0;i<fs.length;i+=2)[fs[i],fs[i+1]]=[fs[i+1],fs[i]];   // read left-to-right, top floor at the top
      for(const f of fs){const b=document.createElement('button');b.dataset.f=String(f);b.textContent=String(f+1);elevEl.appendChild(b)}}
  }
  elevEl.style.display=hudLift&&!S.fp?'grid':'none';   // first person uses the buttons in the car instead
  if(P.lift){const l=P.lift;for(const b of elevEl.children as HTMLCollectionOf<HTMLElement>){const f=+b.dataset.f!;b.classList.toggle('on',l.target===f||S.pendingBtn===f||(l.target===null&&l.z===f))}}
}
