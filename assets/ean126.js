/* Shared EAN format handling. Keep identifiers as text; never round them as numbers. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MR4UEan126=factory()})(typeof window!=='undefined'?window:globalThis,function(){'use strict';
 function normalize(value){return String(value??'').replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g,'');}
 function inspect(raw){const value=normalize(raw),digits=(value.match(/[0-9]/g)||[]).length,empty=!value;
 const problem=typeof raw==='number'?'Re-enter this EAN from the original document; it was stored as a number and may have lost digits.':empty?'':/[^0-9]/.test(value)?'EAN contains non-digit characters. Use 18 digits beginning with 54.':value.length!==18?'EAN has '+digits+' digits; it needs exactly 18 digits beginning with 54.':!value.startsWith('54')?'EAN must begin with 54.':'';
 return {value,digits,empty,valid:!problem,problem};}
 function label(meter,index){return (meter.kind==='gas'?'Gas':meter.kind==='electricity'?'Electricity':'Energy')+' meter '+(index+1)+(meter.meter_number?' ('+String(meter.meter_number).slice(0,100)+')':'');}
 return {normalize,inspect,label};
});
