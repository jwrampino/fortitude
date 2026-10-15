/* "Expert" bot: a small neural network that scores every legal move and plays the best one.
   Loads after engine.js and takes over bot turns for seats whose level is "expert".
   Answering ties and answering a pending Ace still use the standard bot rules. */
(function(){
var F=window.Fortitude,W=window.FORTITUDE_EXPERT;
if(!F||!W)return;
var G=F.Game.prototype,rv=F.rv,isNumR=F.isNumR,worth=F.worth,NUMS=F.NUMS;
var H=W.H,D=W.D;
var TYPES=["conv","ace","queen","strike","jack","discard"],CONVS=["pair","JJ","QQ","KK","joker","AAA","AAAA"];

function stateFeats(g,i,v){
  var p=g.players[i],c={};p.offense.forEach(function(x){c[x.rank]=(c[x.rank]||0)+1});
  NUMS.forEach(function(r){v.push((c[r]||0)/2)});
  ["J","Q","K","A"].forEach(function(r){v.push((c[r]||0)/2)});
  v.push(p.jokers/g.totalJokers);
  var live=g.liveCount(p);v.push(live/4);v.push((4-live)/4);v.push(g.exposed(p)?1:0);
  v.push(p.pending?p.pending.n/2:0);
  var sum=0,k=0,tens=0;p.defense.forEach(function(d){if(!d.dead){sum+=rv(d.card.rank);k++;if(d.card.rank==="10")tens++}});
  v.push(k?sum/k/10:0);v.push(tens/4);
  var all=g.players.filter(function(q,j){return j!==i}),alive=all.filter(function(q){return q.alive});
  v.push(alive.length/5);v.push(alive.some(function(q){return g.exposed(q)})?1:0);
  v.push(alive.length?Math.min.apply(null,alive.map(function(q){return g.liveCount(q)}))/4:0);
  var ord=all.slice().sort(function(a,c2){return ((c2.alive?1:0)-(a.alive?1:0))||(g.liveCount(a)-g.liveCount(c2))});
  for(var s=0;s<5;s++){var q=ord[s];
    if(!q||!q.alive){for(var z=0;z<7;z++)v.push(0);continue}
    var ups=q.defense.filter(function(d){return !d.dead&&d.up}).map(function(d){return rv(d.card.rank)});
    v.push(1);v.push(g.liveCount(q)/4);v.push(g.exposed(q)?1:0);v.push(q.pending?q.pending.n/2:0);
    v.push(ups.length/4);v.push(ups.length?ups.reduce(function(x,y){return x+y},0)/ups.length/10:0);v.push(ups.length?Math.max.apply(null,ups)/10:0);
  }
  p.defense.map(function(d){return d.dead?0:rv(d.card.rank)/10}).sort(function(x,y){return y-x}).forEach(function(x){v.push(x)});
  v.push(Math.min(g.round,60)/60);v.push(g.n/6);v.push(g.jokersHeld()/g.totalJokers);
}
function killP(slot,a){
  if(slot.up){var u=rv(slot.card.rank);return a>u?1:a===u?0.5:0}
  var s=0;for(var d=2;d<=10;d++)s+=a>d?1:a===d?0.5:0;return s/9;
}
function actFeats(g,i,a,v){
  TYPES.forEach(function(t){v.push(a.type===t?1:0)});
  var isS=a.type==="strike"||a.type==="jack";
  var T=a.t!=null?g.players[a.t]:null,slot=isS?T.defense[a.s]:null,me=g.players[i];
  v.push(isS&&a.type==="strike"?rv(a.rank)/10:0);
  v.push(isS?(a.type==="jack"?1:killP(slot,rv(a.rank))):0);
  v.push(isS&&slot.up?1:0);
  v.push(isS&&slot.up?rv(slot.card.rank)/10:0);
  v.push(T?g.liveCount(T)/4:0);
  v.push(isS&&g.liveCount(T)===1?1:0);
  v.push(T?T.defense.filter(function(d){return !d.dead&&d.up}).length/4:0);
  v.push(isS&&g.liveCount(T)===1?killP(slot,a.type==="jack"?11:rv(a.rank)):0);
  v.push(a.type==="ace"?(T.pending?T.pending.n:0)/2:0);
  v.push(a.type==="ace"&&T.pending?1:0);
  v.push(a.type==="queen"?g.deadCount(me)/4:0);
  v.push(a.type==="discard"?worth(me.offense[a.hi])/9:0);
  v.push(a.type==="discard"&&isNumR(me.offense[a.hi].rank)?rv(me.offense[a.hi].rank)/10:0);
  CONVS.forEach(function(k){v.push(a.type==="conv"&&a.kind===k?1:0)});
  v.push(a.type==="conv"&&a.kind==="pair"?a.rank/10:0);
}
function score(x){
  var z=W.b2[0];
  for(var j=0;j<H;j++){var s=W.b1[j],o=j*D;for(var k=0;k<D;k++)s+=W.W1[o+k]*x[k];z+=W.w2[j]*Math.tanh(s)}
  for(var q=0;q<D;q++)z+=W.wl[q]*x[q];return z;
}
function candidates(g,i,allowConv){
  var p=g.players[i],C=[];
  if(allowConv)g.convertOptions(p).forEach(function(o){
    var kind=o.key.indexOf("pair:")===0?"pair":o.key.indexOf("joker:")===0?"joker":o.key.indexOf("AAA:")===0?"AAA":o.key;
    C.push({type:"conv",key:o.key,kind:kind,rank:kind==="pair"?+o.key.slice(5):0});
  });
  var opps=g.players.map(function(q,j){return j}).filter(function(j){return j!==i&&g.players[j].alive});
  var aIx=p.offense.findIndex(function(c){return c.rank==="A"});
  if(aIx>=0)opps.forEach(function(t){if(g.exposed(g.players[t]))C.push({type:"ace",t:t,hi:aIx})});
  var qIx=p.offense.findIndex(function(c){return c.rank==="Q"});
  if(qIx>=0&&g.deadCount(p)>0)C.push({type:"queen",hi:qIx});
  var seen={};
  p.offense.forEach(function(c,hi){
    if(isNumR(c.rank)&&!seen[c.rank]){seen[c.rank]=1;
      opps.forEach(function(t){var T=g.players[t];if(g.exposed(T))return;
        T.defense.forEach(function(d,s){if(!d.dead)C.push({type:"strike",t:t,s:s,hi:hi,rank:c.rank})})})}
  });
  var jIx=p.offense.findIndex(function(c){return c.rank==="J"});
  if(jIx>=0)opps.forEach(function(t){var T=g.players[t];if(g.exposed(T))return;
    T.defense.forEach(function(d,s){if(!d.dead&&d.up&&d.card.rank==="10")C.push({type:"jack",t:t,s:s,hi:jIx})})});
  var ds={};p.offense.forEach(function(c,hi){if(!ds[c.rank]){ds[c.rank]=1;C.push({type:"discard",hi:hi})}});
  return C;
}
function decide(g,i,allowConv){
  var C=candidates(g,i,allowConv);if(!C.length)return null;
  var base=[];stateFeats(g,i,base);
  var best=null,bz=-Infinity;
  C.forEach(function(a){var v=base.slice();actFeats(g,i,a,v);var z=score(v);if(z>bz){bz=z;best=a}});
  return best;
}
var orig=G.botTurn;
G.botTurn=async function(i){
  var p=this.players[i];
  if(p.level!=="expert")return orig.call(this,i);
  await this.pause(500);if(this.aborted)return;
  var g,gd=0;
  while(p.pending&&gd++<12){
    g=0;
    if(!this.canDefend(p))while(g++<8&&!this.canDefend(p)&&this.botConvertStep(i,true))await this.pause(450);
    if(this.canDefend(p)){this.defendAce(i,this.has(p,"K")?"K":"A");await this.pause(500)}
    else{this.eliminate(i,"cannot answer the Ace");return}
  }
  for(var step=0;step<10&&!this.over&&!this.aborted;step++){
    var a=decide(this,i,step<8);
    if(!a)return;
    if(a.type==="conv"){this.doConvert(i,a.key);await this.pause(400);continue}
    if(a.type==="ace")this.aceAttack(i,a.t,a.hi);
    else if(a.type==="queen")this.queen(i,a.hi);
    else if(a.type==="strike"||a.type==="jack")await this.attackDefense(i,a.t,a.s,a.hi);
    else this.discardPass(i,a.hi);
    await this.pause(700);
    return;
  }
};
})();
