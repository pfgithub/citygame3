import * as THREE from 'three';
import { S } from '../state';

// Colours are used as written, with no sRGB <-> linear conversion anywhere (the look the game was
// made with). This has to be set before any THREE.Color is made.
THREE.ColorManagement.enabled=false;
export const cv=document.getElementById('c') as HTMLCanvasElement;
export const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
export const scene=new THREE.Scene();scene.background=new THREE.Color('#14161a');
// (light intensities are physical units since three r155: times pi gives the old brightness)
scene.add(new THREE.AmbientLight(0xffffff,.6*Math.PI));
{const sun=new THREE.DirectionalLight(0xffffff,.45*Math.PI);sun.position.set(-.45,1,-.3);scene.add(sun)}
export const camera=new THREE.PerspectiveCamera(35,1,1,400);
export const HALF_FOV=17.5*Math.PI/180;              // half the view angle across the short screen side
export let RT:THREE.WebGLRenderTarget|null=null;
export const qscene=new THREE.Scene(),qcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
export const QUAD=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false}));
qscene.add(QUAD);
function resize(){
  S.dpr=Math.min(2,window.devicePixelRatio||1);S.w=Math.round(innerWidth*S.dpr);S.h=Math.round(innerHeight*S.dpr);
  renderer.setPixelRatio(S.dpr);renderer.setSize(innerWidth,innerHeight,false);
  if(RT)RT.dispose();RT=new THREE.WebGLRenderTarget(S.w,S.h,{samples:4});QUAD.material.map=RT.texture;
}
addEventListener('resize',resize);resize();
