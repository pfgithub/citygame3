// A small 2D rigid-body solver for a handful of boxes and infinitely thin walls.
//
// Walls are line segments with no thickness, and nothing ever goes through one, however hard it
// is pushed or however fast it moves. Two things make that so:
//  1. Each wall remembers which side every body is on, and only changes its mind once the body is
//     completely clear of the wall. A body that overlaps a wall is always pushed back out on the
//     side it came from, never on the far side.
//  2. Time is cut into substeps short enough that no point of any body moves more than MAX_MOVE
//     in one. A body can then never get from one side of a wall to the other between two looks:
//     it would have to pass through, and be caught overlapping. Every corner that could reach a
//     wall within a substep is already a (speculative) contact, and the wall contacts are solved
//     after everything else, so they always have the last word. If the substeps needed get too
//     many, the simulation runs slower instead of breaking this.
//
// Contacts otherwise follow Box2D v3's "soft step": per substep, integrate velocities, warm start,
// solve with a soft position bias, integrate positions, relax without the bias. Units: metres,
// kilograms, seconds; y is up.

export interface Box{x:number,y:number,a:number,vx:number,vy:number,w:number,hw:number,hh:number,
  invM:number,invI:number,r:number,v:number[],n:number[]}   // v, n: world corners and face normals (CCW)
export interface Wall{ax:number,ay:number,bx:number,by:number,nx:number,ny:number}   // n: unit normal, left of A->B
interface Point{rAx:number,rAy:number,rBx:number,rBy:number,sep:number,nMass:number,tMass:number,nImp:number,tImp:number,id:number}
interface Manifold{a:Box|null,b:Box,nx:number,ny:number,pts:Point[],wall:boolean}
export interface Grab{b:Box,lx:number,ly:number,tx:number,ty:number,maxForce:number,imp:[number,number]}

export const SLOP=.005;            // overlap allowed to settle into while resting
export const MARGIN=.02;           // speculative distance: contacts are made this far apart
export const MAX_MOVE=MARGIN/2;    // the furthest any point of a body may move in one substep
const FRICTION=.6,GRAVITY=-10,BASE_SUB=10,MAX_SUB=400;

export function makeBox(x:number,y:number,hw:number,hh:number,density=1,a=0):Box{
  const m=density*4*hw*hh,I=m*(hw*hw+hh*hh)/3,b={x,y,a,vx:0,vy:0,w:0,hw,hh,invM:1/m,invI:1/I,r:Math.hypot(hw,hh),v:[0,0,0,0,0,0,0,0],n:[0,0,0,0,0,0,0,0]};
  pose(b);return b}
export function makeWall(ax:number,ay:number,bx:number,by:number):Wall{const L=Math.hypot(bx-ax,by-ay);return{ax,ay,bx,by,nx:-(by-ay)/L,ny:(bx-ax)/L}}
// Corners and normals in world space.
function pose(b:Box){const c=Math.cos(b.a),s=Math.sin(b.a),L=[-b.hw,-b.hh,b.hw,-b.hh,b.hw,b.hh,-b.hw,b.hh],N=[0,-1,1,0,0,1,-1,0];
  for(let i=0;i<4;i++){b.v[2*i]=b.x+c*L[2*i]-s*L[2*i+1];b.v[2*i+1]=b.y+s*L[2*i]+c*L[2*i+1];b.n[2*i]=c*N[2*i]-s*N[2*i+1];b.n[2*i+1]=s*N[2*i]+c*N[2*i+1]}}

// The deepest a polygon's corners reach past edge i of another (max over i, so: the separation).
function maxSep(av:number[],an:number[],na:number,bv:number[],nb:number):[number,number]{
  let best=-1e18,bi=0;
  for(let i=0;i<na;i++){const nx=an[2*i],ny=an[2*i+1],vx=av[2*i],vy=av[2*i+1];let m=1e18;
    for(let j=0;j<nb;j++){const d=nx*(bv[2*j]-vx)+ny*(bv[2*j+1]-vy);if(d<m)m=d}
    if(m>best){best=m;bi=i}}
  return[best,bi]}
