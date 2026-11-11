// Apenas apresentação, viewport e acessibilidade. Não consulta nem altera dados.
let navigationCleanup=()=>{};
export function describeModal(modal){
    const title=modal.querySelector('h2,h1');
    if(title){title.id='dialog-title';modal.setAttribute('aria-labelledby',title.id);}
    modal.setAttribute('aria-modal','true');
}
export function setupNavigation(){
    navigationCleanup();
    const sidebar=document.querySelector('.sidebar'),menu=document.querySelector('#menu'),backdrop=document.querySelector('#nav-backdrop'),workspace=document.querySelector('.workspace');
    if(!sidebar||!menu)return;
    const desktop=window.matchMedia?.('(min-width: 64rem)')||{matches:window.innerWidth>=1024};
    let open=false;
    const change=(value,restore=false)=>{
        open=value&&!desktop.matches;
        sidebar.classList.toggle('open',open);sidebar.inert=!desktop.matches&&!open;
        sidebar.setAttribute('aria-hidden',String(!desktop.matches&&!open));
        menu.setAttribute('aria-expanded',String(open));
        if(backdrop)backdrop.hidden=!open;
        document.documentElement.classList.toggle('nav-open',open);
        if(workspace)workspace.inert=open;
        if(open)sidebar.querySelector('#close-menu')?.focus();
        else if(restore)menu.focus();
    };
    const keydown=event=>{
        if(!open)return;
        if(event.key==='Escape'){event.preventDefault();change(false,true);}
        if(event.key==='Tab'){
            const items=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
        }
    };
    const resize=()=>change(false);
    menu.onclick=()=>change(!open);
    sidebar.querySelector('#close-menu')?.addEventListener('click',()=>change(false,true));
    backdrop?.addEventListener('click',()=>change(false,true));
    sidebar.querySelectorAll('a[href]').forEach(a=>a.addEventListener('click',()=>change(false)));
    document.addEventListener('keydown',keydown);
    desktop.addEventListener?.('change',resize);
    change(false);
    navigationCleanup=()=>{document.removeEventListener('keydown',keydown);desktop.removeEventListener?.('change',resize);change(false);};
}
export function initializeUi(){
    const root=document.documentElement;
    let frame=0;
    const updateViewport=()=>{
        const viewport=window.visualViewport;
        if(viewport&&Math.abs(viewport.scale-1)>.01)return; // Preserva zoom do usuário.
        const height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
        root.style.setProperty('--visual-height',height+'px');
        root.style.setProperty('--visual-top',top+'px');
        root.style.setProperty('--keyboard-bottom',Math.max(0,window.innerHeight-height-top)+'px');
    };
    const observed=new Set(),observer=typeof window.ResizeObserver==='function'?new window.ResizeObserver(()=>schedule()):null;
    const updateTables=()=>{
        for(const el of observed)if(!el.isConnected){observer?.unobserve(el);observed.delete(el);}
        document.querySelectorAll('.table-wrap').forEach(wrap=>{
            if(!observed.has(wrap)){observed.add(wrap);observer?.observe(wrap);}
            const overflow=wrap.scrollWidth>wrap.clientWidth+1;
            wrap.dataset.overflow=String(overflow);
            if(overflow){
                wrap.tabIndex=0;wrap.setAttribute('role','region');
                wrap.setAttribute('aria-label',(wrap.closest('.card')?.querySelector('h2')?.textContent||'Tabela de dados')+'. Role na horizontal para ver todas as colunas.');
            }else{wrap.removeAttribute('tabindex');wrap.removeAttribute('role');wrap.removeAttribute('aria-label');}
            let hint=wrap.nextElementSibling;
            if(!hint?.classList.contains('table-hint')){hint=document.createElement('p');hint.className='table-hint';hint.textContent='Deslize a tabela para ver todas as colunas.';hint.setAttribute('aria-hidden','true');wrap.after(hint);}
            hint.hidden=!overflow;
            wrap.querySelectorAll('th').forEach(th=>th.scope='col');
            const cards=wrap.querySelector('.results-table');
            if(cards){
                cards.setAttribute('role','table');
                cards.querySelectorAll('thead,tbody').forEach(el=>el.setAttribute('role','rowgroup'));
                cards.querySelectorAll('tr').forEach(el=>el.setAttribute('role','row'));
                cards.querySelectorAll('th').forEach(el=>el.setAttribute('role','columnheader'));
                cards.querySelectorAll('td').forEach(el=>el.setAttribute('role','cell'));
            }
        });
        const modal=document.querySelector('dialog');
        root.classList.toggle('modal-open',!!modal?.open);
        if(modal?.open)describeModal(modal);
    };
    function schedule(){if(frame)return;frame=window.requestAnimationFrame(()=>{frame=0;updateViewport();updateTables();});}
    if(typeof window.MutationObserver==='function')new window.MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    window.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    document.addEventListener('close',schedule,true);
    document.addEventListener('focusin',event=>{
        if(window.visualViewport?.height<500&&event.target.matches('input,select,textarea'))window.setTimeout(()=>event.target.isConnected&&event.target.scrollIntoView({block:'nearest'}),100);
    });
    updateViewport();schedule();
}
