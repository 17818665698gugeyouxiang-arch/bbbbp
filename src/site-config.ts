export const baseUrl=(import.meta as ImportMeta&{env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
export const assetUrl=(src:string)=>src.startsWith('/')&&!src.startsWith('//')?baseUrl+src.slice(1):src;
export function assetTree<T>(data:T):T{
 if(Array.isArray(data))return data.map(assetTree) as T;
 if(data&&typeof data==='object')return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,assetTree(v)])) as T;
 return typeof data==='string'&&/^\/(papers|fp1|s2|cs|s2-written|s2-reference)\//.test(data)?assetUrl(data) as T:data;
}
declare global{interface Window{STUDY_CLOUD?:{url:string;key:string;enabled:boolean}}}
export const cloudConfig=typeof window!=='undefined'?window.STUDY_CLOUD:undefined;
export const cloudEnabled=!!cloudConfig?.enabled;
export const cloudStorageKey='study-cloud-auth';
export function accountDatabaseName(){
 if(!cloudEnabled)return 'bpho-study-v1';
 try{const id=JSON.parse(localStorage.getItem(cloudStorageKey)??'null')?.user?.id;if(/^[a-f0-9-]{36}$/.test(id??''))return 'bpho-study-v1-cloud-'+id;}catch{}
 return 'bpho-study-v1';
}
