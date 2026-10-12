(function(){
"use strict";
var F=window.Fortitude,Game=F.Game;
var NAMES=["Lord Halvard","Lady Isolde","Friar Quillon","King Osric","Baron Thessaly","Dame Rowena"];
var CROWN='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.5 8l4.8 4.2L12 4l4.7 8.2L21.5 8 20 17.5H4z"/><rect fill="currentColor" x="4" y="19" width="16" height="2.4" rx=".8"/></svg>';
function defSeats(){return [{name:"You",bot:false,level:"normal"},{name:NAMES[0],bot:true,level:"normal"},{name:NAMES[1],bot:true,level:"normal"}]}
function loadSeats(){try{var s=JSON.parse(localStorage.getItem("fortitude.seats")||"null");
  if(Array.isArray(s)&&s.length>=2&&s.length<=6)return s.map(function(x){return {name:String(x.name||"").slice(0,16),bot:!!x.bot,level:["easy","normal","hard"].indexOf(x.level)>=0?x.level:"normal"}})}catch(e){}return defSeats()}
function saveSeats(){try{localStorage.setItem("fortitude.seats",JSON.stringify(S.seats))}catch(e){}}
var S={screen:"menu",seats:loadSeats(),game:null,viewer:null,sel:null,modal:null,speed:1,ctx:null,busy:false,fx:{},raf:0,over:null};
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]})};
var isRed=function(s){return s==="♥"||s==="♦"};
function fmt(msg){return esc(msg).replace(/(10|[2-9JQKA])([♠♥♦♣])/g,function(m,r,s){return '<span class="cs'+(isRed(s)?" r":"")+'">'+r+s+'</span>'})}
function humans(){return S.game.players.map(function(p,i){return p.bot?-1:i}).filter(function(i){return i>=0})}
function hcount(){return S.seats.filter(function(s){return !s.bot}).length}
function sleep(ms){return S.speed===0?Promise.resolve():new Promise(function(r){setTimeout(r,ms/S.speed)})}
function queueRender(){if(S.raf)return;S.raf=requestAnimationFrame(function(){S.raf=0;render()})}
var tt=0;
function toast(m){var t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(function(){t.hidden=true},2600)}
/* ---------- card markup ---------- */
function cardHTML(c,o){o=o||{};
  var tag=o.act?"button":"div",a=['class="card '+(isRed(c.suit)?"red ":"")+(c.joker?"joker ":(F.isFaceR(c.rank)||c.rank==="A")?"face ":"")+(o.cls||"")+'"'];
  if(o.act){a.push('data-act="'+o.act+'"');if(o.i!=null)a.push('data-i="'+o.i+'"');if(o.t!=null)a.push('data-t="'+o.t+'"');if(o.s!=null)a.push('data-s="'+o.s+'"');if(o.dis)a.push("disabled")}
  var lab=c.joker?"Joker":c.rank+" of "+c.suit;a.push('aria-label="'+lab+'"');
  var tl=c.joker?"JKR":c.rank,sm=c.joker?"":"<i>"+c.suit+"</i>";
  var center=c.joker?"<b>★</b>":(F.isFaceR(c.rank)||c.rank==="A")?"<b>"+c.rank+"</b><i>"+c.suit+"</i>":"<b>"+c.suit+"</b>";
  return "<"+tag+" "+a.join(" ")+'><span class="cr tl"><b>'+tl+"</b>"+sm+'</span><span class="cc">'+center+'</span><span class="cr br"><b>'+tl+"</b>"+sm+"</span></"+tag+">";
}
function backHTML(o){o=o||{};var tag=o.act?"button":"div",a=['class="card back '+(o.cls||"")+'"'];
  if(o.act){a.push('data-act="'+o.act+'"');a.push('data-t="'+o.t+'"');a.push('data-s="'+o.s+'"');a.push('aria-label="Hidden defense"')}
  return "<"+tag+" "+a.join(" ")+"></"+tag+">"}
