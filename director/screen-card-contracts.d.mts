export const SCREEN_CARD_IDS:Set<string>;
export const SCREEN_CARD_FIELDS:Readonly<Record<string,Record<string,string>>>;
export function validateScreenCardParams(id:string,params:unknown):Record<string,unknown>|undefined;
