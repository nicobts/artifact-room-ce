/**
 * The unbranded measurement shim, injected (at serve time) into the artifact
 * document. It adds NO UI and NO branding — pure instrumentation. It emits
 * slide/visibility/dwell signals to the parent shell via `postMessage` with a
 * strict `targetOrigin`. Region detection is layered (declared → framework →
 * structural → whole-document fallback) so per-slide dwell works out-of-the-box.
 *
 * Stored bytes remain unmodified; this injection happens only on the served
 * response (the no-branding invariant is about not adding visible branding).
 */
function shimSource(parentOrigin: string): string {
  const ORIGIN = JSON.stringify(parentOrigin || "*");
  return `(function(){
"use strict";
var ORIGIN=${ORIGIN};
function post(m){try{parent.postMessage(m,ORIGIN);}catch(e){}}
document.addEventListener("securitypolicyviolation",function(){post({v:1,type:"blocked"});},{once:true});
function collapse(s){return s.replace(/\\s+/g," ").trim().slice(0,32);}
function label(el){
  var v=el.getAttribute&&el.getAttribute("data-ar-label");
  if(v&&collapse(v))return collapse(v);
  v=el.getAttribute&&el.getAttribute("data-ar-section");
  if(v&&collapse(v))return collapse(v);
  if(el.id&&collapse(el.id))return collapse(el.id);
  var h=el.querySelector&&el.querySelector("h1, h2, h3");
  if(h&&h.textContent&&collapse(h.textContent))return collapse(h.textContent);
  return null;
}
function detect(){
  var a=[].slice.call(document.querySelectorAll("[data-ar-section]"));
  if(a.length>=1)return{method:"annotated",kind:"sections",els:a};
  var d=[].slice.call(document.querySelectorAll("[data-slide]"));
  if(d.length>=2)return{method:"declared",kind:"slides",els:d};
  var f=[].slice.call(document.querySelectorAll(".reveal .slides > section, section.slide"));
  if(f.length>=2)return{method:"framework",kind:"slides",els:f};
  var s=[].slice.call(document.querySelectorAll("body > section, main > section"));
  if(s.length>=2)return{method:"structural",kind:"slides",els:s};
  var se=document.scrollingElement||document.documentElement;
  if(se&&se.scrollHeight>innerHeight*1.5)return{method:"quartiles",kind:"scroll",els:[]};
  return{method:"document",kind:"document",els:document.body?[document.body]:[]};
}
var QUARTILE_LABELS=["0–25%","25–50%","50–75%","75–100%"];
var r=detect(),els=r.els;
function buildDetection(){
  var count=r.kind==="scroll"?4:els.length;
  var labels=r.kind==="scroll"?QUARTILE_LABELS.slice():null;
  if(r.kind!=="scroll"&&els.length){
    labels=[];
    for(var i=0;i<els.length;i++){labels.push(label(els[i]));}
  }
  var det={method:r.method,kind:r.kind,count:count};
  if(labels){if(labels.length>40)labels.length=40;det.labels=labels;}
  function fits(){return JSON.stringify({v:1,type:"view",repost:true,detection:det}).length<=2000;}
  while(det.labels&&det.labels.length&&!fits()){
    det.labels.pop();
  }
  if(det.labels&&!fits()){
    delete det.labels;
  }
  return det;
}
var D=buildDetection();
post({v:1,type:"view",detection:D});
setTimeout(function(){post({v:1,type:"view",repost:true,detection:D});},2000);
var cur=-1,enter=Date.now();
function flush(){if(cur>=0){var dur=Date.now()-enter;enter=Date.now();if(dur>0){post({v:1,type:"dwell",slideIndex:cur,durationMs:dur});}}}
if("IntersectionObserver" in window && els.length){
  var io=new IntersectionObserver(function(entries){
    var best=null,ratio=0;
    for(var i=0;i<entries.length;i++){if(entries[i].intersectionRatio>ratio){ratio=entries[i].intersectionRatio;best=entries[i].target;}}
    if(best){var idx=els.indexOf(best);if(idx>=0&&idx!==cur){flush();cur=idx;enter=Date.now();post({v:1,type:"slide_view",slideIndex:idx});}}
  },{threshold:[0.25,0.5,0.75]});
  for(var i=0;i<els.length;i++){io.observe(els[i]);}
}
if(r.kind==="scroll"){
  var scrollTicking=false;
  function scrollBucket(){
    var el=document.scrollingElement||document.documentElement;
    var denom=Math.max(el.scrollHeight-window.innerHeight,1);
    var p=Math.max(0,Math.min(el.scrollTop/denom,1));
    var b=Math.min(Math.floor(p*4),3);
    return b;
  }
  function onScrollBucket(){
    scrollTicking=false;
    var b=scrollBucket();
    if(b!==cur){flush();cur=b;enter=Date.now();post({v:1,type:"slide_view",slideIndex:b});}
  }
  window.addEventListener("scroll",function(){
    if(!scrollTicking){scrollTicking=true;requestAnimationFrame(onScrollBucket);}
  },{passive:true});
  cur=scrollBucket();enter=Date.now();
  post({v:1,type:"slide_view",slideIndex:cur});
}
document.addEventListener("visibilitychange",function(){if(document.hidden){flush();post({v:1,type:"hidden"});}else{enter=Date.now();post({v:1,type:"visible"});}});
window.addEventListener("pagehide",flush);
})();`;
}

export function injectShim(html: string, parentOrigin: string): string {
  const tag = `<script>${shimSource(parentOrigin)}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, () => tag + "</body>");
  }
  return html + tag;
}
