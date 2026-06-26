/* RegulaAI — Aplicação principal (vanilla JS ES5/ES6) */
// @ts-nocheck
(function(){

  var DEFAULT_RISCO_CFG = {
    ativo: true,
    pesos: {
      urgencia:         10,
      uti:              8,
      opme:             7,
      prazoVencido:     7,
      aderenciaCrit:    8,
      aderenciaBaixa:   3,
      altaComplexidade: 3,
      oncologia:        5,
      intCirurgica:     6,
      intClinica:       4,
      ambulatorial:     2
    },
    // Teto = soma simples dos pesos acima = 75 pontos
    limiares: { baixo: 7, medio: 15, alto: 23 }
  };

  var FLUXO_SLA_DEFAULTS = {
    'F1': {prazo: 2 },
    'F2': {prazo: 7 },
    'F3': {prazo: 5 },
    'F4': {prazo: 5 },
    'F5': {prazo: 7 },
    'F6': {prazo: 10},
    'F7': {prazo: 3 },
    'F8': {prazo: 7 },
    'F9': {prazo: 5 }
  };

  var State = {
    route:'dashboard',
    perfil: localStorage.getItem('regula_perfil') || 'auditor',
    visaoPerfil: '',        // gestor only: ''|'enfermeiro'|'auditor'
    visaoEnfermeiros: [],  // gestor only: []=todas | ['E1','E2'...]
    riscoConfig: JSON.parse(localStorage.getItem('regula_risco_cfg')||'null') || DEFAULT_RISCO_CFG,
    etapaInstrucoes: JSON.parse(localStorage.getItem('regula_etapa_instr')||'null') || {},
    vincConfig: JSON.parse(localStorage.getItem('regula_vinc_cfg')||'null') || {},
    customDutRules: JSON.parse(localStorage.getItem('regula_custom_dut')||'null') || [],
    guiasViewTab: 'filtro',
    logsTab: 'usuarios',
    filtrosAvancados: {
      flagOpme:false, flagPrio:false, flagOpm:false, flagInternacao:false,
      flagUti:false, flagSemParam:false, flagAnexo:false, flagDut:false,
      flagAuditoriaOrigem:false, flagAguardandoAuth:false, flagAguardandoAuthEmpresa:false,
      flagAuditoriaOperadora:false, flagMsgNaoLida:false,
      flagIntercambio:false, flagDemandaJudicial:false, flagInconsistencia:false,
      status:'', nivelAuditoria:'', especialidade:'', natureza:'',
      auditor:'', tipo:'', regime:'', executante:'',
      congenere:'', classificacao:'', origem:'', solicitante:'',
      fluxo:'', etapa:'', parecer:'', statusGerencial:'',
      cotacao:'', comAnexo:'', tipoTaxa:'', statusEtapa:'',
      prestador:'', localAtendimento:'', procedimento:'',
      dataDeEmissao:'', dataAteEmissao:''
    },
    guias: MOCK.buildGuias(),
    guiasPagina: 1,
    filtros: { q:'', status:'', fluxo:'', origem:'', risco:'', benef:'', prest:'', tipo:'', congenere:'', solicitante:'', opme:'', uti:'', regimeAte:'', especialidade:'', dataDeEmissao:'', dataAteEmissao:'', sortCol:'', sortDir:'' },
    kanbanPeriodo: { de:'', ate:'' },
    dashboardPeriodo: (function(){
      var hj=new Date(), de=new Date(); de.setDate(hj.getDate()-30);
      function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
      return { de:iso(hj), ate:iso(de) };
    })(),
    kanbanFiltros: { colunas:[], uti:'', regime:'', tipo:'' },
    fluxoSLAConfig: JSON.parse(localStorage.getItem('regula_fluxo_sla')||'null') || {},
    fluxoWeights: JSON.parse(localStorage.getItem('regula_fluxo_weights')||'null') || {},
    permOverrides: JSON.parse(localStorage.getItem('regula_perm_overrides')||'null') || {}
  };

  var DEFAULT_PESOS={documental:6,dut:8,procedimento:7,pacote:5,matmed:7,diaria:5,contratual:7,historico:4};
  function getFluxoPesos(fluxoId){
    var saved=State.fluxoWeights[fluxoId];
    if(!saved) return DEFAULT_PESOS;
    var out={}, KEYS=['documental','dut','procedimento','pacote','matmed','diaria','contratual','historico'];
    for(var ki=0;ki<KEYS.length;ki++) out[KEYS[ki]]=saved[KEYS[ki]]!=null?saved[KEYS[ki]]:DEFAULT_PESOS[KEYS[ki]];
    return out;
  }

  // Recupera pareceres salvos
  var saved = JSON.parse(localStorage.getItem('regula_pareceres')||'{}');
  for(var i=0;i<State.guias.length;i++){ if(saved[State.guias[i].numero]) State.guias[i].parecerOperadora = saved[State.guias[i].numero]; }

  // Recupera estado de anexos (categoria + anotações)
  var savedAnx = JSON.parse(localStorage.getItem('regula_anexos')||'{}');
  for(var ai=0;ai<State.guias.length;ai++){
    var gg=State.guias[ai];
    for(var aj=0;aj<gg.anexosLista.length;aj++){
      var ax=gg.anexosLista[aj]; var st=savedAnx[ax.id];
      if(st){ if(st.categoria) ax.categoria=st.categoria; if(st.anotacoes) ax.anotacoes=st.anotacoes; }
    }
  }
  function persistAnexo(ax){
    var sv=JSON.parse(localStorage.getItem('regula_anexos')||'{}');
    sv[ax.id]={categoria:ax.categoria,anotacoes:ax.anotacoes};
    localStorage.setItem('regula_anexos',JSON.stringify(sv));
  }

  // Cadastro de enfermeiras — cada uma atende a um subconjunto de fluxos
  var ENFERMEIROS = [
    {id:'E1', nome:'Renata Lopes',   cor:'#0a8a43', fluxos:['F3','F4','F7'], especialidade:'Ambulatorial / Exames'},
    {id:'E2', nome:'Carla Mendonça', cor:'#2faa66', fluxos:['F2','F6'],      especialidade:'Alta Complexidade / Bariátrica'}
  ];

  var perfilDef = {
    enfermeiro: {nome: ENFERMEIROS[0].nome, cor: ENFERMEIROS[0].cor,
                 perms:['ver','triagem','complemento'],
                 fluxos: ENFERMEIROS[0].fluxos, enfermeiroId: ENFERMEIROS[0].id},
    auditor:    {nome:'Dr. Marcos Vinícius',cor:'#066b34', perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta']},
    gestor:     {nome:'Patrícia Andrade',  cor:'#054f27', perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta','config','parametrizar','logs']}
  };
  function can(act){ return perfilDef[State.perfil].perms.indexOf(act)>=0; }

  // Retorna a etapa atualmente em execução de uma guia
  function etapaAtualDe(g){
    for(var i=0;i<g.etapas.length;i++){ if(g.etapas[i].status==='em_execucao') return g.etapas[i]; }
    return g.etapas[0]||null;
  }

  // Filtra as guias visíveis de acordo com o perfil ativo
  // Enfermeiro: só guias nos seus fluxos E cuja etapa atual é de responsabilidade do enfermeiro
  // Auditor: guias cuja etapa atual é de responsabilidade do auditor (inclui fluxos sem etapa enfermeiro)
  // Gestor: tudo; se State.visaoPerfil estiver definido, aplica a mesma lógica do perfil simulado
  function guiasVisiveis(){
    var base = State.guias;
    var efetivo = State.perfil === 'gestor' ? State.visaoPerfil : State.perfil;
    if(!efetivo) return base;
    if(efetivo === 'enfermeiro'){
      // Gestor pode filtrar por enfermeira específica; perfil enfermeiro usa seu próprio cadastro
      var fluxosEnf;
      if(State.perfil==='gestor' && State.visaoEnfermeiros.length){
        // uma ou mais enfermeiras selecionadas: união dos fluxos
        fluxosEnf = ENFERMEIROS
          .filter(function(e){ return State.visaoEnfermeiros.indexOf(e.id)>=0; })
          .reduce(function(acc,e){ return acc.concat(e.fluxos); },[]);
      } else if(State.perfil==='enfermeiro'){
        var enfProp=null;
        for(var ej=0;ej<ENFERMEIROS.length;ej++){ if(ENFERMEIROS[ej].id===perfilDef.enfermeiro.enfermeiroId){enfProp=ENFERMEIROS[ej];break;} }
        fluxosEnf = enfProp ? enfProp.fluxos : [];
      } else {
        fluxosEnf = ENFERMEIROS.reduce(function(acc,e){ return acc.concat(e.fluxos); },[]);
      }
      return base.filter(function(g){
        if(fluxosEnf.indexOf(g.fluxo.id) < 0) return false;
        var et = etapaAtualDe(g);
        return et && et.responsavel === 'enfermeiro';
      });
    }
    if(efetivo === 'auditor'){
      return base.filter(function(g){
        var et = etapaAtualDe(g);
        return et && et.responsavel === 'auditor';
      });
    }
    return base;
  }

  // Barra de visão compartilhada entre Dashboard e Guias (apenas Gestor)
  function renderVisaoBar(wrap){
    var totalTodos=State.guias.length;
    var enfAtivo=State.visaoPerfil==='enfermeiro';

    // Linha principal: sempre Todos | Enfermeiros | Auditor
    var mainBar=el('div',{class:'visao-bar'});
    mainBar.innerHTML=
      '<span class="visao-bar-lbl"><span style="font-size:12px;font-weight:600;color:var(--g-700)">Visualizar:</span></span>'+
      '<span class="visao-bar-btns">'+
        '<button class="visao-btn'+(State.visaoPerfil===''?' active':'')+'" data-v="">'+
          ico('users',12)+' Todos ('+totalTodos+')</button>'+
        '<button class="visao-btn'+(enfAtivo?' active':'')+'" data-v="enfermeiro">'+
          ico('stethoscope',12)+' Enfermeiros'+(enfAtivo?' '+ico('chevron-up',11):' '+ico('chevron-down',11))+'</button>'+
        '<button class="visao-btn'+(State.visaoPerfil==='auditor'?' active':'')+'" data-v="auditor">'+
          ico('user-check',12)+' Auditor</button>'+
      '</span>';

    $$('.visao-btn',mainBar).forEach(function(b){
      b.onclick=function(){
        State.visaoPerfil=b.getAttribute('data-v');
        State.visaoEnfermeiros=[];   // sempre reseta seleção individual
        render();
      };
    });
    wrap.appendChild(mainBar);

    // Segunda linha: enfermeiras individuais — só quando "Enfermeiros" está ativo
    if(enfAtivo){
      var subBar=el('div',{class:'visao-enf-row'});
      var nSel=State.visaoEnfermeiros.length;
      subBar.innerHTML=
        '<span class="visao-enf-label">'+ico('corner-down-right',12)+
        (nSel?' <b>'+nSel+'</b> selecionada'+(nSel>1?'s':'')+':' : ' Selecione uma ou mais:')+'</span>'+
        ENFERMEIROS.map(function(e){
          var sel=State.visaoEnfermeiros.indexOf(e.id)>=0;
          return '<button class="visao-btn enf-btn'+(sel?' active':'')+'" data-enf-id="'+e.id+'"'+
            ' style="--enf-cor:'+e.cor+'">' +
            '<span class="enf-dot" style="background:'+e.cor+'"></span>'+
            esc(e.nome)+'</button>';
        }).join('')+
        (nSel?'<button class="visao-btn" id="btnEnfClear" style="font-size:11px;opacity:.7">'+ico('x',11)+' Limpar</button>':'');

      $$('.enf-btn',subBar).forEach(function(b){
        b.onclick=function(){
          var id=b.getAttribute('data-enf-id');
          var idx=State.visaoEnfermeiros.indexOf(id);
          if(idx>=0) State.visaoEnfermeiros.splice(idx,1);
          else State.visaoEnfermeiros.push(id);
          render();
        };
      });
      var clr=subBar.querySelector('#btnEnfClear');
      if(clr) clr.onclick=function(){ State.visaoEnfermeiros=[]; render(); };
      wrap.appendChild(subBar);
    }

    // Banner contextual
    if(State.visaoPerfil){
      var bann=el('div',{class:'perfil-banner info'});
      var label='';
      if(State.visaoPerfil==='enfermeiro'){
        if(State.visaoEnfermeiros.length){
          var nomes=ENFERMEIROS.filter(function(e){return State.visaoEnfermeiros.indexOf(e.id)>=0;}).map(function(e){return '<b>'+esc(e.nome.split(' ')[0])+'</b>';});
          label='Enf. '+nomes.join(' + ');
        } else {
          label='Todos os enfermeiros ('+ENFERMEIROS.map(function(e){return e.nome.split(' ')[0];}).join(', ')+')';
        }
      } else {
        label='Auditor — etapas de auditoria médica / junta médica';
      }
      var guias=guiasVisiveis();
      bann.innerHTML=ico('eye',14)+' Simulando visão: '+label+' — <b>'+guias.length+'</b> guia(s) visíveis.'+
        ' <button class="chip-rm" id="btnSairVisao2" style="font-size:12px;margin-left:8px;vertical-align:middle">Voltar visão completa</button>';
      wrap.appendChild(bann);
      setTimeout(function(){ var b=$('#btnSairVisao2'); if(b) b.onclick=function(){State.visaoPerfil='';State.visaoEnfermeiros=[];render();}; },0);
    }
  }

  /* === Aplica risco calculado ao iniciar (depois que guiaAderencia estiver disponível) === */
  // aplicarRiscos() é chamado no bindNav após DOM pronto, quando guiaAderencia já funciona.

  /* === Utilidades === */
  function $(s,r){return (r||document).querySelector(s);}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function el(tag, attrs, html){ var e=document.createElement(tag); if(attrs) for(var k in attrs){ if(k==='class') e.className=attrs[k]; else if(k==='html') e.innerHTML=attrs[k]; else e.setAttribute(k,attrs[k]); } if(html!=null) e.innerHTML=html; return e; }
  function wrapBarsScroll(scrollEl){
    var wrap=el('div',{class:'bars-scroll-wrap'});
    wrap.appendChild(scrollEl);
    function syncBottom(){
      var atBottom=scrollEl.scrollHeight-scrollEl.scrollTop-scrollEl.clientHeight<4;
      wrap.classList.toggle('at-bottom',atBottom);
    }
    scrollEl.addEventListener('scroll',syncBottom);
    scrollEl._syncBottom=syncBottom;
    setTimeout(syncBottom,0);
    return wrap;
  }
  function esc(s){ if(s==null) return ''; return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]}); }
  function mask(v){ if(State.perfil==='gestor') return v; if(!v) return ''; return v.replace(/\d(?=\d{2})/g,'•'); }
  function toast(msg,kind){ var t=el('div',{class:'toast '+(kind||'')},esc(msg)); $('#toastRoot').appendChild(t); setTimeout(function(){t.style.opacity=0; setTimeout(function(){t.remove()},300)},2800); }
  function ico(name,size){ size=size||14; return '<i data-lucide="'+name+'" width="'+size+'" height="'+size+'" style="vertical-align:middle"></i>'; }
  function icoLg(name){ return '<i data-lucide="'+name+'" width="40" height="40"></i>'; }
  function lcIcons(){ if(typeof lucide!=='undefined') lucide.createIcons(); }

  var _statusTips={
    'Em análise':             'Guia em análise técnica pelo auditor médico.',
    'Em junta médica':        'Aguardando avaliação pela junta médica multidisciplinar.',
    'Aguardando complemento': 'Prestador notificado para enviar documentação complementar. Análise suspensa.',
    'Cotação de OPME':        'Aguardando cotação de fornecedores para materiais/órteses, próteses e materiais especiais.',
    'Analisada':              'Análise técnica concluída. Aguardando decisão final da operadora.',
    'Liberada':               'Autorização emitida. Procedimento aprovado pela operadora.',
    'Negada':                 'Solicitação negada por não conformidade com critérios técnicos ou regulatórios.'
  };
  function statusBadge(s){
    var cls='muted';
    if(s==='Liberada') cls='';
    else if(s==='Negada') cls='danger';
    else if(s==='Em junta médica') cls='info';
    else if(s==='Aguardando complemento'||s==='Cotação de OPME') cls='warn';
    var tip=_statusTips[s]||('Status atual da guia: '+s);
    return '<span class="badge '+cls+'" data-tip="'+esc(tip)+'">'+esc(s)+'</span>';
  }
  function riskPill(r,guiaNumero){
    var clickable=guiaNumero!=null;
    return '<span class="risk '+r+(clickable?' risk-clickable':'')+'"'+(clickable?' data-risco-guia="'+esc(String(guiaNumero))+'" title="Clique para ver o cálculo"':'')+'>'+r.charAt(0).toUpperCase()+r.slice(1)+'</span>';
  }
  function showRiscoCalculo(g){
    var det=calcRiscoDetalhe(g);
    var lim=State.riscoConfig.limiares;
    var nivel=calcRisco(g);
    var nivelLabel={baixo:'Baixo',medio:'Médio',alto:'Alto',critico:'Crítico'}[nivel]||nivel;
    var rows=det.itens.map(function(it){
      return '<tr style="'+(it.aplica?'':'opacity:.45')+'">'+
        '<td style="padding:7px 10px;font-size:12.5px">'+(it.aplica?ico('check-circle',13):ico('minus',13))+' '+esc(it.label)+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-size:12.5px;font-weight:700">'+(it.aplica?'+'+it.peso:'0')+'</td>'+
      '</tr>';
    }).join('');
    var body=
      '<p style="font-size:13px;color:var(--muted);margin:0 0 14px">Soma dos fatores presentes nesta guia, conforme pesos configurados em <b>Configurações → Classificação de Risco</b>.</p>'+
      '<table style="width:100%;border-collapse:collapse;margin-bottom:14px">'+
        '<thead><tr><th style="text-align:left;padding:0 10px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Fator</th>'+
        '<th style="text-align:right;padding:0 10px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Pontos</th></tr></thead>'+
        '<tbody>'+rows+
        '<tr style="border-top:1.5px solid var(--g-100)"><td style="padding:9px 10px;font-weight:700">Total</td>'+
        '<td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;color:var(--g-700)">'+det.score+'</td></tr>'+
        '</tbody>'+
      '</table>'+
      '<div style="background:var(--g-50);border:1px solid var(--g-100);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--ink-2);line-height:1.7">'+
        '<b>Faixas:</b> Baixo até '+lim.baixo+' · Médio até '+lim.medio+' · Alto até '+lim.alto+' · Crítico acima de '+lim.alto+'<br>'+
        '<b>Resultado:</b> '+det.score+' pontos → <span class="risk '+nivel+'" style="margin-left:4px">'+nivelLabel+'</span>'+
      '</div>';
    modal(ico('shield-alert',16)+' Cálculo do nível de risco','Guia '+esc(g.numero),body);
  }
  document.addEventListener('click',function(e){
    var pill=e.target.closest&&e.target.closest('.risk-clickable');
    if(!pill) return;
    var numero=pill.getAttribute('data-risco-guia');
    var g=State.guias.find(function(gg){return String(gg.numero)===numero;});
    if(g) showRiscoCalculo(g);
  });
  function aderenciaBar(p){
    var cls   = p>=90?'alta':(p>=70?'mod':(p>=50?'baixa':'crit'));
    var label = p>=90?'Alta':(p>=70?'Moderada':(p>=50?'Baixa':'Crítica'));
    var tip   = 'Aderência à DUT — '+label+' ('+p+'%). '
              + 'Indica o grau de conformidade da guia com os critérios técnicos '
              + 'exigidos pela ANS. Escala: Alta 90–100% · Moderada 70–89% · Baixa 50–69% · Crítica abaixo de 50%.';
    return '<div class="ader '+cls+'" data-tip="'+tip+'" style="cursor:help">'
         + '<div class="t"><div class="f" style="width:'+p+'%"></div></div>'
         + '<div class="v">'+p+'%</div>'
         + '</div>';
  }
  // Soma os pesos por item (configurados em Procedimentos/Pacotes/Mat-Med/Diárias-Taxas)
  // vinculados a esta guia, por categoria — somado ao peso categórico do Pesos IA.
  function _itemPeso(vkey,cod,base){
    var cfg=State.vincConfig[vkey+'|'+cod];
    return (cfg&&cfg.peso!=null)?cfg.peso:base;
  }
  function getItemPesosSoma(g){
    var soma={procedimento:0,pacote:0,matmed:0,diaria:0};
    (g.procedimentos||[]).forEach(function(p){ soma.procedimento+=_itemPeso('proc',p.cod,p.peso)||0; });
    (g.pacotes||[]).forEach(function(p){ soma.pacote+=_itemPeso('pac',p.cod,p.peso)||0; });
    (g.matmed||[]).forEach(function(p){ soma.matmed+=_itemPeso('matmed',p.cod,p.peso)||0; });
    (g.diariasTaxas||[]).forEach(function(p){ soma.diaria+=_itemPeso('dt',p.cod,p.peso)||0; });
    return soma;
  }
  function guiaAderencia(g){ if(!g._cache) g._cache = AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id),itemPesosExtra:getItemPesosSoma(g)}); return g._cache.aderencia; }

  function calcRiscoDetalhe(g){
    var p=State.riscoConfig.pesos, score=0, itens=[];
    function add(label,aplica,peso){
      if(aplica) score+=+peso||0;
      itens.push({label:label,aplica:!!aplica,peso:+peso||0});
    }
    add('Regime de urgência',          g.regime==='Urgência',                                       p.urgencia);
    add('Internação em UTI',           g.uti,                                                        p.uti);
    add('OPME presente',               g.opme,                                                       p.opme);
    add('Prazo de auditoria vencido',  g.prazoVencido,                                               p.prazoVencido);
    var ad=guiaAderencia(g);
    add('Aderência crítica (< 50%)',   ad<50,                                                        p.aderenciaCrit);
    add('Aderência baixa (50–69%)',    ad>=50 && ad<70,                                              p.aderenciaBaixa);
    add('Fluxo alta complexidade',     g.fluxo.id==='F2'||g.fluxo.id==='F5',                         p.altaComplexidade);
    add('Fluxo oncologia / imunobiológico', g.fluxo.id==='F8',                                       p.oncologia);
    var _isIntCir=g.tipo==='Cirurgia'||g.tipo==='Cirurgia neuro'||g.tipo==='Cirurgia ortopédica';
    var _isIntClin=g.natureza==='Internação'&&!_isIntCir&&!g.uti;
    var _isAmb=g.natureza==='Ambulatorial'||(!g.uti&&!_isIntCir&&!_isIntClin&&g.diariasTaxas.length===0);
    add('Internação cirúrgica',        _isIntCir,   p.intCirurgica);
    add('Internação clínica',          _isIntClin,  p.intClinica);
    add('Ambulatorial',                _isAmb,      p.ambulatorial);
    return {score:score, itens:itens, aderencia:ad};
  }
  function calcRiscoScore(g){ return calcRiscoDetalhe(g).score; }

  function calcRisco(g){
    var score=calcRiscoScore(g), lim=State.riscoConfig.limiares;
    if(score<=+lim.baixo) return 'baixo';
    if(score<=+lim.medio) return 'medio';
    if(score<=+lim.alto)  return 'alto';
    return 'critico';
  }

  function aplicarRiscos(){
    if(!State.riscoConfig.ativo) return;
    State.guias.forEach(function(g){ g.risco=calcRisco(g); });
  }

  /* === Date Range Picker === */
  function makeDateRangePicker(container, initDe, initAte, onChange, opts){
    opts=opts||{};
    var _de=initDe||'', _ate=initAte||'', _step=0, _hover='';
    var now=new Date(), _vy=now.getFullYear(), _vm=now.getMonth();
    var MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    var DIAS=['D','S','T','Q','Q','S','S'];
    var _dayEls=[];
    var _statusEl=null;
    var wrapEl=el('div',{class:'drp-wrap'});
    var trigEl=el('button',{class:'drp-trigger'});
    var panEl=el('div',{class:'drp-panel'});
    wrapEl.appendChild(trigEl); wrapEl.appendChild(panEl);
    container.appendChild(wrapEl);

    function iso(y,m0,d){ var mm=m0+1; return y+'-'+(mm<10?'0':'')+mm+'-'+(d<10?'0':'')+d; }
    function br(s){ if(!s) return ''; var p=s.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
    var todayStr=iso(now.getFullYear(),now.getMonth(),now.getDate());

    function calcClass(ds){
      var cls='drp-day';
      if(ds===todayStr) cls+=' today';
      var lo=_de, hi=_ate;
      if(_step===1&&_hover){
        lo=_hover<_de?_hover:_de;
        hi=_hover>=_de?_hover:_de;
      }
      if(lo&&hi){
        if(ds===lo&&ds===hi) cls+=' range-start range-end';
        else if(ds===lo) cls+=' range-start';
        else if(ds===hi) cls+=' range-end';
        else if(ds>lo&&ds<hi) cls+=' in-range';
      } else if(_de&&ds===_de) cls+=' range-start range-end';
      return cls;
    }

    function refreshClasses(){
      _dayEls.forEach(function(item){ item.el.className=calcClass(item.ds); });
      if(_statusEl) _statusEl.textContent=_step===0?'Selecione a data inicial':'Selecione a data final';
    }

    function updateTrigger(){
      var ic=opts.hideIcon?'':ico('calendar-range',13)+' ';
      trigEl.innerHTML=ic+(_de?br(_de)+(_ate?' – '+br(_ate):'…'):'<span style="color:var(--muted)">'+(opts.placeholder||'Período')+'</span>');
      trigEl.className='drp-trigger'+(_de||_ate?' active':'');
      lcIcons();
    }

    function buildPanel(){
      _dayEls=[];
      panEl.innerHTML='';

      // Nav header
      var hd=el('div',{class:'drp-month-hd'});
      var prev=el('button',{class:'drp-nav'},'‹');
      prev.onclick=function(e){e.stopPropagation();if(_vm===0){_vm=11;_vy--;}else _vm--;buildPanel();};
      var nxt=el('button',{class:'drp-nav'},'›');
      nxt.onclick=function(e){e.stopPropagation();if(_vm===11){_vm=0;_vy++;}else _vm++;buildPanel();};
      hd.appendChild(prev);
      hd.appendChild(el('span',{class:'drp-month-name'},MESES[_vm]+' '+_vy));
      hd.appendChild(nxt);
      panEl.appendChild(hd);

      // Table calendar
      var tbl=document.createElement('table');
      tbl.className='drp-cal';
      // Header row
      var thead=document.createElement('thead');
      var hdRow=document.createElement('tr');
      DIAS.forEach(function(d){
        var th=document.createElement('th');
        th.className='drp-day-hd'; th.textContent=d;
        hdRow.appendChild(th);
      });
      thead.appendChild(hdRow); tbl.appendChild(thead);
      // Body
      var tbody=document.createElement('tbody');
      var firstDow=new Date(_vy,_vm,1).getDay();
      var daysIn=new Date(_vy,_vm+1,0).getDate();
      var row=document.createElement('tr');
      for(var e2=0;e2<firstDow;e2++){
        var et=document.createElement('td'); et.className='drp-day empty'; row.appendChild(et);
      }
      for(var d=1;d<=daysIn;d++){
        if(row.children.length===7){ tbody.appendChild(row); row=document.createElement('tr'); }
        var ds=iso(_vy,_vm,d);
        var td=document.createElement('td');
        td.className=calcClass(ds); td.textContent=String(d);
        _dayEls.push({el:td,ds:ds});
        (function(dateStr,elem){
          elem.onmouseenter=function(){if(_step===1){_hover=dateStr;refreshClasses();}};
          elem.onclick=function(e){
            e.stopPropagation();
            if(_step===0){_de=dateStr;_ate='';_step=1;_hover='';updateTrigger();refreshClasses();}
            else{
              if(dateStr<_de){var t=_de;_de=dateStr;_ate=t;}
              else if(dateStr===_de){_step=0;return;}
              else{_ate=dateStr;}
              _step=0;_hover='';
              panEl.classList.remove('open');
              updateTrigger();onChange(_de,_ate);
            }
          };
        })(ds,td);
        row.appendChild(td);
      }
      // Pad last row
      while(row.children.length>0&&row.children.length<7){
        var ep=document.createElement('td'); ep.className='drp-day empty'; row.appendChild(ep);
      }
      if(row.children.length>0) tbody.appendChild(row);
      tbl.appendChild(tbody);
      tbl.onmouseleave=function(){if(_step===1){_hover='';refreshClasses();}};
      panEl.appendChild(tbl);

      // Status
      _statusEl=el('div',{class:'drp-status'});
      _statusEl.textContent=_step===0?'Selecione a data inicial':'Selecione a data final';
      panEl.appendChild(_statusEl);

      // Footer
      if(_de||_ate){
        var foot=el('div',{class:'drp-foot'});
        var clrBtn=el('button',{class:'btn ghost'});
        clrBtn.innerHTML=ico('x',11)+' Limpar'; clrBtn.style.fontSize='11px';
        clrBtn.onclick=function(e){e.stopPropagation();_de='';_ate='';_step=0;_hover='';updateTrigger();buildPanel();onChange('','');};
        foot.appendChild(clrBtn); panEl.appendChild(foot);
      }
      lcIcons();
    }

    trigEl.onclick=function(e){
      e.stopPropagation();
      if(panEl.classList.contains('open')) panEl.classList.remove('open');
      else{buildPanel();panEl.classList.add('open');}
    };
    panEl.onclick=function(e){e.stopPropagation();};
    document.addEventListener('click',function(){panEl.classList.remove('open');});
    updateTrigger();
    return { clear:function(){_de='';_ate='';_step=0;_hover='';updateTrigger();} };
  }

  /* === Custom select === */
  function makeCustomSelect(sel){
    var wrap=el('div',{class:'csel'});
    var trigger=el('div',{class:'csel-trigger'});
    var drop=el('div',{class:'csel-drop'});

    function refreshTrigger(){
      var cur=sel.options[sel.selectedIndex];
      trigger.innerHTML=esc(cur?cur.text:'')+'<i data-lucide="chevron-down" width="11" height="11" style="vertical-align:middle;opacity:.6"></i>';
      lcIcons();
    }
    function closeAll(){ document.querySelectorAll('.csel.open').forEach(function(x){x.classList.remove('open')}); }

    Array.prototype.forEach.call(sel.options,function(o){
      var item=el('div',{class:'csel-item'+(o.selected?' active':'')});
      item.textContent=o.text;
      item.setAttribute('data-v',o.value);
      item.onclick=function(e){
        e.stopPropagation();
        sel.value=o.value;
        drop.querySelectorAll('.csel-item').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-v')===o.value)});
        refreshTrigger();
        wrap.classList.remove('open');
        sel.dispatchEvent(new Event('change'));
      };
      drop.appendChild(item);
    });

    trigger.onclick=function(e){
      e.stopPropagation();
      var wasOpen=wrap.classList.contains('open');
      closeAll();
      if(!wasOpen) wrap.classList.add('open');
    };

    refreshTrigger();
    sel.parentNode.insertBefore(wrap,sel);
    wrap.appendChild(trigger);
    wrap.appendChild(drop);
    wrap.appendChild(sel);
  }
  document.addEventListener('click',function(){ document.querySelectorAll('.csel.open').forEach(function(x){x.classList.remove('open')}); });

  /* === Sidebar collapse === */
  var _sidebarCollapsed = localStorage.getItem('regula_sidebar')==='1';
  function applySidebarState(){
    var app=document.getElementById('app');
    var btn=document.getElementById('sidebarToggle');
    if(!app||!btn) return;
    app.classList.toggle('sidebar-collapsed',_sidebarCollapsed);
    // Espelha o estado no body para que o modal (fora de #app) se alinhe ao sidebar
    document.body.classList.toggle('sidebar-collapsed',_sidebarCollapsed);
    btn.innerHTML=_sidebarCollapsed
      ?'<i data-lucide="chevron-right" width="12" height="12"></i>'
      :'<i data-lucide="chevron-left" width="12" height="12"></i>';
    btn.title=_sidebarCollapsed?'Expandir menu':'Recolher menu';
    lcIcons();
  }

  /* === Page loader === */
  var _plStart=0;
  function showPageLoader(){
    _plStart=Date.now();
    var pl=document.getElementById('pageLoader');
    if(pl) pl.classList.add('pl--in');
  }
  function hidePageLoader(){
    var pl=document.getElementById('pageLoader');
    if(!pl) return;
    var delay=Math.max(0,480-(Date.now()-_plStart));
    setTimeout(function(){ pl.classList.remove('pl--in'); },delay);
  }

  /* === Sidebar / nav === */
  function bindNav(){
    $$('.nav-item').forEach(function(a){
      if(a.id==='chatToggleBtn') return; // tratado pelo initChat
      a.onclick=function(){
        State.route=a.getAttribute('data-route');
        $$('.nav-item').forEach(function(x){x.classList.remove('active')});
        a.classList.add('active');
        render();
        window.scrollTo({top:0,behavior:'instant'});
      };
    });
    $('#globalSearch').oninput=function(){ State.filtros.q=this.value.toLowerCase(); if(State.route==='guias'||State.route==='dashboard') render(); };

    document.getElementById('sidebarToggle').onclick=function(){
      if(window.innerWidth<=640) return;
      _sidebarCollapsed=!_sidebarCollapsed;
      localStorage.setItem('regula_sidebar',_sidebarCollapsed?'1':'0');
      applySidebarState();
    };
    applySidebarState();

    // Loader double-click → abre page-loader em modo foco (blur no fundo, esfera nítida)
    var _loaderEl=document.querySelector('.loader');
    if(_loaderEl){
      _loaderEl.addEventListener('dblclick',function(e){
        e.stopPropagation();
        var pl=document.getElementById('pageLoader');
        if(!pl||pl.classList.contains('pl--focus')) return;
        var bd=document.createElement('div');
        bd.className='loader-focus-bd';
        document.body.appendChild(bd);
        pl.classList.add('pl--in','pl--focus');
        function closeFocus(){
          pl.classList.remove('pl--in','pl--focus');
          if(bd.parentNode) document.body.removeChild(bd);
          document.removeEventListener('keydown',_escHandler);
        }
        function _escHandler(ev){ if(ev.key==='Escape') closeFocus(); }
        // Clicar em qualquer parte do overlay (fora da esfera) fecha
        pl.addEventListener('click',function _plClick(ev){
          pl.removeEventListener('click',_plClick);
          closeFocus();
        });
        document.addEventListener('keydown',_escHandler);
      });
    }

    // FAB trocar perfil — dois níveis: tipo de perfil → usuário
    function fabClose(){
      var fw=$('#fabWrap'); if(!fw) return;
      fw.classList.remove('fab-open');
      var up=$('#fabUserPick'); if(up){ up.style.display='none'; up.innerHTML=''; }
      var ic=$('#fabBtn [data-lucide]');
      if(ic){ ic.setAttribute('data-lucide','users'); lcIcons(); }
    }
    function fabShowUserPick(profile){
      var fw=$('#fabWrap');
      fw.classList.remove('fab-open');
      var ic2=$('#fabBtn [data-lucide]');
      if(ic2){ ic2.setAttribute('data-lucide','users'); lcIcons(); }
      var users, label;
      if(profile==='gestor'){
        users=[{nome:perfilDef.gestor.nome, cor:perfilDef.gestor.cor, profile:'gestor', enfId:'', sub:'Acesso total'}];
        label='Gestor';
      } else if(profile==='auditor'){
        users=[{nome:perfilDef.auditor.nome, cor:perfilDef.auditor.cor, profile:'auditor', enfId:'', sub:'Auditoria médica'}];
        label='Auditor';
      } else {
        users=ENFERMEIROS.map(function(e){ return {nome:e.nome, cor:e.cor, profile:'enfermeiro', enfId:e.id, sub:e.especialidade}; });
        label='Enfermeiro';
      }
      var up=$('#fabUserPick');
      var showSearch=users.length>3;
      function buildFupList(q){
        var filtered=q?users.filter(function(u){ return u.nome.toLowerCase().indexOf(q)>=0||(u.sub&&u.sub.toLowerCase().indexOf(q)>=0); }):users;
        var list=up.querySelector('.fup-list'); list.innerHTML='';
        if(!filtered.length){ list.innerHTML='<div class="fup-empty">Nenhum resultado</div>'; return; }
        filtered.forEach(function(u){
          var isActive=(State.perfil===u.profile&&(u.profile!=='enfermeiro'||perfilDef.enfermeiro.enfermeiroId===u.enfId));
          var btn=document.createElement('button');
          btn.className='fup-item'+(isActive?' fup-active':'');
          btn.innerHTML=
            '<span class="fup-avatar" style="background:'+u.cor+'">'+esc(u.nome.charAt(0))+'</span>'+
            '<span class="fup-info"><span class="fup-name">'+esc(u.nome)+'</span>'+
              (u.sub?'<span class="fup-sub">'+esc(u.sub)+'</span>':'')+
            '</span>'+
            (isActive?'<span class="fup-check">'+ico('check',13)+'</span>':'');
          btn.onclick=function(e2){
            e2.stopPropagation();
            if(u.profile==='enfermeiro'){
              var enfSel=null;
              for(var k=0;k<ENFERMEIROS.length;k++){ if(ENFERMEIROS[k].id===u.enfId){ enfSel=ENFERMEIROS[k]; break; } }
              if(!enfSel) enfSel=ENFERMEIROS[0];
              perfilDef.enfermeiro.nome=enfSel.nome; perfilDef.enfermeiro.cor=enfSel.cor;
              perfilDef.enfermeiro.fluxos=enfSel.fluxos; perfilDef.enfermeiro.enfermeiroId=enfSel.id;
            }
            State.perfil=u.profile; State.visaoPerfil=''; State.visaoEnfermeiros=[];
            localStorage.setItem('regula_perfil',State.perfil);
            fabClose(); renderUserChip(); render();
            toast('Perfil: '+u.nome,'ok');
          };
          list.appendChild(btn);
        });
        lcIcons();
      }
      up.innerHTML=
        '<div class="fup-hd">'+
          '<button class="fup-back" id="fupBack">'+ico('arrow-left',11)+' Perfis</button>'+
          '<span class="fup-title">'+esc(label)+'</span>'+
        '</div>'+
        (showSearch?'<div class="fup-search"><input class="fup-sinput" type="text" placeholder="Buscar..." autocomplete="off"></div>':'')+
        '<div class="fup-list"></div>';
      buildFupList('');
      var sinput=up.querySelector('.fup-sinput');
      if(sinput) sinput.oninput=function(){ buildFupList(sinput.value.trim().toLowerCase()); };
      up.querySelector('#fupBack').onclick=function(e3){
        e3.stopPropagation();
        up.style.display='none'; up.innerHTML='';
        fw.classList.add('fab-open');
        var ic3=$('#fabBtn [data-lucide]');
        if(ic3){ ic3.setAttribute('data-lucide','x'); lcIcons(); }
      };
      up.style.display='block';
      lcIcons();
    }
    $('#fabBtn').onclick=function(e){
      e.stopPropagation();
      var up=$('#fabUserPick');
      if(up&&up.style.display==='block'){ fabClose(); return; }
      var fw=$('#fabWrap');
      var isOpen=fw.classList.toggle('fab-open');
      var ic=this.querySelector('[data-lucide]');
      if(ic){ ic.setAttribute('data-lucide',isOpen?'x':'users'); lcIcons(); }
    };
    document.addEventListener('click',function(e){
      var fw=$('#fabWrap'), up=$('#fabUserPick');
      if(fw&&(fw.classList.contains('fab-open')||(up&&up.style.display==='block'))&&!fw.contains(e.target)) fabClose();
    });
    $$('#fabMenu button').forEach(function(b){
      b.onclick=function(e){ e.stopPropagation(); fabShowUserPick(b.getAttribute('data-profile')); };
    });
  }

  function renderUserChip(){
    var u=perfilDef[State.perfil];
    $('#userName').textContent=u.nome;
    $('#userRole').textContent=State.perfil;
    $('#userAvatar').textContent=u.nome.charAt(0);
    $('#userAvatar').style.background=u.cor;
    // Marca ativo no FAB (perfil ativo = anel no botão do tipo de perfil)
    $$('#fabMenu button').forEach(function(b){ b.classList.remove('fab-active'); });
    var fabActive=$('#fabMenu button[data-profile="'+State.perfil+'"]');
    if(fabActive) fabActive.classList.add('fab-active');
  }

  /* === Views === */
  function render(){
    var v=$('#view'); v.innerHTML='';
    var isManual=State.route==='manual';
    v.style.padding=isManual?'0':'';
    v.style.maxWidth=isManual?'none':'';
    v.style.overflow='';
    v.style.height='';
    if(State.route==='dashboard') v.appendChild(viewDashboard());
    else if(State.route==='guias') v.appendChild(viewGuias());
    else if(State.route==='kanban') v.appendChild(viewKanban());
    else if(State.route==='param') v.appendChild(viewParam());
    else if(State.route==='logs') v.appendChild(viewLogs());
    else if(State.route==='config') v.appendChild(viewConfig());
    else if(State.route==='manual') v.appendChild(viewManual());
    lcIcons();
    atualizarBreadcrumb && atualizarBreadcrumb();
  }

  function viewDashboard(){
    var wrap=el('div');
    var dp=State.dashboardPeriodo;
    var dpLo=(dp.de&&dp.ate)?(dp.de<dp.ate?dp.de:dp.ate):(dp.de||dp.ate);
    var dpHi=(dp.de&&dp.ate)?(dp.de<dp.ate?dp.ate:dp.de):(dp.de||dp.ate);
    var guias=guiasVisiveis().filter(function(g){
      if(dpLo&&g.dataEmissao<dpLo) return false;
      if(dpHi&&g.dataEmissao>dpHi) return false;
      return true;
    });
    var tituloExtra='';
    if(State.perfil==='gestor' && State.visaoPerfil) tituloExtra=' <span class="badge info">Visão: '+State.visaoPerfil+'</span>';
    var hdr=el('div',{class:'page-title'},'<div><h1>Dashboard Executivo'+tituloExtra+'</h1><p>Visão consolidada de auditoria assistencial e indicadores operacionais.</p></div>');
    var dpWrap=el('div',{id:'dashPeriodoWrap',style:'display:flex;align-items:center'});
    hdr.appendChild(dpWrap);
    wrap.appendChild(hdr);
    makeDateRangePicker(
      dpWrap,
      dp.de, dp.ate,
      function(de,ate){ State.dashboardPeriodo={de:de,ate:ate}; render(); },
      {hideIcon:true}
    );

    // Banner de contexto de perfil
    if(State.perfil!=='gestor'){
      var bann=el('div',{class:'perfil-banner'});
      var bIcon=State.perfil==='enfermeiro'?'stethoscope':'search';
      var bMsg=State.perfil==='enfermeiro'
        ?'Você está visualizando '+guias.length+' guia(s) atribuída(s) ao perfil Enfermeiro nos fluxos: '+perfilDef.enfermeiro.fluxos.join(', ')+'.'
        :'Você está visualizando '+guias.length+' guia(s) atribuída(s) ao perfil Auditor (etapas de auditoria médica e junta médica).';
      bann.innerHTML=ico(bIcon,14)+' '+bMsg;
      wrap.appendChild(bann);
    }

    // Seletor de visão para Gestor
    if(State.perfil==='gestor') renderVisaoBar(wrap);

    function count(fn){ return guias.filter(fn).length; }
    var refreshDuracao=null;
    var tempoMedio=guias.length?( guias.reduce(function(a,g){return a+g.diasAuditoria},0)/guias.length).toFixed(1):'—';
    var kpis=[
      {t:'Total de guias',          v:guias.length,                                              cls:'',       fn:function(g){return true;}},
      {t:'Em análise',              v:count(function(g){return g.status==='Em análise'}),         cls:'',       fn:function(g){return g.status==='Em análise';}},
      {t:'Em junta médica',         v:count(function(g){return g.status==='Em junta médica'}),    cls:'info',   fn:function(g){return g.status==='Em junta médica';}},
      {t:'Aguardando complemento',  v:count(function(g){return g.status==='Aguardando complemento'}), cls:'warn', fn:function(g){return g.status==='Aguardando complemento';}},
      {t:'Analisadas',              v:count(function(g){return g.status==='Analisada'}),          cls:'info',   fn:function(g){return g.status==='Analisada';}},
      {t:'Liberadas',               v:count(function(g){return g.status==='Liberada'}),           cls:'',       fn:function(g){return g.status==='Liberada';}},
      {t:'Negadas',                 v:count(function(g){return g.status==='Negada'}),             cls:'danger', fn:function(g){return g.status==='Negada';}},
      {t:'Com OPME',                v:count(function(g){return g.opme}),                          cls:'warn',   fn:function(g){return !!g.opme;},                                  extra:'opme'},
      {t:'Cotação de OPME',         v:count(function(g){return g.status==='Cotação de OPME'}),    cls:'warn',   fn:function(g){return g.status==='Cotação de OPME';},              extra:'opme'},
      {t:'Baixa aderência',         v:count(function(g){return guiaAderencia(g)<70}),             cls:'danger', fn:function(g){return guiaAderencia(g)<70;},                       extra:'aderencia'},
      {t:'Tempo médio (dias)',       v:tempoMedio,                                                 cls:'info',   fn:function(g){return true;},                                      extra:'tempo'},
      {t:'Etapa com gargalo',        v:'Aud. Prévia',                                              cls:'warn',   fn:function(g){var et=g.etapas&&g.etapas.filter(function(e){return e.status==='Em andamento';})[0]; return !!(et&&et.nome&&et.nome.indexOf('AUD')>=0);}, extra:'etapa'}
    ];

    function kpiModal(k){
      var list=guias.filter(k.fn).slice().sort(function(a,b){return b.diasAuditoria-a.diasAuditoria;});
      var prest=function(g){return ((g.prestadorExe||g.prestadorSol)||{}).nome||'—';};
      var fluxoNome=function(g){return (g.fluxo||{}).nome||'—';};
      var adBadge=function(g){
        var a=guiaAderencia(g);
        var c=a>=85?'#054f27':a>=70?'#8a6300':'#a01b14';
        return '<b style="color:'+c+'">'+a+'%</b>';
      };
      var etapaAtual=function(g){
        if(!g.etapas) return '—';
        var e=g.etapas.filter(function(x){return x.status==='Em andamento';})[0];
        return e?e.nome:'—';
      };

      var cols;
      if(k.extra==='tempo'){
        cols=[
          {h:'Nº Guia',        f:function(g){return esc(g.numero);}},
          {h:'Beneficiário',   f:function(g){return esc(g.beneficiario.nome);}},
          {h:'Prestador',      f:function(g){return esc(prest(g));}},
          {h:'Status',         f:function(g){return statusBadge(g.status);}},
          {h:'Dias em auditoria',f:function(g){return '<b>'+g.diasAuditoria+'</b>';}},
          {h:'Aderência',      f:function(g){return adBadge(g);}}
        ];
      } else if(k.extra==='aderencia'){
        list=list.slice().sort(function(a,b){return guiaAderencia(a)-guiaAderencia(b);});
        cols=[
          {h:'Nº Guia',      f:function(g){return esc(g.numero);}},
          {h:'Beneficiário', f:function(g){return esc(g.beneficiario.nome);}},
          {h:'Fluxo',        f:function(g){return esc(fluxoNome(g));}},
          {h:'Status',       f:function(g){return statusBadge(g.status);}},
          {h:'Aderência',    f:function(g){return adBadge(g);}}
        ];
      } else if(k.extra==='opme'){
        cols=[
          {h:'Nº Guia',      f:function(g){return esc(g.numero);}},
          {h:'Beneficiário', f:function(g){return esc(g.beneficiario.nome);}},
          {h:'Prestador',    f:function(g){return esc(prest(g));}},
          {h:'Tipo',         f:function(g){return esc(g.tipo);}},
          {h:'Status',       f:function(g){return statusBadge(g.status);}},
          {h:'OPME',         f:function(g){return g.opme?'<span class="badge warn">Sim</span>':'<span class="badge muted">Não</span>';}}
        ];
      } else if(k.extra==='etapa'){
        // Ranking de gargalos — substituído por render especial abaixo
        cols=null;
      } else {
        cols=[
          {h:'Nº Guia',      f:function(g){return esc(g.numero);}},
          {h:'Beneficiário', f:function(g){return esc(g.beneficiario.nome);}},
          {h:'Prestador',    f:function(g){return esc(prest(g));}},
          {h:'Tipo',         f:function(g){return esc(g.tipo);}},
          {h:'Status',       f:function(g){return statusBadge(g.status);}},
          {h:'Aderência',    f:function(g){return adBadge(g);}}
        ];
      }

      // ── Etapa com gargalo: ranking analítico ────────────────────────────────
      if(k.extra==='etapa'){
        // Acumula horas por etapa em todas as guias
        var rankMap={};
        guias.forEach(function(g){
          (g.etapas||[]).forEach(function(e){
            if(e.status==='aguardando') return;
            var horas=e.horasReais||0;
            if(e.status==='em_execucao') horas=g.diasAuditoria*24; // tempo parado até agora
            if(!rankMap[e.nome]) rankMap[e.nome]={nome:e.nome,totalH:0,cnt:0,stuck:0,prazo:e.prazoHoras||24};
            rankMap[e.nome].totalH+=horas;
            rankMap[e.nome].cnt++;
            if(e.status==='em_execucao') rankMap[e.nome].stuck++;
          });
        });
        var ranking=Object.keys(rankMap).map(function(n){
          var r=rankMap[n];
          return {nome:n,media:Math.round(r.totalH/r.cnt),cnt:r.cnt,stuck:r.stuck,prazo:r.prazo};
        }).sort(function(a,b){return b.media-a.media;}).slice(0,10);

        var maxH=ranking.length?ranking[0].media:1;
        function fmtH(h){return h>=48?Math.round(h/24)+'d':h+'h';}
        var rankHTML='<div style="display:flex;flex-direction:column;gap:6px;padding:4px 0">';
        ranking.forEach(function(r,idx){
          var pct=Math.round(r.media/maxH*100);
          var overPrazo=r.media>r.prazo;
          var barColor=overPrazo?'#e53935':'var(--g-400)';
          rankHTML+=
            '<div style="display:grid;grid-template-columns:22px 1fr 60px 70px;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:'+(idx%2===0?'var(--g-50)':'#fff')+'">'+
              '<span style="font-size:13px;font-weight:700;color:var(--muted);text-align:right">#'+(idx+1)+'</span>'+
              '<div>'+
                '<div style="font-size:12.5px;font-weight:600;color:var(--g-800);margin-bottom:4px">'+esc(r.nome)+'</div>'+
                '<div style="background:var(--g-100);border-radius:99px;height:6px;overflow:hidden">'+
                  '<div style="width:'+pct+'%;height:100%;background:'+barColor+';border-radius:99px;transition:width .4s"></div>'+
                '</div>'+
              '</div>'+
              '<div style="text-align:right">'+
                '<div style="font-size:14px;font-weight:700;color:'+(overPrazo?'#a01b14':'var(--g-800)')+'">'+fmtH(r.media)+'</div>'+
                '<div style="font-size:10px;color:var(--muted)">média</div>'+
              '</div>'+
              '<div style="text-align:center">'+
                (r.stuck?'<span class="badge danger" style="font-size:10px">'+r.stuck+' parada'+(r.stuck>1?'s':'')+'</span>':'<span class="badge muted" style="font-size:10px">'+r.cnt+' passaram</span>')+
              '</div>'+
            '</div>';
        });
        rankHTML+='</div>';

        var rankFoot=
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;font-size:11.5px;color:var(--muted)">'+
            '<span style="flex:1;min-width:200px">'+ico('info',11)+' Barras em <span style="color:#e53935;font-weight:600">vermelho</span> indicam etapas acima do prazo configurado. Clique em uma linha para ver as guias nessa etapa.</span>'+
            '<span style="white-space:nowrap;font-weight:600;color:var(--g-700)">'+ranking.length+' etapas · '+ranking.filter(function(r){return r.stuck>0;}).length+' com guias paradas agora</span>'+
          '</div>';

        var m=modal('Ranking de Gargalos','Tempo médio por etapa — '+guias.length+' guias analisadas', rankHTML, rankFoot);
        setTimeout(function(){
          $$('[data-etapa]',m).forEach(function(row){
            row.style.cursor='pointer';
            row.onclick=function(){
              var nome=row.getAttribute('data-etapa');
              var sub=guias.filter(function(g){
                return (g.etapas||[]).some(function(e){return e.nome===nome&&e.status==='em_execucao';});
              });
              if(sub.length){
                var t2='<table style="width:100%"><thead><tr><th>Nº Guia</th><th>Beneficiário</th><th>Dias</th><th>Status</th></tr></thead><tbody>'+
                  sub.map(function(g,i){return '<tr class="'+(i%2===0?'log-row-a':'log-row-b')+' kpi-modal-row" data-num="'+esc(g.numero)+'"><td>'+esc(g.numero)+'</td><td>'+esc(g.beneficiario.nome)+'</td><td><b>'+g.diasAuditoria+'</b></td><td>'+statusBadge(g.status)+'</td></tr>';}).join('')+
                  '</tbody></table>';
                var m2=modal(esc(nome),'Guias paradas nesta etapa',t2,sub.length+' guia(s)');
                setTimeout(function(){
                  $$('.kpi-modal-row',m2).forEach(function(tr){
                    tr.onclick=function(){var g=guias.filter(function(x){return x.numero===tr.getAttribute('data-num');})[0];if(g)openGuia(g,'etapas');};
                  });
                },0);
              }
            };
          });
        },0);
        return;
      }

      var thead='<thead><tr>'+cols.map(function(c){return '<th>'+esc(c.h)+'</th>';}).join('')+'</tr></thead>';
      var tbody;
      if(!list.length){
        tbody='<tbody><tr><td colspan="'+cols.length+'"><div class="empty">'+icoLg('inbox')+'<div>Nenhuma guia para este indicador.</div></div></td></tr></tbody>';
      } else {
        tbody='<tbody>'+list.map(function(g,i){
          return '<tr class="'+(i%2===0?'log-row-a':'log-row-b')+' kpi-modal-row" data-num="'+esc(g.numero)+'">'+
            cols.map(function(c){return '<td>'+c.f(g)+'</td>';}).join('')+
          '</tr>';
        }).join('')+'</tbody>';
      }
      var footTxt=list.length+' guia(s)';
      if(k.extra==='tempo'&&list.length) footTxt+=' · Tempo médio: <b>'+tempoMedio+' dias</b>';
      var m=modal(k.t, list.length+' guia(s) — clique em uma linha para abrir',
        '<table style="width:100%">'+thead+tbody+'</table>',
        footTxt
      );
      setTimeout(function(){
        $$('.kpi-modal-row',m).forEach(function(tr){
          tr.style.cursor='pointer';
          tr.onclick=function(){
            var num=tr.getAttribute('data-num');
            var g=guias.filter(function(x){return x.numero===num;})[0];
            if(g) openGuia(g,'resumo');
          };
        });
      },0);
    }

    var grid=el('div',{class:'kpi-grid'});
    kpis.forEach(function(k){
      var card=el('div',{class:'kpi '+k.cls},'<h4>'+esc(k.t)+'</h4><div class="v">'+esc(k.v)+'</div>');
      // Distingue clique de arrastar (seleção de texto)
      var _mx=0,_my=0;
      card.addEventListener('mousedown',function(e){_mx=e.clientX;_my=e.clientY;});
      card.addEventListener('click',function(e){
        var dx=e.clientX-_mx, dy=e.clientY-_my;
        if(Math.sqrt(dx*dx+dy*dy)>6) return; // foi arrastar
        kpiModal(k);
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    var panels=el('div',{class:'panels'});

    // Distribuição por status (barras)
    var pa=el('div',{class:'panel'},'<h3>Distribuição por status</h3>');
    var bars=el('div',{class:'bars'});
    MOCK.STATUS.forEach(function(s){
      var c=count(function(g){return g.status===s}); if(c===0) return;
      var pct=Math.round(c/guias.length*100);
      var row=el('div',{class:'bar-row',style:'cursor:pointer',title:'Clique: ver guias com status "'+esc(s)+'"'},'<div>'+esc(s)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div>'+c+'</div>');
      row.onclick=function(){
        if(window.getSelection&&window.getSelection().toString()) return;
        State.filtros={q:'',status:s,fluxo:'',origem:'',risco:'',sortCol:'',sortDir:''};
        State.route='guias';
        $$('.nav-item').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-route')==='guias')});
        toast('Filtrando guias por status: '+s,'ok'); render();
      };
      row.querySelector('.bar-track').onclick=function(e){
        e.stopPropagation();
        var fill=this.querySelector('.bar-fill');
        var isActive=fill.classList.contains('bar-selected');
        $$('.bar-fill').forEach(function(x){x.classList.remove('bar-selected')});
        $$('.bar-row').forEach(function(x){x.classList.remove('bar-active')});
        $$('.bars').forEach(function(x){x.classList.remove('has-selection')});
        if(!isActive){
          fill.classList.add('bar-selected');
          row.classList.add('bar-active');
          bars.classList.add('has-selection');
          var _fg=guias.filter(function(g){return g.status===s;});
          updateDonut(_fg,s);
          if(refreshDuracao) refreshDuracao(_fg,s);
        } else {
          updateDonut(guias,null);
          if(refreshDuracao) refreshDuracao(guias,null);
        }
      };
      bars.appendChild(row);
    });
    pa.appendChild(bars); panels.appendChild(pa);

    // Donut de aderência média
    var avg=guias.length?Math.round(guias.reduce(function(a,g){return a+guiaAderencia(g)},0)/guias.length):0;
    var pb=el('div',{class:'panel',style:'text-align:center'},'<h3 style="text-align:left">Aderência regulatória média</h3>');
    var donutEl=el('div',{class:'donut',id:'donut-aderencia',style:'--p:'+avg},'<span>'+avg+'%</span>');
    var avgCls=AI.classificaAderencia(avg);
    var clrMap={alta:'var(--g-700)',mod:'#8a6300',baixa:'#a85700',crit:'var(--danger)'};
    var donutLblEl=el('div',{id:'donut-label',style:'font-size:13px;font-weight:700;letter-spacing:.2px;color:'+(clrMap[avgCls.cls]||'var(--g-600)')},avgCls.label);
    var donutLegend=el('div',{style:'margin-top:14px;display:flex;flex-direction:column;gap:4px;text-align:left;border-top:1px solid var(--g-100);padding-top:11px'});
    donutLegend.innerHTML=
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:3px">Faixas de classificação</div>'+
      '<div style="display:flex;align-items:center;gap:7px;font-size:11.5px"><span style="width:9px;height:9px;border-radius:50%;background:var(--g-500);flex-shrink:0;display:inline-block"></span><span style="color:var(--ink)">Alta</span><span style="margin-left:auto;color:var(--muted)">&ge; 90%</span></div>'+
      '<div style="display:flex;align-items:center;gap:7px;font-size:11.5px"><span style="width:9px;height:9px;border-radius:50%;background:#8a6300;flex-shrink:0;display:inline-block"></span><span style="color:var(--ink)">Moderada</span><span style="margin-left:auto;color:var(--muted)">70 – 89%</span></div>'+
      '<div style="display:flex;align-items:center;gap:7px;font-size:11.5px"><span style="width:9px;height:9px;border-radius:50%;background:#a85700;flex-shrink:0;display:inline-block"></span><span style="color:var(--ink)">Baixa</span><span style="margin-left:auto;color:var(--muted)">50 – 69%</span></div>'+
      '<div style="display:flex;align-items:center;gap:7px;font-size:11.5px"><span style="width:9px;height:9px;border-radius:50%;background:var(--danger);flex-shrink:0;display:inline-block"></span><span style="color:var(--ink)">Crítica</span><span style="margin-left:auto;color:var(--muted)">&lt; 50%</span></div>';
    pb.appendChild(donutEl); pb.appendChild(donutLblEl); pb.appendChild(donutLegend);
    panels.appendChild(pb);
    var _donutCur=avg, _donutTimer=null, _tipGuias=guias;
    function updateDonut(filteredGs, filterName){
      _tipGuias=filteredGs;
      var d=document.getElementById('donut-aderencia'), l=document.getElementById('donut-label');
      if(!d||!l) return;
      var a=filteredGs.length?Math.round(filteredGs.reduce(function(acc,g){return acc+guiaAderencia(g)},0)/filteredGs.length):0;
      clearInterval(_donutTimer);
      var from=_donutCur, to=a, dir=from<to?1:-1;
      if(from===to){ l.textContent=AI.classificaAderencia(a).label+(filterName?' · '+filterName:''); return; }
      _donutTimer=setInterval(function(){
        from+=dir;
        d.style.setProperty('--p',from);
        d.querySelector('span').textContent=from+'%';
        if(from===to){ clearInterval(_donutTimer); _donutCur=to; var fc=AI.classificaAderencia(to); var cm={alta:'var(--g-700)',mod:'#8a6300',baixa:'#a85700',crit:'var(--danger)'}; l.textContent=fc.label+(filterName?' · '+filterName:''); l.style.color=cm[fc.cls]||'var(--g-600)'; }
      },12);
    }
    wrap.appendChild(panels);

    // Tooltip donut aderência
    var donutTip=el('div',{class:'donut-tip'});
    document.body.appendChild(donutTip);
    function buildDonutTip(gs){
      var n=gs.length; if(!n) return '<em style="color:var(--muted)">Sem guias no filtro</em>';
      var alta=0,mod=0,baixa=0,crit=0,motivos={};
      gs.forEach(function(g){
        var a=guiaAderencia(g);
        var cache=g._cache; if(!cache){ cache=AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)}); g._cache=cache; }
        if(a>=90) alta++; else if(a>=70) mod++; else if(a>=50) baixa++; else crit++;
        cache.criteriosNaoCumpridos.forEach(function(c){ motivos[c]=(motivos[c]||0)+1; });
      });
      var pct=function(v){ return Math.round(v/n*100)+'%'; };
      var h='<div class="donut-tip-title">Distribuição das '+n+' guias</div>';
      if(alta) h+='<div class="donut-tip-row alta"><span class="donut-tip-dot"></span><span>Alta &ge;90%</span><b style="margin-left:auto">'+alta+' &nbsp;('+pct(alta)+')</b></div>';
      if(mod)  h+='<div class="donut-tip-row mod"><span class="donut-tip-dot"></span><span>Moderada 70–89%</span><b style="margin-left:auto">'+mod+' &nbsp;('+pct(mod)+')</b></div>';
      if(baixa)h+='<div class="donut-tip-row baixa"><span class="donut-tip-dot"></span><span>Baixa 50–69%</span><b style="margin-left:auto">'+baixa+' &nbsp;('+pct(baixa)+')</b></div>';
      if(crit) h+='<div class="donut-tip-row crit"><span class="donut-tip-dot"></span><span>Crítica &lt;50%</span><b style="margin-left:auto">'+crit+' &nbsp;('+pct(crit)+')</b></div>';
      var top=Object.keys(motivos).sort(function(a,b){return motivos[b]-motivos[a];}).slice(0,4);
      if(top.length){
        h+='<div class="donut-tip-sep"></div><div class="donut-tip-title">Principais fatores de redução</div>';
        top.forEach(function(m){ h+='<div class="donut-tip-factor">· '+esc(m)+'<b style="float:right;margin-left:10px">'+motivos[m]+' guia'+(motivos[m]!==1?'s':'')+'</b></div>'; });
      }
      h+='<div class="donut-tip-sep"></div><div class="donut-tip-title">Como é calculado</div>'+
        '<div style="font-size:11px;color:var(--ink);line-height:1.55;margin-top:3px">'+
          'A IA pontua cada guia em <b>5 dimensões</b>: documentação, DUT, vinculações de procedimentos, Mat/Med e cobertura contratual. Cada dimensão tem um <b>peso proporcional</b> ao seu impacto regulatório.'+
        '</div>'+
        '<div style="font-size:10.5px;color:var(--muted);margin-top:7px;line-height:1.6">'+
          '<span style="color:var(--g-600);font-weight:700">Alta (&ge;90%)</span> — todos os critérios essenciais atendidos, sem pendências documentais.<br>'+
          '<span style="color:#8a6300;font-weight:700">Moderada (70–89%)</span> — pequenas lacunas, geralmente documentais ou em itens secundários.<br>'+
          '<span style="color:#a85700;font-weight:700">Baixa (50–69%)</span> — critérios importantes ausentes; requer complemento do prestador.<br>'+
          '<span style="color:var(--danger);font-weight:700">Crítica (&lt;50%)</span> — falhas significativas; indicado encaminhamento para junta médica.'+
        '</div>';
      return h;
    }
    function positionDonutTip(clientX,clientY){
      var PAD=10;
      var tw=donutTip.offsetWidth, th=donutTip.offsetHeight;
      var vw=window.innerWidth, vh=window.innerHeight;
      // prefer right of cursor, fall back to left
      var tx=clientX+18;
      if(tx+tw>vw-PAD) tx=clientX-tw-14;
      if(tx<PAD) tx=PAD;
      // prefer below cursor, fall back to above
      var ty=clientY-14;
      if(ty+th>vh-PAD) ty=vh-th-PAD;
      if(ty<PAD) ty=PAD;
      donutTip.style.left=tx+'px'; donutTip.style.top=ty+'px';
    }
    var _isTouchDevice=window.matchMedia&&window.matchMedia('(hover: none)').matches;
    if(!_isTouchDevice){
      pb.addEventListener('mouseenter',function(){
        donutTip.innerHTML=buildDonutTip(_tipGuias);
        donutTip.classList.add('visible');
      });
      pb.addEventListener('mousemove',function(e){ positionDonutTip(e.clientX,e.clientY); });
      pb.addEventListener('mouseleave',function(){ donutTip.classList.remove('visible'); });
    } else {
      // Mobile/touch: cada toque na div alterna a tooltip (abre/fecha); toque fora fecha.
      pb.addEventListener('click',function(e){
        e.stopPropagation();
        var willOpen=!donutTip.classList.contains('visible');
        donutTip.classList.remove('visible');
        if(willOpen){
          donutTip.innerHTML=buildDonutTip(_tipGuias);
          var r=pb.getBoundingClientRect();
          positionDonutTip(r.left+r.width/2,r.top+r.height/2);
          donutTip.classList.add('visible');
        }
      });
      document.addEventListener('click',function(e){
        if(!pb.contains(e.target)) donutTip.classList.remove('visible');
      });
    }

    // ── Ranking fluxos ────────────────────────────────────────────────────────
    var pc=el('div',{class:'panel'});
    var pcH3=el('h3');
    pc.appendChild(pcH3);
    var fluxoCount={}; guias.forEach(function(g){fluxoCount[g.fluxo.nome]=(fluxoCount[g.fluxo.nome]||0)+1});
    var fluxoById={}; MOCK.FLUXOS.forEach(function(f){fluxoById[f.nome]=f.id});
    var br=el('div',{class:'bars bars-scroll'});
    pc.appendChild(wrapBarsScroll(br));
    var pcLegRow=el('div',{class:'dur-legend'});
    pcLegRow.innerHTML='<div class="dur-sla-ref">'+ico('lightbulb',10)+' Dica: clique em uma barra de status ou fluxo para abrir a relação filtrada de guias.</div>';
    pc.appendChild(pcLegRow);

    State.fluxoSortDir = State.fluxoSortDir || 'desc';
    function buildFluxoBars(){
      pcH3.innerHTML='Fluxos mais utilizados '+
        '<span style="display:flex;align-items:center;gap:8px">'+
          '<button class="sort-toggle" id="fluxoSortBtn" title="Alternar ordenação">'+ico(State.fluxoSortDir==='desc'?'arrow-down-wide-narrow':'arrow-up-narrow-wide',12)+' '+(State.fluxoSortDir==='desc'?'Mais usados':'Menos usados')+'</button>'+
        '</span>';
      br.innerHTML='';
      var dir=State.fluxoSortDir==='desc'?-1:1;
      Object.keys(fluxoCount).sort(function(a,b){return dir*(fluxoCount[a]-fluxoCount[b])}).forEach(function(k){
        var c=fluxoCount[k], pct=Math.round(c/guias.length*100);
        var row=el('div',{class:'bar-row',style:'cursor:pointer',title:'Clique: ver guias do fluxo "'+esc(k)+'"'},'<div>'+esc(k)+'</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%"></div></div><div>'+c+'</div>');
        row.onclick=function(){
          if(window.getSelection&&window.getSelection().toString()) return;
          State.filtros={q:'',status:'',fluxo:fluxoById[k]||'',origem:'',risco:'',sortCol:'',sortDir:''};
          State.route='guias';
          $$('.nav-item').forEach(function(x){x.classList.toggle('active',x.getAttribute('data-route')==='guias')});
          toast('Filtrando guias por fluxo: '+k,'ok'); render();
        };
        row.querySelector('.bar-track').onclick=function(e){
          e.stopPropagation();
          var fill=this.querySelector('.bar-fill');
          var isActive=fill.classList.contains('bar-selected');
          $$('.bar-fill').forEach(function(x){x.classList.remove('bar-selected')});
          $$('.bar-row').forEach(function(x){x.classList.remove('bar-active')});
          $$('.bars').forEach(function(x){x.classList.remove('has-selection')});
          if(!isActive){
            fill.classList.add('bar-selected');
            row.classList.add('bar-active');
            br.classList.add('has-selection');
            var _fgk=guias.filter(function(g){return g.fluxo.nome===k;});
            var _klbl=k.length>25?k.slice(0,23)+'…':k;
            updateDonut(_fgk,_klbl);
            if(refreshDuracao) refreshDuracao(_fgk,_klbl);
          } else {
            updateDonut(guias,null);
            if(refreshDuracao) refreshDuracao(guias,null);
          }
        };
        br.appendChild(row);
      });
      var fluxoSortBtn=pcH3.querySelector('#fluxoSortBtn');
      if(fluxoSortBtn) fluxoSortBtn.onclick=function(){ State.fluxoSortDir=State.fluxoSortDir==='desc'?'asc':'desc'; buildFluxoBars(); lcIcons(); };
      lcIcons();
      if(br._syncBottom) setTimeout(br._syncBottom,0);
    }
    buildFluxoBars();

    // ── Duração dos subfluxos (etapas) ──────────────────────────────────────────
    var pd=el('div',{class:'panel'});
    var pdH3=el('h3');
    pd.appendChild(pdH3);
    var dBars=el('div',{class:'bars dur-bars bars-scroll'});
    pd.appendChild(wrapBarsScroll(dBars));
    var legRow=el('div',{class:'dur-legend'});
    legRow.innerHTML='<div class="dur-sla-ref">'+ico('flag',10)+' Linha vermelha = prazo padrão da etapa. Barras além dela indicam risco de prazo.</div>';
    pd.appendChild(legRow);

    State.duracaoSortDir = State.duracaoSortDir || 'desc';
    var _lastDurArgs=[guias,null];
    function buildDurBars(gsToUse, filterLabel){
      _lastDurArgs=[gsToUse,filterLabel];
      var eHoras={};
      gsToUse.forEach(function(g){
        (g.etapas||[]).forEach(function(et){
          if(!et.horasReais) return;
          if(!eHoras[et.nome]) eHoras[et.nome]={nome:et.nome,horas:[],prazoHoras:et.prazoHoras};
          eHoras[et.nome].horas.push(et.horasReais);
        });
      });
      var eStats=[];
      Object.keys(eHoras).forEach(function(nome){
        var ed=eHoras[nome]; var horas=ed.horas; var slaDias=ed.prazoHoras/24;
        var dias=horas.map(function(h){return h/24;});
        var sum=dias.reduce(function(acc2,x){return acc2+x;},0);
        var avg2=sum/dias.length;
        eStats.push({
          nome:nome, avg:avg2, sla:slaDias,
          max:Math.max.apply(null,dias), min:Math.min.apply(null,dias),
          count:dias.length,
          acimaSLA:dias.filter(function(d){return d>slaDias;}).length
        });
      });
      var durDir=State.duracaoSortDir==='desc'?-1:1;
      eStats.sort(function(a,b){return durDir*(a.avg-b.avg);});
      var mxAvg=eStats.length?Math.max.apply(null,eStats.map(function(es){return es.avg;})):5;
      var mxSLA=eStats.reduce(function(m,es){return Math.max(m,es.sla);},5);
      var rfMax=Math.max(mxAvg,mxSLA)*1.35;

      pdH3.innerHTML='<span>Duração dos subfluxos</span>'+
        '<span style="display:flex;align-items:center;gap:8px">'+
          '<button class="sort-toggle" id="duracaoSortBtn" title="Alternar ordenação">'+ico(State.duracaoSortDir==='desc'?'arrow-down-wide-narrow':'arrow-up-narrow-wide',12)+' '+(State.duracaoSortDir==='desc'?'Maior duração':'Menor duração')+'</button>'+
          (filterLabel?'<span class="badge warn" style="font-size:10px;margin-left:4px">'+esc(filterLabel)+'</span>':'')+
        '</span>';
      dBars.innerHTML='';
      if(!eStats.length){
        dBars.innerHTML='<div style="padding:18px 0;text-align:center;color:var(--muted);font-size:13px">Sem guias no filtro selecionado.</div>';
        lcIcons(); if(dBars._syncBottom) setTimeout(dBars._syncBottom,0); return;
      }
      eStats.forEach(function(es){
        var barPct=Math.round((es.avg/rfMax)*100);
        var slaPct2=Math.round((es.sla/rfMax)*100);
        var gradFrom,gradTo;
        if(es.avg<=es.sla*0.6){gradFrom='#86efac';gradTo='var(--g-500)';}
        else if(es.avg<=es.sla){gradFrom='#fde68a';gradTo='#d4a017';}
        else if(es.avg<=es.sla*1.4){gradFrom='#fcd34d';gradTo='#d97706';}
        else{gradFrom='#fca5a5';gradTo='var(--danger)';}
        var stClr=es.avg<=es.sla?'var(--g-600)':'var(--danger)';
        var sn=es.nome.length>62?es.nome.slice(0,60)+'…':es.nome;
        var tip=es.nome+'\n'+
          'Parametrização: '+es.count+' etapa(s)\n'+
          'Prazo: '+es.sla.toFixed(1)+' d\n'+
          'Média: '+es.avg.toFixed(1)+' d\n'+
          'Acima do prazo: '+es.acimaSLA;
        var row=el('div',{class:'bar-row dur-row','data-tip':tip});
        row.innerHTML=
          '<div class="dur-name">'+esc(sn)+'</div>'+
          '<div class="dur-track">'+
            '<div class="dur-fill" style="width:'+barPct+'%;background:linear-gradient(90deg,'+gradFrom+','+gradTo+')"></div>'+
            '<div class="dur-sla-line" style="left:'+slaPct2+'%"></div>'+
          '</div>'+
          '<div class="dur-meta" style="color:'+stClr+'">'+es.avg.toFixed(1)+'d</div>';
        dBars.appendChild(row);
      });
      var duracaoSortBtn=pdH3.querySelector('#duracaoSortBtn');
      if(duracaoSortBtn) duracaoSortBtn.onclick=function(){ State.duracaoSortDir=State.duracaoSortDir==='desc'?'asc':'desc'; buildDurBars(_lastDurArgs[0],_lastDurArgs[1]); };
      lcIcons();
      if(dBars._syncBottom) setTimeout(dBars._syncBottom,0);
    }

    buildDurBars(guias,null);
    refreshDuracao=buildDurBars;

    // ── Layout linha inferior (ranking + duração) ─────────────────────────────
    var bottomRow=el('div',{class:'g2',style:'margin-top:14px'});
    bottomRow.appendChild(pc);
    bottomRow.appendChild(pd);
    wrap.appendChild(bottomRow);

    return wrap;
  }

  function viewGuias(){
    var wrap=el('div');
    var guias=guiasVisiveis();
    var _especMap={'Internação':'Clínica Médica','Cirurgia':'Cirurgia Geral','Quimioterapia':'Oncologia','Cirurgia neuro':'Neurocirurgia','Cirurgia ortopédica':'Ortopedia','Exame imagem':'Radiologia','Exame':'Clínica Médica','Hemodinâmica':'Cardiologia','Junta médica':'Multiprofissional'};
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>Relação de Guias</h1><p>Filtre, audite e emita parecer da operadora com apoio da análise técnica.</p></div><div style="display:flex;gap:8px;align-items:center"><button class="btn ghost" id="btnClear">'+ico('x',13)+' Limpar filtros</button><button class="btn-animated" id="btnExport">'+ico('download')+' Exportar Excel</button></div>'));

    // Banner de contexto de perfil
    if(State.perfil!=='gestor'){
      var bann=el('div',{class:'perfil-banner'});
      var bIcon=State.perfil==='enfermeiro'?'stethoscope':'search';
      var bMsg=State.perfil==='enfermeiro'
        ?'Exibindo '+guias.length+' guia(s) nos seus fluxos ('+perfilDef.enfermeiro.fluxos.join(', ')+') com etapa de enfermagem ativa.'
        :'Exibindo '+guias.length+' guia(s) em etapas de auditoria médica atribuídas ao Auditor.';
      bann.innerHTML=ico(bIcon,14)+' '+bMsg;
      wrap.appendChild(bann);
    } else {
      renderVisaoBar(wrap);
    }

    // ── Abas Relação / Filtro aprofundado ─────────────────────
    var guiasTabsWrap=el('div',{style:'display:flex;gap:0;margin-bottom:-1px;position:relative;z-index:2'});
    [['filtro',ico('filter',13)+' Filtro aprofundado'],['relacao',ico('list',13)+' Relação de guia']].forEach(function(pair){
      var btn=el('button',{style:'padding:8px 18px;font-size:13px;font-weight:600;border:1.5px solid var(--g-100);border-bottom:'+(State.guiasViewTab===pair[0]?'1.5px solid var(--g-50)':'none')+';border-radius:8px 8px 0 0;background:'+(State.guiasViewTab===pair[0]?'var(--g-50)':'#fff')+';color:'+(State.guiasViewTab===pair[0]?'var(--g-700)':'var(--muted)')+';cursor:pointer;margin-right:3px;display:flex;align-items:center;gap:6px'},pair[1]);
      btn.onclick=function(){ State.guiasViewTab=pair[0]; render(); };
      guiasTabsWrap.appendChild(btn);
    });
    wrap.appendChild(guiasTabsWrap);

    var box=el('div',{class:'table-wrap',style:'border-radius:0 8px 8px 8px'});
    function opts(arr,sel,first){ var s='<option value="">'+first+'</option>'; arr.forEach(function(x){s+='<option value="'+esc(x)+'"'+(sel===x?' selected':'')+'>'+esc(x)+'</option>'}); return s; }

    if(State.guiasViewTab==='relacao'){
      var filt=el('div',{class:'filters'});
      filt.innerHTML=
        '<select id="fStatus">'+opts(MOCK.STATUS,State.filtros.status,'Todos os status')+'</select>'+
        '<select id="fFluxo"><option value="">Todos os fluxos</option>'+MOCK.FLUXOS.map(function(f){return '<option value="'+f.id+'"'+(State.filtros.fluxo===f.id?' selected':'')+'>'+esc(f.nome)+'</option>'}).join('')+'</select>'+
        '<select id="fOrigem">'+opts(MOCK.ORIGENS,State.filtros.origem,'Todas as origens')+'</select>'+
        '<select id="fRisco">'+opts(['baixo','medio','alto','critico'],State.filtros.risco,'Todos os riscos')+'</select>'+
        '<select id="fEspec">'+(function(){var s='<option value="">Especialidade</option>';var seen={};guias.forEach(function(g){var e=_especMap[g.tipo];if(e&&!seen[e]){seen[e]=1;s+='<option value="'+esc(e)+'"'+(State.filtros.especialidade===e?' selected':'')+'>'+esc(e)+'</option>';}});return s;}())+'</select>'+
        '<select id="fOpme">'+opts(['Sim','Não'],State.filtros.opme,'OPME')+'</select>'+
        '<select id="fUti">'+opts(['Sim','Não'],State.filtros.uti,'UTI')+'</select>'+
        '<select id="fRegimeAte">'+opts(['Ambulatorial','Internação'],State.filtros.regimeAte,'Regime de atendimento')+'</select>'+
        '<div class="spacer"></div>'+
        '<div id="fPeriodoWrap"></div>';
      wrap.appendChild(filt);
    } else {
      // ── Filtro aprofundado ────────────────────────────────────
      var filtAdv=el('div',{class:'filters'});
      filtAdv.innerHTML='<div class="spacer"></div><div id="faPeriodoWrap"></div>';
      wrap.appendChild(filtAdv);

      var fa=State.filtrosAvancados;
      var advWrap=el('div',{style:'padding:14px 18px 10px;border-bottom:1px solid var(--g-100)'});

      // Checkboxes
      var chkList=[
        {key:'flagAuditoriaOrigem',       label:'Exibir guias sob auditoria na origem'},
        {key:'flagAguardandoAuth',        label:'Exibir guias aguardando autorização'},
        {key:'flagAguardandoAuthEmpresa', label:'Exibir guias aguardando autorização da empresa'},
        {key:'flagAuditoriaOperadora',    label:'Exibir guias sob auditoria na operadora'},
        {key:'flagMsgNaoLida',            label:'Exibir guias com MSG não lida'},
        {key:'flagOpme',                  label:'Exibir somente guias com OPME'},
        {key:'flagPrio',                  label:'Exibir guias com status de prioridade'},
        {key:'flagIntercambio',           label:'Exibir somente retornos de intercâmbio'},
        {key:'flagDemandaJudicial',       label:'Exibir guias com demanda judicial'},
        {key:'flagInconsistencia',        label:'Exibir guias com inconsistência da Origem'},
        {key:'flagInternacao',            label:'Exibir guias com data de internação preenchida'},
        {key:'flagUti',                   label:'Exibir somente guias com UTI'},
        {key:'flagDut',                   label:'Exibir somente guias com DUT obrigatória'},
        {key:'flagAnexo',                 label:'Exibir somente guias com documentação anexada'},
        {key:'flagSemParam',              label:'Exibir guias sem parametrização'}
      ];
      var chkGrid=el('div',{style:'columns:3;column-gap:20px;column-rule:1px solid var(--g-100);margin-bottom:14px'});
      chkList.forEach(function(c){
        var lbl=el('label',{style:'display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--ink);cursor:pointer;user-select:none;break-inside:avoid;padding:3px 0'});
        lbl.innerHTML='<input type="checkbox" data-fakey="'+c.key+'"'+(fa[c.key]?' checked':'')+' style="width:14px;height:14px;flex-shrink:0;accent-color:var(--g-600);cursor:pointer"> '+esc(c.label);
        chkGrid.appendChild(lbl);
      });
      advWrap.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px'},'Flags de exibição'));
      advWrap.appendChild(chkGrid);

      // Dropdowns grid
      var ddList=[
        {id:'faStatus',    label:'Status',               opts:MOCK.STATUS, key:'status'},
        {id:'faNivel',     label:'Nível de auditoria',   opts:['Auditoria Prévia','Auditoria Concorrente','Auditoria Retrospectiva'], key:'nivelAuditoria'},
        {id:'faEspec',     label:'Especialidade',        opts:(function(){var s={};guias.forEach(function(g){var e=_especMap[g.tipo];if(e)s[e]=1;});return Object.keys(s).sort();}()), key:'especialidade'},
        {id:'faNatureza',  label:'Natureza',             opts:['Internação','Eletiva','Ambulatorial'], key:'natureza'},
        {id:'faAuditor',   label:'Auditor',              opts:MOCK.USUARIOS.filter(function(u){return u.perfil==='auditor';}).map(function(u){return u.nome;}), key:'auditor'},
        {id:'faTipo',      label:'Tipo de auditoria',    opts:(function(){var s={};guias.forEach(function(g){if(g.tipo)s[g.tipo]=1;});return Object.keys(s).sort();}()), key:'tipo'},
        {id:'faRegime',    label:'Regime',               opts:['Urgência','Eletivo'], key:'regime'},
        {id:'faExecut',    label:'Executante',           opts:MOCK.PRESTADORES.map(function(p){return p.nome;}), key:'executante'},
        {id:'faCong',      label:'Congênere',            opts:(function(){var s={};guias.forEach(function(g){if(g.congenere)s[g.congenere]=1;});return Object.keys(s).sort();}()), key:'congenere'},
        {id:'faClassif',   label:'Classificação',        opts:['Alta','Média','Baixa'], key:'classificacao'},
        {id:'faOrigem',    label:'Local de emissão',     opts:MOCK.ORIGENS, key:'origem'},
        {id:'faSolic',     label:'Solicitante',          opts:(function(){var s={};guias.forEach(function(g){s[g.solicitante]=1;});return Object.keys(s).sort();}()), key:'solicitante'},
        {id:'faProcesso',  label:'Processo de auditoria',opts:MOCK.FLUXOS.map(function(f){return f.nome;}), key:'fluxo'},
        {id:'faEtapa',     label:'Etapa',                opts:(function(){var s={};MOCK.FLUXOS.forEach(function(f){f.etapas.forEach(function(e){s[e]=1;});});return Object.keys(s).sort();}()), key:'etapa'},
        {id:'faParecer',   label:'Parecer',              opts:['Aprovado','Negado','Aprovado com ressalva','Solicitar complemento'], key:'parecer'},
        {id:'faStatusGer', label:'Status gerencial',     opts:MOCK.STATUS, key:'statusGerencial'},
        {id:'faCotacao',   label:'Cotação',              opts:['Com cotação de OPME','Sem cotação'], key:'cotacao'},
        {id:'faAnexoD',    label:'Anexo',                opts:['Com documentação','Sem documentação'], key:'comAnexo'},
        {id:'faTipoTaxa',  label:'Tipo de Taxa',         opts:(function(){var s={};guias.forEach(function(g){g.diariasTaxas.forEach(function(d){s[d.desc]=1;});});return Object.keys(s).sort();}()), key:'tipoTaxa'},
        {id:'faStatEtapa', label:'Status da etapa',      opts:['Em execução','Aguardando','Concluída'], key:'statusEtapa'},
        {id:'faPrest',     label:'Prestador Principal',  opts:MOCK.PRESTADORES.map(function(p){return p.nome;}), key:'prestador'},
        {id:'faLocalAte',  label:'Local de Atendimento', opts:MOCK.PRESTADORES.map(function(p){return p.nome;}), key:'localAtendimento'},
        {id:'faProc',      label:'Procedimento',         opts:(function(){var s={};guias.forEach(function(g){g.procedimentos.forEach(function(p){s[p.cod]=1;});});return Object.keys(s).sort();}()), key:'procedimento'}
      ];
      advWrap.appendChild(el('hr',{style:'border:none;border-top:1px solid var(--g-100);margin:14px 0 12px'},''));
      advWrap.appendChild(el('div',{style:'font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px'},'Filtros por campo'));
      var ddGrid=el('div',{style:'display:grid;grid-template-columns:repeat(4,1fr);gap:8px 12px'});
      ddList.forEach(function(d){
        var wrap2=el('div');
        wrap2.innerHTML='<label style="font-size:10.5px;font-weight:600;color:var(--muted);display:block;margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px">'+esc(d.label)+'</label>'+
          '<select id="'+d.id+'" style="width:100%;box-sizing:border-box;border:1.5px solid var(--g-200);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;background:#fff;color:var(--ink)">'+
          '<option value="">— Independente —</option>'+
          d.opts.map(function(o){return '<option value="'+esc(o)+'"'+(fa[d.key]===o?' selected':'')+'>'+esc(o)+'</option>';}).join('')+
          '</select>';
        ddGrid.appendChild(wrap2);
      });
      advWrap.appendChild(ddGrid);

      // Botões aplicar/limpar
      var advBtns=el('div',{style:'display:flex;gap:8px;margin-top:12px;align-items:center'});
      var btnApl=el('button',{class:'btn',style:'display:flex;align-items:center;gap:6px;font-size:12.5px'},ico('search',13)+' Pesquisar');
      var btnLimpAdv=el('button',{class:'btn ghost',style:'display:flex;align-items:center;gap:6px;font-size:12.5px'},ico('x',13)+' Limpar filtros');
      var countLabel=el('span',{style:'margin-left:auto;font-size:12.5px;color:var(--g-600);font-weight:600'});
      advBtns.appendChild(btnApl); advBtns.appendChild(btnLimpAdv); advBtns.appendChild(countLabel);
      advWrap.appendChild(advBtns);
      wrap.appendChild(advWrap);

      // Wiring (after DOM is appended via setTimeout)
      setTimeout(function(){
        chkList.forEach(function(c){
          var inp=advWrap.querySelector('[data-fakey="'+c.key+'"]');
          if(inp) inp.onchange=function(){ State.filtrosAvancados[c.key]=this.checked; };
        });
        ddList.forEach(function(d){
          var sel=document.getElementById(d.id);
          if(sel) sel.onchange=function(){ State.filtrosAvancados[d.key]=this.value; };
        });
        var _fadrp=makeDateRangePicker(
          document.getElementById('faPeriodoWrap'),
          State.filtrosAvancados.dataDeEmissao,
          State.filtrosAvancados.dataAteEmissao,
          function(de,ate){ State.filtrosAvancados.dataDeEmissao=de; State.filtrosAvancados.dataAteEmissao=ate; }
        );
        btnApl.onclick=function(){ State.guiasPagina=1; render(); };
        btnLimpAdv.onclick=function(){
          State.filtrosAvancados={flagOpme:false,flagPrio:false,flagUti:false,flagDut:false,flagAnexo:false,flagInternacao:false,flagSemParam:false,flagAuditoriaOrigem:false,flagAguardandoAuth:false,flagAguardandoAuthEmpresa:false,flagAuditoriaOperadora:false,flagMsgNaoLida:false,flagIntercambio:false,flagDemandaJudicial:false,flagInconsistencia:false,status:'',nivelAuditoria:'',especialidade:'',natureza:'',auditor:'',tipo:'',regime:'',executante:'',congenere:'',classificacao:'',origem:'',solicitante:'',fluxo:'',etapa:'',parecer:'',statusGerencial:'',cotacao:'',comAnexo:'',tipoTaxa:'',statusEtapa:'',prestador:'',localAtendimento:'',procedimento:'',dataDeEmissao:'',dataAteEmissao:''};
          if(_fadrp) _fadrp.clear();
          render();
        };
        // show result count
        var _faRows=box.querySelectorAll('tbody tr.guia-mainrow');
        countLabel.textContent=(_faRows.length)+' guia(s) listada(s)';
      },30);
    }

    var t=el('table'); t.innerHTML=
    '<colgroup>'+
      '<col style="width:100px">'+
      '<col style="width:22%">'+
      '<col style="width:22%">'+
      '<col style="width:100px">'+
      '<col>'+
      '<col>'+
    '</colgroup>'+
    '<thead><tr>'+
      '<th data-sort="guia">Guia <span class="sort-ico"></span></th>'+
      '<th data-sort="benef">Beneficiário <span class="sort-ico"></span></th>'+
      '<th data-sort="prest">Prestador <span class="sort-ico"></span></th>'+
      '<th data-sort="tipo">Tipo <span class="sort-ico"></span></th>'+
      '<th data-sort="fluxo">Fluxo <span class="sort-ico"></span></th>'+
      '<th data-sort="etapa">Etapa atual <span class="sort-ico"></span></th>'+
    '</tr></thead>';
    $$('th[data-sort]',t).forEach(function(th){
      var col=th.getAttribute('data-sort'), ico2=th.querySelector('.sort-ico');
      th.classList.add('th-sort');
      if(State.filtros.sortCol===col){ th.classList.add('sort-active'); ico2.textContent=State.filtros.sortDir==='asc'?'▲':'▼'; } else { ico2.textContent='⇅'; }
      th.onclick=function(){
        if(State.filtros.sortCol===col){ if(State.filtros.sortDir==='asc') State.filtros.sortDir='desc'; else { State.filtros.sortCol=''; State.filtros.sortDir=''; } }
        else { State.filtros.sortCol=col; State.filtros.sortDir='asc'; }
        render();
      };
    });
    var tb=el('tbody');
    var rows = guias.filter(function(g){
      if(State.guiasViewTab==='filtro'){
        var fa=State.filtrosAvancados;
        if(fa.flagAuditoriaOrigem&&g.origem!=='Web Prestador') return false;
        if(fa.flagAguardandoAuth&&g.status!=='Aguardando complemento'&&g.status!=='Aguardando documentação') return false;
        if(fa.flagAguardandoAuthEmpresa&&g.status!=='Aguardando documentação') return false;
        if(fa.flagAuditoriaOperadora&&g.status!=='Em análise'&&g.status!=='Em junta médica'&&g.status!=='Cotação de OPME') return false;
        if(fa.flagInconsistencia&&!(g.prazoVencido||(!g.anexos&&g.dut))) return false;
        if(fa.flagOpme&&!g.opme) return false;
        if(fa.flagPrio&&g.prio!=='Alta') return false;
        if(fa.flagUti&&!g.uti) return false;
        if(fa.flagDut&&!g.dut) return false;
        if(fa.flagAnexo&&!g.anexos) return false;
        if(fa.flagInternacao&&!g.internacao) return false;
        if(fa.flagSemParam&&g.status!=='Sem parametrização') return false;
        if(fa.status&&g.status!==fa.status) return false;
        if(fa.regime&&g.regime!==fa.regime) return false;
        if(fa.natureza&&g.natureza!==fa.natureza) return false;
        if(fa.tipo&&g.tipo!==fa.tipo) return false;
        if(fa.fluxo&&g.fluxo.nome!==fa.fluxo) return false;
        if(fa.origem&&g.origem!==fa.origem) return false;
        if(fa.solicitante&&g.solicitante!==fa.solicitante) return false;
        if(fa.congenere&&g.congenere!==fa.congenere) return false;
        if(fa.prestador&&g.prestadorSol.nome!==fa.prestador) return false;
        if(fa.executante&&g.prestadorExe.nome!==fa.executante) return false;
        if(fa.localAtendimento&&g.prestadorExe.nome!==fa.localAtendimento) return false;
        if(fa.classificacao&&g.prio!==fa.classificacao) return false;
        if(fa.especialidade){var _espec=_especMap[g.tipo]||'';if(_espec!==fa.especialidade) return false;}
        if(fa.cotacao==='Com cotação de OPME'&&!g.opme) return false;
        if(fa.cotacao==='Sem cotação'&&g.opme) return false;
        if(fa.comAnexo==='Com documentação'&&!g.anexos) return false;
        if(fa.comAnexo==='Sem documentação'&&g.anexos) return false;
        if(fa.tipoTaxa&&!g.diariasTaxas.some(function(d){return d.desc===fa.tipoTaxa;})) return false;
        if(fa.statusEtapa){var _etStMap={'Em execução':'em_execucao','Aguardando':'aguardando','Concluída':'concluida'};var _etStAtual='';for(var si=0;si<g.etapas.length;si++){if(g.etapas[si].status==='em_execucao'){_etStAtual=g.etapas[si].status;break;}}if(!_etStAtual||_etStAtual!==_etStMap[fa.statusEtapa]) return false;}
        if(fa.procedimento&&!g.procedimentos.some(function(p){return p.cod===fa.procedimento;})) return false;
        if(fa.etapa){var etAtualFa='';for(var ei=0;ei<g.etapas.length;ei++){if(g.etapas[ei].status==='em_execucao'){etAtualFa=g.etapas[ei].nome;break;}}if(etAtualFa!==fa.etapa) return false;}
        if(fa.dataDeEmissao&&g.dataEmissao<fa.dataDeEmissao) return false;
        if(fa.dataAteEmissao&&g.dataEmissao>fa.dataAteEmissao) return false;
        return true;
      }
      var f=State.filtros, q=f.q;
      if(f.status&&g.status!==f.status) return false;
      if(f.fluxo&&g.fluxo.id!==f.fluxo) return false;
      if(f.origem&&g.origem!==f.origem) return false;
      if(f.risco&&g.risco!==f.risco) return false;
      if(f.benef&&g.beneficiario.nome!==f.benef) return false;
      if(f.prest&&g.prestadorSol.nome!==f.prest) return false;
      if(f.tipo&&g.tipo!==f.tipo) return false;
      if(f.congenere&&g.congenere!==f.congenere) return false;
      if(f.solicitante&&g.solicitante!==f.solicitante) return false;
      if(f.opme==='Sim'&&!g.opme) return false;
      if(f.opme==='Não'&&g.opme) return false;
      if(f.uti==='Sim'&&!g.uti) return false;
      if(f.uti==='Não'&&g.uti) return false;
      if(f.regimeAte){var _isInter=g.natureza==='Internação'||g.tipo==='Cirurgia'||g.tipo==='Cirurgia neuro'||g.tipo==='Cirurgia ortopédica'||g.diariasTaxas.some(function(d){return d.desc.indexOf('Diária')>=0;});if(f.regimeAte==='Internação'&&!_isInter) return false; if(f.regimeAte==='Ambulatorial'&&_isInter) return false;}
      if(f.especialidade&&(_especMap[g.tipo]||'')!==f.especialidade) return false;
      if(f.dataDeEmissao&&g.dataEmissao<f.dataDeEmissao) return false;
      if(f.dataAteEmissao&&g.dataEmissao>f.dataAteEmissao) return false;
      if(q && (g.numero+' '+g.beneficiario.nome+' '+g.prestadorSol.nome+' '+g.tipo).toLowerCase().indexOf(q)<0) return false;
      return true;
    });

    // Chips de filtros rápidos
    var quickChips=[
      {key:'status',label:'Status'},
      {key:'especialidade',label:'Especialidade'},
      {key:'benef',label:'Beneficiário'},
      {key:'prest',label:'Prestador'},
      {key:'tipo',label:'Tipo'},
      {key:'congenere',label:'Congênere'},
      {key:'origem',label:'Origem'},
      {key:'solicitante',label:'Solicitante'}
    ].filter(function(c){return State.filtros[c.key]});
    if(quickChips.length){
      var chipsBar=el('div',{class:'active-filters'});
      quickChips.forEach(function(c){
        var val=State.filtros[c.key];
        var chip=el('div',{class:'active-chip'});
        chip.innerHTML='<span class="chip-lbl">'+esc(c.label)+'</span>'+esc(val.length>32?val.slice(0,30)+'…':val)+'<button class="chip-rm" title="Remover filtro">×</button>';
        chip.querySelector('.chip-rm').onclick=function(){ State.filtros[c.key]=''; render(); };
        chipsBar.appendChild(chip);
      });
      box.appendChild(chipsBar);
    }
    var _sfns={guia:function(g){return g.numero;},benef:function(g){return g.beneficiario.nome;},prest:function(g){return g.prestadorSol.nome;},tipo:function(g){return g.tipo;},fluxo:function(g){return g.fluxo.nome;},etapa:function(g){for(var i=0;i<g.etapas.length;i++){if(g.etapas[i].status==='em_execucao')return g.etapas[i].nome;}return g.etapas[g.etapas.length-1].nome;}};
    if(State.filtros.sortCol&&State.filtros.sortDir&&_sfns[State.filtros.sortCol]){
      var _sf=_sfns[State.filtros.sortCol],_sd=State.filtros.sortDir==='asc'?1:-1;
      rows=rows.slice().sort(function(a,b){var av=_sf(a),bv=_sf(b);return av<bv?-_sd:av>bv?_sd:0;});
    }
    // Paginação
    var PAGE_SIZE=15;
    var totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    if(State.guiasPagina>totalPages) State.guiasPagina=1;
    var pagina=State.guiasPagina;
    var pageRows=rows.slice((pagina-1)*PAGE_SIZE, pagina*PAGE_SIZE);

    function bindDbl(cell, key, val, label){
      cell.title=label||'Duplo clique para filtrar por este valor';
      cell.ondblclick=function(e){
        e.stopPropagation();
        State.filtros[key]=State.filtros[key]===val?'':val;
        State.guiasPagina=1;
        if(State.filtros[key]) toast('Filtrando: '+val,'ok');
        render();
        };
      }
    if(!pageRows.length) tb.appendChild(el('tr',{},'<td colspan="6"><div class="empty"><div class="ico">'+icoLg('inbox')+'</div>Nenhuma guia encontrada com os filtros atuais.</div></td>'));
    pageRows.forEach(function(g){
      var etAtual=''; for(var i=0;i<g.etapas.length;i++){ if(g.etapas[i].status==='em_execucao'){ etAtual=g.etapas[i].nome; break;} }
      if(!etAtual) etAtual=g.etapas[g.etapas.length-1].nome;
      var p=guiaAderencia(g);
      var tr=el('tr',{class:'guia-mainrow'});
      var _gespec=_especMap[g.tipo]||'';
      // L1 = linha 1 (texto principal), L2 = margin-top:5px, L3 = margin-top:9px a partir de L2
      var L2H='min-height:20px;display:flex;align-items:center;'; // âncora fixa de altura para L2
      tr.innerHTML=
        // GUIA
        '<td><b>'+esc(g.numero)+'</b>'+(g.prazoVencido?' <span class="badge danger">prazo</span>':'')+
          '<div style="margin-top:5px;cursor:pointer" data-ident="status-cell" data-tip="Status">'+statusBadge(g.status)+'</div>'+
          '<div style="margin-top:9px">'+(_gespec?'<span class="badge muted'+(State.filtros.especialidade===_gespec?' cell-filtered':'')+'" style="font-size:10px;cursor:pointer" title="Especialidade">'+ico('stethoscope',10)+' '+esc(_gespec)+'</span>':'<span style="font-size:10px;color:transparent">—</span>')+'</div>'+
        '</td>'+
        // BENEFICIÁRIO
        '<td class="cell-dbl'+(State.filtros.benef===g.beneficiario.nome?' cell-filtered':'')+'">'+
          '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px">'+esc(g.beneficiario.nome)+'</span>'+
          '<div style="color:var(--muted);font-size:11px;margin-top:5px;'+L2H+'" data-tip="CPF">'+mask(g.beneficiario.cpf)+'</div>'+
          '<div style="margin-top:9px"><span class="badge muted'+(State.filtros.congenere===g.congenere?' cell-filtered':'')+'" style="font-size:10px" title="Congênere" data-tip="Duplo clique: filtrar por congênere">'+ico('map-pin',10)+' '+esc(g.congenere||'—')+'</span></div>'+
        '</td>'+
        // PRESTADOR
        '<td class="cell-dbl'+(State.filtros.prest===g.prestadorSol.nome?' cell-filtered':'')+'">'+
          '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px">'+esc(g.prestadorSol.nome)+'</span>'+
          '<div style="margin-top:5px;'+L2H+'"><span class="badge muted'+(State.filtros.origem===g.origem&&State.filtros.origem?' cell-filtered':'')+'" style="font-size:10px" title="Origem" data-tip="Duplo clique: filtrar por origem">'+esc(g.origem)+'</span></div>'+
          '<div style="margin-top:9px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;cursor:pointer" class="'+(State.filtros.solicitante===g.solicitante&&State.filtros.solicitante?'cell-filtered':'')+'" title="Solicitante" data-tip="Duplo clique: filtrar por solicitante">'+(g.solicitante&&g.solicitante!=='—'?esc(g.solicitante):'<span style="color:transparent">—</span>')+'</div>'+
        '</td>'+
        // TIPO
        '<td class="cell-dbl'+(State.filtros.tipo===g.tipo?' cell-filtered':'')+'">'+
          esc(g.tipo.toUpperCase())+
          '<div style="margin-top:5px;'+L2H+'gap:3px;flex-wrap:wrap">'+((g.opme||g.uti)?((g.opme?'<span class="badge warn">OPME</span>':'')+(g.uti?'<span class="badge info">UTI</span>':'')):'<span style="color:transparent;font-size:10px">—</span>')+'</div>'+
          '<div style="margin-top:9px"><span class="ader-val '+(p>=90?'alta':p>=70?'mod':p>=50?'baixa':'crit')+'" title="Aderência">'+p+'%</span></div>'+
        '</td>'+
        // FLUXO
        '<td>'+
          '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:180px" title="'+esc(g.fluxo.nome)+'">'+esc(g.fluxo.nome)+'</span>'+
          '<div style="margin-top:5px;'+L2H+'"></div>'+
          '<div style="margin-top:9px"><span class="badge muted" style="font-size:10px">'+esc(g.fluxo.id)+'</span></div>'+
        '</td>'+
        // ETAPA ATUAL
        '<td>'+
          '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:180px" title="'+esc(etAtual)+'">'+esc(etAtual)+'</span>'+
          '<div style="margin-top:5px;'+L2H+'"></div>'+
          '<div style="margin-top:9px">'+riskPill(g.risco,g.numero)+'</div>'+
        '</td>';
      bindDbl(tr.cells[1],'benef',g.beneficiario.nome,'Beneficiário');
      // duplo clique no badge de congênere dentro da célula do beneficiário
      var _congBadge=tr.cells[1].querySelector('[title="Congênere"]');
      if(_congBadge) _congBadge.addEventListener('dblclick',function(e){e.stopPropagation();State.filtros.congenere=State.filtros.congenere===g.congenere?'':g.congenere;State.guiasPagina=1;if(State.filtros.congenere)toast('Filtrando: '+g.congenere,'ok');render();});
      bindDbl(tr.cells[2],'prest',g.prestadorSol.nome,'Prestador');
      var _origBadge=tr.cells[2].querySelector('[title="Origem"]');
      if(_origBadge) _origBadge.addEventListener('dblclick',function(e){e.stopPropagation();State.filtros.origem=State.filtros.origem===g.origem?'':g.origem;State.guiasPagina=1;if(State.filtros.origem)toast('Filtrando: '+g.origem,'ok');render();});
      bindDbl(tr.cells[3],'tipo',g.tipo,'Tipo');
      var _statusEl=tr.cells[0].querySelector('[data-ident="status-cell"]');
      if(_statusEl) _statusEl.addEventListener('dblclick',function(e){e.stopPropagation();State.filtros.status=State.filtros.status===g.status?'':g.status;State.guiasPagina=1;if(State.filtros.status)toast('Filtrando: '+g.status,'ok');render();});
      var _especEl=tr.cells[0].querySelector('[title="Especialidade"]');
      if(_especEl&&_gespec) _especEl.addEventListener('dblclick',function(e){e.stopPropagation();State.filtros.especialidade=State.filtros.especialidade===_gespec?'':_gespec;State.guiasPagina=1;if(State.filtros.especialidade)toast('Filtrando: '+_gespec,'ok');render();});
      var _solEl=tr.cells[2].querySelector('[title="Solicitante"]');
      if(_solEl&&g.solicitante&&g.solicitante!=='—') _solEl.addEventListener('dblclick',function(e){e.stopPropagation();State.filtros.solicitante=State.filtros.solicitante===g.solicitante?'':g.solicitante;State.guiasPagina=1;if(State.filtros.solicitante)toast('Filtrando: '+g.solicitante,'ok');render();});
      var trSub=el('tr',{class:'guia-subrow'});
      trSub.innerHTML=
        '<td></td>'+
        '<td></td>'+
        '<td></td>'+
        '<td></td>'+
        '<td></td>'+
        '<td><div class="row-actions">'+
            '<div class="btn-wrap"><button class="btn sm" data-act="abrir" title="Visualizar guia"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></div>'+
            '<div class="btn-wrap"><button class="btn sm" data-act="ia" title="Análise IA">'+ico('sparkles')+'</button></div>'+
            (can('parecer')?'<div class="btn-wrap"><button class="btn sm" data-act="par" title="Parecer">'+ico('stethoscope')+'</button></div>':'')+
          '</div></td>';
      trSub.querySelector('[data-act="abrir"]').onclick=function(e){e.stopPropagation();openGuia(g,'resumo')};
      trSub.querySelector('[data-act="ia"]').onclick=function(e){e.stopPropagation();openGuia(g,'ia')};
      var pb=trSub.querySelector('[data-act="par"]'); if(pb) pb.onclick=function(e){e.stopPropagation();openParecer(g)};
      tb.appendChild(tr);
      tb.appendChild(trSub);
    });

    t.appendChild(tb); box.appendChild(t);

    // ── Paginação ──────────────────────────────────────────────────
    if(totalPages>1){
      var pgBar=el('div',{class:'pg-bar'});
      var pgInfo=el('span',{class:'pg-info'});
      var ini=(pagina-1)*PAGE_SIZE+1, fim=Math.min(pagina*PAGE_SIZE,rows.length);
      pgInfo.textContent='Mostrando '+ini+'–'+fim+' de '+rows.length;
      var pgPrev=el('button',{class:'pg-btn'+(pagina===1?' disabled':'')},ico('chevron-left',13));
      var pgNext=el('button',{class:'pg-btn'+(pagina===totalPages?' disabled':'')},ico('chevron-right',13));
      pgPrev.disabled=(pagina===1);
      pgNext.disabled=(pagina===totalPages);
      pgPrev.onclick=function(){if(State.guiasPagina>1){State.guiasPagina--;render();}};
      pgNext.onclick=function(){if(State.guiasPagina<totalPages){State.guiasPagina++;render();}};
      var pgNums=el('div',{class:'pg-nums'});
      for(var pi=1;pi<=totalPages;pi++){
        (function(p2){
          var btn=el('button',{class:'pg-num'+(p2===pagina?' active':'')},String(p2));
          btn.onclick=function(){State.guiasPagina=p2;render();};
          pgNums.appendChild(btn);
        })(pi);
      }
      pgBar.appendChild(pgPrev); pgBar.appendChild(pgNums); pgBar.appendChild(pgNext); pgBar.appendChild(pgInfo);
      box.appendChild(pgBar);
    }

    // ── Resumo (tabela separada abaixo da paginação) ────────────────
    if(rows.length){
      var byStatus={}, byCong={}, byTipo={}, byRisco={};
      rows.forEach(function(g){
        byStatus[g.status]=(byStatus[g.status]||0)+1;
        byCong[g.congenere]=(byCong[g.congenere]||0)+1;
        byTipo[g.tipo]=(byTipo[g.tipo]||0)+1;
        byRisco[g.risco]=(byRisco[g.risco]||0)+1;
      });
      var tsum=document.createElement('table');
      tsum.innerHTML=
        '<colgroup>'+
          '<col style="width:100px">'+
          '<col style="width:22%">'+
          '<col style="width:22%">'+
          '<col style="width:100px">'+
          '<col>'+
          '<col>'+
        '</colgroup>';
      var tsRow=document.createElement('tr'); tsRow.className='guias-tfoot';

      var ts0=document.createElement('td');
      ts0.innerHTML='<div class="tfoot-lbl">'+ico('hash',11)+' <b>'+rows.length+'</b> guia'+(rows.length!==1?'s':'')+'</div>'+
        '<div class="tfoot-sub">'+Object.keys(byStatus).map(function(s){return '<span class="badge muted" style="font-size:10px">'+esc(s)+' <b>'+byStatus[s]+'</b></span>';}).join('')+'</div>';
      tsRow.appendChild(ts0);

      var ts1=document.createElement('td');
      ts1.innerHTML='<div class="tfoot-lbl">'+ico('map-pin',11)+' Congênere</div>'+
        '<div class="tfoot-sub">'+Object.keys(byCong).map(function(c){return '<span class="badge muted" style="font-size:10px">'+esc(c)+' <b>'+byCong[c]+'</b></span>';}).join('')+'</div>';
      tsRow.appendChild(ts1);

      tsRow.appendChild(document.createElement('td'));

      var ts3=document.createElement('td');
      ts3.innerHTML='<div class="tfoot-lbl">'+ico('tag',11)+' Tipo</div>'+
        '<div class="tfoot-sub">'+Object.keys(byTipo).map(function(s){return '<span class="badge muted" style="font-size:10px">'+esc(s)+' <b>'+byTipo[s]+'</b></span>';}).join('')+'</div>';
      tsRow.appendChild(ts3);

      tsRow.appendChild(document.createElement('td'));

      var ts5=document.createElement('td');
      ts5.innerHTML='<div class="tfoot-lbl">'+ico('alert-triangle',11)+' Risco</div>'+
        '<div class="tfoot-sub">'+Object.keys(byRisco).map(function(r){return '<span class="badge muted" style="font-size:10px">'+esc(r)+' <b>'+byRisco[r]+'</b></span>';}).join('')+'</div>';
      tsRow.appendChild(ts5);

      var tsTb=document.createElement('tbody'); tsTb.appendChild(tsRow);
      tsum.appendChild(tsTb); box.appendChild(tsum);
    }

    wrap.appendChild(box);

    setTimeout(function(){
      $('#fStatus').onchange=function(){State.filtros.status=this.value;render()};
      $('#fFluxo').onchange=function(){State.filtros.fluxo=this.value;render()};
      $('#fOrigem').onchange=function(){State.filtros.origem=this.value;render()};
      $('#fRisco').onchange=function(){State.filtros.risco=this.value;render()};
      $('#fOpme').onchange=function(){State.filtros.opme=this.value;render()};
      $('#fUti').onchange=function(){State.filtros.uti=this.value;render()};
      $('#fRegimeAte').onchange=function(){State.filtros.regimeAte=this.value;render()};
      var fesp=$('#fEspec'); if(fesp) fesp.onchange=function(){State.filtros.especialidade=this.value;render();};
      ['#fStatus','#fFluxo','#fOrigem','#fRisco','#fEspec','#fOpme','#fUti','#fRegimeAte'].forEach(function(id){ var s=$(id); if(s) makeCustomSelect(s); });
      var _drpInstance = makeDateRangePicker(
        $('#fPeriodoWrap'),
        State.filtros.dataDeEmissao,
        State.filtros.dataAteEmissao,
        function(de, ate){ State.filtros.dataDeEmissao=de; State.filtros.dataAteEmissao=ate; render(); }
      );
      $('#btnClear').onclick=function(){
        State.filtros={q:'',status:'',fluxo:'',origem:'',risco:'',benef:'',prest:'',tipo:'',congenere:'',solicitante:'',opme:'',uti:'',regimeAte:'',especialidade:'',dataDeEmissao:'',dataAteEmissao:'',sortCol:'',sortDir:''};
        if(_drpInstance) _drpInstance.clear();
        $('#globalSearch').value=''; render();
      };
      var _exportBtn=$('#btnExport');
      if(_exportBtn) _exportBtn.onclick=function(){
        try{ exportXLS(rows); }
        catch(e){ toast('Erro na exportação: '+(e.message||String(e)),'danger'); }
      };
    },0);

    return wrap;
  }

  function exportXLS(rows){
    var total=rows.length||1;
    var dt=new Date().toLocaleString('pt-BR');
    var fname='RegulaAI_'+new Date().toISOString().slice(0,10)+'.xls';

    /* ─── helpers ─── */
    function bar(val,max,w){w=w||18;var f=max>0?Math.min(w,Math.max(0,Math.round((val/max)*w))):0;return '▓'.repeat(f)+'░'.repeat(w-f);}
    function countBy(arr,fn){var r={};arr.forEach(function(x){var k=fn(x);r[k]=(r[k]||0)+1;});return r;}
    function etapaNome(g){for(var i=0;i<g.etapas.length;i++){if(g.etapas[i].status==='em_execucao')return g.etapas[i].nome;}return g.etapas[g.etapas.length-1].nome;}
    function riscoBadge(r){var bg={baixo:'#dcfce7',medio:'#fef9c3',alto:'#ffedd5',critico:'#fee2e2'}[r]||'#eee';var fg={baixo:'#16a34a',medio:'#a16207',alto:'#ea580c',critico:'#b91c1c'}[r]||'#333';return 'background:'+bg+';color:'+fg+';font-weight:bold';}
    function statusStyle(s){if(s==='Liberada')return 'background:#dcfce7;color:#16a34a';if(s==='Negada')return 'background:#fee2e2;color:#b91c1c';if(s==='Em junta médica')return 'background:#f3e8ff;color:#7e22ce';if(s==='Em análise')return 'background:#e0f2fe;color:#0369a1';if(s.indexOf('Aguardando')>=0)return 'background:#fef9c3;color:#a16207';return '';}
    function adhStyle(p){return p>=90?'color:#16a34a':p>=70?'color:#a16207':'color:#b91c1c';}
    function td(content,style,cls){return '<td'+(style?' style="'+style+'"':'')+(cls?' class="'+cls+'"':'')+'>'+(content==null?'':content)+'</td>';}
    function th(content){return '<td class="hdr">'+content+'</td>';}

    /* ─── CSS ─── */
    var css=[
      'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a}',
      'table{border-collapse:collapse}',
      '.hdr{background:#054f27;color:#fff;font-weight:bold;padding:8px 12px;border:1px solid #033d1c;font-size:10.5pt;white-space:nowrap;vertical-align:middle}',
      '.ra{background:#f0faf4;padding:7px 12px;border:1px solid #c8e6d4;vertical-align:top}',
      '.rb{background:#ffffff;padding:7px 12px;border:1px solid #c8e6d4;vertical-align:top}',
      '.title-row{background:#054f27;color:#fff;font-size:16pt;font-weight:bold;padding:14px 18px;border:none}',
      '.sub-row{background:#066b34;color:#d1fae5;font-size:9.5pt;padding:6px 18px;border:none}',
      '.sec{background:#0a8a43;color:#fff;font-weight:bold;font-size:10pt;padding:8px 12px;border:1px solid #066b34}',
      '.kv{font-size:18pt;font-weight:bold;color:#054f27;text-align:center;padding:10px 8px;border:1px solid #c8e6d4}',
      '.kl{font-size:8.5pt;color:#666;text-align:center;padding:4px 8px;background:#f5fbf7;border:1px solid #c8e6d4;font-weight:600;text-transform:uppercase;letter-spacing:.4pt}',
      '.bar{font-family:Consolas,monospace;font-size:9.5pt;color:#0a8a43;padding:7px 12px;border:1px solid #c8e6d4;letter-spacing:1px}',
      '.tot{background:#c7eed8;font-weight:bold;padding:7px 12px;border:1px solid #a8d8bb}',
      '.blank{border:none;padding:6px}',
    ].join('');

    /* ─── SHEET 1: Guias ─── */
    var hdr1=['Guia','Beneficiário','CPF','Prestador','Tipo','Fluxo','Etapa Atual','Status','Origem','Aderência','Risco','Dias','Prazo Vencido','OPME','UTI'];
    var adhs=rows.map(function(g){return guiaAderencia(g);});
    var avgAdh=Math.round(adhs.reduce(function(a,b){return a+b;},0)/total);

    var dataRows=rows.map(function(g,i){
      var cls=i%2===0?'ra':'rb', adh=guiaAderencia(g);
      return '<tr>'+
        td('<b>'+esc(g.numero)+'</b>',null,cls)+
        td(esc(g.beneficiario.nome),null,cls)+
        td(esc(mask(g.beneficiario.cpf)),'font-size:9pt;color:#888',cls)+
        td(esc(g.prestadorSol.nome),null,cls)+
        td(esc(g.tipo.toUpperCase()),'font-weight:500',cls)+
        td(esc(g.fluxo.nome),'font-size:9.5pt',cls)+
        td(esc(etapaNome(g)),'font-size:9pt',cls)+
        td(esc(g.status),statusStyle(g.status),null)+
        td(esc(g.origem),'font-size:9.5pt',cls)+
        td(adh+'%','text-align:center;font-weight:bold;'+adhStyle(adh),cls)+
        td(g.risco.charAt(0).toUpperCase()+g.risco.slice(1),riscoBadge(g.risco)+';text-align:center;padding:7px 12px;border:1px solid #c8e6d4')+
        td(g.diasAuditoria,'text-align:center',cls)+
        td(g.prazoVencido?'SIM':'NÃO','text-align:center;font-weight:bold;color:'+(g.prazoVencido?'#b91c1c':'#16a34a'),cls)+
        td(g.opme?'✓':'—','text-align:center;color:'+(g.opme?'#0a8a43':'#bbb'),cls)+
        td(g.uti?'✓':'—','text-align:center;color:'+(g.uti?'#0a8a43':'#bbb'),cls)+
      '</tr>';
    }).join('');

    var sheet1=
      '<tr><td colspan="'+hdr1.length+'" class="title-row">RegulaAI Saúde — Relação de Guias</td></tr>'+
      '<tr><td colspan="'+hdr1.length+'" class="sub-row">Exportado em: '+dt+'   |   Total de guias: '+rows.length+'   |   Aderência média: '+avgAdh+'%</td></tr>'+
      '<tr>'+hdr1.map(th).join('')+'</tr>'+
      dataRows+
      '<tr>'+td('TOTAL','font-weight:bold','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td('','','tot')+td(avgAdh+'%','text-align:center;font-weight:bold','tot')+td('','','tot')+td('','','tot')+td(rows.filter(function(g){return g.prazoVencido;}).length+' c/ prazo','text-align:center;font-size:9pt','tot')+td(rows.filter(function(g){return g.opme;}).length+' c/ OPME','text-align:center;font-size:9pt','tot')+td(rows.filter(function(g){return g.uti;}).length+' c/ UTI','text-align:center;font-size:9pt','tot')+'</tr>';

    /* ─── SHEET 2: Indicadores ─── */
    var byStatus=countBy(rows,function(g){return g.status;});
    var byRisco=countBy(rows,function(g){return g.risco;});
    var byFluxo=countBy(rows,function(g){return g.fluxo.nome;});
    var adhAlta=adhs.filter(function(a){return a>=90;}).length;
    var adhMod=adhs.filter(function(a){return a>=70&&a<90;}).length;
    var adhBaixa=adhs.filter(function(a){return a>=50&&a<70;}).length;
    var adhCrit=adhs.filter(function(a){return a<50;}).length;

    var COLS2=27; // 1 label + 24 bar segments + count + pct

    function statusColor(s){
      if(s==='Liberada') return '#16a34a';
      if(s==='Negada') return '#b91c1c';
      if(s==='Em junta médica') return '#7e22ce';
      if(s==='Em análise') return '#0369a1';
      if(s.indexOf('Aguardando')>=0||s.indexOf('Correção')>=0||s.indexOf('Solicitado')>=0) return '#a16207';
      return '#4b7a59';
    }
    function vizBar(val,tot2,color){
      var W=24,f=tot2>0?Math.min(W,Math.max(0,Math.round(val/tot2*W))):0,h='';
      for(var i=0;i<W;i++) h+='<td style="background:'+(i<f?color:'#eef2ef')+';width:12px;height:22px;border:1px solid #fff;padding:0;font-size:1pt"> </td>';
      return h;
    }
    function secHdr2(title){
      return '<tr><td class="blank" colspan="'+COLS2+'"></td></tr>'+
             '<tr><td colspan="'+COLS2+'" class="sec">'+title+'</td></tr>'+
             '<tr>'+th('Categoria')+'<td colspan="24" class="hdr" style="text-align:center;letter-spacing:.4pt">Proporção visual</td>'+th('Qtd')+th('%')+'</tr>';
    }
    function totRow2(n){
      return '<tr>'+td('TOTAL','font-weight:bold;padding:6px 10px','tot')+
             '<td colspan="24" class="tot"></td>'+
             td(n,'text-align:center;font-weight:bold','tot')+td('100%','text-align:center','tot')+'</tr>';
    }

    // KPIs
    var kpiLbls=['Total de Guias','Em Análise','Junta Médica','Com OPME','Prazo Vencido','Negadas'];
    var kpiVals=[rows.length,byStatus['Em análise']||0,byStatus['Em junta médica']||0,
      rows.filter(function(g){return g.opme;}).length,
      rows.filter(function(g){return g.prazoVencido;}).length,
      byStatus['Negada']||0];
    var kpiSection=
      '<tr><td class="blank" colspan="'+COLS2+'"></td></tr>'+
      '<tr><td colspan="'+COLS2+'" class="sec">▶ INDICADORES EXECUTIVOS</td></tr>'+
      '<tr>'+kpiLbls.map(function(l){return td(l,'','kl');}).join('')+'</tr>'+
      '<tr>'+kpiVals.map(function(v){return td(v,'','kv');}).join('')+'</tr>';

    // Por Status
    var statusSection=
      secHdr2('▶ GRÁFICO — DISTRIBUIÇÃO POR STATUS')+
      MOCK.STATUS.filter(function(s){return byStatus[s];}).map(function(s){
        var c=byStatus[s],p=Math.round(c/total*100);
        return '<tr>'+td(esc(s),(statusStyle(s)||'padding:6px 10px')+';border:1px solid #c8e6d4')+
          vizBar(c,total,statusColor(s))+
          td(c,'text-align:center;font-weight:700;border:1px solid #c8e6d4')+
          td(p+'%','text-align:center;border:1px solid #c8e6d4')+'</tr>';
      }).join('')+totRow2(rows.length);

    // Por Risco
    var riscoSection=
      secHdr2('▶ GRÁFICO — RISCO REGULATÓRIO')+
      [{key:'baixo',lbl:'Baixo',  color:'#16a34a',bg:'#dcfce7',fg:'#16a34a'},
       {key:'medio',lbl:'Médio',  color:'#a16207',bg:'#fef9c3',fg:'#a16207'},
       {key:'alto', lbl:'Alto',   color:'#ea580c',bg:'#ffedd5',fg:'#ea580c'},
       {key:'critico',lbl:'Crítico',color:'#b91c1c',bg:'#fee2e2',fg:'#b91c1c'}
      ].map(function(r){
        var c=byRisco[r.key]||0,p=Math.round(c/total*100);
        return '<tr>'+td(r.lbl,'background:'+r.bg+';color:'+r.fg+';font-weight:bold;padding:6px 10px;border:1px solid #c8e6d4')+
          vizBar(c,total,r.color)+
          td(c,'text-align:center;font-weight:700;border:1px solid #c8e6d4')+
          td(p+'%','text-align:center;border:1px solid #c8e6d4')+'</tr>';
      }).join('')+totRow2(rows.length);

    // Aderência
    var adhSection=
      secHdr2('▶ GRÁFICO — ADERÊNCIA REGULATÓRIA')+
      [{lbl:'Alta ≥ 90%',     cnt:adhAlta, color:'#16a34a',bg:'#dcfce7',fg:'#16a34a'},
       {lbl:'Moderada 70–89%',cnt:adhMod,  color:'#a16207',bg:'#fef9c3',fg:'#a16207'},
       {lbl:'Baixa 50–69%',   cnt:adhBaixa,color:'#ea580c',bg:'#ffedd5',fg:'#ea580c'},
       {lbl:'Crítica < 50%',  cnt:adhCrit, color:'#b91c1c',bg:'#fee2e2',fg:'#b91c1c'}
      ].map(function(r){
        var p=Math.round(r.cnt/total*100);
        return '<tr>'+td(r.lbl,'background:'+r.bg+';color:'+r.fg+';font-weight:bold;padding:6px 10px;border:1px solid #c8e6d4')+
          vizBar(r.cnt,total,r.color)+
          td(r.cnt,'text-align:center;font-weight:700;border:1px solid #c8e6d4')+
          td(p+'%','text-align:center;border:1px solid #c8e6d4')+'</tr>';
      }).join('')+
      '<tr>'+td('Média geral: '+avgAdh+'%','font-weight:bold;padding:6px 10px;color:'+(avgAdh>=90?'#16a34a':avgAdh>=70?'#a16207':'#b91c1c'),'tot')+
      '<td colspan="24" class="tot"></td>'+
      td(avgAdh+'%','text-align:center;font-size:14pt;font-weight:bold;color:'+(avgAdh>=90?'#16a34a':avgAdh>=70?'#a16207':'#b91c1c'),'tot')+
      td('','','tot')+'</tr>';

    // Por Fluxo
    var fluxoColors=['#0a8a43','#0369a1','#7e22ce','#a16207','#ea580c','#b91c1c','#066b34','#1d4ed8'];
    var fluxoSection=
      secHdr2('▶ GRÁFICO — RANKING DE FLUXOS')+
      Object.keys(byFluxo).sort(function(a,b){return byFluxo[b]-byFluxo[a];}).map(function(k,i){
        var c=byFluxo[k],p=Math.round(c/total*100);
        return '<tr>'+td(esc(k),'font-size:9.5pt;padding:6px 10px;border:1px solid #c8e6d4')+
          vizBar(c,total,fluxoColors[i%fluxoColors.length])+
          td(c,'text-align:center;font-weight:700;border:1px solid #c8e6d4')+
          td(p+'%','text-align:center;border:1px solid #c8e6d4')+'</tr>';
      }).join('');

    var sheet2=
      '<tr><td colspan="'+COLS2+'" class="title-row">RegulaAI Saúde — Indicadores & Gráficos</td></tr>'+
      '<tr><td colspan="'+COLS2+'" class="sub-row">Exportado em: '+dt+'   |   Base: '+rows.length+' guias   |   Aderência média: '+avgAdh+'%</td></tr>'+
      kpiSection+statusSection+riscoSection+adhSection+fluxoSection;

    /* ─── HTML Workbook ─── */
    var xml='<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>'+
      '<x:ExcelWorksheet><x:Name>Guias</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet>'+
      '<x:ExcelWorksheet><x:Name>Indicadores</x:Name><x:WorksheetOptions></x:WorksheetOptions></x:ExcelWorksheet>'+
      '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';

    var html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'+
      '<head><meta charset="UTF-8"><meta name="ProgId" content="Excel.Sheet">'+xml+
      '<style>'+css+'</style></head>'+
      '<body>'+
        '<table x:Name="Guias">'+sheet1+'</table>'+
        '<br style="mso-break-type:excel-sheet-break; page-break-before:always">'+
        '<table x:Name="Indicadores">'+sheet2+'</table>'+
      '</body></html>';

    var bom='﻿';
    var blob=new Blob([bom+html],{type:'application/vnd.ms-excel;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 200);
    toast('Excel gerado: '+rows.length+' guias em 2 abas','ok');
  }

  function viewKanban(){
    var wrap=el('div');

    // Ordem das colunas seguindo a sequência dos fluxos
    var KB_ORDER=['Em análise','Aguardando complemento','Em junta médica','Cotação de OPME','Analisada','Liberada','Negada'];
    var KB_CFG={
      'Em análise':             {ico:'clock',           cor:'#4a7fa5'},
      'Aguardando complemento': {ico:'hourglass',       cor:'#b07a1a'},
      'Em junta médica':        {ico:'users',           cor:'#6b57b0'},
      'Cotação de OPME':        {ico:'tag',             cor:'#0e7490'},
      'Analisada':              {ico:'check-circle',    cor:'#2faa66'},
      'Liberada':               {ico:'badge-check',     cor:'#0a8a43'},
      'Negada':                 {ico:'x-circle',        cor:'#b91c1c'},
    };

    // Aplica filtro de período do Kanban (independente do filtro da view Guias)
    var kp=State.kanbanPeriodo;
    var kf=State.kanbanFiltros;
    var guias=guiasVisiveis().filter(function(g){
      if(kp.de&&g.dataEmissao<kp.de) return false;
      if(kp.ate&&g.dataEmissao>kp.ate) return false;
      if(kf.uti==='sim'&&!g.uti) return false;
      if(kf.uti==='nao'&&g.uti) return false;
      if(kf.regime&&g.regime!==kf.regime) return false;
      if(kf.tipo&&g.tipo!==kf.tipo) return false;
      return true;
    });
    var total=guias.length;

    wrap.appendChild(el('div',{class:'page-title'},
      '<div><h1>'+ico('columns-3',18)+' Kanban de Guias</h1><p>Acompanhamento visual por status — clique em qualquer card para detalhar.</p></div>'+
      '<div style="display:flex;gap:8px;align-items:center"><span style="font-size:12px;color:var(--muted)">'+total+' guia(s) visíveis</span></div>'
    ));

    // Barra de filtro de período
    var bar=el('div',{class:'k-period-bar'});
    var periodLabel=el('span',{class:'k-period-label'});
    periodLabel.innerHTML=ico('calendar-range',13)+' Período de emissão';
    bar.appendChild(periodLabel);

    var periodWrap=el('div',{id:'kbPeriodoWrap',style:'display:flex;align-items:center'});
    bar.appendChild(periodWrap);

    if(kp.de||kp.ate){
      var btnLimpar=el('button',{class:'btn ghost',style:'font-size:12px;padding:4px 10px;height:auto;display:flex;align-items:center;gap:4px'});
      btnLimpar.innerHTML=ico('x',12)+' Limpar';
      btnLimpar.onclick=function(){ State.kanbanPeriodo={de:'',ate:''}; render(); };
      bar.appendChild(btnLimpar);
    }

    wrap.appendChild(bar);

    makeDateRangePicker(
      periodWrap,
      kp.de, kp.ate,
      function(de,ate){ State.kanbanPeriodo={de:de,ate:ate}; render(); }
    );

    // ── Barra de filtros adicionais — dropdowns ───────────────────────
    var KB_SHORT={
      'Em análise':'Análise','Aguardando complemento':'Ag. complemento',
      'Em junta médica':'Junta médica',
      'Cotação de OPME':'Cotação OPME','Analisada':'Analisada',
      'Liberada':'Liberada','Negada':'Negada'
    };
    var hasKF=kf.colunas.length||kf.uti||kf.regime||kf.tipo;

    function closeFltDrops(){
      var ds=document.querySelectorAll('.k-flt-drop');
      for(var i=0;i<ds.length;i++) ds[i].style.display='none';
    }
    function toggleFltDrop(drop,e){
      e.stopPropagation();
      var wasOpen=drop.style.display!=='none';
      closeFltDrops();
      if(!wasOpen) drop.style.display='block';
    }
    function fltItem(label,isSelected,onclick){
      var item=el('div',{class:'k-flt-item'+(isSelected?' sel':'')});
      var chk=el('span',{class:'k-flt-chk'});
      if(isSelected) chk.innerHTML=ico('check',10);
      item.appendChild(chk);
      var txt=document.createTextNode(' '+label);
      item.appendChild(txt);
      item.onclick=onclick;
      return item;
    }
    function makeFltWrap(icoName,baseLabel,isActive,buildDrop){
      var wrap=el('div',{class:'k-flt-wrap'});
      var btn=el('button',{class:'k-flt-btn'+(isActive?' active':'')});
      btn.innerHTML=ico(icoName,12)+' '+baseLabel+' '+ico('chevron-down',10);
      var drop=el('div',{class:'k-flt-drop',style:'display:none'});
      buildDrop(drop);
      btn.onclick=function(e){ toggleFltDrop(drop,e); };
      wrap.appendChild(btn);
      wrap.appendChild(drop);
      return wrap;
    }

    var fbar=el('div',{class:'k-filter-bar'});
    var fbarLbl=el('span',{class:'k-flt-label'});
    fbarLbl.innerHTML=ico('sliders-horizontal',12)+' Filtros';
    fbar.appendChild(fbarLbl);

    // Colunas
    var colLabel='Colunas'+(kf.colunas.length?' ('+kf.colunas.length+')':'');
    fbar.appendChild(makeFltWrap('eye',colLabel,kf.colunas.length>0,function(drop){
      drop.appendChild(fltItem('Todas as colunas',kf.colunas.length===0,function(){
        State.kanbanFiltros.colunas=[]; render();
      }));
      drop.appendChild(el('div',{class:'k-flt-sep'}));
      KB_ORDER.forEach(function(s){
        var isChk=kf.colunas.indexOf(s)!==-1;
        drop.appendChild(fltItem(KB_SHORT[s]||s,isChk,(function(status){
          return function(){
            var idx=State.kanbanFiltros.colunas.indexOf(status);
            if(idx!==-1) State.kanbanFiltros.colunas.splice(idx,1);
            else State.kanbanFiltros.colunas.push(status);
            render();
          };
        })(s)));
      });
    }));

    // UTI
    var utiLabel=kf.uti==='sim'?'UTI':(kf.uti==='nao'?'Não UTI':'UTI');
    fbar.appendChild(makeFltWrap('bed',utiLabel,kf.uti!=='',function(drop){
      [['','Todos'],['sim','UTI'],['nao','Não UTI']].forEach(function(opt){
        drop.appendChild(fltItem(opt[1],kf.uti===opt[0],(function(v){
          return function(){ State.kanbanFiltros.uti=v; render(); };
        })(opt[0])));
      });
    }));

    // Regime
    var regLabel=kf.regime||'Regime';
    fbar.appendChild(makeFltWrap('clock',regLabel,kf.regime!=='',function(drop){
      [['','Todos'],['Urgência','Urgência'],['Eletivo','Eletivo']].forEach(function(opt){
        drop.appendChild(fltItem(opt[1],kf.regime===opt[0],(function(v){
          return function(){ State.kanbanFiltros.regime=v; render(); };
        })(opt[0])));
      });
    }));

    // Tipo
    var tipoLabel=kf.tipo||'Tipo';
    fbar.appendChild(makeFltWrap('tag',tipoLabel,kf.tipo!=='',function(drop){
      [['','Todos'],['Internação','Internação'],['Ambulatorial','Ambulatorial']].forEach(function(opt){
        drop.appendChild(fltItem(opt[1],kf.tipo===opt[0],(function(v){
          return function(){ State.kanbanFiltros.tipo=v; render(); };
        })(opt[0])));
      });
    }));

    if(hasKF){
      var btnClearKF=el('button',{class:'btn ghost',style:'font-size:12px;padding:4px 10px;height:auto;display:flex;align-items:center;gap:4px;margin-left:4px'});
      btnClearKF.innerHTML=ico('x',12)+' Limpar';
      btnClearKF.onclick=function(){ State.kanbanFiltros={colunas:[],uti:'',regime:'',tipo:''}; render(); };
      fbar.appendChild(btnClearKF);
    }

    wrap.appendChild(fbar);

    var kb=el('div',{class:'kanban'});

    KB_ORDER.forEach(function(s){
      if(kf.colunas.length&&kf.colunas.indexOf(s)===-1) return;
      var cfg=KB_CFG[s]||{ico:'circle',cor:'#6b7280'};
      var lst=guias.filter(function(g){return g.status===s});

      var col=el('div',{class:'k-col'});

      col.innerHTML=
        '<div class="k-col-hd">'+
          '<div class="k-col-hd-left">'+
            '<span class="k-col-icon">'+ico(cfg.ico,13)+'</span>'+
            '<span class="k-col-title">'+esc(s)+'</span>'+
          '</div>'+
          '<span class="k-count">'+lst.length+'</span>'+
        '</div>'+
        '<div class="k-col-body" id="kcol-'+s.replace(/\s/g,'_')+'"></div>';

      kb.appendChild(col);

      var body=col.querySelector('.k-col-body');
      if(!lst.length){
        body.innerHTML='<div class="k-empty">'+ico('inbox',22)+'<br>Sem guias</div>';
      }
      lst.forEach(function(g){
        var ad=guiaAderencia(g);
        var et=etapaAtualDe(g);
        var etapaLabel=et?esc(et.nome):'—';
        var badges=(g.opme?'<span class="badge warn" style="font-size:10px">OPME</span>':'')+
                   (g.uti?'<span class="badge info" style="font-size:10px">UTI</span>':'')+
                   (g.regime==='Urgência'?'<span class="badge danger" style="font-size:10px">URG</span>':'');

        var c=el('div',{class:'k-card'});
        c.innerHTML=
          '<div class="k-card-top">'+
            '<span class="k-num">'+esc(g.numero)+'</span>'+
            riskPill(g.risco)+
          '</div>'+
          '<div class="k-beneficiario">'+ico('user',11)+' '+esc(g.beneficiario.nome)+'</div>'+
          '<div class="k-tipo">'+esc(g.tipo.toUpperCase())+
            (badges?'<div class="k-badges">'+badges+'</div>':'')+
          '</div>'+
          '<div class="k-etapa">'+ico('git-branch',10)+' '+esc(g.fluxo.nome)+' &rsaquo; <b>'+etapaLabel+'</b></div>'+
          '<div class="k-card-foot">'+
            aderenciaBar(ad)+
            '<span class="k-regime'+(g.regime==='Urgência'?' urgente':'')+'">'+esc(g.regime)+'</span>'+
          '</div>';
        c.onclick=function(){openGuia(g,'resumo')};
        body.appendChild(c);
      });
    });

    wrap.appendChild(kb);
    return wrap;
  }

  // ── Fluxos: lógica compartilhada ──────────────────────────────────
  var INSTR_DEFAULT={
    'ANÁLISE ADM - REGULAÇÃO URG':       'Verificar dados administrativos da guia: beneficiário, prestador, vínculo contratual e cobertura. Validar elegibilidade e regime de urgência.',
    'SETOR ADMINISTRATIVO':              'Conferir dados cadastrais do beneficiário e prestador. Verificar contrato, DLP e vínculo ativo no sistema.',
    'SOLICITAR CONTRATO/DLP/VÍNCULO':   'Solicitar ao prestador a documentação de contrato, DLP e vínculo vigente. Registrar pendência e aguardar retorno.',
    'AUDITORIA PRÉVIA':                  'Realizar análise documental prévia: verificar completude dos anexos, justificativa clínica, indicação do procedimento e aderência à DUT.',
    'SOLICITAR CORREÇÃO AO PRESTADOR':  'Identificar inconsistências na guia e solicitar correção formal ao prestador, detalhando os itens pendentes.',
    'ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES': 'Consultar histórico clínico do beneficiário: tratamentos anteriores, internações, guias relacionadas e evolução do quadro.',
    'PATOLOGIAS ANTERIORES AO PLANO':   'Verificar se a condição possui carência ou é prévia à adesão ao plano. Avaliar cobertura conforme contrato.',
    'ABORDAGEM PRESENCIAL FILIAL':       'Acionar equipe da filial para contato presencial com prestador ou beneficiário, conforme necessidade do caso.',
    'AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA': 'Enfermeira auditora realiza triagem clínica: avaliar indicação, regime, complexidade e encaminhar para auditor médico se necessário.',
    'AUDITORIA EXTERNA - MÉDICO':        'Médico auditor realiza análise técnica completa: indicação clínica, necessidade do procedimento, alternativas e conformidade com DUT.',
    'AUDITORIA PRÉVIA (DOCUMENTAÇÃO)':  'Conferir documentação técnica recebida: laudos, exames, relatórios e demais anexos exigidos para a autorização.',
    'AUDITORIA PRÉVIA (DOCUMENTAÇÃO MÉDICO)': 'Médico auditor confere documentação técnica: laudo do médico assistente, exames de imagem, patologia e histórico clínico.',
    'AUDITORIA EXTERNA - CONTATO MÉDICO ASSISTENTE': 'Realizar contato com o médico assistente para esclarecimentos sobre indicação clínica, alternativas terapêuticas e necessidade do procedimento.',
    'CONTATO MÉDICO ASSIST. PELA OPERADORA': 'Operadora entra em contato com médico assistente para obter informações complementares sobre o caso.',
    'AUDITORIA ESPECIALIZADA (ANALÍTICA/BUCO/NEURO)': 'Auditor especializado (analítico, bucomaxilofacial ou neurológico) realiza análise aprofundada conforme especialidade do procedimento.',
    'AUDITORIA MÉDICA URG/PA':           'Médico auditor analisa guia de urgência/pronto-atendimento: verificar necessidade, pertinência e cobertura em regime de urgência.',
    'JUNTA MÉDICA':                      'Convocar junta médica com especialistas para análise colegiada de casos complexos ou de alto custo. Emitir parecer fundamentado.',
    'GARANTIA DE ATENDIMENTO':           'Emitir garantia de atendimento ao beneficiário após análise favorável. Comunicar prestador e beneficiário do prazo e condições.',
    'COTAÇÃO OPME':                      'Solicitar cotação de OPME a no mínimo 3 fornecedores. Verificar equivalência técnica entre os itens cotados. Registrar fornecedor selecionado e justificativa.',
    'PARAMETRIZAÇÃO':                    'Cadastrar regras de parametrização para o procedimento no sistema. Vincular procedimentos, pacotes, Mat/Med e diárias conforme protocolo.',
    'FINALIZAR GUIA':                    'Emitir parecer final da operadora (autorização, negativa ou solicitação de complemento). Registrar decisão, motivo e notificar prestador.',
    'ENCERRAR PROCESSO':                 'Encerrar o processo administrativo da guia após conclusão de todas as etapas. Arquivar documentação e registrar em log.',
    'PROCESSO ENCERRADO':                'Processo finalizado. Nenhuma ação adicional necessária. Guia disponível apenas para consulta.'
  };

  function getInstr(fid, idx, nome){
    var key=fid+'|'+idx;
    if(State.etapaInstrucoes[key]!==undefined) return State.etapaInstrucoes[key];
    return INSTR_DEFAULT[nome]||'';
  }

  function buildFluxosUI(container){
    var fluxos=MOCK.FLUXOS;
    var subBar=el('div',{class:'cfg-sub-tab-bar'});
    var subContent=el('div',{class:'cfg-sub-content'});

    // Índice etapa(subfluxo) → fluxos que a contêm, para apontar duplicidade
    var etapaIndex={};
    fluxos.forEach(function(f){
      f.etapas.forEach(function(nome,idx){
        if(!etapaIndex[nome]) etapaIndex[nome]=[];
        etapaIndex[nome].push({fid:f.id,fnome:f.nome,idx:idx});
      });
    });

    // Busca de fluxos e subfluxos — full-width no flex-wrap, filtro nos botões abaixo
    var srchWrap=el('div',{style:'position:relative;width:100%'});
    var srchFluxo=el('input',{class:'param-search cfg-sub-search',type:'text',placeholder:'Buscar fluxo ou subfluxo...'});
    var srchResults=el('div',{class:'fluxo-search-results',style:'display:none'});
    srchWrap.appendChild(srchFluxo);
    srchWrap.appendChild(srchResults);
    subBar.appendChild(srchWrap);
    fluxos.forEach(function(f,i){
      var btn=el('button',{class:'cfg-sub-tab'+(i===0?' active':''),'data-fid':f.id},f.id);
      btn.title=f.nome;
      subBar.appendChild(btn);
    });

    function renderSearchResults(q){
      if(!q){ srchResults.style.display='none'; srchResults.innerHTML=''; return; }
      var fluxoMatches=fluxos.filter(function(f){
        return f.id.toLowerCase().indexOf(q)>=0||f.nome.toLowerCase().indexOf(q)>=0;
      });
      var etapaMatches=Object.keys(etapaIndex).filter(function(nome){
        return nome.toLowerCase().indexOf(q)>=0;
      });
      if(!fluxoMatches.length&&!etapaMatches.length){
        srchResults.innerHTML='<div class="fsr-empty">Nenhum fluxo ou subfluxo encontrado.</div>';
        srchResults.style.display='block';
        return;
      }
      var html='';
      if(fluxoMatches.length){
        html+='<div class="fsr-group-lbl">Fluxos</div>';
        fluxoMatches.forEach(function(f){
          html+='<div class="fsr-item" data-go-fid="'+esc(f.id)+'">'+ico('git-branch',12)+' <b>'+esc(f.id)+'</b> — '+esc(f.nome)+'</div>';
        });
      }
      if(etapaMatches.length){
        html+='<div class="fsr-group-lbl">Subfluxos (etapas)</div>';
        etapaMatches.forEach(function(nome){
          var owners=etapaIndex[nome];
          var multi=owners.length>1;
          html+='<div class="fsr-item fsr-etapa">'+
            '<div class="fsr-etapa-nome">'+ico('layers',12)+' '+esc(nome)+(multi?' <span class="badge warn" style="font-size:9.5px">em '+owners.length+' fluxos</span>':'')+'</div>'+
            '<div class="fsr-etapa-owners">'+
              owners.map(function(o){
                return '<span class="fsr-owner-tag" data-go-fid="'+esc(o.fid)+'" data-go-idx="'+o.idx+'">'+esc(o.fid)+' · '+esc(o.fnome)+'</span>';
              }).join('')+
            '</div>'+
          '</div>';
        });
      }
      srchResults.innerHTML=html;
      srchResults.style.display='block';
      $$('.fsr-item[data-go-fid], .fsr-owner-tag',srchResults).forEach(function(node){
        node.onclick=function(e){
          e.stopPropagation();
          var fid=node.getAttribute('data-go-fid');
          var idxAttr=node.getAttribute('data-go-idx');
          showFluxo(fid, idxAttr!==null?parseInt(idxAttr,10):null);
          srchResults.style.display='none';
          srchFluxo.value='';
          $$('.cfg-sub-tab',subBar).forEach(function(b){ b.style.display=''; });
        };
      });
    }

    srchFluxo.oninput=function(){
      var q=srchFluxo.value.trim().toLowerCase();
      $$('.cfg-sub-tab',subBar).forEach(function(b){
        var fid=b.getAttribute('data-fid');
        var fn=''; for(var i=0;i<fluxos.length;i++){ if(fluxos[i].id===fid){ fn=fluxos[i].nome; break; } }
        b.style.display=(!q||fid.toLowerCase().indexOf(q)>=0||fn.toLowerCase().indexOf(q)>=0)?'':'none';
      });
      renderSearchResults(q);
    };
    document.addEventListener('click',function(e){
      if(!srchWrap.contains(e.target)) srchResults.style.display='none';
    });
    container.appendChild(subBar);
    container.appendChild(subContent);

    function showFluxo(fid, highlightIdx){
      $$('.cfg-sub-tab',subBar).forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-fid')===fid); });
      var f=null; for(var i=0;i<fluxos.length;i++){ if(fluxos[i].id===fid){ f=fluxos[i]; break; } }
      if(!f){ subContent.innerHTML=''; return; }
      subContent.innerHTML='';

      var VINC_LABELS={'proc':'Procedimentos','pac':'Pacotes','matmed':'Mat/Med','dt':'Diárias/Taxas'};
      var VINC_ICO={'proc':'stethoscope','pac':'package','matmed':'pill','dt':'calendar-days'};
      var VINC_COLS={'proc':['cod','desc'],'pac':['cod','desc'],'matmed':['cod','desc','opme'],'dt':['cod','desc']};
      var VINC_DATA={'proc':MOCK.PROCEDIMENTOS,'pac':MOCK.PACOTES,'matmed':MOCK.MATMED,'dt':MOCK.DIARIAS_TAXAS};
      var COL_LABELS={cod:'Código',desc:'Descrição',peso:'Peso',obrig:'Obrig.',ia:'IA',opme:'OPME'};

      var hd=el('div',{class:'fluxo-hd'});
      hd.innerHTML=
        '<div class="fluxo-hd-id">'+esc(f.id)+'</div>'+
        '<div class="fluxo-hd-info" style="flex:1">'+
          '<div class="fluxo-hd-nome">'+esc(f.nome)+'</div>'+
          '<div class="fluxo-hd-meta">'+
            '<span class="badge">'+esc(f.regime)+'</span>'+
            '<span style="font-size:12px;color:var(--muted)">'+f.etapas.length+' etapas</span>'+
          '</div>'+
        '</div>'+
        '<button class="btn-animated" id="btnSalvarFluxo">'+ico('save',13)+' Salvar instruções</button>';
      subContent.appendChild(hd);

      var vincBar=el('div',{class:'vinc-tab-bar'});
      var btnSub=el('button',{class:'vinc-tab active','data-vinc':'subfluxos'});
      btnSub.innerHTML=ico('git-branch',12)+' Subfluxos';
      vincBar.appendChild(btnSub);
      (f.vinc||[]).forEach(function(v){
        var vBtn=el('button',{class:'vinc-tab','data-vinc':v});
        vBtn.innerHTML=ico(VINC_ICO[v]||'link',12)+' '+(VINC_LABELS[v]||v);
        vincBar.appendChild(vBtn);
      });
      var vBtnIA=el('button',{class:'vinc-tab','data-vinc':'pesosIA'});
      vBtnIA.innerHTML=ico('brain',12)+' Pesos IA';
      vincBar.appendChild(vBtnIA);

      var vincPanel=el('div',{class:'vinc-panel'});

      function buildSubfluxos(){
        var wrap2=el('div',{style:'padding:14px'});
        var srch=el('input',{class:'param-search',type:'text',placeholder:'Filtrar etapa...',style:'margin-bottom:12px'});
        wrap2.appendChild(srch);
        var ol=el('ol',{class:'fluxo-etapas-ol'});
        f.etapas.forEach(function(nome,idx){
          var key=fid+'|'+idx;
          var isOpme=nome==='COTAÇÃO OPME';
          var isJunta=nome.indexOf('JUNTA')>=0;
          var isFim=nome.indexOf('FINALIZAR')>=0||nome.indexOf('ENCERR')>=0||nome.indexOf('PROCESSO ENCERRADO')>=0;
          var li=el('li',{class:'fluxo-etapa-item'});
          li.innerHTML=
            '<div class="fe-header">'+
              '<span class="fe-num">'+(idx+1)+'</span>'+
              '<span class="fe-nome">'+esc(nome)+'</span>'+
              (isOpme?'<span class="badge warn" style="font-size:10px">OPME</span>':'')+
              (isJunta?'<span class="badge info" style="font-size:10px">JUNTA</span>':'')+
              (isFim?'<span class="badge" style="font-size:10px">FIM</span>':'')+
            '</div>'+
            '<div class="fe-instr-wrap">'+
              '<label class="fe-instr-lbl">'+ico('sparkles',11)+' Instrução para a IA</label>'+
              '<textarea class="fe-instr" data-key="'+key+'" rows="3" placeholder="Descreva o que a IA deve realizar nesta etapa...">'+esc(getInstr(fid,idx,nome))+'</textarea>'+
            '</div>';
          ol.appendChild(li);
        });
        srch.oninput=function(){
          var q=srch.value.trim().toLowerCase();
          var items=ol.querySelectorAll('.fluxo-etapa-item');
          for(var ri=0;ri<items.length;ri++){
            var nm=items[ri].querySelector('.fe-nome');
            items[ri].style.display=(!q||(nm&&nm.textContent.toLowerCase().indexOf(q)>=0))?'':'none';
          }
        };
        wrap2.appendChild(ol); return wrap2;
      }

      function showVinc(vkey){
        $$('.vinc-tab',vincBar).forEach(function(b){b.classList.toggle('active',b.getAttribute('data-vinc')===vkey);});
        vincPanel.innerHTML='';
        if(vkey==='subfluxos'){
          vincPanel.appendChild(buildSubfluxos());
        } else if(vkey==='pesosIA'){
          var IA_CRITERIA=[
            {key:'documental',   label:'Documental',    ico:'file-check',  desc:'Verificação de documentação e anexos obrigatórios (laudo, guia TISS, exames)'},
            {key:'dut',          label:'DUT',            ico:'shield-check', desc:'Aderência às Diretrizes de Utilização da ANS'},
            {key:'procedimento', label:'Procedimentos',  ico:'clipboard-list',desc:'Vinculações e parametrização de procedimentos TUSS'},
            {key:'pacote',       label:'Pacotes',         ico:'package',     desc:'Pacotes clínicos vinculados ao fluxo'},
            {key:'matmed',       label:'Mat/Med',         ico:'pill',        desc:'Materiais, medicamentos e OPME vinculados'},
            {key:'diaria',       label:'Diárias/Taxas',   ico:'calendar',    desc:'Diárias de internação e taxas hospitalares'},
            {key:'contratual',   label:'Contratual',      ico:'badge-check', desc:'Elegibilidade e cobertura contratual do beneficiário'},
            {key:'historico',    label:'Histórico',       ico:'clock',       desc:'Histórico clínico e tratamentos anteriores do paciente'}
          ];
          var _savedPesos=State.fluxoWeights[fid]||{};
          var _wWrap=el('div',{style:'padding:16px'});
          var _wInfo=el('div',{style:'font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.6;background:var(--g-50);border:1px solid var(--g-100);border-radius:8px;padding:10px 14px'});
          _wInfo.innerHTML=ico('info',13)+' Configure o peso de cada critério no cálculo de aderência das guias deste fluxo. '+
            '<b style="color:var(--g-700)">0 = não avaliado</b> &nbsp;·&nbsp; <b style="color:var(--g-700)">10 = máxima relevância.</b> '+
            'Os pesos são proporcionais entre si — o que importa é a relação entre eles.';
          _wWrap.appendChild(_wInfo);
          var _wTbl=el('table',{style:'width:100%;border-collapse:collapse'});
          _wTbl.innerHTML='<thead><tr>'+
            '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid var(--g-100)">Critério</th>'+
            '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid var(--g-100)">Descrição</th>'+
            '<th style="width:220px;padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid var(--g-100)">Peso (0 – 10)</th>'+
            '</tr></thead>';
          var _wTbody=el('tbody');
          IA_CRITERIA.forEach(function(c,idx){
            var cur=_savedPesos[c.key]!=null?_savedPesos[c.key]:DEFAULT_PESOS[c.key];
            var tr=el('tr',{style:'background:'+(idx%2===0?'#f9fcfa':'#fff')});
            tr.innerHTML=
              '<td style="padding:11px 12px;font-size:13px;font-weight:700;color:var(--ink)">'+ico(c.ico,13)+' '+esc(c.label)+'</td>'+
              '<td style="padding:11px 12px;font-size:12px;color:var(--muted)">'+esc(c.desc)+'</td>'+
              '<td style="padding:11px 12px">'+
                '<div style="display:flex;align-items:center;gap:10px;justify-content:center">'+
                  '<input type="range" min="0" max="10" step="1" value="'+cur+'" class="ia-peso-range" data-key="'+esc(c.key)+'"'+
                    ' style="flex:1;max-width:130px;accent-color:var(--g-600);cursor:pointer;height:4px">'+
                  '<span class="ia-peso-val" style="font-size:18px;font-weight:800;color:var(--g-700);min-width:28px;text-align:center">'+cur+'</span>'+
                '</div>'+
              '</td>';
            _wTbody.appendChild(tr);
          });
          _wTbl.appendChild(_wTbody);
          _wTbl.addEventListener('input',function(e){
            if(e.target.classList.contains('ia-peso-range'))
              e.target.parentNode.querySelector('.ia-peso-val').textContent=e.target.value;
          });
          _wWrap.appendChild(_wTbl);
          var _wBar=el('div',{style:'display:flex;justify-content:flex-end;margin-top:14px'});
          var _wSave=el('button',{class:'btn-animated'},ico('save',13)+' Salvar pesos deste fluxo');
          _wSave.onclick=function(){
            if(!State.fluxoWeights[fid]) State.fluxoWeights[fid]={};
            _wTbl.querySelectorAll('.ia-peso-range').forEach(function(inp){
              State.fluxoWeights[fid][inp.getAttribute('data-key')]=+inp.value;
            });
            localStorage.setItem('regula_fluxo_weights',JSON.stringify(State.fluxoWeights));
            State.guias.forEach(function(g){ if(g.fluxo&&g.fluxo.id===fid) g._cache=null; });
            toast('Pesos IA salvos para '+fid,'ok');
          };
          _wBar.appendChild(_wSave);
          _wWrap.appendChild(_wBar);
          vincPanel.appendChild(_wWrap);
          lcIcons();
        } else {
          var data=VINC_DATA[vkey]||[], cols=VINC_COLS[vkey]||['cod','desc'];
          // Colunas configuráveis extras — somente aba Procedimentos
          var PROC_SELECTS=vkey==='proc'?[
            {key:'ind_acidente',label:'Ind. Acidente',width:'152px',opts:[
              {v:'',t:'Todas'},
              {v:'nao',t:'Não (Não Acidente)'},
              {v:'sim',t:'Sim (Trabalho, Trânsito e Outros)'}
            ]},
            {key:'tipo_atend',label:'Tipo de atend.',width:'152px',opts:[
              {v:'',t:'Todos'},
              {v:'01',t:'01 - Remoção'},
              {v:'02',t:'02 - Pequena Cirurgia'},
              {v:'03',t:'03 - Outras Terapias'},
              {v:'04',t:'04 - Consulta'},
              {v:'08',t:'08 - Quimioterapia'},
              {v:'09',t:'09 - Radioterapia'}
            ]},
            {key:'natureza_atend',label:'Natureza atend.',width:'148px',opts:[
              {v:'',t:'Todas'},
              {v:'amb',t:'Ambulatorial'},
              {v:'int_cli',t:'Internação clínica'},
              {v:'int_cir',t:'Internação cirúrgica'},
              {v:'dem_int',t:'Demais internações'},
              {v:'ocup',t:'Ocupacional'},
              {v:'exc_ocup',t:'Exceto ocupacional'}
            ]},
            {key:'regime_atend',label:'Regime atend.',width:'110px',opts:[
              {v:'',t:'Todos'},
              {v:'eletivo',t:'Eletivo'},
              {v:'urgente',t:'Urgente'}
            ]}
          ]:[];
          var box=el('div',{class:'table-wrap'});
          var tv=el('table');
          // Cabeçalhos com larguras fixas para alinhar com as células
          var thCols=cols.map(function(c){
            var isBool=(c==='ia'||c==='opme'||c==='obrig');
            var w=c==='cod'?'style="width:110px"':isBool?'style="width:80px;text-align:center"':'';
            return '<th '+w+'>'+(COL_LABELS[c]||c.toUpperCase())+'</th>';
          }).join('')+PROC_SELECTS.map(function(s){
            return '<th style="width:'+s.width+'">'+s.label+'</th>';
          }).join('');
          tv.innerHTML='<thead><tr>'+thCols+
            '<th style="width:70px;text-align:center">Peso</th>'+
            '<th style="width:90px;text-align:center">Status</th>'+
            '<th style="width:140px;text-align:center">Instrução IA</th>'+
            '</tr></thead>';
          var tbv=el('tbody');
          // Helper — botão Instrução IA idêntico ao padrão DUT/Documental
          function _vincInstrBtn(vk,cod,hasInstr){
            return '<button class="vinc-instr-btn" data-vkey="'+vk+'" data-cod="'+esc(cod)+'" style="font-size:11px;padding:3px 10px;border-radius:12px;border:1.5px solid;cursor:pointer;font-weight:600;white-space:nowrap;'+
              (hasInstr?'background:var(--g-100);color:var(--g-700);border-color:var(--g-300)':'background:#fff;color:var(--muted);border-color:var(--g-200)')+'">'+
              ico('sparkles',11)+' '+(hasInstr?'Ler instrução':'Adicionar')+'</button>';
          }
          data.forEach(function(r){
            var cfg_key=vkey+'|'+r.cod;
            var cfg=State.vincConfig[cfg_key]||{};
            var peso=cfg.peso!=null?cfg.peso:r.peso;
            var status=cfg.status||'ativo';
            var instr=cfg.instr||'';
            var trv=el('tr');
            var staticCols=cols.map(function(c){
              var val=r[c];
              var isBool=typeof val==='boolean';
              if(isBool) val=val?'<span class="badge">Sim</span>':'<span class="badge muted">Não</span>';
              return '<td'+(isBool?' style="text-align:center"':'')+'>'+(val==null?'—':isBool?val:esc(String(val)))+'</td>';
            }).join('');
            var procSelCols=PROC_SELECTS.map(function(s){
              var curVal=cfg[s.key]||'';
              var selStyle='width:100%;font-size:11px;border:1.5px solid var(--g-200);border-radius:6px;padding:3px 5px;font-family:inherit;color:var(--ink);background:#fff;cursor:pointer';
              var optHtml=s.opts.map(function(o){
                return '<option value="'+esc(o.v)+'"'+(curVal===o.v?' selected':'')+'>'+esc(o.t)+'</option>';
              }).join('');
              return '<td style="padding:5px 8px"><select class="vinc-proc-sel" data-field="'+esc(s.key)+'" data-vkey="'+esc(vkey)+'" data-cod="'+esc(r.cod)+'" style="'+selStyle+'">'+optHtml+'</select></td>';
            }).join('');
            trv.innerHTML=staticCols+procSelCols+
              '<td style="text-align:center"><input type="number" class="vinc-peso" min="0" max="10" data-vkey="'+vkey+'" data-cod="'+esc(r.cod)+'" value="'+peso+'" style="width:52px;text-align:center;border:1.5px solid var(--g-200);border-radius:6px;padding:3px 5px;font-size:12px"></td>'+
              '<td style="text-align:center"><button class="vinc-status-btn '+(status==='ativo'?'active':'')+'" data-vkey="'+vkey+'" data-cod="'+esc(r.cod)+'" data-status="'+status+'" style="font-size:11px;padding:3px 10px;border-radius:12px;border:1.5px solid;cursor:pointer;font-weight:600;background:'+(status==='ativo'?'var(--g-700)':'#fff')+';color:'+(status==='ativo'?'#fff':'var(--muted)')+';border-color:'+(status==='ativo'?'var(--g-700)':'var(--g-200)')+'">'+esc(status==='ativo'?'Ativo':'Inativo')+'</button></td>'+
              '<td style="text-align:center">'+_vincInstrBtn(vkey,r.cod,!!instr)+'</td>';
            tbv.appendChild(trv);
          });
          tv.appendChild(tbv); box.appendChild(tv);

          // Click unificado: Instrução IA (botão) + Status toggle
          box.addEventListener('click',function(e){
            // Instrução IA — abre modal
            var iBtn=e.target.closest('.vinc-instr-btn');
            if(iBtn){
              var vk=iBtn.getAttribute('data-vkey'), cod=iBtn.getAttribute('data-cod');
              var k=vk+'|'+cod;
              var descTd=iBtn.closest('tr').cells[1];
              var descTxt=descTd?descTd.textContent.trim():cod;
              var cur=(State.vincConfig[k]||{}).instr||'';
              var bodyHTML=
                '<div style="margin-bottom:10px;font-size:12.5px;color:var(--muted)">Item: <b>'+esc(descTxt)+'</b></div>'+
                '<textarea id="vincInstrModal" maxlength="3000" rows="14" style="width:100%;font-size:13px;line-height:1.55;border:1.5px solid var(--g-200);border-radius:8px;padding:10px 14px;resize:vertical;font-family:inherit;color:var(--ink);box-sizing:border-box">'+esc(cur)+'</textarea>'+
                '<div style="display:flex;justify-content:flex-end;margin-top:5px"><span id="vincInstrCount" style="font-size:11px;color:var(--muted)">'+cur.length+' / 3000</span></div>';
              var footHTML='<button class="btn ghost" id="vincInstrCancel">'+ico('x',13)+' Cancelar</button>'+
                '<button class="btn" id="vincInstrSave">'+ico('save',13)+' Salvar</button>';
              var m=modal(ico('sparkles')+' Instrução para a IA','Editar instrução do item · máx. 3000 caracteres',bodyHTML,footHTML);
              var mta=m.querySelector('#vincInstrModal');
              var cnt=m.querySelector('#vincInstrCount');
              mta.oninput=function(){ cnt.textContent=mta.value.length+' / 3000'; };
              m.querySelector('#vincInstrCancel').onclick=function(){ m.closest('.modal-backdrop').remove(); };
              m.querySelector('#vincInstrSave').onclick=function(){
                var newVal=mta.value;
                if(!State.vincConfig[k]) State.vincConfig[k]={};
                State.vincConfig[k].instr=newVal;
                localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
                // Atualiza aparência do botão inline
                iBtn.innerHTML=ico('sparkles',11)+' '+(newVal?'Ler instrução':'Adicionar');
                iBtn.style.background=newVal?'var(--g-100)':'#fff';
                iBtn.style.color=newVal?'var(--g-700)':'var(--muted)';
                iBtn.style.borderColor=newVal?'var(--g-300)':'var(--g-200)';
                m.closest('.modal-backdrop').remove();
                toast('Instrução salva','ok');
                lcIcons();
              };
              setTimeout(function(){ mta.focus(); mta.setSelectionRange(mta.value.length,mta.value.length); },50);
              return;
            }
            // Status toggle
            var sBtn=e.target.closest('.vinc-status-btn');
            if(!sBtn) return;
            var k2=sBtn.getAttribute('data-vkey')+'|'+sBtn.getAttribute('data-cod');
            var cur2=sBtn.getAttribute('data-status'), novo=cur2==='ativo'?'inativo':'ativo';
            if(!State.vincConfig[k2]) State.vincConfig[k2]={};
            State.vincConfig[k2].status=novo;
            sBtn.setAttribute('data-status',novo);
            sBtn.textContent=novo==='ativo'?'Ativo':'Inativo';
            sBtn.style.background=novo==='ativo'?'var(--g-700)':'#fff';
            sBtn.style.color=novo==='ativo'?'#fff':'var(--muted)';
            sBtn.style.borderColor=novo==='ativo'?'var(--g-700)':'var(--g-200)';
            sBtn.classList.toggle('active',novo==='ativo');
            localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
          });

          // Salvar pesos
          var saveBar=el('div',{style:'display:flex;justify-content:flex-end;padding:8px 14px;border-top:1px solid var(--g-100)'});
          var saveBtn=el('button',{class:'btn-animated'},ico('save',13)+' Salvar parametrização');
          saveBtn.onclick=function(){
            $$('.vinc-peso',box).forEach(function(inp){
              var k=inp.getAttribute('data-vkey')+'|'+inp.getAttribute('data-cod');
              if(!State.vincConfig[k]) State.vincConfig[k]={};
              State.vincConfig[k].peso=Math.min(10,Math.max(0,+inp.value||0));
            });
            $$('.vinc-proc-sel',box).forEach(function(sel){
              var k=sel.getAttribute('data-vkey')+'|'+sel.getAttribute('data-cod');
              if(!State.vincConfig[k]) State.vincConfig[k]={};
              State.vincConfig[k][sel.getAttribute('data-field')]=sel.value;
            });
            localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
            toast('Parametrização salva','ok');
          };
          saveBar.appendChild(saveBtn);

          // Export/Import toolbar — Procedimentos, Pacotes, Mat/Med
          var _vincToolbar=null;
          if(vkey==='proc'||vkey==='pac'||vkey==='matmed'){
            var _tabLabels={proc:'Procedimentos',pac:'Pacotes',matmed:'MatMed'};
            var _fileNames={proc:'procedimentos',pac:'pacotes',matmed:'matmed'};
            var _hasOpme=vkey==='matmed';
            var _vfInput=el('input',{type:'file',accept:'.csv,.xls,.xlsx',style:'display:none'});
            var _btnExp=el('button',{class:'btn ghost',style:'display:flex;align-items:center;gap:6px;font-size:12.5px',title:'Exportar lista com instruções IA cadastradas'},
              ico('download',14)+' Exportar planilha');
            var _btnImp=el('button',{class:'btn ghost',style:'display:flex;align-items:center;gap:6px;font-size:12.5px',title:'Importar instruções IA de uma planilha preenchida'},
              ico('upload',14)+' Importar instruções IA');
            _vincToolbar=el('div',{style:'display:flex;align-items:center;gap:8px;padding:10px 12px 0;flex-wrap:wrap'});
            _vincToolbar.appendChild(_btnExp);
            _vincToolbar.appendChild(_btnImp);
            _vincToolbar.appendChild(_vfInput);

            // Export
            (function(vk,d,hasOpme,fname,tlabel){
              _btnExp.onclick=function(){
                var css2='table{border-collapse:collapse;font-family:Calibri,sans-serif;font-size:11pt}'+
                  'th{background:#0a8a43;color:#fff;padding:8px 12px;border:1px solid #066b34;font-weight:700;text-align:left}'+
                  'td{padding:7px 12px;border:1px solid #c8e6d4;vertical-align:top}'+
                  'tr:nth-child(even) td{background:#f2faf6}';
                var header='<tr><th>Código</th><th>Descrição</th>'+(hasOpme?'<th>OPME</th>':'')+'<th>Peso (0-10)</th><th>Instrução IA</th></tr>';
                var rowsHtml=header;
                d.forEach(function(r){
                  var cod=String(r.cod);
                  var cfg=State.vincConfig[vk+'|'+cod]||{};
                  var instr=cfg.instr||'';
                  var peso=cfg.peso!=null?cfg.peso:r.peso!=null?r.peso:'';
                  rowsHtml+='<tr><td>'+esc(cod)+'</td><td>'+esc(r.desc||'')+'</td>'+(hasOpme?'<td>'+esc(r.opme?'Sim':'Não')+'</td>':'')+'<td>'+esc(String(peso))+'</td><td>'+esc(instr)+'</td></tr>';
                });
                var html2='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'+
                  '<head><meta charset="UTF-8"><style>'+css2+'</style></head>'+
                  '<body><table x:Name="'+tlabel+'">'+rowsHtml+'</table></body></html>';
                var blob2=new Blob(['﻿'+html2],{type:'application/vnd.ms-excel;charset=utf-8'});
                var a2=document.createElement('a');
                a2.href=URL.createObjectURL(blob2);
                a2.download=fname+'.xls';
                document.body.appendChild(a2); a2.click();
                setTimeout(function(){ document.body.removeChild(a2); URL.revokeObjectURL(a2.href); },200);
              };
            })(vkey,data,_hasOpme,_fileNames[vkey],_tabLabels[vkey]);

            // Import
            _btnImp.onclick=function(){ _vfInput.value=''; _vfInput.click(); };

            (function(vk,d,hasOpme){
              _vfInput.onchange=function(){
                var file=_vfInput.files[0];
                if(!file) return;
                var reader=new FileReader();
                reader.onload=function(ev){
                  var text=ev.target.result;
                  var rows=[];
                  var sniff=text.replace(/^﻿/,'').trimLeft().toLowerCase();
                  if(sniff.indexOf('<html')===0||sniff.indexOf('<!doc')===0||sniff.indexOf('<table')===0){
                    var parser=new DOMParser();
                    var doc=parser.parseFromString(text,'text/html');
                    var tbl=doc.querySelector('table');
                    if(!tbl){ toast('Nenhuma tabela encontrada no arquivo','danger'); return; }
                    tbl.querySelectorAll('tr').forEach(function(tr){
                      var cells=[];
                      tr.querySelectorAll('td,th').forEach(function(td){ cells.push(td.textContent.trim()); });
                      if(cells.some(function(c){return c;})) rows.push(cells);
                    });
                  } else {
                    text.split(/\r?\n/).filter(function(l){return l.trim();}).forEach(function(line){
                      var cols=[],cur='',inQ=false;
                      for(var i=0;i<line.length;i++){
                        var ch=line[i];
                        if(ch==='"'){inQ=!inQ;}
                        else if((ch===','||ch===';')&&!inQ){cols.push(cur.trim());cur='';}
                        else cur+=ch;
                      }
                      cols.push(cur.trim());
                      rows.push(cols);
                    });
                  }
                  if(!rows.length){ toast('Arquivo vazio ou inválido','danger'); return; }
                  // Detect header and column indexes
                  var startRow=0;
                  var instrCol=hasOpme?4:3;
                  var pesoCol=hasOpme?3:2;
                  var firstCell=(rows[0][0]||'').toLowerCase().replace(/[^a-záéíóúãõç]/g,'');
                  if(firstCell==='codigo'||firstCell==='código'||firstCell==='cod'){
                    startRow=1;
                    for(var ci=0;ci<rows[0].length;ci++){
                      var h=(rows[0][ci]||'').toLowerCase();
                      if(h.indexOf('peso')>=0){ pesoCol=ci; }
                      if(h.indexOf('instr')>=0||h.indexOf('ia')>=0){ instrCol=ci; }
                    }
                  }
                  // Build lookup map from existing data
                  var codMap={};
                  d.forEach(function(r){ codMap[String(r.cod).toLowerCase()]=String(r.cod); });
                  var parsed=rows.slice(startRow).filter(function(r){return r[0]&&r[0].length>0;}).map(function(r){
                    var cod=(r[0]||'').trim();
                    var instr=(r[instrCol]||'').trim();
                    var pesoRaw=(r[pesoCol]||'').trim();
                    var peso=pesoRaw!==''?Math.min(10,Math.max(0,parseFloat(pesoRaw.replace(',','.'))||0)):null;
                    var realCod=codMap[cod.toLowerCase()];
                    return {cod:cod,realCod:realCod,instr:instr,peso:peso,found:!!realCod};
                  });
                  if(!parsed.length){ toast('Nenhum item encontrado no arquivo','danger'); return; }
                  var withInstr=parsed.filter(function(r){return r.found&&r.instr;});
                  var withPeso=parsed.filter(function(r){return r.found&&r.peso!=null;});
                  var toImport=parsed.filter(function(r){return r.found&&(r.instr||r.peso!=null);});
                  var notFound=parsed.filter(function(r){return !r.found;}).length;
                  // Preview modal
                  var prevRows=parsed.slice(0,8);
                  var tHtml='<table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
                    '<thead><tr style="background:var(--g-700);color:#fff">'+
                    '<th style="padding:6px 10px;text-align:left">Código</th>'+
                    '<th style="padding:6px 10px;text-align:left">Situação</th>'+
                    '<th style="padding:6px 10px;text-align:center">Peso</th>'+
                    '<th style="padding:6px 10px;text-align:left">Instrução IA</th>'+
                    '</tr></thead><tbody>'+
                    prevRows.map(function(r,i){
                      return '<tr style="background:'+(r.found?i%2===0?'#f6fdf8':'#fff':'#fff7ed')+'">'+
                        '<td style="padding:5px 10px;border:1px solid var(--g-100);font-weight:600;color:'+(r.found?'inherit':'#ea580c')+'">'+esc(r.cod)+'</td>'+
                        '<td style="padding:5px 10px;border:1px solid var(--g-100)">'+(r.found?'<span style="color:var(--g-600)">'+ico('check',11)+' Encontrado</span>':'<span style="color:#ea580c">'+ico('x',11)+' Não encontrado</span>')+'</td>'+
                        '<td style="padding:5px 10px;border:1px solid var(--g-100);text-align:center;font-weight:600;color:var(--g-700)">'+(r.peso!=null?r.peso:'—')+'</td>'+
                        '<td style="padding:5px 10px;border:1px solid var(--g-100);color:var(--muted)">'+esc(r.instr?(r.instr.length>50?r.instr.slice(0,50)+'…':r.instr):'—')+'</td>'+
                        '</tr>';
                    }).join('')+
                    '</tbody></table>'+(parsed.length>8?'<div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:right">+ '+(parsed.length-8)+' linhas não exibidas</div>':'');
                  var resumo='<div style="display:flex;gap:16px;margin-bottom:12px;font-size:12.5px;flex-wrap:wrap">'+
                    '<span>'+ico('file-text',13)+' <b>'+parsed.length+'</b> linhas lidas</span>'+
                    '<span style="color:var(--g-600)">'+ico('check-circle',13)+' <b>'+withInstr.length+'</b> com instrução</span>'+
                    '<span style="color:var(--g-600)">'+ico('hash',13)+' <b>'+withPeso.length+'</b> com peso</span>'+
                    (notFound?'<span style="color:#ea580c">'+ico('alert-circle',13)+' <b>'+notFound+'</b> código(s) não encontrado(s) — ignorados</span>':'')+'</div>'+
                    (!toImport.length?'<div style="background:#fff7ed;border:1.5px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#92400e;margin-bottom:10px;display:flex;align-items:center;gap:8px">'+
                      ico('alert-triangle',14)+' <span>Nenhum dado válido encontrado. Verifique se as colunas "Peso" e/ou "Instrução IA" estão preenchidas e os códigos correspondem.</span></div>':'');
                  var footHtml='<button class="btn ghost" id="vincImpCancel">'+ico('x',13)+' Fechar</button>'+
                    (toImport.length?'<button class="btn" id="vincImpConfirm">'+ico('upload',13)+' Importar '+toImport.length+' item(ns)</button>':'');
                  var m=modal(ico('upload')+' Importar Instruções IA','Prévia: '+esc(file.name),resumo+tHtml,footHtml);
                  m.querySelector('#vincImpCancel').onclick=function(){ m.closest('.modal-backdrop').remove(); };
                  var confirmBtn=m.querySelector('#vincImpConfirm');
                  if(confirmBtn) confirmBtn.onclick=function(){
                    toImport.forEach(function(r){
                      var k=vk+'|'+r.realCod;
                      if(!State.vincConfig[k]) State.vincConfig[k]={};
                      if(r.instr) State.vincConfig[k].instr=r.instr;
                      if(r.peso!=null) State.vincConfig[k].peso=r.peso;
                    });
                    localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
                    m.closest('.modal-backdrop').remove();
                    var msg=(withInstr.length?withInstr.length+' instrução(ões)':'')+
                      (withInstr.length&&withPeso.length?' e ':'')+
                      (withPeso.length?withPeso.length+' peso(s)':'')+' importado(s)';
                    toast(msg,'ok');
                    showVinc(vk);
                  };
                  lcIcons();
                };
                reader.readAsText(file,'UTF-8');
              };
            })(vkey,data,_hasOpme);
          }

          var srchVinc=el('input',{class:'param-search',type:'text',placeholder:'Filtrar por código ou descrição...'});
          srchVinc.oninput=function(){
            var q=srchVinc.value.trim().toLowerCase();
            var rows=tbv.querySelectorAll('tr');
            for(var ri=0;ri<rows.length;ri++){
              rows[ri].style.display=(!q||rows[ri].textContent.toLowerCase().indexOf(q)>=0)?'':'none';
            }
          };
          var srchWrap=el('div',{style:'padding:10px 12px 0'});
          srchWrap.appendChild(srchVinc);
          if(_vincToolbar) vincPanel.appendChild(_vincToolbar);
          vincPanel.appendChild(srchWrap);
          vincPanel.appendChild(box);
          vincPanel.appendChild(saveBar);
        }
        lcIcons();
      }

      $$('.vinc-tab',vincBar).forEach(function(b){ b.onclick=function(){showVinc(b.getAttribute('data-vinc'));}; });
      subContent.appendChild(vincBar);
      subContent.appendChild(vincPanel);
      showVinc('subfluxos');

      setTimeout(function(){
        var btnSalvar=subContent.querySelector('#btnSalvarFluxo');
        if(btnSalvar) btnSalvar.onclick=function(){
          $$('.fe-instr',vincPanel).forEach(function(ta){ State.etapaInstrucoes[ta.getAttribute('data-key')]=ta.value; });
          localStorage.setItem('regula_etapa_instr',JSON.stringify(State.etapaInstrucoes));
          toast('Instruções do fluxo '+fid+' salvas','ok');
        };
        if(highlightIdx!=null){
          var items=vincPanel.querySelectorAll('.fluxo-etapa-item');
          var target=items[highlightIdx];
          if(target){
            target.scrollIntoView({block:'center'});
            target.classList.add('fe-highlight');
            setTimeout(function(){ target.classList.remove('fe-highlight'); },2200);
          }
        }
      },0);
      lcIcons();
    }

    $$('.cfg-sub-tab',subBar).forEach(function(b){ b.onclick=function(){ showFluxo(b.getAttribute('data-fid')); }; });
    showFluxo(fluxos[0].id);
  }

  function viewParam(){
    var wrap=el('div');
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>Painel de Parametrização</h1><p>Fluxos assistenciais, regras DUT e requisitos documentais.</p></div>'));
    // Helpers de contagem por tipo de vinculação
    function countVincInstr(prefix){
      return Object.keys(State.vincConfig).filter(function(k){
        return k.indexOf(prefix+'|')===0 && State.vincConfig[k].instr;
      }).length;
    }
    function countVincAtivos(prefix, total){
      var inativos=Object.keys(State.vincConfig).filter(function(k){
        return k.indexOf(prefix+'|')===0 && State.vincConfig[k].status==='inativo';
      }).length;
      return total-inativos;
    }
    function countFluxosInstr(){
      var fids={};
      Object.keys(State.etapaInstrucoes).forEach(function(k){
        if(State.etapaInstrucoes[k]) fids[k.split('|')[0]]=true;
      });
      return Object.keys(fids).length;
    }
    var kpi=el('div',{class:'kpi-grid',style:'margin-bottom:18px'});
    [
      {t:'Fluxos sincronizados', v:MOCK.FLUXOS.length,        ia:countFluxosInstr(),      ativos:MOCK.FLUXOS.length,                             total:MOCK.FLUXOS.length},
      {t:'Procedimentos',        v:MOCK.PROCEDIMENTOS.length,  ia:countVincInstr('proc'),  ativos:countVincAtivos('proc',  MOCK.PROCEDIMENTOS.length), total:MOCK.PROCEDIMENTOS.length},
      {t:'Pacotes',              v:MOCK.PACOTES.length,        ia:countVincInstr('pac'),   ativos:countVincAtivos('pac',   MOCK.PACOTES.length),        total:MOCK.PACOTES.length},
      {t:'Mat/Med',              v:MOCK.MATMED.length,         ia:countVincInstr('matmed'),ativos:countVincAtivos('matmed',MOCK.MATMED.length),          total:MOCK.MATMED.length},
      {t:'Diárias/Taxas',       v:MOCK.DIARIAS_TAXAS.length,  ia:countVincInstr('dt'),    ativos:countVincAtivos('dt',    MOCK.DIARIAS_TAXAS.length),   total:MOCK.DIARIAS_TAXAS.length}
    ].forEach(function(x){
      kpi.appendChild(el('div',{class:'kpi param'},
        '<h4>'+esc(x.t)+'</h4>'+
        '<div class="v">'+esc(String(x.v))+'</div>'+
        '<div style="font-size:10.5px;color:rgba(255,255,255,.75);margin-top:5px;display:flex;flex-direction:column;gap:2px">'+
          '<span>'+x.ativos+' de '+x.total+' ativos</span>'+
          '<span>'+x.ia+' de '+x.total+' com instrução IA</span>'+
        '</div>'
      ));
    });
    wrap.appendChild(kpi);
    var tabs=el('div',{class:'tabs'});
    ['Fluxos & Etapas','Regras DUT','Documental'].forEach(function(n,i){
      tabs.appendChild(el('button',{class:'tab'+(i===0?' active':''),'data-tab':n},n));
    });
    wrap.appendChild(tabs);
    var content=el('div'); wrap.appendChild(content);

    function renderTab(name){
      content.innerHTML='';
      if(name==='Fluxos & Etapas'){ buildFluxosUI(content); lcIcons(); return; }
      var isDUT=name==='Regras DUT';
      var isGestor=State.perfil==='gestor';
      var prefix, data;
      if(isDUT){
        prefix='dut';
        data=MOCK.REGRAS_DUT.concat(State.customDutRules.map(function(r){ return Object.assign({},r,{_custom:true}); }));
      } else {
        prefix='doc';
        data=MOCK.REGRAS_DOC;
      }

      // Toolbar DUT
      if(isDUT){
        var toolbar=el('div',{style:'display:flex;align-items:center;gap:8px;padding:10px 14px 0;flex-wrap:wrap'});
        var fileInput=el('input',{type:'file',accept:'.csv,.xls,.xlsx',style:'display:none'});
        if(isGestor){
          var btnNovo=el('button',{class:'btn',style:'display:flex;align-items:center;gap:6px;font-size:12.5px',title:'Cadastre novos itens e os parametrize'},
            ico('plus-circle',14)+' Novo item');
          var btnImp=el('button',{class:'btn ghost',style:'display:flex;align-items:center;gap:6px;font-size:12.5px',title:'Importe os dados de uma planilha com a configuração pronta'},
            ico('upload',14)+' Importar planilha');
          toolbar.appendChild(btnNovo);
          toolbar.appendChild(btnImp);
        }
        var btnExp=el('button',{class:'btn ghost',style:'display:flex;align-items:center;gap:6px;font-size:12.5px',title:'Exporte os dados das configurações atuais'},
          ico('download',14)+' Exportar planilha');
        toolbar.appendChild(btnExp);
        toolbar.appendChild(fileInput);
        content.appendChild(toolbar);

        if(isGestor){
          btnNovo.onclick=function(){
            var fld='font-size:11.5px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px';
            var inp='width:100%;box-sizing:border-box;border:1.5px solid var(--g-200);border-radius:7px;padding:8px 12px;font-size:13px;font-family:inherit;color:var(--ink)';
            var bodyHTML=
              '<div style="display:grid;gap:14px">'+
              '<div><label style="'+fld+'">CÓDIGO</label>'+
              '<input id="dutNovoCod" type="text" maxlength="3000" placeholder="Ex.: DUT-042" style="'+inp+'"></div>'+
              '<div><label style="'+fld+'">DESCRIÇÃO DA DUT</label>'+
              '<textarea id="dutNovoDesc" rows="3" maxlength="3000" placeholder="Descreva a regra ou critério técnico..." style="'+inp+';resize:vertical"></textarea></div>'+
              '<div><label style="'+fld+'">DUT <span style="font-weight:400">(texto normativo — opcional)</span></label>'+
              '<textarea id="dutNovoText" rows="4" maxlength="3000" placeholder="Cole aqui o texto da DUT conforme publicação ANS..." style="'+inp+';resize:vertical"></textarea></div>'+
              '<div><label style="'+fld+'">EVIDÊNCIA EXIGIDA</label>'+
              '<textarea id="dutNovoEv" rows="2" maxlength="3000" placeholder="Ex.: Laudo médico com CID + exames confirmatórios" style="'+inp+';resize:vertical"></textarea></div>'+
              '<div><label style="'+fld+'">INSTRUÇÃO IA <span style="font-weight:400">(opcional)</span></label>'+
              '<textarea id="dutNovoInstr" rows="3" maxlength="3000" placeholder="Orientações para a IA ao analisar guias com esta DUT..." style="'+inp+';resize:vertical"></textarea>'+
              '<div style="text-align:right;font-size:11px;color:var(--muted);margin-top:3px"><span id="dutNovoInstrCount">0</span> / 3000</div></div>'+
              '</div>';
            var footHTML='<button class="btn ghost" id="dutNovoCancel">'+ico('x',13)+' Cancelar</button>'+
              '<button class="btn" id="dutNovoSave">'+ico('save',13)+' Cadastrar item</button>';
            var m=modal(ico('plus-circle')+' Nova Regra DUT','Preencha os campos — Status inicia como Ativo',bodyHTML,footHTML);
            m.querySelector('#dutNovoCancel').onclick=function(){ m.closest('.modal-backdrop').remove(); };
            var instrTA=m.querySelector('#dutNovoInstr');
            var instrCnt=m.querySelector('#dutNovoInstrCount');
            instrTA.oninput=function(){ instrCnt.textContent=instrTA.value.length; };
            m.querySelector('#dutNovoSave').onclick=function(){
              var cod=m.querySelector('#dutNovoCod').value.trim();
              var desc=m.querySelector('#dutNovoDesc').value.trim();
              var dutTxt=m.querySelector('#dutNovoText').value.trim();
              var evidencia=m.querySelector('#dutNovoEv').value.trim();
              var instr=instrTA.value.trim();
              if(!cod||!desc){ toast('Código e Descrição são obrigatórios','danger'); return; }
              var codExists=data.some(function(r){ return String(r.cod).toLowerCase()===cod.toLowerCase(); });
              if(codExists){ toast('Já existe um item com este código','danger'); return; }
              State.customDutRules.push({cod:cod,desc:desc,evidencia:evidencia});
              var vc={};
              if(dutTxt){ if(!State.vincConfig['duttext|'+cod]) State.vincConfig['duttext|'+cod]={}; State.vincConfig['duttext|'+cod].text=dutTxt; vc=State.vincConfig; }
              if(instr){ if(!State.vincConfig['dut|'+cod]) State.vincConfig['dut|'+cod]={}; State.vincConfig['dut|'+cod].instr=instr; vc=State.vincConfig; }
              if(dutTxt||instr) localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
              localStorage.setItem('regula_custom_dut',JSON.stringify(State.customDutRules));
              m.closest('.modal-backdrop').remove();
              toast('Item cadastrado com sucesso','ok');
              renderTab('Regras DUT');
            };
            setTimeout(function(){ m.querySelector('#dutNovoCod').focus(); },50);
          };

          btnImp.onclick=function(){ fileInput.value=''; fileInput.click(); };
        } // end if(isGestor) — novo/imp

        fileInput.onchange=function(){
          var file=fileInput.files[0];
          if(!file) return;
          var reader=new FileReader();
          reader.onload=function(ev){
            var text=ev.target.result;
            var rows=[];

            // Detect HTML/XLS format (our export) vs plain CSV
            var sniff=text.trimLeft().toLowerCase();
            if(sniff.indexOf('<html')===0||sniff.indexOf('<!doc')===0||sniff.indexOf('﻿<html')===0||sniff.indexOf('<table')===0){
              // Parse HTML table with DOMParser
              var parser=new DOMParser();
              var doc=parser.parseFromString(text,'text/html');
              // Find the Regras DUT table (first table that has a DUT-like header)
              var tables=doc.querySelectorAll('table');
              var tbl=null;
              for(var ti=0;ti<tables.length;ti++){
                var hdr=tables[ti].querySelector('th,td');
                if(hdr&&(hdr.textContent.toLowerCase().indexOf('c')===0||hdr.textContent.toLowerCase().indexOf('d')>=0)){
                  tbl=tables[ti]; break;
                }
              }
              if(!tbl&&tables.length) tbl=tables[0];
              if(!tbl){ toast('Nenhuma tabela encontrada no arquivo','danger'); return; }
              tbl.querySelectorAll('tr').forEach(function(tr){
                var cells=[];
                tr.querySelectorAll('td,th').forEach(function(td){ cells.push(td.textContent.trim()); });
                if(cells.some(function(c){return c;})) rows.push(cells);
              });
            } else {
              // Parse CSV (comma or semicolon, handles quoted fields)
              text.split(/\r?\n/).filter(function(l){return l.trim();}).forEach(function(line){
                var cols=[],cur='',inQ=false;
                for(var i=0;i<line.length;i++){
                  var c=line[i];
                  if(c==='"'){inQ=!inQ;}
                  else if((c===','||c===';')&&!inQ){cols.push(cur.trim());cur='';}
                  else cur+=c;
                }
                cols.push(cur.trim());
                rows.push(cols);
              });
            }

            if(!rows.length){ toast('Arquivo vazio ou inválido','danger'); return; }
            // detect and skip header row
            var startRow=0;
            var firstCell=(rows[0][0]||'').toLowerCase().replace(/[^a-záéíóúãõç]/g,'');
            if(firstCell==='codigo'||firstCell==='código'||firstCell==='cod'||firstCell==='c') startRow=1;
            var parsed=rows.slice(startRow).filter(function(r){return r[0]&&r[0].length>0;}).map(function(r){
              return {cod:(r[0]||'').trim(),desc:(r[1]||'').trim(),dutText:(r[2]||'').trim(),evidencia:(r[3]||'').trim(),instr:(r[4]||'').trim()};
            });
            if(!parsed.length){ toast('Nenhum item encontrado no arquivo','danger'); return; }

            // existing codes (MOCK + custom)
            var existingCods={};
            MOCK.REGRAS_DUT.forEach(function(r){existingCods[String(r.cod).toLowerCase()]=true;});
            State.customDutRules.forEach(function(r){existingCods[String(r.cod).toLowerCase()]=true;});
            var novos=parsed.filter(function(r){return !existingCods[r.cod.toLowerCase()];});
            var dups=parsed.length-novos.length;

            // preview modal
            var prevRows=parsed.slice(0,8);
            var tableHtml='<table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
              '<thead><tr style="background:var(--g-700);color:#fff">'+
              '<th style="padding:6px 10px;text-align:left">Código</th>'+
              '<th style="padding:6px 10px;text-align:left">Descrição DUT</th>'+
              '<th style="padding:6px 10px;text-align:left">DUT</th>'+
              '<th style="padding:6px 10px;text-align:left">Evidência exigida</th>'+
              '<th style="padding:6px 10px;text-align:left">Instrução IA</th>'+
              '</tr></thead><tbody>'+
              prevRows.map(function(r,i){
                var dup=existingCods[r.cod.toLowerCase()];
                return '<tr style="background:'+(dup?'#fff7ed':i%2===0?'#f6fdf8':'#fff')+'">'+
                  '<td style="padding:5px 10px;border:1px solid var(--g-100);font-weight:600;color:'+(dup?'#ea580c':'inherit')+'">'+esc(r.cod)+(dup?' <span style="font-size:10px;color:#ea580c">(duplicado)</span>':'')+'</td>'+
                  '<td style="padding:5px 10px;border:1px solid var(--g-100)">'+esc(r.desc)+'</td>'+
                  '<td style="padding:5px 10px;border:1px solid var(--g-100);color:var(--muted)">'+esc(r.dutText?(r.dutText.length>40?r.dutText.slice(0,40)+'…':r.dutText):'—')+'</td>'+
                  '<td style="padding:5px 10px;border:1px solid var(--g-100)">'+esc(r.evidencia)+'</td>'+
                  '<td style="padding:5px 10px;border:1px solid var(--g-100);color:var(--muted)">'+esc(r.instr||'—')+'</td>'+
                  '</tr>';
              }).join('')+
              '</tbody></table>'+
              (parsed.length>8?'<div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:right">+ '+(parsed.length-8)+' linhas não exibidas</div>':'');
            var resumo='<div style="display:flex;gap:16px;margin-bottom:12px;font-size:12.5px;flex-wrap:wrap">'+
              '<span>'+ico('file-text',13)+' <b>'+parsed.length+'</b> linhas lidas</span>'+
              '<span style="color:var(--g-600)">'+ico('check-circle',13)+' <b>'+novos.length+'</b> novo(s)</span>'+
              (dups?'<span style="color:#ea580c">'+ico('alert-circle',13)+' <b>'+dups+'</b> duplicado(s) — código já cadastrado, serão ignorados</span>':'')+'</div>'+
              (!novos.length?'<div style="background:#fff7ed;border:1.5px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#92400e;margin-bottom:10px;display:flex;align-items:center;gap:8px">'+
                ico('alert-triangle',14)+' <span>Todos os itens do arquivo já estão cadastrados. Nenhum código pode ser duplicado — revise o arquivo e tente novamente.</span></div>':'');
            var footHtml='<button class="btn ghost" id="impCancel">'+ico('x',13)+' Fechar</button>'+
              (novos.length?'<button class="btn" id="impConfirm">'+ico('upload',13)+' Importar '+novos.length+' item(s) novo(s)</button>':'');
            var m=modal(ico('upload')+' Importar Regras DUT','Prévia do arquivo: '+esc(file.name),resumo+tableHtml,footHtml);
            m.querySelector('#impCancel').onclick=function(){ m.closest('.modal-backdrop').remove(); };
            var confirmBtn=m.querySelector('#impConfirm');
            if(confirmBtn) confirmBtn.onclick=function(){
              novos.forEach(function(r){
                State.customDutRules.push({cod:r.cod,desc:r.desc,evidencia:r.evidencia});
                if(r.dutText){ if(!State.vincConfig['duttext|'+r.cod]) State.vincConfig['duttext|'+r.cod]={}; State.vincConfig['duttext|'+r.cod].text=r.dutText; }
                if(r.instr){
                  var k='dut|'+r.cod;
                  if(!State.vincConfig[k]) State.vincConfig[k]={};
                  State.vincConfig[k].instr=r.instr;
                }
              });
              localStorage.setItem('regula_custom_dut',JSON.stringify(State.customDutRules));
              localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
              m.closest('.modal-backdrop').remove();
              toast(novos.length+' item(s) importado(s) com sucesso','ok');
              renderTab('Regras DUT');
            };
            lcIcons();
          };
          reader.readAsText(file,'UTF-8');
        };

        btnExp.onclick=function(){
          var allData=MOCK.REGRAS_DUT.concat(State.customDutRules);
          var css2='table{border-collapse:collapse;font-family:Calibri,sans-serif;font-size:11pt}'+
            'th{background:#0a8a43;color:#fff;padding:8px 12px;border:1px solid #066b34;font-weight:700;text-align:left}'+
            'td{padding:7px 12px;border:1px solid #c8e6d4;vertical-align:top}'+
            'tr:nth-child(even) td{background:#f2faf6}';
          var rows2='<tr><th>Código</th><th>Descrição DUT</th><th>DUT</th><th>Evidência exigida</th><th>Instrução IA</th></tr>';
          allData.forEach(function(r){
            var cod=String(r.cod);
            var dutTxt=(State.vincConfig['duttext|'+cod]&&State.vincConfig['duttext|'+cod].text)||'';
            var instr=(State.vincConfig['dut|'+cod]&&State.vincConfig['dut|'+cod].instr)||'';
            rows2+='<tr><td>'+esc(cod)+'</td><td>'+esc(r.desc||'')+'</td><td>'+esc(dutTxt)+'</td><td>'+esc(r.evidencia||'')+'</td><td>'+esc(instr)+'</td></tr>';
          });
          var html2='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'+
            '<head><meta charset="UTF-8"><style>'+css2+'</style></head>'+
            '<body><table x:Name="Regras DUT">'+rows2+'</table></body></html>';
          var blob2=new Blob(['﻿'+html2],{type:'application/vnd.ms-excel;charset=utf-8'});
          var a2=document.createElement('a');
          a2.href=URL.createObjectURL(blob2);
          a2.download='regras_dut.xls';
          document.body.appendChild(a2); a2.click();
          setTimeout(function(){ document.body.removeChild(a2); URL.revokeObjectURL(a2.href); },200);
        };
      }

      var box=el('div',{class:'table-wrap',style:'margin-top:'+(isDUT?'10px':'0')});
      var t=el('table');
      var tb=el('tbody');

      function statusBtnHTML(prefix2,cod,status){
        return '<button class="vinc-status-btn '+(status==='ativo'?'active':'')+'" data-vkey="'+esc(prefix2)+'" data-cod="'+esc(cod)+'" data-status="'+status+'" style="font-size:11px;padding:3px 10px;border-radius:12px;border:1.5px solid;cursor:pointer;font-weight:600;background:'+(status==='ativo'?'var(--g-700)':'#fff')+';color:'+(status==='ativo'?'#fff':'var(--muted)')+';border-color:'+(status==='ativo'?'var(--g-700)':'var(--g-200)')+'">'+esc(status==='ativo'?'Ativo':'Inativo')+'</button>';
      }
      function instrBtnHTML(prefix2,cod,hasInstr){
        return '<button class="dut-instr-btn" data-cod="'+esc(cod)+'" data-vkey="'+esc(prefix2)+'"'+(!hasInstr&&!isGestor?' disabled':'')+
          ' style="font-size:11px;padding:3px 10px;border-radius:12px;border:1.5px solid;cursor:'+(!hasInstr&&!isGestor?'default':'pointer')+';font-weight:600;white-space:nowrap;opacity:'+(!hasInstr&&!isGestor?'.45':'1')+';'+
          (hasInstr?'background:var(--g-100);color:var(--g-700);border-color:var(--g-300)':
            isGestor?'background:#fff;color:var(--muted);border-color:var(--g-200)':
            'background:#fff;color:var(--g-200);border-color:var(--g-100)')+'">'+
          ico('sparkles',11)+' '+(hasInstr?'Ler instrução':isGestor?'Adicionar':'Sem instrução')+'</button>';
      }

      if(isDUT){
        t.innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>DUT</th><th>Evidência exigida</th><th>Status</th><th>Instrução IA</th>'+(isGestor?'<th></th>':'')+'</tr></thead>';
        data.forEach(function(r){
          var cod=String(r.cod);
          var cfg=State.vincConfig['dut|'+cod]||{};
          var status=cfg.status||'ativo';
          var instr=cfg.instr||'';
          var dutText=(State.vincConfig['duttext|'+cod]||{}).text||'';
          var tr=el('tr');
          if(r._custom) tr.style.background='#f6fdf8';
          var dutBtn='<button class="dut-text-btn" data-cod="'+esc(cod)+'" style="font-size:11px;padding:3px 10px;border-radius:12px;border:1.5px solid;cursor:pointer;font-weight:600;white-space:nowrap;'+
            (dutText?'background:var(--g-700);color:#fff;border-color:var(--g-700)':
              isGestor?'background:#f6fdf8;color:var(--g-600);border-color:var(--g-200)':
              'background:#fff;color:var(--muted);border-color:var(--g-100);cursor:default;opacity:.45')+'">'+
            ico('file-text',11)+' '+(dutText?'Ler DUT':isGestor?'Adicionar DUT':'Sem DUT')+'</button>';
          tr.innerHTML=
            '<td style="font-weight:600;white-space:nowrap">'+esc(cod)+'</td>'+
            '<td style="font-size:12.5px">'+esc(r.desc||'')+'</td>'+
            '<td style="text-align:center">'+dutBtn+'</td>'+
            '<td style="font-size:12.5px">'+esc(r.evidencia||'')+'</td>'+
            '<td style="text-align:center">'+statusBtnHTML('dut',cod,status)+'</td>'+
            '<td style="text-align:center">'+instrBtnHTML('dut',cod,!!instr)+'</td>'+
            (isGestor?'<td style="text-align:center;width:36px">'+(r._custom?'<button class="dut-del-btn" data-cod="'+esc(cod)+'" title="Excluir item" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:4px;border-radius:5px;line-height:1">'+ico('trash-2',14)+'</button>':'<span style="color:var(--g-200);font-size:10px" title="Item base">—</span>')+'</td>':'');
          tb.appendChild(tr);
        });
      } else {
        t.innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>Obrigatório</th><th>Status</th><th>Instrução IA</th></tr></thead>';
        data.forEach(function(r){
          var cod=String(r.cod);
          var cfg=State.vincConfig['doc|'+cod]||{};
          var status=cfg.status||'ativo';
          var instr=cfg.instr||'';
          var tr=el('tr');
          var obrigCell=typeof r.obrig==='boolean'?(r.obrig?'<span class="badge">Sim</span>':'<span class="badge muted">Não</span>'):esc(String(r.obrig||''));
          tr.innerHTML=
            '<td style="font-weight:600;white-space:nowrap">'+esc(cod)+'</td>'+
            '<td style="font-size:12.5px">'+esc(r.desc||'')+'</td>'+
            '<td style="text-align:center">'+obrigCell+'</td>'+
            '<td style="text-align:center">'+statusBtnHTML('doc',cod,status)+'</td>'+
            '<td style="text-align:center">'+instrBtnHTML('doc',cod,!!instr)+'</td>';
          tb.appendChild(tr);
        });
      }

      t.appendChild(tb); box.appendChild(t);

      box.addEventListener('click',function(e){
        // Status toggle
        var sBtn=e.target.closest('.vinc-status-btn');
        if(sBtn){
          var sk=sBtn.getAttribute('data-vkey')+'|'+sBtn.getAttribute('data-cod');
          var cur=sBtn.getAttribute('data-status'), novo=cur==='ativo'?'inativo':'ativo';
          if(!State.vincConfig[sk]) State.vincConfig[sk]={};
          State.vincConfig[sk].status=novo;
          sBtn.setAttribute('data-status',novo);
          sBtn.textContent=novo==='ativo'?'Ativo':'Inativo';
          sBtn.style.background=novo==='ativo'?'var(--g-700)':'#fff';
          sBtn.style.color=novo==='ativo'?'#fff':'var(--muted)';
          sBtn.style.borderColor=novo==='ativo'?'var(--g-700)':'var(--g-200)';
          sBtn.classList.toggle('active',novo==='ativo');
          localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
          return;
        }

        // Ler/editar texto DUT
        var dtBtn=e.target.closest('.dut-text-btn');
        if(dtBtn){
          var dCod=dtBtn.getAttribute('data-cod');
          var curDut=(State.vincConfig['duttext|'+dCod]||{}).text||'';
          var dDesc=dtBtn.closest('tr').cells[1].textContent.trim();
          var readOnly=!isGestor;
          var bodyDUT=
            '<div style="margin-bottom:10px;font-size:12.5px;color:var(--muted)">'+ico('file-text',13)+' <b>'+esc(dCod)+'</b> — '+esc(dDesc)+'</div>'+
            (readOnly
              ?(curDut?'<div style="font-size:13px;line-height:1.65;color:var(--ink);background:#f6fdf8;border:1.5px solid var(--g-100);border-radius:8px;padding:14px 16px;white-space:pre-wrap;max-height:340px;overflow-y:auto">'+esc(curDut)+'</div>'
                :'<div style="text-align:center;padding:28px;color:var(--muted);font-size:12.5px">Nenhum texto de DUT cadastrado.</div>')
              :'<textarea id="dutTA" maxlength="3000" rows="12" style="width:100%;font-size:13px;line-height:1.55;border:1.5px solid var(--g-200);border-radius:8px;padding:10px 14px;resize:vertical;font-family:inherit;color:var(--ink);box-sizing:border-box">'+esc(curDut)+'</textarea>'+
               '<div style="display:flex;justify-content:flex-end;margin-top:5px"><span id="dutTACnt" style="font-size:11px;color:var(--muted)">'+curDut.length+' / 3000</span></div>');
          var footDUT='<button class="btn ghost" id="dutClose">'+ico('x',13)+' Fechar</button>'+
            (!readOnly?'<button class="btn" id="dutSave">'+ico('save',13)+' Salvar DUT</button>':'');
          var md=modal(ico('file-text')+' Texto da DUT','Regulatório ANS · máx. 3000 caracteres',bodyDUT,footDUT);
          md.querySelector('#dutClose').onclick=function(){ md.closest('.modal-backdrop').remove(); };
          if(!readOnly){
            var dta=md.querySelector('#dutTA'), dcnt=md.querySelector('#dutTACnt');
            dta.oninput=function(){ dcnt.textContent=dta.value.length+' / 3000'; };
            md.querySelector('#dutSave').onclick=function(){
              if(!State.vincConfig['duttext|'+dCod]) State.vincConfig['duttext|'+dCod]={};
              State.vincConfig['duttext|'+dCod].text=dta.value;
              localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
              md.closest('.modal-backdrop').remove();
              toast('Texto da DUT salvo','ok');
              renderTab('Regras DUT');
            };
            setTimeout(function(){ dta.focus(); },50);
          }
          lcIcons(); return;
        }

        // Ler/editar instrução IA
        var iBtn=e.target.closest('.dut-instr-btn');
        if(iBtn&&!iBtn.disabled){
          var iCod=iBtn.getAttribute('data-cod'), iVkey=iBtn.getAttribute('data-vkey');
          var iKey=iVkey+'|'+iCod;
          var curInstr=(State.vincConfig[iKey]||{}).instr||'';
          var iDesc=iBtn.closest('tr').cells[1].textContent.trim();
          var readOnlyI=!isGestor;
          var bodyI=
            '<div style="margin-bottom:10px;font-size:12.5px;color:var(--muted)">'+ico('sparkles',13)+' <b>'+esc(iCod)+'</b> — '+esc(iDesc)+'</div>'+
            (readOnlyI
              ?(curInstr?'<div style="font-size:13px;line-height:1.65;color:var(--ink);background:#f6fdf8;border:1.5px solid var(--g-100);border-radius:8px;padding:14px 16px;white-space:pre-wrap;max-height:340px;overflow-y:auto">'+esc(curInstr)+'</div>'
                :'<div style="text-align:center;padding:28px;color:var(--muted);font-size:12.5px">Nenhuma instrução cadastrada para este item.</div>')
              :'<textarea id="instrTA" maxlength="3000" rows="12" style="width:100%;font-size:13px;line-height:1.55;border:1.5px solid var(--g-200);border-radius:8px;padding:10px 14px;resize:vertical;font-family:inherit;color:var(--ink);box-sizing:border-box">'+esc(curInstr)+'</textarea>'+
               '<div style="display:flex;justify-content:flex-end;margin-top:5px"><span id="instrTACnt" style="font-size:11px;color:var(--muted)">'+curInstr.length+' / 3000</span></div>');
          var footI='<button class="btn ghost" id="instrClose">'+ico('x',13)+' Fechar</button>'+
            (!readOnlyI?'<button class="btn" id="instrSave">'+ico('save',13)+' Salvar instrução</button>':'');
          var perm=readOnlyI?'Visualização · apenas gestores podem editar':'Editar instrução · máx. 3000 caracteres';
          var mi=modal(ico('sparkles')+' Instrução para a IA',perm,bodyI,footI);
          mi.querySelector('#instrClose').onclick=function(){ mi.closest('.modal-backdrop').remove(); };
          if(!readOnlyI){
            var ita=mi.querySelector('#instrTA'), icnt=mi.querySelector('#instrTACnt');
            ita.oninput=function(){ icnt.textContent=ita.value.length+' / 3000'; };
            mi.querySelector('#instrSave').onclick=function(){
              if(!State.vincConfig[iKey]) State.vincConfig[iKey]={};
              State.vincConfig[iKey].instr=ita.value;
              localStorage.setItem('regula_vinc_cfg',JSON.stringify(State.vincConfig));
              mi.closest('.modal-backdrop').remove();
              toast('Instrução salva','ok');
              renderTab(name);
            };
            setTimeout(function(){ ita.focus(); },50);
          }
          lcIcons(); return;
        }

        // Excluir item customizado (gestor only)
        var del=e.target.closest('.dut-del-btn');
        if(del&&isGestor){
          var delCod=del.getAttribute('data-cod');
          if(!confirm('Excluir o item "'+delCod+'"?')) return;
          State.customDutRules=State.customDutRules.filter(function(r){ return String(r.cod)!==delCod; });
          localStorage.setItem('regula_custom_dut',JSON.stringify(State.customDutRules));
          toast('Item excluído','ok');
          renderTab('Regras DUT');
        }
      });

      // Campo de busca acima da tabela (DUT e Documental)
      var srchRow=el('div',{style:'padding:10px 0 2px;margin-bottom:4px'});
      var srchParam=el('input',{class:'param-search',type:'text',placeholder:'Filtrar por código ou descrição...'});
      srchRow.appendChild(srchParam);
      srchParam.oninput=function(){
        var q=srchParam.value.trim().toLowerCase();
        var rows=tb.querySelectorAll('tr');
        for(var ri=0;ri<rows.length;ri++){
          rows[ri].style.display=(!q||rows[ri].textContent.toLowerCase().indexOf(q)>=0)?'':'none';
        }
      };
      content.appendChild(srchRow);
      content.appendChild(box);
      lcIcons();
    }
    renderTab('Fluxos & Etapas');
    $$('.tab',tabs).forEach(function(b){ b.onclick=function(){ $$('.tab',tabs).forEach(function(x){x.classList.remove('active')}); b.classList.add('active'); renderTab(b.getAttribute('data-tab')); }; });
    return wrap;
  }

  function viewFluxos(){
    var wrap=el('div');
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>Fluxos &amp; Etapas</h1><p>Estrutura de auditoria sincronizada com o Solus. Cada etapa pode ser configurada para atuação da análise técnica.</p></div>'));
    MOCK.FLUXOS.forEach(function(f){
      var p=el('div',{class:'panel',style:'margin-bottom:14px'});
      p.innerHTML='<h3><span><span class="badge dark">'+f.id+'</span> '+esc(f.nome)+' <span class="badge muted">'+f.regime+'</span></span><span class="badge">'+f.etapas.length+' etapas</span></h3>';
      var tl=el('div',{class:'timeline'});
      f.etapas.forEach(function(e,i){
        var ia=MOCK.IA_POR_ETAPA[e]||'apoio';
        var iaTxt = ia==='auto'?'Automática assistida':(ia==='apoio'?'Apoio':'Não atua');
        var icoStr = ia==='auto'?ico('bot'):(ia==='apoio'?ico('brain'):'—');
        tl.appendChild(el('div',{class:'tl-item done'},'<h4>'+(i+1)+'. '+esc(e)+' <span class="tl-ia">'+icoStr+' '+iaTxt+'</span></h4><div class="meta">Vinculações: '+f.vinc.join(', ')+'</div>'));
      });
      p.appendChild(tl); wrap.appendChild(p);
    });
    return wrap;
  }


  function viewLogs(){
    if(!State.logFiltros)   State.logFiltros  ={q:'',perfil:'',de:'',ate:'',sortCol:'ts',sortDir:'desc'};
    if(!State.logFiltrosIA) State.logFiltrosIA ={q:'',tipo:'', de:'',ate:'',sortCol:'ts',sortDir:'desc'};
    if(!State.logPagina)   State.logPagina   =1;
    if(!State.logPaginaIA) State.logPaginaIA  =1;
    var LOG_PER_PAGE=15;
    var tab=State.logsTab||'usuarios';

    // ── helpers ─────────────────────────────────────────────────────────────
    function perfilBadge(p){
      var map={auditor:'',enfermeiro:'warn',gestor:'dark',sistema:'info',ia:'purple'};
      return '<span class="badge '+(map[p]||'muted')+'">'+esc(p)+'</span>';
    }
    function tipoBadge(t){
      var map={ia:'purple',sistema:'info',correcao_ia:'warn'};
      var lbl={ia:'IA',sistema:'Sistema',correcao_ia:'Correção IA'};
      return '<span class="badge '+(map[t]||'muted')+'">'+esc(lbl[t]||t)+'</span>';
    }

    // ── gráfico rosca ────────────────────────────────────────────────────────
    function makeDonut(segs){
      var total=segs.reduce(function(s,x){return s+x.v;},0);
      if(!total) return '';
      var r=44,cx=60,cy=60,C=2*Math.PI*r,cum=0;
      var circles=segs.map(function(s){
        var len=(s.v/total)*C;
        var off=-cum;
        cum+=len;
        return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none"'+
               ' stroke="'+s.c+'" stroke-width="20"'+
               ' stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'"'+
               ' stroke-dashoffset="'+off.toFixed(2)+'"'+
               ' stroke-linecap="butt"/>';
      }).join('');
      var legend=segs.map(function(s){
        var pct=((s.v/total)*100).toFixed(0);
        return '<div class="donut-leg-item">'+
          '<span class="donut-leg-dot" style="background:'+s.c+'"></span>'+
          '<span class="donut-leg-label">'+esc(s.label)+'</span>'+
          '<span class="donut-leg-val">'+s.v+' <span class="donut-leg-pct">'+pct+'%</span></span>'+
          '</div>';
      }).join('');
      return '<div class="donut-wrap">'+
        '<svg width="120" height="120" viewBox="0 0 120 120">'+
          '<g transform="rotate(-90 60 60)">'+circles+'</g>'+
          '<text x="60" y="55" text-anchor="middle" font-size="20" font-weight="700" fill="var(--g-800)">'+total+'</text>'+
          '<text x="60" y="70" text-anchor="middle" font-size="9" fill="var(--muted)" letter-spacing="1">REGISTROS</text>'+
        '</svg>'+
        '<div class="donut-legend">'+legend+'</div>'+
      '</div>';
    }

    // ── contagens para o gráfico ─────────────────────────────────────────────
    var cnts={gestor:0,auditor:0,enfermeiro:0,sistema:0,ia:0,correcao_ia:0};
    MOCK.LOGS.forEach(function(l){
      var k=l.tipo==='correcao_ia'?'correcao_ia':l.tipo==='ia'?'ia':l.tipo==='sistema'?'sistema':l.perfil;
      if(cnts.hasOwnProperty(k)) cnts[k]++;
    });
    var donutUsuarios=makeDonut([
      {label:'Gestor',     v:cnts.gestor,     c:'#054f27'},
      {label:'Auditor',    v:cnts.auditor,    c:'#00a84f'},
      {label:'Enfermeiro', v:cnts.enfermeiro, c:'#0d9488'}
    ]);
    var donutSistema=makeDonut([
      {label:'Sistema',    v:cnts.sistema,     c:'#2563eb'},
      {label:'IA',         v:cnts.ia,          c:'#7c3aed'},
      {label:'Correção IA',v:cnts.correcao_ia, c:'#d97706'}
    ]);

    // ── layout principal ─────────────────────────────────────────────────────
    var wrap=el('div');
    wrap.appendChild(el('div',{class:'page-title'},
      '<div><h1>Logs e Rastreabilidade</h1><p>Auditoria de ações do sistema, usuários e análise técnica.</p></div>'
    ));

    // Abas
    var tabBar=el('div',{class:'guias-tabs',style:'margin-bottom:0;border-bottom:1px solid var(--g-100)'});
    [['usuarios',ico('users',13)+' Logs de Usuário'],['sistema_ia',ico('cpu',13)+' Logs Sistema | IA']].forEach(function(pair){
      var active=tab===pair[0];
      var btn=el('button',{style:
        'padding:9px 18px;border:none;cursor:pointer;font-size:13px;font-weight:500;gap:6px;display:inline-flex;align-items:center;'+
        'border-bottom:'+(active?'2px solid var(--g-50)':'2px solid transparent')+';'+
        'background:'+(active?'var(--g-50)':'#fff')+';'+
        'color:'+(active?'var(--g-700)':'var(--muted)')},pair[1]);
      btn.onclick=function(){ State.logsTab=pair[0]; render(); };
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    var box=el('div',{class:'table-wrap',style:'border-radius:0 0 10px 10px'});
    function logGuia(l){ var m=(l.ref||'').match(/^\d{6,}/); return m?m[0]:'—'; }

    // ── ABA: Logs de Usuário ─────────────────────────────────────────────────
    if(tab==='usuarios'){
      var lf=State.logFiltros;
      var _chartRow=el('div',{class:'log-chart-row'});
      _chartRow.innerHTML=donutUsuarios;
      wrap.appendChild(_chartRow);

      var filt=el('div',{class:'filters'});
      filt.innerHTML=
        '<div class="log-period-wrap">'+ico('calendar',13)+
          '<label class="log-period-lbl">De</label>'+
          '<input type="date" id="lDe" class="log-date" value="'+esc(lf.de)+'" />'+
          '<label class="log-period-lbl">Até</label>'+
          '<input type="date" id="lAte" class="log-date" value="'+esc(lf.ate)+'" />'+
        '</div>'+
        '<select id="lPerfil">'+
          '<option value="">Todos os perfis</option>'+
          ['gestor','auditor','enfermeiro'].map(function(p){
            return '<option value="'+p+'"'+(lf.perfil===p?' selected':'')+'>'+p.charAt(0).toUpperCase()+p.slice(1)+'</option>';
          }).join('')+
        '</select>'+
        '<div class="spacer"></div>'+
        '<input id="lBusca" type="text" class="log-busca" placeholder="Buscar usuário, ação ou referência..." value="'+esc(lf.q)+'" />'+
        '<button class="btn ghost" id="lClear">'+ico('x',12)+' Limpar</button>';
      wrap.appendChild(filt);

      var COLS=[{key:'ts',label:'Data/Hora'},{key:'user',label:'Usuário'},{key:'perf',label:'Perfil'},{key:'acao',label:'Ação'},{key:'guia',label:'Guia'}];
      var tbl=el('table');
      var thead='<thead><tr>';
      COLS.forEach(function(c){
        var act=lf.sortCol===c.key;
        thead+='<th class="th-sort'+(act?' sort-active':'')+'" data-col="'+c.key+'">'+esc(c.label)+' <span class="sort-ico">'+(act?(lf.sortDir==='asc'?'▲':'▼'):'⇅')+'</span></th>';
      });
      thead+='</tr></thead>'; tbl.innerHTML=thead;

      var rows=MOCK.LOGS.filter(function(l){
        if(l.tipo!=='usuario') return false;
        if(lf.perfil && l.perfil!==lf.perfil) return false;
        if(lf.de && l.ts.slice(0,10)<lf.de) return false;
        if(lf.ate && l.ts.slice(0,10)>lf.ate) return false;
        if(lf.q && (l.user+' '+l.acao+' '+l.ref).toLowerCase().indexOf(lf.q)<0) return false;
        return true;
      });
      var sfn={ts:function(l){return l.ts;},user:function(l){return l.user;},perf:function(l){return l.perfil;},acao:function(l){return l.acao;},guia:function(l){return logGuia(l);}};
      if(sfn[lf.sortCol]){var _sf=sfn[lf.sortCol],_sd=lf.sortDir==='asc'?1:-1;rows=rows.slice().sort(function(a,b){var av=_sf(a),bv=_sf(b);return av<bv?-_sd:av>bv?_sd:0;});}
      var totalRows=rows.length;
      var totalPages=Math.max(1,Math.ceil(totalRows/LOG_PER_PAGE));
      if(State.logPagina>totalPages) State.logPagina=totalPages;
      var pg=State.logPagina;
      var pageRows=rows.slice((pg-1)*LOG_PER_PAGE, pg*LOG_PER_PAGE);
      var tb=el('tbody');
      if(!pageRows.length){
        tb.appendChild(el('tr',{},'<td colspan="5"><div class="empty">'+icoLg('users')+'<div>Nenhum log de usuário encontrado.</div></div></td>'));
      } else {
        pageRows.forEach(function(l,i){
          tb.appendChild(el('tr',{class:i%2===0?'log-row-a':'log-row-b'},
            '<td style="white-space:nowrap;color:var(--muted);font-size:11.5px;width:130px">'+esc(l.ts)+'</td>'+
            '<td style="font-weight:500">'+esc(l.user)+'</td>'+
            '<td>'+perfilBadge(l.perfil)+'</td>'+
            '<td>'+esc(l.acao)+'</td>'+
            '<td style="color:var(--g-700);font-size:12px;font-weight:600">'+esc(logGuia(l))+'</td>'
          ));
        });
      }
      tbl.appendChild(tb); box.appendChild(tbl);
      var foot=el('div',{class:'log-foot'});
      var pagBtns='<div class="log-pagination">';
      pagBtns+='<button class="log-pag-btn" id="lPagPrev"'+(pg<=1?' disabled':'')+'>‹</button>';
      for(var pi=1;pi<=totalPages;pi++){
        pagBtns+='<button class="log-pag-btn'+(pi===pg?' active':'')+'" data-pg="'+pi+'">'+pi+'</button>';
      }
      pagBtns+='<button class="log-pag-btn" id="lPagNext"'+(pg>=totalPages?' disabled':'')+'>›</button></div>';
      foot.innerHTML=ico('list',12)+' <b>'+(pg*LOG_PER_PAGE-LOG_PER_PAGE+1)+'–'+Math.min(pg*LOG_PER_PAGE,totalRows)+'</b> de <b>'+totalRows+'</b>'+pagBtns;
      box.appendChild(foot);

      setTimeout(function(){
        $$('.th-sort',tbl).forEach(function(th){
          th.onclick=function(){var col=th.getAttribute('data-col');if(lf.sortCol===col){lf.sortDir=lf.sortDir==='asc'?'desc':'asc';}else{lf.sortCol=col;lf.sortDir='asc';}State.logPagina=1;render();};
        });
        var dEl=$('#lDe'); if(dEl) dEl.onchange=function(){lf.de=this.value;State.logPagina=1;render();};
        var aEl=$('#lAte'); if(aEl) aEl.onchange=function(){lf.ate=this.value;State.logPagina=1;render();};
        var lp=$('#lPerfil'); if(lp){ makeCustomSelect(lp); lp.onchange=function(){lf.perfil=this.value;State.logPagina=1;render();}; }
        var _t=null;
        var lb=$('#lBusca'); if(lb) lb.oninput=function(){var pos=this.selectionStart;lf.q=this.value.toLowerCase();State.logPagina=1;clearTimeout(_t);_t=setTimeout(function(){render();var inp=document.getElementById('lBusca');if(inp){inp.focus();inp.setSelectionRange(pos,pos);}},280);};
        var cl=$('#lClear'); if(cl) cl.onclick=function(){State.logFiltros={q:'',perfil:'',de:'',ate:'',sortCol:'ts',sortDir:'desc'};State.logPagina=1;render();};
        var prev=$('#lPagPrev'); if(prev) prev.onclick=function(){State.logPagina--;render();};
        var next=$('#lPagNext'); if(next) next.onclick=function(){State.logPagina++;render();};
        $$('.log-pagination [data-pg]').forEach(function(b){b.onclick=function(){State.logPagina=parseInt(b.getAttribute('data-pg'));render();};});
      },0);

    // ── ABA: Logs Sistema | IA ───────────────────────────────────────────────
    } else {
      var lf2=State.logFiltrosIA;
      var _chartRow2=el('div',{class:'log-chart-row'});
      _chartRow2.innerHTML=donutSistema;
      wrap.appendChild(_chartRow2);

      var filt2=el('div',{class:'filters'});
      filt2.innerHTML=
        '<div class="log-period-wrap">'+ico('calendar',13)+
          '<label class="log-period-lbl">De</label>'+
          '<input type="date" id="lDe2" class="log-date" value="'+esc(lf2.de)+'" />'+
          '<label class="log-period-lbl">Até</label>'+
          '<input type="date" id="lAte2" class="log-date" value="'+esc(lf2.ate)+'" />'+
        '</div>'+
        '<select id="lTipo2">'+
          '<option value="">Todos</option>'+
          [['sistema','Sistema'],['ia','IA'],['correcao_ia','Correções IA']].map(function(p){
            return '<option value="'+p[0]+'"'+(lf2.tipo===p[0]?' selected':'')+'>'+esc(p[1])+'</option>';
          }).join('')+
        '</select>'+
        '<div class="spacer"></div>'+
        '<input id="lBusca2" type="text" class="log-busca" placeholder="Buscar ação ou referência..." value="'+esc(lf2.q)+'" />'+
        '<button class="btn ghost" id="lClear2">'+ico('x',12)+' Limpar</button>';
      wrap.appendChild(filt2);

      var COLS2=[{key:'ts',label:'Data/Hora'},{key:'user',label:'Origem'},{key:'tipo',label:'Tipo'},{key:'acao',label:'Ação'},{key:'guia',label:'Guia'}];
      var tbl2=el('table');
      var thead2='<thead><tr>';
      COLS2.forEach(function(c){
        var act=lf2.sortCol===c.key;
        thead2+='<th class="th-sort'+(act?' sort-active':'')+'" data-col="'+c.key+'">'+esc(c.label)+' <span class="sort-ico">'+(act?(lf2.sortDir==='asc'?'▲':'▼'):'⇅')+'</span></th>';
      });
      thead2+='</tr></thead>'; tbl2.innerHTML=thead2;

      var rows2=MOCK.LOGS.filter(function(l){
        if(l.tipo==='usuario') return false;
        if(lf2.tipo && l.tipo!==lf2.tipo) return false;
        if(lf2.de && l.ts.slice(0,10)<lf2.de) return false;
        if(lf2.ate && l.ts.slice(0,10)>lf2.ate) return false;
        if(lf2.q && (l.user+' '+l.acao+' '+l.ref).toLowerCase().indexOf(lf2.q)<0) return false;
        return true;
      });
      var sfn2={ts:function(l){return l.ts;},user:function(l){return l.user;},tipo:function(l){return l.tipo;},acao:function(l){return l.acao;},guia:function(l){return logGuia(l);}};
      if(sfn2[lf2.sortCol]){var _sf2=sfn2[lf2.sortCol],_sd2=lf2.sortDir==='asc'?1:-1;rows2=rows2.slice().sort(function(a,b){var av=_sf2(a),bv=_sf2(b);return av<bv?-_sd2:av>bv?_sd2:0;});}
      var total2=rows2.length;
      var totalPages2=Math.max(1,Math.ceil(total2/LOG_PER_PAGE));
      if(State.logPaginaIA>totalPages2) State.logPaginaIA=totalPages2;
      var pg2=State.logPaginaIA;
      var pageRows2=rows2.slice((pg2-1)*LOG_PER_PAGE, pg2*LOG_PER_PAGE);
      var tb2=el('tbody');
      if(!pageRows2.length){
        tb2.appendChild(el('tr',{},'<td colspan="5"><div class="empty">'+icoLg('cpu')+'<div>Nenhum log de sistema/IA encontrado.</div></div></td>'));
      } else {
        pageRows2.forEach(function(l,i){
          tb2.appendChild(el('tr',{class:i%2===0?'log-row-a':'log-row-b'},
            '<td style="white-space:nowrap;color:var(--muted);font-size:11.5px;width:130px">'+esc(l.ts)+'</td>'+
            '<td style="font-weight:500">'+esc(l.user)+'</td>'+
            '<td>'+tipoBadge(l.tipo)+'</td>'+
            '<td>'+esc(l.acao)+'</td>'+
            '<td style="color:var(--g-700);font-size:12px;font-weight:600">'+esc(logGuia(l))+'</td>'
          ));
        });
      }
      tbl2.appendChild(tb2); box.appendChild(tbl2);
      var foot2=el('div',{class:'log-foot'});
      var pagBtns2='<div class="log-pagination">';
      pagBtns2+='<button class="log-pag-btn" id="l2PagPrev"'+(pg2<=1?' disabled':'')+'>‹</button>';
      for(var pi2=1;pi2<=totalPages2;pi2++){
        pagBtns2+='<button class="log-pag-btn'+(pi2===pg2?' active':'')+'" data-pg2="'+pi2+'">'+pi2+'</button>';
      }
      pagBtns2+='<button class="log-pag-btn" id="l2PagNext"'+(pg2>=totalPages2?' disabled':'')+'>›</button></div>';
      foot2.innerHTML=ico('list',12)+' <b>'+(pg2*LOG_PER_PAGE-LOG_PER_PAGE+1)+'–'+Math.min(pg2*LOG_PER_PAGE,total2)+'</b> de <b>'+total2+'</b>'+pagBtns2;
      box.appendChild(foot2);

      setTimeout(function(){
        $$('.th-sort',tbl2).forEach(function(th){
          th.onclick=function(){var col=th.getAttribute('data-col');if(lf2.sortCol===col){lf2.sortDir=lf2.sortDir==='asc'?'desc':'asc';}else{lf2.sortCol=col;lf2.sortDir='asc';}State.logPaginaIA=1;render();};
        });
        var d2=$('#lDe2'); if(d2) d2.onchange=function(){lf2.de=this.value;State.logPaginaIA=1;render();};
        var a2=$('#lAte2'); if(a2) a2.onchange=function(){lf2.ate=this.value;State.logPaginaIA=1;render();};
        var lt2=$('#lTipo2'); if(lt2){ makeCustomSelect(lt2); lt2.onchange=function(){lf2.tipo=this.value;State.logPaginaIA=1;render();}; }
        var _t2=null;
        var lb2=$('#lBusca2'); if(lb2) lb2.oninput=function(){var pos=this.selectionStart;lf2.q=this.value.toLowerCase();State.logPaginaIA=1;clearTimeout(_t2);_t2=setTimeout(function(){render();var inp=document.getElementById('lBusca2');if(inp){inp.focus();inp.setSelectionRange(pos,pos);}},280);};
        var cl2=$('#lClear2'); if(cl2) cl2.onclick=function(){State.logFiltrosIA={q:'',tipo:'',de:'',ate:'',sortCol:'ts',sortDir:'desc'};State.logPaginaIA=1;render();};
        var prev2=$('#l2PagPrev'); if(prev2) prev2.onclick=function(){State.logPaginaIA--;render();};
        var next2=$('#l2PagNext'); if(next2) next2.onclick=function(){State.logPaginaIA++;render();};
        $$('.log-pagination [data-pg2]').forEach(function(b){b.onclick=function(){State.logPaginaIA=parseInt(b.getAttribute('data-pg2'));render();};});
      },0);
    }

    wrap.appendChild(box);
    return wrap;
  }

  var PERM_LIST=[
    {key:'verGuias',     label:'Visualizar guias e dashboard',           desc:'Leitura de guias, indicadores e painel geral',                             p:['gestor','auditor','enfermeiro'], v:[]},
    {key:'triagem',      label:'Triagem e complemento de documentação',  desc:'Solicitar documentos, triagem inicial e registrar pendências',            p:['gestor','auditor','enfermeiro'], v:[]},
    {key:'parecer',      label:'Emitir parecer técnico',                 desc:'Registrar pareceres de análise clínica e regulatória em guias',           p:['gestor','auditor'],              v:[]},
    {key:'aprovar',      label:'Aprovar guias',                          desc:'Emitir autorização de procedimentos que atendem aos critérios técnicos',  p:['gestor','auditor'],              v:[]},
    {key:'reprovar',     label:'Reprovar guias',                         desc:'Negar procedimentos por não conformidade técnica ou regulatória',         p:['gestor','auditor'],              v:[]},
    {key:'juntaMedica',  label:'Encaminhar para junta médica',           desc:'Solicitar avaliação multidisciplinar por junta médica',                  p:['gestor','auditor'],              v:[]},
    {key:'migrarPerfil', label:'Migrar entre perfis / visão geral',      desc:'Alternar entre perfis e visualizar as demandas de todos os usuários',    p:['gestor'],                        v:[]},
    {key:'config',       label:'Acessar Configurações do sistema',       desc:'Gestor edita; Auditor e Enfermeiro podem consultar, sem alterar valores', p:['gestor'],                        v:['auditor','enfermeiro']},
    {key:'parametrizar', label:'Parametrizar fluxos, DUT e vinculações', desc:'Gestor configura; Auditor e Enfermeiro visualizam os parâmetros ativos', p:['gestor'],                        v:['auditor','enfermeiro']},
    {key:'logs',         label:'Visualizar logs completos',              desc:'Gestor acessa todo o histórico; Auditor consulta os próprios registros',  p:['gestor'],                        v:['auditor']},
    {key:'dadosSensiveis',label:'Dados sensíveis sem mascaramento',      desc:'CPF, cartão e informações pessoais exibidos sem ocultação de dígitos',   p:['gestor'],                        v:[]},
  ];
  var PERM_PROFILES=['gestor','auditor','enfermeiro'];
  var PERM_LEVELS=['edit','view','none']; // ciclo ao clicar
  function _permBaseLevel(perm,profile){
    if(perm.p.indexOf(profile)>=0) return 'edit';
    if(perm.v&&perm.v.indexOf(profile)>=0) return 'view';
    return 'none';
  }
  function _permLevel(perm,profile){
    var k=perm.key+'|'+profile;
    var ov=State.permOverrides[k];
    return ov||_permBaseLevel(perm,profile);
  }
  function _buildPermMatrix(){
    var editable=State.perfil==='gestor';
    var profileColors={gestor:'#054f27',auditor:'#066b34',enfermeiro:'#0a8a43'};
    var LEVEL_ICO={edit:'check-circle',view:'eye',none:'minus'};
    var LEVEL_COLOR={edit:'var(--g-600)',view:'#64748b',none:'var(--g-200)'};
    var LEVEL_LABEL={edit:'Acesso total',view:'Somente leitura',none:'Sem acesso'};
    var t=el('table',{style:'width:100%;border-collapse:collapse'});
    var thRow='<thead><tr><th style="text-align:left;padding:14px 12px 22px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">Permissão</th>';
    PERM_PROFILES.forEach(function(p){
      thRow+='<th style="text-align:center;padding:14px 8px 22px;width:100px"><span style="display:inline-block;background:'+profileColors[p]+';color:#fff;border-radius:20px;padding:4px 14px;font-size:11.5px;font-weight:700;letter-spacing:.2px">'+p.charAt(0).toUpperCase()+p.slice(1)+'</span></th>';
    });
    thRow+='</tr></thead>';
    t.innerHTML=thRow;
    var tb=el('tbody');
    PERM_LIST.forEach(function(perm,idx){
      var tr=el('tr',{style:'border-top:'+(idx===0?'none':'1px solid var(--g-50)')});
      var labelCell='<td style="padding:16px 12px 16px 16px;vertical-align:top">'+
        '<div style="font-size:13px;font-weight:600;color:var(--ink)">'+esc(perm.label)+'</div>'+
        '<div style="font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.5">'+esc(perm.desc)+'</div>'+
        '</td>';
      var permCells=PERM_PROFILES.map(function(p){
        var lvl=_permLevel(perm,p);
        var cellInner;
        if(lvl==='view'){
          cellInner='<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;color:'+LEVEL_COLOR.view+'">'+
            ico('eye',14)+
            '<span style="font-size:9px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;line-height:1">Leitura</span>'+
          '</span>';
        } else {
          cellInner='<span style="color:'+LEVEL_COLOR[lvl]+';display:inline-flex;justify-content:center">'+ico(LEVEL_ICO[lvl],16)+'</span>';
        }
        var cls='perm-cell'+(editable?' perm-cell-editable':'');
        return '<td class="'+cls+'" data-perm-key="'+esc(perm.key)+'" data-perm-profile="'+p+'" title="'+esc(LEVEL_LABEL[lvl])+(editable?' — clique para alterar':'')+'" style="text-align:center;vertical-align:middle;padding:16px 0;cursor:'+(editable?'pointer':'default')+'">'+cellInner+'</td>';
      }).join('');
      tr.innerHTML=labelCell+permCells;
      tb.appendChild(tr);
    });
    // Legenda dos níveis
    var legRow=el('tr',{style:'border-top:1.5px solid var(--g-100)'});
    legRow.innerHTML='<td colspan="4" style="padding:12px 16px 14px">'+
      '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding-right:56px">'+
        '<span style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Legenda:</span>'+
        '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)">'+ico('check-circle',13)+' <span style="color:var(--g-600);font-weight:600">Acesso total</span></span>'+
        '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)">'+ico('eye',13)+' <span style="color:#64748b;font-weight:600">Somente leitura</span></span>'+
        '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)">'+ico('minus',13)+' <span style="color:var(--muted)">Sem acesso</span></span>'+
        (editable?'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--g-700);font-weight:600">'+ico('mouse-pointer-click',13)+' Clique numa célula para alterar</span>':'')+
      '</div>'+
    '</td>';
    tb.appendChild(legRow);
    t.appendChild(tb);
    var _pmWrap=el('div',{class:'table-wrap',style:'padding-bottom:4px'});
    _pmWrap.appendChild(t);
    if(editable){
      $$('.perm-cell-editable',_pmWrap).forEach(function(td){
        td.onclick=function(){
          var key=td.getAttribute('data-perm-key'), profile=td.getAttribute('data-perm-profile');
          var perm=null; for(var i=0;i<PERM_LIST.length;i++){ if(PERM_LIST[i].key===key){ perm=PERM_LIST[i]; break; } }
          var cur=_permLevel(perm,profile);
          var next=PERM_LEVELS[(PERM_LEVELS.indexOf(cur)+1)%PERM_LEVELS.length];
          State.permOverrides[key+'|'+profile]=next;
          localStorage.setItem('regula_perm_overrides',JSON.stringify(State.permOverrides));
          var newWrap=_buildPermMatrix();
          _pmWrap.replaceWith(newWrap);
          lcIcons();
          toast('Permissão atualizada','ok');
        };
      });
    }
    return _pmWrap;
  }

  function viewPermissoes(){
    var wrap=el('div');
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>'+ico('shield',18)+' Permissões</h1><p>Perfis de acesso e permissões por papel.</p></div>'));
    var g=el('div',{class:'panel'});
    g.innerHTML='<h3>Perfis e permissões</h3><p style="font-size:13px;color:var(--muted);margin-bottom:16px">Cada perfil acessa apenas os recursos compatíveis com sua responsabilidade funcional.</p>';
    g.appendChild(_buildPermMatrix());
    wrap.appendChild(g);
    lcIcons();
    return wrap;
  }

  function viewConfig(){
    var wrap=el('div');
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>'+ico('settings',18)+' Configurações</h1><p>Classificação de risco e fluxos assistenciais.</p></div>'));

    // ── Abas principais ──────────────────────────────────────────────
    var CFG_TABS=[
      {id:'risco',      label:'Classificação de Risco', ico:'shield-alert'},
      {id:'fluxos',     label:'Fluxos',                 ico:'git-branch'},
      {id:'permissoes', label:'Permissões',             ico:'shield'},
      {id:'ia',         label:'Assistente IA',          ico:'bot'},
    ];

    var tabBar=el('div',{class:'cfg-tab-bar'});
    CFG_TABS.forEach(function(tb){
      tabBar.innerHTML+='<button class="cfg-tab" data-cfg-tab="'+tb.id+'">'+ico(tb.ico,13)+' '+tb.label+'</button>';
    });
    wrap.appendChild(tabBar);

    var cfgContent=el('div',{class:'cfg-content'});
    wrap.appendChild(cfgContent);

    // ── Conteúdo: Classificação de Risco ─────────────────────────────
    var FATORES=[
      {key:'urgencia',         label:'Regime de urgência',              desc:'Guia com regime Urgência/Emergência'},
      {key:'uti',              label:'Internação em UTI',               desc:'Guia inclui diária de UTI'},
      {key:'opme',             label:'OPME presente',                   desc:'Material especial (órtese, prótese, etc.)'},
      {key:'prazoVencido',     label:'Prazo de auditoria vencido',      desc:'Guia ultrapassou o prazo de análise'},
      {key:'altaComplexidade', label:'Fluxo alta complexidade',         desc:'Fluxo F2 (Alta Complexidade) ou F5 (Neuro/Buco/Cardio)'},
      {key:'oncologia',        label:'Fluxo oncologia / imunobiológico',desc:'Fluxo F8 — medicamentos de alto custo'},
      {key:'intCirurgica',     label:'Internação cirúrgica',            desc:'Guia com tipo de cirurgia (geral, neuro ou ortopédica)'},
      {key:'intClinica',       label:'Internação clínica',              desc:'Internação sem procedimento cirúrgico e sem UTI'},
      {key:'ambulatorial',     label:'Ambulatorial',                    desc:'Atendimento ambulatorial sem diárias ou internação'}
    ];

    function renderRisco(){
      cfgContent.innerHTML='';
      if(!can('config')){
        cfgContent.appendChild(el('div',{class:'ai-warn',style:'margin-top:14px'},ico('lock')+' A configuração de risco é exclusiva do perfil Gestor.'));
        return;
      }
      var cfg=State.riscoConfig;
      var rp=el('div',{class:'panel risco-cfg-panel'});

      var hd=el('div',{class:'risco-cfg-hd'});
      hd.innerHTML=
        '<div><h3 style="margin:0">'+ico('shield-alert',16)+' Classificação de Risco — Régua de Pontuação</h3>'+
        '<p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">Cada fator presente na guia soma pontos. O total define o nível de risco.</p></div>'+
        '<div class="risco-toggle-wrap">'+
          '<label class="risco-toggle-lbl"><input type="checkbox" id="riscoAtivo"'+(cfg.ativo?' checked':'')+'/> Classificação automática ativa</label>'+
          '<span id="modoTag" class="badge '+(cfg.ativo?'':'muted')+'">'+(cfg.ativo?'Automático':'Manual')+'</span>'+
        '</div>';
      rp.appendChild(hd);

      // ── Sub-abas ──
      var rstBar=el('div',{style:'display:flex;gap:0;border-bottom:1.5px solid var(--g-100);margin:10px 0 0'});
      [['limiares',ico('sliders-horizontal',13)+' Limiares'],['previa',ico('table-2',13)+' Prévia']].forEach(function(pair){
        var b=el('button',{'data-rst':pair[0],style:'padding:9px 18px;font-size:12.5px;font-weight:600;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;color:var(--muted);display:flex;align-items:center;gap:6px'},pair[1]);
        rstBar.appendChild(b);
      });
      rp.appendChild(rstBar);
      var rstContent=el('div');
      rp.appendChild(rstContent);

      // Estado compartilhado entre abas (lê inputs onde existirem)
      function getTmpCfg(){
        var tmpCfg={ativo:cfg.ativo,pesos:{},limiares:{}};
        FATORES.forEach(function(f){
          var inp=rp.querySelector('[data-key="'+f.key+'"]');
          tmpCfg.pesos[f.key]=inp?(+inp.value||0):(cfg.pesos[f.key]||0);
        });
        ['baixo','medio','alto'].forEach(function(k){
          var inp=rp.querySelector('.risco-lim[data-key="'+k+'"]');
          tmpCfg.limiares[k]=inp?(+inp.value||0):(cfg.limiares[k]||0);
        });
        return tmpCfg;
      }

      function showRst(tab){
        $$('[data-rst]',rstBar).forEach(function(b){
          var on=b.getAttribute('data-rst')===tab;
          b.style.cssText='padding:9px 18px;font-size:12.5px;font-weight:600;border:none;border-bottom:2px solid '+(on?'var(--g-600)':'transparent')+';background:none;cursor:pointer;color:'+(on?'var(--g-700)':'var(--muted)')+';display:flex;align-items:center;gap:6px';
        });
        rstContent.innerHTML='';

        if(tab==='limiares'){
          // ── Limiares ─────────────────────────────────────────────────
          var _somaPesos=0; FATORES.forEach(function(f){ _somaPesos+=(cfg.pesos[f.key]||0); });
          var secL=el('div',{class:'risco-section'});
          secL.innerHTML='<h4>'+ico('sliders-horizontal',13)+' Limiares por nível (pontuação máxima)</h4>'+
            '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">Pontuação <b>até</b> o limiar = nível correspondente. Acima do Alto = Crítico. '+
            'Soma atual dos pesos configurados: <b><span class="risco-teto-val">'+_somaPesos+'</span> pontos</b>.</p>'+
            '<div style="background:var(--g-50);border:1.5px solid var(--g-100);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;line-height:1.65;color:var(--ink)">'+
              '<b>'+ico('triangle-alert',12)+' Regra obrigatória:</b> os limiares devem ser crescentes — <b>Baixo &lt; Médio &lt; Alto</b>. O sistema bloqueia o salvamento se essa ordem não for respeitada.'+
            '</div>';
          var limGrid=el('div',{class:'risco-lim-grid'});
          [{key:'baixo',label:'Baixo',cls:'baixo',icon:'circle-check'},{key:'medio',label:'Médio',cls:'medio',icon:'circle-alert'},{key:'alto',label:'Alto',cls:'alto',icon:'triangle-alert'}].forEach(function(l){
            var card=el('div',{class:'risco-lim-card'});
            card.innerHTML='<div class="risco-lim-ico '+l.cls+'">'+ico(l.icon,16)+'</div>'+
              '<div class="risco-lim-body"><div class="risco-lim-name">'+l.label+'</div><div style="font-size:11px;color:var(--muted)">0 até...</div>'+
              '<input class="risco-lim" type="number" min="0" max="'+_somaPesos+'" data-key="'+l.key+'" value="'+(cfg.limiares[l.key]||0)+'" /></div>';
            limGrid.appendChild(card);
          });
          var cardCrit=el('div',{class:'risco-lim-card'});
          cardCrit.innerHTML='<div class="risco-lim-ico critico">'+ico('octagon-alert',16)+'</div>'+
            '<div class="risco-lim-body"><div class="risco-lim-name">Crítico</div><div style="font-size:11px;color:var(--muted)">Acima do limiar Alto</div><div style="font-size:16px;font-weight:800;color:var(--danger);padding:6px 0">∞</div></div>';
          limGrid.appendChild(cardCrit);
          secL.appendChild(limGrid); rstContent.appendChild(secL);

          var footL=el('div',{class:'risco-foot'});
          footL.innerHTML='<button class="btn-animated" id="limSalvar">'+ico('save',14)+' Salvar limiares</button>';
          rstContent.appendChild(footL);

          setTimeout(function(){
            $('#limSalvar').onclick=function(){
              var novoCfg=JSON.parse(JSON.stringify(cfg));
              ['baixo','medio','alto'].forEach(function(k){ novoCfg.limiares[k]=+rp.querySelector('.risco-lim[data-key="'+k+'"]').value||0; });
              if(novoCfg.limiares.baixo>=novoCfg.limiares.medio||novoCfg.limiares.medio>=novoCfg.limiares.alto){
                toast('Limiares devem ser crescentes: Baixo < Médio < Alto','err'); return;
              }
              State.riscoConfig=novoCfg; localStorage.setItem('regula_risco_cfg',JSON.stringify(novoCfg));
              aplicarRiscos(); toast('Limiares salvos e aplicados','ok'); render();
            };
          },0);

        } else {
          // ── Prévia — distribuição das guias pelos níveis de risco atuais ──
          var lim=cfg.limiares;
          var niveis=['baixo','medio','alto','critico'];
          var nivelLabel={baixo:'Baixo',medio:'Médio',alto:'Alto',critico:'Crítico'};
          var nivelCor={baixo:'#16a34a',medio:'#a16207',alto:'#ea580c',critico:'#b91c1c'};
          var nivelCls={baixo:'baixo',medio:'medio',alto:'alto',critico:'critico'};
          var dist={baixo:[],medio:[],alto:[],critico:[]};
          State.guias.forEach(function(g){ dist[calcRisco(g)].push(g); });
          var total=State.guias.length;

          var secP=el('div',{class:'risco-section'});
          secP.innerHTML='<h4>'+ico('bar-chart-2',13)+' Prévia — distribuição das guias pelos limiares atuais</h4>'+
            '<p style="font-size:12px;color:var(--muted);margin:-4px 0 16px">Distribuição real das guias com os limiares salvos. Ajuste os limiares e salve para ver o impacto aqui.</p>';

          // Cards de resumo
          var distGrid=el('div',{style:'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px'});
          niveis.forEach(function(n){
            var qtd=dist[n].length;
            var pct=total?Math.round(qtd/total*100):0;
            var card=el('div',{style:'background:#fff;border:1.5px solid var(--g-100);border-radius:10px;padding:14px 16px;text-align:center'});
            card.innerHTML='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:'+nivelCor[n]+';margin-bottom:6px">'+nivelLabel[n]+'</div>'+
              '<div style="font-size:28px;font-weight:800;color:var(--ink);line-height:1">'+qtd+'</div>'+
              '<div style="font-size:11px;color:var(--muted);margin-top:4px">'+pct+'% do total</div>'+
              '<div style="margin-top:8px;height:4px;background:var(--g-100);border-radius:4px"><div style="height:100%;border-radius:4px;background:'+nivelCor[n]+';width:'+pct+'%"></div></div>';
            distGrid.appendChild(card);
          });
          secP.appendChild(distGrid);

          // Referência dos limiares ativos
          var limRef=el('div',{style:'background:var(--g-50);border:1px solid var(--g-100);border-radius:8px;padding:10px 16px;font-size:12px;color:var(--ink-2);margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap'});
          limRef.innerHTML='<b>Limiares ativos:</b>'+
            ' <span>Baixo ≤ <b>'+lim.baixo+'</b></span>'+
            ' · <span>Médio ≤ <b>'+lim.medio+'</b></span>'+
            ' · <span>Alto ≤ <b>'+lim.alto+'</b></span>'+
            ' · <span>Crítico <b>> '+lim.alto+'</b></span>';
          secP.appendChild(limRef);

          // Tabela única com linhas de grupo para alinhar colunas
          var tG=el('table',{class:'risco-table'});
          tG.innerHTML='<thead><tr>'+
            '<th style="width:110px">Guia</th>'+
            '<th>Beneficiário</th>'+
            '<th style="width:160px">Tipo</th>'+
            '<th>Fluxo</th>'+
            '<th style="width:70px;text-align:center">Score</th>'+
          '</tr></thead>';
          var tbG=el('tbody');
          niveis.forEach(function(n){
            if(!dist[n].length) return;
            var trGrp=el('tr');
            trGrp.innerHTML='<td colspan="5" style="background:var(--g-50);padding:7px 10px;font-size:11px;font-weight:700;color:'+nivelCor[n]+';text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--g-200)">'+
              nivelLabel[n]+' ('+dist[n].length+')</td>';
            tbG.appendChild(trGrp);
            dist[n].forEach(function(g){
              var score=calcRiscoScore(g);
              var tr=el('tr');
              tr.innerHTML='<td><b>'+esc(g.numero)+'</b></td>'+
                '<td>'+esc(g.beneficiario.nome)+'</td>'+
                '<td>'+esc(g.tipo)+'</td>'+
                '<td>'+esc(g.fluxo.nome)+'</td>'+
                '<td style="text-align:center;font-weight:700">'+score+'</td>';
              tbG.appendChild(tr);
            });
          });
          tG.appendChild(tbG);
          var _gWrap=el('div',{class:'table-wrap'}); _gWrap.appendChild(tG); secP.appendChild(_gWrap);
          rstContent.appendChild(secP);
        }
      }

      $$('[data-rst]',rstBar).forEach(function(b){
        b.onclick=function(){ showRst(b.getAttribute('data-rst')); };
      });
      showRst('limiares');
      cfgContent.appendChild(rp);
    }

    function renderPermissoes(){
      cfgContent.innerHTML='';
      var panel=el('div',{class:'panel'});
      panel.innerHTML='<h3>Perfis e permissões</h3><p style="font-size:13px;color:var(--muted);margin-bottom:16px">Cada perfil acessa apenas os recursos compatíveis com sua responsabilidade funcional.</p>';
      panel.appendChild(_buildPermMatrix());
      cfgContent.appendChild(panel);
      lcIcons();
    }

    // ── Conteúdo: Fluxos ─────────────────────────────────────────────
    function renderFluxos(){
      cfgContent.innerHTML='';
      var sec=el('div',{class:'cfg-section'});

      var hd=el('div',{class:'cfg-section-hd'});
      hd.innerHTML='<h3>'+ico('git-branch',15)+' Prazos por Fluxo</h3>'+
        '<p style="font-size:13px;color:var(--muted);margin:4px 0 0">Prazo máximo de auditoria (SLA) por fluxo, consultado no Solus. Edite para atualizar o valor utilizado nos relatórios e gráficos.</p>';
      sec.appendChild(hd);

      var note=el('div',{class:'ia-confirm-note',style:'margin:12px 0 16px'});
      note.innerHTML=ico('info',13)+' <span>O prazo é único por fluxo e <b>consultado no Solus</b>. Atualize o campo abaixo sempre que o valor no Solus for alterado.</span>';
      sec.appendChild(note);

      var tbl=el('table',{class:'cfg-table'});
      var thead=el('thead');
      thead.innerHTML='<tr>'+
        '<th>Fluxo</th>'+
        '<th>Regime</th>'+
        '<th style="width:150px;text-align:center">Prazo (dias)</th>'+
      '</tr>';
      tbl.appendChild(thead);

      var REGIME_OPTS=['Todos','Eletivo','Urgência'];
      var REGIME_CLS={Todos:'muted',Eletivo:'info',Urgência:'warn'};
      var editable=State.perfil==='gestor';
      var tbody=el('tbody');
      var inputs={};
      MOCK.FLUXOS.forEach(function(f){
        var defs=FLUXO_SLA_DEFAULTS[f.id]||{prazo:5};
        var saved=State.fluxoSLAConfig[f.id];
        var prazoAtual=(saved&&saved.prazo>0)?saved.prazo:defs.prazo;
        var regimeAtual=(saved&&saved.regime)||f.regime||'Todos';
        var tr=el('tr');
        var tdFluxo=el('td');
        tdFluxo.innerHTML='<span class="badge muted" style="font-size:10px;margin-right:6px">'+esc(f.id)+'</span>'+esc(f.nome);
        var tdRegime=el('td');
        function buildRegimeBadge(r){
          return '<span class="badge '+REGIME_CLS[r]+'" style="font-size:11px;'+(editable?'cursor:pointer;user-select:none':'')+'" data-regime-fid="'+esc(f.id)+'" title="'+(editable?'Clique para alterar':r)+'">'+esc(r)+'</span>';
        }
        tdRegime.innerHTML=buildRegimeBadge(regimeAtual);
        if(editable){
          tdRegime.querySelector('[data-regime-fid]').onclick=function(){
            var cur=(State.fluxoSLAConfig[f.id]&&State.fluxoSLAConfig[f.id].regime)||f.regime||'Todos';
            var next=REGIME_OPTS[(REGIME_OPTS.indexOf(cur)+1)%REGIME_OPTS.length];
            if(!State.fluxoSLAConfig[f.id]) State.fluxoSLAConfig[f.id]={};
            State.fluxoSLAConfig[f.id].regime=next;
            try{ localStorage.setItem('regula_fluxo_sla',JSON.stringify(State.fluxoSLAConfig)); }catch(e){}
            tdRegime.innerHTML=buildRegimeBadge(next);
            if(editable) tdRegime.querySelector('[data-regime-fid]').onclick=arguments.callee;
            toast('Regime de '+f.nome+' alterado para '+next,'ok');
          };
        }
        var tdPrazo=el('td',{style:'text-align:center'});
        var inp=document.createElement('input');
        inp.type='number'; inp.min='1'; inp.max='60'; inp.value=prazoAtual;
        inp.className='cfg-input-num'; inp.setAttribute('data-fid',f.id);
        tdPrazo.appendChild(inp);
        tr.appendChild(tdFluxo); tr.appendChild(tdRegime); tr.appendChild(tdPrazo);
        tbody.appendChild(tr);
        inputs[f.id]=inp;
      });
      tbl.appendChild(tbody);
      var regimeLegRow=el('tr',{style:'border-top:1.5px solid var(--g-100)'});
      regimeLegRow.innerHTML='<td colspan="3" style="padding:16px 10px 8px">'+
        '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">'+
          '<span style="font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Legenda:</span>'+
          '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)"><span class="badge muted" style="font-size:10px">Todos</span> Eletivo e Urgência</span>'+
          '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)"><span class="badge info" style="font-size:10px">Eletivo</span> Somente guias eletivas</span>'+
          '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-2)"><span class="badge warn" style="font-size:10px">Urgência</span> Somente guias de urgência</span>'+
          (editable?'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--g-700);font-weight:600;margin-left:auto">'+ico('mouse-pointer-click',13)+' Clique no regime para alterar</span>':'')+
        '</div>'+
      '</td>';
      tbl.querySelector('tbody').appendChild(regimeLegRow);
      var _cfgTblWrap=el('div',{class:'table-wrap'});
      _cfgTblWrap.appendChild(tbl);
      sec.appendChild(_cfgTblWrap);

      var btnRow=el('div',{style:'margin-top:18px;display:flex;gap:12px;align-items:center'});
      var btnSave=el('button',{class:'btn btn-primary'});
      btnSave.innerHTML=ico('save',14)+' Salvar prazos';
      var savedMsg=el('span',{style:'font-size:12px;color:var(--g-600);opacity:0;transition:opacity .4s;display:flex;align-items:center;gap:4px'});
      savedMsg.innerHTML=ico('check-circle-2',13)+' Salvo com sucesso';
      btnRow.appendChild(btnSave); btnRow.appendChild(savedMsg);
      sec.appendChild(btnRow);

      btnSave.onclick=function(){
        MOCK.FLUXOS.forEach(function(f){
          var v=parseInt(inputs[f.id].value,10);
          if(!v||v<1) v=1; if(v>60) v=60;
          inputs[f.id].value=v;
          if(!State.fluxoSLAConfig[f.id]) State.fluxoSLAConfig[f.id]={};
          State.fluxoSLAConfig[f.id].prazo=v;
        });
        try{ localStorage.setItem('regula_fluxo_sla',JSON.stringify(State.fluxoSLAConfig)); }catch(e){}
        savedMsg.style.opacity='1';
        setTimeout(function(){ savedMsg.style.opacity='0'; },2500);
        toast('Prazos por fluxo salvos','ok');
      };

      cfgContent.appendChild(sec);
      lcIcons();
    }

    // ── Aba: Assistente IA ───────────────────────────────────────────
    function renderIA(){
      cfgContent.innerHTML='';

      // Modelos por provedor
      var MODELOS={
        gemini:[
          {v:'gemini-2.5-flash',  t:'gemini-2.5-flash (Recomendado)'},
          {v:'gemini-2.5-pro',    t:'gemini-2.5-pro (mais detalhado)'},
          {v:'gemini-2.0-flash-lite', t:'gemini-2.0-flash-lite (mais rápido)'}
        ],
        claude:[
          {v:'claude-sonnet-4-6',  t:'claude-sonnet-4-6 (Recomendado)'},
          {v:'claude-opus-4-8',    t:'claude-opus-4-8 (mais avançado)'},
          {v:'claude-haiku-4-5-20251001', t:'claude-haiku-4-5 (mais rápido)'}
        ],
        openai:[
          {v:'gpt-4o',      t:'gpt-4o (Recomendado)'},
          {v:'gpt-4o-mini', t:'gpt-4o-mini (mais rápido/barato)'},
          {v:'gpt-4-turbo', t:'gpt-4-turbo'}
        ]
      };
      var DEFAULTS={gemini:'gemini-2.5-flash',claude:'claude-sonnet-4-6',openai:'gpt-4o'};
      var PROV_LABEL={gemini:'Google Gemini',claude:'Anthropic (Claude)',openai:'OpenAI'};
      var KEY_HINT={
        gemini:'Cole aqui sua chave AIza...',
        claude:'Cole aqui sua chave sk-ant-...',
        openai:'Cole aqui sua chave sk-...'
      };
      var OBTER={
        gemini:'📌 Chave gratuita em <b>aistudio.google.com</b> → "Get API Key". O plano gratuito permite ~1.500 req/dia no modelo flash.',
        claude:'📌 Obtenha sua chave em <b>console.anthropic.com</b> → "API Keys". A chamada é feita direto do navegador.',
        openai:'📌 Obtenha sua chave em <b>platform.openai.com/api-keys</b>. Requer créditos na conta OpenAI.'
      };

      var provedor=localStorage.getItem('regula_ia_provider')||'gemini';

      var sec=el('div',{class:'panel',style:'padding:20px'});
      sec.innerHTML=
        '<h3 style="margin:0 0 4px">'+ico('bot',16)+' Assistente IA — Configuração</h3>'+
        '<p style="margin:0 0 18px;font-size:13px;color:var(--muted)">Escolha o provedor de IA e informe a chave de API correspondente para ativar a RAI. A chave fica <b>apenas no seu navegador</b>.</p>'+
        '<div style="margin-bottom:16px">'+
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Provedor de IA</label>'+
          '<div class="ia-prov-row" id="iaProvRow">'+
            ['gemini','claude','openai'].map(function(p){
              return '<button type="button" class="ia-prov-btn'+(p===provedor?' active':'')+'" data-prov="'+p+'">'+PROV_LABEL[p]+'</button>';
            }).join('')+
          '</div>'+
        '</div>'+
        '<div style="margin-bottom:14px">'+
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Chave de API — <span id="iaKeyProvLbl">'+PROV_LABEL[provedor]+'</span></label>'+
          '<input id="cfgIaKey" type="password" placeholder="'+KEY_HINT[provedor]+'" style="width:100%;max-width:480px;padding:9px 12px;border:1.5px solid var(--g-200);border-radius:8px;font-size:13px;font-family:monospace"/>'+
          '<p style="font-size:12px;color:var(--muted);margin:6px 0 0">Cada provedor guarda sua própria chave. Nunca é enviada ao servidor ou ao código-fonte.</p>'+
        '</div>'+
        '<div style="margin-bottom:18px">'+
          '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Modelo</label>'+
          '<select id="cfgIaModel" style="padding:8px 12px;border:1.5px solid var(--g-200);border-radius:8px;font-size:13px;min-width:280px"></select>'+
        '</div>'+
        '<button id="cfgIaSave" class="btn-primary" style="padding:9px 22px">'+ico('save',13)+' Salvar configuração</button>'+
        '<span id="cfgIaMsg" style="margin-left:12px;font-size:12.5px;color:var(--ok);opacity:0;transition:opacity .3s"></span>'+
        '<div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--g-100)">'+
          '<p id="iaObterTxt" style="font-size:12.5px;color:var(--muted);margin:0">'+OBTER[provedor]+'</p>'+
        '</div>';
      cfgContent.appendChild(sec);

      var inpKey=sec.querySelector('#cfgIaKey');
      var selModel=sec.querySelector('#cfgIaModel');
      var keyLbl=sec.querySelector('#iaKeyProvLbl');
      var obterTxt=sec.querySelector('#iaObterTxt');

      // Preenche modelo + chave conforme o provedor selecionado
      function carregaProvedor(p){
        provedor=p;
        // modelos
        var savedModel=localStorage.getItem('regula_ia_model_'+p)||DEFAULTS[p];
        selModel.innerHTML=MODELOS[p].map(function(m){ return '<option value="'+m.v+'">'+m.t+'</option>'; }).join('');
        selModel.value=savedModel;
        // chave
        inpKey.value=localStorage.getItem('regula_ia_key_'+p)||'';
        inpKey.placeholder=KEY_HINT[p];
        keyLbl.textContent=PROV_LABEL[p];
        obterTxt.innerHTML=OBTER[p];
        // botões ativos
        $$('.ia-prov-btn',sec).forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-prov')===p); });
      }
      carregaProvedor(provedor);

      $$('.ia-prov-btn',sec).forEach(function(b){
        b.onclick=function(){ carregaProvedor(b.getAttribute('data-prov')); };
      });

      sec.querySelector('#cfgIaSave').onclick=function(){
        var k=inpKey.value.trim();
        if(k) localStorage.setItem('regula_ia_key_'+provedor,k);
        else localStorage.removeItem('regula_ia_key_'+provedor);
        localStorage.setItem('regula_ia_model_'+provedor,selModel.value);
        localStorage.setItem('regula_ia_provider',provedor);
        // Compatibilidade: mantém as chaves antigas do Gemini sincronizadas
        if(provedor==='gemini'){
          if(k) localStorage.setItem('regula_gemini_key',k); else localStorage.removeItem('regula_gemini_key');
          localStorage.setItem('regula_gemini_model',selModel.value);
        }
        var msg=sec.querySelector('#cfgIaMsg');
        msg.textContent='Salvo!'; msg.style.opacity='1';
        setTimeout(function(){ msg.style.opacity='0'; },2500);
        toast('Configuração do Assistente IA salva ('+PROV_LABEL[provedor]+')','ok');
      };
      lcIcons();
    }

    // ── Ativar aba ───────────────────────────────────────────────────
    function setTab(id){
      $$('.cfg-tab',tabBar).forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-cfg-tab')===id); });
      if(id==='risco') renderRisco();
      else if(id==='permissoes') renderPermissoes();
      else if(id==='fluxos') renderFluxos();
      else if(id==='ia') renderIA();
    }

    $$('.cfg-tab',tabBar).forEach(function(b){ b.onclick=function(){ setTab(b.getAttribute('data-cfg-tab')); }; });
    setTab('risco');

    return wrap;
  }

  /* === Modais === */
  function modal(title, sub, bodyHTML, footHTML){
    var bd=el('div',{class:'modal-backdrop'});
    var m=el('div',{class:'modal'});
    m.innerHTML=
      '<div class="modal-header">'+
        '<div class="modal-header-brand">'+
          '<div class="modal-brand-mark">R<span>AI</span></div>'+
          '<div style="min-width:0">'+
            '<h2>'+title+'</h2>'+
            (sub?'<div class="sub">'+sub+'</div>':'')+
          '</div>'+
        '</div>'+
        '<button class="modal-close" title="Fechar">'+ico('x')+'</button>'+
      '</div>'+
      '<div class="modal-body">'+bodyHTML+'</div>'+
      (footHTML?'<div class="modal-foot">'+footHTML+'</div>':'');
    bd.appendChild(m); $('#modalRoot').appendChild(bd);
    document.body.style.overflow='hidden';
    function closeModal(){
      bd.remove();
      if(!document.querySelector('.modal-backdrop')) document.body.style.overflow='';
    }
    bd.querySelector('.modal-close').onclick=function(){ closeModal(); };
    bd.onclick=function(e){ if(e.target===bd) closeModal(); };
    lcIcons();
    return m;
  }

  function openGuia(g, tab){
    g._cache = AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
    var ia=g._cache;
    var TABS_DEF=[
      {id:'resumo',        label:'Resumo',           ico:'layout-dashboard', grp:0},
      {id:'beneficiario',  label:'Beneficiário',      ico:'user',             grp:0},
      {id:'prestador',     label:'Prestador',         ico:'building-2',       grp:0},
      {id:'solicitacao',   label:'Solicitação',       ico:'file-text',        grp:0},
      {id:'etapas',        label:'Etapas',            ico:'git-branch',       grp:1},
      {id:'procedimentos', label:'Procedimentos',     ico:'stethoscope',      grp:1},
      {id:'pacotes',       label:'Pacotes',           ico:'package',          grp:1},
      {id:'matmed',        label:'Mat/Med',           ico:'pill',             grp:1},
      {id:'diariastaxas',  label:'Diárias/Taxas',     ico:'calendar-days',    grp:1},
      {id:'opme',          label:'OPME',              ico:'wrench',           grp:1},
      {id:'anexos',        label:'Anexos',            ico:'paperclip',        grp:1},
      {id:'criticas',      label:'Críticas',          ico:'triangle-alert',   grp:2},
      {id:'ia',            label:'Parecer Técnico',   ico:'bot',              grp:2},
      {id:'operadora',     label:'Parecer Operadora', ico:'file-check-2',     grp:2},
      {id:'historico',     label:'Histórico',         ico:'history',          grp:2},
      {id:'logs',          label:'Logs',              ico:'scroll-text',      grp:2},
    ];
    var tabs=TABS_DEF.map(function(t){return t.id});
    var tabsHtml='<div class="tabs">';
    var lastGrp=-1;
    TABS_DEF.forEach(function(t){
      if(t.grp!==lastGrp&&lastGrp!==-1) tabsHtml+='<span class="tab-sep"></span>';
      lastGrp=t.grp;
      tabsHtml+='<button class="tab" data-tab="'+t.id+'">'+t.label+'</button>';
    });
    tabsHtml+='</div><div id="tabContent"></div>';
    var foot='<button class="btn ghost" id="reIA">'+ico('refresh-cw')+' Reprocessar</button>'+(can('parecer')?'<button class="btn-animated" id="abrirPar">'+ico('file-pen-line')+' Parecer da Operadora</button>':'');
    var m = modal('Guia '+esc(g.numero)+' '+statusBadge(g.status), esc(g.beneficiario.nome)+' · '+esc(g.tipo)+' · Fluxo '+esc(g.fluxo.id), tabsHtml, foot);

    var content = m.querySelector('#tabContent');
    function setTab(t){
      $$('.tab',m).forEach(function(x){x.classList.toggle('active',x.getAttribute('data-tab')===t)});
      content.innerHTML='';
      content.appendChild(renderGuiaTab(g,ia,t));
      lcIcons();
    }
    $$('.tab',m).forEach(function(b){ b.onclick=function(){setTab(b.getAttribute('data-tab'))} });
    setTab(tab||'resumo');

    m.querySelector('#reIA').onclick=function(){
      // coleta feedback persistido (itens desmarcados)
      var fbKey='regula_ia_fb_'+(g?g.numero:'x');
      var confirmacoes={};
      try{ confirmacoes=JSON.parse(localStorage.getItem(fbKey)||'{}'); }catch(e){}
      // coleta observação do auditor
      var obsKey='regula_ia_obs_'+(g?g.numero:'x');
      var obsAuditor='';
      try{ obsAuditor=localStorage.getItem(obsKey)||''; }catch(e){}
      // coleta parecer da operadora salvo (obs impressas e internas)
      var parecerOp=g.parecerOperadora||null;

      var _pl=document.getElementById('pageLoader');
      if(_pl) _pl.classList.add('pl--transp');
      document.body.classList.add('pl--blurring');
      showPageLoader();
      setTimeout(function(){
        g._cache=AI.analisarGuiaComIA(g,{
          pesos: getFluxoPesos(g.fluxo&&g.fluxo.id),
          feedbackAuditor: confirmacoes,
          observacaoAuditor: obsAuditor,
          parecerOperadora: parecerOp
        });
        ia=g._cache;
        setTab('ia');
        hidePageLoader();
        document.body.classList.remove('pl--blurring');
        setTimeout(function(){ if(_pl) _pl.classList.remove('pl--transp'); },600);
        // log do reprocessamento com contexto
        var ts2=new Date().toISOString().slice(0,16).replace('T',' ');
        var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
        var ctx=[];
        if(obsAuditor) ctx.push('com observação do auditor');
        if(parecerOp) ctx.push('com parecer da operadora');
        var itensCont=Object.values(confirmacoes).reduce(function(s,arr){return s+(arr.filter?arr.filter(function(v){return v===false;}).length:0);},0);
        if(itensCont) ctx.push(itensCont+' item(ns) contestado(s)');
        MOCK.LOGS.unshift({ts:ts2,user:uName,perfil:State.perfil,tipo:'ia',
          acao:'Análise IA reprocessada'+(ctx.length?' ('+ctx.join(', ')+')':''),
          ref:'Guia '+(g?g.numero:'')});
        toast('Análise reprocessada com suas correções','ok');
      },80);
    };
    var pb=m.querySelector('#abrirPar'); if(pb) pb.onclick=function(){ openParecer(g) };
  }

  function renderGuiaTab(g, ia, t){
    var d=el('div');
    if(t==='resumo'){
      var adp=ia.aderencia;
      var adCls=adp>=90?'alta':(adp>=70?'mod':(adp>=50?'baixa':'crit'));
      var RISKS=[
        {label:'Regulatório',  val:g.risco,                ico:'shield-alert'},
        {label:'Assistencial', val:g.uti?'alto':'medio',   ico:'heart-pulse'},
        {label:'Documental',   val:g.anexos?'baixo':'alto',ico:'file-warning'},
        {label:'Contratual',   val:'baixo',                ico:'file-check'},
      ];
      d.innerHTML=
        '<div class="guia-metrics">'+
          '<div class="guia-metric">'+
            '<span class="guia-metric-lbl">'+ico('activity',11)+' Status</span>'+
            '<span class="guia-metric-val">'+statusBadge(g.status)+'</span>'+
          '</div>'+
          '<div class="guia-metric">'+
            '<span class="guia-metric-lbl">'+ico('clock',11)+' Dias em auditoria</span>'+
            '<span class="guia-metric-val guia-metric-num'+(g.prazoVencido?' vencido':'')+'">'+g.diasAuditoria+(g.prazoVencido?' <span class="badge danger" style="font-size:10px">vencido</span>':'')+'</span>'+
          '</div>'+
          '<div class="guia-metric">'+
            '<span class="guia-metric-lbl">'+ico('bar-chart-2',11)+' Aderência à DUT</span>'+
            '<span class="guia-metric-val guia-metric-num adp-'+adCls+'">'+adp+'%</span>'+
          '</div>'+
          '<div class="guia-metric">'+
            '<span class="guia-metric-lbl">'+ico('git-branch',11)+' Fluxo</span>'+
            '<span class="guia-metric-val" style="font-size:12px">'+esc(g.fluxo.nome)+'</span>'+
          '</div>'+
        '</div>'+
        '<div class="g2" style="gap:12px">'+
          '<dl class="kv">'+
            '<dt>Número</dt><dd>'+esc(g.numero)+'</dd>'+
            '<dt>Beneficiário</dt><dd>'+esc(g.beneficiario.nome)+' ('+g.beneficiario.idade+' anos)</dd>'+
            '<dt>Plano / Contrato</dt><dd>'+esc(g.beneficiario.plano)+' · '+esc(g.beneficiario.contrato)+'</dd>'+
            '<dt>Prestador solicitante</dt><dd>'+esc(g.prestadorSol.nome)+'</dd>'+
            '<dt>Prestador executante</dt><dd>'+esc(g.prestadorExe.nome)+'</dd>'+
            '<dt>Natureza / Regime</dt><dd>'+esc(g.natureza)+' · '+esc(g.regime)+'</dd>'+
            '<dt>Tipo</dt><dd>'+esc(g.tipo)+'</dd>'+
            '<dt>Data emissão</dt><dd>'+esc(g.dataEmissao)+'</dd>'+
          '</dl>'+
          '<div class="guia-risk-grid">'+
            RISKS.map(function(r){
              return '<div class="guia-risk-card risk-'+r.val+'">'+
                '<span class="guia-risk-ico">'+ico(r.ico,15)+'</span>'+
                '<div class="guia-risk-body">'+
                  '<div class="guia-risk-name">'+r.label+'</div>'+
                  riskPill(r.val)+
                '</div>'+
              '</div>';
            }).join('')+
          '</div>'+
        '</div>'+
        '<div class="ai-warn" style="margin-top:14px">'+ia.avisoLegal+'</div>';
    } else if(t==='beneficiario'){
      d.innerHTML='<dl class="kv"><dt>Nome</dt><dd>'+esc(g.beneficiario.nome)+'</dd><dt>CPF</dt><dd>'+mask(g.beneficiario.cpf)+'</dd><dt>Cartão</dt><dd>'+mask(g.beneficiario.cartao)+'</dd><dt>Idade</dt><dd>'+g.beneficiario.idade+'</dd><dt>Plano</dt><dd>'+esc(g.beneficiario.plano)+'</dd><dt>Contrato</dt><dd>'+esc(g.beneficiario.contrato)+'</dd></dl>';
    } else if(t==='prestador'){
      d.innerHTML='<div class="g2"><div class="panel"><h3>Solicitante</h3><dl class="kv"><dt>Nome</dt><dd>'+esc(g.prestadorSol.nome)+'</dd><dt>Tipo</dt><dd>'+esc(g.prestadorSol.tipo)+'</dd></dl></div><div class="panel"><h3>Executante</h3><dl class="kv"><dt>Nome</dt><dd>'+esc(g.prestadorExe.nome)+'</dd><dt>Tipo</dt><dd>'+esc(g.prestadorExe.tipo)+'</dd></dl></div></div>';
    } else if(t==='solicitacao'){
      d.innerHTML='<dl class="kv"><dt>Tipo</dt><dd>'+esc(g.tipo)+'</dd><dt>Natureza</dt><dd>'+esc(g.natureza)+'</dd><dt>Regime</dt><dd>'+esc(g.regime)+'</dd><dt>Origem</dt><dd><span class="badge muted">'+esc(g.origem)+'</span></dd><dt>Observações</dt><dd>'+esc(g.observacoes)+'</dd></dl>';
    } else if(t==='etapas'){
      var tl=el('div',{class:'timeline'});
      g.etapas.forEach(function(e){
        var cls = e.status==='concluida'?'done':(e.status==='em_execucao'?'cur':'');
        tl.appendChild(el('div',{class:'tl-item '+cls},'<h4>'+e.ordem+'. '+esc(e.nome)+'</h4><div class="meta">Responsável: '+esc(e.responsavel)+' · Prazo: '+e.prazoHoras+'h · Status: <b>'+esc(e.status)+'</b>'+(e.inicio?' · Início: '+esc(e.inicio):'')+(e.fim?' · Fim: '+esc(e.fim):'')+'</div>'));
      });
      d.appendChild(tl);
    } else if(t==='procedimentos'||t==='pacotes'||t==='matmed'||t==='diariastaxas'){
      var arr = t==='procedimentos'?g.procedimentos:(t==='pacotes'?g.pacotes:(t==='matmed'?g.matmed:g.diariasTaxas));
      if(!arr.length) d.innerHTML='<div class="empty"><div class="ico">'+icoLg('folder-open')+'</div>Sem itens vinculados. <br><span style="font-size:12px">Sem parametrização cadastrada.</span></div>';
      else {
        var tt=el('table'); tt.innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>Peso</th><th>Flags</th></tr></thead>';
        var tb=el('tbody');
        arr.forEach(function(p){
          var fl=''; if(p.dut) fl+='<span class="badge warn">DUT</span> '; if(p.opme) fl+='<span class="badge warn">OPME</span> '; if(p.obrig) fl+='<span class="badge">Obrigatório</span>';
          tb.appendChild(el('tr',{},'<td>'+esc(p.cod)+'</td><td>'+esc(p.desc)+'</td><td>'+p.peso+'</td><td>'+fl+'</td>'));
        });
        tt.appendChild(tb); d.appendChild(tt);
      }
    } else if(t==='opme'){
      var opmes=g.matmed.filter(function(m){return m.opme});
      if(!opmes.length) d.innerHTML='<div class="empty"><div class="ico">'+icoLg('activity')+'</div>Sem OPME nesta guia.</div>';
      else { var tt2=el('table'); tt2.innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>Peso</th></tr></thead>'; var tb2=el('tbody'); opmes.forEach(function(p){tb2.appendChild(el('tr',{},'<td>'+p.cod+'</td><td>'+p.desc+'</td><td>'+p.peso+'</td>'))}); tt2.appendChild(tb2); d.appendChild(tt2); }
    } else if(t==='anexos'){
      d.appendChild(renderAnexos(g));
    } else if(t==='historico'){
      var _histKey='regula_hist_'+g.numero;
      var _histSaved=localStorage.getItem(_histKey);
      var _histDefault='Beneficiário possui '+(2+(g.beneficiario.idade%4))+' atendimentos anteriores nos últimos 24 meses. Última internação: 2025-11-20. Sem reincidências críticas identificadas.';
      var _histVal=_histSaved||g.historico||_histDefault;
      var _panel=el('div',{class:'panel'});
      _panel.innerHTML='<div class="field-lbl-row" style="margin-bottom:8px"><h3 style="margin:0">Histórico e tratamentos anteriores</h3><span style="font-size:11px;color:var(--muted)">Editável · salvo automaticamente</span></div>';
      var _ta=el('textarea',{id:'histTA',style:'width:100%;min-height:120px;resize:vertical;padding:10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;line-height:1.5'},null);
      _ta.value=_histVal;
      _ta.oninput=function(){ g.historico=this.value; localStorage.setItem(_histKey,this.value); };
      _panel.appendChild(_ta);
      d.appendChild(_panel);
    } else if(t==='criticas'){
      var u=el('ul',{class:'ai-list'});
      if(!ia.alertas.length) u.innerHTML='<li>Nenhuma crítica relevante.</li>';
      else ia.alertas.forEach(function(a){ u.appendChild(el('li',{},ico('triangle-alert')+' '+esc(a))) });
      d.appendChild(u);
    } else if(t==='ia'){
      d.appendChild(renderParecerIA(ia,g));
    } else if(t==='operadora'){
      if(!g.parecerOperadora) d.innerHTML='<div class="empty"><div class="ico">'+icoLg('file-pen-line')+'</div>Nenhum parecer da operadora registrado.<br><br>'+(can('parecer')?'<button class="btn" id="emPar">Emitir parecer agora</button>':'')+'</div>';
      else {
        var p=g.parecerOperadora;
        d.innerHTML='<div class="ai-box"><div class="hd"><div class="tt">Parecer da Operadora</div><span class="badge dark">'+esc(p.decisao)+'</span></div><dl class="kv"><dt>Motivo</dt><dd>'+esc(p.motivo||'—')+'</dd><dt>Justificativa</dt><dd>'+esc(p.justificativa||'—')+'</dd><dt>Observações impressas</dt><dd>'+esc(p.obsImp||'—')+'</dd><dt>Observações não impressas</dt><dd>'+esc(p.obsInt||'—')+'</dd><dt>Emitido por</dt><dd>'+esc(p.user)+' · '+esc(p.ts)+'</dd></dl></div>';
      }
      setTimeout(function(){ var b2=d.querySelector('#emPar'); if(b2) b2.onclick=function(){openParecer(g)}; },0);
    } else if(t==='logs'){
      var ul2=el('div');
      MOCK.LOGS.filter(function(l){return l.ref.indexOf(g.numero)>=0}).forEach(function(l){
        ul2.appendChild(el('div',{style:'padding:8px;border-bottom:1px solid var(--line);font-size:12.5px'},'<b>'+esc(l.ts)+'</b> · '+esc(l.user)+' ('+esc(l.perfil)+') — '+esc(l.acao)+' <span style="color:var(--muted)">— '+esc(l.ref)+'</span>'));
      });
      if(!ul2.children.length) ul2.innerHTML='<div class="empty"><div class="ico">'+icoLg('scroll')+'</div>Sem logs específicos desta guia.</div>';
      d.appendChild(ul2);
    }
    return d;
  }

  /* === Gestão de Anexos === */
  function logAcao(acao, ref){
    var ts=new Date().toISOString().slice(0,16).replace('T',' ');
    MOCK.LOGS.unshift({ts:ts,user:perfilDef[State.perfil].nome,perfil:State.perfil,acao:acao,ref:ref});
  }
  function anxIcon(tipo){
    if(tipo==='img') return ico('image',20);
    if(tipo==='pdf') return ico('file-text',20);
    return ico('paperclip',20);
  }
  function catColor(cat){
    var map={'Guia TISS':'info','Laudo médico':'','Exame complementar':'info','Relatório clínico':'muted','Histórico/Prontuário':'muted','Justificativa técnica':'warn','DUT/Evidência':'warn','OPME — orçamento':'warn','Termo de consentimento':'dark','Outros':'muted'};
    return map[cat]||'muted';
  }
  function renderAnexos(g){
    var wrap=el('div');
    if(!g.anexosLista.length){ wrap.innerHTML='<div class="empty"><div class="ico">'+icoLg('paperclip')+'</div>Sem anexos enviados pelo prestador.</div>'; return wrap; }

    // Resumo por categoria
    var resumo={}; g.anexosLista.forEach(function(a){ resumo[a.categoria]=(resumo[a.categoria]||0)+1; });
    var totalAnot=0; g.anexosLista.forEach(function(a){ totalAnot+=(a.anotacoes||[]).length; });
    var chips=Object.keys(resumo).map(function(k){return '<span class="badge '+catColor(k)+'" style="margin:2px">'+esc(k)+' · '+resumo[k]+'</span>'}).join('');
    var head=el('div',{class:'panel',style:'margin-bottom:10px'},
      '<h3>Gestão de Anexos <span class="badge muted">'+g.anexosLista.length+' arquivos</span> <span class="badge info">'+totalAnot+' anotações</span></h3>'+
      '<div style="margin-top:6px">'+chips+'</div>'+
      '<div style="margin-top:8px;font-size:12px;color:var(--muted)">Visualize, categorize e anote cada documento. Todas as ações ficam registradas nos logs da guia.</div>');
    wrap.appendChild(head);

    // Filtro
    var filtroBar=el('div',{style:'display:flex;gap:8px;align-items:center;margin-bottom:8px'});
    var optsCat='<option value="">Todas as categorias</option>'+MOCK.CATEGORIAS_ANEXO.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
    filtroBar.innerHTML='<input type="text" id="anxQ" placeholder="Buscar por nome..." style="flex:1;padding:8px;border:1px solid var(--line);border-radius:8px"/><select id="anxCat" style="padding:8px;border:1px solid var(--line);border-radius:8px">'+optsCat+'</select>';
    wrap.appendChild(filtroBar);

    var listWrap=el('div'); wrap.appendChild(listWrap);

    function rebuild(){
      listWrap.innerHTML='';
      var q=(wrap.querySelector('#anxQ').value||'').toLowerCase();
      var fc=wrap.querySelector('#anxCat').value;
      var arr=g.anexosLista.filter(function(a){ return (!q||a.nome.toLowerCase().indexOf(q)>=0) && (!fc||a.categoria===fc); });
      if(!arr.length){ listWrap.innerHTML='<div class="empty"><div class="ico">'+icoLg('search')+'</div>Nenhum anexo corresponde ao filtro.</div>'; lcIcons(); return; }
      arr.forEach(function(a){
        var nAnot=(a.anotacoes||[]).length;
        var card=el('div',{style:'padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:#fff'});
        card.innerHTML=
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
            '<div style="font-size:22px;line-height:1">'+anxIcon(a.tipo)+'</div>'+
            '<div style="flex:1;min-width:200px">'+
              '<div style="font-weight:600">'+esc(a.nome)+'</div>'+
              '<div style="font-size:12px;color:var(--muted)">'+esc(a.tamanho)+' · '+a.paginas+' pág. · enviado em '+esc(a.enviadoEm)+'</div>'+
            '</div>'+
            '<span class="badge '+catColor(a.categoria)+'">'+esc(a.categoria)+'</span>'+
            '<span class="badge muted">'+a.tipo.toUpperCase()+'</span>'+
            (nAnot?'<span class="badge info">'+ico('message-circle',12)+' '+nAnot+'</span>':'')+
            '<div style="display:flex;gap:6px">'+
              '<button class="btn sm" data-act="ver">'+ico('eye')+' Visualizar</button>'+
              '<button class="btn sm ghost" data-act="cat">'+ico('tag')+' Categorizar</button>'+
              '<button class="btn sm ghost" data-act="anot">'+ico('message-circle')+' Anotar</button>'+
            '</div>'+
          '</div>';
        if(nAnot){
          var last=a.anotacoes.slice(-2);
          var notes=el('div',{style:'margin-top:8px;border-top:1px dashed var(--line);padding-top:6px'});
          last.forEach(function(n){
            notes.appendChild(el('div',{style:'font-size:12px;margin-top:4px'},'<b>'+esc(n.user)+'</b> <span style="color:var(--muted)">· '+esc(n.ts)+'</span><br>'+esc(n.texto)));
          });
          if(nAnot>2) notes.appendChild(el('div',{style:'font-size:11px;color:var(--muted);margin-top:4px'},'+ '+(nAnot-2)+' anotação(ões) anterior(es)'));
          card.appendChild(notes);
        }
        card.querySelector('[data-act="ver"]').onclick=function(){ openAnexoViewer(g,a); };
        card.querySelector('[data-act="cat"]').onclick=function(){ openAnexoCategoria(g,a,rebuild); };
        card.querySelector('[data-act="anot"]').onclick=function(){ openAnexoAnotacao(g,a,rebuild); };
        listWrap.appendChild(card);
      });
      lcIcons();
    }
    rebuild();
    wrap.querySelector('#anxQ').oninput=rebuild;
    wrap.querySelector('#anxCat').onchange=rebuild;
    return wrap;
  }

  function openAnexoViewer(g, a){
    var preview = a.tipo==='img'
      ? '<div style="background:#f1f5f4;border:1px dashed var(--line);border-radius:10px;height:340px;display:flex;align-items:center;justify-content:center;color:var(--muted)"><div style="text-align:center"><div style="font-size:48px;line-height:1">'+ico('image',48)+'</div><div style="margin-top:12px">Pré-visualização simulada da imagem</div><div style="font-size:12px">'+esc(a.nome)+'</div></div></div>'
      : '<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;height:340px;overflow:auto;font-family:Georgia,serif;font-size:13px;line-height:1.5"><div style="text-align:center;font-weight:700;margin-bottom:8px">'+esc(a.nome)+'</div><hr/><p><b>Beneficiário:</b> '+esc(g.beneficiario.nome)+'</p><p><b>Procedimento:</b> '+esc(g.tipo)+'</p><p><b>Conteúdo simulado — '+a.paginas+' páginas.</b> Este visualizador exibe uma representação do documento enviado. Em produção, o arquivo será carregado via endpoint <code>GET /api/solus/anexo.php?id='+esc(a.id)+'</code>.</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p></div>';
    var anotHTML = (a.anotacoes||[]).length
      ? '<div style="max-height:220px;overflow:auto">'+a.anotacoes.map(function(n){return '<div style="padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:#fafdfb"><div style="font-size:12px;color:var(--muted)"><b>'+esc(n.user)+'</b> · '+esc(n.ts)+' · <span class="badge muted">'+esc(n.tag||'comentário')+'</span></div><div style="margin-top:4px">'+esc(n.texto)+'</div></div>'}).join('')+'</div>'
      : '<div class="empty" style="padding:14px"><div class="ico">'+icoLg('message-circle')+'</div>Sem anotações.</div>';
    var body='<div class="g2"><div>'+preview+'<div style="margin-top:8px;font-size:12px;color:var(--muted)">'+esc(a.tamanho)+' · '+a.paginas+' pág. · enviado em '+esc(a.enviadoEm)+'</div></div>'+
      '<div><div class="panel" style="margin:0"><h3>Categoria <span class="badge '+catColor(a.categoria)+'">'+esc(a.categoria)+'</span></h3></div>'+
      '<div class="panel" style="margin-top:8px"><h3>Anotações ('+(a.anotacoes||[]).length+')</h3>'+anotHTML+
      '<div class="field" style="margin-top:8px"><label>Nova anotação rápida</label><textarea id="anxNew" placeholder="Comente sobre este documento..."></textarea></div>'+
      '<div style="display:flex;gap:6px;align-items:center"><select id="anxTag" style="padding:6px;border:1px solid var(--line);border-radius:6px"><option>comentário</option><option>pendência</option><option>conformidade</option><option>solicitar reenvio</option></select><button class="btn sm" id="anxSalvar">'+ico('save')+' Salvar anotação</button></div>'+
      '</div></div></div>';
    var foot='<button class="btn ghost" id="anxFechar">Fechar</button>';
    var m=modal('Visualizar anexo · '+esc(a.nome), 'Guia '+esc(g.numero)+' · categoria atual: '+esc(a.categoria), body, foot);
    m.querySelector('#anxFechar').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#anxSalvar').onclick=function(){
      var txt=m.querySelector('#anxNew').value.trim(); if(!txt){ toast('Escreva uma anotação','warn'); return; }
      var tag=m.querySelector('#anxTag').value;
      var nota={user:perfilDef[State.perfil].nome,perfil:State.perfil,ts:new Date().toISOString().slice(0,16).replace('T',' '),texto:txt,tag:tag};
      a.anotacoes=(a.anotacoes||[]).concat([nota]); persistAnexo(a);
      logAcao('Anotação em anexo ('+tag+')', g.numero+' · '+a.nome+' — '+txt.slice(0,60));
      toast('Anotação registrada nos logs','ok'); m.parentNode.remove(); openAnexoViewer(g,a);
    };
  }

  function openAnexoCategoria(g, a, refresh){
    var body='<div class="field"><label>Categoria do documento</label><select id="anxCatSel">'+MOCK.CATEGORIAS_ANEXO.map(function(c){return '<option'+(c===a.categoria?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>'+
      '<div class="field"><label>Justificativa (opcional)</label><textarea id="anxCatJust" placeholder="Por que esta classificação?"></textarea></div>';
    var foot='<button class="btn ghost" id="cc">Cancelar</button><button class="btn" id="cs">'+ico('save')+' Salvar categoria</button>';
    var m=modal('Categorizar anexo', esc(a.nome), body, foot);
    m.querySelector('#cc').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#cs').onclick=function(){
      var nova=m.querySelector('#anxCatSel').value; var just=m.querySelector('#anxCatJust').value.trim();
      var antiga=a.categoria; if(nova===antiga && !just){ toast('Nenhuma alteração','warn'); return; }
      a.categoria=nova; persistAnexo(a);
      logAcao('Recategorização de anexo', g.numero+' · '+a.nome+' · '+antiga+' → '+nova+(just?' — '+just:''));
      if(just){
        a.anotacoes=(a.anotacoes||[]).concat([{user:perfilDef[State.perfil].nome,perfil:State.perfil,ts:new Date().toISOString().slice(0,16).replace('T',' '),texto:'[Recategorização] '+antiga+' → '+nova+'. '+just,tag:'categoria'}]);
        persistAnexo(a);
      }
      toast('Categoria atualizada','ok'); m.parentNode.remove(); if(refresh) refresh();
    };
  }

  function openAnexoAnotacao(g, a, refresh){
    var lista=(a.anotacoes||[]).map(function(n){return '<div style="padding:8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:#fafdfb"><div style="font-size:12px;color:var(--muted)"><b>'+esc(n.user)+'</b> · '+esc(n.ts)+' · <span class="badge muted">'+esc(n.tag||'comentário')+'</span></div><div style="margin-top:4px">'+esc(n.texto)+'</div></div>'}).join('')||'<div class="empty" style="padding:14px"><div class="ico">'+icoLg('message-circle')+'</div>Sem anotações.</div>';
    var body='<div style="max-height:240px;overflow:auto;margin-bottom:8px">'+lista+'</div>'+
      '<div class="field"><label>Nova anotação</label><textarea id="aN" placeholder="Escreva um comentário técnico, pendência ou observação..."></textarea></div>'+
      '<div class="field"><label>Tipo</label><select id="aT"><option>comentário</option><option>pendência</option><option>conformidade</option><option>solicitar reenvio</option></select></div>';
    var foot='<button class="btn ghost" id="ac">Fechar</button><button class="btn" id="as">'+ico('save')+' Adicionar anotação</button>';
    var m=modal('Anotações do anexo', esc(a.nome)+' · '+esc(a.categoria), body, foot);
    m.querySelector('#ac').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#as').onclick=function(){
      var txt=m.querySelector('#aN').value.trim(); if(!txt){ toast('Escreva uma anotação','warn'); return; }
      var tag=m.querySelector('#aT').value;
      a.anotacoes=(a.anotacoes||[]).concat([{user:perfilDef[State.perfil].nome,perfil:State.perfil,ts:new Date().toISOString().slice(0,16).replace('T',' '),texto:txt,tag:tag}]);
      persistAnexo(a);
      logAcao('Anotação em anexo ('+tag+')', g.numero+' · '+a.nome+' — '+txt.slice(0,60));
      toast('Anotação registrada nos logs','ok'); m.parentNode.remove(); openAnexoAnotacao(g,a,refresh);
      if(refresh) refresh();
    };
  }


  function renderParecerIA(ia, g){
    // ── feedback persistido por guia ─────────────────────
    var fbKey='regula_ia_fb_'+(g?g.numero:'x');
    var confirmacoes={};
    try{confirmacoes=JSON.parse(localStorage.getItem(fbKey)||'{}');}catch(e){}
    function saveConf(){try{localStorage.setItem(fbKey,JSON.stringify(confirmacoes));}catch(e){}}

    // ── aderência ajustada pelas correções do analista ───
    function calcAdp(){
      var base=ia.aderencia;
      var cum=ia.criteriosCumpridos||[];
      var n=cum.length, rej=0;
      var cC=confirmacoes.criteriosCumpridos||[];
      for(var i=0;i<n;i++){if(cC[i]===false)rej++;}
      var adj=n?base*(n-rej)/n:base;
      var als=ia.alertas||[];
      var aC=confirmacoes.alertas||[];
      for(var j=0;j<als.length;j++){if(aC[j]===false)adj=Math.min(100,adj+1.5);}
      return Math.max(0,Math.round(adj));
    }

    var d=el('div');

    // ── caixa de cabeçalho ────────────────────────────────
    var box=el('div',{class:'ai-box'});
    var hd=el('div',{class:'hd'});
    var tt=el('div',{class:'tt'});
    tt.innerHTML=ico('sparkles')+' Parecer Técnico <span class="badge muted">Confiança '+Math.round(ia.confianca)+'%</span>';
    hd.appendChild(tt);
    var adpWrap=el('div',{class:'ia-adp-wrap'});
    adpWrap.innerHTML=aderenciaBar(calcAdp());
    hd.appendChild(adpWrap);
    box.appendChild(hd);
    var pEl=el('p',{style:'margin:6px 0 0'});
    pEl.textContent=ia.parecerGeral;
    box.appendChild(pEl);
    var warnEl=el('div',{class:'ai-warn'});
    warnEl.innerHTML=ia.avisoLegal;
    box.appendChild(warnEl);
    d.appendChild(box);

    function updateAdp(){
      adpWrap.innerHTML=aderenciaBar(calcAdp());
    }

    // ── nota informativa ──────────────────────────────────
    var noteEl=el('div',{class:'ia-confirm-note'});
    noteEl.innerHTML=ico('info',13)+' <span>Cada item abaixo foi identificado pela IA. <b>Desmarque</b> aqueles que não foram cumpridos ou que a IA avaliou incorretamente — as correções são registradas nos logs e contribuem para o aprendizado contínuo do sistema.</span>';
    d.appendChild(noteEl);

    // ── checkbox por item ─────────────────────────────────
    function makeItem(text, secKey, idx, secLabel){
      var li=el('li',{class:'ia-item'});
      var conf=confirmacoes[secKey]||[];
      var checked=conf[idx]!==false;
      if(!checked) li.classList.add('ia-item--rejected');
      var lbl=document.createElement('label');
      lbl.className='ia-chk';
      lbl.title='Confirmado pela IA. Desmarque caso o item não tenha sido cumprido ou a análise esteja incorreta.';
      var inp=document.createElement('input');
      inp.type='checkbox'; inp.className='ia-chk__input'; inp.checked=checked;
      var bx=document.createElement('span');
      bx.className='ia-chk__box';
      bx.innerHTML='<svg class="ia-chk__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      lbl.appendChild(inp); lbl.appendChild(bx);
      inp.onchange=(function(sk,ix,sl,tx){
        return function(){
          if(!confirmacoes[sk]) confirmacoes[sk]=[];
          confirmacoes[sk][ix]=this.checked;
          var liEl=this.parentNode.parentNode;
          if(this.checked) liEl.classList.remove('ia-item--rejected');
          else liEl.classList.add('ia-item--rejected');
          saveConf(); updateAdp();
          var ts2=new Date().toISOString().slice(0,16).replace('T',' ');
          var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
          var shortTx=tx.length>55?tx.slice(0,55)+'…':tx;
          var logRef='Guia '+(g?g.numero:'')+(sl?' · '+sl:'')+' · '+shortTx;
          MOCK.LOGS.unshift({ts:ts2,user:uName,perfil:State.perfil,tipo:'correcao_ia',
            acao:this.checked?'Correção IA revertida — item reconfirmado':'Item do Parecer Técnico IA contestado',
            ref:logRef});
        };
      })(secKey,idx,secLabel,text);
      li.appendChild(lbl);
      li.appendChild(document.createTextNode(text));
      return li;
    }

    // ── seção com checkboxes ──────────────────────────────
    function section(title, arr, icoName, secKey){
      if(!arr||!arr.length) return null;
      var s=el('div',{class:'ai-section'});
      s.innerHTML='<h5>'+ico(icoName)+' '+title+'</h5>';
      var u=el('ul',{class:'ai-list ia-list-chk'});
      arr.forEach(function(x,i){ u.appendChild(makeItem(x,secKey,i,title)); });
      s.appendChild(u); return s;
    }

    var grid=el('div',{class:'g2',style:'gap:20px'});
    var c1=el('div'); var c2=el('div');
    [section('Critérios cumpridos',   ia.criteriosCumpridos,   'check-circle-2','criteriosCumpridos'),
     section('Critérios não cumpridos',ia.criteriosNaoCumpridos,'x-circle',      'criteriosNaoCumpridos'),
     section('Critérios não avaliados',ia.criteriosNaoAvaliados,'minus-circle',  'criteriosNaoAvaliados')].forEach(function(s){if(s)c1.appendChild(s);});
    [section('Pendências documentais',   ia.pendencias,          'clipboard-list', 'pendencias'),
     section('Alertas de inconsistência',ia.alertas,             'triangle-alert', 'alertas'),
     section('Tópicos relevantes para o auditor',ia.topicosAuditor,'target',       'topicosAuditor'),
     section('Sugestões de questionamentos',ia.sugestoesArgumentos,'message-square','sugestoesArgumentos')].forEach(function(s){if(s)c2.appendChild(s);});
    grid.appendChild(c1); grid.appendChild(c2); d.appendChild(grid);

    var foot=el('div',{class:'ai-box',style:'margin-top:10px'});
    foot.innerHTML='<div class="hd"><div class="tt">Próxima ação sugerida</div><span class="badge dark">'+esc(ia.proximaAcao)+'</span></div>'+
      '<div class="ai-section"><h5>Regras aplicadas</h5><div>'+ia.regrasAplicadas.map(function(r){return '<span class="badge" style="margin:2px">'+esc(r)+'</span>'}).join('')+'</div></div>'+
      (ia.regrasNaoAvaliadas.length?'<div class="ai-section"><h5>Regras não avaliadas (sem parametrização)</h5><ul class="ai-list">'+ia.regrasNaoAvaliadas.map(function(r){return '<li>'+esc(r)+'</li>'}).join('')+'</ul></div>':'')+
      '<div class="ai-section"><h5>Justificativa do cálculo</h5><code style="font-size:12px;white-space:pre;display:block;line-height:1.7">'+esc(ia.justificativaCalculo)+'</code></div>';
    d.appendChild(foot);

    // ── campo de observação ao auditor ────────────────────
    var obsKey='regula_ia_obs_'+(g?g.numero:'x');
    var obsVal='';
    try{ obsVal=localStorage.getItem(obsKey)||''; }catch(e){}
    var obsBox=el('div',{class:'ia-obs-box'});
    obsBox.innerHTML=
      '<div class="ia-obs-hd">'+ico('message-square-text',13)+
        ' <span>Observações para a IA</span>'+
        '<span class="ia-obs-hint">Descreva inconsistências, contexto clínico ou orientações — serão consideradas no próximo Reprocessar.</span>'+
      '</div>'+
      '<textarea id="iaObsInput" class="ia-obs-ta" placeholder="Ex.: Paciente com histórico de comorbidades não listadas, procedimento justificado por laudo em anexo...">'+esc(obsVal)+'</textarea>'+
      '<div class="ia-obs-foot">'+
        '<button class="btn sm ghost" id="iaObsSave">'+ico('save',12)+' Salvar observação</button>'+
        '<span class="ia-obs-saved" id="iaObsSaved" style="display:none">'+ico('check',12)+' Salvo</span>'+
      '</div>';
    d.appendChild(obsBox);

    setTimeout(function(){
      var ta=document.getElementById('iaObsInput');
      var btn=document.getElementById('iaObsSave');
      var saved=document.getElementById('iaObsSaved');
      if(btn&&ta) btn.onclick=function(){
        try{ localStorage.setItem(obsKey,ta.value); }catch(e){}
        if(saved){ saved.style.display='inline-flex'; setTimeout(function(){ saved.style.display='none'; },2000); }
        var ts2=new Date().toISOString().slice(0,16).replace('T',' ');
        var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
        MOCK.LOGS.unshift({ts:ts2,user:uName,perfil:State.perfil,tipo:'correcao_ia',
          acao:'Observação ao Parecer IA registrada',ref:'Guia '+(g?g.numero:'')});
      };
    },0);

    return d;
  }

  function openParecer(g){
    if(!can('parecer')){ toast('Seu perfil não pode emitir parecer','warn'); return; }
    var ia = g._cache || AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
    var body='<div class="field"><label>Decisão</label><select id="pDec"><option value="Aprovação">Aprovação</option><option value="Aprovação com ressalva">Aprovação com ressalva</option><option value="Reprovação">Reprovação</option><option value="Solicitar complemento">Solicitar complemento</option><option value="Encaminhar para junta médica">Encaminhar para junta médica</option></select></div>'+
      '<div class="field"><label>Motivo padronizado</label><select id="pMot"></select></div>'+
      '<div class="field"><div class="field-lbl-row"><label>Justificativa técnica</label><button class="btn sm ghost" id="pJustIA" type="button">'+ico('sparkles')+' Gerar análise técnica</button></div><textarea id="pJust" placeholder="Descreva a justificativa técnica..."></textarea></div>'+
      '<div class="g2"><div class="field"><label>Observações impressas (vão para o prestador)</label><textarea id="pImp"></textarea></div><div class="field"><label>Observações não impressas (internas)</label><textarea id="pInt"></textarea></div></div>'+
      '<div class="ai-box"><div class="hd"><div class="tt">'+ico('lightbulb')+' Sugestão técnica</div></div><p style="margin:6px 0">'+esc(ia.parecerGeral)+'</p><button class="btn sm ghost" id="usarIA">Usar sugestão</button></div>';
    var foot='<button class="btn ghost" id="pCancel">Cancelar</button><button class="btn" id="pSalvar">'+ico('save')+' Salvar parecer</button>';
    var m = modal('Parecer da Operadora · '+esc(g.numero), 'A decisão final é exclusiva da operadora. A análise técnica atua apenas como apoio.', body, foot);

    function fillMot(){
      var dec=m.querySelector('#pDec').value;
      var list = dec.indexOf('Reprov')>=0?MOCK.MOTIVOS_REPR:(dec.indexOf('complemento')>=0?MOCK.MOTIVOS_COMP:MOCK.MOTIVOS_RESS);
      m.querySelector('#pMot').innerHTML = list.map(function(x){return '<option>'+esc(x)+'</option>'}).join('');
    }
    fillMot(); m.querySelector('#pDec').onchange=fillMot;
    m.querySelector('#usarIA').onclick=function(){ m.querySelector('#pJust').value = ia.parecerGeral+'\n\nSugestões: '+ia.sugestoesArgumentos.join(' / '); toast('Sugestão aplicada','ok'); };
    m.querySelector('#pJustIA').onclick=function(){
      var btn=this;
      btn.innerHTML=ico('loader')+' Gerando…'; btn.disabled=true;
      var _pl2=document.getElementById('pageLoader');
      if(_pl2) _pl2.classList.add('pl--transp');
      document.body.classList.add('pl--blurring');
      showPageLoader();
      setTimeout(function(){
        function _limpa(s){ return s.replace(/A IA recomenda como próxima ação:/gi,'Conduta técnica sugerida:').replace(/\s*\(sugestão IA\)/gi,'').replace(/\bA IA\b/gi,'A análise').replace(/\bIA\b/g,'análise técnica'); }
        var linhas=[];
        linhas.push('Guia '+g.numero+' — '+g.tipo+' ('+g.regime+') — Beneficiário: '+g.beneficiario.nome+'.');
        linhas.push(_limpa(ia.parecerGeral));
        if(ia.criteriosCumpridos.length) linhas.push('Critérios cumpridos: '+ia.criteriosCumpridos.join('; ')+'.');
        if(ia.criteriosNaoCumpridos.length) linhas.push('Critérios não cumpridos: '+ia.criteriosNaoCumpridos.join('; ')+'.');
        if(ia.pendencias.length) linhas.push('Pendências: '+ia.pendencias.join('; ')+'.');
        if(ia.alertas.length) linhas.push('Alertas: '+ia.alertas.join('; ')+'.');
        linhas.push('Conduta recomendada: '+_limpa(ia.proximaAcao)+'.');
        if(ia.sugestoesArgumentos.length) linhas.push('Pontos de atenção: '+ia.sugestoesArgumentos.join(' / ')+'.');
        linhas.push('Aderência regulatória apurada: '+ia.aderencia+'% ('+ia.classificacao.label+').');
        m.querySelector('#pJust').value=linhas.join('\n\n');
        btn.innerHTML=ico('sparkles')+' Gerar análise técnica'; btn.disabled=false;
        lcIcons();
        hidePageLoader();
        document.body.classList.remove('pl--blurring');
        setTimeout(function(){ if(_pl2) _pl2.classList.remove('pl--transp'); },600);
        toast('Justificativa gerada. Revise antes de salvar.','ok');
      },500);
    };
    m.querySelector('#pCancel').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#pSalvar').onclick=function(){
      var dec=m.querySelector('#pDec').value;
      var obsImp=m.querySelector('#pImp').value;
      var obsInt=m.querySelector('#pInt').value;
      var par={decisao:dec, motivo:m.querySelector('#pMot').value, justificativa:m.querySelector('#pJust').value, obsImp:obsImp, obsInt:obsInt, user:perfilDef[State.perfil].nome, ts:new Date().toISOString().slice(0,16).replace('T',' ')};
      g.parecerOperadora=par;
      // Atualiza status
      if(dec==='Aprovação'||dec==='Aprovação com ressalva') g.status='Liberada';
      else if(dec==='Reprovação') g.status='Negada';
      else if(dec==='Solicitar complemento') g.status='Aguardando complemento';
      else if(dec==='Encaminhar para junta médica') g.status='Em junta médica';
      // Persiste parecer
      var sv=JSON.parse(localStorage.getItem('regula_pareceres')||'{}');
      sv[g.numero]=par; localStorage.setItem('regula_pareceres',JSON.stringify(sv));
      // Persiste feedback da IA — obs impressas e internas alimentam o aprendizado
      if(obsImp||obsInt){
        var obsKey='regula_ia_obs_'+g.numero;
        var obsAnterior='';
        try{ obsAnterior=localStorage.getItem(obsKey)||''; }catch(e){}
        var novaObs=obsAnterior;
        if(obsImp) novaObs+=(novaObs?'\n':'')+'[Parecer — obs. prestador]: '+obsImp;
        if(obsInt) novaObs+=(novaObs?'\n':'')+'[Parecer — obs. internas]: '+obsInt;
        try{ localStorage.setItem(obsKey,novaObs); }catch(e){}
      }
      // Invalida cache para forçar reanálise com contexto atualizado no próximo Reprocessar
      g._cache=null;
      MOCK.LOGS.unshift({ts:par.ts,user:par.user,perfil:State.perfil,acao:'Parecer da Operadora emitido',ref:g.numero+' → '+dec});
      if(obsImp||obsInt) MOCK.LOGS.unshift({ts:par.ts,user:par.user,perfil:State.perfil,tipo:'ia',acao:'Feedback ao modelo IA registrado via Parecer da Operadora',ref:'Guia '+g.numero});
      toast('Parecer salvo · '+g.status,'ok');
      m.parentNode.remove(); render();
    };
  }

  /* === Relógio dinâmico === */
  var DIAS_SEMANA=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  function atualizarRelogio(){
    var el=$('#topbarClock'); if(!el) return;
    var d=new Date();
    var dia=DIAS_SEMANA[d.getDay()];
    var dd=String(d.getDate()).padStart(2,'0');
    var mm=String(d.getMonth()+1).padStart(2,'0');
    var yyyy=d.getFullYear();
    var hh=String(d.getHours()).padStart(2,'0');
    var mi=String(d.getMinutes()).padStart(2,'0');
    var ss=String(d.getSeconds()).padStart(2,'0');
    el.innerHTML=dia+'<br>'+dd+'/'+mm+'/'+yyyy+' '+hh+':'+mi+':'+ss;
  }
  atualizarRelogio();
  setInterval(atualizarRelogio,1000);

  /* === Breadcrumb === */
  var ROUTE_LABELS={dashboard:'Dashboard',guias:'Guias',kanban:'Kanban',param:'Parametrização',logs:'Logs',config:'Configurações',manual:'Manual do Usuário'};
  function atualizarBreadcrumb(){
    var el=$('#topbarRoute'); if(!el) return;
    el.textContent=ROUTE_LABELS[State.route]||State.route;
  }

  /* === Tooltip global === */
  (function(){
    var tip=document.createElement('div');
    tip.className='gtip';
    tip.setAttribute('role','tooltip');
    document.body.appendChild(tip);
    var _mx=0,_my=0,_vis=false;

    function findTip(el){
      while(el&&el!==document.body){
        if(el.getAttribute){
          var v=el.getAttribute('data-tip')||el.getAttribute('title');
          if(v&&v.trim()){
            if(el.hasAttribute('title')){
              el.setAttribute('data-tip',el.getAttribute('title'));
              el.removeAttribute('title');
            }
            return el.getAttribute('data-tip');
          }
        }
        el=el.parentNode;
      }
      return null;
    }

    function pos(){
      var tw=tip.offsetWidth||180,th=tip.offsetHeight||36;
      var vw=window.innerWidth,vh=window.innerHeight,PAD=10;
      var tx=_mx-tw/2;
      if(tx<PAD) tx=PAD;
      if(tx+tw>vw-PAD) tx=vw-tw-PAD;
      var ty=_my-th-16;
      var below=ty<PAD;
      tip.classList.toggle('gtip--below',below);
      if(below) ty=_my+22;
      tip.style.left=tx+'px';
      tip.style.top=ty+'px';
      var arrLeft=Math.round(Math.max(10,Math.min(90,(_mx-tx)/tw*100)));
      tip.style.setProperty('--arr',arrLeft+'%');
    }

    function fabIsOpen(){
      var fw=document.getElementById('fabWrap'), up=document.getElementById('fabUserPick');
      return (fw&&fw.classList.contains('fab-open'))||(up&&up.style.display==='block');
    }
    document.addEventListener('mouseover',function(e){
      if(fabIsOpen()){_vis=false;tip.classList.remove('gtip--vis');return;}
      var txt=findTip(e.target);
      if(txt){tip.textContent=txt;_vis=true;tip.classList.add('gtip--vis');}
      else{_vis=false;tip.classList.remove('gtip--vis');}
    });
    document.addEventListener('mousemove',function(e){
      _mx=e.clientX;_my=e.clientY;
      if(_vis) pos();
    });
    document.addEventListener('mouseout',function(e){
      if(!findTip(e.relatedTarget)){_vis=false;tip.classList.remove('gtip--vis');}
    });
    document.addEventListener('scroll',function(){_vis=false;tip.classList.remove('gtip--vis');},true);
    document.addEventListener('click',function(){_vis=false;tip.classList.remove('gtip--vis');},true);
  })();

  // Fecha dropdowns do kanban ao clicar fora
  document.addEventListener('click', function(e){
    var t=e.target;
    while(t&&t!==document.body){
      if(t.classList&&t.classList.contains('k-flt-wrap')) return;
      t=t.parentNode;
    }
    var ds=document.querySelectorAll('.k-flt-drop');
    for(var i=0;i<ds.length;i++) ds[i].style.display='none';
  });

  /* === Manual do Usuário === */
  function viewManual(){
    if(!State.manualSec) State.manualSec='intro';
    var wrap=el('div',{class:'manual-wrap'});

    var SECS=[
      {id:'intro',      ico:'book-open',      label:'Introdução'},
      {id:'login',      ico:'lock',           label:'Login'},
      {id:'dashboard',  ico:'gauge',          label:'Dashboard'},
      {id:'guias',      ico:'file-check-2',   label:'Guias'},
      {id:'kanban',     ico:'kanban',         label:'Kanban'},
      {id:'param',      ico:'sliders',        label:'Parametrização'},
      {id:'logs',       ico:'history',        label:'Logs'},
      {id:'config',     ico:'wrench',         label:'Configurações'},
      {id:'perfis',     ico:'users',          label:'Perfis de Acesso'},
    ];

    // Sidebar de navegação
    var nav=el('nav',{class:'manual-nav'});
    nav.innerHTML='<div class="manual-nav-title">Conteúdo</div>';
    SECS.forEach(function(s){
      var a=el('a',{class:'manual-nav-item'+(State.manualSec===s.id?' active':'')});
      a.innerHTML=ico(s.ico,13)+' '+s.label;
      a.onclick=function(){ State.manualSec=s.id; render(); var b=document.querySelector('.manual-body'); if(b) b.scrollTop=0; };
      nav.appendChild(a);
    });
    // No mobile a nav é horizontal: rola o chip ativo para a vista após render
    setTimeout(function(){
      if(window.innerWidth>640) return;
      var navEl=document.querySelector('.manual-nav');
      var act=document.querySelector('.manual-nav-item.active');
      if(navEl && act) navEl.scrollLeft=act.offsetLeft-navEl.clientWidth/2+act.offsetWidth/2;
    },0);
    var btnPrint=el('button',{class:'manual-print-btn'});
    btnPrint.innerHTML=ico('printer',13)+' Imprimir / Exportar PDF';
    btnPrint.onclick=function(){ window.print(); };
    nav.appendChild(btnPrint);
    wrap.appendChild(nav);

    // Conteúdo principal
    var body=el('div',{class:'manual-body'});
    var sec=State.manualSec;

    if(sec==='intro'){
      body.innerHTML=
        manualHdr('Introdução ao RegulaAI Saúde','Visão geral da plataforma, perfis de acesso e navegação')+
        manualBox('O que é o RegulaAI Saúde?',
          '<p>O <b>RegulaAI Saúde</b> é uma plataforma de auditoria assistencial com apoio de Inteligência Artificial, desenvolvida para operadoras de saúde. Permite o gerenciamento completo do ciclo de auditoria de guias médicas — desde a triagem até o parecer final da operadora.</p>'+
          '<p>A plataforma integra fluxos assistenciais, regras DUT (Diretrizes de Utilização), análise técnica por IA, matriz de permissões por perfil e rastreabilidade completa de todas as ações.</p>')+
        manualGrid([
          {ico:'gauge',      title:'Dashboard',       desc:'Indicadores consolidados, KPIs e visão executiva do processo de auditoria.'},
          {ico:'file-check-2',title:'Guias',          desc:'Relação completa de guias com filtros avançados, abertura de detalhes e emissão de parecer.'},
          {ico:'kanban',     title:'Kanban',          desc:'Visualização por status em colunas, com filtros por UTI, regime e tipo.'},
          {ico:'sliders',    title:'Parametrização',  desc:'Configuração de fluxos, regras DUT, procedimentos, pacotes, Mat/Med e diárias.'},
          {ico:'history',    title:'Logs',            desc:'Rastreabilidade completa de ações de usuários e eventos do sistema e IA.'},
          {ico:'wrench',     title:'Configurações',   desc:'Classificação de risco, prazos por fluxo e matriz de permissões por perfil.'},
        ])+
        manualBox('Navegação',
          '<p>Use o <b>menu lateral esquerdo</b> para alternar entre as seções. O menu pode ser <b>recolhido</b> clicando no botão de seta no canto inferior do sidebar, exibindo apenas os ícones para economizar espaço.</p>'+
          '<p>No topo da tela, o <b>relógio</b> exibe data e hora em tempo real e o <b>chip de usuário</b> indica o perfil ativo. O botão <b>Sair</b> no rodapé do sidebar encerra a sessão.</p>');
    }

    else if(sec==='login'){
      body.innerHTML=
        manualHdr('Login e Sessão','Acesso à plataforma e gerenciamento de sessão')+
        manualBox('Acessar a plataforma',
          '<p>Ao abrir o RegulaAI, a tela de login é exibida automaticamente caso não haja sessão ativa. Preencha os campos <b>Login</b> e <b>Senha</b> e clique em <b>Entrar</b> ou pressione <kbd>Enter</kbd>.</p>'+
          manualScreen('login')+
          '<ul>'+
          '<li>A sessão é mantida mesmo após fechar o navegador.</li>'+
          '<li>Em caso de credenciais incorretas, uma mensagem de erro é exibida e o campo senha é limpo.</li>'+
          '</ul>')+
        manualBox('Encerrar sessão',
          '<p>Clique em <b>Sair</b> no rodapé do menu lateral esquerdo. Uma confirmação é solicitada antes de encerrar a sessão.</p>'+
          '<p>Ao sair, o token de sessão é removido e a tela de login é exibida novamente.</p>');
    }

    else if(sec==='dashboard'){
      body.innerHTML=
        manualHdr('Dashboard Executivo','Visão consolidada de auditoria assistencial e indicadores operacionais')+
        manualBox('Visão Geral',
          '<p>O Dashboard apresenta os principais indicadores do processo de auditoria em tempo real, com base nas guias visíveis para o perfil ativo.</p>'+
          manualScreen('dashboard'))+
        manualBox('Filtro de Período',
          '<p>No canto superior direito do título há um <b>seletor de período</b>. Por padrão, exibe os últimos <b>30 dias</b> a partir da data atual. O período pode ser alterado livremente — todas as métricas são recalculadas automaticamente.</p>')+
        manualBox('KPIs disponíveis',
          manualTable(['Indicador','Descrição'],[
            ['Total de guias','Quantidade total de guias no período filtrado'],
            ['Em análise','Guias com status "Em análise"'],
            ['Em junta médica','Guias encaminhadas para junta médica'],
            ['Aguardando complemento','Guias aguardando documentação adicional'],
            ['Analisadas','Guias com análise concluída'],
            ['Liberadas','Guias com parecer de aprovação'],
            ['Negadas','Guias com parecer de reprovação'],
            ['Com OPME','Guias que contêm itens OPME'],
            ['Cotação de OPME','Guias em processo de cotação'],
            ['Baixa aderência','Guias com aderência à DUT abaixo do limiar'],
            ['Tempo médio','Média de dias em auditoria no período'],
            ['Etapa com gargalo','Etapa com maior concentração de guias paradas'],
          ]))+
        manualBox('Ações nos KPIs',
          '<p>Clicar em qualquer card de KPI abre um modal com a <b>lista detalhada</b> das guias que compõem aquele indicador. A partir do modal é possível clicar em qualquer guia para abrir seus detalhes completos.</p>')+
        manualBox('Gráficos e Distribuições',
          '<p>Abaixo dos KPIs, o dashboard exibe:</p><ul>'+
          '<li><b>Distribuição por status</b> — barras horizontais com % por status</li>'+
          '<li><b>Fluxos mais utilizados</b> — ranking de fluxos por volume de guias</li>'+
          '<li><b>Duração dos subfluxos</b> — tempo médio por etapa de auditoria</li>'+
          '</ul><p><i>Dica: clique em uma barra de status ou fluxo para abrir a relação filtrada de guias.</i></p>');
    }

    else if(sec==='guias'){
      if(!State.manualGuiasTab) State.manualGuiasTab='lista';
      var GUIAS_TABS=[
        {id:'lista',   label:'Relação de Guias'},
        {id:'detalhe', label:'Detalhes da Guia'},
      ];
      var tabBar='<div class="manual-subtab-bar">';
      GUIAS_TABS.forEach(function(t){
        tabBar+='<button class="manual-subtab'+(State.manualGuiasTab===t.id?' active':'')+'" data-gtab="'+t.id+'">'+t.label+'</button>';
      });
      tabBar+='</div>';

      var gtab=State.manualGuiasTab;
      var guiasContent='';

      if(gtab==='lista'){
        guiasContent=
          manualBox('Visão Geral',
            '<p>A tela de Guias apresenta todas as guias acessíveis ao perfil ativo, com filtros em duas camadas: <b>Relação de guia</b> (filtros rápidos) e <b>Filtro aprofundado</b> (15 flags + 20 campos).</p>')+
          manualBox('Aba: Relação de guia — Filtros Rápidos',
            manualTable(['Filtro','Opções'],[
              ['Status','Em análise, Em junta médica, Aguardando complemento, Analisada, Liberada, Negada, Cotação de OPME'],
              ['Fluxo','Todos os fluxos cadastrados (F1–F9)'],
              ['Origem','Ambulatorial, Internação, Urgência etc.'],
              ['Risco','Baixo, Médio, Alto, Crítico'],
              ['Especialidade','Todas as especialidades médicas'],
              ['OPME','Sim / Não'],
              ['UTI','Sim / Não'],
              ['Regime','Ambulatorial / Internação'],
              ['Período de emissão','Seletor de data (De / Até)'],
            ]))+
          manualBox('Aba: Relação de guia — Tabela',
            '<p>As colunas da tabela são ordenáveis clicando no cabeçalho (▲ Asc / ▼ Desc / ⇅ Padrão). Colunas disponíveis: <b>Nº Guia, Beneficiário, Prestador, Tipo</b> e <b>Status</b>.</p>'+
            '<p><b>Atalhos de duplo-clique</b> em badges e células aplicam filtros rapidamente:</p>'+
            '<ul><li>Duplo-clique em badge <b>Congênere</b> → filtra por congênere</li>'+
            '<li>Duplo-clique em badge <b>Origem</b> → filtra por origem</li>'+
            '<li>Duplo-clique em badge de <b>Status</b> → filtra por status</li>'+
            '<li>Duplo-clique em badge de <b>Especialidade</b> → filtra por especialidade</li></ul>'+
            '<p>Os <b>chips</b> no topo da tabela exibem os filtros ativos. Clique no × de cada chip para removê-lo individualmente.</p>')+
          manualBox('Aba: Filtro aprofundado',
            '<p>Oferece 15 checkboxes de flags e 20 dropdowns para segmentação avançada. Após configurar os filtros, clique em <b>Pesquisar</b>. O botão <b>Limpar filtros</b> reseta todos os campos.</p>'+
            '<p>Exemplos de flags: OPME, UTI, Demanda judicial, Auditoria na origem, Inconsistência, DUT obrigatória, Documentação anexada.</p>')+
          manualBox('Exportar',
            '<p>O botão <b>Exportar</b> (topo direito) gera uma planilha Excel com duas abas: <b>Guias</b> (dados completos das guias filtradas) e <b>Indicadores</b> (métricas do conjunto).</p>');
      }

      else if(gtab==='detalhe'){
        if(!State.manualDetalheTab) State.manualDetalheTab='cabecalho';
        var DET_TABS=[
          {id:'cabecalho',    label:'Cabeçalho'},
          {id:'resumo',       label:'Resumo'},
          {id:'beneficiario', label:'Beneficiário'},
          {id:'prestador',    label:'Prestador'},
          {id:'solicitacao',  label:'Solicitação'},
          {id:'etapas',       label:'Etapas'},
          {id:'procedimentos',label:'Procedimentos'},
          {id:'pacotes',      label:'Pacotes'},
          {id:'matmed',       label:'Mat/Med'},
          {id:'diarias',      label:'Diárias/Taxas'},
          {id:'opme',         label:'OPME'},
          {id:'anexos',       label:'Anexos'},
          {id:'criticas',     label:'Críticas'},
          {id:'parecer_tec',  label:'Parecer Técnico'},
          {id:'parecer_op',   label:'Parecer Operadora'},
          {id:'historico',    label:'Histórico'},
          {id:'logs_guia',    label:'Logs'},
        ];
        var dtab=State.manualDetalheTab;
        var detTabBar='<div class="manual-det-tabbar">';
        DET_TABS.forEach(function(t){
          detTabBar+='<button class="manual-det-tab'+(dtab===t.id?' active':'')+'" data-dtab="'+t.id+'">'+t.label+'</button>';
        });
        detTabBar+='</div>';

        var CONTEUDO_DET={
          cabecalho:
            '<p>O topo do modal exibe o <b>número da guia</b>, o <b>badge de status</b>, o nome do beneficiário, o tipo de atendimento e o fluxo vinculado. O botão <b>×</b> no canto superior direito fecha o modal.</p>'+
            '<p>No rodapé ficam os botões de ação disponíveis conforme o perfil ativo:</p>'+
            manualTable(['Botão','Descrição'],[
              ['Reprocessar','Reexecuta a análise da IA para esta guia com os parâmetros atuais'],
              ['Parecer da Operadora','Abre o formulário de decisão oficial da operadora'],
            ]),
          resumo:
            '<p>Visão consolidada dos principais indicadores da guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['STATUS','Badge com o status atual da guia (Ex.: Em análise, Liberada, Negada)'],
              ['DIAS EM AUDITORIA','Número de dias desde a emissão até hoje'],
              ['ADERÊNCIA À DUT','Percentual de aderência às Diretrizes de Utilização — verde (alta), amarelo (moderada), laranja (baixa), vermelho (crítica)'],
              ['FLUXO','Nome do fluxo assistencial vinculado (Ex.: Auditoria Urgência/Emergência)'],
              ['NÚMERO','Número identificador da guia'],
              ['BENEFICIÁRIO','Nome completo e idade do paciente'],
              ['PLANO / CONTRATO','Nome do plano e código do contrato'],
              ['PRESTADOR SOLICITANTE','Prestador que abriu a solicitação'],
              ['PRESTADOR EXECUTANTE','Prestador que realizará o procedimento'],
              ['NATUREZA / REGIME','Natureza (Internação, Ambulatorial) e regime (Urgência, Eletivo)'],
              ['TIPO','Tipo da guia'],
              ['DATA EMISSÃO','Data de emissão da guia'],
            ])+
            '<p style="margin-top:12px"><b>Grid de Risco (4 dimensões):</b></p>'+
            manualTable(['Dimensão','Descrição'],[
              ['Regulatório','Urgência, UTI, OPME, prazo vencido etc.'],
              ['Assistencial','Complexidade do procedimento, oncologia'],
              ['Documental','Aderência à DUT e documentação apresentada'],
              ['Contratual','Cobertura contratual do plano para o procedimento'],
            ]),
          beneficiario:
            '<p>Dados completos do paciente titular da guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Nome','Nome completo do beneficiário'],
              ['CPF','CPF parcialmente mascarado (privacidade de dados)'],
              ['Cartão','Número do cartão do plano mascarado'],
              ['Idade','Calculada automaticamente pela data de nascimento'],
              ['Plano','Nome comercial do plano de saúde'],
              ['Contrato','Código do contrato empresarial ou individual'],
            ]),
          prestador:
            '<p>Dois painéis lado a lado com os prestadores envolvidos na guia:</p>'+
            manualTable(['Painel','Descrição'],[
              ['Prestador Solicitante','Nome e tipo do prestador que abriu a solicitação de autorização'],
              ['Prestador Executante','Nome e tipo do prestador que realizará o procedimento ou internação'],
            ]),
          solicitacao:
            '<p>Detalhes técnicos da solicitação médica:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Tipo','Tipo da guia (Internação, Ambulatorial, SADT etc.)'],
              ['Natureza','Eletivo, Urgência/Emergência, Acidente etc.'],
              ['Regime','Ambulatorial, Internação, Hospital-dia'],
              ['Origem','Canal de origem da solicitação (badge colorido)'],
              ['Observações','Texto livre com observações do solicitante'],
            ]),
          etapas:
            '<p>Timeline do fluxo de auditoria com status de cada etapa:</p>'+
            manualTable(['Status','Descrição'],[
              ['Concluída (verde)','Etapa finalizada — exibe data de início e fim'],
              ['Em execução (destaque)','Etapa em andamento — exibe início e prazo restante'],
              ['Pendente (cinza)','Etapa ainda não iniciada'],
            ])+
            '<p style="margin-top:10px">Cada etapa exibe: número de ordem, nome, responsável (Auditor / Enfermeiro), prazo em horas e datas de execução.</p>',
          procedimentos:
            '<p>Procedimentos vinculados à guia com suas configurações:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código TUSS ou interno do procedimento'],
              ['Descrição','Nome do procedimento'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o procedimento é obrigatório para o fluxo'],
              ['OPME','Se o item é classificado como OPME'],
              ['IA','Instrução personalizada para análise pela IA'],
              ['Status','Ativo ou Inativo na parametrização'],
            ]),
          pacotes:
            '<p>Pacotes assistenciais vinculados à guia:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código do pacote'],
              ['Descrição','Nome do pacote'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o pacote é obrigatório no fluxo'],
              ['IA','Instrução para a IA analisar este pacote'],
              ['Status','Ativo / Inativo'],
            ]),
          matmed:
            '<p>Materiais e medicamentos vinculados à guia:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código TUSS do material ou medicamento'],
              ['Descrição','Nome do item'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o item é obrigatório'],
              ['IA','Instrução específica para a IA'],
              ['Status','Ativo / Inativo'],
            ]),
          diarias:
            '<p>Diárias hospitalares e taxas vinculadas à guia:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código da diária ou taxa'],
              ['Descrição','Nome (Ex.: UTI Adulto, Taxa de Sala Cirúrgica)'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o item é obrigatório no fluxo'],
              ['IA','Instrução para a IA avaliar este item'],
              ['Status','Ativo / Inativo'],
            ]),
          opme:
            '<p>Órteses, Próteses e Materiais Especiais vinculados à guia:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código do item OPME'],
              ['Descrição','Nome do item'],
              ['Cotação','Status da cotação (Em cotação, Cotado, Aprovado)'],
              ['Peso','Pontuação no cálculo de risco'],
              ['Status','Ativo / Inativo'],
            ]),
          anexos:
            '<p>Documentos enviados junto à guia. Cada anexo exibe:</p>'+
            '<ul>'+
            '<li><b>Ícone</b> do tipo de arquivo (PDF, imagem etc.)</li>'+
            '<li><b>Nome</b>, tamanho, páginas e data de envio</li>'+
            '<li><b>Badge de categoria</b> (Ex.: Laudo médico, Receita, Exame)</li>'+
            '<li><b>Contador de anotações</b> do auditor</li>'+
            '</ul>'+
            manualTable(['Ação','Descrição'],[
              ['Visualizar','Abre o documento para leitura'],
              ['Categorizar','Define ou altera a categoria do documento'],
              ['Anotar','Adiciona anotações textuais ao documento'],
            ]),
          criticas:
            '<p>Inconsistências e alertas identificados automaticamente pela IA e pelas regras de negócio. Cada crítica contém:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Severidade','Crítica, Alta, Média ou Baixa'],
              ['Descrição','O que foi identificado como inconsistente ou suspeito'],
              ['Origem','Se a crítica foi gerada pela IA ou por regra de negócio'],
            ]),
          parecer_tec:
            '<p>Análise técnica gerada pela IA com base nas regras DUT e nos parâmetros configurados:</p>'+
            manualTable(['Elemento','Descrição'],[
              ['Badge de confiança','Percentual de confiança da análise (Ex.: Confiança 87%)'],
              ['Aderência','Barra visual com o percentual de aderência — ex.: 37 / 40 pts = 92%'],
              ['Parecer geral','Texto da conclusão técnica gerada pela IA'],
              ['Critérios cumpridos','Itens validados positivamente pela IA'],
              ['Alertas','Itens com potencial inconsistência ou risco'],
              ['Justificativa do Cálculo','Detalhamento ponto a ponto de como a aderência foi calculada'],
            ])+
            '<h4 style="margin:14px 0 6px">Teto de aderência dinâmico</h4>'+
            '<p>O <b>total de pontos possíveis</b> (teto) <b>não é fixo</b> — ele varia de guia para guia, pois representa a soma apenas dos critérios <b>aplicáveis àquela guia específica</b>:</p>'+
            '<ul style="margin:6px 0 10px">'+
            '<li><b>DUT</b> só entra no teto se a guia possui procedimentos sujeitos a DUT.</li>'+
            '<li><b>Pacotes, Mat/Med e Diárias/Taxas</b> só somam ao teto se a guia tiver esses itens vinculados.</li>'+
            '<li>Critérios não aplicáveis são sinalizados como "— (não aplicável)" na Justificativa.</li>'+
            '</ul>'+
            '<p>Exemplo: uma guia com DUT + procedimentos + contratual pode ter teto de 40 pts; outra com pacotes e Mat/Med pode ter teto de 55 pts. <b>Não compare denominadores entre guias diferentes.</b></p>'+
            '<p style="margin-top:10px"><b>Ação importante:</b> O auditor pode <b>desmarcar critérios</b> validados pela IA. Essa ação é registrada nos Logs como <b>"Correção IA"</b>, garantindo rastreabilidade da intervenção humana.</p>'+
            '<p style="margin-top:8px"><b>Campo de Observações:</b> Ao final do Parecer Técnico há um campo de texto onde o auditor pode registrar apontamentos. Ao clicar em <b>"Reprocessar"</b>, a IA recebe esses apontamentos, os itens desmarcados e o conteúdo do Parecer da Operadora como contexto de aprendizado.</p>',
          parecer_op:
            '<p>Formulário de decisão oficial da operadora sobre a guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Decisão','Aprovação / Aprovação com ressalva / Reprovação / Solicitar complemento / Encaminhar para junta médica'],
              ['Motivo','Justificativa da decisão'],
              ['Justificativa técnica','Texto técnico — pode ser gerado pela IA clicando em "Gerar análise técnica"'],
              ['Obs. para o Prestador','Observações a serem comunicadas ao prestador solicitante'],
              ['Obs. Internas','Observações internas da operadora (não visíveis ao prestador)'],
            ])+
            '<p style="margin-top:10px">Ao salvar, o <b>status da guia é atualizado automaticamente</b> e a ação é registrada nos logs.</p>',
          historico:
            '<p>Histórico cronológico de todas as movimentações da guia:</p>'+
            '<ul>'+
            '<li>Mudanças de status</li>'+
            '<li>Emissão de pareceres</li>'+
            '<li>Alterações de etapa</li>'+
            '<li>Ações realizadas por usuários</li>'+
            '</ul>'+
            '<p>Cada registro exibe: data/hora, usuário responsável, perfil e descrição da ação.</p>',
          logs_guia:
            '<p>Logs de rastreabilidade <b>específicos desta guia</b> — diferente da tela geral de Logs que exibe todos os registros do sistema.</p>'+
            '<p>Inclui tanto ações de usuários quanto eventos do sistema e da IA relacionados exclusivamente a esta guia:</p>'+
            '<ul>'+
            '<li>Análises da IA executadas</li>'+
            '<li>Correções manuais de critérios da IA</li>'+
            '<li>Alterações de parametrização aplicadas</li>'+
            '<li>Envio e categorização de anexos</li>'+
            '</ul>',
        };

        guiasContent=
          manualBox('Como abrir',
            '<p>Clique em qualquer linha da tabela de guias para abrir o modal de detalhes. O modal exibe todas as informações organizadas em <b>16 abas</b>. Selecione uma aba abaixo para ver a explicação detalhada.</p>')+
          '<div class="manual-det-wrap">'+
            detTabBar+
            '<div class="manual-det-body">'+
              (CONTEUDO_DET[dtab]||'')+'</div>'+
          '</div>';+

          manualBox('Aba: Resumo',
            '<p>Visão consolidada dos principais indicadores da guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['STATUS','Badge com o status atual da guia (Ex.: Em análise, Liberada, Negada)'],
              ['DIAS EM AUDITORIA','Número de dias desde a emissão da guia até hoje'],
              ['ADERÊNCIA À DUT','Percentual de aderência às Diretrizes de Utilização — exibido em verde (alta), amarelo (moderada), laranja (baixa) ou vermelho (crítica)'],
              ['FLUXO','Nome do fluxo assistencial vinculado à guia (Ex.: Auditoria Urgência/Emergência)'],
              ['NÚMERO','Número identificador da guia'],
              ['BENEFICIÁRIO','Nome completo e idade do paciente'],
              ['PLANO / CONTRATO','Nome do plano e código do contrato'],
              ['PRESTADOR SOLICITANTE','Nome do prestador que solicitou a autorização'],
              ['PRESTADOR EXECUTANTE','Nome do prestador que executará o procedimento'],
              ['NATUREZA / REGIME','Natureza do atendimento (Ex.: Internação) e regime (Ex.: Urgência, Eletivo)'],
              ['TIPO','Tipo da guia (Ex.: Internação, Ambulatorial)'],
              ['DATA EMISSÃO','Data em que a guia foi emitida'],
            ])+
            '<p style="margin-top:12px">Abaixo dos dados cadastrais, um <b>grid de 4 cards</b> exibe os níveis de risco por dimensão:</p>'+
            manualTable(['Dimensão','Descrição'],[
              ['Regulatório','Risco baseado em critérios regulatórios (urgência, UTI, OPME, prazo vencido etc.)'],
              ['Assistencial','Risco assistencial com base na complexidade do procedimento e oncologia'],
              ['Documental','Risco baseado na aderência à DUT e documentação apresentada'],
              ['Contratual','Risco de cobertura contratual do plano para o procedimento solicitado'],
            ]))+

          manualBox('Aba: Beneficiário',
            '<p>Dados completos do paciente titular da guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Nome','Nome completo do beneficiário'],
              ['CPF','CPF parcialmente mascarado (privacidade)'],
              ['Cartão','Número do cartão do plano mascarado'],
              ['Idade','Idade calculada automaticamente'],
              ['Plano','Nome comercial do plano de saúde'],
              ['Contrato','Código do contrato empresarial ou individual'],
            ]))+

          manualBox('Aba: Prestador',
            '<p>Exibe dois painéis lado a lado com os dados dos prestadores envolvidos:</p>'+
            manualTable(['Painel','Campos'],[
              ['Prestador Solicitante','Nome e tipo do prestador que abriu a solicitação de autorização'],
              ['Prestador Executante','Nome e tipo do prestador que realizará o procedimento ou internação'],
            ]))+

          manualBox('Aba: Solicitação',
            '<p>Detalhes técnicos da solicitação médica:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Tipo','Tipo da guia (Internação, Ambulatorial, SADT etc.)'],
              ['Natureza','Natureza do atendimento (Eletivo, Urgência/Emergência, Acidente etc.)'],
              ['Regime','Regime de atendimento (Ambulatorial, Internação, Hospital-dia)'],
              ['Origem','Canal de origem da solicitação (badge colorido)'],
              ['Observações','Texto livre com observações do solicitante'],
            ]))+

          manualBox('Aba: Etapas',
            '<p>Exibe a <b>timeline do fluxo</b> de auditoria com o status de cada etapa:</p>'+
            manualTable(['Status','Descrição'],[
              ['Concluída (verde)','Etapa já finalizada — exibe data de início e fim'],
              ['Em execução (destaque)','Etapa atualmente em andamento — exibe data de início e prazo restante'],
              ['Pendente (cinza)','Etapa ainda não iniciada'],
            ])+
            '<p>Cada etapa exibe: número de ordem, nome, responsável (Auditor / Enfermeiro), prazo em horas e datas de execução.</p>')+

          manualBox('Aba: Procedimentos',
            '<p>Lista todos os procedimentos vinculados à guia com suas configurações:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código TUSS ou interno do procedimento'],
              ['Descrição','Nome do procedimento'],
              ['Peso','Pontuação do item no cálculo de risco (0–10)'],
              ['Obrig.','Indica se o procedimento é obrigatório para o fluxo'],
              ['OPME','Indica se o item é classificado como OPME'],
              ['IA','Instrução personalizada para análise pela IA'],
              ['Status','Ativo ou Inativo na parametrização'],
            ]))+

          manualBox('Aba: Pacotes',
            '<p>Lista os pacotes assistenciais vinculados à guia. Estrutura idêntica à aba Procedimentos, sem a coluna OPME.</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código do pacote'],
              ['Descrição','Nome do pacote'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o pacote é obrigatório no fluxo'],
              ['IA','Instrução para a IA analisar este pacote'],
              ['Status','Ativo / Inativo'],
            ]))+

          manualBox('Aba: Mat/Med',
            '<p>Materiais e medicamentos vinculados à guia. Estrutura idêntica à aba Procedimentos, sem a coluna OPME.</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código TUSS do material ou medicamento'],
              ['Descrição','Nome do item'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o item é obrigatório'],
              ['IA','Instrução específica para a IA'],
              ['Status','Ativo / Inativo'],
            ]))+

          manualBox('Aba: Diárias/Taxas',
            '<p>Diárias hospitalares e taxas vinculadas à guia.</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código da diária ou taxa'],
              ['Descrição','Nome da diária/taxa (Ex.: UTI Adulto, Taxa de Sala Cirúrgica)'],
              ['Peso','Pontuação no cálculo de risco (0–10)'],
              ['Obrig.','Se o item é obrigatório no fluxo'],
              ['IA','Instrução para a IA avaliar este item'],
              ['Status','Ativo / Inativo'],
            ]))+

          manualBox('Aba: OPME',
            '<p>Itens classificados como OPME (Órteses, Próteses e Materiais Especiais) vinculados à guia.</p>'+
            '<p>Inclui colunas adicionais para controle de cotação:</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código do item OPME'],
              ['Descrição','Nome do item'],
              ['Cotação','Status da cotação (Em cotação, Cotado, Aprovado)'],
              ['Peso','Pontuação no cálculo de risco'],
              ['Status','Ativo / Inativo'],
            ]))+

          manualBox('Aba: Anexos',
            '<p>Documentos e arquivos enviados junto à guia. Cada anexo exibe:</p>'+
            '<ul>'+
            '<li><b>Ícone do tipo de arquivo</b> (PDF, imagem, etc.)</li>'+
            '<li><b>Nome</b>, tamanho, número de páginas e data de envio</li>'+
            '<li><b>Badge de categoria</b> (Ex.: Laudo médico, Receita, Exame)</li>'+
            '<li><b>Contador de anotações</b> do auditor</li>'+
            '</ul>'+
            '<p><b>Ações disponíveis por anexo:</b></p>'+
            manualTable(['Ação','Descrição'],[
              ['Visualizar','Abre o documento para leitura'],
              ['Categorizar','Define ou altera a categoria do documento'],
              ['Anotar','Adiciona anotações textuais ao documento'],
            ]))+

          manualBox('Aba: Críticas',
            '<p>Exibe as inconsistências e alertas identificados automaticamente pela IA e pelas regras de negócio na análise da guia.</p>'+
            '<p>Cada crítica contém:</p>'+
            '<ul>'+
            '<li><b>Severidade</b> — Crítica, Alta, Média ou Baixa</li>'+
            '<li><b>Descrição</b> — o que foi identificado como inconsistente ou suspeito</li>'+
            '<li><b>Origem</b> — se a crítica foi gerada pela IA ou por regra de negócio</li>'+
            '</ul>')+

          manualBox('Aba: Parecer Técnico',
            '<p>Exibe a análise técnica gerada pela IA com base nas regras DUT e nos parâmetros configurados:</p>'+
            manualTable(['Elemento','Descrição'],[
              ['Badge de confiança','Percentual de confiança da análise (Ex.: Confiança 87%)'],
              ['Aderência à DUT','Barra visual com o percentual de aderência às diretrizes'],
              ['Parecer geral','Texto da conclusão técnica da IA'],
              ['Critérios cumpridos','Lista de itens validados positivamente pela IA'],
              ['Alertas','Itens com potencial inconsistência ou risco identificados'],
            ])+
            '<p><b>Ação importante:</b> O auditor pode <b>desmarcar critérios</b> validados pela IA caso discorde da análise. Essa ação é registrada automaticamente nos Logs como <b>"Correção IA"</b>, gerando rastreabilidade da intervenção humana.</p>')+

          manualBox('Aba: Parecer Operadora',
            '<p>Formulário para registro da decisão oficial da operadora sobre a guia:</p>'+
            manualTable(['Campo','Descrição'],[
              ['Decisão','Seletor com as opções: Aprovação, Aprovação com ressalva, Reprovação, Solicitar complemento, Encaminhar para junta médica'],
              ['Motivo','Campo de texto com a justificativa da decisão'],
              ['Justificativa técnica','Texto técnico detalhado — pode ser gerado automaticamente pela IA clicando em "Gerar análise técnica"'],
              ['Obs. para o Prestador','Observações a serem comunicadas ao prestador solicitante'],
              ['Obs. Internas','Observações internas da operadora (não visíveis ao prestador)'],
            ])+
            '<p>Ao salvar, o status da guia é atualizado automaticamente conforme a decisão e a ação é registrada nos logs.</p>')+

          manualBox('Aba: Histórico',
            '<p>Exibe o histórico cronológico de todas as movimentações da guia:</p>'+
            '<ul>'+
            '<li>Mudanças de status</li>'+
            '<li>Emissão de pareceres</li>'+
            '<li>Alterações de etapa</li>'+
            '<li>Ações realizadas por usuários</li>'+
            '</ul>'+
            '<p>Cada registro exibe: data/hora, usuário responsável, perfil e descrição da ação.</p>')+

          manualBox('Aba: Logs',
            '<p>Exibe os logs de rastreabilidade <b>específicos desta guia</b> — diferente da tela geral de Logs que mostra todos os registros do sistema.</p>'+
            '<p>Inclui tanto ações de usuários quanto eventos do sistema e da IA relacionados exclusivamente a esta guia, como:</p>'+
            '<ul>'+
            '<li>Análises da IA executadas</li>'+
            '<li>Correções manuais de critérios da IA</li>'+
            '<li>Alterações de parametrização aplicadas</li>'+
            '<li>Envio e categorização de anexos</li>'+
            '</ul>');
      }

      body.innerHTML=
        manualHdr('Relação de Guias','Filtre, audite e emita parecer com apoio da análise técnica da IA')+
        tabBar+
        guiasContent;

      setTimeout(function(){
        document.querySelectorAll('.manual-subtab[data-gtab]').forEach(function(btn){
          btn.onclick=function(){
            State.manualGuiasTab=btn.getAttribute('data-gtab');
            if(State.manualGuiasTab!=='detalhe') State.manualDetalheTab='cabecalho';
            var b=document.querySelector('.manual-body');
            if(b) b.scrollTop=0;
            render();
          };
        });
        document.querySelectorAll('.manual-det-tab[data-dtab]').forEach(function(btn){
          btn.onclick=function(){
            State.manualDetalheTab=btn.getAttribute('data-dtab');
            var b=document.querySelector('.manual-det-body');
            if(b) b.scrollTop=0;
            render();
          };
        });
      },0);
    }

    else if(sec==='kanban'){
      body.innerHTML=
        manualHdr('Kanban de Guias','Acompanhamento visual por status')+
        manualBox('Visão Geral',
          '<p>O Kanban exibe as guias organizadas em <b>7 colunas</b> de status, permitindo acompanhar visualmente o fluxo de auditoria.</p>'+
          manualScreen('kanban'))+
        manualBox('Colunas',
          manualTable(['Coluna','Cor'],[
            ['Em análise','Azul (#4a7fa5)'],
            ['Aguardando complemento','Âmbar (#b07a1a)'],
            ['Em junta médica','Roxo (#6b57b0)'],
            ['Cotação de OPME','Ciano (#0e7490)'],
            ['Analisada','Verde (#2faa66)'],
            ['Liberada','Verde escuro (#0a8a43)'],
            ['Negada','Vermelho (#b91c1c)'],
          ]))+
        manualBox('Filtros',
          manualTable(['Filtro','Opções'],[
            ['Período de emissão','Seletor De / Até (botão Limpar disponível)'],
            ['Colunas','Selecionar quais status exibir'],
            ['UTI','Todos / UTI / Não UTI'],
            ['Regime','Todos / Urgência / Eletivo'],
            ['Tipo','Todos / Internação / Ambulatorial'],
          ]))+
        manualBox('Interação',
          '<p>Clique em qualquer card para abrir os detalhes completos da guia (mesmo modal da tela Guias).</p>');
    }

    else if(sec==='param'){
      body.innerHTML=
        manualHdr('Painel de Parametrização','Configuração de fluxos, regras DUT e itens assistenciais')+
        manualBox('Visão Geral',
          '<p>A Parametrização é onde se configura tudo que a IA e os fluxos utilizam para analisar as guias. Possui 3 abas principais e um painel de KPIs no topo.</p>')+
        manualBox('KPIs do Painel',
          manualTable(['Card','Informações exibidas'],[
            ['Fluxos sincronizados','Total de fluxos, quantos têm instrução IA, total ativos'],
            ['Procedimentos','Total, com instrução IA, ativos'],
            ['Pacotes','Total, com instrução IA, ativos'],
            ['Mat/Med','Total, com instrução IA, ativos'],
            ['Diárias/Taxas','Total, com instrução IA, ativos'],
          ]))+
        manualBox('Aba: Fluxos & Etapas',
          '<p>Lista todos os fluxos assistenciais (F1–F9) com suas etapas, responsáveis e prazos. Para cada fluxo é possível configurar:</p>'+
          '<ul><li><b>Subfluxos</b> — etapas internas do fluxo</li>'+
          '<li><b>Vinculações</b> — procedimentos, pacotes, Mat/Med e diárias associados ao fluxo</li>'+
          '<li><b>Pesos IA</b> — peso de cada critério no cálculo de aderência (sliders 0–10)</li></ul>')+
        manualBox('Aba: Procedimentos / Pacotes / Mat/Med / Diárias',
          '<p>Cada aba lista os itens da categoria com as colunas:</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Código','Código do item'],
            ['Descrição','Nome do procedimento/pacote/item'],
            ['Peso','Pontuação do item no cálculo de risco (0–10)'],
            ['Obrig.','Se o item é obrigatório na guia'],
            ['IA','Instrução personalizada para a IA analisar este item'],
            ['OPME','Se o item é classificado como OPME (apenas Procedimentos)'],
            ['Status','Ativo ou Inativo'],
          ]))+
        manualBox('Importar / Exportar (Instruções IA + Pesos)',
          '<p>Os botões <b>Exportar instruções IA</b> e <b>Importar instruções IA</b> permitem gerenciar em massa as instruções e pesos via planilha:</p>'+
          '<ul>'+
          '<li><b>Exportar</b> — gera planilha Excel com colunas: Código, Descrição, OPME (se aplicável), <b>Peso (0–10)</b> e Instrução IA</li>'+
          '<li><b>Importar</b> — lê planilha preenchida, detecta colunas automaticamente por cabeçalho, exibe prévia com contagem de instruções e pesos a importar</li>'+
          '<li>Valores de peso são clampados automaticamente entre 0 e 10</li>'+
          '<li>Linhas sem peso não sobrescrevem o valor existente</li>'+
          '</ul>'+
          '<p><b>Formatos aceitos:</b> CSV, XLS, XLSX ou HTML (gerado pelo próprio Export).</p>')+
        manualBox('Aba: Regras DUT',
          '<p>Lista todas as Diretrizes de Utilização configuradas. Gestores podem:</p>'+
          '<ul><li>Adicionar nova regra (código, descrição, texto normativo, instrução IA)</li>'+
          '<li>Importar planilha de regras DUT</li>'+
          '<li>Editar instrução IA de cada regra (máx. 3.000 caracteres)</li>'+
          '<li>Alternar status Ativo/Inativo</li>'+
          '<li>Excluir regras customizadas</li></ul>');
    }

    else if(sec==='logs'){
      body.innerHTML=
        manualHdr('Logs e Rastreabilidade','Auditoria completa de ações de usuários, sistema e IA')+
        manualBox('Visão Geral',
          '<p>A tela de Logs registra todas as ações realizadas na plataforma, garantindo rastreabilidade completa para fins de auditoria e conformidade.</p>')+
        manualBox('Aba: Logs de Usuário',
          '<p>Exibe ações realizadas por usuários da plataforma. Um gráfico de rosca no topo mostra a distribuição por perfil (Gestor, Auditor, Enfermeiro).</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Data/Hora','Timestamp da ação'],
            ['Usuário','Nome do usuário que realizou a ação'],
            ['Perfil','Badge: Gestor, Auditor ou Enfermeiro'],
            ['Ação','Descrição da ação realizada'],
            ['Guia','Número da guia relacionada (extraído da referência)'],
          ])+
          '<p><b>Filtros disponíveis:</b> Período (De/Até), Perfil e Busca livre. Todas as colunas são ordenáveis.</p>')+
        manualBox('Aba: Logs Sistema | IA',
          '<p>Exibe eventos gerados automaticamente pelo sistema e pela IA. Um gráfico de rosca mostra a distribuição por tipo.</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Data/Hora','Timestamp do evento'],
            ['Origem','Nome do módulo ou serviço'],
            ['Tipo','Badge: Sistema (azul), IA (roxo) ou Correção IA (âmbar)'],
            ['Ação','Descrição do evento'],
            ['Guia','Número da guia relacionada'],
          ])+
          '<p><b>Filtros disponíveis:</b> Período (De/Até), Tipo e Busca livre.</p>'+
          '<p><b>Correção IA</b> é registrada automaticamente quando um auditor desmarca um critério validado pela IA no parecer técnico.</p>');
    }

    else if(sec==='config'){
      body.innerHTML=
        manualHdr('Configurações','Classificação de risco, prazos por fluxo e permissões')+
        manualBox('Aba: Classificação de Risco',
          '<p>Define como as guias são classificadas automaticamente em 4 níveis de risco (Baixo, Médio, Alto, Crítico) com base em fatores presentes na guia.</p>'+
          '<p>Disponível apenas para o perfil <b>Gestor</b>.</p>'+
          '<p><b>Toggle "Classificação automática ativa"</b> — quando ativo, o risco é recalculado automaticamente a cada análise. Quando inativo, o risco permanece manual.</p>'+
          '<br><p><b>Sub-aba: Limiares por nível</b></p>'+
          '<p>Define os limiares de pontuação para cada nível:</p>'+
          manualTable(['Nível','Pontuação'],[
            ['Baixo','0 até o limiar baixo (padrão: 7)'],
            ['Médio','Acima do baixo até o limiar médio (padrão: 15)'],
            ['Alto','Acima do médio até o limiar alto (padrão: 23)'],
            ['Crítico','Acima do limiar alto'],
          ])+
          '<p><i>Validação: os limiares devem estar em ordem crescente. O sistema impede salvar se Baixo ≥ Médio ou Médio ≥ Alto.</i></p>'+
          '<br><p><b>Sub-aba: Prévia</b></p>'+
          '<p>Mostra em tempo real como as guias seriam distribuídas nos 4 níveis com os limiares configurados, exibindo quantidade e percentual de cada nível.</p>')+
        manualBox('Aba: Prazos por Fluxo',
          '<p>Define o prazo (em dias) e o regime de atendimento de cada fluxo assistencial.</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Fluxo','Identificador e nome do fluxo'],
            ['Prazo','Campo editável com o prazo em dias'],
            ['Regime','Clicável — cicla entre: Todos / Eletivo / Urgência'],
          ])+
          '<p>A linha de legenda abaixo da tabela explica o comportamento da coluna Regime.</p>')+
        manualBox('Aba: Perfis e Permissões',
          '<p>Matriz editável de permissões por perfil. Disponível apenas para o perfil <b>Gestor</b>.</p>'+
          '<p>Clique em qualquer célula da matriz para ciclar entre os níveis:</p>'+
          manualTable(['Nível','Ícone','Descrição'],[
            ['Acesso total','✓','Permissão completa para a ação'],
            ['Somente leitura','👁','Pode visualizar mas não alterar'],
            ['Sem acesso','—','Funcionalidade oculta para o perfil'],
          ])+
          '<p>As alterações são salvas automaticamente no navegador (localStorage).</p>');
    }

    else if(sec==='perfis'){
      body.innerHTML=
        manualHdr('Perfis de Acesso','Capacidades e restrições de cada perfil de usuário')+
        manualBox('Perfis disponíveis',
          manualTable(['Perfil','Acesso','Descrição'],[
            ['Gestor','Total','Acesso a todas as funcionalidades, incluindo Configurações, Parametrização e Logs'],
            ['Auditor','Parcial','Pode auditar guias, emitir pareceres e visualizar relatórios'],
            ['Enfermeiro','Restrito','Acesso apenas às guias dos seus fluxos e às etapas de responsabilidade do enfermeiro'],
          ]))+
        manualBox('Simulação de Perfil (Gestor)',
          '<p>O Gestor pode simular a visão de outros perfis usando o <b>botão flutuante</b> no canto inferior direito da tela (FAB com ícone de usuários). Ao selecionar um perfil:</p>'+
          '<ul><li>A visão de guias é filtrada conforme as regras do perfil simulado</li>'+
          '<li>Um banner de aviso é exibido no topo indicando o perfil em simulação</li>'+
          '<li>Um botão "Sair da visão" permite retornar à visão completa</li></ul>')+
        manualTable(['Funcionalidade','Gestor','Auditor','Enfermeiro'],[
          ['Dashboard','✓','✓','✓'],
          ['Relação de Guias','✓','✓','✓ (fluxos próprios)'],
          ['Kanban','✓','✓','✓ (fluxos próprios)'],
          ['Parametrização','✓','—','—'],
          ['Logs','✓','—','—'],
          ['Configurações','✓','—','—'],
          ['Emitir parecer','✓','✓','—'],
          ['Aprovar/Reprovar','✓','✓','—'],
          ['Junta médica','✓','✓','—'],
          ['Triagem/Complemento','✓','✓','✓'],
        ]);
    }

    wrap.appendChild(body);
    return wrap;

    function manualHdr(title,sub){
      return '<div class="manual-page-hdr">'+
        '<h1>'+esc(title)+'</h1>'+
        '<p>'+esc(sub)+'</p>'+
      '</div>';
    }
    function manualBox(title,html){
      return '<div class="manual-box">'+
        '<h2>'+esc(title)+'</h2>'+
        '<div class="manual-box-body">'+html+'</div>'+
      '</div>';
    }
    function manualGrid(items){
      var cells=items.map(function(it){
        return '<div class="manual-grid-card">'+
          '<div class="manual-grid-ico">'+ico(it.ico,20)+'</div>'+
          '<div class="manual-grid-title">'+esc(it.title)+'</div>'+
          '<div class="manual-grid-desc">'+esc(it.desc)+'</div>'+
        '</div>';
      }).join('');
      return '<div class="manual-grid">'+cells+'</div>';
    }
    function manualTable(cols,rows){
      var thead='<thead><tr>'+cols.map(function(c){ return '<th>'+esc(c)+'</th>'; }).join('')+'</tr></thead>';
      var tbody='<tbody>'+rows.map(function(r,i){
        return '<tr class="'+(i%2===0?'tr-a':'tr-b')+'">'+r.map(function(c){ return '<td>'+c+'</td>'; }).join('')+'</tr>';
      }).join('')+'</tbody>';
      return '<div class="manual-table-wrap"><table class="manual-table">'+thead+tbody+'</table></div>';
    }
    function manualScreen(name){
      var SCREENS={
        login:'<div class="ms-login"><div class="ms-card"><div class="ms-logo">R<span>AI</span></div><div class="ms-field"></div><div class="ms-field"></div><div class="ms-btn"></div></div></div>',
        dashboard:'<div class="ms-dash"><div class="ms-kpi-row"><div class="ms-kpi"></div><div class="ms-kpi"></div><div class="ms-kpi"></div><div class="ms-kpi"></div></div><div class="ms-charts"><div class="ms-chart-bar"></div><div class="ms-chart-bar short"></div></div></div>',
        kanban:'<div class="ms-kanban"><div class="ms-kb-col"><div class="ms-kb-card"></div><div class="ms-kb-card"></div></div><div class="ms-kb-col"><div class="ms-kb-card"></div></div><div class="ms-kb-col"><div class="ms-kb-card"></div><div class="ms-kb-card"></div><div class="ms-kb-card"></div></div></div>',
      };
      if(!SCREENS[name]) return '';
      return '<div class="manual-screen">'+SCREENS[name]+'</div>';
    }
  }

  /* === Autenticação === */
  var AUTH_KEY='regula_auth_token';
  var USERS_KEY='regula_users';

  function getUsers(){
    var saved=localStorage.getItem(USERS_KEY);
    if(saved) return JSON.parse(saved);
    var defaults=[{login:'admin',senha:'admin',nome:'Administrador',perfil:'gestor'}];
    localStorage.setItem(USERS_KEY,JSON.stringify(defaults));
    return defaults;
  }

  function authCheck(){
    return !!localStorage.getItem(AUTH_KEY);
  }

  function authLogin(login,senha){
    var users=getUsers();
    for(var i=0;i<users.length;i++){
      if(users[i].login===login&&users[i].senha===senha) return users[i];
    }
    return null;
  }

  function authLogout(){
    localStorage.removeItem(AUTH_KEY);
    location.reload();
  }

  function showLoginScreen(){
    var scr=document.createElement('div');
    scr.id='loginScreen';
    scr.innerHTML=
      '<div class="login-card-wrap">'+
        '<div class="login-card">'+
          '<div class="login-brand">'+
            '<div class="login-brand-mark">R<span>AI</span></div>'+
            '<div class="login-brand-info">'+
              '<div class="login-brand-title">RegulaAI</div>'+
              '<div class="login-brand-sub">Saúde · Auditoria</div>'+
            '</div>'+
          '</div>'+
          '<div class="login-heading">'+
            '<h2>Acesse sua conta</h2>'+
            '<p>Entre com suas credenciais para continuar</p>'+
          '</div>'+
          '<div class="login-fields">'+
            '<div class="login-field">'+
              '<label>Login</label>'+
              '<input id="loginUser" type="text" placeholder="Seu login" autocomplete="username" />'+
            '</div>'+
            '<div class="login-field">'+
              '<label>Senha</label>'+
              '<input id="loginPass" type="password" placeholder="Sua senha" autocomplete="current-password" />'+
            '</div>'+
          '</div>'+
          '<div class="login-error" id="loginErr">'+
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'+
            '<span>Login ou senha incorretos</span>'+
          '</div>'+
          '<button class="login-btn" id="loginBtn">Entrar</button>'+
          '<div class="login-footer">RegulaAI Saúde &mdash; Auditoria Assistencial</div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(scr);

    var userEl=scr.querySelector('#loginUser');
    var passEl=scr.querySelector('#loginPass');
    var errEl=scr.querySelector('#loginErr');
    var btn=scr.querySelector('#loginBtn');

    function doLogin(){
      var login=userEl.value.trim();
      var senha=passEl.value;
      if(!login||!senha) return;
      btn.disabled=true;
      var user=authLogin(login,senha);
      if(user){
        localStorage.setItem(AUTH_KEY,JSON.stringify({login:user.login,nome:user.nome,ts:Date.now()}));
        errEl.classList.remove('show');
        scr.classList.add('fade-out');
        setTimeout(function(){
          scr.remove();
          aplicarRiscos();
          renderUserChip(); bindNav(); render(); atualizarBreadcrumb();
          bindLogout();
        },420);
      } else {
        errEl.classList.add('show');
        passEl.value='';
        passEl.focus();
        btn.disabled=false;
      }
    }

    btn.onclick=doLogin;
    passEl.addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
    userEl.addEventListener('keydown',function(e){ if(e.key==='Enter') passEl.focus(); });
    setTimeout(function(){ userEl.focus(); },80);
  }

  /* === Botão de logout no topbar === */
  function bindLogout(){
    var btn=document.getElementById('logoutBtn');
    if(btn) btn.onclick=function(){ if(confirm('Deseja sair da plataforma?')) authLogout(); };
  }

  /* === Chat Singleton === */
  (function initChat(){
    var chatRoot=$('#chatRoot');
    if(!chatRoot) return;

    // Migração: chave antiga do Gemini → novo esquema por provedor
    (function migraIA(){
      var antigaKey=localStorage.getItem('regula_gemini_key');
      if(antigaKey && !localStorage.getItem('regula_ia_key_gemini')){
        localStorage.setItem('regula_ia_key_gemini',antigaKey);
        var antigoModel=localStorage.getItem('regula_gemini_model')||'gemini-2.5-flash';
        localStorage.setItem('regula_ia_model_gemini',antigoModel);
        if(!localStorage.getItem('regula_ia_provider')) localStorage.setItem('regula_ia_provider','gemini');
      }
    })();

    var chatHistory=[];
    var maxLevel=0;            // 0=normal, 1=largo, 2=muito largo
    var WELCOME='Olá! Sou a RAI, sua assistente virtual. Estou aqui para ajudar com dúvidas sobre o sistema. Como posso te ajudar hoje?';

    /* === Persistência de sessões de chat === */
    var sessions=JSON.parse(localStorage.getItem('regula_chat_sessions')||'[]');
    var currentSessionId=null;
    function persistSessions(){ localStorage.setItem('regula_chat_sessions',JSON.stringify(sessions)); }
    function findSession(id){ for(var i=0;i<sessions.length;i++){ if(sessions[i].id===id) return sessions[i]; } return null; }
    function sessionTitle(s){
      // primeiro texto do usuário vira título
      for(var i=0;i<s.history.length;i++){ if(s.history[i].role==='user'){ var t=s.history[i].parts[0].text; return t.length>40?t.slice(0,40)+'…':t; } }
      return 'Nova conversa';
    }
    function saveCurrent(){
      if(!currentSessionId) return;
      var s=findSession(currentSessionId);
      if(!s) return;
      s.history=chatHistory.slice();
      s.updated=Date.now();
      persistSessions();
    }
    function newSession(){
      // remove sessões vazias antigas para não acumular
      sessions=sessions.filter(function(s){ return s.history && s.history.length>0; });
      currentSessionId='s'+Date.now();
      sessions.unshift({id:currentSessionId,history:[],created:Date.now(),updated:Date.now()});
      persistSessions();
      chatHistory=[];
    }

    var SYSTEM_CONTEXT='Você é a RAI, assistente virtual do RegulaAI Saúde, plataforma de auditoria assistencial para operadoras de saúde. '+
      'NÃO se apresente nem use saudações como "Olá! Sou a RAI" nas respostas — a apresentação já foi feita na abertura do chat. Vá direto ao ponto. '+
      'Se o usuário perguntar o que significa RAI ou o motivo do nome, responda: "RAI é a combinação da primeira letra de Regulação (R) + AI (Artificial Intelligence)." '+
      'Responda em português, de forma objetiva, técnica e acolhedora. '+
      'Conhecimento do sistema: '+
      '1) GUIAS: cada guia possui número, tipo (internação/ambulatorial), regime, natureza, fluxo, status (triagem/análise/complemento/parecer/concluída). '+
      '2) ADERÊNCIA: calculada pela IA com critérios ponderados por pesos configuráveis. O TETO é dinâmico — soma apenas critérios aplicáveis à guia específica (ex.: DUT só entra se a guia tem procedimentos com DUT obrigatória; pacotes só se vinculados). '+
      '3) CRITÉRIOS DE ADERÊNCIA: Documental (documentação anexada), DUT (Diretriz de Utilização), Procedimentos vinculados, Pacotes, Mat/Med, Diárias/Taxas, Contratual/Histórico. '+
      '4) PESOS: configuráveis em Parametrização → cada aba (Procedimentos, Pacotes, Mat/Med, Diárias/Taxas) tem campo Peso de 0 a 10. '+
      '5) REPROCESSAR: reanalisa a guia passando itens desmarcados pelo auditor, observações e parecer da operadora como contexto de aprendizado. '+
      '6) PERFIS: Gestor (acesso total), Auditor (análise e parecer), Enfermeiro (triagem e complemento). '+
      '7) FLUXOS: F1-Eletivo, F2-Alta Complexidade, F3-Oncologia, etc. '+
      'Se não souber algo específico do sistema, oriente o usuário a consultar o manual ou contatar o administrador.';

    // Monta estrutura uma única vez
    chatRoot.className='manual-chat-panel';

    // Avatar SVG da RAI (silhueta robótica feminina estilizada)
    var RAI_AVATAR='<div class="rai-avatar-wrap"><img class="rai-avatar-img" src="img/rai-avatar.png" alt="RAI" /></div>';

    var chatHd=el('div',{class:'manual-chat-hd rai-chat-hd'});
    chatHd.innerHTML=
      RAI_AVATAR+
      '<div class="rai-hd-info"><span class="rai-hd-name">RAI</span><span class="rai-hd-sub">Assistente AI</span></div>'+
      '<button class="manual-chat-maxbtn chat-hd-btn" id="chatHistBtn" title="Conversas anteriores">'+ico('history',14)+'</button>'+
      '<button class="manual-chat-maxbtn chat-hd-btn" id="chatMaxBtn" title="Expandir" style="margin-left:2px">'+ico('maximize-2',14)+'</button>'+
      '<button class="manual-chat-maxbtn chat-hd-btn" id="chatMinBtn" title="Minimizar" style="margin-left:2px">'+ico('chevron-down',14)+'</button>'+
      '<button class="manual-chat-maxbtn chat-hd-btn" id="chatCloseBtn" title="Fechar" style="margin-left:2px">'+ico('x',14)+'</button>';
    chatRoot.appendChild(chatHd);
    lcIcons();

    // Painel de histórico (overlay dentro do chat)
    var histPanel=el('div',{class:'mchat-hist'});
    chatRoot.appendChild(histPanel);

    var chatLog=el('div',{class:'manual-chat-log'});
    chatRoot.appendChild(chatLog);

    var chatFoot=el('div',{class:'manual-chat-foot'});
    var chatInp=el('textarea',{class:'manual-chat-inp',placeholder:'Digite sua mensagem...',rows:'1'});
    var chatSend=el('button',{class:'manual-chat-send',title:'Enviar'});
    chatSend.innerHTML=ico('send',15);
    chatFoot.appendChild(chatInp);
    chatFoot.appendChild(chatSend);
    chatRoot.appendChild(chatFoot);

    function addMsg(role,text){
      var d=el('div',{class:'mchat-msg mchat-'+role});
      if(role==='bot') d.innerHTML=
        '<div class="mchat-avatar rai-msg-avatar">'+RAI_AVATAR+'</div>'+
        '<div class="mchat-bubble-wrap"><span class="mchat-sender">RAI</span><div class="mchat-bubble">'+text.replace(/\n/g,'<br>')+'</div></div>';
      else d.innerHTML='<div class="mchat-bubble">'+esc(text)+'</div>';
      chatLog.appendChild(d);
      chatLog.scrollTop=chatLog.scrollHeight;
    }

    // Renderiza o log a partir do chatHistory atual
    function renderLog(){
      chatLog.innerHTML='';
      addMsg('bot',WELCOME);
      if(!getIaCfg().key) addMsg('bot','⚠️ Nenhuma chave de API configurada. Acesse <b>Configurações → Assistente</b> para escolher o provedor (Gemini, Claude ou OpenAI) e inserir sua chave.');
      for(var i=0;i<chatHistory.length;i++){
        addMsg(chatHistory[i].role==='user'?'user':'bot', chatHistory[i].parts[0].text);
      }
    }

    // Carrega uma sessão pelo id
    function loadSession(id){
      var s=findSession(id);
      if(!s) return;
      currentSessionId=id;
      chatHistory=s.history.slice();
      renderLog();
      closeHist();
    }

    // Inicia conversa nova (limpa log)
    function startNew(){
      newSession();
      renderLog();
      closeHist();
      chatInp.focus();
    }

    /* === Painel de histórico === */
    function fmtData(ts){
      var d=new Date(ts), hj=new Date();
      var hh=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      if(d.toDateString()===hj.toDateString()) return 'Hoje '+hh;
      var ont=new Date(hj); ont.setDate(hj.getDate()-1);
      if(d.toDateString()===ont.toDateString()) return 'Ontem '+hh;
      return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()+' '+hh;
    }
    function renderHist(){
      var html='<div class="mchat-hist-hd"><span>Conversas anteriores</span>'+
        '<button class="mchat-hist-close" id="histCloseBtn" title="Fechar">'+ico('x',14)+'</button></div>'+
        '<div class="mchat-hist-hint">Selecione uma conversa para continuar, ou feche e envie uma mensagem para iniciar uma nova.</div>'+
        '<div class="mchat-hist-list">';
      var comConteudo=sessions.filter(function(s){ return s.history.length>0; });
      if(!comConteudo.length){
        html+='<div class="mchat-hist-empty">Nenhuma conversa salva ainda.</div>';
      } else {
        for(var i=0;i<comConteudo.length;i++){
          var s=comConteudo[i];
          var ativa=s.id===currentSessionId?' ativa':'';
          html+='<div class="mchat-hist-item'+ativa+'" data-id="'+s.id+'">'+
            '<div class="mchat-hist-item-main"><div class="mchat-hist-title">'+esc(sessionTitle(s))+'</div>'+
            '<div class="mchat-hist-date">'+fmtData(s.updated)+'</div></div>'+
            '<button class="mchat-hist-del" data-del="'+s.id+'" title="Excluir">'+ico('trash-2',13)+'</button>'+
            '</div>';
        }
      }
      html+='</div>';
      histPanel.innerHTML=html;
      lcIcons();
      // Fechar o histórico inicia uma conversa nova (chat limpo)
      histPanel.querySelector('#histCloseBtn').onclick=startNew;
      var items=histPanel.querySelectorAll('.mchat-hist-item');
      for(var j=0;j<items.length;j++){
        items[j].onclick=function(e){
          if(e.target.closest('.mchat-hist-del')) return;
          loadSession(this.getAttribute('data-id'));
        };
      }
      var dels=histPanel.querySelectorAll('.mchat-hist-del');
      for(var k=0;k<dels.length;k++){
        dels[k].onclick=function(e){
          e.stopPropagation();
          var id=this.getAttribute('data-del');
          if(!confirm('Excluir esta conversa?')) return;
          sessions=sessions.filter(function(s){ return s.id!==id; });
          persistSessions();
          if(id===currentSessionId){ newSession(); renderLog(); }
          renderHist();
        };
      }
    }
    function openHist(){ renderHist(); chatRoot.classList.add('hist-open'); }
    function closeHist(){ chatRoot.classList.remove('hist-open'); }

    // Sessão inicial: nova conversa em branco
    newSession();
    renderLog();

    // Configuração de IA ativa (provedor + chave + modelo)
    function getIaCfg(){
      var prov=localStorage.getItem('regula_ia_provider')||'gemini';
      var DEF={gemini:'gemini-2.5-flash',claude:'claude-sonnet-4-6',openai:'gpt-4o'};
      var key=localStorage.getItem('regula_ia_key_'+prov)||'';
      // fallback p/ chave antiga do Gemini
      if(!key && prov==='gemini') key=localStorage.getItem('regula_gemini_key')||'';
      var model=localStorage.getItem('regula_ia_model_'+prov)||DEF[prov];
      return {prov:prov,key:key,model:model};
    }

    // Chama a API do provedor selecionado; history no formato canônico Gemini
    // ({role:'user'|'model', parts:[{text}]}). Retorna o texto da resposta.
    async function callIA(cfg,history){
      if(cfg.prov==='claude'){
        var msgs=history.map(function(m){ return {role:m.role==='model'?'assistant':'user',content:m.parts[0].text}; });
        var r=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'x-api-key':cfg.key,
            'anthropic-version':'2023-06-01',
            'anthropic-dangerous-direct-browser-access':'true'
          },
          body:JSON.stringify({model:cfg.model,max_tokens:1024,system:SYSTEM_CONTEXT,messages:msgs})
        });
        var d=await r.json();
        if(d.content&&d.content[0]&&d.content[0].text) return {ok:true,text:d.content[0].text};
        return {ok:false,text:(d.error&&d.error.message)||'Sem resposta do Claude.'};
      }
      if(cfg.prov==='openai'){
        var omsgs=[{role:'system',content:SYSTEM_CONTEXT}].concat(history.map(function(m){
          return {role:m.role==='model'?'assistant':'user',content:m.parts[0].text};
        }));
        var ro=await fetch('https://api.openai.com/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
          body:JSON.stringify({model:cfg.model,messages:omsgs})
        });
        var dao=await ro.json();
        if(dao.choices&&dao.choices[0]&&dao.choices[0].message) return {ok:true,text:dao.choices[0].message.content};
        return {ok:false,text:(dao.error&&dao.error.message)||'Sem resposta do OpenAI.'};
      }
      // Gemini (padrão)
      var rg=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+cfg.model+':generateContent?key='+cfg.key,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({system_instruction:{parts:[{text:SYSTEM_CONTEXT}]},contents:history})
      });
      var dg=await rg.json();
      if(dg.candidates&&dg.candidates[0]) return {ok:true,text:dg.candidates[0].content.parts[0].text};
      return {ok:false,text:(dg.error&&dg.error.message)||'Sem resposta. Tente novamente.'};
    }

    async function sendChat(){
      var q=chatInp.value.trim();
      if(!q) return;
      chatInp.value='';
      chatInp.style.height='auto';
      addMsg('user',q);

      var cfg=getIaCfg();
      if(!cfg.key){
        addMsg('bot','⚠️ Configure o provedor e a chave de API em <b>Configurações → Assistente</b>.');
        return;
      }

      var typing=el('div',{class:'mchat-msg mchat-bot'});
      typing.innerHTML='<div class="mchat-avatar rai-msg-avatar">'+RAI_AVATAR+'</div><div class="mchat-bubble-wrap"><span class="mchat-sender">RAI</span><div class="mchat-bubble mchat-typing"><span></span><span></span><span></span></div></div>';
      chatLog.appendChild(typing);
      chatLog.scrollTop=chatLog.scrollHeight;

      chatHistory.push({role:'user',parts:[{text:q}]});

      try{
        var res=await callIA(cfg,chatHistory);
        typing.remove();
        if(res.ok){
          chatHistory.push({role:'model',parts:[{text:res.text}]});
          addMsg('bot',res.text);
        } else {
          addMsg('bot','❌ '+res.text);
        }
        saveCurrent();
      }catch(err){
        typing.remove();
        addMsg('bot','❌ Erro de conexão: '+err.message);
        saveCurrent();
      }
    }

    chatSend.onclick=sendChat;
    chatInp.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendChat(); }
    });
    chatInp.addEventListener('input',function(){
      this.style.height='auto';
      this.style.height=Math.min(this.scrollHeight,120)+'px';
    });

    chatHd.querySelector('#chatMaxBtn').onclick=function(){
      maxLevel=(maxLevel+1)%3;   // cicla 0 → 1 → 2 → 0
      chatRoot.classList.toggle('chat-max',maxLevel===1);
      chatRoot.classList.toggle('chat-max2',maxLevel===2);
      this.innerHTML=ico(maxLevel===2?'minimize-2':'maximize-2',14);
      this.title=maxLevel===0?'Expandir':(maxLevel===1?'Expandir mais':'Restaurar');
      lcIcons();
      chatInp.focus();
    };

    // Botão histórico no header (abre/fecha; fechar inicia conversa nova)
    chatHd.querySelector('#chatHistBtn').onclick=function(e){
      e.stopPropagation();
      if(chatRoot.classList.contains('hist-open')) startNew(); else openHist();
    };

    // Marca no body quando o chat está aberto e expandido (não minimizado)
    // — usado no mobile para ocultar o FAB de perfil que ficaria por cima.
    function syncBodyState(){
      var aberto=chatRoot.classList.contains('chat-open') && !chatRoot.classList.contains('chat-minimized');
      document.body.classList.toggle('chat-fullopen',aberto);
    }

    function chatMinimize(){
      closeHist();
      chatRoot.classList.add('chat-open');
      chatRoot.classList.add('chat-minimized');
      syncBodyState();
    }
    function chatRestore(){
      chatRoot.classList.add('chat-open');
      chatRoot.classList.remove('chat-minimized');
      syncBodyState();
      // No mobile não foca de imediato (o teclado cobriria o painel pequeno)
      if(window.innerWidth>640) chatInp.focus();
    }

    // Botão minimizar
    chatHd.querySelector('#chatMinBtn').onclick=function(e){
      e.stopPropagation();
      chatMinimize();
    };

    chatHd.querySelector('#chatCloseBtn').onclick=function(e){
      e.stopPropagation();
      chatRoot.classList.remove('chat-open','chat-minimized','chat-max','chat-max2','hist-open');
      syncBodyState();
    };

    // Clicar em qualquer lugar do header quando minimizado restaura
    chatHd.onclick=function(){
      if(chatRoot.classList.contains('chat-minimized')) chatRestore();
    };

    var toggleBtn=$('#chatToggleBtn');
    if(toggleBtn){
      toggleBtn.onclick=function(){
        if(!chatRoot.classList.contains('chat-open') || chatRoot.classList.contains('chat-minimized')){
          chatRestore();
        } else {
          chatMinimize();
        }
      };
    }
  })();

  /* === Init === */
  aplicarRiscos();
  if(authCheck()){
    renderUserChip(); bindNav(); render(); atualizarBreadcrumb();
    bindLogout();
  } else {
    showLoginScreen();
  }
})();
