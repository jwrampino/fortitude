(function(root){
"use strict";
var RANKS=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
var SUITS=["♠","♥","♦","♣"];
var NUMS=["2","3","4","5","6","7","8","9","10"];
var RN={J:"Jack",Q:"Queen",K:"King",A:"Ace"};
var isNumR=function(r){return NUMS.indexOf(r)>=0};
var isFaceR=function(r){return r==="J"||r==="Q"||r==="K"};
var rv=function(r){return isNumR(r)?+r:({J:11,Q:12,K:13,A:14})[r]};
var CID=1;
var mk=function(rank,suit){return {id:CID++,rank:rank,suit:suit}};
var JOK=function(){return {id:CID++,rank:"JOKER",joker:true,suit:""}};
var cs=function(c){return c.joker?"Joker":c.rank+c.suit};
var worth=function(c){if(c.joker)return 10;if(isNumR(c.rank))return rv(c.rank)/4;return {J:3.2,Q:4.5,K:6,A:9}[c.rank]};
function killProb(slot,rank){
  var c=rv(rank),w=0;
  if(slot.up){var d=rv(slot.card.rank);return c>d?1:c===d?0.45:0}
  for(var d2=2;d2<=10;d2++)w+=c>d2?1:c===d2?0.45:0;
  return w/9;
}
function canStrike(card,slot){
  if(isNumR(card.rank))return true;
  return card.rank==="J"&&!!slot.up&&slot.card.rank==="10";
}
function Game(seats,io,opts){
  opts=opts||{};
  this.io=Object.assign({sleep:function(){return Promise.resolve()},changed:function(){},fx:function(){},
    humanTurn:function(){return Promise.resolve()},askTie:function(){return Promise.resolve(-1)},
    turnStart:function(){},gameOver:function(){}},io||{});
  this.rand=opts.rand||Math.random;
  this.maxRounds=opts.maxRounds||600;
  this.jokerDecay=opts.jokerDecay!=null?opts.jokerDecay:0.5;
  this.players=seats.map(function(s){return {name:s.name,bot:!!s.bot,level:s.level||"normal",alive:true,defense:[],offense:[],jokers:0,pending:null}});
  this.n=this.players.length;this.totalJokers=this.n;this.turn=0;this.round=1;
  this.over=false;this.winner=null;this.reason="";this.log=[];this.aborted=false;this.stats={turns:0};
  var self=this;this.players.forEach(function(p){self.deal(p)});
}
var G=Game.prototype;
G.say=function(msg,kind){this.log.push({msg:msg,kind:kind||"sys"});if(this.log.length>400)this.log.shift();this.io.changed()};
G.pause=function(ms){return this.aborted?Promise.resolve():this.io.sleep(ms)};
G.jokersHeld=function(){var h=0;this.players.forEach(function(p){if(p.alive)h+=p.jokers});return h};
G.jokerWeight=function(){return this.totalJokers*Math.pow(this.jokerDecay,this.jokersHeld())};
G.draw=function(){
  var w=this.jokerWeight(),x=this.rand()*(52+w);
  if(x<w)return JOK();
  var y=Math.min(51,Math.floor(x-w));return mk(RANKS[Math.floor(y/4)],SUITS[y%4]);
};
G.drawNum=function(){for(;;){var c=this.draw();if(!c.joker&&isNumR(c.rank))return c}};
G.deal=function(p){
  while(p.defense.length<4)p.defense.push({card:this.drawNum(),up:false,dead:false});
  this.refill(p);
};
G.refill=function(p){
  while(p.offense.length<4){var c=this.draw();if(c.joker)p.jokers++;else p.offense.push(c)}
};
G.exposed=function(p){return p.alive&&p.defense.every(function(d){return d.dead})};
G.liveCount=function(p){return p.defense.filter(function(d){return !d.dead}).length};
G.deadCount=function(p){return 4-this.liveCount(p)};
G.has=function(p,r){return p.offense.some(function(c){return c.rank===r})};
G.canDefend=function(p){return !!p.pending&&(this.has(p,"K")||this.has(p,"A"))};
G.nextAlive=function(i){var j=i;for(var k=0;k<this.n;k++){j=(j+1)%this.n;if(this.players[j].alive)return j}return i};
G.checkEnd=function(){
  if(this.over)return;
  for(var i=0;i<this.n;i++){var p=this.players[i];
    if(p.alive&&p.jokers>=this.totalJokers){this.over=true;this.winner=i;this.reason="jokers";this.say(p.name+" has gathered a Joker for every seat. The jesters crown them sovereign!","win");return}}
  var al=this.players.filter(function(p){return p.alive});
  if(al.length===1){this.over=true;this.winner=this.players.indexOf(al[0]);this.reason="last";this.say(al[0].name+" is the last King standing.","win")}
};
G.eliminate=function(i,why){
  var p=this.players[i];p.alive=false;p.pending=null;p.jokers=0;
  this.say(p.name+" "+why+" and is out of the game.","danger");this.io.fx("king",{t:i,res:"fallen"});this.checkEnd();
};
/* conversions */
G.convertOptions=function(p){
  var o=[],by={};p.offense.forEach(function(c){by[c.rank]=(by[c.rank]||0)+1});
  NUMS.forEach(function(r){if(by[r]>=2)o.push({key:"pair:"+r,from:[r,r],to:"J",label:"Two "+r+"s → Jack"})});
  if(by.J>=2)o.push({key:"JJ",from:["J","J"],to:"Q",label:"Two Jacks → Queen"});
  if(by.Q>=2)o.push({key:"QQ",from:["Q","Q"],to:"K",label:"Two Queens → King"});
  if(by.K>=2)o.push({key:"KK",from:["K","K"],to:"A",label:"Two Kings → Ace"});
  if(p.jokers>0)["J","Q","K"].forEach(function(r){if(by[r]>=1)o.push({key:"joker:"+r,from:["Joker",r],to:"A",label:"Joker + "+RN[r]+" → Ace"})});
  if(by.A>=3)["J","Q","K"].forEach(function(r){o.push({key:"AAA:"+r,from:["A","A","A"],to:r,label:"Three Aces → "+RN[r]})});
  if(by.A>=4)o.push({key:"AAAA",from:["A","A","A","A"],to:"Joker",label:"Four Aces → Joker"});
  return o;
};
G.doConvert=function(pi,key){
  var p=this.players[pi],opt=this.convertOptions(p).filter(function(o){return o.key===key})[0];
  if(!opt)return false;
  var rem=function(r,n){for(var k=0;k<n;k++){var ix=p.offense.findIndex(function(c){return c.rank===r});p.offense.splice(ix,1)}};
  if(key.indexOf("joker:")===0){p.jokers--;rem(key.slice(6),1)}
  else if(key==="AAAA"){rem("A",4);p.jokers++}
  else if(key.indexOf("AAA:")===0)rem("A",3);
  else rem(opt.from[0],2);
  if(opt.to!=="Joker")p.offense.push(mk(opt.to,SUITS[Math.floor(this.rand()*4)]));
  this.refill(p);
  this.say(p.name+" converts cards into "+(opt.to==="A"?"an Ace":opt.to==="Joker"?"a Joker":"a "+RN[opt.to])+".","sys");
  this.checkEnd();return true;
};
/* combat */
G.attackDefense=async function(ai,ti,si,hi){
  var A=this.players[ai],D=this.players[ti],slot=D.defense[si];
  if(!A.offense[hi]||!slot||slot.dead||!canStrike(A.offense[hi],slot))return {res:"illegal"};
  var card=A.offense.splice(hi,1)[0];
  var av=rv(card.rank),dv=rv(slot.card.rank);
  this.say(A.name+" strikes "+D.name+"'s defense with "+cs(card)+".","attack");
  await this.pause(600);
  slot.up=true;var res;
  if(av<dv){res="held";this.say("It holds. The defense was "+cs(slot.card)+" and stays face up.","good")}
  else if(av>dv){res="destroyed";slot.dead=true;this.say("The defense ("+cs(slot.card)+") is destroyed.","danger")}
  else{
    this.say("Tie on "+cs(slot.card)+". "+D.name+" may answer with a Jack or a higher number.","attack");
    var ix=D.bot?this.botTie(D,av):await this.io.askTie(ti,{card:card,slotCard:slot.card,attackVal:av,from:ai});
    var c=D.offense[ix];
    if(ix>=0&&c&&(c.rank==="J"||(isNumR(c.rank)&&rv(c.rank)>av))){
      D.offense.splice(ix,1);this.refill(D);res="held";
      this.say(D.name+" answers with "+cs(c)+" and the defense stands.","good");
    }else{res="destroyed";slot.dead=true;this.say(D.name+" cannot answer. The defense falls.","danger")}
  }
  this.io.fx("slot",{t:ti,s:si,res:res});
  this.refill(A);this.checkEnd();return {res:res};
};
G.aceAttack=function(ai,ti,hi){
  var A=this.players[ai],D=this.players[ti];
  if(!A.offense[hi]||A.offense[hi].rank!=="A"||!D.alive||!this.exposed(D))return false;
  var card=A.offense.splice(hi,1)[0];
  D.pending={from:ai,n:D.pending?D.pending.n+1:1};
  this.say(D.pending.n>1?A.name+" piles another Ace on "+D.name+"'s King! "+D.pending.n+" Aces must be answered.":A.name+" plays an Ace on "+D.name+"'s exposed King!","danger");
  this.io.fx("king",{t:ti,res:"pending"});
  this.refill(A);this.checkEnd();return true;
};
G.queen=function(pi,hi){
  var p=this.players[pi],si=p.defense.findIndex(function(d){return d.dead});
  if(si<0)return false;
  p.offense.splice(hi,1);
  p.defense[si]={card:this.drawNum(),up:false,dead:false};
  this.say(p.name+" plays a Queen and raises a new defense.","good");
  this.refill(p);this.checkEnd();return true;
};
G.defendAce=function(pi,how){
  var p=this.players[pi];if(!p.pending)return false;
  var ix=p.offense.findIndex(function(c){return c.rank===how});if(ix<0)return false;
  p.offense.splice(ix,1);p.pending.n--;if(p.pending.n<=0)p.pending=null;this.refill(p);
  this.say(how==="K"?p.name+" blocks the Ace with a King.":p.name+" renews the King with an Ace.","good");
  this.io.fx("king",{t:pi,res:"blocked"});this.checkEnd();return true;
};
G.discardPass=function(pi,hi){
  var p=this.players[pi];p.offense.splice(hi,1);this.refill(p);
  this.say(p.name+" discards a card and passes.","sys");this.checkEnd();
};
/* bots */
G.botTie=function(D,av){
  var best=-1,bw=99;
  D.offense.forEach(function(c,ix){
    if(c.rank==="J"||(isNumR(c.rank)&&rv(c.rank)>av)){var w=worth(c);if(w<bw){bw=w;best=ix}}
  });
  if(best<0)return -1;
  if(D.level==="easy"&&this.rand()<0.35)return -1;
  return best;
};
G.botDiscardIdx=function(p){
  var best=0,bw=99;
  p.offense.forEach(function(c,ix){var w=worth(c)+Math.random()*0.01;if(w<bw){bw=w;best=ix}});
  return best;
};
G.botConvertStep=function(i,desperate){
  var p=this.players[i],lv=p.level,opts=this.convertOptions(p);
  var get=function(k){return opts.filter(function(o){return o.key===k})[0]};
  var cnt=function(r){return p.offense.filter(function(c){return c.rank===r}).length};
  var dead=this.deadCount(p),key=null,self=this;
  var target=this.players.some(function(x,ix){return ix!==i&&x.alive&&self.exposed(x)});
  if(get("AAAA")&&!target&&!desperate)key="AAAA";
  if(!key&&get("AAA:Q")&&!target&&lv!=="easy"&&dead>0&&cnt("Q")===0)key="AAA:Q";
  if(!key&&get("AAA:K")&&!target&&lv!=="easy"&&this.exposed(p)&&cnt("K")===0)key="AAA:K";
  if(!key&&get("KK"))key="KK";
  if(!key){key=["joker:J","joker:Q","joker:K"].filter(get)[0]||null}
  if(!key&&get("QQ")&&(desperate||cnt("K")===0||lv==="hard"))key="QQ";
  if(!key&&get("JJ")&&(desperate||cnt("Q")===0&&(dead>0||lv==="hard")))key="JJ";
  if(!key&&(lv!=="easy"||desperate)){
    var prs=opts.filter(function(o){return o.key.indexOf("pair:")===0}).map(function(o){return +o.key.slice(5)}).sort(function(a,b){return a-b});
    var lim=lv==="hard"?6:4;
    if(prs.length&&(desperate||(cnt("J")===0&&prs[0]<=lim)))key="pair:"+prs[0];
  }
  if(!key)return false;
  return this.doConvert(i,key);
};
G.botChoose=function(i){
  var p=this.players[i],lv=p.level,r=this.rand,self=this,opts=[];
  var opps=this.players.map(function(x,ix){return ix}).filter(function(ix){return ix!==i&&self.players[ix].alive});
  var aIx=p.offense.findIndex(function(c){return c.rank==="A"});
  if(aIx>=0)opps.forEach(function(t){var T=self.players[t];if(!self.exposed(T))return;if(!T.pending)opts.push({type:"ace",t:t,hi:aIx,score:100+r()});else if(lv!=="easy")opts.push({type:"ace",t:t,hi:aIx,score:97+r()})});
  var qIx=p.offense.findIndex(function(c){return c.rank==="Q"}),dead=this.deadCount(p);
  if(qIx>=0&&dead>0)opts.push({type:"queen",hi:qIx,score:(lv==="easy"?3.5:4.5+dead*2.2)+(this.exposed(p)?30:0)+r()*0.5});
  var seen={};
  p.offense.forEach(function(c,hi){
    if(!isNumR(c.rank)||seen[c.rank])return;seen[c.rank]=1;
    opps.forEach(function(t){
      var T=self.players[t];if(self.exposed(T))return;
      var live=self.liveCount(T);
      T.defense.forEach(function(d,s){
        if(d.dead)return;
        var pk=killProb(d,c.rank),val=pk*(8+(4-live)*3+(live===1?6:0));
        var noise=r()*(lv==="easy"?6:lv==="normal"?1.4:0.3);
        opts.push({type:"strike",t:t,s:s,hi:hi,score:val-rv(c.rank)*0.12+(d.up?0:0.35)+noise});
      });
    });
  });
  var jIx=p.offense.findIndex(function(c){return c.rank==="J"});
  if(jIx>=0)opps.forEach(function(t){
    var T=self.players[t];if(self.exposed(T))return;
    var live=self.liveCount(T);
    T.defense.forEach(function(d,s){
      if(d.dead||!d.up||d.card.rank!=="10")return;
      opts.push({type:"strike",t:t,s:s,hi:jIx,score:8+(4-live)*3+(live===1?6:0)-2+r()*0.3});
    });
  });
  opts.sort(function(a,b){return b.score-a.score});
  var best=opts[0];
  if(!best||best.score<0.4)return {type:"discard",hi:this.botDiscardIdx(p)};
  return best;
};
G.botTurn=async function(i){
  var p=this.players[i],g=0;
  await this.pause(500);if(this.aborted)return;
  var gd=0;
  while(p.pending&&gd++<12){
    g=0;
    if(!this.canDefend(p)){
      while(g++<8&&!this.canDefend(p)&&this.botConvertStep(i,true))await this.pause(450);
    }
    if(this.canDefend(p)){this.defendAce(i,this.has(p,"K")?"K":"A");await this.pause(500)}
    else{this.eliminate(i,"cannot answer the Ace");return}
  }
  g=0;
  while(g++<6&&!this.over&&this.botConvertStep(i,false))await this.pause(400);
  if(this.over||this.aborted)return;
  var a=this.botChoose(i);
  if(a.type==="ace")this.aceAttack(i,a.t,a.hi);
  else if(a.type==="queen")this.queen(i,a.hi);
  else if(a.type==="strike")await this.attackDefense(i,a.t,a.s,a.hi);
  else this.discardPass(i,a.hi);
  await this.pause(700);
};
G.run=async function(){
  this.checkEnd();
  while(!this.over&&!this.aborted){
    var i=this.turn,p=this.players[i];
    if(p.alive){
      this.io.turnStart(i);this.stats.turns++;
      if(p.bot)await this.botTurn(i);else await this.io.humanTurn(i);
      if(this.over||this.aborted)break;
    }
    var prev=this.turn;this.turn=this.nextAlive(this.turn);
    if(this.turn<=prev){this.round++;this.say("Round "+this.round,"round");
      if(this.round>this.maxRounds){this.over=true;this.winner=null;this.reason="stalemate";break}}
  }
  if(!this.aborted)this.io.gameOver(this);
};
root.Fortitude={canStrike:canStrike,Game:Game,RANKS:RANKS,SUITS:SUITS,NUMS:NUMS,RN:RN,rv:rv,isNumR:isNumR,isFaceR:isFaceR,cs:cs,worth:worth};
})(typeof window!=="undefined"?window:globalThis);
