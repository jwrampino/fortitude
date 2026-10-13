#!/usr/bin/env node
/* ============================================================================
   Fortitude bot trainer: ONE self-contained file. No other files needed.
   Put it in a subfolder of your game repo (e.g. bot/train-bot.js). It uses the repo's engine.js
   (looked for next to this file, then one folder up) and trains a small neural-network bot.

     node train-bot.js --minutes 60            train, then write a report
     node train-bot.js --minutes 60 --install  ...and copy expert.js + expert-weights.js into the game folder

   Output goes to ./bot-output (add it to .gitignore): report.md, results.json, training_log.csv,
   params.json, params_best.json, checkpoints/, export/.
   Options: --workers N (default: all cores) --batch 128 --eval-games 300 --resume FILE --baseline FILE
            --pen 1 --penalty-start 25 --penalty-span 45 --lr 0.02 --max-rounds 200 --out DIR
            --report-only FILE   (just re-run the evaluation report for saved weights)
   Ctrl+C stops early and still writes the report. Retrain from scratch whenever the rules change.
   ============================================================================ */
"use strict";
const {isMainThread,parentPort,workerData}=require("worker_threads");
const __mods={},__defs={};
function __def(n,f){__defs[n]=f}
function __req(n){if(!__mods[n]){const m={exports:{}};__mods[n]=m;__defs[n](m,m.exports)}return __mods[n].exports}

__def("policy",function(module,exports){
// Shared by training and evaluation (whole-board features, network, and the bot's turn logic): feature builder, tiny policy network, and the NN turn logic.
const fs=require("fs"),vm=require("vm");
function loadEngine(path){
  const ctx={console,Math,Promise,Object,Array};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path,"utf8"),ctx);return ctx.Fortitude;
}
const path=require("path");
function findEngine(){
  const c=[process.env.ENGINE,path.join(__dirname,"engine.js"),path.join(__dirname,"..","engine.js")].filter(Boolean);
  for(const f of c)if(fs.existsSync(f))return f;
  throw new Error("engine.js not found. Put a copy next to these scripts or set ENGINE=/path/to/engine.js");
}
const F=loadEngine(findEngine());
const G=F.Game.prototype, rv=F.rv, isNumR=F.isNumR, worth=F.worth;
const NUMS=F.NUMS;

/* ---------- features ---------- */
function Builder(){this.v=[];this.n=[]}
Builder.prototype.f=function(name,val){this.v.push(val);this.n.push(name)};
function stateFeats(g,i,b){
  const p=g.players[i],c={};p.offense.forEach(x=>c[x.rank]=(c[x.rank]||0)+1);
  NUMS.forEach(r=>b.f("h"+r,(c[r]||0)/2));
  ["J","Q","K","A"].forEach(r=>b.f("h"+r,(c[r]||0)/2));
  b.f("jokers",p.jokers/g.totalJokers);
  const live=g.liveCount(p);b.f("live",live/4);b.f("dead",(4-live)/4);b.f("exposed",g.exposed(p)?1:0);
  b.f("pending",p.pending?p.pending.n/2:0);
  let sum=0,k=0,tens=0;p.defense.forEach(d=>{if(!d.dead){sum+=rv(d.card.rank);k++;if(d.card.rank==="10")tens++}});
  b.f("defmean",k?sum/k/10:0);b.f("tens",tens/4);
  const all=g.players.filter((q,j)=>j!==i);
  const alive=all.filter(q=>q.alive);
  b.f("nopp",alive.length/5);b.f("anyexp",alive.some(q=>g.exposed(q))?1:0);
  b.f("minlive",alive.length?Math.min.apply(null,alive.map(q=>g.liveCount(q)))/4:0);
  // every opponent's visible board, most threatened first, padded to 5 seats
  const ord=all.slice().sort((a,c)=>(c.alive-a.alive)||(g.liveCount(a)-g.liveCount(c)));
  for(let s=0;s<5;s++){const q=ord[s];
    if(!q||!q.alive){["al","lv","ex","pe","up","mu","xu"].forEach(n=>b.f("o"+s+n,0));continue}
    const ups=q.defense.filter(d=>!d.dead&&d.up).map(d=>rv(d.card.rank));
    b.f("o"+s+"al",1);b.f("o"+s+"lv",g.liveCount(q)/4);b.f("o"+s+"ex",g.exposed(q)?1:0);b.f("o"+s+"pe",q.pending?q.pending.n/2:0);
    b.f("o"+s+"up",ups.length/4);b.f("o"+s+"mu",ups.length?ups.reduce((x,y)=>x+y,0)/ups.length/10:0);b.f("o"+s+"xu",ups.length?Math.max.apply(null,ups)/10:0);
  }
  const mine=p.defense.map(d=>d.dead?0:rv(d.card.rank)/10).sort((x,y)=>y-x);
  mine.forEach((v,k)=>b.f("md"+k,v));
  b.f("round",Math.min(g.round,60)/60);b.f("seats",g.n/6);
  b.f("jheld",g.jokersHeld()/g.totalJokers);
}
function killP(slot,a){ // chance the strike destroys, tie counted half
  if(slot.up){const v=rv(slot.card.rank);return a>v?1:a===v?0.5:0}
  let s=0;for(let v=2;v<=10;v++)s+=a>v?1:a===v?0.5:0;return s/9;
}
const TYPES=["conv","ace","queen","strike","jack","discard"];
const CONVS=["pair","JJ","QQ","KK","joker","AAA","AAAA"];
function actFeats(g,i,a,b){
  TYPES.forEach(t=>b.f("t_"+t,a.type===t?1:0));
  const isS=a.type==="strike"||a.type==="jack";
  const T=a.t!=null?g.players[a.t]:null,slot=isS?T.defense[a.s]:null;
  b.f("s_att",isS&&a.type==="strike"?rv(a.rank)/10:0);
  b.f("s_kp",isS?a.type==="jack"?1:killP(slot,rv(a.rank)):0);
  b.f("s_up",isS&&slot.up?1:0);
  b.f("s_known",isS&&slot.up?rv(slot.card.rank)/10:0);
  b.f("s_tlive",T?g.liveCount(T)/4:0);
  b.f("s_last",isS&&g.liveCount(T)===1?1:0);
  b.f("s_tup",T?T.defense.filter(d=>!d.dead&&d.up).length/4:0);
  b.f("s_kpxlast",isS&&g.liveCount(T)===1?killP(slot,a.type==="jack"?11:rv(a.rank)):0);
  b.f("ace_n",a.type==="ace"?(T.pending?T.pending.n:0)/2:0);
  b.f("ace_stack",a.type==="ace"&&T.pending?1:0);
  b.f("q_dead",a.type==="queen"?g.deadCount(g.players[i])/4:0);
  b.f("d_worth",a.type==="discard"?worth(g.players[i].offense[a.hi])/9:0);
  b.f("d_val",a.type==="discard"&&isNumR(g.players[i].offense[a.hi].rank)?rv(g.players[i].offense[a.hi].rank)/10:0);
  CONVS.forEach(k=>b.f("c_"+k,a.type==="conv"&&a.kind===k?1:0));
  b.f("c_rank",a.type==="conv"&&a.kind==="pair"?a.rank/10:0);
}
/* ---------- network: score = w2.tanh(W1 x + b1) + b2 + wl.x ---------- */
const H=48;let D=0,NAMES=null;
function dims(){const b=new Builder();const g=new F.Game([{name:"a",bot:true},{name:"b",bot:true}],{});
  stateFeats(g,0,b);actFeats(g,0,{type:"discard",hi:0},b);D=b.v.length;NAMES=b.n.slice()}
