import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { ROOT } from '../lib/collection.js';
import { inScope } from '../scripts/deploy-scope.js';
const script=path.join(ROOT,'scripts/deploy.sh');
test('deploy rejects missing messages and contradictory screenshot options',()=>{
 for(const args of [['--message'],['--skip-screenshots','--refresh-thumbs'],['--not-an-option']]){const r=spawnSync('bash',[script,...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/需要提交信息|不能同时使用|未知参数/)}
 assert.equal(spawnSync('bash',['-n',script]).status,0);
});
test('deployment scope contains site files but excludes research, prototypes and secrets',()=>{
 for(const name of ['content/games/a.html','site/gallery.js','assets/thumbs/a.webp','slides/old.html','README.md'])assert.equal(inScope(name),true,name);
 for(const name of ['.env','docs/research.md','reports/report.md','homepage-prototype.html','content-copy/secret'])assert.equal(inScope(name),false,name);
});
test('foreign staged files abort commit preflight without changing the index',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shiye-git-'));try{
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git(['init','--quiet']);fs.writeFileSync(path.join(root,'private-notes.txt'),'keep me');git(['add','private-notes.txt']);const before=git(['diff','--cached','--name-only']);
  const result=spawnSync(process.execPath,[path.join(ROOT,'scripts/deploy-scope.js'),'check-index'],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/private-notes/);assert.equal(git(['diff','--cached','--name-only']),before);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
