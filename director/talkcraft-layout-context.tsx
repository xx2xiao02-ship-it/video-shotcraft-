import React, {createContext,useContext} from 'react';
const Host=createContext(false);
export const PresentationHostProvider=Host.Provider;
export const usePresentationHost=()=>useContext(Host);