dims();
function newParams(rand){
  const P={W1:new Float64Array(H*D),b1:new Float64Array(H),w2:new Float64Array(H),b2:new Float64Array(1),wl:new Float64Array(D)};
  for(let k=0;k<P.W1.length;k++)P.W1[k]=(rand()-0.5)*0.4;
  for(let k=0;k<H;k++)P.w2[k]=(rand()-0.5)*0.2;
  const set=(n,v)=>{const ix=NAMES.indexOf(n);if(ix<0)throw n;P.wl[ix]=v};
  set("t_ace",6);set("t_strike",0.3);set("t_jack",0.8);set("t_queen",1.0);set("q_dead",3);set("t_discard",-3);set("t_conv",-1.5);
  set("s_kp",2.5);set("s_kpxlast",2);set("s_up",-0.2);set("c_KK",3.5);set("c_joker",3.5);set("c_AAAA",2.5);
  set("c_pair",0.5);set("c_JJ",0.8);set("c_QQ",0.8);set("ace_stack",-0.5);set("d_worth",-2);
  return P;
}
function score(P,x,cache){
  const h=cache||new Float64Array(H);let z=P.b2[0];
  for(let j=0;j<H;j++){let s=P.b1[j];const o=j*D;for(let k=0;k<D;k++)s+=P.W1[o+k]*x[k];h[j]=Math.tanh(s);z+=P.w2[j]*h[j]}
  for(let k=0;k<D;k++)z+=P.wl[k]*x[k];return z;
}
/* ---------- candidates ---------- */
function candidates(g,i,allowConv){
  const p=g.players[i],C=[];
  if(allowConv){
    g.convertOptions(p).forEach(o=>{
      let kind=o.key.indexOf("pair:")===0?"pair":o.key.indexOf("joker:")===0?"joker":o.key.indexOf("AAA:")===0?"AAA":o.key;
      C.push({type:"conv",key:o.key,kind,rank:kind==="pair"?+o.key.slice(5):0});
    });
  }
  const opps=g.players.map((q,j)=>j).filter(j=>j!==i&&g.players[j].alive);
  const aIx=p.offense.findIndex(c=>c.rank==="A");
  if(aIx>=0)opps.forEach(t=>{if(g.exposed(g.players[t]))C.push({type:"ace",t,hi:aIx})});
  const qIx=p.offense.findIndex(c=>c.rank==="Q");
  if(qIx>=0&&g.deadCount(p)>0)C.push({type:"queen",hi:qIx});
  const seen={};
  p.offense.forEach((c,hi)=>{
    if(isNumR(c.rank)&&!seen[c.rank]){seen[c.rank]=1;
      opps.forEach(t=>{const T=g.players[t];if(g.exposed(T))return;T.defense.forEach((d,s)=>{if(!d.dead)C.push({type:"strike",t,s,hi,rank:c.rank})})})}
  });
  const jIx=p.offense.findIndex(c=>c.rank==="J");
  if(jIx>=0)opps.forEach(t=>{const T=g.players[t];if(g.exposed(T))return;T.defense.forEach((d,s)=>{if(!d.dead&&d.up&&d.card.rank==="10")C.push({type:"jack",t,s,hi:jIx})})});
  const ds={};p.offense.forEach((c,hi)=>{if(!ds[c.rank]){ds[c.rank]=1;C.push({type:"discard",hi})}});
  return C;
}
function decide(g,i,P,mode,rec,rand,temp){
  const C=candidates(g,i,mode.conv);if(!C.length)return null;
  const sb=new Builder();stateFeats(g,i,sb);
  const X=C.map(a=>{const b=new Builder();b.v=sb.v.slice();b.n=sb.n;actFeats(g,i,a,b);return Float64Array.from(b.v)});
  const z=X.map(x=>score(P,x));
  let ix;
  if(mode.greedy){ix=0;for(let k=1;k<z.length;k++)if(z[k]>z[ix])ix=k}
  else{
    const m=Math.max.apply(null,z),e=z.map(v=>Math.exp((v-m)/(temp||1))),S=e.reduce((a,b)=>a+b,0);
    let r=rand()*S;ix=0;for(;ix<e.length-1;ix++){r-=e[ix];if(r<=0)break}
  }
  if(rec)rec.push({X,ix,z});
  return C[ix];
}
/* ---------- NN turn ---------- */
const origBotTurn=G.botTurn;
G.botTurn=async function(i){
  const p=this.players[i];
  if(p.level!=="nn")return origBotTurn.call(this,i);
  const P=p.params,rec=p.rec||null,rand=this.rand;let g=0;
  let gd=0;
  while(p.pending&&gd++<12){
    g=0;
    if(!this.canDefend(p))while(g++<8&&!this.canDefend(p)&&this.botConvertStep(i,true));
    if(this.canDefend(p))this.defendAce(i,this.has(p,"K")?"K":"A");
    else{this.eliminate(i,"cannot answer the Ace");return}
  }
  for(let step=0;step<10&&!this.over;step++){
    const a=decide(this,i,P,{conv:step<8,greedy:!!p.greedy},rec,rand,p.temp);
    if(!a){return}
    if(a.type==="conv"){this.doConvert(i,a.key);continue}
    if(a.type==="ace")this.aceAttack(i,a.t,a.hi);
    else if(a.type==="queen")this.queen(i,a.hi);
    else if(a.type==="strike"||a.type==="jack")await this.attackDefense(i,a.t,a.s,a.hi);
    else this.discardPass(i,a.hi);
    return;
  }
};
module.exports={ENGINE_PATH:findEngine(),F,H,D:()=>D,NAMES:()=>NAMES,newParams,score,decide,candidates,KEYS:["W1","b1","w2","b2","wl"]};

});

