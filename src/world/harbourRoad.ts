import { mulberry32 } from '../util';
import { building, car, fenceSeg, lamp, tree } from './outdoors';

// The avenue runs on east from the park to the harbour square: 360 m of street with a
// building line on both sides and three dead-end alleys.
{const cr=mulberry32(31);
  fenceSeg(200,114,200,118);
  building(520,20,44,46);building(520,86,44,60);
  const row=(x0:number,x1:number,north:boolean)=>{let x=x0;while(x<x1-.1){let w=22+Math.floor(cr()*24);if(x1-x-w<18)w=x1-x;const d=32+Math.floor(cr()*16);building(x,north?66-d:86,w,d);x+=w}};
  row(200.1,300,true);row(308,430,true);row(438,520,true);row(240,350,false);row(358,520,false);
  fenceSeg(300,40.4,308,40.4);fenceSeg(430,40.4,438,40.4);fenceSeg(350,111.6,358,111.6);
  const mouth=(x:number)=>(x>297&&x<311)||(x>427&&x<441)||(x>347&&x<361);
  for(let x=214;x<556;x+=14){lamp(x,69.4);lamp(x+7,82.6);if(!mouth(x+7))tree(x+7,68.9,1.9,true);if(!mouth(x))tree(x,83.1,1.9,true)}
  for(let x=206;x<548;x+=6.4)if(cr()<.42)car(x,70.2);
  for(let x=209;x<548;x+=6.4)if(cr()<.42)car(x,79.95);
}
