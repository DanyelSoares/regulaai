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
    {id:'comparativos',label:'Comparativos',     ico:'git-compare'},
    {id:'exportacoes', label:'Exportações',      ico:'download'}
  ];

  var _state = { tab: 'executivo', ordExec: { med:'custo_desc', prest:'custo_desc', opme:'valor_desc' }, buscaExec: { med:'', prest:'', opme:'' }, ordProc: 'qtd_desc', buscaProc: '', ordOpme: 'qtd_desc', buscaOpme: '', ordMm: 'qtd_desc', buscaMm: '', ordDt: 'qtd_desc', buscaDt: '',
    filtroRisco: '', filtroAtend: '', periodo: { de:'', ate:'' } };

  // Opções de ordenação por ranking do Painel Executivo
  var ORD_MED = [
    {v:'custo_desc', lbl:'Maior custo'},
    {v:'custo_asc',  lbl:'Menor custo'},
    {v:'guias_desc', lbl:'Mais guias'},
    {v:'guias_asc',  lbl:'Menos guias'}
  ];
  var ORD_PREST = ORD_MED; // mesmos critérios (guias + custo)
  var ORD_OPME = [
    {v:'valor_desc', lbl:'Maior valor'},
    {v:'valor_asc',  lbl:'Menor valor'},
    {v:'guias_desc', lbl:'Mais guias'},
    {v:'guias_asc',  lbl:'Menos guias'}
  ];
  // Ordenação unificada por div (Procedimentos/OPME/Mat-Med): solicitações + custo
  var ORD_ITEM = [
    {v:'qtd_desc',  lbl:'Mais solicitados'},
    {v:'qtd_asc',   lbl:'Menos solicitados'},
    {v:'cmed_desc', lbl:'Maior custo'},
    {v:'cmed_asc',  lbl:'Menor custo'}
  ];
  // Ordena um array conforme a chave de ordenação escolhida
  function ordenarRank(arr, ord, campoValor){
    var vc = campoValor || 'custo'; // 'custo' p/ médicos/prestadores, 'cobrado' p/ OPME
    var nGuias = function(o){ return typeof o.guias==='number' ? o.guias : (Array.isArray(o.guias)?o.guias.length:0); };
    return arr.slice().sort(function(a,b){
      switch(ord){
        case 'custo_asc':  return (a[vc]-b[vc]) || (nGuias(a)-nGuias(b));
        case 'valor_asc':  return (a[vc]-b[vc]) || (nGuias(a)-nGuias(b));
        case 'guias_desc': return (nGuias(b)-nGuias(a)) || (b[vc]-a[vc]);
        case 'guias_asc':  return (nGuias(a)-nGuias(b)) || (a[vc]-b[vc]);
        case 'qtd_desc':   return ((b.qtd||0)-(a.qtd||0)) || ((b.custo||0)-(a.custo||0)); // procedimentos: por quantidade
        case 'qtd_asc':    return ((a.qtd||0)-(b.qtd||0)) || ((a.custo||0)-(b.custo||0));
        case 'cmed_desc':  return ((b.custoMedio||0)-(a.custoMedio||0)) || ((b.qtd||0)-(a.qtd||0)); // procedimentos: por custo médio
        case 'cmed_asc':   return ((a.custoMedio||0)-(b.custoMedio||0)) || ((a.qtd||0)-(b.qtd||0));
        case 'custo_desc':
        case 'valor_desc':
        default:           return (b[vc]-a[vc]) || (nGuias(b)-nGuias(a));
      }
    });
  }
  // Monta o <select> de ordenação para o cabeçalho de um ranking
  function sortSelect(rankKey, opts, atual){
    var options = opts.map(function(o){ return '<option value="'+o.v+'"'+(o.v===atual?' selected':'')+'>'+esc(o.lbl)+'</option>'; }).join('');
    return '<select class="rel-sort" data-rank="'+rankKey+'">'+options+'</select>';
  }
  // Caixa de busca discreta (expande ao focar) para o cabeçalho de um ranking
  function searchBox(rankKey, valor, opts){
    var v = valor||''; opts=opts||{};
    var wide = opts.wide ? ' rel-search-wide' : '';
    return '<span class="rel-search-wrap'+(v?' has-val':'')+wide+'">'+ico('search',13)+
      '<input type="text" class="rel-search" data-rank="'+rankKey+'" value="'+esc(v)+'" placeholder="Buscar" aria-label="Buscar no ranking" />'+
    '</span>';
  }
  // Filtra registros de um ranking pelo termo (nome/descrição/fornecedor/código)
  function filtrarRank(arr, termo){
    termo = (termo||'').trim().toLowerCase();
    if(!termo) return arr;
    return arr.filter(function(o){
      var alvo = [o.nome, o.desc, o.fornecedor, o.cod].filter(Boolean).join(' ').toLowerCase();
      return alvo.indexOf(termo) >= 0;
    });
  }

  // ── Helpers de placeholder ────────────────────────────────────────
  function ctxRef(){ return global.__RELCTX || {}; }
  function ico(n,s){ var c=ctxRef(); return c.ico?c.ico(n,s||14):''; }
  function esc(t){ var c=ctxRef(); return c.esc?c.esc(t):(''+t); }
  function el(tag,attrs,html){ var c=ctxRef(); return c.el(tag,attrs,html); }

  // Card de KPI simples (placeholder com valor)
  function kpiCard(titulo, valor, sub, cor, tip, gotoTab, drillKpi){
    var infoIco = tip ? ' <span class="rel-kpi-info" title="'+esc(tip)+'">'+ico('info',11)+'</span>' : '';
    var clicavel = gotoTab || drillKpi;
    var clsClick = clicavel ? ' rel-kpi-click' : '';
    var attrGoto = gotoTab ? ' data-goto="'+gotoTab+'"' : '';
    var attrDrill = drillKpi ? ' data-drill-kpi="'+esc(drillKpi)+'"' : '';
    var subHtml = sub ? '<div class="rel-kpi-s">'+sub+(clicavel?' '+ico('arrow-right',11):'')+'</div>' : '';
    return '<div class="rel-kpi'+clsClick+'"'+attrGoto+attrDrill+(tip?' title="'+esc(tip)+'"':'')+'>'+
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

  // Constrói (e cacheia) o modelo analítico a partir das guias do contexto.
  // filtroRisco (opcional): 'baixo'|'medio'|'alto'|'critico' — restringe às guias daquele nível.
  // filtroAtend (opcional): 'Internação'|'Ambulatorial' — restringe pela natureza da guia.
  function analitico(filtroRisco, filtroAtend){
    // filtro de período (global do módulo) faz parte da chave de cache
    var pDe=_state.periodo.de||'', pAte=_state.periodo.ate||'';
    // cache separado por combinação de filtros + período
    var ck = (filtroRisco||'_all')+'|'+(filtroAtend||'_all')+'|'+pDe+'~'+pAte;
    if(_cache && _cache.__key===ck) return _cache;
    var guias = (ctxRef().guias) || [];
    // Período: compara pela data de emissão (formato ISO AAAA-MM-DD, comparável como string)
    if(pDe)  guias = guias.filter(function(g){ return (g.dataEmissao||'') >= pDe; });
    if(pAte) guias = guias.filter(function(g){ return (g.dataEmissao||'') <= pAte; });
    if(filtroRisco){ guias = guias.filter(function(g){ return (g.risco||'baixo')===filtroRisco; }); }
    if(filtroAtend){
      var MK=window.MOCK;
      guias = guias.filter(function(g){
        if(filtroAtend==='Internação') return g.natureza==='Internação'; // todas as internações
        // 'Ambulatorial' ou 'Internação <Subtipo>'
        return (MK&&MK.naturezaDetalhada?MK.naturezaDetalhada(g):(g.natureza||'Ambulatorial'))===filtroAtend;
      });
    }
    var porBenef={}, porMedico={}, porPrestador={}, porProc={}, porOpme={}, porMatmed={}, porDiaria={};
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
      var b = porBenef[bid] || (porBenef[bid]={id:bid,nome:(g.beneficiario&&g.beneficiario.nome)||'—',idade:(g.beneficiario&&g.beneficiario.idade)||null,guias:0,custo:0,opme:0,medicos:{},prestadores:{},procs:0,negadas:0,internacoes:0,ambulatoriais:0,altoRisco:0});
      b.guias++; b.custo+=c; b.opme+=(g.matmed||[]).filter(function(m){return m.opme;}).length;
      b.procs+=(g.procedimentos||[]).length;
      if(g.status==='Negada') b.negadas++;
      if(g.natureza==='Internação') b.internacoes++; else b.ambulatoriais++; // por natureza (campo limpo)
      if(g.risco==='alto'||g.risco==='critico') b.altoRisco++;
      if(g.solicitante) b.medicos[g.solicitante]=1;
      if(g.prestadorExe&&g.prestadorExe.nome) b.prestadores[g.prestadorExe.nome]=1;

      // Especialidade da guia (derivada do tipo)
      var espec = (window.MOCK&&window.MOCK.especialidadeDaGuia)?window.MOCK.especialidadeDaGuia(g):'Outros';

      // Médico solicitante
      var med = g.solicitante || '—';
      var m = porMedico[med] || (porMedico[med]={nome:med,guias:0,custo:0,benefs:{},prestadores:{},opme:0,negadas:0,aprovadas:0,guiasRef:[],especCnt:{}});
      m.guias++; m.custo+=c; m.benefs[bid]=1; m.guiasRef.push(g);
      m.especCnt[espec]=(m.especCnt[espec]||0)+1;
      if(g.prestadorExe&&g.prestadorExe.nome) m.prestadores[g.prestadorExe.nome]=1;
      m.opme+=(g.matmed||[]).filter(function(x){return x.opme;}).length;
      if(g.status==='Negada') m.negadas++;
      if(g.status==='Liberada'||g.status==='Analisada') m.aprovadas++;

      // Prestador executante
      var pn = g.prestadorExe && g.prestadorExe.nome || '—';
      var pr = porPrestador[pn] || (porPrestador[pn]={nome:pn,guias:0,custo:0,opme:0,medicos:{},internacoes:0,ambulatoriais:0,guiasRef:[]});
      pr.guias++; pr.custo+=c; pr.opme+=(g.matmed||[]).filter(function(x){return x.opme;}).length; pr.guiasRef.push(g);
      if(g.solicitante) pr.medicos[g.solicitante]=1;
      // Contagem por natureza (campo limpo): Internação × Ambulatorial
      if(g.natureza==='Internação') pr.internacoes++; else pr.ambulatoriais++;

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

      // Mat/Med (materiais e medicamentos NÃO-OPME)
      (g.matmed||[]).forEach(function(mm){
        if(mm.opme) return;
        var mc=custoMatmed(mm);
        var mo=porMatmed[mm.cod]||(porMatmed[mm.cod]={cod:mm.cod,desc:mm.desc,qtd:0,custo:0,guias:[],guiasRef:[]});
        mo.qtd++; mo.custo+=mc;
        if(mo.guias.indexOf(g.numero)<0){ mo.guias.push(g.numero); mo.guiasRef.push(g); }
      });

      // Diárias e Taxas (mesmo custo determinístico usado em custoGuia/drill)
      (g.diariasTaxas||[]).forEach(function(d){
        var dc=150 + seed(d.cod)%900;
        var dobj=porDiaria[d.cod]||(porDiaria[d.cod]={cod:d.cod,desc:d.desc,qtd:0,custo:0,guias:[],guiasRef:[]});
        dobj.qtd++; dobj.custo+=dc;
        if(dobj.guias.indexOf(g.numero)<0){ dobj.guias.push(g.numero); dobj.guiasRef.push(g); }
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
      // especialidade predominante do médico (maior nº de guias)
      var melhor='Outros',max=-1;
      Object.keys(o.especCnt).forEach(function(e){ if(o.especCnt[e]>max){max=o.especCnt[e];melhor=e;} });
      o.especialidade=melhor;
      // score de risco do médico: concentração + volume + OPME + negativas
      o.score=clamp((o.nPrestadores===1&&o.guias>1?35:0) + o.guias*8 + o.opme*9 + o.taxaNeg*0.4);
    });
    // Médias por especialidade (para detectar desvio de cada médico vs. pares)
    var especStats={};
    medicos.forEach(function(m){
      var e=m.especialidade; if(!especStats[e]) especStats[e]={nMed:0,guias:0,custo:0};
      especStats[e].nMed++; especStats[e].guias+=m.guias; especStats[e].custo+=m.custo;
    });
    Object.keys(especStats).forEach(function(e){ var s=especStats[e]; s.mediaGuias=s.nMed?s.guias/s.nMed:0; s.mediaCusto=s.nMed?s.custo/s.nMed:0; });
    // Marca desvio: médico acima da média da própria especialidade.
    // Requer ≥2 médicos na especialidade (comparação estatística) E volume mínimo do
    // próprio médico (MIN_GUIAS_DESVIO): com 1-2 guias a amostra é pequena demais e
    // o custo de um único procedimento caro geraria falso positivo.
    var MIN_GUIAS_DESVIO=3;
    medicos.forEach(function(m){
      var s=especStats[m.especialidade]; m.especMediaGuias=s?Math.round(s.mediaGuias*10)/10:0; m.especMediaCusto=s?Math.round(s.mediaCusto):0;
      m.desvio = !!(s && s.nMed>=2 && m.guias>=MIN_GUIAS_DESVIO && (m.guias>s.mediaGuias*1.3 || m.custo>s.mediaCusto*1.3));
    });
    var prestadores=toArr(porPrestador,function(o){
      o.nMedicos=Object.keys(o.medicos).length; o.custoMedio=o.guias?Math.round(o.custo/o.guias):0;
      o.score=clamp(o.opme*10 + (o.nMedicos===1&&o.guias>1?25:0) + o.internacoes*8);
    });
    var procs=toArr(porProc,function(o){o.custoMedio=o.qtd?Math.round(o.custo/o.qtd):0;o.taxaNeg=o.qtd?Math.round(o.negadas/o.qtd*100):0;});
    var opmes=toArr(porOpme,function(o){o.varPreco=o.autorizado?Math.round((o.cobrado-o.autorizado)/o.autorizado*100):0;o.nBenefs=Object.keys(o.benefs).length;o.nMedicos=Object.keys(o.medicos).length;o.custoMedio=o.qtd?Math.round(o.cobrado/o.qtd):0;o.score=clamp(Math.max(0,o.varPreco)*1.2 + o.qtd*8);});
    var matmeds=toArr(porMatmed,function(o){o.custoMedio=o.qtd?Math.round(o.custo/o.qtd):0;});
    var diarias=toArr(porDiaria,function(o){o.custoMedio=o.qtd?Math.round(o.custo/o.qtd):0;});

    _cache = {
      __key:ck,
      guias:guias, totalGuias:guias.length, totalCusto:totalCusto,
      custoNegado:custoNegado, qtdNegadas:qtdNegadas, servNegados:servNegados, qtdEmAberto:qtdEmAberto, riscoCnt:riscoCnt,
      benefs:benefs, medicos:medicos, prestadores:prestadores, procs:procs, opmes:opmes, matmeds:matmeds, diarias:diarias, especStats:especStats
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
    // 1b) Desvio vs. especialidade: médico acima da média dos pares da mesma especialidade
    M.medicos.forEach(function(m){
      if(!m.desvio) return;
      var s=M.especStats[m.especialidade];
      novo({sev:'media',tipo:'concentracao',score:70+Math.min(20,Math.round((m.guias/(s.mediaGuias||1))*10)),medico:m.nome,
        prestador:'—',valor:moeda(m.custo),benef:'Vários',guia:'—',
        desc:'Médico '+m.nome+' ('+m.especialidade+') solicitou '+m.guias+' guia(s), enquanto a média da especialidade é '+m.especMediaGuias+'. Volume/custo acima do padrão dos pares (base comparativa da própria especialidade).',
        acao:'Comparar com pares da especialidade e revisar pertinência'});
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
    // Contador com rótulo/tooltip explicando o que está sendo contado
    var cntLbl = opts.countLabel ? opts.countLabel(rows.length) : (rows.length+' registro(s)');
    var hd='<div class="rel-card-hd">'+esc(titulo)+
      (opts.sortControl?'<span class="rel-card-sort">'+opts.sortControl+'</span>':'')+
      (opts.count?'<span class="rel-card-count" title="'+esc(cntLbl)+'">'+rows.length+'</span>':'')+'</div>';
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
  // Mini barra de distribuição. riscoKey (opcional) torna a linha clicável p/ filtrar; ativo=nível selecionado
  function distRow(label, valor, max, cor, riscoKey, ativo){
    var pct=max?Math.round(valor/max*100):0;
    var clicavel = !!riscoKey;
    var tip = clicavel
      ? (ativo?'Filtro ativo — clique para limpar':'Clique para filtrar o painel por risco '+String(label).toLowerCase()+' ('+valor+' guia(s))')
      : (valor+' guia(s) com risco '+String(label).toLowerCase());
    return '<div class="rel-dist-row'+(clicavel?' rel-dist-click':'')+(ativo?' active':'')+'"'+
        (clicavel?' data-risco="'+esc(riscoKey)+'"':'')+' title="'+esc(tip)+'"><span class="rel-dist-lbl">'+esc(label)+'</span>'+
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
    return '<div class="rel-section">'+kpis+tab+'</div>';
  }

  // ── Médicos Solicitantes ──────────────────────────────────────────
  function renderMedicos(){
    var M=analitico();
    var ms=M.medicos.slice().sort(function(a,b){return b.score-a.score;});
    var mediaGuias=ms.length?(M.totalGuias/ms.length):0;
    var comDesvio=ms.filter(function(m){return m.desvio;}).length;
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Médicos solicitantes',ms.length,'no período','var(--g-700)')+
      kpiCard('Volume médio',mediaGuias.toFixed(1),'guias/médico','#0f766e')+
      kpiCard('Acima da especialidade',comDesvio,'desvio vs. pares','#c2410c')+
      kpiCard('Maior score',ms.length?ms[0].score:0,ms.length?ms[0].nome:'','#b91c1c')+
    '</div>';
    var tab=rankTable('Médicos — perfil de solicitação',[
      {h:'Médico',f:function(r){return esc(r.nome);}},
      {h:'Especialidade',f:function(r){return esc(r.especialidade)+(r.desvio?' <span class="rel-desvio" title="Acima da média da especialidade (média: '+r.especMediaGuias+' guias)">▲ desvio</span>':'');}},
      {h:'Guias',num:true,f:function(r){return r.guias+(r.desvio?' <span style="color:#c2410c;font-size:10px">(méd. '+r.especMediaGuias+')</span>':'');}},
      {h:'Benef.',num:true,f:function(r){return r.nBenefs;}},
      {h:'Prest.',num:true,f:function(r){return r.nPrestadores+(r.nPrestadores===1&&r.guias>1?' ⚠':'');}},
      {h:'OPME',num:true,f:function(r){return r.opme;}},
      {h:'Aprov.',num:true,f:function(r){return r.taxaAprov+'%';}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}},
      {h:'Score',num:true,f:function(r){return scoreBadge(r.score);}}
    ],ms,{scroll:true,count:true,countLabel:function(n){return n+' médico(s) solicitante(s) na lista';}});
    var nota='<div class="rel-note">'+ico('info',13)+' <span><b>▲ desvio</b> = médico com volume/custo acima da média dos pares da <b>mesma especialidade</b> (comparação estatística, requer ≥2 médicos na especialidade).<br><b>⚠</b> = todas as solicitações concentradas em um único prestador.<br>Ambas geram alertas em <b>Alertas Inteligentes</b>.</span></div>';
    return '<div class="rel-section">'+kpis+nota+tab+'</div>';
  }

  // ── Prestadores ───────────────────────────────────────────────────
  function renderPrestadores(){
    var M=analitico();
    var ps=M.prestadores.slice().sort(function(a,b){return b.custo-a.custo;});
    var custoMedioGeral=ps.length?Math.round(M.totalCusto/M.totalGuias):0;
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Prestadores',ps.length,'no período','var(--g-700)')+
      kpiCard('Custo médio/guia',moeda(custoMedioGeral),'geral','#0f766e')+
      kpiCard('Acima da média',ps.filter(function(p){return p.custoMedio>custoMedioGeral;}).length,'ver quem','#c2410c',
        'Prestadores cujo custo médio por guia está acima da média geral. Clique para ver a lista.',null,'prestAcimaMedia')+
      kpiCard('Maior custo',ps.length?moeda(ps[0].custo):'R$ 0',ps.length?ps[0].nome:'','#b91c1c')+
    '</div>';
    var tab=rankTable('Prestadores — visão consolidada',[
      {h:'Prestador',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Ambulatorial',num:true,f:function(r){return r.ambulatoriais;}},
      {h:'Internações',num:true,f:function(r){return r.internacoes;}},
      {h:'OPME',num:true,f:function(r){return r.opme;}},
      {h:'Médicos',num:true,f:function(r){return r.nMedicos+(r.nMedicos===1&&r.guias>1?' ⚠':'');}},
      {h:'Custo médio',num:true,f:function(r){var alto=r.custoMedio>custoMedioGeral;return '<span style="'+(alto?'color:#c2410c;font-weight:700':'')+'">'+moeda(r.custoMedio)+'</span>';}},
      {h:'Custo total',num:true,f:function(r){return moeda(r.custo);}},
      {h:'Score',num:true,f:function(r){return scoreBadge(r.score);}}
    ],ps);
    return '<div class="rel-section">'+kpis+tab+'</div>';
  }

  // ── Procedimentos ─────────────────────────────────────────────────
  function renderProcedimentos(){
    var M=analitico();
    var pr=M.procs.slice();
    var maisSolic=pr.slice().sort(function(a,b){return b.qtd-a.qtd || b.custo-a.custo;})[0];
    var maisNeg=pr.slice().sort(function(a,b){return b.taxaNeg-a.taxaNeg;}).slice(0,5);
    var kpis='<div class="rel-kpi-grid">'+
      kpiCard('Procedimentos distintos',pr.length,'no período','var(--g-700)')+
      kpiCard('Total solicitado',pr.reduce(function(s,p){return s+p.qtd;},0),'ocorrências','#0f766e')+
      kpiCard('Mais solicitado',maisSolic?'<span class="rel-kpi-txt">'+esc(maisSolic.desc)+'</span>':'—',maisSolic?maisSolic.qtd+'× · '+esc(maisSolic.cod):'','#b45309','Procedimento com maior número de solicitações no período.')+
      kpiCard('Maior negativa',maisNeg.length?maisNeg[0].taxaNeg+'%':'0%',maisNeg.length?maisNeg[0].cod:'','#b91c1c')+
    '</div>';
    // Div unificada por tipo: uma tabela (Qtd + Custo), um filtro de ordenação e uma busca.
    // titulo/colLbl/itemLbl textuais; dados = array; rk = chave de estado/handler (Proc/Opme/Mm).
    function divRanking(titulo, colLbl, itemLbl, dados, rk){
      var ord=_state['ord'+rk], busca=_state['busca'+rk];
      // ordena por qtd ou por custo médio conforme a opção escolhida
      var lista = ordenarRank(filtrarRank(dados, busca), ord, 'custoMedio');
      return rankTable(titulo,[
        {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
        {h:'Código',f:function(r){return esc(r.cod);}},
        {h:colLbl,f:function(r){return esc(r.desc);}},
        {h:'Qtd',num:true,f:function(r){return r.qtd;}},
        {h:'Custo',num:true,f:function(r){return moeda(r.custoMedio);}}
      ],lista,{scroll:true,count:true,
        countLabel:function(n){return n+' '+itemLbl+' distinto(s) no ranking';},
        sortControl:searchBox(rk,busca,{wide:true})+sortSelect(rk,ORD_ITEM,ord)});
    }
    var divProc = divRanking('Procedimentos','Procedimento','procedimento(s)', pr, 'Proc');
    var divDt   = divRanking('Diárias e Taxas','Diária/Taxa','diária(s)/taxa(s)', (M.diarias||[]).slice(), 'Dt');
    var divOpme = divRanking('OPME','OPME','item(ns) de OPME', M.opmes.slice(), 'Opme');
    var divMm   = divRanking('Mat/Med','Mat/Med','item(ns) de Mat/Med', (M.matmeds||[]).slice(), 'Mm');

    return '<div class="rel-section">'+kpis+
      '<div class="rel-grid2">'+divProc+divDt+'</div>'+
      '<div class="rel-grid2">'+divOpme+divMm+'</div>'+
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
      '<div class="rel-note">'+ico('info',13)+' <span>Exporte os dados consolidados do período. A maioria dos conjuntos sai em <b>CSV</b>; <b>Procedimentos</b> sai em <b>Excel (.xlsx) com 4 abas</b> (Procedimentos, Diárias e Taxas, OPME e Mat/Med). Abre no Excel. PDF e agendamento entram em fase futura.</span></div>'+
      '<div class="rel-card"><div class="rel-card-hd">Conjuntos disponíveis para exportação</div>'+
      '<div class="rel-export-grid">'+
        exportBtn('guias','Guias (visão geral)','file-check-2')+
        exportBtn('alertas','Alertas detectados','bell-ring')+
        exportBtn('beneficiarios','Beneficiários','users')+
        exportBtn('medicos','Médicos solicitantes','stethoscope')+
        exportBtn('prestadores','Prestadores','hospital')+
        exportBtn('procedimentos','Procedimentos (Excel · 4 abas)','clipboard-list')+
        exportBtn('opme','OPME','bone')+
        exportBtn('matmed','Mat/Med','pill')+
        exportBtn('diarias','Diárias e Taxas','calendar-days')+
      '</div></div>'+
    '</div>';
  }
  function exportBtn(tipo,label,icone){
    return '<button class="rel-export-btn" data-export="'+tipo+'">'+ico(icone,16)+' <span>'+esc(label)+'</span>'+ico('download',14)+'</button>';
  }

  // Retorna {head, rows} de um conjunto de dados para exportação
  function datasetExport(tipo){
    var M=analitico();
    var MK=window.MOCK||{};
    if(tipo==='guias'){
      return {head:['Guia','DataEmissao','Beneficiario','Natureza','Regime','Especialidade','CID','Solicitante','Executante','Status','Risco','Custo'],
        rows:(M.guias||[]).map(function(g){
          var nat=MK.naturezaDetalhada?MK.naturezaDetalhada(g):(g.natureza||'');
          var esp=MK.especialidadeDaGuia?MK.especialidadeDaGuia(g):'';
          var cid=MK.cidGuia?MK.cidGuia(g).codigo:'';
          return [g.numero,g.dataEmissao,(g.beneficiario&&g.beneficiario.nome)||'',nat,g.regime||'',esp,cid,g.solicitante||'',(g.prestadorExe&&g.prestadorExe.nome)||'',g.status||'',g.risco||'',custoGuia(g)];
        })};
    }
    if(tipo==='alertas') return {head:['ID','Data','Guia','Medico','Severidade','Tipo','Score','Valor','Status','Descricao'], rows:M.alertas.map(function(a){return [a.id,a.data,a.guia,a.medico,SEV_LBL[a.sev],TIPO_LBL[a.tipo]||a.tipo,a.score,a.valor,STATUS_LBL[a.status]||a.status,a.desc];})};
    if(tipo==='beneficiarios') return {head:['Nome','Idade','Guias','Ambulatorial','Internacoes','Procedimentos','OPME','Medicos','Negadas','Custo','Score'], rows:M.benefs.map(function(b){return [b.nome,b.idade||'',b.guias,b.ambulatoriais,b.internacoes,b.procs,b.opme,b.nMedicos,b.negadas,b.custo,b.score];})};
    if(tipo==='medicos') return {head:['Medico','Especialidade','Guias','Beneficiarios','Prestadores','OPME','TaxaAprov','Custo','Score'], rows:M.medicos.map(function(m){return [m.nome,m.especialidade||'',m.guias,m.nBenefs,m.nPrestadores,m.opme,m.taxaAprov+'%',m.custo,m.score];})};
    if(tipo==='prestadores') return {head:['Prestador','Guias','Ambulatorial','Internacoes','OPME','Medicos','CustoMedio','CustoTotal','Score'], rows:M.prestadores.map(function(p){return [p.nome,p.guias,p.ambulatoriais,p.internacoes,p.opme,p.nMedicos,p.custoMedio,p.custo,p.score];})};
    if(tipo==='procedimentos') return {head:['Codigo','Descricao','Qtd','Negadas','TaxaNeg','CustoTotal','CustoMedio'], rows:M.procs.map(function(p){return [p.cod,p.desc,p.qtd,p.negadas,p.taxaNeg+'%',p.custo,p.custoMedio];})};
    if(tipo==='opme') return {head:['Codigo','Descricao','Guias','Fornecedor','Qtd','Autorizado','Cobrado','Variacao','Score'], rows:M.opmes.map(function(o){return [o.cod,o.desc,(o.guias||[]).join(' | '),o.fornecedor||'',o.qtd,o.autorizado,o.cobrado,o.varPreco+'%',o.score];})};
    if(tipo==='matmed') return {head:['Codigo','Descricao','Qtd','CustoTotal','CustoMedio'], rows:(M.matmeds||[]).map(function(m){return [m.cod,m.desc,m.qtd,m.custo,m.custoMedio];})};
    if(tipo==='diarias') return {head:['Codigo','Descricao','Qtd','CustoTotal','CustoMedio'], rows:(M.diarias||[]).map(function(d){return [d.cod,d.desc,d.qtd,d.custo,d.custoMedio];})};
    return {head:[], rows:[]};
  }

  // Baixa um CSV (ponto-e-vírgula, BOM) de um único conjunto
  function baixarCSV(nome, ds){
    var csv=[ds.head].concat(ds.rows).map(function(r){return r.map(function(c){var s=(''+c).replace(/"/g,'""');return /[";\n]/.test(s)?'"'+s+'"':s;}).join(';');}).join('\r\n');
    var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a');
    a.href=url; a.download=nome+'-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // Gera e baixa o conjunto pedido. "procedimentos" vira um XLSX com 4 abas
  // (Procedimentos, Diárias e Taxas, OPME, Mat/Med); os demais permanecem em CSV.
  function exportarCSV(tipo){
    if(tipo==='procedimentos'){
      var abas=[
        {nome:'Procedimentos',    tipo:'procedimentos'},
        {nome:'Diárias e Taxas',  tipo:'diarias'},
        {nome:'OPME',             tipo:'opme'},
        {nome:'Mat-Med',          tipo:'matmed'}
      ];
      if(window.XLSX){
        var wb=XLSX.utils.book_new();
        abas.forEach(function(ab){
          var ds=datasetExport(ab.tipo);
          var ws=XLSX.utils.aoa_to_sheet([ds.head].concat(ds.rows));
          XLSX.utils.book_append_sheet(wb, ws, ab.nome.slice(0,31)); // nome de aba: máx 31 chars
        });
        XLSX.writeFile(wb, 'relatorio-procedimentos-'+new Date().toISOString().slice(0,10)+'.xlsx');
      } else {
        // fallback (sem a lib): baixa os 4 CSVs separados
        abas.forEach(function(ab){ baixarCSV('relatorio-'+ab.tipo, datasetExport(ab.tipo)); });
      }
      return;
    }
    baixarCSV('relatorio-'+tipo, datasetExport(tipo));
  }

  // ── Painel Executivo (KPIs + rankings reais) ──────────────────────
  function renderExecutivo(){
    var fr=_state.filtroRisco||'';  // filtro de risco ativo (clique na barra de distribuição)
    var fa=_state.filtroAtend||'';  // filtro de tipo de atendimento (Internação × Ambulatorial)
    // MBase: filtrado só por atendimento (a distribuição por risco reflete o atendimento, mas mostra todos os níveis)
    var MBase = fa?analitico('', fa):analitico();
    var M = fr?analitico(fr, fa):MBase; // KPIs e rankings refletem risco + atendimento
    var rc=MBase.riscoCnt;          // contagem por nível dentro do atendimento selecionado
    // Rankings completos: filtro de busca + ordenação conforme escolha do usuário
    var ord=_state.ordExec, busca=_state.buscaExec;
    var rkMedicos=ordenarRank(filtrarRank(M.medicos, busca.med), ord.med, 'custo');
    var rkPrestadores=ordenarRank(filtrarRank(M.prestadores, busca.prest), ord.prest, 'custo');
    var rkOpmes=ordenarRank(filtrarRank(M.opmes, busca.opme), ord.opme, 'cobrado');
    var maxRisco=Math.max(rc.baixo,rc.medio,rc.alto,rc.critico,1);

    var RISCO_LBL={baixo:'Baixo',medio:'Médio',alto:'Alto',critico:'Crítico'};

    // Banner de filtro ativo (risco e/ou atendimento)
    var partes=[];
    if(fa) partes.push('natureza <b>'+esc(fa)+'</b>');
    if(fr) partes.push('risco <b>'+esc(RISCO_LBL[fr]||fr)+'</b>');
    var filtroBanner = partes.length
      ? '<div class="rel-filter-banner">'+ico('filter',13)+
          ' Filtrando por '+partes.join(' + ')+' — '+M.totalGuias+' guia(s). '+
          '<button class="rel-filter-clear" data-clear-filtros="1">'+ico('x',12)+' Limpar filtros</button>'+
        '</div>'
      : '';

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

    var distRisco='<div class="rel-card"><div class="rel-card-hd">Distribuição por risco<span class="rel-card-sub" title="Clique numa barra para filtrar o painel pelas guias daquele nível de risco">clique para filtrar · nº de guias</span></div><div style="padding:6px 14px 12px">'+
      distRow('Baixo',rc.baixo,maxRisco,'#16a34a','baixo',fr==='baixo')+
      distRow('Médio',rc.medio,maxRisco,'#a16207','medio',fr==='medio')+
      distRow('Alto',rc.alto,maxRisco,'#c2410c','alto',fr==='alto')+
      distRow('Crítico',rc.critico,maxRisco,'#b91c1c','critico',fr==='critico')+
    '</div></div>';

    var rkMed=rankTable('Ranking de médicos por custo',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'Médico',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],rkMedicos,{scroll:true,count:true,countLabel:function(n){return n+' médico(s) solicitante(s) no ranking';},rowDrill:function(r){return 'med:'+r.nome;},sortControl:searchBox('med',busca.med)+sortSelect('med',ORD_MED,ord.med)});
    var rkPrest=rankTable('Ranking de prestadores por custo',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'Prestador',f:function(r){return esc(r.nome);}},
      {h:'Guias',num:true,f:function(r){return r.guias;}},
      {h:'Custo',num:true,f:function(r){return moeda(r.custo);}}
    ],rkPrestadores,{scroll:true,count:true,countLabel:function(n){return n+' prestador(es) no ranking';},rowDrill:function(r){return 'prest:'+r.nome;},sortControl:searchBox('prest',busca.prest)+sortSelect('prest',ORD_PREST,ord.prest)});
    var rkOpme=rankTable('Ranking de OPME por valor',[
      {h:'#',f:function(r,i){return '<b>'+(i+1)+'</b>';}},
      {h:'OPME',f:function(r){return esc(r.desc);}},
      {h:'Guia',f:function(r){return fmtGuias(r.guias);}},
      {h:'Fornecedor',f:function(r){return esc(r.fornecedor||'—');}},
      {h:'Qtd',num:true,f:function(r){return r.qtd;}},
      {h:'Valor cobrado',num:true,f:function(r){return moeda(r.cobrado);}}
    ],rkOpmes,{scroll:true,count:true,countLabel:function(n){return n+' item(ns) de OPME distintos no ranking';},rowDrill:function(r){return 'opme:'+r.cod;},sortControl:searchBox('opme',busca.opme)+sortSelect('opme',ORD_OPME,ord.opme)});

    // Quebra Ambulatorial × Internação (sempre sobre o total, para comparação)
    var MTotal=analitico();
    var mAmb=analitico('','Ambulatorial'), mInt=analitico('','Internação');
    function quebraCol(lbl,ico2,m,cor){
      var pctG=MTotal.totalGuias?Math.round(m.totalGuias/MTotal.totalGuias*100):0;
      var ativo = fa===lbl;
      return '<button class="rel-quebra-col'+(ativo?' active':'')+'" data-atend="'+esc(lbl)+'" style="--qc:'+cor+'">'+
        '<div class="rel-quebra-hd">'+ico(ico2,14)+' '+esc(lbl)+'</div>'+
        '<div class="rel-quebra-guias">'+m.totalGuias+' <span>guia(s) · '+pctG+'%</span></div>'+
        '<div class="rel-quebra-custo">'+moedaK(m.totalCusto)+'</div>'+
      '</button>';
    }
    var quebra='<div class="rel-card"><div class="rel-card-hd">Natureza — Ambulatorial × Internação'+
        '<span class="rel-card-sub" title="Clique numa coluna para filtrar o painel pela natureza da guia">clique para filtrar</span></div>'+
      '<div class="rel-quebra">'+
        quebraCol('Ambulatorial','activity',mAmb,'#0f766e')+
        quebraCol('Internação','bed',mInt,'#b45309')+
      '</div></div>';

    return '<div class="rel-section">'+
      filtroBanner+
      kpis+
      '<div class="rel-grid2">'+quebra+distRisco+'</div>'+
      '<div class="rel-grid2">'+rkMed+rkPrest+'</div>'+
      rkOpme+
    '</div>';
  }

  // ── Detalhe (modal) das guias de uma entidade do ranking ──────────
  // Modal: prestadores com custo médio/guia acima da média geral
  function abrirPrestAcimaMedia(){
    var M=analitico();
    var mediaGeral = M.totalGuias ? Math.round(M.totalCusto/M.totalGuias) : 0;
    var acima = M.prestadores.filter(function(p){return p.custoMedio>mediaGeral;})
      .sort(function(a,b){return b.custoMedio-a.custoMedio;});
    var titulo='Prestadores acima da média';
    var sub=acima.length+' prestador(es) · média geral '+moeda(mediaGeral)+' por guia';
    var linhas = acima.map(function(p,i){
      var desvioPct = mediaGeral ? Math.round((p.custoMedio-mediaGeral)/mediaGeral*100) : 0;
      return '<tr class="rel-rank-row" data-drill="prest:'+esc(p.nome)+'">'+
        '<td><b>'+(i+1)+'</b></td>'+
        '<td>'+esc(p.nome)+'</td>'+
        '<td style="text-align:right">'+p.guias+'</td>'+
        '<td style="text-align:right;font-weight:700;color:#c2410c">'+moeda(p.custoMedio)+'</td>'+
        '<td style="text-align:right;color:#b91c1c;font-weight:700">+'+desvioPct+'%</td>'+
        '<td style="text-align:right">'+moeda(p.custo)+'</td>'+
      '</tr>';
    }).join('');
    var body = acima.length
      ? '<div class="rel-note">'+ico('info',13)+' <span>Prestadores cujo <b>custo médio por guia</b> supera a média geral ('+moeda(mediaGeral)+'). A coluna <b>Desvio</b> mostra o quanto cada um está acima. Clique numa linha para ver as guias.</span></div>'+
        '<div class="table-wrap"><table class="cfg-table"><thead><tr>'+
          '<th>#</th><th>Prestador</th><th style="text-align:right">Guias</th><th style="text-align:right">Custo médio/guia</th><th style="text-align:right">Desvio</th><th style="text-align:right">Custo total</th>'+
        '</tr></thead><tbody>'+linhas+'</tbody></table></div>'
      : '<div style="padding:16px;color:var(--muted)">Nenhum prestador acima da média.</div>';
    var m = ctxRef().modal ? ctxRef().modal(titulo, sub, body) : null;
    // linhas clicáveis abrem o detalhe do prestador
    if(m){ setTimeout(function(){
      m.querySelectorAll('.rel-rank-row[data-drill]').forEach(function(row){
        row.onclick=function(){ abrirDetalhe(row.getAttribute('data-drill')); };
      });
      if(ctxRef().lcIcons) ctxRef().lcIcons();
    },0); }
    return m;
  }

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
      // Observações do ERP (leitura) — impressas + não impressas
      var obs = (window.MOCK&&window.MOCK.observacoesGuia)?window.MOCK.observacoesGuia(g.numero):{impressas:'',naoImpressas:[]};
      var secObsImp = '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('printer',13)+' Observações impressas</div>'+
        '<div style="padding:8px 14px 14px;font-size:12.5px;color:var(--ink-2);white-space:pre-wrap">'+(obs.impressas?esc(obs.impressas):'<span style="color:var(--muted)">Sem observações impressas.</span>')+'</div></div>';
      var secObsNi = obs.naoImpressas.length ? '<div class="rel-drill-sec"><div class="rel-drill-sec-hd">'+ico('eye-off',13)+' Observações não impressas</div>'+
        '<div class="table-wrap"><table class="cfg-table rel-drill-tab"><thead><tr><th>Data</th><th>Operador</th><th style="text-align:center">Pode Inf. Usuár.</th><th>Observação</th></tr></thead><tbody>'+
        obs.naoImpressas.map(function(o){return '<tr><td style="white-space:nowrap">'+esc(o.data)+'</td><td>'+esc(o.operador)+'</td><td style="text-align:center">'+esc(o.podeInformar)+'</td><td>'+esc(o.texto)+'</td></tr>';}).join('')+
        '</tbody></table></div></div>' : '';

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
        secOpme + secMat + secDt + secObsImp + secObsNi +
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
      kpiCard('Custo total',moeda(M.totalCusto),'estimado','#0f766e',
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
      kpiCard('Valor autorizado',moeda(totalAut),'total','#0f766e')+
      kpiCard('Valor cobrado',moeda(totalCob),'total','#b45309')+
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

    // Cabeçalho do módulo: filtros globais à direita (Natureza + Período, padrão do Dashboard)
    var hdr = el('div',{class:'page-title'},
      '<div><h1>'+ico('bar-chart-3',18)+' Relatórios</h1><p>Centro de Business Intelligence e Inteligência Assistencial — recorrências, custos, desvios e riscos.</p></div>'
    );
    var hdrFiltros = el('div',{class:'rel-hdr-filtros'});
    var naturezaWrap = el('div',{id:'relNaturezaWrap',class:'rel-hdr-nat'});   // só aparece no Painel Executivo
    var periodoWrap = el('div',{id:'relPeriodoWrap',style:'display:flex;align-items:center'});
    hdrFiltros.appendChild(naturezaWrap);
    hdrFiltros.appendChild(periodoWrap);
    hdr.appendChild(hdrFiltros);
    wrap.appendChild(hdr);

    var content;
    // Filtro de período: reaplica em TODAS as abas (invalida cache e re-renderiza a aba atual)
    function aplicarPeriodo(de, ate){
      _state.periodo = { de:de||'', ate:ate||'' };
      _cache = null;
      if(content){ content.innerHTML = renderTab(_state.tab); if(ctx.lcIcons) ctx.lcIcons(); bindConteudo(content, irParaAba); }
    }
    if(window.makeDateRangePicker){
      window.makeDateRangePicker(periodoWrap, _state.periodo.de, _state.periodo.ate, aplicarPeriodo, {hideIcon:false});
    }

    // (Re)constrói o filtro de Natureza no cabeçalho — visível apenas na aba Painel Executivo
    function montarFiltroNatureza(){
      var mostrar = _state.tab==='executivo';
      naturezaWrap.style.display = mostrar ? 'flex' : 'none';
      naturezaWrap.innerHTML = '';
      if(!mostrar || !(window.MOCK&&window.MOCK.naturezaSelectHTML)) return;
      naturezaWrap.innerHTML =
        window.MOCK.naturezaSelectHTML(_state.filtroAtend, 'data-atend-sel="1" aria-label="Natureza da guia"');
      var sel = naturezaWrap.querySelector('[data-atend-sel]');
      if(sel){
        sel.onchange=function(){
          _state.filtroAtend=sel.value; _cache=null;
          content.innerHTML=renderTab(_state.tab); if(ctx.lcIcons) ctx.lcIcons(); bindConteudo(content, irParaAba);
        };
        if(window.makeCustomSelect) window.makeCustomSelect(sel);
      }
    }

    // Barra de abas (rolável horizontalmente)
    var tabBar = el('div',{class:'rel-tab-bar'});
    tabBar.innerHTML = TABS.map(function(t){
      return '<button class="rel-tab'+(_state.tab===t.id?' active':'')+'" data-rtab="'+t.id+'">'+esc(t.label)+'</button>';
    }).join('');
    wrap.appendChild(tabBar);

    content = el('div',{class:'rel-content'});
    content.innerHTML = renderTab(_state.tab);
    wrap.appendChild(content);

    // Troca de aba reutilizável (usada pelos botões de aba e pelos KPIs clicáveis)
    function irParaAba(id){
      var btn=tabBar.querySelector('.rel-tab[data-rtab="'+id+'"]'); if(!btn) return;
      if(id!=='executivo'){ _state.filtroRisco=''; _state.filtroAtend=''; } // sair do Painel Executivo limpa os filtros
      _state.tab=id;
      tabBar.querySelectorAll('.rel-tab').forEach(function(x){x.classList.toggle('active',x===btn);});
      content.innerHTML=renderTab(id);
      if(ctx.lcIcons) ctx.lcIcons();
      bindConteudo(content, irParaAba);
      montarFiltroNatureza(); // mostra/oculta o filtro de Natureza conforme a aba
      if(window.innerWidth<=640) btn.scrollIntoView({inline:'center',block:'nearest'});
    }

    setTimeout(function(){
      tabBar.querySelectorAll('.rel-tab').forEach(function(b){
        b.onclick=function(){ irParaAba(b.getAttribute('data-rtab')); };
      });
      bindConteudo(content, irParaAba);
      montarFiltroNatureza(); // filtro de Natureza no cabeçalho (aba inicial)
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
    // KPIs clicáveis que abrem um modal de detalhe (ex.: Acima da média)
    container.querySelectorAll('.rel-kpi-click[data-drill-kpi]').forEach(function(k){
      k.onclick=function(){
        var d=k.getAttribute('data-drill-kpi');
        if(d==='prestAcimaMedia') abrirPrestAcimaMedia();
      };
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
    // filtros de ordenação dos rankings (Painel Executivo: med/prest/opme; Procedimentos: proc)
    container.querySelectorAll('.rel-sort[data-rank]').forEach(function(sel){
      // impede que o clique no select dispare o drill da linha
      sel.onclick=function(e){ e.stopPropagation(); };
      sel.onchange=function(){
        var rank=sel.getAttribute('data-rank');
        // rankings da aba Procedimentos (Proc/Opme/Mm): estado 'ord<Rank>'
        if(rank==='Proc'||rank==='Opme'||rank==='Mm'||rank==='Dt'){
          _state['ord'+rank]=sel.value;
          if(irParaAba) irParaAba('procedimentos'); return;
        }
        _state.ordExec[rank]=sel.value;
        if(irParaAba) irParaAba('executivo'); // re-renderiza mantendo a aba
      };
    });
    // busca nos rankings (re-render com debounce, mantém foco/cursor)
    container.querySelectorAll('.rel-search[data-rank]').forEach(function(inp){
      inp.onclick=function(e){ e.stopPropagation(); };
      inp.oninput=function(){
        var rank=inp.getAttribute('data-rank');
        _relBuscaFoco={rank:rank, pos:inp.selectionStart};
        if(rank==='Proc'||rank==='Opme'||rank==='Mm'||rank==='Dt'){
          _state['busca'+rank]=inp.value;
          clearTimeout(_relBuscaTimer);
          _relBuscaTimer=setTimeout(function(){ if(irParaAba) irParaAba('procedimentos'); }, 180);
          return;
        }
        _state.buscaExec[rank]=inp.value;
        clearTimeout(_relBuscaTimer);
        _relBuscaTimer=setTimeout(function(){ if(irParaAba) irParaAba('executivo'); }, 180);
      };
    });
    // clique nas barras de "Distribuição por risco" → filtra o painel (toggle)
    container.querySelectorAll('.rel-dist-click[data-risco]').forEach(function(row){
      row.onclick=function(){
        var r=row.getAttribute('data-risco');
        _state.filtroRisco = (_state.filtroRisco===r) ? '' : r; // clicar no ativo limpa
        if(irParaAba) irParaAba('executivo');
      };
    });
    // colunas da quebra Ambulatorial × Internação → toggle do filtro
    container.querySelectorAll('[data-atend]').forEach(function(btn){
      btn.onclick=function(e){
        e.stopPropagation();
        var v=btn.getAttribute('data-atend');
        _state.filtroAtend = (_state.filtroAtend===v) ? '' : v; // clicar no ativo limpa
        if(irParaAba) irParaAba('executivo');
      };
    });
    // (o filtro de Natureza agora vive no cabeçalho do módulo — ver montarFiltroNatureza)
    // botão "Limpar filtros" do banner (risco + atendimento)
    container.querySelectorAll('[data-clear-filtros]').forEach(function(btn){
      btn.onclick=function(){ _state.filtroRisco=''; _state.filtroAtend=''; if(irParaAba) irParaAba('executivo'); };
    });
    // restaura o foco no campo de busca após o re-render (evita perder a digitação)
    if(_relBuscaFoco){
      var alvo=container.querySelector('.rel-search[data-rank="'+_relBuscaFoco.rank+'"]');
      if(alvo){
        alvo.focus();
        var p=_relBuscaFoco.pos!=null?_relBuscaFoco.pos:alvo.value.length;
        try{ alvo.setSelectionRange(p,p); }catch(e){}
      }
      _relBuscaFoco=null;
    }
  }
  var _relBuscaTimer=null, _relBuscaFoco=null;

  global.RELATORIOS = { view: view };

})(window);