__def("selfplay",function(module,exports){
// One training/evaluation game, plus the gradient step. Used by worker threads.
const {F,H,D,newParams}=__req("policy");
const Dm=D(),KEYS=["W1","b1","w2","b2","wl"];
function lenPen(r,c){return c.pen*Math.min(1.5,Math.pow(Math.max(0,r-c.start)/c.span,2))}
function winBonus(r){return 1+0.5*Math.max(0,(40-r)/40)}
function toParams(j){const Q=newParams(()=>0.5);KEYS.forEach(k=>Q[k]=Float64Array.from(j[k]));return Q}
function pickOpp(rand,snaps){const r=rand();return r<0.05?"easy":r<0.15?"normal":r<0.70?"hard":(snaps.length?"snap":"hard")}
async function trainGame(P,snaps,cfg,rand){
  const n=2+Math.floor(rand()*5);const seats=[];
  for(let j=0;j<n;j++)seats.push({name:"S"+j,bot:true,level:j===0?"nn":pickOpp(rand,snaps)});
  for(let j=n-1;j>0;j--){const r=Math.floor(rand()*(j+1));[seats[j],seats[r]]=[seats[r],seats[j]]}
  const g=new F.Game(seats,{},{maxRounds:cfg.maxRounds,rand});
  let learner=null;
  g.players.forEach(p=>{
    if(p.level==="snap"){p.level="nn";p.params=snaps[Math.floor(rand()*snaps.length)];p.greedy=true;p.temp=1}
    else if(p.level==="nn"){p.params=P;p.rec=[];p.greedy=false;p.temp=1;learner=p}});
  await g.run();
  const win=g.winner!=null&&g.players[g.winner]===learner?1:0;
  return {g,learner,adv:win*winBonus(g.round)-1/g.n-lenPen(g.round,cfg),win,n};
}
function accumulate(P,Gr,rec,adv){
  const h=new Float64Array(H);
  for(const d of rec){
    const z=d.z,mx=Math.max.apply(null,z),e=z.map(x=>Math.exp(x-mx)),S=e.reduce((a,b)=>a+b,0);
    for(let j=0;j<z.length;j++){
      const coef=adv*((j===d.ix?1:0)-e[j]/S)/Math.sqrt(rec.length);
      if(Math.abs(coef)<1e-9)continue;
      const x=d.X[j];
      for(let a=0;a<H;a++){let s=P.b1[a];const o=a*Dm;for(let k=0;k<Dm;k++)s+=P.W1[o+k]*x[k];h[a]=Math.tanh(s)}
      for(let a=0;a<H;a++){
        const dp=coef*P.w2[a]*(1-h[a]*h[a]);Gr.w2[a]+=coef*h[a];Gr.b1[a]+=dp;const o=a*Dm;
        for(let k=0;k<Dm;k++)Gr.W1[o+k]+=dp*x[k];
      }
      Gr.b2[0]+=coef;for(let k=0;k<Dm;k++)Gr.wl[k]+=coef*x[k];
    }
  }
}
// Evaluation: the net takes each seat in turn against n-1 copies of `opp` ("easy"|"normal"|"hard"|"params").
async function evalGames(P,P2,opp,n,games,cfg,rand,offset){
  const o={w:0,R:0,rounds:[],jokerEnd:0,lastKing:0,stalemate:0};
  for(let k=0;k<games;k++){
    const me=(k+(offset||0))%n;
    const seats=[...Array(n)].map((_,s)=>({name:"S"+s,bot:true,level:s===me?"nn":(opp==="params"?"nn":opp)}));
    const g=new F.Game(seats,{},{maxRounds:cfg.maxRounds,rand});
    g.players.forEach((p,s)=>{if(p.level==="nn"){p.params=s===me?P:P2;p.greedy=true}});
    await g.run();
    if(g.winner===me)o.w++;o.R+=g.round;o.rounds.push(g.round);
    if(g.reason==="jokers")o.jokerEnd++;else if(g.reason==="stalemate")o.stalemate++;else o.lastKing++;
  }
  return o;
}
module.exports={trainGame,accumulate,evalGames,toParams,KEYS,Dm,H};

});

