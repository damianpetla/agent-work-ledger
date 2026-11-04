import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {mkdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('../web/graph-ui',{recursive:true});
await build({entryPoints:['src/index.jsx'],alias:{'@dagrejs/dagre':require.resolve('@dagrejs/dagre')},bundle:true,format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},outfile:'../web/graph-ui/graph.js',legalComments:'linked'});
const lock=JSON.parse(await readFile('package-lock.json','utf8'));let notice='Third-party licenses for the throwaway D graph bundle\n\n';
for(const [path,pkg] of Object.entries(lock.packages)){
 if(!path||path.includes('@esbuild/')||path==='node_modules/esbuild')continue;
 for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','license'])try{notice+=`${path} ${pkg.version}\n${await readFile(path+'/'+file,'utf8')}\n\n`;break}catch{}
}
await writeFile('../web/graph-ui/THIRD-PARTY-LICENSES.txt',notice.trimEnd()+'\n');