/* ---------- game screen ---------- */
function targeting(){
  var v=S.viewer;if(v===null||!S.ctx||S.ctx.i!==v||S.busy||S.modal||S.sel==null)return null;
  var p=S.game.players[v];if(p.pending)return null;var c=p.offense[S.sel];if(!c)return null;
  if(F.isNumR(c.rank))return "slot";if(c.rank==="J")return "jack";if(c.rank==="A")return "king";return null;
}
function fxc(key){var u=S.fx[key];return u&&u>Date.now()?" fx-"+S.fx[key+"r"]:""}
function slotHTML(d,i,s,tg,mine,p){
  var g=S.game;
  if(d.dead)return '<div class="slot dead'+fxc("s"+i+"-"+s)+'">✕</div>';
  var can=(tg==="slot"||(tg==="jack"&&d.up&&d.card.rank==="10"))&&i!==S.viewer&&p.alive&&!g.exposed(p);
  var cls=(can?"target ":"")+fxc("s"+i+"-"+s);
  var o={act:can?"strike":null,t:i,s:s,cls:cls};
  if(d.up)return '<div class="slot">'+cardHTML(d.card,{act:can?"strike":null,t:i,s:s,cls:"held "+cls})+"</div>";
  var peek=mine?'<span class="peek'+(isRed(d.card.suit)?" red":"")+'">'+d.card.rank+d.card.suit+"</span>":"";
  return '<div class="slot">'+backHTML(o)+peek+"</div>";
}
function kingHTML(p,i,tg){
  var g=S.game,exp=g.exposed(p),can=tg==="king"&&i!==S.viewer&&exp&&!p.pending&&p.alive;
  var tag=can?"button":"div",lab=!p.alive?"Fallen":exp?"Exposed":"King";
  return "<"+tag+' class="king'+(exp?" exposed":"")+(p.alive?"":" fallen")+(can?" target":"")+'"'+(can?' data-act="aceking" data-t="'+i+'"':"")+">"+CROWN+'<span class="klabel">'+lab+"</span>"+(p.pending&&p.alive?'<span class="ace-pend" title="Ace attack pending">A!</span>':"")+"</"+tag+">";
}
function boardHTML(i,tg,big){
  var g=S.game,p=g.players[i],mine=i===S.viewer;
  var sl=function(s){return slotHTML(p.defense[s],i,s,tg,mine,p)};
  var tag=(mine?"You":p.bot?"Bot · "+p.level:"Player");
  var stat=p.alive?(g.liveCount(p)+" of 4 defenses"):"eliminated";
  return '<section class="board'+(g.turn===i&&!g.over&&p.alive?" active":"")+(p.alive?"":" out")+'">'+
    '<div class="bhead"><span class="bname">'+esc(p.name)+'</span><span class="btag">'+tag+'</span><span class="bstat">'+stat+"</span></div>"+
    '<div class="field">'+sl(0)+sl(1)+kingHTML(p,i,tg)+sl(2)+sl(3)+"</div></section>";
}
function bannerHTML(){
  var g=S.game,cur=g.players[g.turn],msg;
  if(g.over)msg="Game over";
  else if(S.ctx&&S.ctx.i===S.viewer)msg=cur.pending?"Your King is under attack":"Your move";
  else if(!cur.bot)msg=(S.viewer===null&&hcount()>1)?"Waiting for "+esc(cur.name):esc(cur.name)+" is deciding";
  else msg=esc(cur.name)+" is playing…";
  return '<div class="banner"><span class="rd">Round '+g.round+" · "+g.totalJokers+" Jokers in the deck</span>"+'<span class="msg">'+msg+"</span></div>";
}
function hintText(p,canAct){
  if(!canAct)return "";
  var c=S.sel!=null?p.offense[S.sel]:null;
  if(p.pending)return "Trade or convert to find a King or an Ace, then answer the attack. You can't play a card until you do.";
  if(!c)return "Select a card to play. Trade or convert first if you like, then play one card to end your turn.";
  if(F.isNumR(c.rank))return "Click a defense card on any opponent board to strike it with "+F.cs(c)+".";
  if(c.rank==="A")return S.game.players.some(function(q,i){return i!==S.viewer&&S.game.exposed(q)&&!q.pending})?"Click an exposed King to play your Ace.":"Aces can only hit an exposed King, and none are exposed yet.";
  if(c.rank==="J")return S.game.players.some(function(q,i){return i!==S.viewer&&q.alive&&!S.game.exposed(q)&&q.defense.some(function(d){return !d.dead&&d.up&&d.card.rank==="10"})})?"A Jack can destroy a face-up 10. Click one, or keep the Jack for tie defense.":"A Jack can only strike a face-up 10, and none are showing. Keep it for ties, or convert it.";
  if(c.rank==="Q")return S.game.deadCount(p)>0?"Play the Queen to raise a new defense.":"You have no broken defenses to restore.";
  return "A "+F.RN[c.rank]+" can't attack. Keep it for defense, or convert it.";
}
function youHTML(){
  var g=S.game,v=S.viewer,p=g.players[v];
  var canAct=!!S.ctx&&S.ctx.i===v&&!S.busy&&!S.modal;
  var tg=targeting();
  var hand;
  if(!p.alive)hand='<p class="hint">You have fallen. The game plays on without you.</p><div class="acts"><button class="btn" data-act="speed">Speed: '+speedName()+"</button></div>";
  else{
    var cards=p.offense.map(function(c,i){return cardHTML(c,{act:canAct?"select":null,i:i,dis:!canAct,cls:S.sel===i?"sel":""})}).join("");
    var pool=p.jokers>0?'<div class="pool">★ Joker pool: '+p.jokers+" of "+g.totalJokers+"</div>":"";
    var q=S.sel!=null?p.offense[S.sel]:null;
    var qb=q&&q.rank==="Q"&&canAct?'<button class="btn primary" data-act="queen"'+(g.deadCount(p)?"":" disabled")+">Play Queen</button>":"";
    var alert="";
    if(p.pending&&canAct){
      var hk=g.has(p,"K"),ha=g.has(p,"A");
      alert='<div class="alert"><b>'+esc(g.players[p.pending.from].name)+' played an Ace on your exposed King.</b><div class="acts">'+
        '<button class="btn" data-act="defend" data-k="K"'+(hk?"":" disabled")+">Block with a King</button>"+
        '<button class="btn" data-act="defend" data-k="A"'+(ha?"":" disabled")+">Renew with an Ace</button></div></div>";
    }
    var nconv=g.convertOptions(p).length;
    hand='<div class="hand">'+cards+"</div>"+pool+alert+'<p class="hint">'+hintText(p,canAct)+"</p>"+
      '<div class="acts">'+qb+
      '<button class="btn" data-act="trade"'+(canAct?"":" disabled")+">Trade</button>"+
      '<button class="btn" data-act="convert"'+(canAct?"":" disabled")+">Convert"+(nconv?" ("+nconv+")":"")+"</button>"+
      '<button class="btn" data-act="pass"'+(canAct&&!p.pending?"":" disabled")+">Discard &amp; pass</button>"+
      '<button class="btn danger" data-act="concede"'+(canAct?"":" disabled")+">Concede</button></div>";
  }
  return '<div class="you">'+boardHTML(v,tg)+'<div class="handbox">'+hand+"</div></div>";
}
function speedName(){return S.speed===0.5?"Slow":S.speed===1?"Normal":S.speed===3?"Fast":"Instant"}
function logHTML(){
  var g=S.game,items=g.log.slice(-70).map(function(l){return '<li class="k-'+l.kind+'">'+fmt(l.msg)+"</li>"}).join("");
  return '<aside class="chron"><h3>Chronicle</h3><ol id="logol">'+items+"</ol></aside>";
}
function gameHTML(){
  var g=S.game,v=S.viewer,order=[],tg=targeting();
  if(v===null){g.players.forEach(function(_,i){order.push(i)})}
  else for(var k=1;k<g.n;k++)order.push((v+k)%g.n);
  return '<div class="play"><div class="table">'+bannerHTML()+'<div class="opps">'+order.map(function(i){return boardHTML(i,tg)}).join("")+"</div>"+(v!==null?youHTML():"")+"</div>"+logHTML()+"</div>";
}
/* ---------- menu ---------- */
function miniRow(list){return '<div class="minis">'+list.map(function(c){return cardHTML({rank:c[0],suit:c[1]},{})}).join("")+"</div>"}
function menuHTML(){
  var seats=S.seats.map(function(s,i){
    return '<div class="seat"><span class="no">'+(i+1)+'</span><input id="seat-name-'+i+'" data-name="'+i+'" value="'+esc(s.name)+'" maxlength="16" aria-label="Seat '+(i+1)+' name">'+
      '<div class="seg"><button data-act="seattype" data-i="'+i+'" data-v="h" class="'+(s.bot?"":"on")+'">Human</button><button data-act="seattype" data-i="'+i+'" data-v="b" class="'+(s.bot?"on":"")+'">Bot</button></div>'+
      '<select data-level="'+i+'" aria-label="Bot level"'+(s.bot?"":" hidden")+'>'+["easy","normal","hard"].map(function(l){return '<option value="'+l+'"'+(s.level===l?" selected":"")+">"+l[0].toUpperCase()+l.slice(1)+"</option>"}).join("")+"</select>"+
      '<button class="btn small del" data-act="delseat" data-i="'+i+'"'+(S.seats.length<=2?" disabled":"")+' aria-label="Remove seat">✕</button></div>';
  }).join("");
  return '<div class="menu"><section class="hero"><h1>Fortitude</h1><p class="tag">A card game of kings, bluffs and bargains.</p>'+
    '<div class="steps"><div class="stepc">'+miniRow([["8","♥"],["5","♣"]])+"<b>Strike</b>A higher number destroys a defense.</div>"+
    '<div class="stepc">'+miniRow([["K","♠"]])+"<b>Expose</b>Four broken defenses leave the King bare.</div>"+
    '<div class="stepc">'+miniRow([["A","♦"]])+"<b>Execute</b>Only an Ace can end a King.</div></div></section>"+
    '<section class="setup"><h2>Take your seats</h2><div class="row">'+
    '<button class="btn small" data-act="preset" data-p="duel">Duel a bot</button><button class="btn small" data-act="preset" data-p="solo3">You + 2 bots</button>'+
    '<button class="btn small" data-act="preset" data-p="pass3">Pass &amp; play (3)</button><button class="btn small" data-act="preset" data-p="watch">Watch 4 bots</button></div>'+
    seats+'<div class="row"><button class="btn small" data-act="addseat"'+(S.seats.length>=6?" disabled":"")+'>Add seat</button><span class="meta">'+S.seats.length+" Jokers will be in the deck. Pass-and-play hides hands between turns.</span></div>"+
    '<div class="row"><button class="btn primary" data-act="start">Start game</button><button class="btn" data-act="rules">Rules</button></div></section></div>';
}
/* ---------- modals ---------- */
function handCards(p,fn){return '<div class="hand">'+p.offense.map(function(c,i){var r=fn(c,i);return cardHTML(c,{act:r.act,i:i,dis:!r.act,cls:r.dim?"dim":""})}).join("")+"</div>"}
var RULES="<div class=\"rules\"><h2>The rules of the realm</h2>\n<h3>The aim</h3><ul>\n<li>Be the last King standing, or gather every Joker in the deck (one for each seat) and win at once.</li></ul>\n<h3>Your realm</h3><ul>\n<li>Your King sits at the centre, guarded by four face-down defense cards, each a number from 2 to 10. You may peek at your own. Your foes may not.</li>\n<li>You also hold four offense cards. The deck never runs dry, so your hand is always refilled to four.</li>\n<li>Jokers you draw go to a side pool and do not count among your four.</li></ul>\n<h3>Your turn</h3><ul>\n<li>First, trade and convert as often as you wish.</li>\n<li>Then play one card to end your turn: strike a defense, play a Queen, or play an Ace on an exposed King.</li>\n<li>If nothing is worth playing, discard a card and pass. You may also concede at any time to leave the table.</li></ul>\n<h3>What each card does</h3><ul>\n<li><b>2 to 10.</b> The only cards that strike a defense. The higher number wins.</li>\n<li><b>Jack.</b> Answers a tie. Also destroys a face-up 10, and nothing else.</li>\n<li><b>Queen.</b> Raises a fresh face-down defense in one of your broken slots. You need at least one broken slot, and playing it ends your turn.</li>\n<li><b>King.</b> Discard one to block an Ace aimed at your exposed King.</li>\n<li><b>Ace.</b> The only card that can strike an exposed King. You may also discard one to renew your own King when an Ace is pending against it.</li>\n<li><b>Joker.</b> Kept in your side pool, not your hand. See Jokers below.</li></ul>\n<h3>Striking a defense</h3><ul>\n<li>Pick a number card and a defense on an opponent's board. Higher destroys it. Lower fails, and the defense is turned face up for all to see.</li>\n<li>A tie gives the defender one chance. Answer with a Jack or a higher number and the defense stands. Otherwise it falls.</li>\n<li>A 10 cannot be beaten by number. It falls to a tie the defender cannot answer with a Jack, or to a Jack once it is face up. A Jack cannot touch a face-down 10.</li></ul>\n<h3>The exposed King</h3><ul>\n<li>When all four of your defenses are broken, your King is exposed. Only an Ace can strike it.</li>\n<li>The Ace waits until the defender's next turn. They may trade and convert first, but must answer before playing a card: discard a King to block, or an Ace to renew. Fail, and the King falls.</li>\n<li>While no Ace is pending, a Queen can raise a defense and cover a bare King again.</li></ul>\n<h3>Conversions</h3><ul>\n<li>Forge stronger cards from weaker ones. Each conversion draws a replacement.</li>\n<li>Two of the same number → Jack · two Jacks → Queen · two Queens → King · two Kings → Ace · Joker + Jack, Queen or King → Ace.</li></ul>\n<h3>Trading</h3><ul>\n<li>Offer one card (or a Joker) and name the rank you want, or a Joker. The other player may accept and choose which matching card to give, or decline.</li>\n<li>Hands stay at four. If a trade would leave you with five, discard one.</li></ul>\n<h3>Jokers</h3><ul>\n<li>The deck holds one Joker for each seat. Drawn Jokers go to your side pool, hidden from others.</li>\n<li>Trade them, spend one with a face card to forge an Ace, or gather every Joker to win on the spot.</li></ul></div>";
function modalHTML(){
  var m=S.modal;if(!m)return "";var g=S.game;
  var wrap=function(inner,solid){return '<div class="scrim'+(solid?" solid":"")+'"><div class="dlg" role="dialog" aria-modal="true">'+inner+"</div></div>"};
  if(m.type==="rules")return wrap(RULES+'<div class="row"><button class="btn primary" data-act="closemodal">Got it</button></div>');
  if(m.type==="handoff")return wrap("<h2>Pass the device to "+esc(m.name)+"</h2><p>"+esc(m.reason)+" Other players should look away.</p><div class=\"row\"><button class=\"btn primary\" data-act=\"handoffok\">I'm "+esc(m.name)+"</button></div>",true);
  var v=S.viewer,p=v!=null?g.players[v]:null;
  if(m.type==="convert"){
    var o=g.convertOptions(p);
    return wrap("<h2>Convert</h2><p>Combine cards into something stronger. Each conversion draws a replacement.</p>"+handCards(p,function(){return {dim:false}})+
      '<div class="row">'+(o.length?o.map(function(x){return '<button class="chip" data-act="doconv" data-k="'+x.key+'">'+esc(x.label)+"</button>"}).join(""):'<span class="meta">Nothing to convert right now.</span>')+"</div>"+
      (p.jokers?'<div class="pool">★ Joker pool: '+p.jokers+"</div>":"")+'<div class="row"><button class="btn primary" data-act="closemodal">Done</button></div>');
  }
  if(m.type==="pass")return wrap("<h2>Discard &amp; pass</h2><p>Choose a card to discard. Your turn ends and you draw a replacement.</p>"+handCards(p,function(){return {act:"dopass"}})+'<div class="row"><button class="btn" data-act="closemodal">Cancel</button></div>');
  if(m.type==="concede")return wrap("<h2>Concede?</h2><p>Your King falls and you leave the table.</p><div class=\"row\"><button class=\"btn danger\" data-act=\"doconcede\">Concede</button><button class=\"btn\" data-act=\"closemodal\">Keep playing</button></div>");
  if(m.type==="trade"){
    var opp=g.players.map(function(q,i){return i}).filter(function(i){return i!==v&&g.players[i].alive});
    var ranks=F.RANKS.map(function(r){return '<button class="chip'+(m.req===r?" on":"")+'" data-act="treq" data-k="'+r+'">'+r+"</button>"}).join("")+
      '<button class="chip'+(m.req==="JOKER"?" on":"")+'" data-act="treq" data-k="JOKER"'+(m.offer==="joker"?" disabled":"")+">Joker</button>";
    var oc=p.offense.map(function(c,i){return cardHTML(c,{act:"toffer",i:i,cls:m.offer===i?"sel":""})}).join("")+(p.jokers?cardHTML({rank:"JOKER",joker:true,suit:""},{act:"toffer",i:"joker",cls:m.offer==="joker"?"sel":""}):"");
    var ready=m.to!=null&&m.offer!=null&&m.req!=null;
    return wrap("<h2>Propose a trade</h2><div><div class=\"lbl\">With</div><div class=\"row\">"+opp.map(function(i){return '<button class="chip'+(m.to===i?" on":"")+'" data-act="tto" data-i="'+i+'">'+esc(g.players[i].name)+"</button>"}).join("")+"</div></div>"+
      '<div><div class="lbl">You offer</div><div class="hand">'+oc+"</div></div>"+
      '<div><div class="lbl">You want</div><div class="row">'+ranks+"</div></div>"+
      '<div class="row"><button class="btn primary" data-act="tgo"'+(ready?"":" disabled")+'>Propose</button><button class="btn" data-act="closemodal">Cancel</button></div>');
  }
  if(m.type==="askTrade"){
    var q=g.players[m.prop.to],f=g.players[m.prop.from],req=m.prop.req;
    var match=q.offense.map(function(c,i){return c.rank===req?i:-1}).filter(function(i){return i>=0});
    var body;
    if(req==="JOKER")body=q.jokers>0?'<button class="btn primary" data-act="tans" data-i="0">Accept and give a Joker</button>':"<p>You hold no Joker, so you must decline.</p>";
    else body=match.length?"<p>Pick which "+req+" to give, or decline.</p><div class=\"hand\">"+match.map(function(i){return cardHTML(q.offense[i],{act:"tans",i:i})}).join("")+"</div>":"<p>You hold no "+req+", so you must decline.</p>";
    return wrap("<h2>"+esc(f.name)+" offers a trade</h2><p>They give you:</p><div class=\"hand\">"+cardHTML(m.prop.offered,{})+"</div><p>They want "+(req==="JOKER"?"a Joker":"a "+req)+" from you.</p>"+handCards(q,function(c){return {dim:req!=="JOKER"&&c.rank!==req}})+body+'<div class="row"><button class="btn" data-act="tdecl">Decline</button></div>');
  }
  if(m.type==="tie"){
    var D=g.players[m.defIdx],av=m.info.attackVal;
    return wrap("<h2>Tie! "+esc(D.name)+", answer the strike</h2><p>"+esc(g.players[m.info.from].name)+" struck with "+F.cs(m.info.card)+" and your defense is "+F.cs(m.info.slotCard)+". Play a Jack or a higher number, or the defense falls.</p>"+
      handCards(D,function(c){var ok=c.rank==="J"||(F.isNumR(c.rank)&&F.rv(c.rank)>av);return {act:ok?"tieans":null,dim:!ok}})+'<div class="row"><button class="btn danger" data-act="tiefall">Let it fall</button></div>');
  }
  if(m.type==="trim"){var T=g.players[m.pi];return wrap("<h2>"+esc(T.name)+", your hand is full</h2><p>Discard one card to get back to four.</p>"+handCards(T,function(){return {act:"trimpick"}}))}
  if(m.type==="over"){
    var w=g.winner!=null?g.players[g.winner]:null;
    var why=g.reason==="jokers"?"collected every Joker":g.reason==="stalemate"?"The table reached a stalemate.":"is the last King standing";
    return wrap("<h2>"+(w?esc(w.name)+" wins":"Stalemate")+"</h2><p>"+(w?esc(w.name)+" "+why+" after "+g.round+" rounds.":why)+"</p><div class=\"row\"><button class=\"btn primary\" data-act=\"rematch\">Rematch</button><button class=\"btn\" data-act=\"tomenu\">Back to menu</button></div>");
  }
  return "";
}
function render(){
  var root=$("#screen"),top=$("#topbtns");
  if(S.screen==="menu"){root.innerHTML=menuHTML();top.innerHTML='<button class="btn small" data-act="rules">Rules</button>'}
  else{
    root.innerHTML=gameHTML();
    top.innerHTML='<span class="meta">'+(S.game.over?"Finished":"Round "+S.game.round)+'</span><button class="btn small" data-act="speed">Speed: '+speedName()+'</button><button class="btn small" data-act="rules">Rules</button><button class="btn small" data-act="tomenu">Menu</button>';
    var ol=$("#logol");if(ol)ol.scrollTop=ol.scrollHeight;
  }
  $("#modal-root").innerHTML=modalHTML();
}
window.__FORT={S:S,render:render};
/* ---------- flow ---------- */
function ensureViewer(i,reason){
  var hc=hcount();
  if(hc<=1){S.viewer=hc===1?humans()[0]:null;return Promise.resolve()}
  if(S.viewer===i)return Promise.resolve();
  S.viewer=null;
  return new Promise(function(res){
    S.modal={type:"handoff",name:S.game.players[i].name,reason:reason||"It's your turn.",res:res};render();
  }).then(function(){S.viewer=i;S.modal=null;render()});
}
function makeIO(){
  var io={
    sleep:function(ms){return sleep(ms)},
    changed:function(){if(S.game&&S.game.io===io)queueRender()},
    fx:function(kind,d){
      if(kind==="slot"){var k="s"+d.t+"-"+d.s;S.fx[k]=Date.now()+1000;S.fx[k+"r"]=d.res;setTimeout(queueRender,1050)}
      queueRender();
    },
    turnStart:function(){queueRender()},
    humanTurn:function(i){
      return new Promise(function(res){
        ensureViewer(i,"It's your turn.").then(function(){S.ctx={i:i,res:res};S.sel=null;S.busy=false;render()});
      });
    },
    askTie:function(ti,info){
      return ensureViewer(ti,"Your defense was struck.").then(function(){
        return new Promise(function(res){S.modal={type:"tie",defIdx:ti,info:info,res:res};render()});
      });
    },
    askTrade:function(ti,prop){
      return ensureViewer(ti,"You have a trade offer.").then(function(){
        return new Promise(function(res){S.modal={type:"askTrade",prop:prop,res:res};render()});
      });
    },
    askDiscard:function(pi){
      return ensureViewer(pi,"Your hand is over the limit.").then(function(){
        return new Promise(function(res){S.modal={type:"trim",pi:pi,res:res};render()});
      });
    },
    gameOver:function(){S.ctx=null;S.modal={type:"over"};render()}
  };
  return io;
}
async function endTurn(){
  var c=S.ctx;if(!c)return;
  S.busy=true;S.sel=null;render();
  await sleep(700);
  S.busy=false;S.ctx=null;
  if(hcount()>1)S.viewer=null;
  render();c.res();
}
function syncNames(){document.querySelectorAll("[data-name]").forEach(function(el){S.seats[+el.dataset.name].name=el.value})}
function startGame(){
  syncNames();
  var used={};
  S.seats.forEach(function(s,i){
    var n=(s.name||"").trim()||(s.bot?NAMES[i%NAMES.length]:"Player "+(i+1));
    while(used[n.toLowerCase()])n=n.slice(0,13)+" "+(i+1);
    used[n.toLowerCase()]=1;s.name=n;
  });
  saveSeats();
  var io=makeIO(),g=new Game(S.seats,io);
  S.game=g;S.screen="game";S.modal=null;S.ctx=null;S.sel=null;S.busy=false;S.fx={};
  S.viewer=hcount()===1?humans()[0]:null;
  render();g.run();
}
function abort(){
  var g=S.game;
  if(g){
    g.aborted=true;
    var m=S.modal;S.modal=null;
    if(m&&m.res){m.type==="tie"?m.res(-1):m.type==="askTrade"?m.res({accept:false}):m.type==="trim"?m.res(0):m.res()}
    if(S.ctx){S.ctx.res();S.ctx=null}
  }
  S.modal=null;S.game=null;S.screen="menu";S.viewer=null;S.busy=false;render();
}
function myIdx(){return S.ctx?S.ctx.i:null}
async function afterAction(){if(S.game.over)await endTurn();else render()}
async function propose(){
  var m=S.modal,i=myIdx(),g=S.game;if(!m||i==null)return;
  S.modal=null;S.busy=true;render();
  var r=await g.trade(i,m.to,m.offer,m.req);
  if(S.game!==g)return;
  await ensureViewer(i,"Your trade has been answered.");
  S.busy=false;S.sel=null;
  toast(r.ok?"Trade done. You received "+F.cs(r.got)+".":g.players[m.to].name+" declined.");
  render();if(g.over)endTurn();
}
var ACT={
  select:function(d){S.sel=S.sel===d.i?null:d.i;render()},
  strike:async function(d){
    var i=myIdx(),hi=S.sel;if(i==null||hi==null)return;
    S.sel=null;S.busy=true;render();
    await S.game.attackDefense(i,d.t,d.s,hi);await endTurn();
  },
  aceking:async function(d){
    var i=myIdx(),hi=S.sel;if(i==null||hi==null)return;
    S.sel=null;S.busy=true;S.game.aceAttack(i,d.t,hi);render();await endTurn();
  },
  queen:async function(){
    var i=myIdx(),hi=S.sel;if(i==null||hi==null)return;
    if(!S.game.queen(i,hi))return;await endTurn();
  },
  defend:function(d){S.game.defendAce(myIdx(),d.k);S.sel=null;render()},
  convert:function(){S.modal={type:"convert"};render()},
  doconv:function(d){S.game.doConvert(myIdx(),d.k);S.sel=null;if(S.game.over){S.modal=null;endTurn()}else render()},
  pass:function(){S.modal={type:"pass"};render()},
  dopass:async function(d){S.modal=null;S.game.discardPass(myIdx(),d.i);await endTurn()},
  concede:function(){S.modal={type:"concede"};render()},
  doconcede:async function(){S.modal=null;S.game.eliminate(myIdx(),"concedes");await endTurn()},
  trade:function(){
    var g=S.game,opp=g.players.map(function(_,i){return i}).filter(function(i){return i!==myIdx()&&g.players[i].alive});
    S.modal={type:"trade",to:opp.length===1?opp[0]:null,offer:null,req:null};render();
  },
  tto:function(d){S.modal.to=d.i;render()},
  toffer:function(d){S.modal.offer=d.i;if(d.i==="joker"&&S.modal.req==="JOKER")S.modal.req=null;render()},
  treq:function(d){S.modal.req=d.k;render()},
  tgo:propose,
  tans:function(d){var m=S.modal;S.modal=null;render();m.res({accept:true,giveIdx:d.i})},
  tdecl:function(){var m=S.modal;S.modal=null;render();m.res({accept:false})},
  tieans:function(d){var m=S.modal;S.modal=null;render();m.res(d.i)},
  tiefall:function(){var m=S.modal;S.modal=null;render();m.res(-1)},
  trimpick:function(d){var m=S.modal;S.modal=null;render();m.res(d.i)},
  handoffok:function(){var m=S.modal;m.res()},
  closemodal:function(){if(S.modal&&!S.modal.res){S.modal=null;render()}},
  rules:function(){if(!S.modal||!S.modal.res){S.modal={type:"rules"};render()}},
  speed:function(){S.speed=S.speed===1?3:S.speed===3?0:S.speed===0?0.5:1;render()},
  rematch:function(){startGame()},
  tomenu:function(){abort()},
  start:startGame,
  preset:function(d){
    var h=function(n){return {name:n,bot:false,level:"normal"}},b=function(i,l){return {name:NAMES[i],bot:true,level:l||"normal"}};
    syncNames();
    var keep=S.seats[0]&&!S.seats[0].bot&&S.seats[0].name?S.seats[0].name:"You";
    S.seats=d.p==="duel"?[h(keep),b(0,"hard")]:d.p==="solo3"?[h(keep),b(0),b(1)]:d.p==="pass3"?[h("Player 1"),h("Player 2"),h("Player 3")]:[b(0),b(1),b(2),b(3)];
    render();
  },
  seattype:function(d){syncNames();S.seats[d.i].bot=d.v==="b";if(S.seats[d.i].bot&&/^(You|Player \d)$/.test(S.seats[d.i].name))S.seats[d.i].name=NAMES[d.i%NAMES.length];render()},
  addseat:function(){
    syncNames();var n=NAMES.filter(function(x){return !S.seats.some(function(s){return s.name===x})})[0]||"Bot";
    S.seats.push({name:n,bot:true,level:"normal"});render();
  },
  delseat:function(d){syncNames();if(S.seats.length>2){S.seats.splice(d.i,1);render()}}
};
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-act]");if(!el||el.disabled)return;
  var d={i:el.dataset.i,t:el.dataset.t,s:el.dataset.s,k:el.dataset.k,v:el.dataset.v,p:el.dataset.p};
  ["i","t","s"].forEach(function(f){if(d[f]!=null&&d[f]!=="joker")d[f]=+d[f]});
  var fn=ACT[el.dataset.act];
  if(fn&&!(S.busy&&["select","strike","aceking","queen","defend","convert","pass","concede","trade"].indexOf(el.dataset.act)>=0))fn(d);
});
document.addEventListener("input",function(e){var el=e.target;if(el.dataset&&el.dataset.name!=null)S.seats[+el.dataset.name].name=el.value});
document.addEventListener("change",function(e){var el=e.target;if(el.dataset&&el.dataset.level!=null)S.seats[+el.dataset.level].level=el.value});
document.addEventListener("keydown",function(e){if(e.key==="Escape")ACT.closemodal()});
render();
})();