__def("pool",function(module,exports){
const {Worker}=require("worker_threads");const path=require("path");
class Pool{
  constructor(n,seed){
    this.w=[];this.pend=new Map();this.id=0;
    for(let i=0;i<n;i++){
      const w=new Worker(__filename,{workerData:{seed:(seed||1)*7919+i*104729+13}});
      w.on("message",m=>{const p=this.pend.get(m.id);if(!p)return;this.pend.delete(m.id);m.error?p.rej(new Error(m.error)):p.res(m)});
      w.on("error",e=>{for(const p of this.pend.values())p.rej(e)});
      this.w.push(w);
    }
  }
  send(i,msg){return new Promise((res,rej)=>{const id=++this.id;this.pend.set(id,{res,rej});this.w[i%this.w.length].postMessage(Object.assign({id},msg))})}
  get size(){return this.w.length}
  close(){this.w.forEach(w=>w.terminate())}
}
module.exports=Pool;

});

__def("report",function(module,exports){
// Builds the results tables (win rate, game length, how games end) and writes report.md / results.json
const fs=require("fs"),path=require("path");
const pct=x=>(x*100).toFixed(1)+"%";
const q=(a,f)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(f*s.length))]};
async function grid(pool,params,params2,opps,sizes,games,cfg){
  const rows=[];
  for(const opp of opps)for(const n of sizes){
    const per=Math.ceil(games/pool.size),jobs=[];
    for(let i=0;i<pool.size;i++)jobs.push(pool.send(i,{type:"eval",params,params2,opp,n,games:per,cfg,offset:i*per}));
    const rs=await Promise.all(jobs);
    const o={w:0,R:0,rounds:[],jokerEnd:0,lastKing:0,stalemate:0};
    rs.forEach(r=>{o.w+=r.res.w;o.R+=r.res.R;o.rounds.push(...r.res.rounds);o.jokerEnd+=r.res.jokerEnd;o.lastKing+=r.res.lastKing;o.stalemate+=r.res.stalemate});
    const N=o.rounds.length;
    rows.push({opp,n,games:N,win:o.w/N,chance:1/n,ratio:(o.w/N)*n,meanRounds:o.R/N,medRounds:q(o.rounds,0.5),p90Rounds:q(o.rounds,0.9),
      jokerEnd:o.jokerEnd/N,lastKing:o.lastKing/N,stalemate:o.stalemate/N});
  }
  return rows;
}
function table(rows,label){
  let s="| "+label+" | Seats | Win rate | By chance | x Chance | Rounds mean / median / 90th pct | Ended by Jokers | Ended by last King | Stalemate |\n|---|---|---|---|---|---|---|---|---|\n";
  rows.forEach(r=>{s+=`| ${r.opp} | ${r.n} | ${pct(r.win)} | ${pct(r.chance)} | ${r.ratio.toFixed(2)} | ${r.meanRounds.toFixed(1)} / ${r.medRounds} / ${r.p90Rounds} | ${pct(r.jokerEnd)} | ${pct(r.lastKing)} | ${pct(r.stalemate)} |\n`});
  return s;
}
function avg(rows,f){return rows.reduce((a,r)=>a+r[f],0)/rows.length}
async function makeReport(o){
  const {pool,params,params2,outDir,evalGames,cfg,meta,curve}=o;
  const sizes=[2,3,4,5,6];
  const vs=await grid(pool,params,null,["easy","normal","hard"],sizes,evalGames,cfg);
  let h2h=null;if(params2)h2h=await grid(pool,params,params2,["params"],sizes,evalGames,cfg);
  let md="# Fortitude bot training report\n\n";
  md+=`- Trained for ${meta.minutes.toFixed(1)} minutes, ${meta.iterations} iterations, ${meta.games} training games on ${meta.workers} worker(s)\n`;
  md+=`- Length penalty: starts at round ${cfg.start}, quadratic over ${cfg.span} rounds, strength ${cfg.pen}, capped at 1.5\n`;
  md+=`- Evaluation: ${evalGames} games per row, the bot rotating through every seat, playing its best move each time\n`;
  md+=`- "x Chance" is win rate divided by 1/seats. 1.00 means no better than luck; 2.00 means twice as often as luck.\n\n`;
  md+="## Against the built-in bots\n\n"+table(vs,"Opponents")+"\n";
  const hard=vs.filter(r=>r.opp==="hard");
  md+=`**Summary vs Hard:** average ${avg(hard,"ratio").toFixed(2)}x chance, average game length ${avg(hard,"meanRounds").toFixed(1)} rounds, ${pct(avg(hard,"stalemate"))} stalemates, ${pct(avg(hard,"jokerEnd"))} Joker endings.\n\n`;
  if(h2h)md+="## Against the baseline bot\n\n"+table(h2h.map(r=>Object.assign({},r,{opp:"baseline"})),"Opponents")+"\n";
  if(curve&&curve.length){md+="## Training curve (quick checks vs Hard, 2 to 6 seats)\n\n| Iteration | Minutes | x Chance | Mean rounds |\n|---|---|---|---|\n";
    curve.forEach(c=>{md+=`| ${c.it} | ${c.min.toFixed(1)} | ${c.ratio.toFixed(2)} | ${c.rounds.toFixed(1)} |\n`});md+="\n"}
  fs.writeFileSync(path.join(outDir,"report.md"),md);
  fs.writeFileSync(path.join(outDir,"results.json"),JSON.stringify({meta,vs,h2h,curve},null,1));
  return {md,vs,h2h};
}
module.exports={grid,makeReport};

});

