/* Canonical provider selection for saved water meters and their official PDFs. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4UWater132=factory()})(typeof window==='undefined'?globalThis:window,function(){'use strict';
const labels={'water-link':'water-link',pidpa:'Pidpa',de_watergroep:'De Watergroep',farys:'Farys',vivaqua:'VIVAQUA',swde:'SWDE',cile:'CILE',inbw:'in BW',aquaduin:'Aquaduin',agso:'AGSO Knokke-Heist'},supported=['water-link','de_watergroep','farys','vivaqua','swde','cile','inbw','aquaduin','agso'];
function resolve(m){const id=String(m?.water_provider||'').toLowerCase();if(labels[id])return id;const name=String(m?.supplier||m?.water_provider||'').toLowerCase().replace(/[^a-z]/g,'');return {waterlink:'water-link',pidpa:'pidpa',dewatergroep:'de_watergroep',farys:'farys',tmvw:'farys',farystmvw:'farys',vivaqua:'vivaqua',swde:'swde',cile:'cile',inbw:'inbw',aquaduin:'aquaduin',iwva:'aquaduin',agso:'agso',agsoknokkeheist:'agso'}[name]||''}
function available(m){return supported.includes(resolve(m))}
function label(m){return labels[resolve(m)]||m?.supplier||'Water company'}
function problem(m){return resolve(m)==='pidpa'?'Pidpa supplies its official takeover form through its request process. Request that form from Pidpa; no generic handover is substituted.':'Choose a supported water company to prepare its filled-in official form.'}
return {resolve,available,label,problem,supported};});
