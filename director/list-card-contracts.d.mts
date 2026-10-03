export type ListCardRow = {id:string;title:string;detail:string;tag:string};
export type ListCardParams = {rows:ListCardRow[];targetId:string;focusLabel:string};
export const LIST_CARD_IDS: Set<string>;
export const LIST_CARD_FIELDS: Record<string,string>;
export function validateListCardParams(id:string,params:unknown):ListCardParams|undefined;
