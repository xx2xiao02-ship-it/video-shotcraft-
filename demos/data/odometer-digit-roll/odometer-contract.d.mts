export function odometerValue(value?: number | string): string;
export function odometerTiming(digitCount: number): {lock:number;pulseEnd:number;labelEnd:number;minFrames:number};
export function validateOdometerProps(props:{value?:number|string;unit?:string;label?:string;title?:string},frames:number,fps:number):
  {text:string;lock:number;pulseEnd:number;labelEnd:number;minFrames:number};
