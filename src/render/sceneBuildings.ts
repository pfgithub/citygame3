import * as THREE from 'three';
import { LH, WALL_H, Y } from '../constants';
import { CEILB, GLOW, MB, UNIT, WALLS, art, dynBox, facade, fpAdd, inR, levelParts, setBox, shade, slab, stairMeshes } from './mesh';
import { drawOfficeFloor, drawTowerFloor } from './paint';
import { scene } from './renderer';
import { HANDLE } from '../sim/door';
import { panelOf } from '../sim/press';
import { P, S } from '../state';
import { BUILDINGS } from '../world/buildings';
import { LIFTS, STAIRS } from '../world/floors';
import { OFFICE } from '../world/office';
import { FLATDOORS, MYDOOR, MYFLAT, TTOP } from '../world/tower';

// ---- enterable buildings: a closed exterior, and one open-topped group per storey
for(const b of BUILDINGS){
  const r=b.rect,ext=new MB();
  const h=facade(ext,r,b.top+1,shade(b.roof.color,.92),b.roof.color);
  for(const d of b.roof.details)ext.box(d.x,d.y,d.w,d.h,h,h+(d.c==='#c3c6ca'?1.1:.35),shade(d.c),d.c);
  ext.box(b.door.x-1.6,r.y+r.h,3.2,1.6,2.9,3.05,shade(b.awning),b.awning);        // awning over the entrance
  ext.box(b.door.x-1,r.y+r.h,2,.08,0,2.4,'#1b1d21');
  b.ext=ext.mesh();scene.add(b.ext);
  {const rf=new MB();rf.box(r.x,r.y,r.w,r.h,Y(b.top+1),Y(b.top+1)+.4,shade(b.roof.color,.92),b.roof.color);
    for(const d of b.roof.details)rf.box(d.x,d.y,d.w,d.h,h,h+(d.c==='#c3c6ca'?1.1:.35),shade(d.c),d.c);
    rf.box(b.door.x-1.6,r.y+r.h,3.2,1.6,2.9,3.05,shade(b.awning),b.awning);fpAdd(scene,rf.mesh())}
  b.levels=[];
  for(let z=0;z<=b.top;z++){
    const g=new THREE.Group(),holes=[];
    for(const s of STAIRS)if(s.zh===z&&inR(s,r))holes.push(s);
    for(const l of LIFTS)if(l.owner===b&&z>l.zmin)holes.push({x:l.x,y:l.y,w:l.w,h:l.h+.2});
    g.add(slab(r,holes,Y(z)+.03,art(r.x,r.y,r.w,r.h,28,gg=>b.rect===OFFICE?drawOfficeFloor(gg,z):drawTowerFloor(gg,z))));
    const mb=levelParts(g,z,r);
    scene.add(g);b.levels.push(g);
    // first person: a proper ceiling under the floor above (open where the stairs and lift go up), with light panels
    {const up=[];if(z<b.top){for(const s of STAIRS)if(s.zh===z+1&&inR(s,r))up.push(s);for(const l of LIFTS)if(l.owner===b)up.push({x:l.x,y:l.y,w:l.w,h:l.h+.2})}
      const cy=Y(z+1)-.02,lt=new MB();fpAdd(scene,slab(r,up,cy,CEILB));
      for(let x=r.x+3;x<r.x+r.w-1;x+=5)for(let y=r.y+3;y<r.y+r.h-1;y+=5){
        if(up.some(h=>x+1.2>h.x&&x<h.x+h.w&&y+.4>h.y&&y<h.y+h.h))continue;lt.lid(x,y,1.2,.35,cy-.01,'#fffbe8')}
      fpAdd(scene,lt.mesh(GLOW))}
  }
}
for(const s of STAIRS){s.owner=BUILDINGS.find(b=>inR(s,b.rect))||null;stairMeshes(s)}
// lifts: the car, and a pair of sliding doors on every floor
for(const l of LIFTS){
  const mb=new MB();mb.box(l.x,l.y,l.w,l.h+.2,-.02,.04,'#c9cdd3');
  mb.box(l.x+.06,l.y+.06,l.w-.12,.08,.04,1,'#8f959d');mb.box(l.x+.06,l.y+.2,.08,l.h-.3,.04,1,'#8f959d');mb.box(l.x+l.w-.14,l.y+.2,.08,l.h-.3,.04,1,'#8f959d');
  l.car=mb.mesh();scene.add(l.car);
  {const c=new MB();c.lid(l.x,l.y,l.w,l.h+.2,2.35,'#d9dce0');fpAdd(l.car,c.mesh());const lt=new MB();lt.lid(l.x+.6,l.y+.9,1,.3,2.34,'#fffbe8');fpAdd(l.car,lt.mesh(GLOW))}
  {const pn=panelOf(l),cv2=document.createElement('canvas');cv2.width=pn.cols*64;cv2.height=pn.rows*54;
    const tex=new THREE.CanvasTexture(cv2),pl=new THREE.Mesh(new THREE.PlaneGeometry(pn.pw,pn.ph),new THREE.MeshBasicMaterial({map:tex}));
    pl.rotation.y=-Math.PI/2;pl.position.set(l.x+l.w-.145,pn.ch,pn.cy);l.car.add(pl);
    l.paintPanel=()=>{const key=l.target+'|'+Math.round(l.z)+'|'+(P.lift===l?S.pendingBtn:'');if(key===l.panelKey)return;l.panelKey=key;
      const g=cv2.getContext('2d')!;g.fillStyle='#3a3d44';g.fillRect(0,0,cv2.width,cv2.height);
      for(let i=0;i<pn.n;i++){const f=l.zmin+i,x=(i%pn.cols+.5)*64,y=cv2.height-(Math.floor(i/pn.cols)+.5)*54,on=l.target===f||(P.lift===l&&S.pendingBtn===f),here=Math.round(l.z)===f&&l.target===null;
        g.fillStyle=on?'#f0b63a':here?'#cfd3d9':'#1c1e22';g.beginPath();g.arc(x,y,21,0,7);g.fill();g.strokeStyle='#cfd3d9';g.lineWidth=3;g.stroke();
        g.fillStyle=on||here?'#1c1e22':'#f2f3f5';g.font='600 24px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(f+1),x,y+1)}
      tex.needsUpdate=true};
    const hb=new MB();for(let z=l.zmin;z<=l.zmax;z++){const x=l.dr.x+l.dr.w+.32,y=l.y+2.4;hb.box(x-.07,y,.14,.025,Y(z)+1,Y(z)+1.2,'#3a3d44');hb.box(x-.035,y+.02,.07,.02,Y(z)+1.065,Y(z)+1.135,'#f0b63a')}
    scene.add(l.hall=hb.mesh())}
  {const up=new MB();for(let z=l.zmin;z<=l.zmax;z++)up.box(l.dr.x,l.dr.y,l.dr.w,l.dr.h,Y(z)+2.23,Y(z)+LH-.01,WALLS);fpAdd(scene,up.mesh())}
  l.doors=[];for(let z=l.zmin;z<=l.zmax;z++){const g=l.owner.levels[z];l.doors.push([dynBox(g,'#aeb4bc'),dynBox(g,'#aeb4bc')])}
}
// flat doors
{const b=BUILDINGS[1],up=new MB();
  for(const d of FLATDOORS)up.box(d.x,d.y,d.w,d.h,Y(d.z)+2.13,Y(d.z)+LH-.01,WALLS);
  fpAdd(scene,up.mesh());
  for(const d of FLATDOORS){const g=b.levels[d.z];
    if(d.mine){const y=Y(d.z)+.03,mb=new MB(),hb=new MB();
      mb.box(0,-.04,d.w,.08,0,2.1,'#3f9a63','#2f7a4d');
      for(const sz of[-.1,.06])hb.box(-.13,sz,.15,.04,-.02,.02,'#d9c27a');      // lever handles, one per face
      MYDOOR.pivot=new THREE.Group();MYDOOR.pivot.position.set(d.x,y,d.y+.1);MYDOOR.pivot.add(mb.mesh());
      MYDOOR.lever=new THREE.Group();MYDOOR.lever.position.set(HANDLE+.06,1,0);MYDOOR.lever.add(hb.mesh());MYDOOR.pivot.add(MYDOOR.lever);g.add(MYDOOR.pivot)}
    else{const mb=new MB();mb.box(d.x,d.y+.04,d.w,d.h-.08,Y(d.z)+.03,Y(d.z)+2.1,'#6b4a32','#54392a');g.add(mb.mesh())}}
}

// Lids over the flats, for the top-down view: other people's homes are never seen into, and
// the player's own is covered until its door opens.
export const TOPONLY:THREE.Mesh[]=[];export let MYLID:THREE.Mesh<THREE.BoxGeometry,THREE.MeshLambertMaterial>;
{const b=BUILDINGS[1],north:[string,number,number,number,number][]=[['01',22.3,44.3,7.5,9.5],['06',41.2,44.3,4.5,9.5]],south:[string,number,number][]=[['02',22.3,5.7],['03',28.2,5.8],['04',34.2,5.8],['05',40.2,5.5]];
  for(let z=0;z<=TTOP;z++){const mb=new MB(),y=Y(z)+WALL_H+.05;
    for(const[id,x,yy,w,h]of[...north,...south.map(([id,x,w])=>[id,x,56,w,9.7] as [string,number,number,number,number])]){
      if(z===0&&(id==='03'||id==='04'))continue;
      if(z===MYFLAT.z&&id===MYFLAT.id){
        MYLID=new THREE.Mesh(UNIT,new THREE.MeshLambertMaterial({color:'#6c6f77',transparent:true}));
        setBox(MYLID,x,yy,w,h,y,y+.1);b.levels[z].add(MYLID);continue}
      mb.box(x,yy,w,h,y,y+.1,'#4b4e55','#6c6f77')}
    const m=mb.mesh();b.levels[z].add(m);TOPONLY.push(m)}
}
