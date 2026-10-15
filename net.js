/* Fortitude online play: peer to peer over WebRTC (PeerJS), host-authoritative.
   The host's browser runs the real Game. Guests send commands and receive a redacted view of the table.
   Needs engine.js and peerjs.min.js loaded first. */
(function(root){
"use strict";
var F=root.Fortitude,Game=F.Game;
var V=1,PREFIX="fortitude-",ALPHA="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var cfg={peer:{},timeout:12000,ping:4000,dead:16000};
function available(){return typeof root.Peer==="function"}
function makeCode(){var s="";for(var i=0;i<5;i++)s+=ALPHA.charAt(Math.floor(Math.random()*ALPHA.length));return s}
function norm(s){return String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function cleanName(n){return String(n||"").replace(/[\u0000-\u001f<>&"']/g,"").trim().slice(0,16)||"Player"}
function why(e){
  var t=e&&e.type;
  if(t==="peer-unavailable")return "No game with that code";
  if(t==="network"||t==="server-error"||t==="socket-error"||t==="socket-closed"||t==="timeout")return "Couldn't reach the matchmaking server";
  if(t==="nolib")return "Online play is unavailable";
  return (e&&e.message)||"Connection failed";
}
function Emitter(){this._h={}}
Emitter.prototype.on=function(n,f){(this._h[n]=this._h[n]||[]).push(f);return this};
Emitter.prototype.emit=function(n){var a=[].slice.call(arguments,1);(this._h[n]||[]).forEach(function(f){try{f.apply(null,a)}catch(e){if(root.console)console.error(e)}})};
function newPeer(id){
  return new Promise(function(res,rej){
    if(!available())return rej({type:"nolib"});
    var p=new root.Peer(id,cfg.peer),done=false,t;
    function fin(ok,v){if(done)return;done=true;clearTimeout(t);if(ok)res(v);else{try{p.destroy()}catch(e){}rej(v)}}
    t=setTimeout(function(){fin(false,{type:"timeout"})},cfg.timeout);
    p.on("open",function(){fin(true,p)});
    p.on("error",function(e){fin(false,e)});
  });
}
function send(c,m){try{if(c&&c.open)c.send(m)}catch(e){}}
function shut(c){try{c.close()}catch(e){}}

/* what one seat may see: its own hand, Joker pool and face-down defenses; everyone else's are hidden */
function view(g,seat){
  return {n:g.n,turn:g.turn,round:g.round,over:g.over,winner:g.winner,reason:g.reason,jokerGoal:g.jokerGoal,
    log:g.log.slice(-70),
    players:g.players.map(function(p,j){
      var mine=j===seat;
      return {name:p.name,bot:p.bot,level:p.level,alive:p.alive,pending:p.pending?{from:p.pending.from,n:p.pending.n}:null,
        jokers:mine?p.jokers:0,jn:[],
        offense:mine?p.offense:[],
        defense:p.defense.map(function(d){
          if(d.dead||d.up||mine)return {card:d.card,up:d.up,dead:d.dead};
          return {card:null,up:false,dead:false};
        })};
    })};
}
/* a Game-shaped object built from a view, so the existing UI code can read it unchanged */
function mirror(st){
  var g=Object.create(Game.prototype),noop=function(){};
  g.n=st.n;g.turn=st.turn;g.round=st.round;g.over=st.over;g.winner=st.winner;g.reason=st.reason;g.jokerGoal=st.jokerGoal;
  g.log=st.log;g.players=st.players;g.rand=Math.random;g.aborted=false;g.stats={turns:0};
  g.io={sleep:function(){return Promise.resolve()},changed:noop,fx:noop,humanTurn:noop,askTie:noop,turnStart:noop,gameOver:noop};
  return g;
}

/* ---------------- host ---------------- */
function Host(peer,code){
  Emitter.call(this);
  var h=this;
  h.peer=peer;h.code=code;h.localSeat=0;h.seats=[];h.names={};h.conns={};
  h.game=null;h.turnWait=null;h.tieWait=null;h.fxq=[];h._tm=0;h.closed=false;
  peer.on("connection",function(c){h._accept(c)});
  peer.on("disconnected",function(){if(!h.closed){try{peer.reconnect()}catch(e){}}});
  peer.on("error",function(e){h.emit("error",e)});
  h._hb=setInterval(function(){h._sweep()},cfg.ping);
}
Host.prototype=Object.create(Emitter.prototype);
Host.prototype._send=function(s,m){send(this.conns[s],m)};
Host.prototype._accept=function(c){
  var h=this;
  c._seat=null;c._seen=Date.now();
  var t=setTimeout(function(){if(c._seat==null)shut(c)},8000);
  c.on("data",function(m){h._onMsg(c,m)});
  c.on("close",function(){clearTimeout(t);h._drop(c)});
  c.on("error",function(){h._drop(c)});
};
Host.prototype._onMsg=function(c,m){
  if(!m||typeof m!=="object")return;
  c._seen=Date.now();
  if(m.t==="hello")return this._hello(c,m);
  if(m.t==="ping")return send(c,{t:"pong"});
  if(c._seat==null)return;
  if(m.t==="cmd")return this._cmd(c._seat,m.c,m.a&&typeof m.a==="object"?m.a:{});
  if(m.t==="tieans")return this._tieAns(c._seat,m.ix);
  if(m.t==="bye")return this._drop(c);
};
Host.prototype._hello=function(c,m){
  if(c._seat!=null)return;
  var h=this;
  if(m.v!==V){send(c,{t:"kick",why:"This game runs a different version. Refresh the page and try again."});return setTimeout(function(){shut(c)},200)}
  var s=-1;
  if(!h.game||h.game.over){for(var j=0;j<h.seats.length;j++){if(j!==h.localSeat&&!h.seats[j].bot&&!h.conns[j]){s=j;break}}}
  if(s<0){send(c,{t:"full",why:h.game&&!h.game.over?"That game has already started":"That game is full"});return setTimeout(function(){shut(c)},200)}
  var nm=cleanName(m.name),n=nm,k=2;
  while(h.seats.some(function(x,j){return j!==s&&h.nameOf(j).toLowerCase()===n.toLowerCase()}))n=nm.slice(0,13)+" "+(k++);
  c._seat=s;h.conns[s]=c;h.names[s]=n;
  send(c,{t:"welcome",seat:s,code:h.code,name:n});
  h._lobby();h.emit("join",s,n);
};
Host.prototype._drop=function(c){
  var s=c._seat;if(s==null)return;
  c._seat=null;
  if(this.conns[s]===c)delete this.conns[s];
  shut(c);
  if(this.game&&!this.game.over&&this.game.players[s]&&!this.game.players[s].bot)this._takeover(s);
  else{delete this.names[s];this._lobby()}
  this.emit("leave",s);
};
/* a guest who drops mid-game is replaced by a bot so the table keeps playing */
Host.prototype._takeover=function(s){
  var g=this.game,p=g.players[s];
  p.bot=true;p.level="normal";
  g.say(p.name+" lost connection. A bot takes over.","danger");
  var w=this.turnWait,t=this.tieWait;
  if(w&&w.i===s&&!w.busy){this.turnWait=null;g.botTurn(s).then(w.res,w.res)}
  if(t&&t.i===s){this.tieWait=null;t.res(g.botTie(p,t.info.attackVal))}
  this._flush();
};
Host.prototype._sweep=function(){
  var h=this,now=Date.now();
  Object.keys(h.conns).forEach(function(s){var c=h.conns[s];if(c&&now-c._seen>cfg.dead)h._drop(c)});
};
Host.prototype.nameOf=function(j){
  if(j===this.localSeat||!this.conns[j])return this.seats[j]?this.seats[j].name:"";
  return this.names[j];
};
Host.prototype._pub=function(){
  var h=this;
  return h.seats.map(function(x,j){return {name:h.nameOf(j),bot:!!x.bot,level:x.level,you:j===h.localSeat,open:!x.bot&&j!==h.localSeat&&!h.conns[j]}});
};
Host.prototype._lobby=function(){
  var h=this,pub=h._pub();
  Object.keys(h.conns).forEach(function(s){h._send(+s,{t:"lobby",code:h.code,you:+s,seats:pub.map(function(x,j){return Object.assign({},x,{you:j===+s})})})});
};
/* call after the seat list changes; guests keep their seat if it is still a human seat, else move to an open one or leave */
Host.prototype.setSeats=function(seats){
  var h=this;h.seats=seats;
  Object.keys(h.conns).map(Number).sort(function(a,b){return a-b}).forEach(function(s){
    var c=h.conns[s];
    if(seats[s]&&!seats[s].bot&&s!==h.localSeat)return;
    delete h.conns[s];
    var n=-1;
    for(var j=0;j<seats.length;j++){if(j!==h.localSeat&&!seats[j].bot&&!h.conns[j]){n=j;break}}
    if(n<0){c._seat=null;send(c,{t:"kick",why:"The host changed the seats"});setTimeout(function(){shut(c)},200)}
    else{h.conns[n]=c;c._seat=n;h.names[n]=h.names[s]}
    delete h.names[s];
  });
  h._lobby();h.emit("lobby");
};
Host.prototype.openCount=function(){
  var h=this;return h.seats.filter(function(x,j){return !x.bot&&j!==h.localSeat&&!h.conns[j]}).length;
};
/* seats for new Game(): guests' names filled in */
Host.prototype.seatsForGame=function(){
  var h=this;
  return h.seats.map(function(x,j){return {name:h.nameOf(j)||x.name,bot:!!x.bot,level:x.level||"normal"}});
};
/* wrap the local UI's io so guest seats are driven over the wire and every change is broadcast */
Host.prototype.wrapIO=function(base){
  var h=this,io=Object.assign({},base);
  io.humanTurn=function(i){return h.conns[i]?h._remoteTurn(i):base.humanTurn(i)};
  io.askTie=function(ti,info){return h.conns[ti]?h._remoteTie(ti,info):base.askTie(ti,info)};
  io.sleep=function(ms){h._flush();return base.sleep(ms)};
  io.changed=function(){base.changed();h._flush()};
  io.turnStart=function(i){base.turnStart(i);h._flush()};
  io.fx=function(k,d){base.fx(k,d);h.fxq.push([k,d]);h._flush()};
  io.gameOver=function(g){base.gameOver(g);h._flushNow()};
  return io;
};
Host.prototype.begin=function(game){
  var h=this;
  h.game=game;h.turnWait=null;h.tieWait=null;h.fxq=[];
  Object.keys(h.conns).forEach(function(s){h._send(+s,{t:"start",seat:+s})});
  h._flushNow();
};
Host.prototype._flush=function(){
  var h=this;if(h._tm||!h.game)return;
  h._tm=setTimeout(function(){h._tm=0;h._flushNow()},0);
};
Host.prototype._flushNow=function(){
  var h=this;clearTimeout(h._tm);h._tm=0;if(!h.game)return;
  var fx=h.fxq;h.fxq=[];
  Object.keys(h.conns).forEach(function(s){h._send(+s,{t:"s",st:view(h.game,+s),fx:fx})});
};
Host.prototype._remoteTurn=function(i){
  var h=this;
  return new Promise(function(res){h.turnWait={i:i,res:res,busy:false};h._flushNow();h._send(i,{t:"turn"})});
};
Host.prototype._remoteTie=function(ti,info){
  var h=this,pub={card:info.card,slotCard:info.slotCard,attackVal:info.attackVal,from:info.from};
  return new Promise(function(res){h.tieWait={i:ti,res:res,info:pub};h._flushNow();h._send(ti,{t:"tie",info:pub})});
};
Host.prototype._tieAns=function(seat,ix){
  var t=this.tieWait;if(!t||t.i!==seat)return;
  var p=this.game.players[seat];
  this.tieWait=null;
  t.res(typeof ix==="number"&&ix%1===0&&ix>=0&&ix<p.offense.length?ix:-1);
};
Host.prototype._err=function(s,msg){this._send(s,{t:"err",msg:msg})};
var int=function(x){return typeof x==="number"&&x%1===0&&x>=0&&x<100};
Host.prototype._cmd=function(seat,c,a){
  var g=this.game,w=this.turnWait;
  if(!g||g.over||!w||w.i!==seat||w.busy)return this._err(seat,"It isn't your turn.");
  if(c==="convert"){
    if(typeof a.key!=="string"||!g.doConvert(seat,a.key))return this._err(seat,"You can't convert that.");
    return this._maybeDone(w);
  }
  if(c==="defend"){
    if((a.k!=="K"&&a.k!=="A")||!g.defendAce(seat,a.k))return this._err(seat,"You can't answer that way.");
    return this._maybeDone(w);
  }
  this._end(seat,c,a,w);
};
/* a win by Jokers can land mid-turn, which ends the turn on the spot */
Host.prototype._maybeDone=function(w){if(this.game.over&&this.turnWait===w){this.turnWait=null;w.res()}};
Host.prototype._end=async function(seat,c,a,w){
  var g=this.game,p=g.players[seat],ok=false,card=int(a.hi)?p.offense[a.hi]:null;
  w.busy=true;
  try{
    if(c==="concede"){g.eliminate(seat,"concedes");ok=true}
    else if(p.pending){ok=false}
    else if(c==="strike"){
      var T=g.players[a.t];
      if(card&&int(a.t)&&int(a.s)&&a.t!==seat&&T&&T.alive)ok=(await g.attackDefense(seat,a.t,a.s,a.hi)).res!=="illegal";
    }
    else if(c==="ace"){if(card&&int(a.t)&&a.t!==seat)ok=g.aceAttack(seat,a.t,a.hi)}
    else if(c==="queen"){if(card&&card.rank==="Q")ok=g.queen(seat,a.hi)}
    else if(c==="pass"){if(card){g.discardPass(seat,a.hi);ok=true}}
  }catch(e){ok=false;if(root.console)console.error(e)}
  if(!ok){w.busy=false;return this._err(seat,"That move isn't allowed.")}
  if(this.turnWait===w)this.turnWait=null;
  await g.pause(700);
  w.res();
};
Host.prototype.close=function(why){
  var h=this;if(h.closed)return;
  h.closed=true;clearInterval(h._hb);clearTimeout(h._tm);
  Object.keys(h.conns).forEach(function(s){var c=h.conns[s];send(c,{t:"kick",why:why||"The host closed the game"});setTimeout(function(){shut(c)},200)});
  h.conns={};
  setTimeout(function(){try{h.peer.destroy()}catch(e){}},300);
};

/* ---------------- guest ---------------- */
function Client(peer,conn,code){
  Emitter.call(this);
  var c=this;
  c.peer=peer;c.conn=conn;c.code=code;c.seat=null;c.name="";c.game=null;c.lobby=null;c.closed=false;c._seen=Date.now();
  conn.on("data",function(m){c._onMsg(m)});
  conn.on("close",function(){c._end("The host left the game")});
  conn.on("error",function(){c._end("Connection lost")});
  c._hb=setInterval(function(){
    if(Date.now()-c._seen>cfg.dead)return c._end("The host stopped responding");
    send(conn,{t:"ping"});
  },cfg.ping);
}
Client.prototype=Object.create(Emitter.prototype);
Client.prototype._onMsg=function(m){
  if(!m||typeof m!=="object")return;
  this._seen=Date.now();
  if(m.t==="lobby"){this.seat=m.you;this.lobby=m;this.emit("lobby",m)}
  else if(m.t==="start"){this.seat=m.seat;this.emit("start")}
  else if(m.t==="s"){this.game=mirror(m.st);this.emit("state",this.game,m.fx||[])}
  else if(m.t==="turn")this.emit("turn");
  else if(m.t==="tie")this.emit("tie",m.info);
  else if(m.t==="err")this.emit("err",m.msg);
  else if(m.t==="kick"){var w=m.why||"Removed from the game";this._end(w)}
};
Client.prototype._end=function(why){
  if(this.closed)return;
  this.closed=true;clearInterval(this._hb);
  this.emit("close",why);
  try{this.conn.close()}catch(e){}
  try{this.peer.destroy()}catch(e){}
};
Client.prototype.cmd=function(c,a){send(this.conn,{t:"cmd",c:c,a:a||{}})};
Client.prototype.strike=function(hi,t,s){this.cmd("strike",{hi:hi,t:t,s:s})};
Client.prototype.ace=function(hi,t){this.cmd("ace",{hi:hi,t:t})};
Client.prototype.queen=function(hi){this.cmd("queen",{hi:hi})};
Client.prototype.pass=function(hi){this.cmd("pass",{hi:hi})};
Client.prototype.convert=function(key){this.cmd("convert",{key:key})};
Client.prototype.defend=function(k){this.cmd("defend",{k:k})};
Client.prototype.concede=function(){this.cmd("concede")};
Client.prototype.answerTie=function(ix){send(this.conn,{t:"tieans",ix:ix})};
Client.prototype.leave=function(){send(this.conn,{t:"bye"});var c=this;setTimeout(function(){c._end("You left the game")},100)};

/* ---------------- entry points ---------------- */
function create(){
  var tries=0;
  function go(){
    var code=makeCode();
    return newPeer(PREFIX+code).then(function(p){return new Host(p,code)},function(e){
      if(e&&e.type==="unavailable-id"&&++tries<6)return go();
      throw new Error(why(e));
    });
  }
  return go();
}
function join(code,name){
  code=norm(code);
  if(code.length<4)return Promise.reject(new Error("Enter the game code"));
  return newPeer().then(function(peer){
    return new Promise(function(res,rej){
      var done=false,t;
      function fail(msg){if(done)return;done=true;clearTimeout(t);try{peer.destroy()}catch(e){}rej(new Error(msg))}
      var conn=peer.connect(PREFIX+code,{serialization:"json",reliable:true});
      t=setTimeout(function(){fail("Couldn't connect to that game")},cfg.timeout);
      peer.on("error",function(e){fail(why(e))});
      conn.on("open",function(){send(conn,{t:"hello",v:V,name:name})});
      conn.on("close",function(){fail("Couldn't connect to that game")});
      conn.on("data",function(m){
        if(done||!m)return;
        if(m.t==="welcome"){
          done=true;clearTimeout(t);
          var c=new Client(peer,conn,code);c.seat=m.seat;c.name=m.name;res(c);
        }else if(m.t==="full"||m.t==="kick")fail(m.why||"That game is full");
      });
    });
  },function(e){throw new Error(why(e))});
}
F.Net={available:available,config:cfg,create:create,join:join,norm:norm,view:view,mirror:mirror};
})(typeof window!=="undefined"?window:globalThis);
