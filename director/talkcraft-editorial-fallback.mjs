import {createHash} from 'node:crypto';
export const targetFingerprint=target=>createHash('sha256').update(target.provider
 ?`${target.provider}\0${target.responsesUrl}\0${target.endpoint}\0${target.apiKey}`:`${target.endpoint}\0${target.apiKey}`).digest('hex');
// B 分镜使用操作台已配置的两个主模型、两个辅助模型及两组通用池。
// 相同接入点和相同凭据只尝试一次；同接入点不同账号保留为独立目标。
export function editorialFallbackPlan(config){
 if(config.provider==='acctoken')return [{provider:'acctoken',responsesUrl:config.responsesUrl,endpoint:config.proEndpoint,apiKey:config.apiKey,source:'acctoken'}];
 const choice=config.globalModel,other=choice==='pro'?'turbo':'pro';
 const result=[],add=(endpoint,apiKey,source)=>{if(!endpoint||!apiKey)return;const target={endpoint,apiKey,source};if(!result.some(t=>targetFingerprint(t)===targetFingerprint(target)))result.push(target);};
 add(config[`${choice}Endpoint`],config.apiKey,'primary');
 add(config[`${other}Endpoint`],config.apiKey,'primary-other-model');
 add(config[choice==='pro'?'fallbackProEndpoint':'fallbackTurboEndpoint']||config.fallbackEndpoint,config.fallbackApiKey||config.apiKey,'auxiliary');
 add(config[other==='pro'?'fallbackProEndpoint':'fallbackTurboEndpoint']||config.fallbackEndpoint,config.fallbackApiKey||config.apiKey,'auxiliary-other-model');
 for(const endpoint of config.genericFallbackEndpoints||[])add(endpoint,config.apiKey,'primary-generic');
 for(const endpoint of config.auxiliaryGenericFallbackEndpoints||[])add(endpoint,config.fallbackApiKey||config.apiKey,'auxiliary-generic');
 return result;
}
