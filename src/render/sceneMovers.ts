import * as THREE from 'three';
import { Y, regionAt } from '../constants';
import { MB, UNIT, dynBox, fpAdd, shade } from './mesh';
import { OUTG } from './sceneCity';
import { BOAT } from '../sim/boat';
import { DCARS, DOOR_L, HINGE } from '../sim/driving';
import { PEDS } from '../sim/peds';
import { CARS } from '../sim/traffic';
import { lamp } from '../world/outdoors';
import { GATES, STATIONS } from '../world/subway';

// ticket gate arms: hinged on the post, pushed aside by whoever walks through
for(const g of GATES){g.pivot=new THREE.Group();g.pivot.position.set(g.cx,Y(-1),g.y);
  const mb=new MB();mb.box(-.03,0,.06,.78,.95,1.03,'#c9cdd3');mb.box(-.05,0,.1,.1,.6,1.05,'#8e949c');g.pivot.add(mb.mesh());
  STATIONS[regionAt(g.cx)].g1.add(g.pivot)}

// traffic: moving cars and the signals
for(const c of CARS){const mb=new MB(),L=c.len;
  mb.box(-L/2,-.92,L,1.84,.22,.85,shade(c.col,.85),c.col);mb.box(-L*.26,-.78,L*.48,1.56,.85,1.38,'#26303b',c.col);
  mb.box(L/2-.04,-.8,.06,.4,.5,.7,'#fff6c8');mb.box(L/2-.04,.4,.06,.4,.5,.7,'#fff6c8');
  mb.box(-L/2-.02,-.8,.06,.4,.5,.7,'#c03a34');mb.box(-L/2-.02,.4,.06,.4,.5,.7,'#c03a34');
  c.g=mb.mesh();c.g.rotation.y=c.ln.ax==='x'?(c.ln.dir>0?0:Math.PI):(c.ln.dir>0?-Math.PI/2:Math.PI/2);OUTG.add(c.g)}
export const SIGNALS=[[85.4,82.7,0],[104.6,69.3,0],[89.3,65.4,1],[100.7,86.6,1]].map(([x,y,g])=>{
  const mb=new MB();mb.cyl(x,y,.08,0,4,'#33363c','#33363c',6);mb.box(x-.25,y-.25,.5,.5,3.9,5.1,'#1f2126');OUTG.add(mb.mesh());
  const lamp=new THREE.Mesh(UNIT,new THREE.MeshBasicMaterial());lamp.position.set(x,4.75,y);lamp.scale.set(.62,.9,.62);OUTG.add(lamp);return{lamp,g}});

// pedestrians
for(const q of PEDS){const mb=new MB();
  mb.cyl(0,0,.2,0,.75,shade('#2b2f38',1),'#2b2f38',8);mb.cyl(0,0,.22,.75,1.42,shade(q.col),q.col,8);mb.cyl(0,0,.125,1.42,1.68,'#d9b48f','#4a3324',8);
  q.g=mb.mesh();OUTG.add(q.g)}

// the cars you can drive
for(const c of DCARS){const mb=new MB(),L=c.len;
  mb.box(-L/2,-.92,L,1.84,.22,.85,shade(c.col,.85),c.col);mb.box(-L*.26,-.78,L*.48,1.56,.85,1.38,'#26303b',c.col);
  mb.box(L/2-.04,-.8,.06,.4,.5,.7,'#fff6c8');mb.box(L/2-.04,.4,.06,.4,.5,.7,'#fff6c8');
  mb.box(-L/2-.02,-.8,.06,.4,.5,.7,'#c03a34');mb.box(-L/2-.02,.4,.06,.4,.5,.7,'#c03a34');
  mb.box(L*.2,-.92,.5,1.84,.84,.9,'#ffffff');                                  // a stripe, to tell them from the traffic
  mb.box(HINGE[0]-DOOR_L,-.925,DOOR_L,.01,.3,1.3,'#1c1e22');                    // the doorway, seen when the door is open
  c.g=mb.mesh();OUTG.add(c.g);
  {const dm=new MB();dm.box(-DOOR_L,-.03,DOOR_L,.06,.28,.86,shade(c.col,.8),c.col);dm.box(-DOOR_L,-.03,DOOR_L,.06,.86,1.32,'#3b4652');dm.box(-DOOR_L+.08,-.07,.2,.04,.72,.78,'#d9dce0');
    c.pivot=new THREE.Group();c.pivot.position.set(HINGE[0],0,HINGE[1]-.02);c.pivot.add(dm.mesh());c.g.add(c.pivot)}
  const hd=new MB();hd.box(.55,-.9,1.6,1.8,.84,.9,shade(c.col,.9),c.col);hd.box(.5,-.32,.1,.5,.9,1.05,'#1c1e22');c.dash=fpAdd(c.g,hd.mesh())}   // bonnet and wheel, seen from the driver's seat

// the boat
{const g=new THREE.Group(),mb=new MB();
  mb.box(-2.75,-1.2,5.5,2.4,.0,.04,'#8a6a4a');                                           // deck
  for(const[x,z,w,d]of[[-2.75,-1.2,5.5,.14],[-2.75,1.06,5.5,.14],[-2.75,-1.2,.14,2.4],[2.61,-1.2,.14,2.4]])mb.box(x,z,w,d,0,.5,'#e9e6df','#c94f3d');
  mb.box(2.75,-.7,.5,1.4,0,.42,'#e9e6df','#c94f3d');mb.box(3.25,-.3,.35,.6,0,.36,'#e9e6df','#c94f3d');    // bow
  mb.box(-2.5,-.35,.6,.7,.04,.55,'#3a3d44');                                               // engine
  g.add(mb.mesh());BOAT.tiller=dynBox(g,'#5a4632');BOAT.g=g;OUTG.add(g)}