__def("export",function(module,exports){
const fs=require("fs"),path=require("path");
const TEMPLATE="/* \"Expert\" bot: a small neural network that scores every legal move and plays the best one.\n   Loads after engine.js and takes over bot turns for seats whose level is \"expert\".\n   Answering ties and answering a pending Ace still use the standard bot rules. */\n(function(){\nvar F=window.Fortitude,W=window.FORTITUDE_EXPERT;\nif(!F||!W)return;\nvar G=F.Game.prototype,rv=F.rv,isNumR=F.isNumR,worth=F.worth,NUMS=F.NUMS;\nvar H=W.H,D=W.D;\nvar TYPES=[\"conv\",\"ace\",\"queen\",\"strike\",\"jack\",\"discard\"],CONVS=[\"pair\",\"JJ\",\"QQ\",\"KK\",\"joker\",\"AAA\",\"AAAA\"];\n\nfunction stateFeats(g,i,v){\n  var p=g.players[i],c={};p.offense.forEach(function(x){c[x.rank]=(c[x.rank]||0)+1});\n  NUMS.forEach(function(r){v.push((c[r]||0)/2)});\n  [\"J\",\"Q\",\"K\",\"A\"].forEach(function(r){v.push((c[r]||0)/2)});\n  v.push(p.jokers/g.totalJokers);\n  var live=g.liveCount(p);v.push(live/4);v.push((4-live)/4);v.push(g.exposed(p)?1:0);\n  v.push(p.pending?p.pending.n/2:0);\n  var sum=0,k=0,tens=0;p.defense.forEach(function(d){if(!d.dead){sum+=rv(d.card.rank);k++;if(d.card.rank===\"10\")tens++}});\n  v.push(k?sum/k/10:0);v.push(tens/4);\n  var all=g.players.filter(function(q,j){return j!==i}),alive=all.filter(function(q){return q.alive});\n  v.push(alive.length/5);v.push(alive.some(function(q){return g.exposed(q)})?1:0);\n  v.push(alive.length?Math.min.apply(null,alive.map(function(q){return g.liveCount(q)}))/4:0);\n  var ord=all.slice().sort(function(a,c2){return ((c2.alive?1:0)-(a.alive?1:0))||(g.liveCount(a)-g.liveCount(c2))});\n  for(var s=0;s<5;s++){var q=ord[s];\n    if(!q||!q.alive){for(var z=0;z<7;z++)v.push(0);continue}\n    var ups=q.defense.filter(function(d){return !d.dead&&d.up}).map(function(d){return rv(d.card.rank)});\n    v.push(1);v.push(g.liveCount(q)/4);v.push(g.exposed(q)?1:0);v.push(q.pending?q.pending.n/2:0);\n    v.push(ups.length/4);v.push(ups.length?ups.reduce(function(x,y){return x+y},0)/ups.length/10:0);v.push(ups.length?Math.max.apply(null,ups)/10:0);\n  }\n  p.defense.map(function(d){return d.dead?0:rv(d.card.rank)/10}).sort(function(x,y){return y-x}).forEach(function(x){v.push(x)});\n  v.push(Math.min(g.round,60)/60);v.push(g.n/6);v.push(g.jokersHeld()/g.totalJokers);\n}\nfunction killP(slot,a){\n  if(slot.up){var u=rv(slot.card.rank);return a>u?1:a===u?0.5:0}\n  var s=0;for(var d=2;d<=10;d++)s+=a>d?1:a===d?0.5:0;return s/9;\n}\nfunction actFeats(g,i,a,v){\n  TYPES.forEach(function(t){v.push(a.type===t?1:0)});\n  var isS=a.type===\"strike\"||a.type===\"jack\";\n  var T=a.t!=null?g.players[a.t]:null,slot=isS?T.defense[a.s]:null,me=g.players[i];\n  v.push(isS&&a.type===\"strike\"?rv(a.rank)/10:0);\n  v.push(isS?(a.type===\"jack\"?1:killP(slot,rv(a.rank))):0);\n  v.push(isS&&slot.up?1:0);\n  v.push(isS&&slot.up?rv(slot.card.rank)/10:0);\n  v.push(T?g.liveCount(T)/4:0);\n  v.push(isS&&g.liveCount(T)===1?1:0);\n  v.push(T?T.defense.filter(function(d){return !d.dead&&d.up}).length/4:0);\n  v.push(isS&&g.liveCount(T)===1?killP(slot,a.type===\"jack\"?11:rv(a.rank)):0);\n  v.push(a.type===\"ace\"?(T.pending?T.pending.n:0)/2:0);\n  v.push(a.type===\"ace\"&&T.pending?1:0);\n  v.push(a.type===\"queen\"?g.deadCount(me)/4:0);\n  v.push(a.type===\"discard\"?worth(me.offense[a.hi])/9:0);\n  v.push(a.type===\"discard\"&&isNumR(me.offense[a.hi].rank)?rv(me.offense[a.hi].rank)/10:0);\n  CONVS.forEach(function(k){v.push(a.type===\"conv\"&&a.kind===k?1:0)});\n  v.push(a.type===\"conv\"&&a.kind===\"pair\"?a.rank/10:0);\n}\nfunction score(x){\n  var z=W.b2[0];\n  for(var j=0;j<H;j++){var s=W.b1[j],o=j*D;for(var k=0;k<D;k++)s+=W.W1[o+k]*x[k];z+=W.w2[j]*Math.tanh(s)}\n  for(var q=0;q<D;q++)z+=W.wl[q]*x[q];return z;\n}\nfunction candidates(g,i,allowConv){\n  var p=g.players[i],C=[];\n  if(allowConv)g.convertOptions(p).forEach(function(o){\n    var kind=o.key.indexOf(\"pair:\")===0?\"pair\":o.key.indexOf(\"joker:\")===0?\"joker\":o.key.indexOf(\"AAA:\")===0?\"AAA\":o.key;\n    C.push({type:\"conv\",key:o.key,kind:kind,rank:kind===\"pair\"?+o.key.slice(5):0});\n  });\n  var opps=g.players.map(function(q,j){return j}).filter(function(j){return j!==i&&g.players[j].alive});\n  var aIx=p.offense.findIndex(function(c){return c.rank===\"A\"});\n  if(aIx>=0)opps.forEach(function(t){if(g.exposed(g.players[t]))C.push({type:\"ace\",t:t,hi:aIx})});\n  var qIx=p.offense.findIndex(function(c){return c.rank===\"Q\"});\n  if(qIx>=0&&g.deadCount(p)>0)C.push({type:\"queen\",hi:qIx});\n  var seen={};\n  p.offense.forEach(function(c,hi){\n    if(isNumR(c.rank)&&!seen[c.rank]){seen[c.rank]=1;\n      opps.forEach(function(t){var T=g.players[t];if(g.exposed(T))return;\n        T.defense.forEach(function(d,s){if(!d.dead)C.push({type:\"strike\",t:t,s:s,hi:hi,rank:c.rank})})})}\n  });\n  var jIx=p.offense.findIndex(function(c){return c.rank===\"J\"});\n  if(jIx>=0)opps.forEach(function(t){var T=g.players[t];if(g.exposed(T))return;\n    T.defense.forEach(function(d,s){if(!d.dead&&d.up&&d.card.rank===\"10\")C.push({type:\"jack\",t:t,s:s,hi:jIx})})});\n  var ds={};p.offense.forEach(function(c,hi){if(!ds[c.rank]){ds[c.rank]=1;C.push({type:\"discard\",hi:hi})}});\n  return C;\n}\nfunction decide(g,i,allowConv){\n  var C=candidates(g,i,allowConv);if(!C.length)return null;\n  var base=[];stateFeats(g,i,base);\n  var best=null,bz=-Infinity;\n  C.forEach(function(a){var v=base.slice();actFeats(g,i,a,v);var z=score(v);if(z>bz){bz=z;best=a}});\n  return best;\n}\nvar orig=G.botTurn;\nG.botTurn=async function(i){\n  var p=this.players[i];\n  if(p.level!==\"expert\")return orig.call(this,i);\n  await this.pause(500);if(this.aborted)return;\n  var g,gd=0;\n  while(p.pending&&gd++<12){\n    g=0;\n    if(!this.canDefend(p))while(g++<8&&!this.canDefend(p)&&this.botConvertStep(i,true))await this.pause(450);\n    if(this.canDefend(p)){this.defendAce(i,this.has(p,\"K\")?\"K\":\"A\");await this.pause(500)}\n    else{this.eliminate(i,\"cannot answer the Ace\");return}\n  }\n  for(var step=0;step<10&&!this.over&&!this.aborted;step++){\n    var a=decide(this,i,step<8);\n    if(!a)return;\n    if(a.type===\"conv\"){this.doConvert(i,a.key);await this.pause(400);continue}\n    if(a.type===\"ace\")this.aceAttack(i,a.t,a.hi);\n    else if(a.type===\"queen\")this.queen(i,a.hi);\n    else if(a.type===\"strike\"||a.type===\"jack\")await this.attackDefense(i,a.t,a.s,a.hi);\n    else this.discardPass(i,a.hi);\n    await this.pause(700);\n    return;\n  }\n};\n})();\n";
function exportBot(paramsFile,outDir){
  const j=JSON.parse(fs.readFileSync(paramsFile));const r=a=>a.map(x=>Math.round(x*1e6)/1e6);
  const o={H:48,D:j.W1.length/48,W1:r(j.W1),b1:r(j.b1),w2:r(j.w2),b2:r(j.b2),wl:r(j.wl)};
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,"expert-weights.js"),'/* Trained "Expert" bot weights (small neural network). Regenerate if the rules change. */\nwindow.FORTITUDE_EXPERT='+JSON.stringify(o)+';\n');
  fs.writeFileSync(path.join(outDir,"expert.js"),TEMPLATE);
}
module.exports={exportBot};

});

