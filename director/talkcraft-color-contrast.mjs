// Foreground selection uses rendered background pixels, including translucent media.
// The result is frozen per word event, never recalculated on playback frames.
export function parseColor(value){
 if(Array.isArray(value)&&value.length>=3)return value;
 let h=String(value).trim();if(h.startsWith('#')){h=h.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');if(/^[a-f\d]{6}$/i.test(h))return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
 const m=h.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
 if(m)return m.slice(1,4).map(Number).concat(m[4]===undefined?1:Number(m[4]));
 throw Error('不支持的颜色：'+value);
}
export function compositeColor(foreground,background,opacity=1){const f=parseColor(foreground),b=parseColor(background),a=(f[3]??1)*opacity;return f.slice(0,3).map((v,i)=>v*a+b[i]*(1-a));}
export function contrastRatio(foreground,background){
 const l=c=>{const x=parseColor(c).slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return x[0]*.2126+x[1]*.7152+x[2]*.0722;};
 const a=l(foreground),b=l(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export function renderedInk(foreground,brightness=1){const f=parseColor(foreground);return f.slice(0,3).map(v=>Math.min(255,v*brightness)).concat(f[3]??1);}
export function minimumContrast(foreground,backgrounds,opacity=1,brightness=1){if(!backgrounds.length)throw Error('缺少实际背景颜色');return Math.min(...backgrounds.map(b=>contrastRatio(compositeColor(renderedInk(foreground,brightness),b,opacity),b)));}
export function chooseReadableText(foreground,backgrounds,{opacity=1,brightness=1,minimum=4.5}={}){
 const original=minimumContrast(foreground,backgrounds,opacity,brightness);
 if(original>=minimum)return {color:foreground,ratio:original,changed:false};
 const options=['#ffffff','#111817'].map(color=>({color,ratio:minimumContrast(color,backgrounds,opacity,brightness)})).sort((a,b)=>b.ratio-a.ratio);
 if(options[0].ratio>=minimum)return {...options[0],changed:true};
 // Mixed footage cannot always support one bare color. Use one fixed local plate.
 for(const backgroundColor of ['#000000','#ffffff'])for(const color of ['#ffffff','#111817']){
  const ratio=minimumContrast(color,[renderedInk(backgroundColor,brightness)],opacity,brightness);
  if(ratio>=minimum)return {color,backgroundColor,ratio,changed:true};
 }
 throw Error('文字透明度过低，换字色和底衬仍无法达到对比度要求');
}
export function backgroundsUnderGlyphs(row,normal,background,width,height){
 const r=row.rect,colors=new Map();
 for(let y=Math.max(0,Math.floor(r.top));y<Math.min(height,Math.ceil(r.top+r.height));y+=2)
  for(let x=Math.max(0,Math.floor(r.left));x<Math.min(width,Math.ceil(r.left+r.width));x+=2){
   const at=(y*width+x)*3;if(Math.max(...[0,1,2].map(i=>Math.abs(normal[at+i]-background[at+i])))<4)continue;
   const rgb=[...background.subarray(at,at+3)],ink=compositeColor(renderedInk(row.color??'#ffffff',row.brightness??1),rgb,row.opacity??1);
   const direction=ink.map((v,i)=>v-rgb[i]),delta=rgb.map((v,i)=>normal[at+i]-v),norm=direction.reduce((s,v)=>s+v*v,0);
   if(norm<16)continue;
   const coverage=delta.reduce((s,v,i)=>s+v*direction[i],0)/norm;
   // Require a solid stroke pixel consistent with the measured foreground. Motion
   // decoder differences and antialiased edges are not reliable glyph evidence.
   if(coverage<.95||coverage>1.02||Math.max(...delta.map((v,i)=>Math.abs(v-coverage*direction[i])))>2)continue;
   colors.set(rgb.join(','),rgb);
  }
 return [...colors.values()];
}
