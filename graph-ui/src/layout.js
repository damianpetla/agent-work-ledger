import dagre from '@dagrejs/dagre';
const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
function segmentHits(a,b,r){return a.x===b.x?a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom:a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right}
const box=(n,pad=0)=>({id:n.id,left:n.position.x-pad,right:n.position.x+n.measured.width+pad,top:n.position.y-pad,bottom:n.position.y+n.measured.height+pad});
// Supported composition: an explicit revision path, consistent attempts, one
// check per target. Participants/run headers are context, never invented steps.
function revisionPacking(nodes,edges){
 const attempts=nodes.filter(n=>n.data.kind==='attempt'),checks=nodes.filter(n=>n.data.kind==='event');
 const actors=nodes.filter(n=>n.data.kind==='actor'),runs=nodes.filter(n=>n.data.kind==='run');
 if(!attempts.length||attempts.length>4||actors.length>5||runs.length>4||nodes.some(n=>!['attempt','event','actor','run'].includes(n.data.kind))||attempts.some(n=>n.data.entity.facts.bindingStatus!=='consistent'))return null;
 const revisions=edges.filter(e=>e.kind==='revision'&&e.validity==='valid'),ids=new Set(attempts.map(n=>n.id));
 const roots=attempts.filter(n=>!revisions.some(e=>e.target===n.id));
 if(roots.length!==1||revisions.length!==attempts.length-1)return null;
 const order=[];let id=roots[0].id;while(id&&!order.includes(id)){order.push(id);const out=revisions.filter(e=>e.source===id);if(out.length>1)return null;id=out[0]?.target}
 if(order.length!==attempts.length)return null;
 const targets=new Map();for(const n of checks){const links=edges.filter(e=>e.source===n.id&&['qa','review'].includes(e.kind)&&e.validity==='valid');if(links.length!==1||!ids.has(links[0].target)||targets.has(links[0].target))return null;targets.set(links[0].target,n)}
 const actorLinks=edges.filter(e=>e.kind==='assignment'&&e.validity==='valid');
 const actorOrder=[],pending=[...actors].sort((a,b)=>a.id<b.id?-1:1);while(pending.length){const i=pending.findIndex(n=>!actorLinks.some(e=>e.target===n.id&&pending.some(p=>p.id===e.source)));actorOrder.push(...pending.splice(i<0?0:i,1))}
 const positions=new Map();let y=64;
 function band(items,gap){let x=32;for(const n of items){positions.set(n.id,{x,y});x+=n.measured.width+gap}y+=Math.max(0,...items.map(n=>n.measured.height))+48}
 band(actorOrder,64);band(runs,64);
 const byId=new Map(nodes.map(n=>[n.id,n])),main=order.map(id=>byId.get(id));
 let x=32;for(const n of main){positions.set(n.id,{x,y});x+=n.measured.width+160}
 y+=Math.max(...main.map(n=>n.measured.height))+72;
 for(const id of order)if(targets.has(id)){const n=targets.get(id);positions.set(n.id,{x:positions.get(id).x,y})}
 return positions;
}
export function layout(nodes,edges,labels={}){
 if(!nodes.length)return {nodes,edges,bounds:{left:0,right:0,top:0,bottom:0}};
 const g=new dagre.graphlib.Graph().setGraph({rankdir:'LR',ranksep:160,nodesep:64,marginx:32,marginy:64}).setDefaultEdgeLabel(()=>({}));
 [...nodes].sort((a,b)=>a.id<b.id?-1:1).forEach(n=>g.setNode(n.id,{width:n.measured.width,height:n.measured.height}));edges.forEach(e=>g.setEdge(e.source,e.target));dagre.layout(g);
 let positions=revisionPacking(nodes,edges);const composed=!!positions;
 if(!positions){positions=new Map();const roots=nodes.filter(n=>g.inEdges(n.id).length===0),order=[];let cursor=roots[0]?.id;const path=edges.length===nodes.length-1&&roots.length===1&&nodes.every(n=>g.inEdges(n.id).length<=1&&g.outEdges(n.id).length<=1);if(path)while(cursor&&!order.includes(cursor)){order.push(cursor);cursor=g.successors(cursor)[0]}
  if(path&&order.length===nodes.length){let y=64;const width=Math.max(...nodes.map(n=>n.measured.width)),cols=Math.max(1,Math.floor((1112+100)/(width+100)));for(let row=0;row<Math.ceil(order.length/cols);row++){let ids=order.slice(row*cols,(row+1)*cols),h=Math.max(...ids.map(id=>g.node(id).height));ids.forEach((id,col)=>positions.set(id,{x:32+(row%2?cols-1-col:col)*(width+100),y}));y+=h+140}}
  else nodes.forEach(n=>{let p=g.node(n.id);positions.set(n.id,{x:p.x-n.measured.width/2,y:p.y-n.measured.height/2})});
 }
 const placed=nodes.map(n=>({...n,position:positions.get(n.id)})),byId=new Map(placed.map(n=>[n.id,n])),boxes=placed.map(n=>box(n,16)),used=[];
 const rightBound=Math.max(...placed.map(n=>n.position.x+n.measured.width));
 let top=Math.min(...placed.map(n=>n.position.y))-48,outer=rightBound+64;
 const linked=edges.map(e=>{const a=byId.get(e.source),b=byId.get(e.target),ar=box(a),br=box(b),size=labels[e.id]||{width:100,height:22};
  let sourceHandle,targetHandle,points,labelX,labelY;
  const vertical=composed&&Math.abs(a.position.y-b.position.y)>Math.abs(a.position.x-b.position.x),forward=vertical?br.top>ar.top:br.left>=ar.left;
  if(vertical){sourceHandle=forward?'bottom':'top';targetHandle=forward?'top':'bottom';const sx=(ar.left+ar.right)/2,sy=forward?ar.bottom:ar.top,tx=(br.left+br.right)/2,ty=forward?br.top:br.bottom,mid=(sy+ty)/2;points=[{x:sx,y:sy},{x:sx,y:mid},{x:tx,y:mid},{x:tx,y:ty}];labelX=(sx+tx)/2;labelY=mid}
  else{sourceHandle=forward?'right':'left';targetHandle=forward?'left':'right';const sx=forward?ar.right:ar.left,sy=(ar.top+ar.bottom)/2,tx=forward?br.left:br.right,ty=(br.top+br.bottom)/2,mid=(sx+tx)/2;points=[{x:sx,y:sy},{x:mid,y:sy},{x:mid,y:ty},{x:tx,y:ty}];labelX=mid;labelY=Math.abs(sy-ty)<1&&br.left-ar.right<100?Math.min(ar.top,br.top)-size.height/2-16:(sy+ty)/2}
  const lb=()=>({left:labelX-size.width/2,right:labelX+size.width/2,top:labelY-size.height/2,bottom:labelY+size.height/2});
  if(a.id===b.id||points.slice(1).some((p,i)=>boxes.filter(r=>r.id!==a.id&&r.id!==b.id).some(r=>segmentHits(points[i],p,r)))||boxes.some(r=>overlap(lb(),r))||used.some(r=>overlap(lb(),r))){
   sourceHandle='right';targetHandle=a.id===b.id?'top':'right';const sx=ar.right,sy=(ar.top+ar.bottom)/2,tx=a.id===b.id?(br.left+br.right)/2:br.right,ty=a.id===b.id?br.top:(br.top+br.bottom)/2;
   if(composed){const so=sx+24,to=tx+24,ya=ar.top-28,yb=br.top-28;outer=Math.max(outer,rightBound+size.width/2+24);labelX=outer;labelY=(ya+yb)/2;points=[{x:sx,y:sy},{x:so,y:sy},{x:so,y:ya},{x:outer,y:ya},{x:outer,y:yb},{x:to,y:yb},{x:to,y:ty},{x:tx,y:ty}];outer+=Math.max(80,size.width+16)}
   else {const colRight=n=>Math.max(...placed.filter(p=>Math.abs(p.position.x+p.measured.width/2-n.position.x-n.measured.width/2)<1).map(p=>p.position.x+p.measured.width));const so=colRight(a)+24,to=a.id===b.id?tx:colRight(b)+24;labelX=(so+to)/2;labelY=top;points=[{x:sx,y:sy},{x:so,y:sy},{x:so,y:top},{x:to,y:top},{x:to,y:ty},{x:tx,y:ty}];top-=size.height+16}
  }
  used.push(lb());return {...e,sourceHandle,targetHandle,data:{...e.data,points,labelX,labelY}};
 });
 const all=[...placed.map(n=>box(n)),...used,...linked.flatMap(e=>e.data.points.map(p=>({left:p.x,right:p.x,top:p.y,bottom:p.y})))];
 const bounds={left:Math.min(...all.map(b=>b.left)),right:Math.max(...all.map(b=>b.right)),top:Math.min(...all.map(b=>b.top)),bottom:Math.max(...all.map(b=>b.bottom))};return {nodes:placed,edges:linked,bounds};
}
