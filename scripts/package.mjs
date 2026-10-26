import {spawnSync} from 'node:child_process';
for(const args of [['scripts/build.mjs'],['node_modules/electron-builder/out/cli/cli.js','--win','--x64','--publish','never']]){const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});if(result.status!==0)process.exit(result.status||1);}
