import React from 'react';
import {type TemplateSkin} from '../../_fixtures/TemplateSkin';
export type BusinessRow={id:string;title:string;detail:string;tag:string};
export const BusinessRowContent:React.FC<{row:BusinessRow;skin:TemplateSkin}>=({row,skin})=><>
  <div style={{width:88,flexShrink:0,color:skin.accent,fontSize:28,fontWeight:800,textAlign:'center'}}>{row.tag}</div>
  <div style={{flex:1,minWidth:0,fontSize:32,lineHeight:1.2,color:skin.text,fontWeight:700,overflowWrap:'anywhere'}}>{row.title}</div>
  <div style={{width:160,flexShrink:0,fontSize:24,lineHeight:1.25,color:skin.muted,textAlign:'right'}}>{row.detail}</div>
</>;
