/** Bind study requests to the database opened by this page, including token races. */
export function jwtAccount(token:string){
 try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub as string;}catch{return undefined;}
}
export function guardStudyRequest(url:string,authorization:string|null,openedAccount:string|undefined){
 const path=new URL(url).pathname;
 if(!path.startsWith('/rest/v1/')&&!path.startsWith('/storage/v1/'))return;
 const token=authorization?.replace(/^Bearer\s+/i,'')??'';
 if(!openedAccount||jwtAccount(token)!==openedAccount)throw Error('账号状态已变化，请刷新页面。原记录仍保存在此浏览器');
}
export function cloudRequestFetch(openedAccount:string|undefined,transport:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  const request=new Request(input,init);
  guardStudyRequest(request.url,request.headers.get('authorization'),openedAccount);
  return transport(request,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
 };
}
