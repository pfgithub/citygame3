import './style.css';
// Module evaluation order matters: the world is built as its modules load, drawing from one
// shared random sequence, so they are imported here in the order the city is laid out.
import './world/office';
import './world/subway';
import './world/outdoors';
import './world/tower';
import './world/arena';
import './world/surfaces';
import './world/harbourRoad';
import './world/buildings';
// The player (and their saved position) before anything that is placed relative to them.
import { P, S, input, keys } from './state';
import { resetSave } from './sim/save';
import { CARS } from './sim/traffic';
import { PEDS } from './sim/peds';
import { DCARS, enterCar, exitCar } from './sim/driving';
import { BOAT } from './sim/boat';
import { A } from './sim/arena';
import { CHAIRS } from './sim/seats';
import { tick } from './sim/tick';
// The 3D scene, in the order its parts are added.
import './render/sceneCity';
import './render/sceneBuildings';
import './render/sceneSubway';
import './render/arena';
import './render/sceneMovers';
import { render } from './render/view';
import { setFP } from './input';
import { clamp } from './util';
import { WEAPONS } from './world/arena';
import { CAR } from './world/office';
import { STOPS, TRAINS } from './world/subway';
import { MYDOOR, TLIFT } from './world/tower';

// ---------------------------------------------------------------- loop
let last=performance.now();
function frame(now:number){const dt=clamp((now-last)/1000,0,.05);last=now;tick(dt);render();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
// For scripted tests.
declare global{interface Window{G:unknown}}
window.G={P,A,DCARS,exitCar,enterCar,PEDS,CARS,BOAT,resetSave,MYDOOR,CHAIRS,STOPS,WEAPONS,setFP,keys,CAR,TLIFT,TRAINS,input,tick,render,press:(f:number)=>{S.pendingBtn=f},get view(){return S.view},get bIn(){return S.bIn}};