// Clip incident edge (w1, w2) to the sides of reference face (v1, v2) with normal n; keep points
// within MARGIN of the face. Returns [x, y, separation, id] for each.
function clip(v1x:number,v1y:number,v2x:number,v2y:number,nx:number,ny:number,w:number[],idBase:number){
  const tx=v2x-v1x,ty=v2y-v1y;let p=[[w[0],w[1],0],[w[2],w[3],1]];
  const cut=(ox:number,oy:number,sx:number,sy:number,tag:number)=>{   // keep sx*(p-o)+sy*(p-o) >= 0
    const d0=sx*(p[0][0]-ox)+sy*(p[0][1]-oy),d1=sx*(p[1][0]-ox)+sy*(p[1][1]-oy);
    if(d0<0&&d1<0)return false;
    if(d0<0||d1<0){const t=d0/(d0-d1),q=[p[0][0]+(p[1][0]-p[0][0])*t,p[0][1]+(p[1][1]-p[0][1])*t,tag];if(d0<0)p[0]=q;else p[1]=q}
    return true};
  if(!cut(v1x,v1y,tx,ty,2)||!cut(v2x,v2y,-tx,-ty,3))return[];
  const out:number[][]=[];for(const q of p){const s=nx*(q[0]-v1x)+ny*(q[1]-v1y);if(s<=MARGIN)out.push([q[0],q[1],s,idBase|q[2]])}
  return out}
// The edge of polygon (v, n) most facing against normal (nx, ny).
function incident(v:number[],n:number[],cnt:number,nx:number,ny:number){let bi=0,bd=1e18;
  for(let i=0;i<cnt;i++){const d=n[2*i]*nx+n[2*i+1]*ny;if(d<bd){bd=d;bi=i}}
  const j=(bi+1)%cnt;return[v[2*bi],v[2*bi+1],v[2*j],v[2*j+1]]}

