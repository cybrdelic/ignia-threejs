const materialGLSL=gridGLSL+`
uniform sampler2D uV,uC;uniform float uSmoke;
uniform vec3 uFieldGrid;uniform vec2 uFieldAtlas;out vec4 O;
vec2 fieldUV(vec3 p){p=clamp(p,vec3(0),uFieldGrid-1.);return (vec2(mod(p.z,8.),floor(p.z/8.))*uFieldGrid.xy+p.xy+.5)/uFieldAtlas;}
vec4 fieldAt(sampler2D t,vec3 p){p=clamp(p,vec3(0),uFieldGrid-1.001);float z=floor(p.z);return mix(texture(t,fieldUV(vec3(p.xy,z))),texture(t,fieldUV(vec3(p.xy,z+1.))),fract(p.z));}
void main(){vec3 p=cell(),w=world(p),q=(p+.5)/uGrid*uFieldGrid-.5;vec4 c=fieldAt(uC,q);float heat=fieldAt(uV,q).w;
 vec3 l=normalize(vec3(-.6,1.,.45));float tau=0.;
 for(int i=1;i<=10;i++){float dist=float(i)*.14;vec3 fq=q+l*dist*uFieldGrid/uSize;vec3 cq=p+l*dist*uGrid/uSize;tau+=max(0.,fieldAt(uC,fq).z)*.14*(1.+uSmoke*2.5);tau+=solid(cq)*2.;}
 float shadow=exp(-tau);vec3 scatter=vec3(.075,.091,.115)*(.14+.86*shadow);
 scatter+=vec3(.036,.009,.002)*smoothstep(.52,1.18,heat);
 O=vec4(scatter,shadow);
}`;
const occupancyGLSL=gridGLSL+`
uniform sampler2D uMaterial;uniform sampler2D uV,uC;uniform vec3 uBrickGrid;uniform vec2 uBrickAtlas;out vec4 O;
void main(){vec2 tile=floor(gl_FragCoord.xy/uBrickGrid.xy);vec3 b=vec3(mod(gl_FragCoord.xy,uBrickGrid.xy)-.5,tile.x+tile.y*8.);vec3 base=b*8.;float m=0.;
for(int z=-1;z<9;z++)for(int y=-1;y<9;y++)for(int x=-1;x<9;x++){m=max(m,max(at(uC,base+vec3(x,y,z)).z,at(uV,base+vec3(x,y,z)).w*.2));}
O=vec4(m,0,0,0);
}`;


const lightGLSL=gridGLSL+`uniform sampler2D uMaterial,uV,uC;out vec4 O;
void main(){float sum=0.;for(int i=0;i<18;i++){float a=float(i)*2.399,r=.1+.65*sqrt(float(i)/18.);vec3 p=vec3(cos(a)*r,.32+mod(float(i),3.)*.24,sin(a)*r);vec3 q=(p+vec3(uSize.x*.5,0.,uSize.z*.5))/uSize*uGrid-.5;
 float kelvin=300.+sampleV(uV,q).w*1420.;float soot=sampleV(uC,q).z;
 vec4 c=sampleV(uC,q);sum+=230000./(exp(23395./max(400.,kelvin))-1.)*soot*9.+uChemilum*c.w*.25;}
 O=vec4(1.-exp(-sum*.15),0,0,1);}`;
