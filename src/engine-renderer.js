class SceneRenderer {
 constructor(gpu,flow){this.gpu=gpu;this.flow=flow;this.lightProgram=gpu.program(lightGLSL);this.light=gpu.target(1,1);this.materialProgram=gpu.program(materialGLSL);this.occupancyProgram=gpu.program(occupancyGLSL);this.program=gpu.program(renderGLSL);this.cacheTick=-1;this.post=gpu.program(postGLSL);this.blur=gpu.program(blurGLSL);this.steps=160;this.exposure=1.1;this.view=0;this.slice=0;this.transparent=0;this.smoke=.6;this.frame=0;this.scale=.7;this.angle=.42;this.pitch=.13;this.radius=7.4;this.target=[0,1.65,0];this.resize(1280,720);}
 resize(w,h,scale=this.scale){this.scale=scale;if(this.gpu.threeRenderer)this.gpu.threeRenderer.setSize(w,h,false);else{canvas.width=w;canvas.height=h;}for(const t of this.targets||[])this.gpu.destroy(t);this.image=this.gpu.target(Math.ceil(w*scale),Math.ceil(h*scale));this.bloom=[this.gpu.target(Math.ceil(w/6),Math.ceil(h/6)),this.gpu.target(Math.ceil(w/6),Math.ceil(h/6))];this.targets=[this.image,...this.bloom];}
 camera(shot=null,t=0){
  let eye,target=[0,1.50,0],fov=40;
  if(shot==='film'){const a=-.36+t*.13;eye=[Math.sin(a)*6.3,2.+.20*Math.sin(t*.55),Math.cos(a)*6.3];target=[0,1.78,0];fov=43;}
  else if(shot==='orbit'){const a=.10+t*.135;eye=[Math.sin(a)*5.5,1.85+Math.sin(t*.24)*.16,Math.cos(a)*5.5];target=[0,1.24,0];fov=39;}
  else if(shot==='low'){const a=-.5+t*.065;let r=5.55-t*.045;eye=[Math.sin(a)*r,.64+t*.035,Math.cos(a)*r];target=[.03,1.16,0];fov=42;}
  else if(shot==='close'){const a=.72+t*.075;eye=[Math.sin(a)*4.4,1.65-t*.027,Math.cos(a)*4.4];target=[0,1.08+t*.018,0];fov=36;}
  else {target=this.target;eye=[Math.sin(this.angle)*Math.cos(this.pitch)*this.radius,Math.sin(this.pitch)*this.radius+target[1],Math.cos(this.angle)*Math.cos(this.pitch)*this.radius];}
  if(this.customFov)fov=this.customFov;
  if(this.fixedCamera){eye=this.fixedCamera.eye;target=this.fixedCamera.aim;fov=this.fixedCamera.fov||fov;}
  if(this.gpu.THREE){
   const T=this.gpu.THREE;if(!this.threeCamera)this.threeCamera=new T.PerspectiveCamera(fov,canvas.width/canvas.height,.01,100);
   this.threeCamera.position.set(...eye);this.threeCamera.lookAt(...target);this.threeCamera.fov=fov;this.threeCamera.aspect=canvas.width/canvas.height;this.threeCamera.updateProjectionMatrix();this.threeCamera.updateMatrixWorld();
  }
  const forward=V.norm(V.sub(target,eye)),right=V.norm(V.cross(forward,[0,1,0])),up=V.norm(V.cross(right,forward));return {uEye:eye,uForward:forward,uRight:right,uUp:up,uTan:Math.tan(fov*Math.PI/360),uAspect:canvas.width/canvas.height};
 }
 render(shot=null,t=0,outputTarget=null){const g=this.gpu,b=this.flow.base();if(g.threeRenderer)g.threeRenderer.resetState();
  if(!this.material||this.materialSourceW!==this.flow.w||this.materialSourceH!==this.flow.h){g.destroy(this.material);g.destroy(this.occupancy);this.materialSourceW=this.flow.w;this.materialSourceH=this.flow.h;this.materialGrid=this.flow.grid.map(n=>Math.ceil(n/2));this.materialAtlas=[this.materialGrid[0]*8,this.materialGrid[1]*Math.ceil(this.materialGrid[2]/8)];this.material=g.target(...this.materialAtlas);this.brickGrid=this.flow.grid.map(n=>Math.ceil(n/8));this.brickAtlas=[this.brickGrid[0]*8,this.brickGrid[1]*Math.ceil(this.brickGrid[2]/8)];this.occupancy=g.target(...this.brickAtlas);this.cacheTick=-1;}
  if(this.cacheTick!==this.flow.tick){g.pass(this.materialProgram,this.material,{...b,uGrid:this.materialGrid,uAtlas:this.materialAtlas,uFieldGrid:this.flow.grid,uFieldAtlas:[this.flow.w,this.flow.h],uV:this.flow.v,uC:this.flow.c,uSmoke:this.smoke});g.pass(this.occupancyProgram,this.occupancy,{...b,uMaterial:this.material.textures[0],uV:this.flow.v,uC:this.flow.c,uBrickGrid:this.brickGrid,uBrickAtlas:this.brickAtlas});g.pass(this.lightProgram,this.light,{...b,uMaterial:this.material.textures[0],uV:this.flow.v,uC:this.flow.c});this.cacheTick=this.flow.tick;}

  g.pass(this.program,this.image,{...b,...this.camera(shot,t),uMaterialGrid:this.materialGrid,uMaterialAtlas:this.materialAtlas,uLight:this.light.textures[0],uMaterial:this.material.textures[0],uOccupancy:this.occupancy.textures[0],uBrickGrid:this.brickGrid,uBrickAtlas:this.brickAtlas,uV:this.flow.v,uC:this.flow.c,uTime:this.flow.time,uFrame:this.frame++,uSteps:this.steps,uView:this.view,uSlice:this.slice,uTransparent:this.transparent,uSmoke:this.smoke,uResolution:[this.image.w,this.image.h]});
  g.pass(this.blur,this.bloom[0],{uImage:this.image.textures[0],uDirection:[1/this.bloom[0].w,0],uThreshold:1});
  g.pass(this.blur,this.bloom[1],{uImage:this.bloom[0].textures[0],uDirection:[0,1/this.bloom[0].h],uThreshold:0});
  g.pass(this.blur,this.bloom[0],{uImage:this.bloom[1].textures[0],uDirection:[1/this.bloom[0].w,0],uThreshold:0});
  g.pass(this.post,outputTarget,{uImage:this.image.textures[0],uBloom:this.bloom[0].textures[0],uResolution:[canvas.width,canvas.height],uExposure:this.exposure,uTime:this.flow.time,uClean:CAPTURE?1:0,uTransparent:this.transparent});
 }
}