export class World{
  boxes:Box[]=[];walls:Wall[]=[];grab:Grab|null=null;
  side=new Map<string,number>();            // wall index + box index -> the side the box is on
  private old=new Map<string,Point[]>();    // last substep's contacts, to warm start from
  private hPrev=0;
  substeps=0;slowed=false;                   // last frame: how many substeps, and whether it had to slow down
  contacts:number[]=[];                      // the last substep's contact points, x, y pairs (to draw)
  add(b:Box){this.boxes.push(b);return b}
  addWall(w:Wall){this.walls.push(w);return w}
  // Advance by dt, in as many substeps as it takes.
  step(dt:number){
    let left=dt,n=0;
    while(left>1e-9&&n<MAX_SUB){
      let h=Math.min(dt/BASE_SUB,left);
      for(const b of this.boxes){ // short enough that no point moves more than MAX_MOVE, counting what the pull can add
        const a=(this.grab&&this.grab.b===b?this.grab.maxForce*b.invM:0)+Math.abs(GRAVITY),v=2*(Math.hypot(b.vx,b.vy)+Math.abs(b.w)*b.r);
        const hb=(-v+Math.sqrt(v*v+8*a*MAX_MOVE))/(4*a);if(hb<h)h=hb}
      this.substep(h);left-=h;n++}
    this.substeps=n;this.slowed=left>1e-9;
  }
  private substep(h:number){
    const B=this.boxes,man:Manifold[]=[];
    for(const b of B)pose(b);
    // contacts: box against box, then box against wall (solved last)
    for(let i=0;i<B.length;i++)for(let j=i+1;j<B.length;j++){const m=this.boxBox(B[i],B[j],'b'+i+'_'+j);if(m)man.push(m)}
    this.walls.forEach((w,k)=>B.forEach((b,j)=>{const m=this.boxWall(w,b,k+'_'+j);if(m)man.push(m)}));
    this.contacts=man.flatMap(m=>m.pts.flatMap(p=>[m.b.x+p.rBx,m.b.y+p.rBy]));
    const nextOld=new Map<string,Point[]>(),scale=this.hPrev?h/this.hPrev:1;
    for(const m of man)for(const p of m.pts){p.nImp*=scale;p.tImp*=scale}
    if(this.grab){this.grab.imp[0]*=scale;this.grab.imp[1]*=scale}
    this.hPrev=h;
    // integrate velocities
    for(const b of B)b.vy+=GRAVITY*h;
    // prepare
    for(const m of man){const A=m.a,b=m.b,tx=-m.ny,ty=m.nx,iA=A?A.invM:0,IA=A?A.invI:0;
      for(const p of m.pts){const rnA=p.rAx*m.ny-p.rAy*m.nx,rnB=p.rBx*m.ny-p.rBy*m.nx,rtA=p.rAx*ty-p.rAy*tx,rtB=p.rBx*ty-p.rBy*tx;
        p.nMass=1/(iA+b.invM+IA*rnA*rnA+b.invI*rnB*rnB);p.tMass=1/(iA+b.invM+IA*rtA*rtA+b.invI*rtB*rtB)}}
    // warm start
    for(const m of man)for(const p of m.pts)this.apply(m,p,m.nx*p.nImp-m.ny*p.tImp,m.ny*p.nImp+m.nx*p.tImp);
    const g=this.grab;if(g)this.applyGrab(g,g.imp[0],g.imp[1]);
    this.solve(man,h,true);
    for(const b of B){b.x+=b.vx*h;b.y+=b.vy*h;b.a+=b.w*h}
    this.solve(man,h,false);
    for(const m of man)nextOld.set(this.key(m),m.pts);
    this.old=nextOld;
  }
  private keys=new WeakMap<Manifold,string>();
  private key(m:Manifold){return this.keys.get(m)!}
  private apply(m:Manifold,p:Point,px:number,py:number){const A=m.a,b=m.b;
    if(A){A.vx-=px*A.invM;A.vy-=py*A.invM;A.w-=A.invI*(p.rAx*py-p.rAy*px)}
    b.vx+=px*b.invM;b.vy+=py*b.invM;b.w+=b.invI*(p.rBx*py-p.rBy*px)}
  // Soft constraint coefficients (Box2D v3's b2MakeSoft).
  private soft(hz:number,zeta:number,h:number){const w=2*Math.PI*hz,a1=2*zeta+h*w,a2=h*w*a1,a3=1/(1+a2);return{bias:w/a1,mass:a2*a3,imp:a3}}
  private solve(man:Manifold[],h:number,useBias:boolean){
    const g=this.grab;if(g)this.solveGrab(g,h,useBias);
    const boxSoft=this.soft(Math.min(30,.25/h),10,h),wallSoft=this.soft(.25/h,10,h);
    for(const m of man){const A=m.a,b=m.b,nx=m.nx,ny=m.ny,tx=-ny,ty=nx,sf=m.wall?wallSoft:boxSoft,push=m.wall?20:3;
      const rel=(p:Point)=>{let dx=b.vx-b.w*p.rBy,dy=b.vy+b.w*p.rBx;if(A){dx-=A.vx-A.w*p.rAy;dy-=A.vy+A.w*p.rAx}return[dx,dy]};
      let total=0;
      for(const p of m.pts){ // normal: never let the gap close faster than it can, never pull
        const[dx,dy]=rel(p),vn=dx*nx+dy*ny;let bias=0,ms=1,is=0;
        if(p.sep>0)bias=p.sep/h;else if(useBias){bias=Math.max(sf.bias*p.sep,-push);ms=sf.mass;is=sf.imp}
        const imp=-p.nMass*ms*(vn+bias)-is*p.nImp,ni=Math.max(p.nImp+imp,0),d=ni-p.nImp;p.nImp=ni;total+=ni;
        this.apply(m,p,nx*d,ny*d)}
      for(const p of m.pts){ // friction
        const[dx,dy]=rel(p),vt=dx*tx+dy*ty,lim=FRICTION*p.nImp,ti=Math.max(-lim,Math.min(lim,p.tImp-p.tMass*vt)),d=ti-p.tImp;p.tImp=ti;
        this.apply(m,p,tx*d,ty*d)}}
  }
  // The mouse: a soft spring from a point on the body to the pointer, as strong as maxForce allows.
  private grabR(g:Grab){const b=g.b,c=Math.cos(b.a),s=Math.sin(b.a);return[c*g.lx-s*g.ly,s*g.lx+c*g.ly]}
  private applyGrab(g:Grab,px:number,py:number){const b=g.b,[rx,ry]=this.grabR(g);b.vx+=px*b.invM;b.vy+=py*b.invM;b.w+=b.invI*(rx*py-ry*px)}
  private solveGrab(g:Grab,h:number,useBias:boolean){
    const b=g.b,[rx,ry]=this.grabR(g),k11=b.invM+b.invI*ry*ry,k12=-b.invI*rx*ry,k22=b.invM+b.invI*rx*rx,det=k11*k22-k12*k12;
    const sf=this.soft(5,.7,h),cx=b.x+rx-g.tx,cy=b.y+ry-g.ty;
    const vx=b.vx-b.w*ry,vy=b.vy+b.w*rx,bx=useBias?cx*sf.bias:0,by=useBias?cy*sf.bias:0,ms=useBias?sf.mass:1,is=useBias?sf.imp:0;
    const ux=vx+bx,uy=vy+by;let ix=-ms*(k22*ux-k12*uy)/det-is*g.imp[0],iy=-ms*(-k12*ux+k11*uy)/det-is*g.imp[1];
    let ax=g.imp[0]+ix,ay=g.imp[1]+iy;const L=Math.hypot(ax,ay),max=g.maxForce*h;if(L>max){ax*=max/L;ay*=max/L}
    ix=ax-g.imp[0];iy=ay-g.imp[1];g.imp=[ax,ay];this.applyGrab(g,ix,iy);
    b.w*=1/(1+h*2);                                                       // a little angular drag while held, as Box2D's mouse joint has
  }
  private finish(key:string,a:Box|null,b:Box,nx:number,ny:number,pts:number[][],wall:boolean):Manifold|null{
    if(!pts.length)return null;
    const old=this.old.get(key),out:Point[]=pts.map(q=>{const prev=old&&old.find(o=>o.id===q[3]);
      return{rAx:a?q[0]-a.x:0,rAy:a?q[1]-a.y:0,rBx:q[0]-b.x,rBy:q[1]-b.y,sep:q[2],nMass:0,tMass:0,nImp:prev?prev.nImp:0,tImp:prev?prev.tImp:0,id:q[3]}});
    const m={a,b,nx,ny,pts:out,wall};this.keys.set(m,key);return m}
  private boxBox(A:Box,B:Box,key:string){
    if(Math.hypot(A.x-B.x,A.y-B.y)>A.r+B.r+MARGIN)return null;
    const[sA,eA]=maxSep(A.v,A.n,4,B.v,4);if(sA>MARGIN)return null;
    const[sB,eB]=maxSep(B.v,B.n,4,A.v,4);if(sB>MARGIN)return null;
    const flip=sB>sA+.1*SLOP,R=flip?B:A,I=flip?A:B,e=flip?eB:eA,j=(e+1)%4,nx=R.n[2*e],ny=R.n[2*e+1];
    const pts=clip(R.v[2*e],R.v[2*e+1],R.v[2*j],R.v[2*j+1],nx,ny,incident(I.v,I.n,4,nx,ny),(flip?1<<12:0)|e<<4);
    return this.finish(key,A,B,flip?-nx:nx,flip?-ny:ny,pts,false);
  }
  // A box against a thin wall: the wall only ever pushes towards the side the box is on.
  private boxWall(W:Wall,b:Box,key:string){
    if(Math.abs((b.x-W.ax)*W.nx+(b.y-W.ay)*W.ny)>b.r+MARGIN){this.side.set(key,Math.sign((b.x-W.ax)*W.nx+(b.y-W.ay)*W.ny)||1);return null}
    let lo=1e18,hi=-1e18;for(let i=0;i<4;i++){const d=(b.v[2*i]-W.ax)*W.nx+(b.v[2*i+1]-W.ay)*W.ny;lo=Math.min(lo,d);hi=Math.max(hi,d)}
    const wv=[W.ax,W.ay,W.bx,W.by],[sB,eB]=maxSep(b.v,b.n,4,wv,2);
    let s=this.side.get(key);
    const overlapping=lo<0&&hi>0&&sB<0;
    if(s===undefined||!overlapping){const s2=lo>=0?1:hi<=0?-1:Math.sign((b.x-W.ax)*W.nx+(b.y-W.ay)*W.ny)||1;
      if(s===undefined||!overlapping)s=s2;this.side.set(key,s)}
    const nx=W.nx*s,ny=W.ny*s,sW=s>0?lo:-hi;                               // how far the box's nearest corner is in front of the wall
    if(sW>MARGIN||sB>MARGIN)return null;
    // overlapping (which should never get deep): always push out along the wall's normal, to the box's side
    if(overlapping||sW>=sB-.1*SLOP){
      const v1x=s>0?W.ax:W.bx,v1y=s>0?W.ay:W.by,v2x=s>0?W.bx:W.ax,v2y=s>0?W.by:W.ay;
      return this.finish(key,null,b,nx,ny,clip(v1x,v1y,v2x,v2y,nx,ny,incident(b.v,b.n,4,nx,ny),0),true)}
    // a corner of the wall (its end) against a face of the box
    const j=(eB+1)%4,fx=b.n[2*eB],fy=b.n[2*eB+1];
    const pts=clip(b.v[2*eB],b.v[2*eB+1],b.v[2*j],b.v[2*j+1],fx,fy,wv,1<<12|eB<<4);
    return this.finish(key,null,b,-fx,-fy,pts,true);
  }
  // How far past any wall, on the wrong side, any corner of any box is (should stay ~0).
  wallPenetration(){let worst=0;for(const b of this.boxes)pose(b);
    this.walls.forEach((W,k)=>this.boxes.forEach((b,j)=>{const s=this.side.get(k+'_'+j)??1,L2=(W.bx-W.ax)**2+(W.by-W.ay)**2;
      for(let i=0;i<4;i++){const px=b.v[2*i],py=b.v[2*i+1],t=((px-W.ax)*(W.bx-W.ax)+(py-W.ay)*(W.by-W.ay))/L2;
        if(t<0||t>1)continue;const d=-s*((px-W.ax)*W.nx+(py-W.ay)*W.ny);if(d>worst)worst=d}}));
    return worst}
}
