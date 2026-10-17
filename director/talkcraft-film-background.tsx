import React, {createContext,useContext} from 'react';
import {AbsoluteFill,Img,staticFile} from 'remotion';
import {FILM_BACKGROUND} from './film-background-config';
export type FilmBackgroundConfig={kind:string;color:string;fit:'cover'|'contain';src?:string;sha256?:string};
const Context=createContext<FilmBackgroundConfig>(FILM_BACKGROUND as FilmBackgroundConfig);
export const FilmBackgroundProvider=Context.Provider;
export const useFilmBackground=()=>useContext(Context);
export const FilmBackground:React.FC=()=>{
  const value=useFilmBackground();
  return <AbsoluteFill data-film-background style={{background:value.color,pointerEvents:'none'}}>
    {value.src&&<Img src={staticFile(value.src)} style={{width:'100%',height:'100%',objectFit:value.fit}}/>}
  </AbsoluteFill>;
};