function __workerMain(){
const S=__req("selfplay");
let seed=(workerData.seed>>>0)||1;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
parentPort.on("message",async m=>{
  try{
    if(m.type==="train"){
      const P=S.toParams(m.params),snaps=m.snaps.map(S.toParams);
      const Gr={};S.KEYS.forEach(k=>Gr[k]=new Float64Array(P[k].length));
      let used=0,wins=0,rounds=0,games=0;
      for(let k=0;k<m.games;k++){
        const r=await S.trainGame(P,snaps,m.cfg,rand);
        if(r.learner&&r.learner.rec.length){S.accumulate(P,Gr,r.learner.rec,r.adv);used++}
        wins+=r.win;rounds+=r.g.round;games++;
      }
      parentPort.postMessage({id:m.id,grad:Gr,used,wins,rounds,games});
    }else if(m.type==="eval"){
      const P=S.toParams(m.params),P2=m.params2?S.toParams(m.params2):null;
      const o=await S.evalGames(P,P2,m.opp,m.n,m.games,m.cfg,rand,m.offset);
      parentPort.postMessage({id:m.id,res:o,opp:m.opp,n:m.n});
    }
  }catch(e){parentPort.postMessage({id:m.id,error:String(e&&e.stack||e)})}
});

}

// Usage: node train.js --minutes 60 [--workers 8] [--batch 128] [--out ./out] [--resume out/params.json] [--baseline old.json]
const fs=require("fs"),path=require("path"),os=require("os");
const {newParams,KEYS,D,ENGINE_PATH}=__req("policy");
const Pool=__req("pool"),{grid,makeReport}=__req("report");
async function __trainMain(){
const A=process.argv.slice(2),arg=(n,d)=>{const i=A.indexOf("--"+n);return i>=0?A[i+1]:d};
const minutes=+arg("minutes",20),workers=+arg("workers",os.cpus().length),batch=+arg("batch",128),lr=+arg("lr",0.02);
const evalEvery=+arg("eval-every",20),evalGames=+arg("eval-games",300),seed=+arg("seed",7);
const cfg={pen:+arg("pen",1),start:+arg("penalty-start",25),span:+arg("penalty-span",45),maxRounds:+arg("max-rounds",200)};
const outDir=path.resolve(arg("out",path.join(__dirname,"bot-output")));fs.mkdirSync(path.join(outDir,"checkpoints"),{recursive:true});
let s=seed>>>0;const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
const ser=P=>{const o={};KEYS.forEach(k=>o[k]=Array.from(P[k]));return o};
const toP=j=>{const Q=newParams(rand);KEYS.forEach(k=>Q[k]=Float64Array.from(j[k]));return Q};
let P=newParams(rand);
if(arg("resume")){P=toP(JSON.parse(fs.readFileSync(arg("resume"))));console.log("resuming from",arg("resume"))}
const baseline=arg("baseline")?JSON.parse(fs.readFileSync(arg("baseline"))):null;
const save=(f,P)=>fs.writeFileSync(f,JSON.stringify(Object.assign(ser(P),{D:D(),H:48})));
const m={},v={},Gs={};KEYS.forEach(k=>{m[k]=new Float64Array(P[k].length);v[k]=new Float64Array(P[k].length);Gs[k]=new Float64Array(P[k].length)});
let adamT=0;
function adam(scale){adamT++;KEYS.forEach(k=>{for(let q=0;q<P[k].length;q++){
  const g=Gs[k][q]*scale;m[k][q]=0.9*m[k][q]+0.1*g;v[k][q]=0.999*v[k][q]+0.001*g*g;
  P[k][q]+=lr*(m[k][q]/(1-Math.pow(0.9,adamT)))/(Math.sqrt(v[k][q]/(1-Math.pow(0.999,adamT)))+1e-8);Gs[k][q]=0}})}
let stop=false;process.on("SIGINT",()=>{if(stop)process.exit(1);stop=true;console.log("\nStopping after this iteration, then writing the report...")});
const pool=new Pool(workers,seed);
const snaps=[];
async function quick(){
  const rows=await grid(pool,ser(P),null,["hard"],[2,3,4,5,6],60,cfg);
  return {ratio:rows.reduce((a,r)=>a+r.ratio,0)/rows.length,rounds:rows.reduce((a,r)=>a+r.meanRounds,0)/rows.length};
}
  console.log(`features ${D()}, workers ${workers}, ${batch} games/iteration, ${minutes} min. Ctrl+C stops early and still writes the report.`);
  const t0=Date.now(),curve=[],log=["iter,minutes,games,train_winrate,train_mean_rounds,quick_ratio,quick_rounds"];
  let it=0,games=0,best=-1;
  if(arg("report-only")){P=toP(JSON.parse(fs.readFileSync(arg("report-only"))));const r0=await makeReport({pool,params:ser(P),params2:baseline,outDir,evalGames,cfg,meta:{minutes:0,iterations:0,games:0,workers},curve:[]});console.log(r0.md);pool.close();return}
  const q0=await quick();console.log("start: x chance vs Hard",q0.ratio.toFixed(2),"mean rounds",q0.rounds.toFixed(1));curve.push({it:0,min:0,ratio:q0.ratio,rounds:q0.rounds});
  while(!stop&&(Date.now()-t0)/60000<minutes){
    const per=Math.ceil(batch/workers),pj=ser(P),sn=snaps.map(ser);
    const rs=await Promise.all([...Array(workers)].map((_,i)=>pool.send(i,{type:"train",params:pj,snaps:sn,games:per,cfg})));
    let used=0,wins=0,rounds=0,g=0;
    rs.forEach(r=>{used+=r.used;wins+=r.wins;rounds+=r.rounds;g+=r.games;KEYS.forEach(k=>{const a=r.grad[k];for(let q=0;q<a.length;q++)Gs[k][q]+=a[q]})});
    adam(1/Math.max(1,used));it++;games+=g;
    if(it%30===0){const C={};KEYS.forEach(k=>C[k]=Float64Array.from(P[k]));snaps.push(C);if(snaps.length>10)snaps.shift()}
    let qr="",qd="";
    if(it%evalEvery===0){
      const q=await quick();curve.push({it,min:(Date.now()-t0)/60000,ratio:q.ratio,rounds:q.rounds});qr=q.ratio.toFixed(3);qd=q.rounds.toFixed(1);
      save(path.join(outDir,"params.json"),P);save(path.join(outDir,"checkpoints","it"+it+".json"),P);
      if(q.ratio>best){best=q.ratio;save(path.join(outDir,"params_best.json"),P)}
      console.log(`iter ${it}  ${((Date.now()-t0)/60000).toFixed(1)} min  ${games} games  train win ${(wins/g*100).toFixed(0)}%  quick: ${q.ratio.toFixed(2)}x chance vs Hard, ${q.rounds.toFixed(0)} rounds`);
    }
    log.push([it,((Date.now()-t0)/60000).toFixed(2),games,(wins/g).toFixed(3),(rounds/g).toFixed(1),qr,qd].join(","));
  }
  save(path.join(outDir,"params.json"),P);fs.writeFileSync(path.join(outDir,"training_log.csv"),log.join("\n"));
  console.log("training done, evaluating (this takes a few minutes)...");
  const meta={minutes:(Date.now()-t0)/60000,iterations:it,games,workers};
  const r=await makeReport({pool,params:ser(P),params2:baseline,outDir,evalGames,cfg,meta,curve});
  __req("export").exportBot(path.join(outDir,"params.json"),path.join(outDir,"export"));
  if(A.includes("--install")){const gameDir=path.dirname(ENGINE_PATH);__req("export").exportBot(path.join(outDir,"params.json"),gameDir);console.log("INSTALLED expert.js and expert-weights.js into",gameDir)}
  console.log("\n"+r.md.split("## Training curve")[0]);
  console.log("Files in",outDir,": report.md, results.json, training_log.csv, params.json, params_best.json, export/ (drop-in game files)");
  pool.close();
}


if(isMainThread)__trainMain().catch(e=>{console.error(e);process.exit(1)});else __workerMain();
