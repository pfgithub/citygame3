import { SIG_T } from './traffic';
import { P, S } from '../state';
import { mulberry32, rr } from '../util';
import { OUT } from '../world/outdoors';

// People walk a small network of sidewalk and park-path points. `x` marks a way out of the
// district (they leave and someone else arrives), and crossings wait for the lights.
export const PN={wn:[2,68,'x'],t:[34,68],o:[68,68],nw:[88,68],ne:[102,68],g1:[120,68],g2:[172,68],en:[198,68],
  ws:[2,84,'x'],sw:[88,84],se:[102,84],pl:[111.5,84],es:[198,84],a1:[304,68],a1x:[304,43,'x'],a2:[434,68],a2x:[434,43,'x'],b1:[354,84],b1x:[354,109,'x'],hn:[561,68],hs:[561,84],hq:[590,66],hqe:[660,66],hsq:[600,84],hsub:[611.5,91,'x'],nn:[88,2,'x'],ne2:[102,2,'x'],wg:[102,32],ss:[88,158,'x'],ss2:[102,158,'x'],
  td:[34,66.3,'x'],od:[68,66.3,'x'],sub:[111.5,91,'x'],p1:[120,50],p2:[172,50],fw:[143.5,36.5],fe:[156.5,36.5],fn:[150,26.5],pn:[150,6]};
export const PE=[['wn','t'],['t','o'],['o','nw'],['nw','ne',1],['ne','g1'],['g1','g2'],['g2','en'],['ws','sw'],['sw','se',1],['se','pl'],['pl','es'],
  ['nn','nw'],['nw','sw',0],['sw','ss'],['ne2','wg'],['wg','ne'],['ne','se',0],['se','ss2'],['t','td'],['o','od'],['pl','sub'],
  ['en','a1'],['a1','a2'],['a2','hn'],['a1','a1x'],['a2','a2x'],['es','b1'],['b1','hs'],['b1','b1x'],['hn','hq'],['hq','hqe'],['hq','hsq'],['hs','hsq'],['hsq','hsub'],
  ['g1','p1'],['p1','fw'],['g2','p2'],['p2','fe'],['fw','fe'],['fw','fn'],['fe','fn'],['fn','pn'],['wg','fw']];   // third item: the signal group whose traffic the crossing cuts across
export const PADJ={};for(const k in PN)PADJ[k]=[];
for(const[a,b,x]of PE){const d=Math.hypot(PN[a][0]-PN[b][0],PN[a][1]-PN[b][1]);PADJ[a].push({to:b,d,x});PADJ[b].push({to:a,d,x})}
export const PEXITS=Object.keys(PN).filter(k=>PN[k][2]),PSEATS=OUT.benches.filter(b=>b.x<700).map(b=>({x:b.x+b.w/2,y:b.y+b.h/2,near:Object.keys(PN).reduce((m,k)=>Math.hypot(PN[k][0]-b.x,PN[k][1]-b.y)<Math.hypot(PN[m][0]-b.x,PN[m][1]-b.y)?k:m),taken:false}));
export function pedPath(a,b){ // shortest way through the network
  const dist={[a]:0},prev={},todo=new Set(Object.keys(PN));
  while(todo.size){let u=null;for(const k of todo)if(dist[k]!==undefined&&(u===null||dist[k]<dist[u]))u=k;if(u===null||u===b)break;todo.delete(u);
    for(const e of PADJ[u])if(dist[e.to]===undefined||dist[u]+e.d<dist[e.to]){dist[e.to]=dist[u]+e.d;prev[e.to]=u}}
  const path=[b];while(path[0]!==a&&prev[path[0]])path.unshift(prev[path[0]]);return path;
}
// May someone step off the kerb now? Only while the traffic they would cross has a red with enough of it left.
export function mayCross(g,len){const t=S.time%SIG_T,need=(len-4)/1.4+1;   // (the road itself is 4 m narrower than kerb-node to kerb-node)
 return g===0?(t>=14.3&&t+need<SIG_T+.3):(t>=25.3||t+need<14.7)}
export const prng=mulberry32(77),PEDS=[];
export function pedGoal(q){
  if(prng()<.3){const free=PSEATS.filter(s=>!s.taken);if(free.length){const st=free[Math.floor(prng()*free.length)];st.taken=true;q.seat=st;q.path=pedPath(q.at,st.near);return}}
  let d;do{d=PEXITS[Math.floor(prng()*PEXITS.length)]}while(d===q.at);q.seat=null;q.path=pedPath(q.at,d);
}
for(let i=0;i<46;i++){const at=Object.keys(PN)[Math.floor(prng()*Object.keys(PN).length)];
  const q={at,x:PN[at][0],y:PN[at][1],sp:1.15+prng()*.5,off:(prng()-.5)*1.8,sit:0,on:false,a:0,col:['#3b5b8a','#8a3b3b','#3f7d5a','#6b6f78','#a0763a','#5a3f8a','#2f3138','#b8a070'][i%8]};
  pedGoal(q);PEDS.push(q)}
export function updatePeds(dt){
  for(const q of PEDS){
    if(q.sit>0){q.sit-=dt;if(q.sit<=0){q.seat.taken=false;q.seat=null;pedGoal(q)}continue}
    let tx,ty,edge=null;
    if(q.path.length>1){const n=PN[q.path[1]],a=PN[q.at];edge=PADJ[q.at].find(e=>e.to===q.path[1]);
      const dx=n[0]-a[0],dy=n[1]-a[1],L=Math.hypot(dx,dy)||1,o=edge.x===undefined?q.off:q.off*.6;tx=n[0]-dy/L*o;ty=n[1]+dx/L*o;   // keep to one side of the path
      if(edge.x!==undefined&&!q.on){if(!mayCross(edge.x,L)){q.wait=true;continue}q.on=true}}
    else if(q.seat){tx=q.seat.x;ty=q.seat.y}
    else{ // reached a way out: someone new arrives somewhere else
      q.at=PEXITS[Math.floor(prng()*PEXITS.length)];q.x=PN[q.at][0];q.y=PN[q.at][1];pedGoal(q);continue}
    q.wait=false;
    const dx=tx-q.x,dy=ty-q.y,d=Math.hypot(dx,dy),st=q.sp*(q.on?1.25:1)*dt;
    if(d<=st+.05){q.x=tx;q.y=ty;
      if(q.path.length>1){q.at=q.path[1];q.path.shift();q.on=false}else{q.sit=8+prng()*18}}
    else{q.x+=dx/d*st;q.y+=dy/d*st;q.a=Math.atan2(dy,dx)}
    if(P.z===0){const rr=P.car?1.9:.55,ex=q.x-P.x,ey=q.y-P.y,e=Math.hypot(ex,ey);if(e<rr&&e>1e-6){q.x+=ex/e*(rr-e);q.y+=ey/e*(rr-e)}}   // step round the player (or get out of the way of their car)
  }
}
