/* Shared outline glyphs for the approved Messages / Indexation workspace. */
(function(){'use strict';const h=React.createElement,base=StudioIcon,paths={
calculator:'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM8 6h8v4H8ZM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
coins:'M15 3c-3.3 0-6 1.3-6 3s2.7 3 6 3 6-1.3 6-3-2.7-3-6-3ZM9 6v4c0 1.7 2.7 3 6 3s6-1.3 6-3V6M13 17c4.4.7 8-.8 8-3v-4M3 13c0-1.7 2.2-3 5-3s5 1.3 5 3-2.2 3-5 3-5-1.3-5-3ZM3 13v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5',
tag:'M3 3h8l10 10-8 8L3 11ZM7 7h.01',chevronRight:'m9 5 7 7-7 7',chevronDown:'m5 9 7 7 7-7',more:'M5 12h.01M12 12h.01M19 12h.01',download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',send:'m22 2-7 20-4-9-9-4ZM22 2 11 13'};
StudioIcon=function({name,size=20,...rest}){return paths[name]?h('svg',{...rest,width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:name==='more'?3:1.65,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:'false'},h('path',{d:paths[name]})):h(base,{name,size,...rest})};
})();
