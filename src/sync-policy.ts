export function retryDelay(failures:number,hidden:boolean){
 return Math.min(120000,15000*2**Math.min(failures,3))*(hidden?2:1);
}
export type Revision={serverId:string;revision:number};
export function sameRevision(a:Revision|undefined,b:Revision|null){return !!a&&!!b&&a.serverId===b.serverId&&a.revision===b.revision;}
