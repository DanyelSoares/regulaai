/* RegulaAI — Módulo Relatórios (BI / Inteligência Assistencial)
 * Isolado do restante do sistema. Expõe window.RELATORIOS.view(ctx).
 * ctx fornece helpers do app principal: { el, ico, esc, guias, State }.
 * Fase 1: estrutura completa (11 abas navegáveis) + placeholders.
 */
(function(global){

  // Abas do módulo, na ordem solicitada
  var TABS = [
    {id:'executivo',   label:'Painel Executivo', ico:'layout-dashboard'},
    {id:'beneficiarios',label:'Beneficiários',   ico:'users'},
    {id:'medicos',     label:'Médicos Solicitantes', ico:'stethoscope'},
    {id:'prestadores', label:'Prestadores',      ico:'hospital'},
    {id:'procedimentos',label:'Procedimentos',   ico:'clipboard-list'},
    {id:'opme',        label:'OPME',             ico:'bone'},
    {id:'custos',      label:'Custos',           ico:'dollar-sign'},
    {id:'alertas',     label:'Alertas Inteligentes', ico:'bell-ring'},
    {id:'tendencias',  label:'Tendências',       ico:'trending-up'},
    {id:'comparativos',label:'Comparativos',     ico:'git-compare'},
    {id:'exportacoes', label:'Exportações',      ico:'download'}
  ];

  var _state = { tab: 'executivo' };

  // ── Helpers de placeholder ────────────────────────────────────────
  function ctxRef(){ return global.__RELCTX || {}; }
  function ico(n,s){ var c=ctxRef(); return c.ico?c.ico(n,s||14):''; }
  function esc(t){ var c=ctxRef(); return c.esc?c.esc(t):(''+t); }
  function el(tag,attrs,html){ var c=ctxRef(); return c.el(tag,attrs,html); }

  // Card de KPI simples (placeholder com valor)
  function kpiCard(titulo, valor, sub, cor, tip, gotoTab){
    var infoIco = tip ? ' <span class="rel-kpi-info" title="'+esc(tip)+'">'+ico('info',11)+'</span>' : '';
    var clsClick = gotoTab ? ' rel-kpi-click' : '';
    var attrGoto = gotoTab ? ' data-goto="'+gotoTab+'"' : '';
    var subHtml = sub ? '<div class="rel-kpi-s">'+sub+(gotoTab?' '+ico('arrow-right',11):'')+'</div>' : '';
    return '<div class="rel-kpi'+clsClick+'"'+attrGoto+(tip?' title="'+esc(tip)+'"':'')+'>'+
      '<div class="rel-kpi-v" style="color:'+(cor||'var(--g-700)')+'">'+valor+'</div>'+
      '<div class="rel-kpi-t">'+esc(titulo)+infoIco+'</div>'+
      subHtml+
    '</div>';
  }

  // ═══════════════════════════════════════════════════════════════
  // NÚCLEO ANALÍTICO — processa as guias uma vez e gera custos,
  // agregações por entidade e os alertas detectados. Resultado em cache.
  // ═══════════════════════════════════════════════════════════════
  var _cache = null;

  // Hash determinístico simples (custos estáveis entre renders)
  function seed(str){ var h=0,s=''+str; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  function moeda(v){ return 'R$ ' + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function moedaK(v){ // compacto p/ KPIs
    if(v>=1e6) return 'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';
    if(v>=1e3) return 'R$ '+(v/1e3).toLocaleString('pt-BR',{maximumFractionDigits:0})+' mil';
    return moeda(v);
  }
  // Formata a(s) guia(s) de um item: nº único, ou 1ª + "(+N)" com todas no title
  function fmtGuias(gs){
    gs=gs||[];
    if(!gs.length) return '—';
    if(gs.length===1) return esc(gs[0]);
    return '<span title="'+esc(gs.join(', '))+'">'+esc(gs[0])+' <span style="color:var(--muted)">(+'+(gs.length-1)+')</span></span>';
  }

  // Custo simulado de um procedimento/OPME a partir do código (determinístico)
  function custoProc(p){
    var base = 180 + (seed(p.cod) % 4200);           // 180 .. 4380
    if(/UTI|Diária/i.test(p.desc||'')) base += 1200;  // diárias mais caras
    return base;
  }
  function custoOpme(m){
    // OPME tem faixa maior; "autorizado" x "cobrado" com variação por código
    var aut = 3500 + (seed(m.cod) % 38000);           // 3.5k .. 41.5k
    var varPct = ((seed(m.cod+'v') % 60) - 10) / 100; // -10% .. +50%
    var cob = Math.round(aut * (1 + varPct));
    return {autorizado:aut, cobrado:cob, varPct:Math.round(varPct*100), fornecedor:fornecedorOpme(m.cod)};
  }

  // Fornecedor simulado (determinístico por código do OPME)
  var FORNECEDORES = ['MedSupply Distribuidora','OrtoTech Brasil','CardioMed Implantes','BioImplante Ltda','Global OPME','Nordeste Materiais Médicos','Prime Health Supply'];
  function fornecedorOpme(cod){ return FORNECEDORES[seed('forn'+cod) % FORNECEDORES.length]; }

  // Custo do Mat/Med não-OPME (mesma base do detalhamento, p/ o total bater)
  function custoMatmed(m){
    if(window.MOCK&&window.MOCK.matmedDetalhe){ var x=window.MOCK.matmedDetalhe(m); return x.totalAutorizado||0; }
    return 400 + seed(m.cod)%6000;
  }
  function custoGuia(g){
    var total = 0;
    (g.procedimentos||[]).forEach(function(p){ total += custoProc(p); });
    (g.matmed||[]).forEach(function(m){ total += m.opme ? custoOpme(m).cobrado : custoMatmed(m); });
    (g.diariasTaxas||[]).forEach(function(d){ total += 150 + seed(d.cod)%900; });
    if(g.uti) total += 2400 * (1 + (g.diasAuditoria||1)%4); // UTI pesa
    return total;
  }

  // Constrói (e cacheia) o modelo analítico a partir das guias do contexto
  function analitico(){
    if(_cache) return _cache;
    var guias = (ctxRef().guias) || [];
    var porBenef={}, porMedico={}, porPrestador={}, porProc={}, porOpme={};
    var totalCusto=0, custoNegado=0, qtdNegadas=0, servNegados=0, qtdEmAberto=0;
    var riscoCnt={baixo:0,medio:0,alto:0,critico:0};
    var ABERTO={'Em análise':1,'Aguardando complemento':1,'Em junta médica':1,'Cotação de OPME':1};

    guias.forEach(function(g){
      var c = custoGuia(g);
      totalCusto += c;
      // Métricas REAIS (sem estimativa arbitrária):
      if(g.status==='Negada'){
        qtdNegadas++; custoNegado+=c;
        // serviços não autorizados = procedimentos + OPME da guia negada
        servNegados += (g.procedimentos||[]).length + (g.matmed||[]).filter(function(m){return m.opme;}).length;
      }
      if(ABERTO[g.status]) qtdEmAberto++;                        // ainda sujeitas a decisão
      if(riscoCnt[g.risco]!=null) riscoCnt[g.risco]++;

      // Beneficiário
      var bid = g.beneficiario && g.beneficiario.id || '?';
      var b = porBenef[bid] || (porBenef[bid]={id:bid,nome:(g.beneficiario&&g.beneficiario.nome)||'—',idade:(g.beneficiario&&g.beneficiario.idade)||null,guias:0,custo:0,opme:0,medicos:{},prestadores:{},procs:0,negadas:0,internacoes:0,altoRisco:0});
      b.guias++; b.custo+=c; b.opme+=(g.matmed||[]).filter(function(m){return m.opme;}).length;
      b.procs+=(g.procedimentos||[]).length;
      if(g.status==='Negada') b.negadas++;
      if(g.tipo&&/Interna/i.test(g.tipo)) b.internacoes++;
      if(g.risco==='alto'||g.risco==='critico') b.altoRisco++;
      if(g.solicitante) b.medicos[g.solicitante]=1;
      if(g.prestadorExe&&g.prestadorExe.nome) b.prestadores[g.prestadorExe.nome]=1;

      // Médico solicitante
      var med = g.solicitante || '—';
      var m = porMedico[med] || (porMedico[med]={nome:med,guias:0,custo:0,benefs:{},prestadores:{},opme:0,negadas:0,aprovadas:0,guiasRef:[]});
      m.guias++; m.custo+=c; m.benefs[bid]=1; m.guiasRef.push(g);
      if(g.prestadorExe&&g.prestadorExe.nome) m.prestadores[g.prestadorExe.nome]=1;
      m.opme+=(g.matmed||[]).filter(function(x){return x.opme;}).length;
      if(g.status==='Negada') m.negadas++;
      if(g.status==='Liberada'||g.status==='Analisada') m.aprovadas++;

      // Prestador executante
      var pn = g.prestadorExe && g.prestadorExe.nome || '—';
      var pr = porPrestador[pn] || (porPrestador[pn]={nome:pn,guias:0,custo:0,opme:0,medicos:{},internacoes:0,guiasRef:[]});
      pr.guias++; pr.custo+=c; pr.opme+=(g.matmed||[]).filter(function(x){return x.opme;}).length; pr.guiasRef.push(g);
      if(g.solicitante) pr.medicos[g.solicitante]=1;
      if(g.tipo&&/Interna/i.test(g.tipo)) pr.internacoes++;

      // Procedimentos
      (g.procedimentos||[]).forEach(function(p){
        var pp=porProc[p.cod]||(porProc[p.cod]={cod:p.cod,desc:p.desc,qtd:0,custo:0,negadas:0});
        pp.qtd++; pp.custo+=custoProc(p);
        if(g.status==='Negada') pp.negadas++;
      });

      // OPME
      (g.matmed||[]).forEach(function(mm){
        if(!mm.opme) return;
        var oc=custoOpme(mm);
        var oo=porOpme[mm.cod]||(porOpme[mm.cod]={cod:mm.cod,desc:mm.desc,fornecedor:oc.fornecedor,qtd:0,autorizado:0,cobrado:0,varMax:0,benefs:{},medicos:{},guias:[],guiasRef:[]});
        oo.qtd++; oo.autorizado+=oc.autorizado; oo.cobrado+=oc.cobrado;
        oo.varMax=Math.max(oo.varMax,oc.varPct);
        oo.benefs[bid]=1; if(g.solicitante) oo.medicos[g.solicitante]=1;
        if(oo.guias.indexOf(g.numero)<0){ oo.guias.push(g.numero); oo.guiasRef.push(g); }
      });
    });

    function toArr(obj,extra){ return Object.keys(obj).map(function(k){ var o=obj[k]; if(extra) extra(o); return o; }); }
    function clamp(v){ return Math.max(0,Math.min(100,Math.round(v))); }
    var benefs=toArr(porBenef,function(o){
      o.nMedicos=Object.keys(o.medicos).length; o.nPrestadores=Object.keys(o.prestadores).length;
      o.custoMedio=o.guias?Math.round(o.custo/o.guias):0;
      // score de risco do beneficiário: recorrência + alto risco + OPME + negativas
      o.score=clamp(o.guias*12 + o.altoRisco*18 + o.opme*10 + o.negadas*8 + (o.nPrestadores>1?10:0));
    });
    var medicos=toArr(porMedico,function(o){
      o.nBenefs=Object.keys(o.benefs).length; o.nPrestadores=Object.keys(o.prestadores).length;
      o.taxaAprov=o.guias?Math.round(o.aprovadas/o.guias*100):0;
      o.taxaNeg=o.guias?Math.round(o.negadas/o.guias*100):0;
      o.custoMedio=o.guias?Math.round(o.custo/o.guias):0;
      // score de risco do médico: concentração + volume + OPME + negativas
      o.score=clamp((o.nPrestadores===1&&o.guias>1?35:0) + o.guias*8 + o.opme*9 + o.taxaNeg*0.4);
    });
    var prestadores=toArr(porPrestador,function(o){
      o.nMedicos=Object.keys(o.medicos).length; o.custoMedio=o.guias?Math.round(o.custo/o.guias):0;
      o.score=clamp(o.opme*10 + (o.nMedicos===1&&o.guias>1?25:0) + o.internacoes*8);
    });
    var procs=toArr(porProc,function(o){o.custoMedio=o.qtd?Math.round(o.custo/o.qtd):0;o.taxaNeg=o.qtd?Math.round(o.negadas/o.qtd*100):0;});
    var opmes=toArr(porOpme,function(o){o.varPreco=o.autorizado?Math.round((o.cobrado-o.autorizado)/o.autorizado*100):0;o.nBenefs=Object.keys(o.benefs).length;o.nMedicos=Object.keys(o.medicos).length;o.score=clamp(Math.max(0,o.varPreco)*1.2 + o.qtd*8);});

    _cache = {
      guias:guias, totalGuias:guias.length, totalCusto:totalCusto,
      custoNegado:custoNegado, qtdNegadas:qtdNegadas, servNegados:servNegados, qtdEmAberto:qtdEmAberto, riscoCnt:riscoCnt,
      benefs:benefs, medicos:medicos, prestadores:prestadores, procs:procs, opmes:opmes
    };
    _cache.alertas = detectarAlertas(_cache);
    return _cache;
  }

  // ── Motor de detecção de alertas (varre as agregações) ────────────
  function detectarAlertas(M){
    var out=[], idn=0;
    function novo(o){ o.id='AL-'+String(++idn).padStart(4,'0'); o.status=o.status||'novo'; out.push(o); }

    // 1) Concentração: médico que concentra >=60% das guias num único prestador
    M.medicos.forEach(function(m){
      if(m.guias<2) return;
      if(m.nPrestadores===1){
        novo({sev:'alta',tipo:'concentracao',score:80+Math.min(15,m.guias*3),medico:m.nome,
          prestador:Object.keys(M.prestadores).length?primeiroPrestadorDoMedico(M,m.nome):'—',
          valor:moeda(m.custo),benef:'Vários',guia:'—',
          desc:'Médico '+m.nome+' concentra 100% das '+m.guias+' solicitações em um único prestador.',
          acao:'Encaminhar para auditoria médica'});
      }
    });
    // 2) Recorrência: beneficiário com >=2 guias no período
    M.benefs.forEach(function(b){
      if(b.guias>=2){
        novo({sev:b.guias>=3?'alta':'media',tipo:'recorrencia',score:60+b.guias*8,medico:'Diversos',
          prestador:'—',valor:moeda(b.custo),benef:b.nome,guia:'—',
          desc:'Beneficiário '+b.nome+' possui '+b.guias+' guias no período, com '+b.nMedicos+' médico(s) e '+b.nPrestadores+' prestador(es) distintos.',
          acao:'Verificar pertinência e possível fracionamento'});
      }
    });
    // 3) Alto custo: guias de risco crítico/alto com custo elevado
    M.guias.forEach(function(g){
      var c=custoGuia(g);
      if((g.risco==='critico'||g.risco==='alto') && c>20000){
        novo({sev:g.risco==='critico'?'critica':'alta',tipo:'alto_custo',score:c>40000?95:85,
          medico:g.solicitante||'—',prestador:(g.prestadorExe&&g.prestadorExe.nome)||'—',
          valor:moeda(c),benef:(g.beneficiario&&g.beneficiario.nome)||'—',guia:g.numero,
          desc:'Guia '+g.numero+' ('+g.tipo+', risco '+g.risco+') com custo estimado de '+moeda(c)+', acima do limiar de R$ 20.000.',
          acao:'Revisão por junta médica'});
      }
    });
    // 4) Inconsistência de OPME: variação de preço autorizado x cobrado alta
    M.opmes.forEach(function(o){
      if(o.varPreco>=25){
        novo({sev:o.varPreco>=40?'alta':'media',tipo:'inconsistencia_opme',score:70+Math.min(25,o.varPreco),
          medico:Object.keys(o.medicos)[0]||'—',prestador:'—',valor:moeda(o.cobrado-o.autorizado),
          benef:o.nBenefs+' beneficiário(s)',guia:'—',
          desc:'OPME '+o.cod+' ('+o.desc+') com preço cobrado '+o.varPreco+'% acima do autorizado — acima do percentil parametrizado.',
          acao:'Solicitar cotação de 3 fornecedores'});
      }
    });

    // ordena por score desc e adiciona data
    out.sort(function(a,b){return b.score-a.score;});
    var hoje=new Date();
    out.forEach(function(a,i){ var d=new Date(hoje); d.setDate(hoje.getDate()-(i%5)); a.data=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); });
    return out;
  }
  function primeiroPrestadorDoMedico(M,nome){
    for(var i=0;i<M.guias.length;i++){ if(M.guias[i].solicitante===nome && M.guias[i].prestadorExe) return M.guias[i].prestadorExe.nome; }
    return '—';
  }

  // Tabela de ranking genérica. opts.scroll=true → corpo com altura fixa e rolagem.
  function rankTable(titulo, cols, rows, opts){
    opts=opts||{};
    var head=cols.map(function(c){return '<th'+(c.num?' style="text-align:right"':'')+'>'+esc(c.h)+'</th>';}).join('');
    var body=rows.map(function(r,i){
      // opts.rowDrill: função (r,i) → chave para abrir detalhe; torna a linha clicável
      var drill = opts.rowDrill ? opts.rowDrill(r,i) : null;
      var trAttr = drill!=null ? ' class="rel-rank-row" data-drill="'+esc(drill)+'"' : '';
      return '<tr'+trAttr+'>'+cols.map(function(c){ var v=c.f(r,i); return '<td'+(c.num?' style="text-align:right"':'')+'>'+v+'</td>'; }).join('')+'</tr>';
    }).join('');
    var hd='<div class="rel-card-hd">'+esc(titulo)+(opts.count?'<span class="rel-card-count">'+rows.length+'</span>':'')+'</div>';
    // No modo scroll usamos só .rel-scroll (sem .table-wrap, que tem overflow:hidden e cortaria a barra)
    var wrapCls = opts.scroll ? 'rel-scroll' : 'table-wrap';
    return '<div class="rel-card">'+hd+
      '<div class="'+wrapCls+'"><table class="cfg-table'+(opts.scroll?' rel-sticky-head':'')+'"><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }
  // Selo de score (0-100) com cor por faixa
  function scoreBadge(s){
    var cor = s>=70?'#b91c1c':(s>=45?'#c2410c':(s>=25?'#a16207':'#16a34a'));
    var bg  = s>=70?'#fee2e2':(s>=45?'#ffedd5':(s>=25?'#fef9c3':'#dcfce7'));
    return '<span class="rel-score" style="color:'+cor+';background:'+bg+'">'+s+'</span>';
  }
  // Mini barra de distribuição
  function distRow(label, valor, max, cor){
    var pct=max?Math.round(valor/max*100):0;
    return '<div class="rel-dist-row"><span class="rel-dist-lbl">'+esc(label)+'</span>'+
      '<span class="rel-dist-bar"><span style="width:'+pct+'%;background:'+(cor||'var(--g-500)')+'"></span></span>'+
      '<span class="rel-dist-val">'+valor+'</span></div>';
  }

  // Bloco "em construção" padrão para abas ainda não preenchidas
  function emBreve(titulo, descricao, itens){
    var lista = (itens||[]).map(function(i){ return '<li>'+esc(i)+'</li>'; }).join('');
    return '<div class="rel-section">'+
      '<div class="rel-soon">'+
        '<div class="rel-soon-ico">'+ico('hammer',26)+'</div>'+
        '<h3>'+esc(titulo)+'</h3>'+
        '<p>'+esc(descricao)+'</p>'+
        (lista?'<div class="rel-soon-list"><div class="rel-soon-list-hd">Conteúdo previsto:</div><ul>'+lista+'</ul></div>':'')+
      '</div>'+
    '</div>';
  }

  // ── Conteúdo por aba (Fase 1: placeholders com escopo previsto) ───
  function renderTab(id){
    if(id==='executivo') return renderExecutivo();
    if(id==='custos') return renderCustos();
    if(id==='opme') return renderOpme();
    return renderTabResto(id);
  }

  function renderTabResto(id){
    if(id==='beneficiarios') return renderBeneficiarios();
    if(id==='medicos') return renderMedicos();
    if(id==='prestadores') return renderPrestadores();
    if(id==='procedimentos') return renderProcedimentos();
    if(id==='alertas') return renderAlertas();
    if(id==='tendencias') return renderTendencias();
    if(id==='comparativos') return renderComparativos();
    if(id==='exportacoes') return renderExportacoes();
    return '';
  }

  // ── Beneficiários ─────────────────────────────────────────────────
  function renderBeneficiarios(){
    var M=analitico();
    var bs=M.benefs.slice().sort(function(a,b){return b.score-a.score;});
    var comRec=bs.filter(function(b){return b.guias>=2;}).length;
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Beneficiários',bs.length,'no período','var(--g-700)')+
      kpiCard('Com recorrência',comRec,'≥2 guias','#c2410c')+
      kpiCard('Custo médio/benef.',moeda(bs.length?Math.round(M.totalCusto/bs.length):0),'','#0f766e')+
      kpiCard('Maior score',bs.length?bs[0].score:0,bs.length?bs[0].nome:'','#b91c1c')+
    '</div>';
    var tab=rankTable('Beneficiários — visão consolidada',[
      {h:'Beneficiário',f:function(r){return esc(r.nome)+(r.idade?' <span style="color:var(--muted)">('+r.idade+')</span>':'');}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Proc.',num:true,f:function(r){return r.procs;}},
      {h:'OPME',num:true,f:function(r){return r.opme;}},
      {h:'Médicos',num:true,f:function(r){return r.nMedicos;}},
      {h:'Negadas',num:true,f:function(r){return r.negadas;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}},
      {h:'Score',num:true,f:function(r){return scoreBadge(r.score);}}
    ],bs);
    return '<div class="rel-section">'+notaSim()+kpis+tab+'</div>';
  }

  // ── Médicos Solicitantes ──────────────────────────────────────────
  function renderMedicos(){
    var M=analitico();
    var ms=M.medicos.slice().sort(function(a,b){return b.score-a.score;});
    var mediaGuias=ms.length?(M.totalGuias/ms.length):0;
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Médicos solicitantes',ms.length,'no período','var(--g-700)')+
      kpiCard('Volume médio',mediaGuias.toFixed(1),'guias/médico','#0f766e')+
      kpiCard('Acima da média',ms.filter(function(m){return m.guias>mediaGuias;}).length,'volume','#c2410c')+
      kpiCard('Maior score',ms.length?ms[0].score:0,ms.length?ms[0].nome:'','#b91c1c')+
    '</div>';
    var tab=rankTable('Médicos — perfil de solicitação',[
      {h:'Médico',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Benef.',num:true,f:function(r){return r.nBenefs;}},
      {h:'Prest.',num:true,f:function(r){return r.nPrestadores+(r.nPrestadores===1&&r.guias>1?' ⚠':'');}},
      {h:'OPME',num:true,f:function(r){return r.opme;}},
      {h:'Aprov.',num:true,f:function(r){return r.taxaAprov+'%';}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}},
      {h:'Score',num:true,f:function(r){return scoreBadge(r.score);}}
    ],ms);
    var nota='<div class="rel-note">'+ico('info',13)+' <span>O símbolo ⚠ indica médico com <b>todas as solicitações concentradas em um único prestador</b> (gera alerta de concentração). Comparação por especialidade entra na próxima fase (requer cadastro de especialidade do médico).</span></div>';
    return '<div class="rel-section">'+notaSim()+kpis+nota+tab+'</div>';
  }

  // ── Prestadores ───────────────────────────────────────────────────
  function renderPrestadores(){
    var M=analitico();
    var ps=M.prestadores.slice().sort(function(a,b){return b.custo-a.custo;});
    var custoMedioGeral=ps.length?Math.round(M.totalCusto/M.totalGuias):0;
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Prestadores',ps.length,'no período','var(--g-700)')+
      kpiCard('Custo médio/guia',moeda(custoMedioGeral),'geral','#0f766e')+
      kpiCard('Acima da média',ps.filter(function(p){return p.custoMedio>custoMedioGeral;}).length,'custo/guia','#c2410c')+
      kpiCard('Maior custo',ps.length?moedaK(ps[0].custo):'R$ 0',ps.length?ps[0].nome:'','#b91c1c')+
    '</div>';
    var tab=rankTable('Prestadores — visão consolidada',[
      {h:'Prestador',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Internações',num:true,f:function(r){return r.internacoes;}},
      {h:'OPME',num:true,f:function(r){return r.opme;}},
      {h:'Médicos',num:true,f:function(r){return r.nMedicos+(r.nMedicos===1&&r.guias>1?' ⚠':'');}},
      {h:'Custo médio',num:true,f:function(r){var alto=r.custoMedio>custoMedioGeral;return '<span style="'+(alto?'color:#c2410c;font-weight:700':'')+'">'+moeda(r.custoMedio)+'</span>';}},
      {h:'Custo total',num:true,f:function(r){return moeda(r.custo);}},
      {h:'Score',num:true,f:function(r){return scoreBadge(r.score);}}
    ],ps);
    return '<div class="rel-section">'+notaSim()+kpis+tab+'</div>';
  }

  // ── Procedimentos ─────────────────────────────────────────────────
  function renderProcedimentos(){
    var M=analitico();
    var pr=M.procs.slice();
    var maisSolic=pr.slice().sort(function(a,b){return b.qtd-a.qtd;}).slice(0,5);
    var maisCaros=pr.slice().sort(function(a,b){return b.custoMedio-a.custoMedio;}).slice(0,5);
    var maisNeg=pr.slice().sort(function(a,b){return b.taxaNeg-a.taxaNeg;}).slice(0,5);
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Procedimentos distintos',pr.length,'no período','var(--g-700)')+
      kpiCard('Total solicitado',pr.reduce(function(s,p){return s+p.qtd;},0),'ocorrências','#0f766e')+
      kpiCard('Mais caro',maisCaros.length?moeda(maisCaros[0].custoMedio):'R$ 0','médio','#b45309')+
      kpiCard('Maior negativa',maisNeg.length?maisNeg[0].taxaNeg+'%':'0%',maisNeg.length?maisNeg[0].cod:'','#b91c1c')+
    '</div>';
    var rkA=rankTable('Mais solicitados',[
      {h:'Procedimento',f:function(r){return esc(r.desc);}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}}
    ],maisSolic);
    var rkB=rankTable('Mais caros (custo médio)',[
      {h:'Procedimento',f:function(r){return esc(r.desc);}},
      {h:'Custo médio',num:true,f:function(r){return moeda(r.custoMedio);}}
    ],maisCaros);
    var tab=rankTable('Procedimentos — visão completa',[
      {h:'Código',f:function(r){return esc(r.cod);}},
      {h:'Descrição',f:function(r){return esc(r.desc);}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}},
      {h:'Negadas',num:true,f:function(r){return r.negadas;}},
      {h:'Taxa neg.',num:true,f:function(r){return r.taxaNeg+'%';}},
      {h:'Custo total',num:true,f:function(r){return moeda(r.custo);}}
    ],pr.sort(function(a,b){return b.custo-a.custo;}));
    return '<div class="rel-section">'+notaSim()+kpis+'<div class="rel-grid2">'+rkA+rkB+'</div>'+tab+'</div>';
  }

  function notaSim(){ return '<div class="rel-note">'+ico('info',13)+' <span>Análise sobre as guias do período. <b>Valores em R$ são simulados</b> (determinísticos por código) para demonstração.</span></div>'; }

  // ── Tendências (honesto: base de 1 mês) ───────────────────────────
  function renderTendencias(){
    var M=analitico();
    // Distribui as guias por dia de emissão (único campo temporal disponível)
    var porDia={};
    M.guias.forEach(function(g){ var d=(g.dataEmissao||'').slice(-2)||'?'; porDia[d]=(porDia[d]||0)+1; });
    var dias=Object.keys(porDia).sort();
    var maxD=Math.max.apply(null,dias.map(function(d){return porDia[d];}).concat([1]));
    var serie=dias.map(function(d){return distRow('Dia '+d, porDia[d], maxD, 'var(--g-500)');}).join('');
    return '<div class="rel-section">'+
      '<div class="rel-note">'+ico('alert-triangle',13)+' <span><b>Dados insuficientes para tendência real:</b> a base atual cobre um único período (mesmo mês). Evolução mensal, sazonalidade e previsão exigem histórico de vários meses. Abaixo, a distribuição diária do período disponível como demonstração.</span></div>'+
      '<div class="rel-card"><div class="rel-card-hd">Guias por dia de emissão (período atual)</div><div style="padding:8px 14px 14px">'+(serie||'<div style="padding:14px;color:var(--muted);font-size:12.5px">Sem dados.</div>')+'</div></div>'+
      emBreve('Tendências — requer histórico','Quando houver dados de múltiplos meses, esta aba mostrará:',['Evolução mensal de guias e de custo','Crescimento/redução percentual','Sazonalidade por procedimento/especialidade','Projeção e tendência futura'])+
    '</div>';
  }

  // ── Comparativos (entidade x média do grupo) ──────────────────────
  function renderComparativos(){
    var M=analitico();
    var ms=M.medicos.slice().sort(function(a,b){return b.guias-a.guias;});
    var ps=M.prestadores.slice().sort(function(a,b){return b.custo-a.custo;});
    var mediaGuiasMed=ms.length?(M.totalGuias/ms.length):0;
    var mediaCustoMed=ms.length?(M.totalCusto/ms.length):0;
    var mediaCustoPrest=ps.length?(M.totalCusto/ps.length):0;

    function barCompare(label, valor, media, fmt){
      var max=Math.max(valor,media,1);
      var f=fmt||function(x){return x;};
      return '<div class="rel-cmp">'+
        '<div class="rel-cmp-lbl">'+esc(label)+'</div>'+
        '<div class="rel-cmp-bars">'+
          '<div class="rel-cmp-row"><span>Este</span><span class="rel-cmp-bar"><span style="width:'+Math.round(valor/max*100)+'%;background:var(--g-600)"></span></span><b>'+f(valor)+'</b></div>'+
          '<div class="rel-cmp-row"><span>Média</span><span class="rel-cmp-bar"><span style="width:'+Math.round(media/max*100)+'%;background:var(--g-300)"></span></span><b>'+f(Math.round(media))+'</b></div>'+
        '</div>'+
        '<div class="rel-cmp-delta '+(valor>media?'up':'down')+'">'+(valor>media?'▲ ':'▼ ')+Math.abs(Math.round((valor-media)/(media||1)*100))+'% vs. média</div>'+
      '</div>';
    }
    var topMed=ms[0], topPrest=ps[0];
    var cmpMed = topMed ? '<div class="rel-card"><div class="rel-card-hd">'+esc(topMed.nome)+' vs. média dos médicos</div><div style="padding:12px 16px">'+
        barCompare('Volume de guias', topMed.guias, mediaGuiasMed)+
        barCompare('Custo total', topMed.custo, mediaCustoMed, moeda)+
      '</div></div>' : '';
    var cmpPrest = topPrest ? '<div class="rel-card"><div class="rel-card-hd">'+esc(topPrest.nome)+' vs. média dos prestadores</div><div style="padding:12px 16px">'+
        barCompare('Custo total', topPrest.custo, mediaCustoPrest, moeda)+
        barCompare('Custo médio/guia', topPrest.custoMedio, mediaCustoPrest/(topPrest.guias||1), moeda)+
      '</div></div>' : '';
    return '<div class="rel-section">'+
      '<div class="rel-note">'+ico('info',13)+' <span>Comparativos do destaque de cada grupo contra a <b>média do próprio grupo</b>. Comparação por especialidade e contra referência de mercado entram quando esses cadastros existirem.</span></div>'+
      '<div class="rel-grid2">'+cmpMed+cmpPrest+'</div>'+
    '</div>';
  }

  // ── Exportações (CSV real do que está agregado) ───────────────────
  function renderExportacoes(){
    return '<div class="rel-section">'+
      '<div class="rel-note">'+ico('info',13)+' <span>Exporte os dados consolidados do período em <b>CSV</b> (abre no Excel). PDF e agendamento entram em fase futura.</span></div>'+
      '<div class="rel-card"><div class="rel-card-hd">Conjuntos disponíveis para exportação</div>'+
      '<div class="rel-export-grid">'+
        exportBtn('alertas','Alertas detectados','bell-ring')+
        exportBtn('beneficiarios','Beneficiários','users')+
        exportBtn('medicos','Médicos solicitantes','stethoscope')+
        exportBtn('prestadores','Prestadores','hospital')+
        exportBtn('procedimentos','Procedimentos','clipboard-list')+
        exportBtn('opme','OPME','bone')+
      '</div></div>'+
    '</div>';
  }
  function exportBtn(tipo,label,icone){
    return '<button class="rel-export-btn" data-export="'+tipo+'">'+ico(icone,16)+' <span>'+esc(label)+'</span>'+ico('download',14)+'</button>';
  }

  // Gera e baixa um CSV do conjunto pedido
  function exportarCSV(tipo){
    var M=analitico(); var rows=[], head=[];
    if(tipo==='alertas'){ head=['ID','Data','Guia','Medico','Severidade','Tipo','Score','Valor','Status','Descricao']; rows=M.alertas.map(function(a){return [a.id,a.data,a.guia,a.medico,SEV_LBL[a.sev],TIPO_LBL[a.tipo]||a.tipo,a.score,a.valor,STATUS_LBL[a.status]||a.status,a.desc];}); }
    else if(tipo==='beneficiarios'){ head=['Nome','Idade','Guias','Procedimentos','OPME','Medicos','Negadas','Custo','Score']; rows=M.benefs.map(function(b){return [b.nome,b.idade||'',b.guias,b.procs,b.opme,b.nMedicos,b.negadas,b.custo,b.score];}); }
    else if(tipo==='medicos'){ head=['Medico','Guias','Beneficiarios','Prestadores','OPME','TaxaAprov','Custo','Score']; rows=M.medicos.map(function(m){return [m.nome,m.guias,m.nBenefs,m.nPrestadores,m.opme,m.taxaAprov+'%',m.custo,m.score];}); }
    else if(tipo==='prestadores'){ head=['Prestador','Guias','Internacoes','OPME','Medicos','CustoMedio','CustoTotal','Score']; rows=M.prestadores.map(function(p){return [p.nome,p.guias,p.internacoes,p.opme,p.nMedicos,p.custoMedio,p.custo,p.score];}); }
    else if(tipo==='procedimentos'){ head=['Codigo','Descricao','Qtd','Negadas','TaxaNeg','CustoTotal','CustoMedio']; rows=M.procs.map(function(p){return [p.cod,p.desc,p.qtd,p.negadas,p.taxaNeg+'%',p.custo,p.custoMedio];}); }
    else if(tipo==='opme'){ head=['Codigo','Descricao','Guias','Fornecedor','Qtd','Autorizado','Cobrado','Variacao','Score']; rows=M.opmes.map(function(o){return [o.cod,o.desc,(o.guias||[]).join(' | '),o.fornecedor||'',o.qtd,o.autorizado,o.cobrado,o.varPreco+'%',o.score];}); }
    var csv=[head].concat(rows).map(function(r){return r.map(function(c){var s=(''+c).replace(/"/g,'""');return /[";\n]/.test(s)?'"'+s+'"':s;}).join(';');}).join('\r\n');
    var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a');
    a.href=url; a.download='relatorio-'+tipo+'-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── Painel Executivo (KPIs + rankings reais) ──────────────────────
  function renderExecutivo(){
    var M=analitico();
    var rc=M.riscoCnt;
    // Rankings completos (todos os registros), ordenados
    var rkMedicos=M.medicos.slice().sort(function(a,b){return b.guias-a.guias || b.custo-a.custo;});
    var rkPrestadores=M.prestadores.slice().sort(function(a,b){return b.custo-a.custo;});
    var rkOpmes=M.opmes.slice().sort(function(a,b){return b.cobrado-a.cobrado;});
    var maxRisco=Math.max(rc.baixo,rc.medio,rc.alto,rc.critico,1);

    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Guias recebidas',M.totalGuias,'entraram para análise','var(--g-700)',
        'Volume de guias que entraram para análise no período selecionado — independentemente do status atual (em análise, liberada, negada etc.).')+
      kpiCard('Custo total analisado',moedaK(M.totalCusto),'estimado','#0f766e',
        'Soma dos custos estimados de todos os procedimentos, OPME, diárias e UTI das guias do período. Valores simulados.')+
      kpiCard('Custo de serviços negados',moedaK(M.custoNegado),M.servNegados+' serviço(s) não autorizado(s)','#15803d',
        'Soma do custo estimado dos serviços (procedimentos e OPME) não autorizados no período — economia concreta já realizada pela auditoria. A contagem reflete os serviços das guias com status Negada.')+
      kpiCard('Alertas ativos',M.alertas.length,'Alertas Inteligentes','#dc2626',
        'Quantidade de alertas gerados pelo motor de detecção (concentração, recorrência, alto custo, inconsistência de OPME). Clique para abrir a aba Alertas Inteligentes.','alertas')+
    '</div>';

    var riscoKpis='<div class="rel-kpi-grid">'+
      kpiCard('Risco baixo',rc.baixo,'','#16a34a')+
      kpiCard('Risco médio',rc.medio,'','#a16207')+
      kpiCard('Risco alto',rc.alto,'','#c2410c')+
      kpiCard('Risco crítico',rc.critico,'','#b91c1c')+
    '</div>';

    var distRisco='<div class="rel-card"><div class="rel-card-hd">Distribuição por risco</div><div style="padding:6px 14px 12px">'+
      distRow('Baixo',rc.baixo,maxRisco,'#16a34a')+
      distRow('Médio',rc.medio,maxRisco,'#a16207')+
      distRow('Alto',rc.alto,maxRisco,'#c2410c')+
      distRow('Crítico',rc.critico,maxRisco,'#b91c1c')+
    '</div></div>';

    var rkMed=rankTable('Ranking de médicos por volume',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'Médico',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],rkMedicos,{scroll:true,count:true,rowDrill:function(r){return 'med:'+r.nome;}});
    var rkPrest=rankTable('Ranking de prestadores por custo',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'Prestador',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],rkPrestadores,{scroll:true,count:true,rowDrill:function(r){return 'prest:'+r.nome;}});
    var rkOpme=rankTable('Ranking de OPME por valor',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'OPME',f:function(r){return esc(r.desc);}},
      {h:'Guia',f:function(r){return fmtGuias(r.guias);}},
      {h:'Fornecedor',f:function(r){return esc(r.fornecedor||'—');}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}},
      {h:'Valor cobrado',num:true,f:function(r){return moeda(r.cobrado);}}
    ],rkOpmes,{scroll:true,count:true,rowDrill:function(r){return 'opme:'+r.cod;}});

    return '<div class="rel-section">'+
      kpis+ riscoKpis+ distRisco+
      '<div class="rel-grid2">'+rkMed+rkPrest+'</div>'+
      rkOpme+
    '</div>';
  }

  // ── Detalhe (modal) das guias de uma entidade do ranking ──────────
  function abrirDetalhe(drill){
    var M=analitico();
    var tipo=drill.split(':')[0], chave=drill.split(':').slice(1).join(':');
    var titulo='', sub='', ent=null;
    if(tipo==='med'){ ent=M.medicos.filter(function(x){return x.nome===chave;})[0]; titulo='Médico: '+chave; }
    else if(tipo==='prest'){ ent=M.prestadores.filter(function(x){return x.nome===chave;})[0]; titulo='Prestador: '+chave; }
    else if(tipo==='opme'){ ent=M.opmes.filter(function(x){return x.cod===chave;})[0]; titulo='OPME: '+(ent?ent.desc:chave); }
    if(!ent){ return; }
    var guias=ent.guiasRef||[];
    sub=guias.length+' guia(s) relacionada(s)';

    // Monta um bloco por guia, com seus procedimentos (código, nome, valor, qtd)
    var blocos=guias.map(function(g){
      // procedimentos: agrega por código (qtd) e soma valor
      // Procedimentos (agregados por código)
      var procMap={};
      (g.procedimentos||[]).forEach(function(p){
        var k=p.cod; if(!procMap[k]) procMap[k]={cod:p.cod,desc:p.desc,qtd:0,valor:0};
        procMap[k].qtd++; procMap[k].valor+=custoProc(p);
      });
      // OPME (separado dos procedimentos)
      var opmeMap={};
      (g.matmed||[]).forEach(function(m){ if(!m.opme) return; var k=m.cod; var oc=custoOpme(m);
        if(!opmeMap[k]) opmeMap[k]={cod:m.cod,desc:m.desc,forn:oc.fornecedor,qtd:0,valor:0}; opmeMap[k].qtd++; opmeMap[k].valor+=oc.cobrado; });
      // Mat/Med não-OPME (medicamentos/materiais) — com detalhamento Solus
      var matItens=[];
      (g.matmed||[]).forEach(function(m){ if(m.opme) return;
        matItens.push((window.MOCK&&window.MOCK.matmedDetalhe)?window.MOCK.matmedDetalhe(m):{cod:m.cod,desc:m.desc,qtdeSolic:1,unidade:'—',via:'—',vlrTabela:0,vlrAutorizado:0,totalAutorizado:(400+seed(m.cod)%6000),fornecido:'—'});
      });
      // Diárias e taxas (a Diária de UTI entra aqui — é uma diária, não seção à parte)
      var dtMap={};
      (g.diariasTaxas||[]).forEach(function(d){ var k=d.cod;
        if(!dtMap[k]) dtMap[k]={cod:d.cod,desc:d.desc,qtd:0,valor:0}; dtMap[k].qtd++; dtMap[k].valor+=(150 + seed(d.cod)%900); });
      if(g.uti){
        var utiDiarias=1+(g.diasAuditoria||1)%4;
        dtMap['UTI']={cod:'DIA-UTI',desc:'Diária de UTI',qtd:utiDiarias,valor:2400*utiDiarias};
      }

      function tab4(map, colDesc, emptyMsg){
        var ls=Object.keys(map).map(function(k){var p=map[k];
          return '<tr><td>'+esc(p.cod)+'</td><td>'+esc(p.desc)+'</td><td style="text-align:center">'+p.qtd+'</td><td style="text-align:right">'+moeda(p.valor)+'</td></tr>';
        }).join('');
        if(!ls) return '<div class="rel-drill-empty">'+esc(emptyMsg)+'</div>';
        return '<div class="table-wrap"><table class="cfg-table rel-drill-tab"><thead><tr><th>Código</th><th>'+esc(colDesc)+'</th><th style="text-align:center">Qtd</th><th style="text-align:right">Valor</th></tr></thead><tbody>'+ls+'</tbody></table></div>';
      }
      function tabOpme(){
        var ks=Object.keys(opmeMap);
        if(!ks.length) return '<div class="rel-drill-empty">Sem OPME nesta guia.</div>';
        var ls=ks.map(function(k){var o=opmeMap[k];
          return '<tr><td>'+esc(o.cod)+'</td><td>'+esc(o.desc)+'</td><td>'+esc(o.forn||'—')+'</td><td style="text-align:center">'+o.qtd+'</td><td style="text-align:right">'+moeda(o.valor)+'</td></tr>';
        }).join('');
        return '<div class="table-wrap"><table class="cfg-table rel-drill-tab"><thead><tr><th>Código</th><th>OPME</th><th>Fornecedor</th><th style="text-align:center">Qtd</th><th style="text-align:right">Valor</th></tr></thead><tbody>'+ls+'</tbody></table></div>';
      }

      // Só mostra as seções Mat/Med, Diárias/Taxas e UTI quando houver valor
      var temMat=matItens.length, temDt=Object.keys(dtMap).length;
      function tabMat(){
        var ls=matItens.map(function(x){
          return '<tr><td>'+esc(x.cod)+'</td><td>'+esc(x.desc)+'</td><td style="text-align:center">'+(x.qtdeSolic||1)+'</td>'+
            '<td>'+esc(x.unidade||'—')+'</td><td>'+esc(x.via||'—')+'</td>'+
            '<td style="text-align:right">'+moeda(x.vlrTabela||0)+'</td>'+
            '<td style="text-align:right">'+moeda(x.vlrAutorizado||0)+'</td>'+
            '<td style="text-align:right">'+moeda(x.totalAutorizado||0)+'</td>'+
            '<td style="font-size:11px">'+esc(x.fornecido||'—')+'</td></tr>';
        }).join('');
        return '<div class="table-wrap"><table class="cfg-table rel-drill-tab"><thead><tr>'+
          '<th>Código</th><th>Material/Medicamento</th><th style="text-align:center">Qtd Sol.</th><th>Unidade</th><th>Via</th>'+
          '<th style="text-align:right">Vlr tabela</th><th style="text-align:right">Vlr autorizado</th><th style="text-align:right">Total</th><th>Fornecido?</th>'+
          '</tr></thead><tbody>'+ls+'</tbody></table></div>';
      }
      var secOpme = '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('bone',13)+' OPME</div>'+tabOpme()+'</div>';
      var secMat = temMat ? '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('pill',13)+' Mat/Med</div>'+tabMat()+'</div>' : '';
      var secDt  = temDt  ? '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('calendar-days',13)+' Diárias / Taxas</div>'+tab4(dtMap,'Diária/Taxa','')+'</div>' : '';

      return '<div class="rel-drill-guia">'+
        '<div class="rel-drill-hd">'+
          '<span class="rel-drill-num">'+ico('file-text',13)+' Guia '+esc(g.numero)+'</span>'+
          '<span class="'+statusCls(g.status)+'">'+esc(g.status)+'</span>'+
        '</div>'+
        '<div class="rel-drill-meta">'+
          '<div class="rel-drill-linha"><span class="rel-drill-k">Solicitante</span><span class="rel-drill-v">'+esc(g.solicitante||'—')+'</span></div>'+
          '<div class="rel-drill-linha"><span class="rel-drill-k">Prestador</span><span class="rel-drill-v">'+esc((g.prestadorExe&&g.prestadorExe.nome)||'—')+'</span></div>'+
          '<div class="rel-drill-linha"><span class="rel-drill-k">Beneficiário</span><span class="rel-drill-v">'+esc((g.beneficiario&&g.beneficiario.nome)||'—')+'</span></div>'+
          '<div class="rel-drill-linha"><span class="rel-drill-k">Custo total</span><span class="rel-drill-v"><b>'+moeda(custoGuia(g))+'</b></span></div>'+
        '</div>'+
        '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('clipboard-list',13)+' Procedimentos</div>'+tab4(procMap,'Procedimento','Sem procedimentos nesta guia.')+'</div>'+
        secOpme + secMat + secDt +
      '</div>';
    }).join('');

    var body='<div class="rel-drill">'+
      (blocos||'<div style="padding:16px;color:var(--muted)">Nenhuma guia.</div>')+
    '</div>';

    var m = ctxRef().modal ? ctxRef().modal(titulo, sub, body) : null;
    return m;
  }
  function statusCls(s){
    var map={'Negada':'badge danger','Liberada':'badge','Analisada':'badge','Em análise':'badge info','Em junta médica':'badge warn','Aguardando complemento':'badge muted','Cotação de OPME':'badge warn'};
    return (map[s]||'badge')+'" style="font-size:10px';
  }

  // ── Custos — análises financeiras ─────────────────────────────────
  function renderCustos(){
    var M=analitico();
    // guia de maior custo
    var guiasC=M.guias.map(function(g){return {numero:g.numero,nome:(g.beneficiario&&g.beneficiario.nome)||'—',tipo:g.tipo,risco:g.risco,custo:custoGuia(g)};}).sort(function(a,b){return b.custo-a.custo;});
    var maiorCusto=guiasC[0]||{custo:0,numero:'—'};
    var custoMedioGuia=M.totalGuias?Math.round(M.totalCusto/M.totalGuias):0;

    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Custo total',moedaK(M.totalCusto),'estimado','#0f766e',
        'Soma dos custos estimados de todas as guias do período. Valores simulados.')+
      kpiCard('Custo médio por guia',moeda(custoMedioGuia),'no período','#0f766e')+
      kpiCard('Maior custo (guia)',moeda(maiorCusto.custo),'guia '+maiorCusto.numero,'#b91c1c')+
      kpiCard('Custo de serviços negados',moedaK(M.custoNegado),M.servNegados+' serviço(s) não autorizado(s)','#15803d',
        'Custo estimado dos serviços (procedimentos e OPME) não autorizados — economia concreta já realizada (reflete os serviços das guias com status Negada).')+
    '</div>';

    var rkGuias=rankTable('Guias de maior custo',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'Guia',f:function(r){return esc(r.numero);}},
      {h:'Beneficiário',f:function(r){return esc(r.nome);}},
      {h:'Tipo',f:function(r){return esc(r.tipo);}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],guiasC.slice(0,8));

    var benC=M.benefs.slice().sort(function(a,b){return b.custo-a.custo;}).slice(0,6);
    var rkBen=rankTable('Maior custo por beneficiário',[
      {h:'Beneficiário',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],benC);
    var procC=M.procs.slice().sort(function(a,b){return b.custo-a.custo;}).slice(0,6);
    var rkProc=rankTable('Maior custo por procedimento',[
      {h:'Procedimento',f:function(r){return esc(r.desc);}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],procC);

    return '<div class="rel-section">'+
      '<div class="rel-note">'+ico('info',13)+' <span>Análises financeiras. <b>Valores simulados</b> (determinísticos por código) para demonstração — substituíveis pela tabela de preços real.</span></div>'+
      kpis+ rkGuias+
      '<div class="rel-grid2">'+rkBen+rkProc+'</div>'+
    '</div>';
  }

  // ── OPME — painel exclusivo ───────────────────────────────────────
  function renderOpme(){
    var M=analitico();
    var opmes=M.opmes.slice().sort(function(a,b){return b.cobrado-a.cobrado;});
    var totalAut=opmes.reduce(function(s,o){return s+o.autorizado;},0);
    var totalCob=opmes.reduce(function(s,o){return s+o.cobrado;},0);
    var maxVar=opmes.reduce(function(s,o){return Math.max(s,o.varPreco);},0);
    var divergentes=opmes.filter(function(o){return o.varPreco>=25;}).length;

    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('OPMEs distintos',opmes.length,'no período','var(--g-700)')+
      kpiCard('Valor autorizado',moedaK(totalAut),'total','#0f766e')+
      kpiCard('Valor cobrado',moedaK(totalCob),'total','#b45309')+
      kpiCard('Com variação anormal',divergentes,'≥25% acima','#b91c1c')+
    '</div>';

    var tab=rankTable('OPME — autorizado x cobrado',[
      {h:'OPME',f:function(r){return esc(r.desc);}},
      {h:'Guia',f:function(r){return fmtGuias(r.guias);}},
      {h:'Fornecedor',f:function(r){return esc(r.fornecedor||'—');}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}},
      {h:'Autorizado',num:true,f:function(r){return moeda(r.autorizado);}},
      {h:'Cobrado',num:true,f:function(r){return moeda(r.cobrado);}},
      {h:'Variação',num:true,f:function(r){var cls=r.varPreco>=25?'color:#b91c1c;font-weight:700':(r.varPreco<=0?'color:#15803d':'');return '<span style="'+cls+'">'+(r.varPreco>0?'+':'')+r.varPreco+'%</span>';}}
    ],opmes);

    return '<div class="rel-section">'+
      '<div class="rel-note">'+ico('info',13)+' <span>Painel exclusivo de OPME. Valor autorizado x cobrado e variação de preço <b>simulados</b> por código. Variações ≥25% geram alerta na central de Alertas.</span></div>'+
      kpis+ tab+
    '</div>';
  }

  // ── Alertas Inteligentes — central (motor de detecção real) ───────
  var SEV_CLS = {critica:'rel-sev-critica', alta:'rel-sev-alta', media:'rel-sev-media', baixa:'rel-sev-baixa'};
  var SEV_LBL = {critica:'Crítica', alta:'Alta', media:'Média', baixa:'Baixa'};
  var TIPO_LBL = {recorrencia:'Recorrência', alto_custo:'Alto custo', concentracao:'Concentração', incompatibilidade:'Incompatibilidade técnica', divergencia:'Divergência documental', fraude:'Possível fraude', desperdicio:'Desperdício', glosa_recorrente:'Glosa recorrente', negativa_recorrente:'Negativa recorrente', inconsistencia_opme:'Inconsistência de OPME', risco_regulatorio:'Risco regulatório'};
  var STATUS_LBL = {novo:'Novo', em_analise:'Em análise', confirmado:'Confirmado', descartado:'Descartado', resolvido:'Resolvido', auditoria:'Enc. auditoria', compliance:'Enc. compliance'};
  var STATUS_CLS = {novo:'badge info', em_analise:'badge', confirmado:'badge warn', descartado:'badge muted', resolvido:'badge', auditoria:'badge warn', compliance:'badge danger'};

  function renderAlertas(){
    var M=analitico();
    var A=M.alertas;
    if(!A.length){
      return '<div class="rel-section"><div class="rel-soon"><div class="rel-soon-ico">'+ico('check-circle-2',26)+'</div><h3>Nenhum alerta detectado</h3><p>O motor não encontrou recorrências, concentrações, alto custo ou inconsistências de OPME nas guias do período.</p></div></div>';
    }
    var linhas = A.map(function(a){
      return '<tr class="rel-alert-row" data-alert="'+a.id+'">'+
        '<td><b>'+esc(a.id)+'</b></td>'+
        '<td>'+esc(a.data)+'</td>'+
        '<td>'+esc(a.guia)+'</td>'+
        '<td>'+esc(a.medico)+'</td>'+
        '<td><span class="rel-sev '+SEV_CLS[a.sev]+'">'+SEV_LBL[a.sev]+'</span></td>'+
        '<td>'+(TIPO_LBL[a.tipo]||a.tipo)+'</td>'+
        '<td style="text-align:center"><b>'+a.score+'</b></td>'+
        '<td>'+esc(a.valor)+'</td>'+
        '<td><span class="'+(STATUS_CLS[a.status]||'badge')+'" style="font-size:10px">'+(STATUS_LBL[a.status]||a.status)+'</span></td>'+
      '</tr>'+
      '<tr class="rel-alert-detail" data-detail="'+a.id+'" style="display:none"><td colspan="9">'+
        '<div class="rel-alert-exp">'+ico('sparkles',13)+' <b>Explicação da IA:</b> '+esc(a.desc)+'</div>'+
        '<div class="rel-alert-meta">'+
          '<span>'+ico('user',12)+' '+esc(a.benef)+'</span>'+
          '<span>'+ico('hospital',12)+' '+esc(a.prestador)+'</span>'+
          '<span>'+ico('arrow-right-circle',12)+' Ação sugerida: <b>'+esc(a.acao)+'</b></span>'+
        '</div>'+
      '</td></tr>';
    }).join('');

    var ativos=A.filter(function(a){return a.status==='novo'||a.status==='em_analise';}).length;
    var criticos=A.filter(function(a){return a.sev==='critica';}).length;
    var altos=A.filter(function(a){return a.sev==='alta';}).length;

    var resumo = '<div class="rel-kpi-grid" style="margin-bottom:16px">'+
      kpiCard('Alertas ativos', ativos, 'pendentes de análise', '#dc2626')+
      kpiCard('Críticos', criticos, 'severidade máxima', '#b91c1c')+
      kpiCard('Alta severidade', altos, 'prioritários', '#c2410c')+
      kpiCard('Total detectado', A.length, 'nesta varredura', 'var(--g-700)')+
    '</div>';

    // distribuição por tipo
    var porTipo={}; A.forEach(function(a){porTipo[a.tipo]=(porTipo[a.tipo]||0)+1;});
    var maxT=Math.max.apply(null,Object.keys(porTipo).map(function(k){return porTipo[k];}));
    var distTipo=Object.keys(porTipo).sort(function(a,b){return porTipo[b]-porTipo[a];})
      .map(function(k){return distRow(TIPO_LBL[k]||k, porTipo[k], maxT, '#dc2626');}).join('');

    return '<div class="rel-section">'+
      resumo+
      '<div class="rel-note">'+ico('info',13)+' <span>Central de alertas — caixa de entrada da auditoria. Alertas <b>gerados automaticamente</b> pela varredura das guias (recorrência, concentração, alto custo, inconsistência de OPME). Clique numa linha para ver a explicação da IA e a ação sugerida.</span></div>'+
      '<div class="rel-card"><div class="rel-card-hd">Distribuição por tipo de inconsistência</div><div style="padding:6px 14px 12px">'+distTipo+'</div></div>'+
      '<div class="rel-card"><div class="rel-card-hd">Alertas detectados ('+A.length+')</div>'+
      '<div class="table-wrap"><table class="cfg-table rel-alert-table"><thead><tr>'+
        '<th>ID</th><th>Data</th><th>Guia</th><th>Médico</th><th>Severidade</th><th>Tipo</th><th>Score</th><th>Valor</th><th>Status</th>'+
      '</tr></thead><tbody>'+linhas+'</tbody></table></div></div>'+
    '</div>';
  }

  // ── View principal do módulo ──────────────────────────────────────
  function view(ctx){
    global.__RELCTX = ctx;
    _cache = null; // recalcula a cada entrada (guias podem mudar por perfil/filtro)
    var wrap = el('div');

    wrap.appendChild(el('div',{class:'page-title'},
      '<div><h1>'+ico('bar-chart-3',18)+' Relatórios</h1><p>Centro de Business Intelligence e Inteligência Assistencial — recorrências, custos, desvios e riscos.</p></div>'
    ));

    // Barra de abas (rolável horizontalmente)
    var tabBar = el('div',{class:'rel-tab-bar'});
    tabBar.innerHTML = TABS.map(function(t){
      return '<button class="rel-tab'+(_state.tab===t.id?' active':'')+'" data-rtab="'+t.id+'">'+ico(t.ico,13)+' '+t.label+'</button>';
    }).join('');
    wrap.appendChild(tabBar);

    var content = el('div',{class:'rel-content'});
    content.innerHTML = renderTab(_state.tab);
    wrap.appendChild(content);

    // Troca de aba reutilizável (usada pelos botões de aba e pelos KPIs clicáveis)
    function irParaAba(id){
      var btn=tabBar.querySelector('.rel-tab[data-rtab="'+id+'"]'); if(!btn) return;
      _state.tab=id;
      tabBar.querySelectorAll('.rel-tab').forEach(function(x){x.classList.toggle('active',x===btn);});
      content.innerHTML=renderTab(id);
      if(ctx.lcIcons) ctx.lcIcons();
      bindConteudo(content, irParaAba);
      if(window.innerWidth<=640) btn.scrollIntoView({inline:'center',block:'nearest'});
    }

    setTimeout(function(){
      tabBar.querySelectorAll('.rel-tab').forEach(function(b){
        b.onclick=function(){ irParaAba(b.getAttribute('data-rtab')); };
      });
      bindConteudo(content, irParaAba);
      if(ctx.lcIcons) ctx.lcIcons();
    },0);

    return wrap;
  }

  // Vincula interações do conteúdo (alertas, exportação e KPIs clicáveis)
  function bindConteudo(container, irParaAba){
    // KPIs clicáveis que navegam para outra aba
    container.querySelectorAll('.rel-kpi-click[data-goto]').forEach(function(k){
      k.onclick=function(){ if(irParaAba) irParaAba(k.getAttribute('data-goto')); };
    });
    // linhas de alerta (expandir explicação)
    container.querySelectorAll('.rel-alert-row').forEach(function(row){
      row.onclick=function(){
        var id=row.getAttribute('data-alert');
        var det=container.querySelector('.rel-alert-detail[data-detail="'+id+'"]');
        if(det) det.style.display = det.style.display==='none'?'table-row':'none';
      };
    });
    // botões de exportação CSV
    container.querySelectorAll('[data-export]').forEach(function(btn){
      btn.onclick=function(){ exportarCSV(btn.getAttribute('data-export')); };
    });
    // linhas de ranking clicáveis → detalhe das guias (modal)
    container.querySelectorAll('.rel-rank-row[data-drill]').forEach(function(row){
      row.onclick=function(){ abrirDetalhe(row.getAttribute('data-drill')); };
    });
  }

  global.RELATORIOS = { view: view };

})(window);
