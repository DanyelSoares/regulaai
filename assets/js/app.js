/* RegulaAI — Aplicação principal (vanilla JS ES5/ES6) */
// @ts-nocheck
(function(){

  var DEFAULT_RISCO_CFG = {
    ativo: true,
    pesos: {
      urgencia:         10,
      prazoVencido:     7,
      intCirurgica:     6,
      intClinica:       4,
      ambulatorial:     2
    },
    // Teto = soma simples dos pesos acima = 29 pontos
    limiares: { baixo: 5, medio: 11, alto: 17 }
  };

  // ── Riscos Assistencial / Documental / Contratual (parametrizáveis) ──
  // Cada dimensão tem fatores (com peso) e limiares (pontuação até o nível). Acima do Alto = Crítico.
  var RISCO4_DIMS = {
    assistencial: {
      label:'Assistencial', ico:'heart-pulse',
      fatores:[
        {key:'uti',        label:'Internação em UTI',                    desc:'Guia com passagem por UTI'},
        {key:'opme',       label:'OPME presente',                        desc:'Materiais implantáveis (OPME) na guia'},
        {key:'onco',       label:'Oncologia / imunobiológico',           desc:'Quimioterapia ou imunobiológico'},
        {key:'altaComplex',label:'Alta complexidade (neuro/ortopédica)', desc:'Cirurgia neurológica ou ortopédica'},
        {key:'urgencia',   label:'Regime de urgência',                   desc:'Guia em regime de urgência'}
      ]
    },
    documental: {
      label:'Documental', ico:'file-warning',
      fatores:[
        {key:'semAnexo',   label:'Sem documentação anexada',   desc:'Guia sem anexos'},
        {key:'dutNaoComp', label:'DUT exigida e não comprovada',desc:'Procedimento com DUT sem evidência'},
        {key:'prazoVenc',  label:'Prazo de auditoria vencido',  desc:'Ultrapassou o prazo de análise'}
      ]
    },
    contratual: {
      label:'Contratual', ico:'file-check',
      fatores:[
        {key:'internacao', label:'Internação (maior exposição contratual)', desc:'Guia de internação'},
        {key:'altoCusto',  label:'OPME / alto custo',                       desc:'OPME ou múltiplas diárias/taxas'},
        {key:'dut',        label:'Procedimento sujeito a DUT',              desc:'Cobertura condicionada a DUT'},
        {key:'urgencia',   label:'Regime de urgência',                      desc:'Garantia de atendimento'}
      ]
    }
  };
  var DEFAULT_RISCO4_CFG = {
    assistencial:{ pesos:{uti:3,opme:2,onco:3,altaComplex:2,urgencia:1}, limiares:{baixo:2,medio:4,alto:6} },
    documental:  { pesos:{semAnexo:4,dutNaoComp:3,prazoVenc:2},          limiares:{baixo:2,medio:4,alto:6} },
    contratual:  { pesos:{internacao:2,altoCusto:2,dut:1,urgencia:1},    limiares:{baixo:2,medio:4,alto:6} }
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
    riscoConfig: (function(){
      var saved=JSON.parse(localStorage.getItem('regula_risco_cfg')||'null');
      // Migração: config antiga (tinha fatores removidos como 'uti'/'oncologia') → usa novo padrão
      if(saved && saved.pesos && (saved.pesos.uti!=null || saved.pesos.oncologia!=null || saved.pesos.aderenciaCrit!=null)){
        localStorage.removeItem('regula_risco_cfg'); saved=null;
      }
      return saved || DEFAULT_RISCO_CFG;
    })(),
    risco4Config: (function(){
      var saved=JSON.parse(localStorage.getItem('regula_risco4_cfg')||'null')||{};
      // merge com os defaults (garante todos os fatores/limiares presentes mesmo em configs antigas)
      var out=JSON.parse(JSON.stringify(DEFAULT_RISCO4_CFG));
      ['assistencial','documental','contratual'].forEach(function(dim){
        if(saved[dim]){
          if(saved[dim].pesos) for(var k in saved[dim].pesos){ if(out[dim].pesos[k]!=null) out[dim].pesos[k]=saved[dim].pesos[k]; }
          if(saved[dim].limiares) ['baixo','medio','alto'].forEach(function(l){ if(saved[dim].limiares[l]!=null) out[dim].limiares[l]=saved[dim].limiares[l]; });
        }
      });
      return out;
    })(),
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
    filtros: { q:'', status:'', fluxo:'', origem:'', risco:'', benef:'', prest:'', tipo:'', natureza:'', congenere:'', solicitante:'', opme:'', uti:'', especialidade:'', dataDeEmissao:'', dataAteEmissao:'', sortCol:'', sortDir:'' },
    kanbanPeriodo: { de:'', ate:'' },
    dashboardPeriodo: (function(){
      var hj=new Date(), de=new Date(); de.setDate(hj.getDate()-30);
      function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
      return { de:iso(hj), ate:iso(de) };
    })(),
    kanbanFiltros: { colunas:[], uti:'', regime:'', tipo:'', especialidade:'' },
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

  // Migração única: promove a sessão atual de Gestor → Administrador (novo topo)
  (function migraAdmin(){
    if(localStorage.getItem('regula_admin_migrado')) return;
    if(State.perfil==='gestor'){ State.perfil='admin'; localStorage.setItem('regula_perfil','admin'); }
    // promove também o usuário "admin" salvo, se ainda estiver como gestor
    try{
      var us=JSON.parse(localStorage.getItem('regula_users')||'null');
      if(us){ for(var ui=0;ui<us.length;ui++){ if(us[ui].login==='admin'&&us[ui].perfil==='gestor') us[ui].perfil='admin'; } localStorage.setItem('regula_users',JSON.stringify(us)); }
    }catch(e){}
    localStorage.setItem('regula_admin_migrado','1');
  })();

  // Recupera pareceres salvos
  var saved = JSON.parse(localStorage.getItem('regula_pareceres')||'{}');
  for(var i=0;i<State.guias.length;i++){ if(saved[State.guias[i].numero]) State.guias[i].parecerOperadora = saved[State.guias[i].numero]; }

  // Recupera estado de anexos (categoria + anotações)
  var savedAnx = JSON.parse(localStorage.getItem('regula_anexos')||'{}');
  // Recupera anexos NOVOS adicionados pelo usuário (por número de guia)
  var savedAnxNovos = JSON.parse(localStorage.getItem('regula_anexos_novos')||'{}');
  for(var ai=0;ai<State.guias.length;ai++){
    var gg=State.guias[ai];
    // reinsere anexos novos salvos desta guia (uma vez), no início da lista
    var novos=savedAnxNovos[gg.numero];
    if(novos && novos.length){
      gg.anexosLista = novos.slice().concat(gg.anexosLista.filter(function(x){ return !novos.some(function(n){return n.id===x.id;}); }));
    }
    // flags de "analisado pela IA" persistidos por guia
    var iaAnx={}; try{ iaAnx=JSON.parse(localStorage.getItem('regula_anx_ia_'+gg.numero)||'{}'); }catch(e){}
    for(var aj=0;aj<gg.anexosLista.length;aj++){
      var ax=gg.anexosLista[aj]; var st=savedAnx[ax.id];
      if(st){ if(st.categoria) ax.categoria=st.categoria; if(st.anotacoes) ax.anotacoes=st.anotacoes; }
      if(iaAnx[ax.id]) ax.analisadoIA=iaAnx[ax.id];
    }
  }
  function persistAnexo(ax){
    var sv=JSON.parse(localStorage.getItem('regula_anexos')||'{}');
    sv[ax.id]={categoria:ax.categoria,anotacoes:ax.anotacoes};
    localStorage.setItem('regula_anexos',JSON.stringify(sv));
  }
  // Extratos salvos do que a IA leu de cada anexo (por guia): { <anexoId>: {hash,nome,pacienteDoc,confereNome,extrato,ts} }
  function getAnxExtratosG(numeroGuia){ try{ return JSON.parse(localStorage.getItem('regula_anx_extrato_'+numeroGuia)||'{}'); }catch(e){ return {}; } }
  // Enriquece o resultado da análise (motor) com os fatos já lidos dos anexos, SEM reler os arquivos.
  // Adiciona alerta crítico de divergência de nome e nota de achado por anexo.
  function aplicarExtratosAnexosNaAnalise(g, ia){
    if(!ia) return ia;
    var ex=getAnxExtratosG(g.numero);
    var ids=Object.keys(ex); if(!ids.length) return ia;
    ia.alertas=ia.alertas||[]; ia.pendencias=ia.pendencias||[];
    ids.forEach(function(id){
      var e=ex[id]; if(!e) return;
      var nome=e.nome||'anexo';
      if((''+e.confereNome).toLowerCase()==='nao'){
        var al='⚠️ DIVERGÊNCIA DE NOME no anexo "'+nome+'": documento em nome de '+(e.pacienteDoc||'—')+', guia de '+((g.beneficiario&&g.beneficiario.nome)||'—')+' — possível anexo trocado.';
        if(ia.alertas.indexOf(al)<0) ia.alertas.unshift(al);
      }
      if(e.extrato){
        var nota='Anexo "'+nome+'" (lido pela IA): '+e.extrato;
        if(ia.pendencias.indexOf(nota)<0 && ia.alertas.indexOf(nota)<0) ia.pendencias.push(nota);
      }
    });
    return ia;
  }
  // Persiste um anexo NOVO (adicionado pelo usuário) na guia
  function persistAnexoNovo(numeroGuia, ax){
    var sv=JSON.parse(localStorage.getItem('regula_anexos_novos')||'{}');
    var arr=sv[numeroGuia]||[];
    // evita duplicar; guarda dados essenciais + conteúdo (dataURL) para visualização
    if(!arr.some(function(x){return x.id===ax.id;})) arr.push(ax);
    sv[numeroGuia]=arr;
    try{ localStorage.setItem('regula_anexos_novos',JSON.stringify(sv)); }
    catch(e){ toast('Arquivo grande demais para armazenar localmente (limite do navegador).','warn'); }
  }

  // Cadastro de enfermeiras — cada uma atende a um subconjunto de fluxos
  var ENFERMEIROS = [
    {id:'E1', nome:'Renata Lopes',   cor:'#0a8a43', fluxos:['F3','F4','F7'], especialidade:'Ambulatorial / Exames'},
    {id:'E2', nome:'Carla Mendonça', cor:'#2faa66', fluxos:['F2','F6'],      especialidade:'Alta Complexidade / Bariátrica'}
  ];

  // Permissões: "config"/"parametrizar" = ABRIR a tela (Auditor/Enfermeiro têm,
  // em modo leitura). A EDIÇÃO é controlada por ehGestor() (só Admin/Gestor).
  // "logs" = acesso à área de Logs (só Admin/Gestor).
  var perfilDef = {
    enfermeiro: {nome: ENFERMEIROS[0].nome, cor: ENFERMEIROS[0].cor,
                 perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta','config','parametrizar'],
                 fluxos: ENFERMEIROS[0].fluxos, enfermeiroId: ENFERMEIROS[0].id},
    auditor:    {nome:'Dr. Marcos Vinícius',cor:'#066b34', perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta','config','parametrizar']},
    gestor:     {nome:'Patrícia Andrade',  cor:'#054f27', perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta','config','parametrizar','logs']},
    // Administrador: tudo que o gestor faz + gerenciar usuários + chave de IA (acima de todos)
    admin:      {nome:'Administrador',     cor:'#021f10', perms:['ver','triagem','complemento','parecer','aprovar','reprovar','junta','config','parametrizar','logs','usuarios','configIA']}
  };
  function can(act){ var d=perfilDef[State.perfil]; return !!d && d.perms.indexOf(act)>=0; }
  // Admin e Gestor compartilham os mesmos poderes (exceto "usuarios", só do admin)
  // Aplica modo somente-leitura num container: desativa inputs/selects/botões e
  // bloqueia cliques de edição (usado quando Auditor/Enfermeiro só podem visualizar).
  function aplicarSomenteLeitura(container){
    if(!container) return;
    container.classList.add('cfg-readonly');
    container.querySelectorAll('input,select,textarea,button').forEach(function(el){
      // mantém ativos apenas controles de navegação/busca/filtro
      if(el.classList.contains('param-search')||el.classList.contains('cfg-tab')||el.classList.contains('vinc-tab')||el.classList.contains('subfluxo-tab')) return;
      el.disabled=true;
    });
  }
  function ehGestor(){ return State.perfil==='gestor' || State.perfil==='admin'; }

  // Retorna a etapa atualmente em execução de uma guia
  function etapaAtualIdx(g){
    for(var i=0;i<g.etapas.length;i++){ if(g.etapas[i].status==='em_execucao') return i; }
    // sem etapa em execução: se todas concluídas, a "atual" é a última; senão a primeira
    return g.etapas.every(function(e){return e.status==='concluida';}) ? g.etapas.length-1 : 0;
  }
  // Permissão de mover etapas: enfermeiro só avança; gestor/auditor/admin avançam e voltam.
  function podeMoverEtapa(dir){
    if(!ehGestor() && State.perfil==='enfermeiro') return dir>0; // enfermeiro: só avançar
    return State.perfil==='auditor' || State.perfil==='gestor' || State.perfil==='admin' || ehGestor();
  }
  // Move a etapa atual da guia uma posição adiante (dir=+1) ou atrás (dir=-1). Registra log.
  function moverEtapa(g, dir){
    if(!podeMoverEtapa(dir)){ toast(dir>0?'Sem permissão para avançar etapa':'Seu perfil não pode retornar etapas','warn'); return false; }
    var idx=etapaAtualIdx(g);
    var alvo=idx+dir;
    if(alvo<0 || alvo>=g.etapas.length){ toast(dir>0?'Já está na última etapa':'Já está na primeira etapa','warn'); return false; }
    var ts=new Date().toISOString().slice(0,16).replace('T',' ');
    var atual=g.etapas[idx], destino=g.etapas[alvo];
    if(dir>0){
      // avançar: conclui a atual, inicia a próxima
      atual.status='concluida'; if(!atual.fim) atual.fim=ts;
      destino.status='em_execucao'; if(!destino.inicio) destino.inicio=ts;
    } else {
      // voltar: a atual volta a aguardando, a anterior volta a em_execucao
      atual.status='aguardando'; atual.inicio=''; atual.fim='';
      destino.status='em_execucao'; destino.fim='';
    }
    var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
    MOCK.LOGS.unshift({ts:ts,user:uName,perfil:State.perfil,acao:(dir>0?'Etapa avançada':'Etapa retornada'),ref:'Guia '+g.numero+': '+atual.nome+' → '+destino.nome});
    logAcao(dir>0?'Etapa do fluxo avançada':'Etapa do fluxo retornada', g.numero+' — '+destino.nome);
    return true;
  }
  function etapaAtualDe(g){
    for(var i=0;i<g.etapas.length;i++){ if(g.etapas[i].status==='em_execucao') return g.etapas[i]; }
    return g.etapas[0]||null;
  }
  // Marca/desmarca uma etapa específica (não precisa ser a atual) como "Não realizado" — etapa pulada, não faz parte do fluxo seguido nesta guia.
  // Diferente de "aguardando": aguardando é uma etapa futura ainda não chegada; não_realizado é uma etapa que ficou de fora deliberadamente.
  function marcarEtapaNaoRealizada(g, idx, naoRealizada){
    if(!podeMoverEtapa(1)){ toast('Seu perfil não pode alterar o status das etapas','warn'); return false; }
    var et=g.etapas[idx]; if(!et) return false;
    if(et.status==='em_execucao'){ toast('A etapa em execução não pode ser marcada como não realizada','warn'); return false; }
    var ts=new Date().toISOString().slice(0,16).replace('T',' ');
    if(naoRealizada){
      et._statusAnterior=et.status; // guarda o estado (ex.: concluída) para restaurar ao reabrir
      et.status='nao_realizado'; et.inicio=''; et.fim='';
    } else {
      et.status = et._statusAnterior || 'aguardando'; // reabre no mesmo estado em que estava antes
      delete et._statusAnterior;
    }
    var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
    MOCK.LOGS.unshift({ts:ts,user:uName,perfil:State.perfil,acao:(naoRealizada?'Etapa marcada como não realizada':'Etapa desmarcada (voltou a aguardando)'),ref:'Guia '+g.numero+': '+et.nome});
    logAcao(naoRealizada?'Etapa marcada como não realizada':'Etapa reaberta', g.numero+' — '+et.nome);
    return true;
  }

  // Filtra as guias visíveis de acordo com o perfil ativo
  // Enfermeiro: só guias nos seus fluxos E cuja etapa atual é de responsabilidade do enfermeiro
  // Auditor: guias cuja etapa atual é de responsabilidade do auditor (inclui fluxos sem etapa enfermeiro)
  // Gestor: tudo; se State.visaoPerfil estiver definido, aplica a mesma lógica do perfil simulado
  function guiasVisiveis(){
    var base = State.guias;
    var efetivo = ehGestor() ? State.visaoPerfil : State.perfil;
    if(!efetivo) return base;
    if(efetivo === 'enfermeiro'){
      // Gestor pode filtrar por enfermeira específica; perfil enfermeiro usa seu próprio cadastro
      var fluxosEnf;
      if(ehGestor() && State.visaoEnfermeiros.length){
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
    // Auditor pode auditar QUALQUER guia (todos os perfis podem). A etapa "AUDITORIA EXTERNA - MÉDICO"
    // é apenas a fila de OBRIGAÇÃO do auditor — destacada na lista, sem restringir o acesso.
    return base;
  }
  // A guia está na fila de obrigação do auditor (etapa atual = AUDITORIA EXTERNA - MÉDICO)?
  function ehFilaAuditor(g){
    var et = etapaAtualDe(g);
    return !!(et && et.nome && et.nome.indexOf('AUDITORIA EXTERNA - MÉDICO')>=0);
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
        label='Auditor — vê todas as guias (fila de obrigação: AUDITORIA EXTERNA - MÉDICO)';
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
  // Formata ISO (yyyy-mm-dd) para dd/mm/aaaa; se houver hora, acrescenta ' HH:MM'
  function isoParaBR(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):String(iso); }
  function fmtDataEmissao(g){ var d=isoParaBR(g.dataEmissao); return g.horaEmissao ? d+' '+g.horaEmissao : d; }
  function mask(v){ if(ehGestor()) return v; if(!v) return ''; return v.replace(/\d(?=\d{2})/g,'•'); }
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
    else if(s==='Parcialmente liberada') cls='warn';
    else if(s==='Em junta médica') cls='info';
    else if(s==='Aguardando complemento'||s==='Cotação de OPME') cls='warn';
    var tip=_statusTips[s]||('Status atual da guia: '+s);
    return '<span class="badge '+cls+'" data-tip="'+esc(tip)+'">'+esc(s)+'</span>';
  }
  function riskPill(r,guiaNumero){
    var clickable=guiaNumero!=null;
    var tip=clickable?'Risco Regulatório · Clique para ver o cálculo':'Risco Regulatório';
    return '<span class="risk '+r+(clickable?' risk-clickable':'')+'"'+(clickable?' data-risco-guia="'+esc(String(guiaNumero))+'"':'')+' title="'+tip+'">'+r.charAt(0).toUpperCase()+r.slice(1)+'</span>';
  }
  function showRiscoCalculo(g){
    var det=calcRiscoDetalhe(g);
    var lim=State.riscoConfig.limiares;
    var nivel=calcRisco(g);
    var nivelLabel={baixo:'Baixo',medio:'Médio',alto:'Alto',critico:'Crítico'}[nivel]||nivel;
    var aplicaveis=det.itens.filter(function(it){return it.aplica;});
    var naoAplic=det.itens.filter(function(it){return !it.aplica;});
    function linhaAplic(it){
      return '<tr><td style="padding:7px 10px;font-size:12.5px">'+ico('check-circle',13)+' '+esc(it.label)+'</td>'+
        '<td style="padding:7px 10px;text-align:right;font-size:12.5px;font-weight:700;color:var(--g-700)">+'+it.peso+'</td></tr>';
    }
    function linhaNao(it){
      return '<tr style="opacity:.55"><td style="padding:6px 10px;font-size:12px">'+ico('minus',12)+' '+esc(it.label)+'</td>'+
        '<td style="padding:6px 10px;text-align:right;font-size:12px;color:var(--muted)">0</td></tr>';
    }
    var rowsAplic = aplicaveis.length
      ? aplicaveis.map(linhaAplic).join('')
      : '<tr><td colspan="2" style="padding:10px;color:var(--muted);font-size:12.5px">Nenhum fator de risco presente nesta guia.</td></tr>';

    var body=
      '<p style="font-size:13px;color:var(--muted);margin:0 0 14px">Este é o risco <b>Regulatório</b> — soma dos fatores <b>presentes</b> nesta guia, conforme pesos configurados em <b>Configurações → Classificação de Risco → Regulatório</b>. Os eixos Assistencial/Documental/Contratual são calculados à parte e não entram nesta soma.</p>'+
      '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--g-700);margin-bottom:4px">Fatores presentes</div>'+
      '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">'+
        '<thead><tr><th style="text-align:left;padding:0 10px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Fator</th>'+
        '<th style="text-align:right;padding:0 10px 8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">Pontos</th></tr></thead>'+
        '<tbody>'+rowsAplic+
        '<tr style="border-top:1.5px solid var(--g-100)"><td style="padding:9px 10px;font-weight:700">Total</td>'+
        '<td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;color:var(--g-700)">'+det.score+'</td></tr>'+
        '</tbody>'+
      '</table>'+
      (naoAplic.length
        ? '<details style="margin-bottom:14px"><summary style="cursor:pointer;font-size:11.5px;color:var(--muted);padding:6px 0">Ver fatores não aplicáveis a esta guia ('+naoAplic.length+')</summary>'+
          '<table style="width:100%;border-collapse:collapse;margin-top:4px"><tbody>'+naoAplic.map(linhaNao).join('')+'</tbody></table></details>'
        : '')+
      '<div style="background:var(--g-50);border:1px solid var(--g-100);border-radius:8px;padding:10px 14px;font-size:12.5px;color:var(--ink-2);line-height:1.7">'+
        '<b>Faixas:</b> Baixo até '+lim.baixo+' · Médio até '+lim.medio+' · Alto até '+lim.alto+' · Crítico acima de '+lim.alto+'<br>'+
        '<b>Resultado:</b> '+det.score+' pontos → <span class="risk '+nivel+'" style="margin-left:4px">'+nivelLabel+'</span>'+
      '</div>';
    modal(ico('shield-alert',16)+' Cálculo do risco Regulatório','Guia '+esc(g.numero),body);
  }
  document.addEventListener('click',function(e){
    var pill=e.target.closest&&e.target.closest('.risk-clickable');
    if(!pill) return;
    var numero=pill.getAttribute('data-risco-guia');
    var g=State.guias.find(function(gg){return String(gg.numero)===numero;});
    if(g) showRiscoCalculo(g);
  });
  function aderenciaBar(p,iaOuGuia){
    var cls   = p>=90?'alta':(p>=70?'mod':(p>=50?'baixa':'crit'));
    var label = p>=90?'Alta':(p>=70?'Moderada':(p>=50?'Baixa':'Crítica'));
    var fatores='';
    var cache = iaOuGuia && iaOuGuia.criteriosCumpridos ? iaOuGuia : (iaOuGuia && iaOuGuia._cache);
    if(cache && cache.criteriosCumpridos){
      var ok=cache.criteriosCumpridos.slice(0,4);
      if(ok.length) fatores=' Fatores considerados: '+ok.join('; ')+(cache.criteriosCumpridos.length>4?'…':'')+'.';
    }
    var tip   = 'Aderência regulatória — '+label+' ('+p+'%). '
              + 'Indica o grau de conformidade da guia com os critérios técnicos e documentais exigidos '
              + '(documentação, DUT quando aplicável, vinculação de procedimentos/pacotes/Mat-Med/diárias e cobertura contratual). '
              + 'Escala: Alta 90–100% · Moderada 70–89% · Baixa 50–69% · Crítica abaixo de 50%.'+fatores;
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
    // Fatores ativos do cálculo de risco (UTI, OPME, aderência, alta complexidade
    // e oncologia foram removidos — cobertos por indicadores/fluxos próprios).
    add('Regime de urgência',          g.regime==='Urgência',                                       p.urgencia);
    add('Prazo de auditoria vencido',  g.prazoVencido,                                               p.prazoVencido);
    var _isIntCir=g.tipo==='Cirurgia'||g.tipo==='Cirurgia neuro'||g.tipo==='Cirurgia ortopédica';
    var _isIntClin=g.natureza==='Internação'&&!_isIntCir&&!g.uti;
    var _isAmb=g.natureza==='Ambulatorial'||(!g.uti&&!_isIntCir&&!_isIntClin&&g.diariasTaxas.length===0);
    add('Internação cirúrgica',        _isIntCir,   p.intCirurgica);
    add('Internação clínica',          _isIntClin,  p.intClinica);
    add('Ambulatorial',                _isAmb,      p.ambulatorial);
    var ad=guiaAderencia(g);
    return {score:score, itens:itens, aderencia:ad};
  }
  function calcRiscoScore(g){ return calcRiscoDetalhe(g).score; }

  // Calcula as 4 dimensões de risco da guia (Regulatório, Assistencial, Documental, Contratual).
  // Cada dimensão soma pontos de fatores reais e cai numa faixa. Retorna {val, itens} por dimensão.
  function calc4Riscos(g){
    var temDUT=(g.procedimentos||[]).some(function(p){return p.dut;});
    var temOPME=(g.matmed||[]).some(function(m){return m.opme;});
    var isOnco = g.tipo==='Quimioterapia' || (g.matmed||[]).some(function(m){return /imunobiol|oncolog|quimio/i.test(m.desc||'');});
    var altaComplex = g.tipo==='Cirurgia neuro' || g.tipo==='Cirurgia ortopédica';
    var custoAlto = (g.diariasTaxas||[]).length>1 || temOPME;

    // Condições de cada fator (por key) — usadas com os pesos/limiares parametrizados em Configurações
    var COND = {
      assistencial:{ uti:!!g.uti, opme:temOPME, onco:isOnco, altaComplex:altaComplex, urgencia:g.regime==='Urgência' },
      documental:  { semAnexo:!g.anexos, dutNaoComp:(temDUT && !g.dut), prazoVenc:!!g.prazoVencido },
      contratual:  { internacao:g.natureza==='Internação', altoCusto:custoAlto, dut:temDUT, urgencia:g.regime==='Urgência' }
    };
    // Monta uma dimensão a partir da config (pesos + limiares) e das condições
    function dim(dimKey){
      var cfg=(State.risco4Config&&State.risco4Config[dimKey])||DEFAULT_RISCO4_CFG[dimKey];
      var lim=cfg.limiares||DEFAULT_RISCO4_CFG[dimKey].limiares;
      function faixa(sc){ return sc>lim.alto?'critico':(sc>lim.medio?'alto':(sc>lim.baixo?'medio':'baixo')); }
      var sc=0, itens=[];
      RISCO4_DIMS[dimKey].fatores.forEach(function(f){
        var pts=(cfg.pesos&&cfg.pesos[f.key]!=null)?cfg.pesos[f.key]:0;
        var aplica=!!COND[dimKey][f.key];
        if(aplica) sc+=pts;
        itens.push({label:f.label, aplica:aplica, pts:pts});
      });
      return {val:faixa(sc), score:sc, itens:itens};
    }

    // REGULATÓRIO — usa o motor de risco já parametrizável (Configurações → Classificação de Risco → Regulatório)
    var regulat = { val:g.risco||'baixo', itens:[
      {label:'Risco calculado pelo motor (fatores parametrizáveis)', aplica:true, pts:0, obs:'Configurações → Classificação de Risco'}
    ]};

    return {
      regulatorio:regulat,
      assistencial:dim('assistencial'),
      documental:dim('documental'),
      contratual:dim('contratual')
    };
  }

  // Modal que explica como uma das 4 dimensões de risco foi calculada
  function showRisco4Detalhe(g, r){
    var lblFaixa={baixo:'Baixo',medio:'Médio',alto:'Alto',critico:'Crítico'};
    var isRegulat = r.label==='Regulatório';
    var linhas = (r.itens||[]).map(function(it){
      if(isRegulat){
        return '<tr><td>'+esc(it.label)+'</td><td style="text-align:right;color:var(--muted)">'+esc(it.obs||'')+'</td></tr>';
      }
      return '<tr class="'+(it.aplica?'r4-on':'r4-off')+'">'+
        '<td>'+(it.aplica?ico('check-circle-2',13):ico('circle',13))+' '+esc(it.label)+'</td>'+
        '<td style="text-align:right;white-space:nowrap">'+(it.aplica?'+'+it.pts+' pts':'<span style="color:var(--muted)">—</span>')+'</td>'+
      '</tr>';
    }).join('');
    var totalPts=(r.itens||[]).reduce(function(s,it){return s+(it.aplica?(it.pts||0):0);},0);
    var explica = isRegulat
      ? '<p style="font-size:12.5px;color:var(--muted);line-height:1.55">O risco <b>Regulatório</b> vem do <b>motor de classificação de risco</b> do sistema, parametrizável em <b>Configurações → Classificação de Risco</b> (fatores, pesos e limiares). É a mesma classificação exibida na relação de guias.</p>'
      : '<p style="font-size:12.5px;color:var(--muted);line-height:1.55">Cada fator presente na guia soma pontos. A soma cai numa faixa: <b>0–2 Baixo · 3–4 Médio · 5–6 Alto · 7+ Crítico</b>. Total desta guia: <b>'+totalPts+' pts</b>.</p>';
    var body=
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'+
        '<span class="guia-risk-ico">'+ico(r.ico,20)+'</span>'+
        '<div><div style="font-weight:700;font-size:15px">Risco '+esc(r.label)+'</div>'+riskPill(r.val)+' <span style="font-size:12px;color:var(--muted)">'+ (lblFaixa[r.val]||r.val) +'</span></div>'+
      '</div>'+
      explica+
      '<table class="cfg-table" style="margin-top:10px"><thead><tr><th>'+(isRegulat?'Origem':'Fator avaliado')+'</th><th style="text-align:right">'+(isRegulat?'':'Pontos')+'</th></tr></thead><tbody>'+linhas+'</tbody></table>';
    var m=modal('Como o risco '+esc(r.label)+' é calculado', 'Guia '+esc(g.numero), body, '<button class="btn ghost" id="r4Fechar">Fechar</button>');
    m.querySelector('#r4Fechar').onclick=function(){ m.parentNode.remove(); };
  }

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
      var isSub=o.getAttribute&&o.getAttribute('data-sub')==='1';
      var item=el('div',{class:'csel-item'+(o.selected?' active':'')+(isSub?' csel-sub':'')});
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
  window.makeCustomSelect = makeCustomSelect; // exposto para o módulo Relatórios padronizar seus selects
  window.makeDateRangePicker = makeDateRangePicker; // exposto para o módulo Relatórios usar o filtro de período padrão

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

  /* === Fecha todos os modais abertos (usado ao trocar de página) === */
  function fecharModais(){
    $$('.modal-backdrop').forEach(function(bd){ bd.remove(); });
    document.body.style.overflow='';
    document.body.classList.remove('modal-aberto');
  }

  // Oculta itens do menu conforme a permissão do perfil ativo (ex.: Logs só Gestor/Admin)
  function aplicarVisibilidadeNav(){
    var logsItem=document.querySelector('.nav-item[data-route="logs"]');
    if(logsItem) logsItem.style.display=can('logs')?'':'none';
  }

  /* === Sidebar / nav === */
  function bindNav(){
    aplicarVisibilidadeNav();
    $$('.nav-item').forEach(function(a){
      if(a.id==='chatToggleBtn') return; // tratado pelo initChat (não fecha modal)
      a.onclick=function(){
        var rota=a.getAttribute('data-route');
        // Bloqueio de rota: Logs exige permissão (Gestor/Admin)
        if(rota==='logs' && !can('logs')){ toast('Acesso restrito ao Gestor/Administrador','err'); return; }
        fecharModais(); // ao trocar de página, fecha qualquer modal aberto
        State.route=rota;
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
      if(profile==='admin'){
        users=[{nome:perfilDef.admin.nome, cor:perfilDef.admin.cor, profile:'admin', enfId:'', sub:'Acesso total + Usuários'}];
        label='Administrador';
      } else if(profile==='gestor'){
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
            // Se o perfil perdeu acesso à rota atual (ex.: Logs), volta ao Dashboard
            if(State.route==='logs' && !can('logs')){ State.route='dashboard'; }
            fabClose(); renderUserChip(); aplicarVisibilidadeNav(); render();
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

  var PERFIL_NOMES={admin:'Administrador',gestor:'Gestor',auditor:'Auditor',enfermeiro:'Enfermeiro'};
  function renderUserChip(){
    var u=perfilDef[State.perfil];
    $('#userName').textContent=u.nome;
    $('#userRole').textContent=PERFIL_NOMES[State.perfil]||State.perfil;
    $('#userAvatar').textContent=u.nome.charAt(0);
    $('#userAvatar').style.background=u.cor;
    // Marca ativo no FAB (perfil ativo = anel no botão do tipo de perfil)
    $$('#fabMenu button').forEach(function(b){ b.classList.remove('fab-active'); });
    var fabActive=$('#fabMenu button[data-profile="'+State.perfil+'"]');
    if(fabActive) fabActive.classList.add('fab-active');
  }

  /* === Módulo Relatórios (isolado em relatorios.js) === */
  function viewRelatorios(){
    if(!window.RELATORIOS){
      return el('div',{class:'panel',style:'padding:24px'},ico('alert-triangle',18)+' Módulo Relatórios não carregado.');
    }
    return window.RELATORIOS.view({
      el:el, ico:ico, esc:esc, lcIcons:lcIcons, modal:modal,
      guias: guiasVisiveis(), State: State
    });
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
    else if(State.route==='relatorios') v.appendChild(viewRelatorios());
    else if(State.route==='param') v.appendChild(viewParam());
    else if(State.route==='logs'){ if(can('logs')) v.appendChild(viewLogs()); else { State.route='dashboard'; v.appendChild(viewDashboard()); } }
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
    if(ehGestor() && State.visaoPerfil) tituloExtra=' <span class="badge info">Visão: '+State.visaoPerfil+'</span>';
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
    if(!ehGestor()){
      var bann=el('div',{class:'perfil-banner'});
      var bIcon=State.perfil==='enfermeiro'?'stethoscope':'search';
      var _filaN=State.perfil==='auditor'?guias.filter(function(gg){return ehFilaAuditor(gg);}).length:0;
      var bMsg=State.perfil==='enfermeiro'
        ?'Você está visualizando '+guias.length+' guia(s) atribuída(s) ao perfil Enfermeiro nos fluxos: '+perfilDef.enfermeiro.fluxos.join(', ')+'.'
        :'Você pode auditar qualquer uma das '+guias.length+' guia(s). <b>'+_filaN+'</b> na sua fila de obrigação (etapa AUDITORIA EXTERNA - MÉDICO), destacadas com "Sua fila".';
      bann.innerHTML=ico(bIcon,14)+' '+bMsg;
      wrap.appendChild(bann);
    }

    // Seletor de visão para Gestor/Admin
    if(ehGestor()) renderVisaoBar(wrap);

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
            '<div class="rank-row" data-etapa="'+esc(r.nome)+'" style="display:grid;grid-template-columns:22px 1fr 56px 112px;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:'+(idx%2===0?'var(--g-50)':'#fff')+'">'+
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
                '<span class="badge '+(r.stuck?'danger':'muted')+'" style="font-size:10px;white-space:nowrap" title="'+r.cnt+' guia(s) nesta etapa'+(r.stuck?', '+r.stuck+' parada(s) agora':'')+'">'+
                  r.cnt+' guia'+(r.cnt>1?'s':'')+(r.stuck?' · '+r.stuck+' parada'+(r.stuck>1?'s':''):'')+
                '</span>'+
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
              // Todas as guias que passaram por esta etapa (parada ou já concluída)
              var sub=guias.filter(function(g){
                return (g.etapas||[]).some(function(e){return e.nome===nome&&e.status!=='aguardando';});
              });
              var paradas=sub.filter(function(g){
                return (g.etapas||[]).some(function(e){return e.nome===nome&&e.status==='em_execucao';});
              }).length;
              var t2;
              if(sub.length){
                t2='<table style="width:100%"><thead><tr><th>Nº Guia</th><th>Beneficiário</th><th>Dias</th><th>Status</th></tr></thead><tbody>'+
                  sub.map(function(g,i){
                    var parada=(g.etapas||[]).some(function(e){return e.nome===nome&&e.status==='em_execucao';});
                    return '<tr class="'+(i%2===0?'log-row-a':'log-row-b')+' kpi-modal-row" data-num="'+esc(g.numero)+'"><td>'+esc(g.numero)+(parada?' <span class="badge danger" style="font-size:9px">parada</span>':'')+'</td><td>'+esc(g.beneficiario.nome)+'</td><td><b>'+g.diasAuditoria+'</b></td><td>'+statusBadge(g.status)+'</td></tr>';
                  }).join('')+
                  '</tbody></table>';
              } else {
                t2='<div class="empty">'+icoLg('inbox')+'<div>Nenhuma guia passou por esta etapa no período.</div></div>';
              }
              var foot2=sub.length+' guia(s)'+(paradas?' · '+paradas+' parada(s) agora':'');
              var m2=modal(esc(nome),'Guias nesta etapa',t2,foot2);
              setTimeout(function(){
                $$('.kpi-modal-row',m2).forEach(function(tr){
                  tr.style.cursor='pointer';
                  tr.onclick=function(){var g=guias.filter(function(x){return x.numero===tr.getAttribute('data-num');})[0];if(g)openGuia(g,'etapas');};
                });
              },0);
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
          'A IA pontua cada guia considerando <b>4 eixos de risco</b>, cada um com peso configurável em Configurações → Classificação de Risco:'+
        '</div>'+
        '<div style="font-size:10.5px;color:var(--ink);margin-top:6px;line-height:1.65">'+
          '<div><b style="color:var(--g-700)">Regulatório</b> — documentação obrigatória, DUT, vinculação de procedimentos e Mat/Med.</div>'+
          '<div><b style="color:var(--g-700)">Assistencial</b> — UTI, OPME, oncologia/imunobiológico, alta complexidade e regime de urgência.</div>'+
          '<div><b style="color:var(--g-700)">Documental</b> — anexos ausentes, DUT não comprovada e prazo de auditoria vencido.</div>'+
          '<div><b style="color:var(--g-700)">Contratual</b> — internação, OPME/alto custo, DUT contratual e garantia de atendimento.</div>'+
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
    var _especMap=MOCK.ESPEC_MAP||{'Internação':'Clínica Médica','Cirurgia':'Cirurgia Geral','Quimioterapia':'Oncologia','Cirurgia neuro':'Neurocirurgia','Cirurgia ortopédica':'Ortopedia','Exame imagem':'Radiologia','Exame':'Clínica Médica','Hemodinâmica':'Cardiologia','Junta médica':'Multiprofissional'};
    wrap.appendChild(el('div',{class:'page-title'},'<div><h1>Relação de Guias</h1><p>Filtre, audite e emita parecer da operadora com apoio da análise técnica.</p></div><div style="display:flex;gap:8px;align-items:center"><button class="btn ghost" id="btnClear">'+ico('x',13)+' Limpar filtros</button><button class="btn-animated" id="btnExport">'+ico('download')+' Exportar Excel</button></div>'));

    // Banner de contexto de perfil
    if(!ehGestor()){
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
        MOCK.naturezaSelectHTML(State.filtros.natureza,'id="fNaturezaC"')+
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
        {id:'faNatureza',  label:'Natureza',             opts:['Ambulatorial','Internação'].concat(MOCK.SUB_INTERNACAO.map(function(s){return 'Internação '+s;})), key:'natureza'},
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
      if(f.natureza){
        // 'Ambulatorial' | 'Internação' (todas) | 'Internação <Subtipo>' (específico)
        if(f.natureza==='Internação'){ if(g.natureza!=='Internação') return false; }
        else if(MOCK.naturezaDetalhada(g)!==f.natureza) return false;
      }
      if(f.congenere&&g.congenere!==f.congenere) return false;
      if(f.solicitante&&g.solicitante!==f.solicitante) return false;
      if(f.opme==='Sim'&&!g.opme) return false;
      if(f.opme==='Não'&&g.opme) return false;
      if(f.uti==='Sim'&&!g.uti) return false;
      if(f.uti==='Não'&&g.uti) return false;
      if(f.especialidade&&(_especMap[g.tipo]||'')!==f.especialidade) return false;
      if(f.dataDeEmissao&&g.dataEmissao<f.dataDeEmissao) return false;
      if(f.dataAteEmissao&&g.dataEmissao>f.dataAteEmissao) return false;
      if(q && (g.numero+' '+g.beneficiario.nome+' '+g.prestadorSol.nome+' '+g.tipo).toLowerCase().indexOf(q)<0) return false;
      return true;
    });

    // Chips de filtros rápidos
    var quickChips=[
      {key:'status',label:'Status'},
      {key:'natureza',label:'Natureza'},
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
          ((State.perfil==='auditor' && ehFilaAuditor(g))?' <span class="badge fila-aud" title="Etapa AUDITORIA EXTERNA - MÉDICO: sua fila de auditoria">'+ico('stethoscope',10)+' Sua fila</span>':'')+
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
      $('#fNaturezaC').onchange=function(){State.filtros.natureza=this.value;render()};
      var fesp=$('#fEspec'); if(fesp) fesp.onchange=function(){State.filtros.especialidade=this.value;render();};
      ['#fStatus','#fFluxo','#fOrigem','#fRisco','#fEspec','#fNaturezaC','#fOpme','#fUti'].forEach(function(id){ var s=$(id); if(s) makeCustomSelect(s); });
      var _drpInstance = makeDateRangePicker(
        $('#fPeriodoWrap'),
        State.filtros.dataDeEmissao,
        State.filtros.dataAteEmissao,
        function(de, ate){ State.filtros.dataDeEmissao=de; State.filtros.dataAteEmissao=ate; render(); }
      );
      $('#btnClear').onclick=function(){
        State.filtros={q:'',status:'',fluxo:'',origem:'',risco:'',benef:'',prest:'',tipo:'',natureza:'',congenere:'',solicitante:'',opme:'',uti:'',especialidade:'',dataDeEmissao:'',dataAteEmissao:'',sortCol:'',sortDir:''};
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
      if(kf.tipo){
        if(kf.tipo==='Internação'){ if(g.natureza!=='Internação') return false; }
        else if(MOCK.naturezaDetalhada(g)!==kf.tipo) return false;
      }
      if(kf.especialidade&&MOCK.especialidadeDaGuia(g)!==kf.especialidade) return false;
      return true;
    });
    var total=guias.length;

    wrap.appendChild(el('div',{class:'page-title'},
      '<div><h1>'+ico('columns-3',18)+' Kanban de Guias</h1><p>Acompanhamento visual por status — clique em qualquer card para detalhar.</p></div>'+
      '<div style="display:flex;gap:8px;align-items:center"><span style="font-size:12px;color:var(--muted)">'+total+' guia(s) visíveis</span></div>'
    ));

    // Barra de filtro de período
    var bar=el('div',{class:'k-period-bar'});

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
    var hasKF=kf.colunas.length||kf.uti||kf.regime||kf.tipo||kf.especialidade;

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
    function fltItem(label,isSelected,onclick,isSub){
      var item=el('div',{class:'k-flt-item'+(isSelected?' sel':'')+(isSub?' k-flt-sub':'')});
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

    // Natureza (mesmo padrão dos demais filtros do Kanban: makeFltWrap + fltItem)
    // Rótulo do botão: nome do subtipo/valor selecionado, ou "Natureza" quando sem filtro
    var natLabel=kf.tipo ? kf.tipo.replace(/^Internação\s+/,'') : 'Natureza';
    fbar.appendChild(makeFltWrap('bed',natLabel,kf.tipo!=='',function(drop){
      function setNat(v){ return function(){ State.kanbanFiltros.tipo=v; render(); }; }
      drop.appendChild(fltItem('Todos',kf.tipo==='',setNat('')));
      drop.appendChild(fltItem('Ambulatorial',kf.tipo==='Ambulatorial',setNat('Ambulatorial')));
      drop.appendChild(el('div',{class:'k-flt-sep'}));
      drop.appendChild(fltItem('Internação (todas)',kf.tipo==='Internação',setNat('Internação')));
      MOCK.SUB_INTERNACAO.forEach(function(s){
        var v='Internação '+s;
        drop.appendChild(fltItem(s,kf.tipo===v,setNat(v),true)); // isSub → recuo
      });
    }));

    // Especialidade (derivada do tipo da guia)
    var especOpts=(function(){var s={};guias.forEach(function(g){var e=MOCK.especialidadeDaGuia(g);if(e)s[e]=1;});return Object.keys(s).sort();}());
    var especLabel=kf.especialidade||'Especialidade';
    fbar.appendChild(makeFltWrap('stethoscope',especLabel,kf.especialidade!=='',function(drop){
      drop.appendChild(fltItem('Todas',kf.especialidade==='',function(){ State.kanbanFiltros.especialidade=''; render(); }));
      drop.appendChild(el('div',{class:'k-flt-sep'}));
      especOpts.forEach(function(e){
        drop.appendChild(fltItem(e,kf.especialidade===e,(function(v){
          return function(){ State.kanbanFiltros.especialidade=v; render(); };
        })(e)));
      });
    }));

    if(hasKF){
      var btnClearKF=el('button',{class:'btn ghost',style:'font-size:12px;padding:4px 10px;height:auto;display:flex;align-items:center;gap:4px;margin-left:4px'});
      btnClearKF.innerHTML=ico('x',12)+' Limpar';
      btnClearKF.onclick=function(){ State.kanbanFiltros={colunas:[],uti:'',regime:'',tipo:'',especialidade:''}; render(); };
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
        // OPME e UTI são indicadores próprios. O regime (Urgência/Eletivo) já é
        // exibido na pílula k-regime do rodapé — não repetir como badge "URG".
        var badges=(g.opme?'<span class="badge warn" style="font-size:10px">OPME</span>':'')+
                   (g.uti?'<span class="badge info" style="font-size:10px">UTI</span>':'');

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
            aderenciaBar(ad,g)+
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
    var editavelParam=ehGestor(); // Admin/Gestor editam; Auditor/Enfermeiro só visualizam
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
        (editavelParam?'<button class="btn-animated" id="btnSalvarFluxo">'+ico('save',13)+' Salvar instruções</button>':'<span class="badge muted" style="font-size:11px">'+ico('eye',11)+' Somente leitura</span>');
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
          _wWrap.appendChild(_wTbl);

          // ── SIMULADOR AO VIVO: mostra o impacto dos pesos numa guia-exemplo ──
          // Fatores de cumprimento por critério (iguais aos do ai-engine.js):
          var CUMPR={documental:1, dut:1, procedimento:0.9, pacote:1, matmed:0.8, diaria:0.85, contratual:0.95, historico:0.9};
          // Estado da guia-exemplo (o que ela "tem" / cumpre)
          var simGuia={ documental:true, temDut:true, dutOk:true, procedimento:true, pacote:true, matmed:true, diaria:true };
          function lerPesosAtuais(){
            var p={}; _wTbl.querySelectorAll('.ia-peso-range').forEach(function(inp){ p[inp.getAttribute('data-key')]=+inp.value; }); return p;
          }
          // Recalcula a aderência da guia-exemplo com os pesos atuais (mesma lógica do motor)
          function calcSim(){
            var p=lerPesosAtuais();
            var linhas=[], total=0, cumpr=0;
            function add(nome,aplica,pesoBase,fator,cumpreBool,obs){
              if(!aplica){ linhas.push({nome:nome, na:true, obs:obs}); return; }
              var teto=pesoBase; total+=teto;
              var got = cumpreBool ? Math.round(pesoBase*fator*10)/10 : 0;
              cumpr+=got;
              linhas.push({nome:nome, got:got, teto:teto, ok:cumpreBool, obs:obs});
            }
            add('Documental', true, p.documental, CUMPR.documental, simGuia.documental, simGuia.documental?'anexos presentes':'sem anexos');
            add('DUT', simGuia.temDut, p.dut, CUMPR.dut, simGuia.dutOk, simGuia.temDut?(simGuia.dutOk?'comprovada':'não comprovada'):'não se aplica');
            add('Procedimentos', simGuia.procedimento, p.procedimento, CUMPR.procedimento, true, 'vinculado');
            add('Pacotes', simGuia.pacote, p.pacote, CUMPR.pacote, true, 'vinculado');
            add('Mat/Med', simGuia.matmed, p.matmed, CUMPR.matmed, true, 'vinculado');
            add('Diárias/Taxas', simGuia.diaria, p.diaria, CUMPR.diaria, true, 'vinculado');
            add('Contratual/Histórico', true, p.contratual, CUMPR.contratual, true, 'cobertura verificada');
            var perc = total>0 ? Math.round((cumpr/total)*100) : 0;
            return {linhas:linhas, total:Math.round(total*10)/10, cumpr:Math.round(cumpr*10)/10, perc:perc};
          }
          function faixaCor(p){ return p>=90?'#16a34a':(p>=70?'#a16207':(p>=50?'#c2410c':'#b91c1c')); }
          function faixaLbl(p){ return p>=90?'Alta':(p>=70?'Moderada':(p>=50?'Baixa':'Crítica')); }

          var _sim=el('div',{class:'pesos-sim'});
          function renderSim(){
            var r=calcSim();
            var toggles=[
              ['documental','Documentação anexada'],
              ['temDut','Tem procedimento com DUT'],
              ['dutOk','DUT comprovada', 'temDut'],
              ['procedimento','Procedimentos vinculados'],
              ['pacote','Pacotes vinculados'],
              ['matmed','Mat/Med vinculados'],
              ['diaria','Diárias/Taxas vinculadas']
            ];
            var togHTML=toggles.map(function(t){
              var on=simGuia[t[0]];
              var dep=t[2]; var disabled=dep && !simGuia[dep];
              return '<label class="sim-tog'+(on&&!disabled?' on':'')+(disabled?' dis':'')+'" data-sim="'+t[0]+'">'+
                '<span class="sim-tog-box">'+(on&&!disabled?ico('check',11):'')+'</span>'+esc(t[1])+'</label>';
            }).join('');
            var rows=r.linhas.map(function(l){
              if(l.na) return '<tr class="sim-na"><td>'+esc(l.nome)+'</td><td colspan="2" style="color:var(--muted);font-size:11.5px">— não se aplica ('+esc(l.obs)+')</td></tr>';
              var pctLinha = l.teto>0?Math.round(l.got/l.teto*100):0;
              return '<tr'+(l.ok?'':' class="sim-fail"')+'>'+
                '<td>'+esc(l.nome)+'</td>'+
                '<td style="text-align:right;white-space:nowrap"><b>'+l.got+'</b> / '+l.teto+' pts</td>'+
                '<td style="width:110px"><span class="sim-bar"><span style="width:'+pctLinha+'%;background:'+(l.ok?'var(--g-500)':'#e5c07b')+'"></span></span></td>'+
              '</tr>';
            }).join('');
            _sim.innerHTML=
              '<div class="pesos-sim-hd">'+ico('sliders-horizontal',14)+' Simulador ao vivo — impacto dos pesos</div>'+
              '<div class="pesos-sim-body">'+
                '<div class="sim-left">'+
                  '<div class="sim-sub">Guia de exemplo (marque o que ela cumpre):</div>'+
                  '<div class="sim-togs">'+togHTML+'</div>'+
                '</div>'+
                '<div class="sim-right">'+
                  '<div class="sim-score" style="color:'+faixaCor(r.perc)+'">'+r.perc+'%<span class="sim-score-lbl">'+faixaLbl(r.perc)+'</span></div>'+
                  '<div class="sim-prog"><span style="width:'+r.perc+'%;background:'+faixaCor(r.perc)+'"></span></div>'+
                  '<div class="sim-formula">'+r.cumpr+' pts cumpridos ÷ '+r.total+' pts de teto</div>'+
                '</div>'+
              '</div>'+
              '<table class="sim-tbl"><thead><tr><th>Critério</th><th style="text-align:right">Cumprido / Teto</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'+
              '<div class="sim-hint">'+ico('info',12)+' Os pesos não se somam entre si por regra — o que os liga é o <b>teto</b> (denominador). Como aderência = cumprido ÷ teto, <b>aumentar o peso de um critério faz a falha nele "pesar" mais</b> e dilui o peso relativo dos demais. Mova os sliders acima e veja o percentual mudar.</div>';
            lcIcons();
            // liga os toggles
            _sim.querySelectorAll('.sim-tog').forEach(function(el2){
              el2.onclick=function(){
                var k=el2.getAttribute('data-sim');
                if(el2.classList.contains('dis')) return;
                simGuia[k]=!simGuia[k];
                if(k==='temDut' && !simGuia.temDut) simGuia.dutOk=false;
                renderSim();
              };
            });
          }
          renderSim();
          _wWrap.appendChild(_sim);

          // Recalcula o simulador ao mover qualquer slider (além de atualizar o número)
          _wTbl.addEventListener('input',function(e){
            if(e.target.classList.contains('ia-peso-range')){
              e.target.parentNode.querySelector('.ia-peso-val').textContent=e.target.value;
              renderSim();
            }
          });

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
          if(editavelParam) _wWrap.appendChild(_wBar);
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
          if(editavelParam) vincPanel.appendChild(saveBar);
        }
        lcIcons();
        // Auditor/Enfermeiro: bloqueia edição (prompts dos subfluxos, pesos e instruções)
        if(!editavelParam) aplicarSomenteLeitura(vincPanel);
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
      var isGestor=ehGestor();
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
    {key:'verGuias',     label:'Visualizar guias e dashboard',           desc:'Leitura de guias, indicadores e painel geral',                             p:['admin','gestor','auditor','enfermeiro'], v:[]},
    {key:'triagem',      label:'Triagem e complemento de documentação',  desc:'Solicitar documentos, triagem inicial e registrar pendências',            p:['admin','gestor','auditor','enfermeiro'], v:[]},
    {key:'parecer',      label:'Emitir parecer técnico',                 desc:'Registrar pareceres de análise clínica e regulatória em guias',           p:['admin','gestor','auditor'],              v:[]},
    {key:'aprovar',      label:'Aprovar guias',                          desc:'Emitir autorização de procedimentos que atendem aos critérios técnicos',  p:['admin','gestor','auditor'],              v:[]},
    {key:'reprovar',     label:'Reprovar guias',                         desc:'Negar procedimentos por não conformidade técnica ou regulatória',         p:['admin','gestor','auditor'],              v:[]},
    {key:'juntaMedica',  label:'Encaminhar para junta médica',           desc:'Solicitar avaliação multidisciplinar por junta médica',                  p:['admin','gestor','auditor'],              v:[]},
    {key:'migrarPerfil', label:'Migrar entre perfis / visão geral',      desc:'Alternar entre perfis e visualizar as demandas de todos os usuários',    p:['admin','gestor'],                        v:[]},
    {key:'config',       label:'Configurações (Risco e Fluxos)',         desc:'Admin e Gestor editam; Auditor e Enfermeiro visualizam, sem alterar',     p:['admin','gestor'],                        v:['auditor','enfermeiro']},
    {key:'permissoes',   label:'Editar matriz de Permissões',            desc:'Acessar e editar a aba Permissões — exclusivo do Administrador',          p:['admin'],                                 v:[]},
    {key:'parametrizar', label:'Parametrizar fluxos, DUT e vinculações', desc:'Admin e Gestor editam/inserem prompts e pesos; Auditor e Enfermeiro visualizam', p:['admin','gestor'],                  v:['auditor','enfermeiro']},
    {key:'logs',         label:'Acessar Logs e Rastreabilidade',         desc:'Área de Logs — exclusiva de Administrador e Gestor',                      p:['admin','gestor'],                        v:[]},
    {key:'dadosSensiveis',label:'Dados sensíveis sem mascaramento',      desc:'CPF, cartão e informações pessoais exibidos sem ocultação de dígitos',   p:['admin','gestor'],                        v:[]},
    {key:'usuarios',     label:'Gerenciar usuários',                     desc:'Cadastrar, editar e inativar usuários — exclusivo do Administrador',      p:['admin'],                                 v:[]},
    {key:'configIA',     label:'Configurar chave de API (Assistente IA)',desc:'Inserir/editar a chave do provedor de IA — exclusivo do Administrador',   p:['admin'],                                 v:[]},
  ];
  var PERM_PROFILES=['admin','gestor','auditor','enfermeiro'];
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
    var editable=ehGestor();
    var profileColors={admin:'#021f10',gestor:'#054f27',auditor:'#066b34',enfermeiro:'#0a8a43'};
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
    ];
    // Aba Permissões: exclusiva do Administrador
    if(State.perfil==='admin') CFG_TABS.push({id:'permissoes', label:'Permissões', ico:'shield'});
    // Aba Usuários: exclusiva do Administrador
    if(can('usuarios')) CFG_TABS.push({id:'usuarios', label:'Usuários', ico:'users'});
    // Aba Assistente IA (chave de API): exclusiva do Administrador
    if(can('configIA')) CFG_TABS.push({id:'ia', label:'Assistente IA', ico:'bot'});

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
      {key:'prazoVencido',     label:'Prazo de auditoria vencido',      desc:'Guia ultrapassou o prazo de análise'},
      {key:'intCirurgica',     label:'Internação cirúrgica',            desc:'Guia com tipo de cirurgia (geral, neuro ou ortopédica)'},
      {key:'intClinica',       label:'Internação clínica',              desc:'Internação sem procedimento cirúrgico e sem UTI'},
      {key:'ambulatorial',     label:'Ambulatorial',                    desc:'Atendimento ambulatorial sem diárias ou internação'}
    ];

    function renderRisco(){
      cfgContent.innerHTML='';
      if(!can('config')){
        cfgContent.appendChild(el('div',{class:'ai-warn',style:'margin-top:14px'},ico('lock')+' Você não tem acesso a esta área.'));
        return;
      }
      var soLeitura=!ehGestor();
      if(soLeitura){
        cfgContent.appendChild(el('div',{class:'ai-confirm-note',style:'margin:12px 0 0'},ico('eye',13)+' <span>Modo somente leitura — apenas Administrador e Gestor podem editar a classificação de risco.</span>'));
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
      var rstBar=el('div',{style:'display:flex;gap:0;flex-wrap:wrap;border-bottom:1.5px solid var(--g-100);margin:10px 0 0'});
      [['limiares',ico('shield-alert',13)+' Regulatório'],
       ['assistencial',ico('heart-pulse',13)+' Assistencial'],
       ['documental',ico('file-warning',13)+' Documental'],
       ['contratual',ico('file-check',13)+' Contratual'],
       ['previa',ico('table-2',13)+' Prévia']].forEach(function(pair){
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

      // Renderiza o editor de uma dimensão de risco (Assistencial/Documental/Contratual): pesos + limiares
      function renderRisco4Dim(dimKey){
        var meta=RISCO4_DIMS[dimKey];
        var dimCfg=JSON.parse(JSON.stringify((State.risco4Config&&State.risco4Config[dimKey])||DEFAULT_RISCO4_CFG[dimKey]));

        var sec=el('div',{class:'risco-section'});
        sec.innerHTML='<h4>'+ico(meta.ico,14)+' Risco '+esc(meta.label)+' — pesos dos fatores</h4>'+
          '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">Cada fator presente na guia soma seu peso. O total define o nível pelos limiares abaixo.</p>';

        // Tabela de fatores + peso editável
        var tbl=el('table',{class:'cfg-table'});
        tbl.innerHTML='<thead><tr><th>Fator</th><th style="width:130px;text-align:center">Peso</th></tr></thead>';
        var tb=el('tbody');
        meta.fatores.forEach(function(f){
          var tr=el('tr');
          tr.innerHTML='<td><b>'+esc(f.label)+'</b><div style="font-size:11.5px;color:var(--muted)">'+esc(f.desc)+'</div></td>'+
            '<td style="text-align:center"><input class="r4-peso" type="number" min="0" max="20" data-fk="'+f.key+'" value="'+(dimCfg.pesos[f.key]!=null?dimCfg.pesos[f.key]:0)+'" style="width:80px;text-align:center;padding:6px;border:1px solid var(--line);border-radius:7px"/></td>';
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        var _tw=el('div',{class:'table-wrap'}); _tw.appendChild(tbl); sec.appendChild(_tw);

        // Limiares
        var somaPesos=0; meta.fatores.forEach(function(f){ somaPesos+=(dimCfg.pesos[f.key]||0); });
        var secL=el('div',{class:'risco-section',style:'margin-top:18px'});
        secL.innerHTML='<h4>'+ico('sliders-horizontal',13)+' Limiares por nível</h4>'+
          '<p style="font-size:12px;color:var(--muted);margin:0 0 12px">Pontuação <b>até</b> o limiar = nível. Acima do Alto = Crítico. Soma máxima dos pesos: <b class="r4-teto">'+somaPesos+'</b> pontos.</p>';
        var limGrid=el('div',{class:'risco-lim-grid'});
        [{key:'baixo',label:'Baixo',cls:'baixo',icon:'circle-check'},{key:'medio',label:'Médio',cls:'medio',icon:'circle-alert'},{key:'alto',label:'Alto',cls:'alto',icon:'triangle-alert'}].forEach(function(l){
          var card=el('div',{class:'risco-lim-card'});
          card.innerHTML='<div class="risco-lim-ico '+l.cls+'">'+ico(l.icon,16)+'</div>'+
            '<div class="risco-lim-body"><div class="risco-lim-name">'+l.label+'</div><div style="font-size:11px;color:var(--muted)">0 até...</div>'+
            '<input class="r4-lim" type="number" min="0" data-lk="'+l.key+'" value="'+(dimCfg.limiares[l.key]||0)+'" /></div>';
          limGrid.appendChild(card);
        });
        var cardCrit=el('div',{class:'risco-lim-card'});
        cardCrit.innerHTML='<div class="risco-lim-ico critico">'+ico('octagon-alert',16)+'</div>'+
          '<div class="risco-lim-body"><div class="risco-lim-name">Crítico</div><div style="font-size:11px;color:var(--muted)">Acima do limiar Alto</div><div style="font-size:16px;font-weight:800;color:var(--danger);padding:6px 0">∞</div></div>';
        limGrid.appendChild(cardCrit);
        secL.appendChild(limGrid);

        rstContent.appendChild(sec);
        rstContent.appendChild(secL);

        var foot=el('div',{class:'risco-foot'});
        foot.innerHTML='<button class="btn-animated" id="r4Salvar">'+ico('save',14)+' Salvar risco '+esc(meta.label)+'</button>';
        rstContent.appendChild(foot);

        // atualiza a "soma máxima" ao vivo
        rstContent.querySelectorAll('.r4-peso').forEach(function(inp){
          inp.oninput=function(){
            var s=0; rstContent.querySelectorAll('.r4-peso').forEach(function(i){ s+=(+i.value||0); });
            var t=rstContent.querySelector('.r4-teto'); if(t) t.textContent=s;
          };
        });

        var btn=rstContent.querySelector('#r4Salvar');
        if(btn) btn.onclick=function(){
          var novo={pesos:{},limiares:{}};
          rstContent.querySelectorAll('.r4-peso').forEach(function(i){ novo.pesos[i.getAttribute('data-fk')]=+i.value||0; });
          ['baixo','medio','alto'].forEach(function(k){ novo.limiares[k]=+rstContent.querySelector('.r4-lim[data-lk="'+k+'"]').value||0; });
          if(novo.limiares.baixo>=novo.limiares.medio||novo.limiares.medio>=novo.limiares.alto){
            toast('Limiares devem ser crescentes: Baixo < Médio < Alto','err'); return;
          }
          if(!State.risco4Config) State.risco4Config=JSON.parse(JSON.stringify(DEFAULT_RISCO4_CFG));
          State.risco4Config[dimKey]=novo;
          localStorage.setItem('regula_risco4_cfg',JSON.stringify(State.risco4Config));
          toast('Risco '+meta.label+' salvo e aplicado','ok');
        };
        lcIcons();
      }

      function showRst(tab){
        $$('[data-rst]',rstBar).forEach(function(b){
          var on=b.getAttribute('data-rst')===tab;
          b.style.cssText='padding:9px 18px;font-size:12.5px;font-weight:600;border:none;border-bottom:2px solid '+(on?'var(--g-600)':'transparent')+';background:none;cursor:pointer;color:'+(on?'var(--g-700)':'var(--muted)')+';display:flex;align-items:center;gap:6px';
        });
        rstContent.innerHTML='';

        if(tab==='limiares'){
          // ── Fatores e pesos (Regulatório) ───────────────────────────
          var secF=el('div',{class:'risco-section'});
          secF.innerHTML='<h4>'+ico('shield-alert',14)+' Risco Regulatório — pesos dos fatores</h4>'+
            '<p style="font-size:12px;color:var(--muted);margin:0 0 14px">Cada fator presente na guia soma seu peso. O total define o nível pelos limiares abaixo.</p>';
          var tblF=el('table',{class:'cfg-table'});
          tblF.innerHTML='<thead><tr><th>Fator</th><th style="width:130px;text-align:center">Peso</th></tr></thead>';
          var tbF=el('tbody');
          FATORES.forEach(function(f){
            var tr=el('tr');
            tr.innerHTML='<td><b>'+esc(f.label)+'</b><div style="font-size:11.5px;color:var(--muted)">'+esc(f.desc)+'</div></td>'+
              '<td style="text-align:center"><input class="risco-peso" type="number" min="0" max="20" data-key="'+f.key+'" value="'+(cfg.pesos[f.key]!=null?cfg.pesos[f.key]:0)+'" style="width:80px;text-align:center;padding:6px;border:1px solid var(--line);border-radius:7px"/></td>';
            tbF.appendChild(tr);
          });
          tblF.appendChild(tbF);
          var _twF=el('div',{class:'table-wrap'}); _twF.appendChild(tblF); secF.appendChild(_twF);
          rstContent.appendChild(secF);

          // ── Limiares ─────────────────────────────────────────────────
          var _somaPesos=0; FATORES.forEach(function(f){ _somaPesos+=(cfg.pesos[f.key]||0); });
          var secL=el('div',{class:'risco-section',style:'margin-top:18px'});
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
          footL.innerHTML='<button class="btn-animated" id="limSalvar">'+ico('save',14)+' Salvar risco Regulatório</button>';
          rstContent.appendChild(footL);

          // atualiza a "soma máxima" ao vivo conforme os pesos são editados
          rstContent.querySelectorAll('.risco-peso').forEach(function(inp){
            inp.oninput=function(){
              var s=0; rstContent.querySelectorAll('.risco-peso').forEach(function(i){ s+=(+i.value||0); });
              var t=rstContent.querySelector('.risco-teto-val'); if(t) t.textContent=s;
            };
          });

          setTimeout(function(){
            $('#limSalvar').onclick=function(){
              var novoCfg=JSON.parse(JSON.stringify(cfg));
              rstContent.querySelectorAll('.risco-peso').forEach(function(i){ novoCfg.pesos[i.getAttribute('data-key')]=+i.value||0; });
              ['baixo','medio','alto'].forEach(function(k){ novoCfg.limiares[k]=+rp.querySelector('.risco-lim[data-key="'+k+'"]').value||0; });
              if(novoCfg.limiares.baixo>=novoCfg.limiares.medio||novoCfg.limiares.medio>=novoCfg.limiares.alto){
                toast('Limiares devem ser crescentes: Baixo < Médio < Alto','err'); return;
              }
              State.riscoConfig=novoCfg; localStorage.setItem('regula_risco_cfg',JSON.stringify(novoCfg));
              aplicarRiscos(); toast('Risco Regulatório salvo e aplicado','ok'); render();
            };
          },0);

        } else if(tab==='assistencial'||tab==='documental'||tab==='contratual'){
          // ── Riscos Assistencial / Documental / Contratual (pesos dos fatores + limiares) ──
          renderRisco4Dim(tab);

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
      if(soLeitura) setTimeout(function(){ aplicarSomenteLeitura(rp); },0);
    }

    function renderPermissoes(){
      cfgContent.innerHTML='';
      // Aba Permissões: exclusiva do Administrador
      if(State.perfil!=='admin'){
        cfgContent.appendChild(el('div',{class:'ai-warn',style:'margin-top:14px'},ico('lock')+' A edição de permissões é exclusiva do <b>Administrador</b>.'));
        return;
      }
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
      var editable=ehGestor();
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

      if(!editable){
        sec.insertBefore(el('div',{class:'ai-confirm-note',style:'margin:0 0 14px'},ico('eye',13)+' <span>Modo somente leitura — apenas Administrador e Gestor editam os prazos dos fluxos.</span>'),sec.firstChild.nextSibling);
      }
      var btnRow=el('div',{style:'margin-top:18px;display:flex;gap:12px;align-items:center'});
      var btnSave=el('button',{class:'btn btn-primary'});
      btnSave.innerHTML=ico('save',14)+' Salvar prazos';
      var savedMsg=el('span',{style:'font-size:12px;color:var(--g-600);opacity:0;transition:opacity .4s;display:flex;align-items:center;gap:4px'});
      savedMsg.innerHTML=ico('check-circle-2',13)+' Salvo com sucesso';
      btnRow.appendChild(btnSave); btnRow.appendChild(savedMsg);
      if(editable) sec.appendChild(btnRow);

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
      if(!editable) setTimeout(function(){ aplicarSomenteLeitura(sec); },0);
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

    // ── Aba: Usuários ────────────────────────────────────────────────
    function renderUsuarios(){
      cfgContent.innerHTML='';
      var PERFIS=[{v:'admin',t:'Administrador'},{v:'gestor',t:'Gestor'},{v:'auditor',t:'Auditor'},{v:'enfermeiro',t:'Enfermeiro'}];
      var perfilLabel={admin:'Administrador',gestor:'Gestor',auditor:'Auditor',enfermeiro:'Enfermeiro'};
      var perfilCls={admin:'badge dark',gestor:'badge info',auditor:'badge',enfermeiro:'badge muted'};

      var sec=el('div',{class:'panel',style:'padding:20px'});
      cfgContent.appendChild(sec);

      function salvarUsers(arr){ localStorage.setItem('regula_users',JSON.stringify(arr)); }

      // Máscara/validação simples de CPF
      function soDigitos(s){ return (s||'').replace(/\D/g,''); }
      function fmtCPF(s){
        var d=soDigitos(s).slice(0,11);
        if(d.length>9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4');
        if(d.length>6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/,'$1.$2.$3');
        if(d.length>3) return d.replace(/(\d{3})(\d{1,3})/,'$1.$2');
        return d;
      }
      function cpfValido(s){
        var c=soDigitos(s);
        if(c.length!==11||/^(\d)\1{10}$/.test(c)) return false;
        var soma=0,r;
        for(var i=0;i<9;i++) soma+=parseInt(c[i])*(10-i);
        r=(soma*10)%11; if(r===10) r=0; if(r!==parseInt(c[9])) return false;
        soma=0; for(i=0;i<10;i++) soma+=parseInt(c[i])*(11-i);
        r=(soma*10)%11; if(r===10) r=0; return r===parseInt(c[10]);
      }
      function emailValido(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s||''); }

      function abreForm(idx){
        // idx=null → novo; senão edita o usuário no índice
        var users=getUsers();
        var u=idx!=null?users[idx]:{login:'',senha:'',nome:'',cpf:'',email:'',perfil:'auditor',ativo:true};
        if(u.ativo===undefined) u.ativo=true;
        var titulo=idx!=null?'Editar Usuário':'Novo Usuário';
        var body=
          '<div style="display:flex;flex-direction:column;gap:14px;max-width:560px;margin:0 auto">'+
            '<div class="usr-field"><label>Nome completo</label><input id="uNome" type="text" value="'+esc(u.nome||'')+'" placeholder="Ex.: Maria Silva" /></div>'+
            '<div class="usr-row">'+
              '<div class="usr-field"><label>CPF</label><input id="uCpf" type="text" value="'+esc(u.cpf||'')+'" placeholder="000.000.000-00" inputmode="numeric" maxlength="14" /></div>'+
              '<div class="usr-field"><label>E-mail</label><input id="uEmail" type="email" value="'+esc(u.email||'')+'" placeholder="usuario@email.com" autocomplete="off" /></div>'+
            '</div>'+
            '<div class="usr-field"><label>Login (usado para acessar)</label><input id="uLogin" type="text" value="'+esc(u.login||'')+'" placeholder="Ex.: maria.silva" autocomplete="off" /></div>'+
            '<div class="usr-row">'+
              '<div class="usr-field"><label>Senha</label><input id="uSenha" type="text" value="'+esc(u.senha||'')+'" placeholder="Senha de acesso" autocomplete="new-password" /></div>'+
              '<div class="usr-field"><label>Redigite a senha</label><input id="uSenha2" type="text" value="'+esc(u.senha||'')+'" placeholder="Repita a senha" autocomplete="new-password" /></div>'+
            '</div>'+
            '<div class="usr-row">'+
              '<div class="usr-field"><label>Perfil</label><select id="uPerfil">'+
                PERFIS.map(function(p){ return '<option value="'+p.v+'"'+(u.perfil===p.v?' selected':'')+'>'+p.t+'</option>'; }).join('')+
              '</select></div>'+
              '<div class="usr-field"><label>Situação</label><select id="uAtivo">'+
                '<option value="1"'+(u.ativo?' selected':'')+'>Ativo</option>'+
                '<option value="0"'+(!u.ativo?' selected':'')+'>Inativo</option>'+
              '</select></div>'+
            '</div>'+
          '</div>';
        var foot='<button class="btn ghost" id="uCancel">'+ico('arrow-left',13)+' Voltar</button><button class="btn-animated" id="uSalvar">'+ico('save',13)+' Salvar</button>';
        var m=modal(titulo, idx!=null?'Altere os dados e salve':'Preencha os dados do novo usuário', body, foot);

        // máscara de CPF ao digitar
        var inpCpf=m.querySelector('#uCpf');
        inpCpf.addEventListener('input',function(){ this.value=fmtCPF(this.value); });

        m.querySelector('#uCancel').onclick=function(){ fecharModais(); };
        m.querySelector('#uSalvar').onclick=function(){
          var nome=m.querySelector('#uNome').value.trim();
          var cpf=m.querySelector('#uCpf').value.trim();
          var email=m.querySelector('#uEmail').value.trim();
          var login=m.querySelector('#uLogin').value.trim();
          var senha=m.querySelector('#uSenha').value.trim();
          var senha2=m.querySelector('#uSenha2').value.trim();
          var perfil=m.querySelector('#uPerfil').value;
          var ativo=m.querySelector('#uAtivo').value==='1';

          if(!nome||!login||!senha){ toast('Preencha nome, login e senha','err'); return; }
          if(!cpfValido(cpf)){ toast('CPF inválido','err'); return; }
          if(!emailValido(email)){ toast('E-mail inválido','err'); return; }
          if(senha!==senha2){ toast('As senhas não coincidem','err'); return; }
          var lista=getUsers();
          for(var i=0;i<lista.length;i++){
            if(i===idx) continue;
            if(lista[i].login===login){ toast('Já existe um usuário com este login','err'); return; }
            if(lista[i].cpf && soDigitos(lista[i].cpf)===soDigitos(cpf)){ toast('Já existe um usuário com este CPF','err'); return; }
            if(lista[i].email && lista[i].email.toLowerCase()===email.toLowerCase()){ toast('Já existe um usuário com este e-mail','err'); return; }
          }
          var novo={login:login,senha:senha,nome:nome,cpf:fmtCPF(cpf),email:email,perfil:perfil,ativo:ativo};
          if(idx!=null) lista[idx]=novo; else lista.push(novo);
          salvarUsers(lista);
          fecharModais();
          toast(idx!=null?'Usuário atualizado':'Usuário cadastrado','ok');
          renderUsuarios();
        };
      }

      function pinta(){
        var users=getUsers();
        var rows=users.map(function(u,i){
          var ativo=u.ativo!==false; // padrão: ativo (compatível com cadastros antigos)
          return '<tr>'+
            '<td><b>'+esc(u.nome||'—')+'</b></td>'+
            '<td>'+esc(u.email||u.login||'—')+'</td>'+
            '<td><span class="'+(perfilCls[u.perfil]||'badge')+'">'+(perfilLabel[u.perfil]||u.perfil)+'</span></td>'+
            '<td><span class="usr-sit '+(ativo?'on':'off')+'">'+ico(ativo?'check-circle-2':'x-circle',12)+' '+(ativo?'Ativo':'Inativo')+'</span></td>'+
            '<td style="text-align:right;white-space:nowrap">'+
              '<button class="usr-act" data-edit="'+i+'" title="Editar">'+ico('pencil',14)+'</button>'+
              '<button class="usr-act usr-act-del" data-del="'+i+'" title="Excluir">'+ico('trash-2',14)+'</button>'+
            '</td>'+
          '</tr>';
        }).join('');
        sec.innerHTML=
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">'+
            '<div><h3 style="margin:0 0 2px">'+ico('users',16)+' Usuários</h3>'+
            '<p style="margin:0;font-size:12.5px;color:var(--muted)">Cadastre, edite e inative acessos. Perfis: Gestor, Auditor, Enfermeiro.</p></div>'+
            '<button class="btn-animated" id="uNovo">'+ico('user-plus',14)+' Adicionar</button>'+
          '</div>'+
          '<div class="table-wrap"><table class="cfg-table usr-table"><thead><tr>'+
            '<th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th style="text-align:right">Ações</th>'+
          '</tr></thead><tbody>'+rows+'</tbody></table></div>';
        sec.querySelector('#uNovo').onclick=function(){ abreForm(null); };
        $$('[data-edit]',sec).forEach(function(b){ b.onclick=function(){ abreForm(+b.getAttribute('data-edit')); }; });
        $$('[data-del]',sec).forEach(function(b){ b.onclick=function(){ excluir(+b.getAttribute('data-del')); }; });
        lcIcons();
      }

      function excluir(idx){
        var lista=getUsers();
        if(lista.length<=1){ toast('Deve existir ao menos um usuário','err'); return; }
        if(!confirm('Excluir o usuário "'+(lista[idx].nome||lista[idx].login)+'"?')) return;
        lista.splice(idx,1);
        salvarUsers(lista);
        toast('Usuário excluído','ok');
        renderUsuarios();
      }

      pinta();
    }

    // ── Ativar aba ───────────────────────────────────────────────────
    function setTab(id){
      $$('.cfg-tab',tabBar).forEach(function(b){ b.classList.toggle('active',b.getAttribute('data-cfg-tab')===id); });
      if(id==='risco') renderRisco();
      else if(id==='permissoes') renderPermissoes();
      else if(id==='fluxos') renderFluxos();
      else if(id==='usuarios') renderUsuarios();
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
    document.body.classList.add('modal-aberto');
    function closeModal(){
      bd.remove();
      if(!document.querySelector('.modal-backdrop')){
        document.body.style.overflow='';
        document.body.classList.remove('modal-aberto');
      }
    }
    bd.querySelector('.modal-close').onclick=function(){ closeModal(); };
    bd.onclick=function(e){ if(e.target===bd) closeModal(); };
    lcIcons();
    return m;
  }

  function openGuia(g, tab){
    g._cache = AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
    aplicarExtratosAnexosNaAnalise(g, g._cache); // incorpora o que a IA já leu dos anexos
    var ia=g._cache;
    var TABS_DEF=[
      {id:'resumo',        label:'Resumo',           ico:'layout-dashboard', grp:0},
      {id:'ia',            label:'Análise Técnica IA', ico:'bot',             grp:3, tip:'Atalho: F7'},
      {id:'mensalidades',  label:'Mensalidades',      ico:'receipt',          grp:7, tip:'Atalho: F8'},
      {id:'histatend',     label:'Hist. atendimento', ico:'history',          grp:7, tip:'Atalho: F9'},
      {id:'carencias',     label:'Carências',         ico:'calendar-clock',   grp:7, tip:'Atalho: F10'},
      {id:'obsimp',        label:'Obs. Impressas',    ico:'printer',          grp:4},
      {id:'obsnaoimp',     label:'Obs. Não Impressas',ico:'eye-off',          grp:4},
      {id:'operadora',     label:'Parecer Operadora', ico:'file-check-2',     grp:5},
      {id:'etapas',        label:'Etapas',            ico:'git-branch',       grp:6},
      {id:'logs',          label:'Logs',              ico:'scroll-text',      grp:6},
    ];
    var tabs=TABS_DEF.map(function(t){return t.id});
    var tabsHtml='<div class="tabs">';
    var lastGrp=-1;
    TABS_DEF.forEach(function(t){
      if(t.grp!==lastGrp&&lastGrp!==-1) tabsHtml+='<span class="tab-sep"></span>';
      lastGrp=t.grp;
      tabsHtml+='<button class="tab" data-tab="'+t.id+'"'+(t.tip?' title="'+esc(t.tip)+'"':'')+'>'+t.label+'</button>';
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

    // Atalhos da guia (todos alternam abre/fecha, sem sair da aba atual): F7 → Parecer Técnico · F8 → Mensalidades · F9 → Hist. atendimento · F10 → Carências
    function _guiaKeyHandler(ev){
      if(!m.isConnected){ document.removeEventListener('keydown',_guiaKeyHandler); return; } // guia fechada: limpa handler
      if(ev.key==='F10'){
        ev.preventDefault();
        if(!fecharCarencias()) showCarencias(g); // se já aberto, F10 fecha; senão, abre
      } else if(ev.key==='F9'){
        ev.preventDefault();
        if(!fecharHistAtend()) showHistAtend(g); // se já aberto, F9 fecha; senão, abre
      } else if(ev.key==='F8'){
        ev.preventDefault();
        if(!fecharMensalidades()) showMensalidades(g); // se já aberto, F8 fecha; senão, abre
      } else if(ev.key==='F7'){
        ev.preventDefault();
        if(!fecharParecer()) showParecer(g); // se já aberto, F7 fecha; senão, abre
      }
    }
    document.addEventListener('keydown',_guiaKeyHandler);

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
        // Reaproveita o que a IA já leu dos anexos (extratos salvos) — sem reler os arquivos
        aplicarExtratosAnexosNaAnalise(g, g._cache);
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

  // Monta o HTML do conteúdo de Carências (reusado pelo modal F10 e pela aba "Carências")
  function renderCarenciasBody(g){
    var c = MOCK.carenciasGuia ? MOCK.carenciasGuia(g) : null;
    if(!c) return '<div class="empty"><div class="ico">'+icoLg('calendar-clock')+'</div>Dados de carência indisponíveis.</div>';

    // Faixa de alerta CPT (quando houver)
    var cptHtml = c.cpt && c.cpt.ativo
      ? '<div class="carencia-cpt">'+
          '<div class="carencia-cpt-tit">'+ico('alert-triangle',14)+' '+esc(c.cpt.texto)+' — Vencimento: '+esc(c.cpt.vencimento)+'</div>'+
          '<div class="carencia-cpt-cid">'+esc(c.cpt.cid)+'</div>'+
        '</div>'
      : '<div class="carencia-ok">'+ico('check-circle',14)+' Beneficiário sem CPT pendente.</div>';

    // Cabeçalho com inclusão e permanência
    var infoHtml =
      '<div class="carencia-info">'+
        '<div><span class="carencia-info-lb">Inclusão</span><b>'+esc(c.inclusao)+'</b></div>'+
        '<div><span class="carencia-info-lb">Permanência</span><b>'+c.permanencia.toLocaleString('pt-BR')+' <span style="font-weight:400;color:var(--muted)">dias ativos</span></b></div>'+
      '</div>';

    // Tabela de carências
    var linhas = c.itens.map(function(it){
      return '<tr>'+
        '<td class="carencia-nome">'+esc(it.nome)+'</td>'+
        '<td class="cc">'+esc(it.vencimento)+'</td>'+
        '<td class="cc">'+it.numeroDias+'</td>'+
        '<td class="cc">'+it.cumpridos+'</td>'+
        '<td class="cc">'+it.restantes+'</td>'+
        '<td class="cc">'+(it.cumprida
            ? '<span class="badge ok" style="font-size:10px">Cumprida</span>'
            : '<span class="badge warn" style="font-size:10px">A cumprir</span>')+'</td>'+
      '</tr>';
    }).join('');
    var tblHtml =
      '<div class="carencia-tbl-wrap"><table class="carencia-tbl">'+
        '<thead><tr>'+
          '<th>Carência</th><th class="cc">Vencimento</th><th class="cc">Número de dias</th>'+
          '<th class="cc">Cumpridos</th><th class="cc">Restantes</th><th class="cc">Situação</th>'+
        '</tr></thead>'+
        '<tbody>'+linhas+'</tbody>'+
      '</table></div>';

    return cptHtml + infoHtml + tblHtml;
  }

  // Modal de Carências do beneficiário (atalho F10 dentro da guia)
  function showCarencias(g){
    var ben = g.beneficiario||{};
    var body = renderCarenciasBody(g);
    var m = modal('Carências — '+esc(ben.nome||''), 'Guia '+esc(g.numero)+' · '+esc(ben.plano||'')+(ben.contrato?' · '+esc(ben.contrato):''), body, null);
    // Marca o backdrop para permitir toggle via F10 (fechar apertando F10 de novo)
    var _bd=m.closest('.modal-backdrop'); if(_bd) _bd.classList.add('carencia-modal-bd');
    // Fecha com ESC (reforço; o backdrop também fecha ao clicar fora)
    var _esc=function(ev){ if(ev.key==='Escape'){ if(_bd) _bd.remove(); document.removeEventListener('keydown',_esc); if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); } } };
    document.addEventListener('keydown',_esc);
    lcIcons();
    return m;
  }
  // Fecha o modal de Carências, se aberto. Retorna true se havia um aberto.
  function fecharCarencias(){
    var bd=document.querySelector('.modal-backdrop.carencia-modal-bd');
    if(!bd) return false;
    bd.remove();
    if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); }
    return true;
  }

  // Monta o HTML das Mensalidades/Faturas (reusado pela aba "Mensalidades" e pelo modal F8)
  function renderMensalidadesBody(g){
    var faturas = MOCK.mensalidadesGuia ? MOCK.mensalidadesGuia(g) : [];
    if(!faturas.length) return '<div class="empty"><div class="ico">'+icoLg('receipt')+'</div>Sem faturas para este beneficiário.</div>';
    function money(v){ return (v||v===0) && v!=='' ? (+v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; }
    // resumo topo
    var emAberto=faturas.filter(function(f){return f.status==='vencida';});
    var aVencer=faturas.filter(function(f){return f.status==='avencer';});
    var resumo=
      '<div class="mens-info">'+
        '<div><span class="mens-info-lb">Faturas</span><b>'+faturas.length+'</b></div>'+
        '<div><span class="mens-info-lb">Em aberto (vencidas)</span><b class="'+(emAberto.length?'mens-red':'')+'">'+emAberto.length+'</b></div>'+
        '<div><span class="mens-info-lb">A vencer</span><b>'+aVencer.length+'</b></div>'+
      '</div>';
    var linhas=faturas.map(function(f){
      var cls = f.status==='avencer'?'mens-row-verde':(f.status==='vencida'?'mens-row-vermelho':'');
      return '<tr class="'+cls+'">'+
        '<td class="nw">'+esc(f.vencimento)+'</td>'+
        '<td class="nw">'+esc(f.competencia)+'</td>'+
        '<td class="nw">'+esc(f.documento)+'</td>'+
        '<td class="rt">'+money(f.valorVencimento)+'</td>'+
        '<td class="cc">'+f.diasAtraso+'</td>'+
        '<td class="rt">'+(f.multa?money(f.multa):'')+'</td>'+
        '<td class="rt">'+(f.juros?money(f.juros):'')+'</td>'+
        '<td class="rt">'+money(f.valorCorrigido)+'</td>'+
        '<td>'+esc(f.localPagamento)+'</td>'+
        '<td class="rt">'+(f.valorPago!==''?money(f.valorPago):'')+'</td>'+
        '<td class="nw">'+esc(f.pagamento||'')+'</td>'+
        '<td class="nw">'+esc(f.registro||'')+'</td>'+
      '</tr>';
    }).join('');
    var tbl=
      '<div class="mens-tbl-wrap"><table class="mens-tbl">'+
        '<thead><tr>'+
          '<th>Vencimento</th><th>Competência</th><th>Documento</th><th class="rt">Valor no vencimento</th>'+
          '<th class="cc">Dias em atraso</th><th class="rt">Multa (R$)</th><th class="rt">Juros (R$)</th>'+
          '<th class="rt">Valor corrigido</th><th>Local de pagamento</th><th class="rt">Valor pago</th>'+
          '<th>Pagamento</th><th>Registro</th>'+
        '</tr></thead>'+
        '<tbody>'+linhas+'</tbody>'+
      '</table></div>';
    var legenda=
      '<div class="mens-legenda">'+
        '<span><i class="mens-dot mens-dot-verde"></i> A vencer</span>'+
        '<span><i class="mens-dot mens-dot-vermelho"></i> Vencida em aberto</span>'+
        '<span><i class="mens-dot mens-dot-branco"></i> Paga</span>'+
      '</div>';
    return resumo + tbl + legenda;
  }
  // Modal de Mensalidades (atalho F8)
  function showMensalidades(g){
    var ben=g.beneficiario||{};
    var m=modal('Mensalidades — '+esc(ben.nome||''),
      'Guia '+esc(g.numero)+' · '+esc(ben.plano||'')+(ben.contrato?' · '+esc(ben.contrato):''),
      renderMensalidadesBody(g), null);
    var bd=m.closest('.modal-backdrop'); if(bd) bd.classList.add('mensalidades-modal-bd');
    var _esc=function(ev){ if(ev.key==='Escape'){ if(bd) bd.remove(); document.removeEventListener('keydown',_esc); if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); } } };
    document.addEventListener('keydown',_esc);
    lcIcons();
    return m;
  }
  function fecharMensalidades(){
    var bd=document.querySelector('.modal-backdrop.mensalidades-modal-bd');
    if(!bd) return false;
    bd.remove();
    if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); }
    return true;
  }

  // Modal do Hist. atendimento (atalho F9) — reusa renderHistAtendimento(g)
  function showHistAtend(g){
    var ben=g.beneficiario||{};
    var m=modal('Histórico de atendimentos — '+esc(ben.nome||''),
      'Guia '+esc(g.numero)+' · '+esc(ben.plano||'')+(ben.contrato?' · '+esc(ben.contrato):''),
      '<div class="histatend-modal-slot"></div>', null);
    var bd=m.closest('.modal-backdrop'); if(bd) bd.classList.add('histatend-modal-bd');
    var slot=m.querySelector('.histatend-modal-slot');
    if(slot) slot.replaceWith(renderHistAtendimento(g));
    var _esc=function(ev){ if(ev.key==='Escape'){ if(bd) bd.remove(); document.removeEventListener('keydown',_esc); if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); } } };
    document.addEventListener('keydown',_esc);
    lcIcons();
    return m;
  }
  function fecharHistAtend(){
    var bd=document.querySelector('.modal-backdrop.histatend-modal-bd');
    if(!bd) return false;
    bd.remove();
    if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); }
    return true;
  }

  // Modal do Parecer Técnico (atalho F7) — reusa renderParecerIA(ia, g)
  function showParecer(g){
    var ben=g.beneficiario||{};
    var ia=g._cache||(g._cache=AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)}));
    var m=modal('Análise Técnica IA — '+esc(ben.nome||''),
      'Guia '+esc(g.numero)+' · '+esc(g.tipo)+(g.fluxo?' · Fluxo '+esc(g.fluxo.id):''),
      '<div class="parecer-modal-slot"></div>', null);
    var bd=m.closest('.modal-backdrop'); if(bd) bd.classList.add('parecer-modal-bd');
    var slot=m.querySelector('.parecer-modal-slot');
    if(slot) slot.replaceWith(renderParecerIA(ia, g));
    var _esc=function(ev){ if(ev.key==='Escape'){ if(bd) bd.remove(); document.removeEventListener('keydown',_esc); if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); } } };
    document.addEventListener('keydown',_esc);
    lcIcons();
    return m;
  }
  function fecharParecer(){
    var bd=document.querySelector('.modal-backdrop.parecer-modal-bd');
    if(!bd) return false;
    bd.remove();
    if(!document.querySelector('.modal-backdrop')){ document.body.style.overflow=''; document.body.classList.remove('modal-aberto'); }
    return true;
  }

  // Mini-tabela compacta para o Resumo (Procedimentos / Pacotes)
  // Quantidade simulada de uma diária/taxa (determinística por código)
  function _qtdDiaria(cod){ var h=0,s=''+cod; for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} return 1+(Math.abs(h)%7); }
  // Detalhe determinístico de diária/taxa: Qtde Solic. (pode ser maior que a autorizada) e valor de Tabela
  function _diariaDetalhe(p){
    var h=0,s=''+p.cod; for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;} h=Math.abs(h);
    var qtde = (p.qtd!=null?p.qtd:_qtdDiaria(p.cod));
    var qtdeSolic = qtde + (h%5===0 ? 1 : 0);
    var vlrTabela = +((60 + h%540) + (h%100)/100).toFixed(2);
    return {qtde:qtde, qtdeSolic:qtdeSolic, vlrTabela:vlrTabela};
  }

  // Mini-tabela do Resumo. opts.tipo: 'padrao' (Código/Descrição/Peso/Flags), 'diarias' ou 'procedimentos'
  // (colunas Qtde Solic./Qtde/Tabela/Peso alinhadas nas mesmas posições entre 'diarias' e 'procedimentos')
  function resumoMiniTabela(titulo, icone, arr, opts){
    opts=opts||{}; arr = arr || [];
    var head='<div class="resumo-mini-hd">'+ico(icone,13)+' '+esc(titulo)+' <span class="resumo-mini-cnt">'+arr.length+'</span></div>';
    if(!arr.length){
      return '<div class="resumo-mini"><div class="panel" style="padding:0">'+head+'<div class="resumo-mini-empty">Sem itens vinculados</div></div></div>';
    }
    var thead, linhas, cols;
    // colgroup fixo: garante que colunas de mesmo nome caiam na MESMA posição horizontal entre os cartões.
    // COL_NUM = colunas numéricas mais espaçadas (Qtde Solic./Qtde/Tabela); COL_PESO = coluna final Peso
    // (mantida estreita e na mesma posição). A folga extra é absorvida pela coluna flexível de Descrição.
    var COL_COD='<col style="width:150px">', COL_NUM='<col style="width:150px">', COL_PESO='<col style="width:80px">';
    if(opts.tipo==='diarias'){
      cols='<colgroup>'+COL_COD+'<col>'+COL_NUM+COL_NUM+COL_NUM+COL_PESO+'</colgroup>';
      thead='<tr><th>Código</th><th>Descrição</th><th class="rm-c">Qtde Solic.</th><th class="rm-c">Qtde</th><th class="rm-c">Tabela</th><th class="rm-c">Peso</th></tr>';
      linhas = arr.map(function(p){
        var x=_diariaDetalhe(p);
        var tabelaFmt = 'R$ '+x.vlrTabela.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
        return '<tr><td class="rm-cod">'+esc(p.cod)+'</td><td>'+esc(p.desc)+'</td><td class="rm-c">'+x.qtdeSolic+'</td><td class="rm-c">'+x.qtde+'</td><td class="rm-c">'+tabelaFmt+'</td><td class="rm-c">'+(p.peso!=null?p.peso:'—')+'</td></tr>';
      }).join('');
    } else if(opts.tipo==='procedimentos'){
      cols='<colgroup>'+COL_COD+'<col>'+COL_NUM+COL_NUM+COL_NUM+COL_PESO+'</colgroup>';
      thead='<tr><th>Código</th><th>Descrição</th><th class="rm-c">Qtde Solic.</th><th class="rm-c">Qtde</th><th class="rm-c">Tabela</th><th class="rm-c">Peso</th></tr>';
      linhas = arr.map(function(p){
        var x=MOCK.procDetalhe?MOCK.procDetalhe(p):{};
        var fl=''; if(p.dut) fl+=' <span class="badge warn">DUT</span>';
        var tabelaFmt = x.vlrTabela!=null ? 'R$ '+x.vlrTabela.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
        return '<tr><td class="rm-cod">'+esc(p.cod)+'</td><td>'+esc(p.desc)+fl+'</td><td class="rm-c">'+(x.qtdeSolic!=null?x.qtdeSolic:'—')+'</td><td class="rm-c">'+(x.qtde!=null?x.qtde:'—')+'</td><td class="rm-c">'+tabelaFmt+'</td><td class="rm-c">'+(p.peso!=null?p.peso:'—')+'</td></tr>';
      }).join('');
    } else {
      cols='<colgroup>'+COL_COD+'<col>'+COL_PESO+'<col style="width:160px"></colgroup>';
      thead='<tr><th>Código</th><th>Descrição</th><th class="rm-c">Peso</th><th>Flags</th></tr>';
      linhas = arr.map(function(p){
        var fl=''; if(p.dut) fl+='<span class="badge warn">DUT</span> '; if(p.opme) fl+='<span class="badge warn">OPME</span> '; if(p.obrig) fl+='<span class="badge">Obrig.</span>';
        return '<tr><td class="rm-cod">'+esc(p.cod)+'</td><td>'+esc(p.desc)+'</td><td class="rm-c">'+(p.peso!=null?p.peso:'—')+'</td><td class="rm-fl">'+fl+'</td></tr>';
      }).join('');
    }
    return '<div class="resumo-mini"><div class="panel" style="padding:0">'+head+
      '<div class="resumo-mini-tbl"><table>'+cols+'<thead>'+thead+'</thead><tbody>'+linhas+'</tbody></table></div></div></div>';
  }

  // Seção Histórico (migrada para o Resumo) — textarea editável com auto-save, no padrão .resumo-mini
  function renderHistoricoSecao(g){
    var _histKey='regula_hist_'+g.numero;
    var _histEditKey='regula_hist_edit_'+g.numero; // marca se foi editado pelo usuário
    var _histSaved=localStorage.getItem(_histKey);
    var _foiEditado=localStorage.getItem(_histEditKey)==='1';
    var _histVal=_histSaved||g.historico||histGeradoIA(g);
    var box=el('div',{class:'resumo-mini'});
    box.innerHTML=
      '<div class="panel" style="padding:0">'+
        '<div class="resumo-mini-hd">'+ico('history',13)+' HISTÓRICO E TRATAMENTOS ANTERIORES'+
          '<span class="hist-origem" style="margin-left:auto">'+
            (_foiEditado
              ? ico('pencil',11)+' editado pelo usuário'
              : ico('sparkles',11)+' gerado pela IA')+
          '</span>'+
          '<button class="btn sm ghost hist-regen" style="letter-spacing:0;text-transform:none;margin-left:8px" title="Gerar novamente pela IA (descarta a edição atual)">'+ico('refresh-cw',12)+' Gerar pela IA</button>'+
        '</div>'+
        '<div style="padding:10px 12px"></div>'+
      '</div>';
    var _corpo=box.querySelector('.panel>div[style*="padding"]');
    var _ta=el('textarea',{style:'width:100%;min-height:110px;resize:vertical;padding:10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;line-height:1.5'},null);
    _ta.value=_histVal;
    _corpo.appendChild(_ta);
    _corpo.appendChild(el('div',{style:'margin-top:6px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px'},
      ico('info',11)+' Histórico do cliente <b>gerado automaticamente pela IA</b>. Você pode editar livremente — as alterações são salvas e <b>registradas nos logs da guia</b>.'));

    // Salva ao digitar; registra log da edição (com debounce para não logar cada tecla)
    var _histLogTimer=null;
    _ta.oninput=function(){
      var v=this.value;
      g.historico=v; localStorage.setItem(_histKey,v);
      localStorage.setItem(_histEditKey,'1');
      var badge=box.querySelector('.hist-origem'); if(badge){ badge.innerHTML=ico('pencil',11)+' editado pelo usuário'; lcIcons(); }
      clearTimeout(_histLogTimer);
      _histLogTimer=setTimeout(function(){
        logAcao('Histórico do cliente editado', g.numero+' — '+(v.length>70?v.slice(0,70)+'…':v));
      }, 1200);
    };
    // Regenerar pela IA (descarta a edição, volta ao texto gerado)
    box.querySelector('.hist-regen').onclick=function(){
      var novo=histGeradoIA(g);
      _ta.value=novo; g.historico=novo;
      localStorage.setItem(_histKey,novo);
      localStorage.removeItem(_histEditKey);
      var badge=box.querySelector('.hist-origem'); if(badge){ badge.innerHTML=ico('sparkles',11)+' gerado pela IA'; }
      logAcao('Histórico do cliente regenerado pela IA', g.numero);
      toast('Histórico regenerado pela IA.','ok'); lcIcons();
    };
    return box;
  }

  // Gera o histórico clínico do cliente analisando os DADOS REAIS do "Hist. atendimento" (últimos 24 meses).
  // Texto conciso, com citações concretas (guias, datas, prestador, solicitante) que evitem consultar o histórico.
  function histGeradoIA(g){
    var b=g.beneficiario||{};
    var hist=(MOCK.historicoAtendimentos?MOCK.historicoAtendimentos(g):[]);
    // filtra os últimos 24 meses
    var lim=new Date(Date.now()-730*86400000);
    var at=hist.filter(function(a){ return a.dataObj && a.dataObj>=lim; });
    if(!at.length){
      return 'Beneficiário '+(b.nome||'')+(b.idade!=null?', '+b.idade+' anos':'')+', plano '+(b.plano||'—')+'. '+
        'Sem atendimentos registrados nos últimos 24 meses.';
    }
    // helpers de agregação
    function topKey(arr, key){
      var c={}; arr.forEach(function(a){ var v=a[key]; if(v) c[v]=(c[v]||0)+1; });
      var best=null,bn=0; for(var k in c){ if(c[k]>bn){bn=c[k];best=k;} }
      return {nome:best, n:bn};
    }
    function soData(dh){ return (dh||'').split(' ')[0]; } // "dd/mm/aaaa hh:mm" -> "dd/mm/aaaa"
    var maisRecente=at[0], maisAntigo=at[at.length-1];
    var procTop=topKey(at,'procedimento');
    var especTop=topKey(at,'espec');
    var prestTop=topKey(at,'prestador');
    var solicTop=topKey(at,'solicitante');
    var cidTop=topKey(at,'hipotese');
    var negadas=at.filter(function(a){ return a.qtdAut===0; });

    var partes=[];
    // 1) Perfil + foco da análise (linha de cuidado correlata ao serviço da guia atual)
    var foco = especTop.nome ? especTop.nome : (MOCK.especialidadeDaGuia?MOCK.especialidadeDaGuia(g):'');
    partes.push('Beneficiário '+(b.nome||'')+(b.idade!=null?', '+b.idade+' anos':'')+'. Análise focada na linha de cuidado relacionada ao serviço solicitado'+(foco?' ('+foco+(cidTop.nome?', '+cidTop.nome:'')+')':'')+'.');
    // 2) Volume e janela temporal (com citação de datas) — apenas atendimentos correlatos
    partes.push(at.length+' atendimento(s) correlato(s) nos últimos 24 meses ('+soData(maisAntigo.data)+' a '+soData(maisRecente.data)+').');
    // 3) Procedimento predominante da mesma linha + frequência
    if(procTop.nome){
      partes.push('Predomínio de "'+procTop.nome+'" — '+procTop.n+' ocorrência(s), indicando acompanhamento continuado na mesma linha de cuidado.');
    }
    // 4) Prestador e solicitante recorrentes (citação nominal)
    var ps=[];
    if(prestTop.nome) ps.push('executante recorrente '+prestTop.nome+' ('+prestTop.n+'x)');
    if(solicTop.nome) ps.push('solicitante '+solicTop.nome);
    if(ps.length) partes.push('Concentração em '+ps.join(' e ')+'.');
    // 5) Negativas/glosas — cita guia e data do caso mais recente
    if(negadas.length){
      var ex=negadas[0];
      partes.push(negadas.length+' atendimento(s) com quantidade não autorizada; ex.: guia '+ex.guia+' em '+soData(ex.data)+' ('+ex.procedimento+').');
    }
    // 6) Último atendimento (âncora recente para o auditor)
    partes.push('Último registro: guia '+maisRecente.guia+' em '+soData(maisRecente.data)+' — '+maisRecente.procedimento+' (executante '+maisRecente.prestador+').');
    if(g.uti) partes.push('Guia atual com passagem por UTI — maior complexidade assistencial.');
    return partes.join(' ');
  }

  // Catálogo de críticas típicas do ERP (cada crítica é associada a um procedimento da guia)
  var _CRITICAS_CATALOGO = [
    'Solicitante não autorizado a solicitar procedimento',
    'Operador enviou pra auditoria guia de prestador não autorizado a solicitar',
    'Prestador não autorizado para executar o procedimento',
    'Operador enviou pra auditoria guia de prestador não autorizado',
    'Procedimento sujeito a diretriz de utilização (DUT) — verificar critérios',
    'Quantidade solicitada acima do previsto para o procedimento',
    'Procedimento fora do rol para a segmentação do plano',
    'Carência não cumprida para o procedimento solicitado'
  ];
  // Gera as críticas da guia associadas a procedimentos (determinístico por guia).
  // Retorna [{codigo, procedimento, critica}]
  function criticasDaGuia(g, ia){
    var procs = (g.procedimentos||[]);
    // seed determinístico por guia (define quantas e quais críticas)
    var seed=0, st=''+g.numero; for(var i=0;i<st.length;i++){ seed=(seed*31+st.charCodeAt(i))|0; } seed=Math.abs(seed);
    var out=[];
    if(procs.length){
      // associa 2 a 4 críticas ao(s) procedimento(s) da guia
      var nCrit = 2 + (seed % 3);
      for(var k=0;k<nCrit;k++){
        var proc = procs[k % procs.length];
        var critica = _CRITICAS_CATALOGO[(seed + k*3) % _CRITICAS_CATALOGO.length];
        out.push({ codigo:proc.cod, procedimento:proc.desc, critica:critica });
      }
    }
    // acrescenta os alertas da IA (sem procedimento específico) como críticas gerais
    (ia && ia.alertas ? ia.alertas : []).forEach(function(a){
      out.push({ codigo:'—', procedimento:'—', critica:a });
    });
    return out;
  }

  // Seção Críticas (migrada para o Resumo) — tabela Código · Procedimento · Crítica, no padrão .resumo-mini
  function renderCriticasSecao(g, ia){
    var crits = criticasDaGuia(g, ia);
    var n = crits.length;
    var box=el('div',{class:'resumo-mini'});
    var corpo;
    if(n){
      var linhas = crits.map(function(c){
        return '<tr>'+
          '<td class="rm-cod">'+esc(c.codigo)+'</td>'+
          '<td class="crit-proc">'+esc(c.procedimento)+'</td>'+
          '<td class="crit-txt">'+ico('triangle-alert',12)+' '+esc(c.critica)+'</td>'+
        '</tr>';
      }).join('');
      corpo='<div class="resumo-mini-tbl"><table>'+
        '<colgroup><col style="width:110px"><col style="width:280px"><col></colgroup>'+
        '<thead><tr><th>Código</th><th>Procedimento</th><th>Crítica</th></tr></thead>'+
        '<tbody>'+linhas+'</tbody></table></div>';
    } else {
      corpo='<div class="resumo-mini-empty">Nenhuma crítica relevante identificada.</div>';
    }
    box.innerHTML=
      '<div class="panel" style="padding:0">'+
        '<div class="resumo-mini-hd">'+ico('triangle-alert',13)+' CRÍTICAS DA GUIA'+
          '<span class="resumo-mini-cnt">'+n+'</span>'+
        '</div>'+
        corpo+
      '</div>';
    return box;
  }

  // Seção resumida + expansível (Mat/Med ou OPME) para o Resumo.
  // tipo: 'matmed' | 'opme'. Mostra tabela resumida; botão "Detalhes" expande a visão completa.
  function renderResumoExpandivel(g, tipo){
    var box=el('div',{class:'resumo-mini'});
    var itens = (g.matmed||[]).filter(function(m){ return tipo==='opme' ? m.opme : !m.opme; });
    var conf = tipo==='opme'
      ? {titulo:'OPME', icone:'wrench', vazio:'Sem OPME nesta guia.'}
      : {titulo:'MAT/MED', icone:'pill', vazio:'Sem medicamentos/materiais nesta guia.'};

    if(!itens.length){
      box.innerHTML='<div class="panel" style="padding:0">'+
        '<div class="resumo-mini-hd">'+ico(conf.icone,13)+' '+conf.titulo+'<span class="resumo-mini-cnt">0</span></div>'+
        '<div class="resumo-mini-empty">'+esc(conf.vazio)+'</div></div>';
      return box;
    }

    // Tabela RESUMIDA — colgroup fixo. Qtde Solic./Qtde/Tabela/Peso usam a mesma largura (COL_NUM).
    // No Mat/Med, Unidade/Via ganham largura maior (dados numa linha só, bem distribuídos, sem colar);
    // isso desloca ligeiramente o início das colunas numéricas em relação às demais mini-tabelas.
    var COL_NUM='<col style="width:150px">', COL_PESO='<col style="width:80px">';
    var thead, linhas, cols;
    if(tipo==='matmed'){
      cols='<colgroup><col style="width:150px"><col style="width:220px"><col style="width:150px"><col style="width:150px"><col>'+COL_NUM+COL_NUM+COL_NUM+COL_PESO+'</colgroup>';
      thead='<tr><th>Código</th><th>Descrição</th><th>Unidade</th><th>Via</th><th></th><th class="rm-c">Qtde Solic.</th><th class="rm-c">Qtde</th><th class="rm-c">Tabela</th><th class="rm-c">Peso</th></tr>';
      linhas=itens.map(function(m){ var x=MOCK.matmedDetalhe?MOCK.matmedDetalhe(m):{};
        var tabelaFmt = x.vlrTabela!=null ? 'R$ '+x.vlrTabela.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
        var unidadeTxt=esc(x.unidade||'—'), viaTxt=esc(x.via||'—');
        return '<tr><td class="rm-cod">'+esc(x.cod||m.cod)+'</td><td class="rm-nowrap">'+esc(x.descEspecifica||m.desc)+'</td><td class="rm-nowrap" title="'+unidadeTxt+'">'+unidadeTxt+'</td><td class="rm-nowrap" title="'+viaTxt+'">'+viaTxt+'</td><td></td><td class="rm-c">'+(x.qtdeSolic!=null?x.qtdeSolic:'—')+'</td><td class="rm-c">'+(x.qtde!=null?x.qtde:'—')+'</td><td class="rm-c">'+tabelaFmt+'</td><td class="rm-c">&nbsp;</td></tr>';
      }).join('');
    } else {
      cols='<colgroup><col style="width:150px"><col>'+COL_NUM+COL_NUM+COL_NUM+COL_PESO+'</colgroup>';
      thead='<tr><th>Código</th><th>Produto solicitado</th><th class="rm-c">Qtde Solic.</th><th class="rm-c">Qtde</th><th class="rm-c">Tabela</th><th class="rm-c">Peso</th></tr>';
      linhas=itens.map(function(m){ var x=MOCK.opmeDetalhe?MOCK.opmeDetalhe(m):{};
        var tabelaFmt = x.vlrUnTabela!=null ? 'R$ '+x.vlrUnTabela.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
        return '<tr><td class="rm-cod">'+esc(x.codSolic||m.cod)+'</td><td>'+esc(x.produtoSolic||m.desc)+'</td><td class="rm-c">'+(x.qtde!=null?x.qtde:'—')+'</td><td class="rm-c">'+(x.qtdeAuto!=null?x.qtdeAuto:(x.qtde!=null?x.qtde:'—'))+'</td><td class="rm-c">'+tabelaFmt+'</td><td class="rm-c">&nbsp;</td></tr>';
      }).join('');
    }

    box.innerHTML=
      '<div class="panel" style="padding:0">'+
        '<div class="resumo-mini-hd">'+ico(conf.icone,13)+' '+conf.titulo+
          '<button class="btn sm ghost resumo-exp-btn" style="margin-left:10px;letter-spacing:0;text-transform:none">'+ico('chevron-down',12)+' Detalhes</button>'+
          '<span class="resumo-mini-cnt">'+itens.length+'</span>'+
        '</div>'+
        '<div class="resumo-mini-tbl"><table>'+cols+'<thead>'+thead+'</thead><tbody>'+linhas+'</tbody></table></div>'+
        '<div class="resumo-exp-slot" style="display:none"></div>'+
      '</div>';

    // Botão Detalhes: expande a visão COMPLETA (reusa os renderizadores detalhados)
    var slot=box.querySelector('.resumo-exp-slot');
    var btn=box.querySelector('.resumo-exp-btn');
    var carregado=false, aberto=false;
    btn.onclick=function(){
      aberto=!aberto;
      if(aberto && !carregado){
        slot.appendChild(tipo==='opme'?renderOpmeDetalhado(itens):renderMatMedDetalhado(itens));
        carregado=true; lcIcons();
      }
      slot.style.display=aberto?'block':'none';
      btn.innerHTML=(aberto?ico('chevron-up',12)+' Ocultar detalhes':ico('chevron-down',12)+' Detalhes');
      lcIcons();
    };
    return box;
  }

  function renderGuiaTab(g, ia, t){
    var d=el('div');
    if(t==='resumo'){
      var adp=ia.aderencia;
      var adCls=adp>=90?'alta':(adp>=70?'mod':(adp>=50?'baixa':'crit'));
      var _r4=calc4Riscos(g);
      var RISKS=[
        {label:'Regulatório',  val:_r4.regulatorio.val,  ico:'shield-alert', itens:_r4.regulatorio.itens},
        {label:'Assistencial', val:_r4.assistencial.val, ico:'heart-pulse',  itens:_r4.assistencial.itens},
        {label:'Documental',   val:_r4.documental.val,   ico:'file-warning', itens:_r4.documental.itens},
        {label:'Contratual',   val:_r4.contratual.val,   ico:'file-check',   itens:_r4.contratual.itens},
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
            '<span class="guia-metric-lbl">'+ico('bar-chart-2',11)+' Aderência regulatória</span>'+
            '<span class="guia-metric-val guia-metric-num adp-'+adCls+'">'+adp+'%</span>'+
          '</div>'+
          '<div class="guia-metric">'+
            '<span class="guia-metric-lbl">'+ico('git-branch',11)+' Fluxo</span>'+
            '<span class="guia-metric-val" style="font-size:12px">'+esc(g.fluxo.nome)+'</span>'+
          '</div>'+
        '</div>'+
        '<div class="g2" style="gap:12px;margin-top:14px">'+
          '<dl class="kv">'+
            '<dt>Guia</dt><dd>'+esc(g.numero)+'</dd>'+
            '<dt>Data emissão</dt><dd>'+esc(fmtDataEmissao(g))+'</dd>'+
            '<dt>Beneficiário</dt><dd>'+esc(g.beneficiario.nome)+'</dd>'+
            '<dt>Data de nascimento</dt><dd>'+esc(g.beneficiario.dataNascimento||'—')+(MOCK.calcIdade(g.beneficiario.dataNascimento)!=null?' <span style="color:var(--muted)">('+MOCK.calcIdade(g.beneficiario.dataNascimento)+' anos)</span>':'')+'</dd>'+
            '<dt>Carteirinha</dt><dd>'+esc(g.beneficiario.carteirinha||'—')+'</dd>'+
            '<dt>CPF</dt><dd>'+mask(g.beneficiario.cpf)+'</dd>'+
            '<dt>Plano / Contrato</dt><dd>'+esc(g.beneficiario.plano)+' · '+esc(g.beneficiario.contrato)+'</dd>'+
            '<dt>Acomodação</dt><dd>'+esc(g.beneficiario.acomodacao||'—')+'</dd>'+
            '<dt>Data de inclusão</dt><dd>'+esc(g.beneficiario.dataInclusao||'—')+(MOCK.anosContrato(g.beneficiario.dataInclusao)!=null?' <span style="color:var(--muted)">('+MOCK.anosContrato(g.beneficiario.dataInclusao)+' '+(MOCK.anosContrato(g.beneficiario.dataInclusao)===1?'ano':'anos')+' de contrato)</span>':'')+'</dd>'+
          '</dl>'+
          '<dl class="kv">'+
            '<dt>Solicitante</dt><dd>'+esc(g.solicitante)+'</dd>'+
            '<dt>Executante</dt><dd>'+esc(g.prestadorExe.nome)+'</dd>'+
            '<dt>Local do atendimento</dt><dd>'+esc(g.prestadorExe.nome)+'</dd>'+
            '<dt>Especialidade</dt><dd>'+esc(MOCK.especialidadeDaGuia(g))+'</dd>'+
            '<dt>Natureza</dt><dd>'+esc(MOCK.naturezaDetalhada(g))+'</dd>'+
            '<dt>Regime</dt><dd>'+esc(g.regime)+'</dd>'+
            '<dt>CID</dt><dd>'+esc(MOCK.cidGuia(g).codigo)+'</dd>'+
            '<dt>Indicação clínica / Hipótese diagnóstica</dt><dd>'+esc(MOCK.cidGuia(g).descricao)+'</dd>'+
            '<dt>Origem</dt><dd><span class="badge muted">'+esc(g.origem)+'</span></dd>'+
            '<dt>Status da guia</dt><dd>'+statusBadge(g.status)+'</dd>'+
          '</dl>'+
        '</div>'+
        '<div class="guia-risk-grid guia-risk-grid--row" style="margin-top:14px">'+
          RISKS.map(function(r,ri){
            return '<div class="guia-risk-card risk-'+r.val+' risk-click" data-risk4="'+ri+'" title="Ver como o risco '+esc(r.label)+' é calculado">'+
              '<span class="guia-risk-ico">'+ico(r.ico,15)+'</span>'+
              '<div class="guia-risk-body">'+
                '<div class="guia-risk-name">'+r.label+'</div>'+
                riskPill(r.val)+
              '</div>'+
              '<span class="guia-risk-info">'+ico('info',12)+'</span>'+
            '</div>';
          }).join('')+
        '</div>'+
        '<div class="resumo-mini-stack">'+
          resumoMiniTabela('Procedimentos','stethoscope',g.procedimentos,{tipo:'procedimentos'})+
          resumoMiniTabela('Pacotes','package',g.pacotes)+
          resumoMiniTabela('Diárias/Taxas','calendar-days',g.diariasTaxas,{tipo:'diarias'})+
          '<div class="resumo-matmed-slot"></div>'+
          '<div class="resumo-opme-slot"></div>'+
        '</div>'+
        '<div class="resumo-anexos-slot" style="margin-top:14px"></div>'+
        '<div class="resumo-hist-slot" style="margin-top:14px"></div>'+
        '<div class="resumo-crit-slot" style="margin-top:14px"></div>'+
        '<div class="ai-warn" style="margin-top:14px">'+ia.avisoLegal+'</div>';
      // Mat/Med e OPME (resumidos + expansíveis) migrados para o Resumo
      var _mmSlot=d.querySelector('.resumo-matmed-slot');
      if(_mmSlot) _mmSlot.replaceWith(renderResumoExpandivel(g,'matmed'));
      var _opSlot=d.querySelector('.resumo-opme-slot');
      if(_opSlot) _opSlot.replaceWith(renderResumoExpandivel(g,'opme'));
      // Anexos, Histórico e Críticas migrados para o Resumo
      var _anxSlot=d.querySelector('.resumo-anexos-slot');
      if(_anxSlot) _anxSlot.appendChild(renderAnexos(g));
      var _histSlot=d.querySelector('.resumo-hist-slot');
      if(_histSlot) _histSlot.appendChild(renderHistoricoSecao(g));
      var _critSlot=d.querySelector('.resumo-crit-slot');
      if(_critSlot) _critSlot.appendChild(renderCriticasSecao(g,ia));
      // Cards de risco clicáveis → abre o detalhamento dos fatores
      d.querySelectorAll('.risk-click[data-risk4]').forEach(function(card){
        card.onclick=function(){ showRisco4Detalhe(g, RISKS[+card.getAttribute('data-risk4')]); };
      });
    } else if(t==='etapas'){
      var idxAtual=etapaAtualIdx(g);
      var etAtual=g.etapas[idxAtual];
      var podeAvancar=podeMoverEtapa(1) && idxAtual<g.etapas.length-1;
      var podeVoltar=podeMoverEtapa(-1) && idxAtual>0;
      // Barra de controle da etapa atual
      if(etAtual){
        var ctrl=el('div',{class:'etapa-ctrl'});
        ctrl.innerHTML=
          '<div class="etapa-ctrl-info">'+ico('git-branch',14)+' Etapa atual: <b>'+esc(etAtual.nome)+'</b> <span class="badge muted" style="font-size:10px">resp.: '+esc(etAtual.responsavel)+'</span></div>'+
          '<div class="etapa-ctrl-btns">'+
            (podeVoltar?'<button class="btn sm ghost" id="etVoltar">'+ico('chevron-left',13)+' Voltar etapa</button>':'')+
            (podeAvancar?'<button class="btn sm" id="etAvancar">Avançar etapa '+ico('chevron-right',13)+'</button>':'')+
          '</div>';
        d.appendChild(ctrl);
        if(!podeAvancar && !podeVoltar){
          d.appendChild(el('div',{class:'etapa-ctrl-note'},ico('info',12)+' '+(State.perfil==='enfermeiro'?'Seu perfil pode apenas avançar etapas.':'Sem etapas disponíveis para mover a partir daqui.')));
        }
      }
      var STL={aguardando:'Aguardando',em_execucao:'Em execução',concluida:'Concluído',nao_realizado:'Não realizado'};
      var tl=el('div',{class:'timeline'});
      g.etapas.forEach(function(e,i){
        var cls = e.status==='concluida'?'done':(e.status==='em_execucao'?'cur':(e.status==='nao_realizado'?'nr':''));
        var podeMarcar = podeMoverEtapa(1) && e.status!=='em_execucao';
        var btnNR = podeMarcar
          ? ('<button class="btn xs ghost tl-nr-btn" data-idx="'+i+'" type="button">'+(e.status==='nao_realizado'?ico('rotate-ccw',11)+' Reabrir':ico('ban',11)+' Marcar como não realizado')+'</button>')
          : '';
        tl.appendChild(el('div',{class:'tl-item '+cls},'<h4>'+e.ordem+'. '+esc(e.nome)+'</h4><div class="meta">Responsável: '+esc(e.responsavel)+' · Prazo: '+e.prazoHoras+'h · Status: <b>'+esc(STL[e.status]||e.status)+'</b>'+(e.inicio?' · Início: '+esc(e.inicio):'')+(e.fim?' · Fim: '+esc(e.fim):'')+'</div>'+(btnNR?'<div class="tl-nr-wrap">'+btnNR+'</div>':'')));
      });
      d.appendChild(tl);
      function _reetapas(){ var novo=renderGuiaTab(g,ia,'etapas'); d.replaceWith(novo); }
      var _av=d.querySelector('#etAvancar'); if(_av) _av.onclick=function(){ if(moverEtapa(g,1)){ toast('Guia avançada para a próxima etapa','ok'); _reetapas(); } };
      var _vt=d.querySelector('#etVoltar'); if(_vt) _vt.onclick=function(){ if(moverEtapa(g,-1)){ toast('Guia retornada à etapa anterior','ok'); _reetapas(); } };
      $$('.tl-nr-btn',d).forEach(function(b){
        b.onclick=function(){
          var idx=+b.getAttribute('data-idx'); var e=g.etapas[idx];
          if(marcarEtapaNaoRealizada(g, idx, e.status!=='nao_realizado')){ toast(e.status==='nao_realizado'?'Etapa marcada como não realizada':'Etapa reaberta (aguardando)','ok'); _reetapas(); }
        };
      });
    } else if(t==='ia'){
      d.appendChild(renderParecerIA(ia,g));
    } else if(t==='carencias'){
      d.innerHTML=renderCarenciasBody(g);
    } else if(t==='mensalidades'){
      d.innerHTML=renderMensalidadesBody(g);
    } else if(t==='histatend'){
      d.appendChild(renderHistAtendimento(g));
    } else if(t==='operadora'){
      if(!g.parecerOperadora) d.innerHTML='<div class="empty"><div class="ico">'+icoLg('file-pen-line')+'</div>Nenhum parecer da operadora registrado.<br><br>'+(can('parecer')?'<button class="btn" id="emPar">Emitir parecer agora</button>':'')+'</div>';
      else {
        var p=g.parecerOperadora;
        var itensHtml='';
        if(p.itens && p.itens.length){
          itensHtml='<div class="pit-tbl-wrap" style="margin:8px 0"><table class="pit-tbl"><thead><tr><th>Tipo</th><th>Código</th><th>Serviço</th><th>Parecer</th><th>Motivo / Justificativa</th></tr></thead><tbody>'+
            p.itens.map(function(it){
              var bd=it.parecer==='fav'?'<span class="badge ok" style="font-size:10px">Favorável</span>':'<span class="badge danger" style="font-size:10px">Desfavorável</span>';
              return '<tr><td class="nw">'+esc(it.tipo)+'</td><td class="rm-cod">'+esc(it.cod)+'</td><td>'+esc(it.desc)+'</td><td>'+bd+'</td><td>'+esc(it.motivo||'')+(it.justificativa?'<div class="pit-just">'+esc(it.justificativa)+'</div>':'')+'</td></tr>';
            }).join('')+'</tbody></table></div>';
        } else if(p.motivo||p.justificativa){
          // compat. com pareceres antigos (decisão única)
          itensHtml='<dl class="kv"><dt>Motivo</dt><dd>'+esc(p.motivo||'—')+'</dd><dt>Justificativa</dt><dd>'+esc(p.justificativa||'—')+'</dd></dl>';
        }
        var r=p.resumo;
        var resumoHtml=r?'<div class="pit-resumo-in" style="margin-bottom:8px">'+ico('gauge',13)+' '+r.favoravel+' favorável(is) · '+r.desfavoravel+' desfavorável(is)'+(r.semParecer?' · '+r.semParecer+' sem parecer':'')+'</div>':'';
        d.innerHTML='<div class="ai-box"><div class="hd"><div class="tt">Parecer da Operadora</div><span class="badge dark">'+esc(p.decisao)+'</span></div>'+
          resumoHtml+itensHtml+
          '<dl class="kv"><dt>Observações impressas</dt><dd>'+esc(p.obsImp||'—')+'</dd><dt>Observações não impressas</dt><dd>'+esc(p.obsInt||'—')+'</dd><dt>Emitido por</dt><dd>'+esc(p.user)+' · '+esc(p.ts)+'</dd></dl></div>';
      }
      setTimeout(function(){ var b2=d.querySelector('#emPar'); if(b2) b2.onclick=function(){openParecer(g)}; },0);
    } else if(t==='obsimp'){
      d.appendChild(renderObsImpressas(g));
    } else if(t==='obsnaoimp'){
      d.appendChild(renderObsNaoImpressas(g));
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

  // Aba "Hist. atendimento": tabela de atendimentos do paciente + abas inferiores (dados da linha selecionada)
  function renderHistAtendimento(g){
    var wrap=el('div',{class:'hist-atend'});
    var hist = MOCK.historicoAtendimentos ? MOCK.historicoAtendimentos(g) : [];
    if(!hist.length){
      wrap.innerHTML='<div class="empty"><div class="ico">'+icoLg('history')+'</div>Sem histórico de atendimentos para este beneficiário.</div>';
      return wrap;
    }

    function moneyBR(v){ return v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function isoToDate(iso){ if(!iso) return null; var p=iso.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }

    // ── Filtro de período (padrão: últimos 180 dias) + busca ──
    var hoje=new Date();
    var d180=new Date(hoje.getTime()-180*86400000);
    function _iso(d){ var mm=d.getMonth()+1, dd=d.getDate(); return d.getFullYear()+'-'+(mm<10?'0':'')+mm+'-'+(dd<10?'0':'')+dd; }
    var _periodoDe=_iso(d180), _periodoAte=_iso(hoje); // ISO yyyy-mm-dd
    var _busca='';
    var histView=hist.slice();

    // ── Tabela superior (histórico) ──
    var thead='<tr>'+
      '<th>Data</th><th>Guia</th><th class="cc">Qtd. Solic.</th><th class="cc">Qtd. Aut.</th>'+
      '<th>Código</th><th>Procedimento</th><th>Solicitante</th><th>Prestador</th>'+
      '<th>Local de atendimento</th><th>Especialidade</th><th>CID</th><th class="cc">Diárias</th>'+
      '<th class="cc">Valor (R$)</th><th>Faturamento</th>'+
    '</tr>';
    function linhaHtml(a,idx,selecionado){
      var fatCls = a.faturamento==='Faturada'?'fat-ok':(a.faturamento==='Em análise'?'fat-ana':'fat-nao');
      return '<tr data-hist="'+idx+'"'+(selecionado?' class="sel"':'')+'>'+
        '<td class="nw">'+esc(a.data)+'</td>'+
        '<td class="nw"><b>'+esc(a.guia)+'</b></td>'+
        '<td class="cc">'+a.qtdSolic+'</td>'+
        '<td class="cc">'+a.qtdAut+'</td>'+
        '<td class="nw">'+esc(a.cod)+'</td>'+
        '<td>'+esc(a.procedimento)+'</td>'+
        '<td>'+esc(a.solicitante)+'</td>'+
        '<td>'+esc(a.prestador)+'</td>'+
        '<td>'+esc(a.local)+'</td>'+
        '<td>'+esc(a.espec)+'</td>'+
        '<td class="nw">'+esc(a.cid)+'</td>'+
        '<td class="cc">'+a.diarias+'</td>'+
        '<td class="cc">'+moneyBR(a.valor)+'</td>'+
        '<td class="nw"><span class="hist-fat '+fatCls+'">'+esc(a.faturamento)+'</span></td>'+
      '</tr>';
    }
    var tabelaTop=el('div',{class:'hist-top'});
    tabelaTop.innerHTML=
      '<div class="hist-top-hd">'+ico('history',13)+' HISTÓRICO DE ATENDIMENTOS'+
        '<span class="resumo-mini-cnt" id="histCnt">'+hist.length+'</span></div>'+
      '<div class="hist-filtros">'+
        '<div class="hist-filtro-periodo" id="histPeriodoSlot"></div>'+
        '<div class="hist-busca-wrap">'+ico('search',13)+
          '<input type="text" id="histBusca" placeholder="Buscar por código, procedimento, solicitante, especialidade, prestador...">'+
          '<button class="hist-busca-clear" id="histBuscaClear" title="Limpar" style="display:none">'+ico('x',12)+'</button>'+
        '</div>'+
        '<div class="hist-filtro-info" id="histFiltroInfo"></div>'+
      '</div>'+
      '<div class="hist-top-tbl"><table><thead>'+thead+'</thead><tbody id="histTbody"></tbody></table></div>';
    wrap.appendChild(tabelaTop);

    var _tbody=tabelaTop.querySelector('#histTbody');
    var _cnt=tabelaTop.querySelector('#histCnt');
    var _info=tabelaTop.querySelector('#histFiltroInfo');

    function aplicarFiltro(){
      var de=isoToDate(_periodoDe), ate=isoToDate(_periodoAte);
      if(ate) ate=new Date(ate.getTime()+86399000); // inclui o dia inteiro do "até"
      var q=_busca.trim().toLowerCase();
      histView=hist.filter(function(a){
        if(de && a.dataObj < de) return false;
        if(ate && a.dataObj > ate) return false;
        if(q){
          var alvo=(a.cod+' '+a.procedimento+' '+a.solicitante+' '+a.espec+' '+a.prestador+' '+a.local+' '+a.cid+' '+a.guia+' '+a.faturamento).toLowerCase();
          if(alvo.indexOf(q)<0) return false;
        }
        return true;
      });
      // reset seleção para o primeiro da lista filtrada
      selIdx = histView.length ? 0 : -1;
      _tbody.innerHTML = histView.length
        ? histView.map(function(a,i){ return linhaHtml(a,i,i===0); }).join('')
        : '<tr><td colspan="14" class="hist-erp-empty" style="text-align:center;color:var(--muted);padding:16px">Nenhum atendimento no período/critério informado.</td></tr>';
      _cnt.textContent=histView.length;
      var n=histView.length;
      var qtdeTxt='<b>'+n+'</b> atendimento'+(n===1?'':'s');
      _info.innerHTML=ico('calendar',11)+' '+qtdeTxt+(_periodoDe?' no período selecionado':' (todos os períodos)');
      // religar cliques de seleção
      _tbody.querySelectorAll('tr[data-hist]').forEach(function(tr){
        tr.onclick=function(){
          _tbody.querySelectorAll('tr[data-hist]').forEach(function(x){x.classList.remove('sel')});
          tr.classList.add('sel');
          selIdx=+tr.getAttribute('data-hist');
          paint();
        };
      });
      paint();
    }

    // ── Abas inferiores ──
    var SUBTABS=[
      {id:'itens',   label:'Itens lançados na guia'},
      {id:'obsimp',  label:'Observações da guia'},
      {id:'obsni',   label:'Observações não impressas'},
      {id:'hip',     label:'Hipótese diagnóstica'},
      {id:'aud',     label:'Auditoria médica'},
      {id:'msg',     label:'Mensagens para o prestador Web'}
    ];
    var bottom=el('div',{class:'hist-bottom'});
    var subbar='<div class="hist-subtabs">'+SUBTABS.map(function(s,i){
      return '<button class="hist-subtab'+(i===0?' active':'')+'" data-sub="'+s.id+'">'+esc(s.label)+'</button>';
    }).join('')+'</div><div class="hist-subcontent"></div>';
    bottom.innerHTML=subbar;
    wrap.appendChild(bottom);

    var subContent=bottom.querySelector('.hist-subcontent');
    var selIdx=0;
    var curSub='itens';

    function moneyRow(a){ return a; }
    function renderSub(sub, a){
      if(sub==='itens'){
        var rows=(a.itens||[]).map(function(it){
          return '<tr><td>'+esc(it.tipo)+'</td><td class="nw">'+esc(it.cod)+'</td><td>'+esc(it.desc)+'</td>'+
            '<td class="cc">'+it.qtdSolic+'</td><td class="cc">'+it.qtdAut+'</td><td>'+esc(it.procJuridico||'—')+'</td></tr>';
        }).join('');
        return '<div class="hist-sub-tbl"><table><thead><tr><th>Tipo de item</th><th>Código</th><th>Descrição</th>'+
          '<th class="cc">Qtd. solicitada</th><th class="cc">Qtd. autorizada</th><th>Processo Jurídico</th></tr></thead>'+
          '<tbody>'+rows+'</tbody></table></div>';
      }
      if(sub==='obsimp'){
        return '<div class="hist-sub-txt">'+
          '<div class="hist-sub-lb">'+ico('printer',12)+' Observações da guia (impressas) <span class="badge muted" style="font-size:9px">somente leitura</span></div>'+
          '<div class="hist-sub-body">'+(a.obsImpressas?esc(a.obsImpressas):'<span class="mut">Sem observações impressas.</span>')+'</div></div>';
      }
      if(sub==='obsni'){
        var lst=(a.obsNaoImpressas||[]).map(function(o){
          return '<div class="hist-obsni-item"><div class="hist-obsni-meta">'+esc(o.data)+' · <b>'+esc(o.operador)+'</b> · pode informar ao prestador: '+esc(o.podeInformar)+'</div>'+
            '<div class="hist-obsni-txt">'+esc(o.texto)+'</div></div>';
        }).join('');
        return '<div class="hist-sub-txt">'+
          '<div class="hist-sub-lb">'+ico('eye-off',12)+' Observações não impressas (internas) <span class="badge muted" style="font-size:9px">somente leitura</span></div>'+
          (lst||'<div class="hist-sub-body"><span class="mut">Sem observações internas.</span></div>')+'</div>';
      }
      if(sub==='hip'){
        return '<div class="hist-sub-txt">'+
          '<div class="hist-sub-lb">'+ico('stethoscope',12)+' Hipótese diagnóstica <span class="badge muted" style="font-size:9px">somente leitura</span></div>'+
          '<div class="hist-sub-body">'+(a.hipotese?esc(a.hipotese):'<span class="mut">Não informada.</span>')+'</div></div>';
      }
      // Auditoria médica — estrutura fiel ao ERP (somente leitura, sem registros)
      if(sub==='aud'){
        return '<div class="hist-erp">'+
          '<div class="hist-erp-fields">'+
            '<label class="hist-erp-fld"><span>Motivo do Status</span>'+
              '<select disabled><option></option></select></label>'+
            '<label class="hist-erp-fld hist-erp-fld--sm"><span>Precisa de auditoria pós</span>'+
              '<select disabled><option></option></select></label>'+
          '</div>'+
          '<div class="hist-erp-toolbar">'+
            ['Incluir','Gravar','Excluir','Editar','Cancelar'].map(function(x){return '<span class="hist-erp-act disabled">'+esc(x)+'</span>';}).join('')+
          '</div>'+
          '<div class="hist-sub-tbl"><table><thead><tr><th>Data</th><th>Operador</th></tr></thead>'+
            '<tbody><tr class="hist-erp-empty"><td colspan="2">Sem registros de auditoria médica para esta guia.</td></tr></tbody></table></div>'+
          '<div class="hist-erp-checks">'+
            '<label class="hist-erp-chk"><input type="checkbox" disabled checked> Notificar através de alerta o(a) auditor(a)</label>'+
            '<label class="hist-erp-chk"><input type="checkbox" disabled checked> Mostrar no demonstrativo de contas da web</label>'+
          '</div>'+
          '<div class="hist-erp-ro">'+ico('lock',11)+' Somente leitura</div>'+
        '</div>';
      }
      // Mensagens para o prestador Web — estrutura fiel ao ERP (somente leitura, sem registros)
      if(sub==='msg'){
        return '<div class="hist-erp">'+
          '<div class="hist-erp-toolbar">'+
            ['Incluir','Gravar','Editar','Cancelar','Excluir','Resposta'].map(function(x){return '<span class="hist-erp-act disabled">'+esc(x)+'</span>';}).join('')+
          '</div>'+
          '<div class="hist-sub-tbl"><table><thead><tr><th>Data</th><th>Operador</th><th>Visualizado</th></tr></thead>'+
            '<tbody><tr class="hist-erp-empty"><td colspan="3">Sem mensagens para o prestador nesta guia.</td></tr></tbody></table></div>'+
          '<div class="hist-erp-ro">'+ico('lock',11)+' Somente leitura</div>'+
        '</div>';
      }
      return '';
    }
    function paint(){
      var a = (selIdx>=0 && histView[selIdx]) ? histView[selIdx] : null;
      subContent.innerHTML = a ? renderSub(curSub, a)
        : '<div class="hist-sub-ph"><div class="ico">'+icoLg('search-x')+'</div><b>Nenhum atendimento selecionado</b><div class="mut" style="margin-top:6px">Ajuste o período ou a busca para ver os detalhes.</div></div>';
      lcIcons();
    }

    // troca de sub-aba
    bottom.querySelectorAll('.hist-subtab').forEach(function(b){
      b.onclick=function(){
        bottom.querySelectorAll('.hist-subtab').forEach(function(x){x.classList.remove('active')});
        b.classList.add('active');
        curSub=b.getAttribute('data-sub');
        paint();
      };
    });

    // Filtro de período (date range) — reusa makeDateRangePicker; padrão últimos 180 dias
    var _perSlot=tabelaTop.querySelector('#histPeriodoSlot');
    makeDateRangePicker(_perSlot, _periodoDe, _periodoAte, function(de,ate){
      // limpar o período (de/ate vazios) → mostra todo o histórico
      _periodoDe = de || ''; _periodoAte = ate || (de ? _iso(hoje) : '');
      aplicarFiltro();
    }, {label:'Período', placeholder:'Todos os períodos'});

    // Campo de busca (debounce leve)
    var _inpBusca=tabelaTop.querySelector('#histBusca');
    var _btnClear=tabelaTop.querySelector('#histBuscaClear');
    var _buscaTimer=null;
    _inpBusca.oninput=function(){
      _busca=this.value;
      _btnClear.style.display=_busca?'flex':'none';
      clearTimeout(_buscaTimer);
      _buscaTimer=setTimeout(aplicarFiltro, 180);
    };
    _btnClear.onclick=function(){ _inpBusca.value=''; _busca=''; _btnClear.style.display='none'; aplicarFiltro(); _inpBusca.focus(); };

    aplicarFiltro(); // render inicial (últimos 180 dias)
    return wrap;
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
  // Renderiza Mat/Med com o detalhamento completo (campos estilo Solus), um card por item
  function renderMatMedDetalhado(itens){
    var wrap=el('div',{class:'mm-det-wrap'});
    function money(v){ return 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function money4(v){ return (v||0).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4}); }
    function campo(k,v){ return '<div class="mm-det-field"><span class="mm-det-k">'+esc(k)+'</span><span class="mm-det-v">'+v+'</span></div>'; }
    itens.forEach(function(m){
      var x = MOCK.matmedDetalhe(m);
      var card=el('div',{class:'mm-det-card'});
      card.innerHTML=
        '<div class="mm-det-hd">'+
          '<span class="mm-det-cod">'+esc(x.cod)+'</span>'+
          '<span class="mm-det-desc">'+esc(x.desc)+'</span>'+
          (x.opme?'<span class="badge warn" style="font-size:10px">OPME</span>':'<span class="badge" style="font-size:10px">Medicação/Material</span>')+
        '</div>'+
        // Grupo: quantidades e cálculo
        '<div class="mm-det-grp">'+
          campo('Qtde',x.qtde.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Qtde Solic.',x.qtdeSolic.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Cálculo',esc(x.calculo))+
          campo('Fornecido?',esc(x.fornecido))+
          campo('Status da requisição',esc(x.statusReq))+
          campo('Qtd consolidado',x.qtdConsolidada)+
          campo('Qtd devolvido',x.qtdDevolvida)+
        '</div>'+
        // Grupo: valores
        '<div class="mm-det-grp">'+
          campo('Vlr Un. tabela (R$)',money4(x.vlrTabela))+
          campo('Vlr Un. autorizado (R$)',money4(x.vlrAutorizado))+
          campo('Total solicitado (R$)',money(x.totalSolicitado))+
          campo('Total autorizado (R$)',money(x.totalAutorizado))+
          campo('Total solic./doses (R$)',money(x.totalSolicitadoDoses))+
          campo('Total autoriz./doses (R$)',money(x.totalAutorizadoDoses))+
          campo('Co-part. (R$)',money(x.coParticipacao))+
        '</div>'+
        // Grupo: doses / unidade / uso
        '<div class="mm-det-grp">'+
          campo('Prev. de uso',esc(x.prevUso))+
          campo('Descrição específica',esc(x.descEspecifica))+
          campo('Núm. doses Soli.',x.dosesSolic.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Núm. doses',x.doses.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Unidade',esc(x.unidade))+
          campo('Unidade TNUMM',esc(x.unidadeTNUMM))+
        '</div>'+
        // Grupo: administração
        '<div class="mm-det-grp">'+
          campo('Via (Med.)',esc(x.via))+
          campo('Frequência',x.frequencia||'—')+
          campo('Ordenação',x.ordenacao)+
          campo('Dados do Kit de produtos',esc(x.kit))+
          campo('Alterado em relação ao KIT?',esc(x.alteradoKit))+
          campo('Processo Jurídico',esc(x.processoJuridico))+
          campo('Pacote PTU',esc(x.pacotePTU))+
        '</div>';
      wrap.appendChild(card);
    });
    return wrap;
  }

  // Renderiza OPME com campos próprios (estilo Solus), agrupando Solicitado x Autorizado
  function renderOpmeDetalhado(itens){
    var wrap=el('div',{class:'mm-det-wrap'});
    function money(v){ return 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function money4(v){ return (v||0).toLocaleString('pt-BR',{minimumFractionDigits:4,maximumFractionDigits:4}); }
    function campo(k,v){ return '<div class="mm-det-field"><span class="mm-det-k">'+esc(k)+'</span><span class="mm-det-v">'+v+'</span></div>'; }
    function subhd(t){ return '<div class="mm-det-subhd">'+t+'</div>'; }
    itens.forEach(function(m){
      var x = MOCK.opmeDetalhe(m);
      var card=el('div',{class:'mm-det-card'});
      card.innerHTML=
        '<div class="mm-det-hd">'+
          '<span class="mm-det-cod">'+esc(x.cod)+'</span>'+
          '<span class="mm-det-desc">'+esc(x.desc)+'</span>'+
          '<span class="badge warn" style="font-size:10px">OPME</span>'+
        '</div>'+
        // Identificação regulatória
        '<div class="mm-det-grp">'+
          campo('Cod. Referência',esc(x.codReferencia))+
          campo('Registro ANVISA',esc(x.anvisa))+
          campo('Marca',esc(x.marca))+
          campo('Consignado',esc(x.consignado))+
          campo('Fornecido?',esc(x.fornecido))+
          campo('Qtde',x.qtde.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Cálculo',esc(x.calculo))+
          campo('Status da requisição',esc(x.statusReq))+
          campo('Qtd consolidado',x.qtdConsolidada)+
          campo('Qtd devolvido',x.qtdDevolvida)+
          campo('Fornecedor utilizado',esc(x.fornecedorUtilizado))+
          campo('Ordem prioridade',x.ordemPrioridade)+
        '</div>'+
        // Bloco SOLICITADO
        subhd(ico('arrow-up-right',12)+' Solicitado')+
        '<div class="mm-det-grp">'+
          campo('Fornecedor solicitado',esc(x.fornecedorSolic))+
          campo('Código solicitado',esc(x.codSolic))+
          campo('ANVISA solicitado',esc(x.anvisaSolic))+
          campo('Produto solicitado',esc(x.produtoSolic))+
          campo('Vlr Un. tabela (R$)',money4(x.vlrUnTabela))+
          campo('Vlr Un. cotado/pago (R$)',money4(x.vlrUnCotado))+
          campo('Total cotado/pago (R$)',money(x.vlrTotalCotado))+
          campo('Vlr Un. solicitado (R$)',money4(x.vlrUnSolic))+
          campo('Vlr Total solic. (R$)',money(x.vlrTotalSolic))+
        '</div>'+
        // Bloco AUTORIZADO
        subhd(ico('check-circle-2',12)+' Autorizado')+
        '<div class="mm-det-grp">'+
          campo('Qtde autorizada',x.qtdeAuto.toLocaleString('pt-BR',{minimumFractionDigits:4}))+
          campo('Fornecedor autorizado',esc(x.fornecedorAutoriz))+
          campo('Código autorizado',esc(x.codAutoriz))+
          campo('Produto autorizado',esc(x.produtoAutoriz))+
          campo('Vlr Un. autorizado (R$)',money4(x.vlrUnAutorizado))+
          campo('Vlr Total autor. (R$)',money(x.vlrTotalAutorizado))+
          campo('Negociado?',esc(x.negociado))+
        '</div>'+
        // Rastreabilidade e entrega
        '<div class="mm-det-grp">'+
          campo('Produto Solic. Intercâmbio/PTU',esc(x.produtoInterPTU))+
          campo('Produto entregue/utilizado?',esc(x.produtoEntregue))+
          campo('Data de entrega',esc(x.dataEntrega))+
          campo('Tipo do anexo',esc(x.tipoAnexo))+
          campo('Processo Jurídico',esc(x.processoJuridico))+
          campo('Cód. Produto do Fabricante',esc(x.codProdutoFabricante))+
          campo('Laboratório detentor do registro ANVISA',esc(x.labAnvisa))+
          campo('Observações/Especificações',esc(x.observacoesEspec))+
        '</div>';
      wrap.appendChild(card);
    });
    return wrap;
  }

  // Combina: adicionadas pelo auditor (localStorage) + do Parecer da Operadora + do ERP (simuladas)
  function getObsNaoImpressas(g){
    var base=(MOCK.observacoesGuia?MOCK.observacoesGuia(g.numero).naoImpressas:[]).slice();
    var add=JSON.parse(localStorage.getItem('regula_obs_'+g.numero)||'[]');
    var doParecer=[];
    if(g.parecerOperadora && g.parecerOperadora.obsInt){
      doParecer.push({data:g.parecerOperadora.ts||'—',operador:g.parecerOperadora.user||'Operadora',podeInformar:'Não',texto:g.parecerOperadora.obsInt,origem:'Parecer da Operadora'});
    }
    // ordem: adicionadas → do parecer → do ERP
    return add.concat(doParecer).concat(base);
  }
  function getObsImpressas(g){
    var erp=MOCK.observacoesGuia?MOCK.observacoesGuia(g.numero).impressas:'';
    // acrescenta a observação impressa do Parecer (vai para o prestador), se houver
    if(g.parecerOperadora && g.parecerOperadora.obsImp){
      return 'Do Parecer da Operadora:\n'+g.parecerOperadora.obsImp+'\n\n'+erp;
    }
    return erp;
  }

  // Aba: Observações Impressas (texto por extenso — leitura)
  function renderObsImpressas(g){
    var wrap=el('div');
    var txt=getObsImpressas(g);
    wrap.innerHTML=
      '<div class="obs-imp-box">'+
        '<div class="obs-imp-hd">'+ico('printer',14)+' Observações impressas <span class="badge muted" style="font-size:10px">somente leitura</span></div>'+
        '<div class="obs-imp-txt">'+(txt?esc(txt):'<span style="color:var(--muted)">Sem observações impressas para esta guia.</span>')+'</div>'+
      '</div>';
    return wrap;
  }

  // Aba: Observações Não Impressas (tabela + detalhe + adicionar)
  function renderObsNaoImpressas(g){
    var wrap=el('div',{class:'obs-ni-wrap'});
    var lista=getObsNaoImpressas(g);
    var sel=0;

    function pinta(){
      var rows=lista.map(function(o,i){
        return '<tr class="obs-ni-row'+(i===sel?' sel':'')+'" data-i="'+i+'">'+
          '<td>'+esc(o.data)+(o.origem?' <span class="badge info" style="font-size:8.5px">'+esc(o.origem)+'</span>':'')+'</td>'+
          '<td>'+esc(o.operador)+'</td>'+
          '<td style="text-align:center">'+(o.podeInformar==='Sim'?'<span class="badge">Sim</span>':'<span class="badge muted">Não</span>')+'</td>'+
        '</tr>';
      }).join('');
      var atual=lista[sel]||null;
      var detalhe = atual
        ? '<div class="obs-ni-det-hd">'+ico('message-square',13)+' Observação selecionada</div>'+
          (atual.ref?'<div class="obs-ni-ref">'+esc(atual.ref)+(atual.guia?'':'')+'</div>':'')+
          '<div class="obs-ni-txt">'+esc(atual.texto)+'</div>'+
          '<div class="obs-ni-meta"><span><b>Operador:</b> '+esc(atual.operador)+'</span><span><b>Data:</b> '+esc(atual.data)+'</span><span><b>Pode informar ao usuário:</b> '+esc(atual.podeInformar)+'</span></div>'
        : '<div style="color:var(--muted);padding:14px">Nenhuma observação. Adicione a primeira abaixo.</div>';

      wrap.innerHTML=
        '<div class="obs-ni-grid">'+
          '<div class="obs-ni-tab"><table class="cfg-table"><thead><tr><th>Data</th><th>Operador</th><th style="text-align:center">Pode Inf. Usuár.</th></tr></thead><tbody>'+
            (rows||'<tr><td colspan="3" style="color:var(--muted)">Sem observações.</td></tr>')+
          '</tbody></table></div>'+
          '<div class="obs-ni-det">'+detalhe+'</div>'+
        '</div>'+
        '<div class="obs-ni-add">'+
          '<div class="obs-ni-add-hd">'+ico('plus',13)+' Adicionar observação não impressa</div>'+
          '<textarea id="obsNiTxt" class="obs-ni-input" rows="2" placeholder="Digite a observação..."></textarea>'+
          '<div class="obs-ni-add-row">'+
            '<label class="obs-ni-lbl">Pode informar ao usuário? '+
              '<select id="obsNiPode"><option value="Não">Não</option><option value="Sim">Sim</option></select>'+
            '</label>'+
            '<button class="btn" id="obsNiSalvar">'+ico('save',13)+' Gravar</button>'+
          '</div>'+
        '</div>';

      // binds
      wrap.querySelectorAll('.obs-ni-row').forEach(function(r){ r.onclick=function(){ sel=+r.getAttribute('data-i'); pinta(); }; });
      wrap.querySelector('#obsNiSalvar').onclick=function(){
        var txt=wrap.querySelector('#obsNiTxt').value.trim();
        if(!txt){ toast('Digite a observação','err'); return; }
        var pode=wrap.querySelector('#obsNiPode').value;
        var now=new Date();
        var user=(perfilDef[State.perfil]&&perfilDef[State.perfil].nome)||State.perfil;
        var nova={data:pad2(now.getDate())+'/'+pad2(now.getMonth()+1)+'/'+now.getFullYear()+' '+pad2(now.getHours())+':'+pad2(now.getMinutes()),operador:user,podeInformar:pode,texto:txt};
        var add=JSON.parse(localStorage.getItem('regula_obs_'+g.numero)||'[]');
        add.unshift(nova); localStorage.setItem('regula_obs_'+g.numero,JSON.stringify(add));
        lista=getObsNaoImpressas(g); sel=0; pinta();
        toast('Observação gravada','ok');
      };
      lcIcons();
    }
    pinta();
    return wrap;
  }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function renderAnexos(g){
    var wrap=el('div');
    // Botão de anexar (sempre disponível, mesmo sem anexos) — compacto p/ caber no cabeçalho
    function botaoAnexar(){
      var b=el('button',{class:'btn sm',style:'letter-spacing:0;text-transform:none'},ico('upload',13)+' Anexar documento');
      b.onclick=function(){ openAnexoUpload(g, function(){ var novo=renderAnexos(g); wrap.replaceWith(novo); }); };
      return b;
    }

    if(!g.anexosLista.length){
      // Cabeçalho no mesmo padrão das mini-tabelas, com estado vazio compacto
      var emptyCard=el('div',{class:'resumo-mini',style:'margin-bottom:10px'});
      emptyCard.innerHTML=
        '<div class="panel" style="padding:0">'+
          '<div class="resumo-mini-hd">'+ico('paperclip',13)+' GESTÃO DE ANEXOS'+
            '<span id="anxAddSlot0" style="margin-left:10px;display:inline-flex"></span>'+
            '<span class="resumo-mini-cnt">0</span>'+
          '</div>'+
          '<div class="resumo-mini-empty">Sem anexos ainda — anexe documentos recebidos (exames, laudos) e classifique-os.</div>'+
        '</div>';
      emptyCard.querySelector('#anxAddSlot0').appendChild(botaoAnexar());
      wrap.appendChild(emptyCard); lcIcons(); return wrap;
    }

    // Resumo por categoria
    var resumo={}; g.anexosLista.forEach(function(a){ resumo[a.categoria]=(resumo[a.categoria]||0)+1; });
    var totalAnot=0; g.anexosLista.forEach(function(a){ totalAnot+=(a.anotacoes||[]).length; });
    var chips=Object.keys(resumo).map(function(k){return '<span class="badge '+catColor(k)+'">'+esc(k)+' · '+resumo[k]+'</span>'}).join('');
    // Cabeçalho no MESMO padrão das mini-tabelas do Resumo (faixa verde-clara, ícone, título, contador)
    var head=el('div',{class:'resumo-mini'});
    head.innerHTML=
      '<div class="panel" style="padding:0">'+
        '<div class="resumo-mini-hd">'+ico('paperclip',13)+' GESTÃO DE ANEXOS'+
          '<span id="anxAddSlot" style="margin-left:10px;display:inline-flex"></span>'+
          '<span class="resumo-mini-cnt">'+g.anexosLista.length+'</span>'+
        '</div>'+
        '<div style="padding:10px 12px">'+
          '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">'+
            '<span class="badge muted">'+g.anexosLista.length+' arquivo'+(g.anexosLista.length===1?'':'s')+'</span>'+
            '<span class="badge info">'+totalAnot+' anotaç'+(totalAnot===1?'ão':'ões')+'</span>'+
            chips+
          '</div>'+
          '<div style="margin-top:8px;font-size:12px;color:var(--muted)">Anexe, visualize, categorize e anote cada documento. Todas as ações ficam registradas nos logs da guia.</div>'+
        '</div>'+
      '</div>';
    head.style.marginBottom='10px';
    head.querySelector('#anxAddSlot').appendChild(botaoAnexar());
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
            (a.analisadoIA?'<span class="badge anx-ia-ok" title="Conteúdo lido pela RAI em '+esc(a.analisadoIA)+'">'+ico('sparkles',12)+' Já analisado pela IA</span>':'')+
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

  // Modal de UPLOAD: anexa um novo documento à guia, já classificado por categoria
  function openAnexoUpload(g, refresh){
    var optsCat=MOCK.CATEGORIAS_ANEXO.map(function(c){return '<option'+(c==='Exame complementar'?' selected':'')+'>'+esc(c)+'</option>';}).join('');
    var body=
      '<div class="field"><label>Arquivo</label>'+
        '<input type="file" id="anxFile" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" style="width:100%;padding:9px;border:1px dashed var(--line);border-radius:8px;background:#fafdfb;cursor:pointer"/>'+
        '<div id="anxFileInfo" style="font-size:12px;color:var(--muted);margin-top:6px">PDF, imagem ou documento. Máx. ~3 MB (armazenamento local de demonstração).</div>'+
      '</div>'+
      '<div class="field"><label>Categoria (classificação)</label><select id="anxUpCat">'+optsCat+'</select></div>'+
      '<div class="field"><label>Descrição / nome (opcional)</label><input type="text" id="anxUpDesc" placeholder="Ex.: Resultado de hemograma — 12/07"/></div>';
    var foot='<button class="btn ghost" id="auCancel">Cancelar</button><button class="btn" id="auSave">'+ico('upload')+' Anexar</button>';
    var m=modal('Anexar documento à guia', 'Guia '+esc(g.numero)+' · '+esc(g.beneficiario.nome), body, foot);
    var fileEl=m.querySelector('#anxFile'), infoEl=m.querySelector('#anxFileInfo'), descEl=m.querySelector('#anxUpDesc');
    var arquivo=null;
    fileEl.onchange=function(){
      arquivo=fileEl.files&&fileEl.files[0]||null;
      if(!arquivo){ infoEl.textContent='Nenhum arquivo selecionado.'; return; }
      var mb=(arquivo.size/1048576);
      infoEl.innerHTML=esc(arquivo.name)+' · '+mb.toFixed(2)+' MB'+(mb>3?' <span style="color:var(--danger)">(acima do limite ~3 MB)</span>':'');
      if(!descEl.value) descEl.value=arquivo.name.replace(/\.[^.]+$/,'');
    };
    m.querySelector('#auCancel').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#auSave').onclick=function(){
      if(!arquivo){ toast('Selecione um arquivo.','warn'); return; }
      if(arquivo.size/1048576 > 3){ toast('Arquivo acima de ~3 MB — reduza o tamanho.','warn'); return; }
      var cat=m.querySelector('#anxUpCat').value;
      var nome=(descEl.value.trim()||arquivo.name);
      var ext=(arquivo.name.split('.').pop()||'').toLowerCase();
      var tipo = /(jpg|jpeg|png|gif|webp)/.test(ext)?'img':(ext==='pdf'?'pdf':'doc');
      var reader=new FileReader();
      reader.onload=function(){
        var ax={
          id:g.numero+'-U'+Date.now(),
          nome: nome + (/\.[^.]+$/.test(nome)?'':('.'+ext)),
          tipo:tipo, categoria:cat,
          tamanho:(arquivo.size/1024>=1024?(arquivo.size/1048576).toFixed(2)+' MB':Math.round(arquivo.size/1024)+' KB'),
          enviadoEm:new Date().toISOString().slice(0,16).replace('T',' '),
          enviadoPor:perfilDef[State.perfil].nome,
          paginas:1, anotacoes:[],
          dataURL:reader.result,        // conteúdo para visualização
          adicionado:true               // marca anexo criado pelo usuário
        };
        g.anexosLista.unshift(ax);
        persistAnexoNovo(g.numero, ax);
        logAcao('Anexo adicionado ('+cat+')', g.numero+' · '+ax.nome);
        toast('Documento anexado e classificado como "'+cat+'".','ok');
        m.parentNode.remove();
        if(refresh) refresh();
      };
      reader.onerror=function(){ toast('Falha ao ler o arquivo.','err'); };
      reader.readAsDataURL(arquivo);
    };
  }

  function openAnexoViewer(g, a){
    var preview;
    if(a.dataURL){
      // anexo REAL enviado pelo usuário: exibe o conteúdo de fato
      if(a.tipo==='img'){
        preview='<div style="background:#f1f5f4;border:1px solid var(--line);border-radius:10px;height:340px;display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="'+esc(a.dataURL)+'" alt="'+esc(a.nome)+'" style="max-width:100%;max-height:100%;object-fit:contain"/></div>';
      } else if(a.tipo==='pdf'){
        preview='<iframe src="'+esc(a.dataURL)+'" style="width:100%;height:340px;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe>';
      } else {
        preview='<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted)"><div style="font-size:44px">'+ico('file-text',44)+'</div><div style="margin-top:10px;font-weight:600;color:var(--ink-1)">'+esc(a.nome)+'</div><a href="'+esc(a.dataURL)+'" download="'+esc(a.nome)+'" class="btn sm" style="margin-top:12px;text-decoration:none">'+ico('download')+' Baixar documento</a></div>';
      }
    } else if(a.tipo==='img'){
      preview='<div style="background:#f1f5f4;border:1px dashed var(--line);border-radius:10px;height:340px;display:flex;align-items:center;justify-content:center;color:var(--muted)"><div style="text-align:center"><div style="font-size:48px;line-height:1">'+ico('image',48)+'</div><div style="margin-top:12px">Pré-visualização simulada da imagem</div><div style="font-size:12px">'+esc(a.nome)+'</div></div></div>';
    } else {
      preview='<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px;height:340px;overflow:auto;font-family:Georgia,serif;font-size:13px;line-height:1.5"><div style="text-align:center;font-weight:700;margin-bottom:8px">'+esc(a.nome)+'</div><hr/><p><b>Beneficiário:</b> '+esc(g.beneficiario.nome)+'</p><p><b>Procedimento:</b> '+esc(g.tipo)+'</p><p><b>Conteúdo simulado — '+a.paginas+' páginas.</b> Este visualizador exibe uma representação do documento enviado. Em produção, o arquivo será carregado via endpoint <code>GET /api/solus/anexo.php?id='+esc(a.id)+'</code>.</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p></div>';
    }
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


  // Correlação clínica por padrão de descrição de serviço → {patologia, achados esperados no laudo, justificativa}
  function _correlacaoClinica(desc){
    var d=(desc||'').toLowerCase();
    var mapa=[
      {re:/artroplastia|prótese.*joelho|prótese.*quadril/, pat:'osteoartrose avançada / degeneração articular', laudo:'RX/RM evidenciando redução do espaço articular, osteófitos e deformidade', ind:'falha do tratamento conservador (fisioterapia, analgesia) por período mínimo e limitação funcional documentada'},
      {re:/tomografia|tc de|ressonância|rm de|ressonancia/, pat:'investigação diagnóstica de sintomatologia', laudo:'solicitação com hipótese diagnóstica e sintomatologia compatível', ind:'esclarecimento diagnóstico não obtido por métodos menos complexos'},
      {re:/quimioterap|imunobiológico|oncolog/, pat:'neoplasia com protocolo oncológico', laudo:'laudo do oncologista com estadiamento e protocolo conforme diretriz', ind:'protocolo antineoplásico compatível com o estadiamento e a linha de tratamento'},
      {re:/gastroplastia|bariátrica|bariatrica/, pat:'obesidade mórbida', laudo:'IMC ≥ 35 com comorbidade ou ≥ 40, e acompanhamento multiprofissional', ind:'critérios da DUT de cirurgia bariátrica com falha de tratamento clínico por ≥ 2 anos'},
      {re:/coluna|artrodese/, pat:'patologia degenerativa/instabilidade da coluna', laudo:'RM com compressão neural ou instabilidade e sintomatologia refratária', ind:'falha do tratamento conservador e correlação clínico-radiológica'},
      {re:/catarata|facect/, pat:'catarata com baixa da acuidade visual', laudo:'exame oftalmológico com acuidade reduzida e opacificação do cristalino', ind:'comprometimento funcional da visão documentado'},
      {re:/angioplastia|stent|cateterismo|hemodinâmic/, pat:'doença arterial coronariana', laudo:'cateterismo/angio evidenciando lesão obstrutiva significativa', ind:'lesão com repercussão isquêmica e indicação de revascularização'},
      {re:/diária.*uti|uti/, pat:'necessidade de suporte intensivo', laudo:'instabilidade clínica / necessidade de monitorização contínua', ind:'gravidade do quadro que exige leito de terapia intensiva'},
      {re:/diária.*enfermaria|enfermaria/, pat:'internação em enfermaria', laudo:'necessidade de internação sem critérios de terapia intensiva', ind:'acomodação compatível com o contrato e com o quadro'},
      {re:/taxa.*sala.*cirúrg|taxa de sala/, pat:'suporte de sala cirúrgica', laudo:'procedimento cirúrgico vinculado autorizado', ind:'taxa acessória a procedimento cirúrgico indicado'},
      {re:/hemograma|glicemia|exame|laboratóri/, pat:'avaliação laboratorial', laudo:'solicitação com finalidade diagnóstica/pré-operatória', ind:'exame de rotina/pré-operatório pertinente'},
      {re:/prótese|opme|placa|parafuso|material/, pat:'necessidade de material implantável', laudo:'planejamento cirúrgico especificando o material', ind:'OPME compatível com o procedimento e com equivalência técnica cotada'}
    ];
    for(var i=0;i<mapa.length;i++){ if(mapa[i].re.test(d)) return mapa[i]; }
    return {pat:'quadro clínico da guia', laudo:'documentação clínica compatível com a solicitação', ind:'indicação técnica alinhada ao serviço solicitado'};
  }

  // Gera o parecer TÉCNICO de cada serviço, cruzando: serviço × indicação clínica/CID × laudo ×
  // patologia × orientações da IA parametrizadas no item (State.vincConfig[vk|cod].instr).
  function justificarServicos(g){
    function h(s){ var x=0,st=''+s; for(var i=0;i<st.length;i++){x=(x*31+st.charCodeAt(i))|0;} return Math.abs(x); }
    var cid = MOCK.cidGuia ? MOCK.cidGuia(g) : {codigo:'', descricao:''};
    var espec = MOCK.especialidadeDaGuia ? MOCK.especialidadeDaGuia(g) : '';
    var idade = g.beneficiario && g.beneficiario.idade;
    var vcfg = (typeof State!=='undefined' && State.vincConfig) || {};
    var out=[];

    function push(tipo, vk, cod, desc, extra){
      var seed=h(g.numero+'|'+cod);
      var corr=_correlacaoClinica(desc);
      var instr=((vcfg[vk+'|'+cod]||{}).instr||'').trim();  // orientação da IA parametrizada para o item
      var faltaDoc=!g.anexos;
      var dutPend = extra&&extra.dut && !g.dut;
      var indicado = !dutPend && !(faltaDoc && (seed%3===0));

      var partes=[];
      if(indicado){
        partes.push('Recomendado tecnicamente.');
        partes.push('A indicação clínica registrada ('+(cid.codigo?cid.codigo+' — '+cid.descricao:(espec||'quadro da guia'))+') é compatível com '+corr.pat+'.');
        partes.push('O laudo/documentação apresentada '+(faltaDoc?'ainda é limitada, mas':'')+' sustenta '+corr.laudo+', o que fundamenta a solicitação de '+tipo.toLowerCase()+' "'+desc+'".');
        partes.push('Para esta patologia, o serviço é indicado quando há '+corr.ind+'.');
        if(idade!=null && (idade>=60 || tipo==='Diária/Taxa')) partes.push('Considerando a idade do paciente ('+idade+' anos) e o risco de intercorrências, a acomodação/tipo de diária solicitado é pertinente ao cuidado.');
        if(g.regime==='Urgência') partes.push('O regime de urgência reforça a tempestividade e a necessidade do atendimento.');
        if(extra&&extra.opme) partes.push('Recomenda-se validar a cotação de 3 fornecedores e a equivalência técnica do OPME antes da liberação.');
      } else {
        partes.push('Não recomendado tecnicamente neste momento.');
        if(dutPend){
          partes.push('O item está sujeito à DUT da ANS, e a indicação clínica apresentada ('+(cid.codigo||espec||'—')+') ainda não está comprovada pelas evidências exigidas: '+corr.ind+'.');
          partes.push('O laudo atual não demonstra objetivamente '+corr.laudo+'.');
          partes.push('Necessário relatório médico e exames que justifiquem a solicitação e atendam aos critérios da DUT antes da autorização.');
        } else {
          partes.push('A indicação clínica registrada não está adequadamente sustentada pela documentação: falta o laudo/exame que comprove '+corr.laudo+'.');
          partes.push('Sem essa correlação clínico-documental, não é possível confirmar que "'+desc+'" é o serviço indicado para '+corr.pat+'.');
          partes.push('Necessário relatório médico justificando o motivo da solicitação e anexação dos exames pertinentes.');
        }
      }
      if(instr) partes.push('Orientação parametrizada para este item considerada na análise: "'+(instr.length>180?instr.slice(0,180)+'…':instr)+'".');

      out.push({tipo:tipo, cod:cod, desc:desc, indicado:indicado, motivo:partes.join(' '), temInstr:!!instr});
    }

    (g.procedimentos||[]).forEach(function(p){ push('Procedimento','proc',p.cod,p.desc,{dut:!!p.dut}); });
    (g.pacotes||[]).forEach(function(p){ push('Pacote','pac',p.cod,p.desc,{}); });
    (g.diariasTaxas||[]).forEach(function(d){ push('Diária/Taxa','dt',d.cod,d.desc,{}); });
    (g.matmed||[]).forEach(function(m){ if(m.opme) push('OPME','matmed',m.cod,m.desc,{opme:true}); });
    return out;
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
    tt.innerHTML=ico('sparkles')+' Análise Técnica IA <span class="badge muted">Confiança '+Math.round(ia.confianca)+'%</span>';
    hd.appendChild(tt);
    var adpWrap=el('div',{class:'ia-adp-wrap'});
    adpWrap.innerHTML=aderenciaBar(calcAdp(),ia);
    hd.appendChild(adpWrap);
    box.appendChild(hd);
    var pEl=el('p',{style:'margin:6px 0 0'});
    pEl.textContent=ia.parecerGeral;
    box.appendChild(pEl);
    var warnEl=el('div',{class:'ai-warn'});
    warnEl.innerHTML=ia.avisoLegal;
    box.appendChild(warnEl);
    if(g){
      var btnPT=el('button',{class:'btn sm ghost',style:'margin-top:10px',type:'button'},ico('file-text',13)+' Gerar parecer técnico (PDF)');
      btnPT.onclick=function(){
        var orig=btnPT.innerHTML;
        btnPT.innerHTML=ico('loader',13)+' Gerando…'; btnPT.disabled=true; lcIcons();
        gerarEImprimirParecerTecnico(g).finally(function(){ btnPT.innerHTML=orig; btnPT.disabled=false; lcIcons(); });
      };
      box.appendChild(btnPT);
    }
    d.appendChild(box);

    // ── Justificativa de indicação por serviço solicitado ──────────
    var servs=justificarServicos(g);
    if(servs.length){
      var icoTipo={'Procedimento':'stethoscope','Pacote':'package','Diária/Taxa':'calendar-days','OPME':'wrench'};
      var svBox=el('div',{class:'ai-box',style:'margin-top:10px'});
      var nInd=servs.filter(function(s){return s.indicado;}).length;
      var nNao=servs.length-nInd;
      var linhas=servs.map(function(s){
        return '<div class="parecer-serv '+(s.indicado?'ind':'nao')+'">'+
          '<div class="parecer-serv-hd">'+
            '<span class="parecer-serv-ico">'+ico(icoTipo[s.tipo]||'file-text',14)+'</span>'+
            '<span class="parecer-serv-tipo">'+esc(s.tipo)+'</span>'+
            '<span class="parecer-serv-cod">'+esc(s.cod)+'</span>'+
            '<span class="parecer-serv-desc">'+esc(s.desc)+'</span>'+
            (s.temInstr?'<span class="parecer-serv-instr" title="Há orientação parametrizada para a IA neste item — considerada na análise">'+ico('sparkles',11)+' prompt</span>':'')+
            '<span class="parecer-serv-badge '+(s.indicado?'ok':'no')+'">'+(s.indicado?ico('check-circle-2',12)+' Indicado':ico('alert-circle',12)+' Não indicado')+'</span>'+
          '</div>'+
          '<div class="parecer-serv-just">'+esc(s.motivo)+'</div>'+
        '</div>';
      }).join('');
      svBox.innerHTML=
        '<div class="hd"><div class="tt">'+ico('list-checks',15)+' Indicação técnica dos serviços solicitados</div>'+
          '<span class="badge">'+nInd+' indicado(s)</span>'+(nNao?' <span class="badge warn">'+nNao+' pendente(s)</span>':'')+
        '</div>'+
        '<div class="ai-section" style="padding-top:4px"><div class="parecer-serv-wrap">'+linhas+'</div></div>'+
        '<div class="ai-warn" style="margin-top:8px">Análise de apoio gerada pela IA sobre a pertinência de cada serviço. Não constitui autorização/negativa — a decisão é da operadora/auditor.</div>';
      d.appendChild(svBox);
    }

    function updateAdp(){
      adpWrap.innerHTML=aderenciaBar(calcAdp(),ia);
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

  // Lista unificada dos serviços solicitados na guia (para parecer por item)
  function itensSolicitadosGuia(g){
    var out=[];
    (g.procedimentos||[]).forEach(function(p){ var x=MOCK.procDetalhe?MOCK.procDetalhe(p):{}; out.push({tipo:'Procedimento', cod:p.cod, desc:p.desc, qtdSolic:(x.qtdeSolic!=null?x.qtdeSolic:1), key:'proc|'+p.cod}); });
    (g.pacotes||[]).forEach(function(p){ out.push({tipo:'Pacote', cod:p.cod, desc:p.desc, qtdSolic:1, key:'pac|'+p.cod}); });
    (g.diariasTaxas||[]).forEach(function(p){ var x=_diariaDetalhe(p); out.push({tipo:'Diária/Taxa', cod:p.cod, desc:p.desc, qtdSolic:(x.qtdeSolic!=null?x.qtdeSolic:1), key:'dt|'+p.cod}); });
    (g.matmed||[]).filter(function(m){return !m.opme;}).forEach(function(p){ var x=MOCK.matmedDetalhe?MOCK.matmedDetalhe(p):{}; out.push({tipo:'Mat/Med', cod:p.cod, desc:p.desc, qtdSolic:(x.qtdeSolic!=null?x.qtdeSolic:1), key:'mm|'+p.cod}); });
    (g.matmed||[]).filter(function(m){return m.opme;}).forEach(function(p){ var x=MOCK.opmeDetalhe?MOCK.opmeDetalhe(p):{}; out.push({tipo:'OPME', cod:p.cod, desc:p.desc, qtdSolic:(x.qtde!=null?x.qtde:1), key:'opme|'+p.cod}); });
    return out;
  }

  // ── Parecer Técnico (documento em PDF) ────────────────────────────────────
  // Classificação exibida na caixa colorida do topo — derivada do parecer da Operadora já salvo.
  function classificacaoParecerTecnico(g){
    var p=g.parecerOperadora;
    if(!p || !p.decisao || p.decisao==='Pendente') return {cls:'inconclusivo', label:'INCONCLUSIVO — PENDÊNCIA DOCUMENTAL'};
    if(p.decisao==='Liberada') return {cls:'favoravel', label:'FAVORÁVEL — COBERTURA OBRIGATÓRIA'};
    if(p.decisao==='Negada') return {cls:'desfavoravel', label:'DESFAVORÁVEL — NÃO COBERTURA'};
    return {cls:'inconclusivo', label:'INCONCLUSIVO — PARCIALMENTE LIBERADA'};
  }

  // Monta o prompt enviado à IA para redigir o corpo técnico do parecer (seções 3 a 6 do modelo).
  function promptParecerTecnico(g, ia, itens, classif){
    var temDUT=(g.procedimentos||[]).some(function(p){return p.dut;});
    var linhaItens=itens.map(function(it){return '- '+it.tipo+' '+it.cod+' — '+it.desc+(it.qtdSolic?(' (Qtde solic.: '+it.qtdSolic+')'):'');}).join('\n');
    return 'Redija um PARECER TÉCNICO de auditoria assistencial para subsidiar a decisão da operadora (auditoria médica/área de autorização) sobre a guia abaixo, no MESMO PADRÃO e nível de detalhamento de um parecer técnico-regulatório profissional (com base normativa, análise técnica criteriosa e conclusão objetiva).\n\n'+
      'CLASSIFICAÇÃO JÁ DEFINIDA (não altere, apenas fundamente): '+classif.label+'\n\n'+
      'SERVIÇOS SOLICITADOS NESTA GUIA:\n'+linhaItens+'\n\n'+
      (temDUT
        ? 'IMPORTANTE: um ou mais procedimentos desta guia estão sujeitos a Diretriz de Utilização (DUT) da ANS (RN 465/2021, Anexo II). Cite a DUT aplicável ao(s) procedimento(s) (pelo número/nome do item da DUT quando puder inferir do procedimento e do CID, ou de forma genérica caso não seja possível identificar o item exato) e analise o enquadramento clínico frente aos critérios da diretriz.'
        : 'Nenhum procedimento desta guia está sujeito a DUT — NÃO cite DUT nem Anexo II da RN 465/2021 neste parecer; baseie a análise apenas nos critérios contratuais/documentais/clínicos apresentados.')+'\n\n'+
      'Responda em JSON válido (sem markdown ao redor, sem \`\`\`), com este formato exato:\n'+
      '{"baseNormativa":"texto da seção Base normativa aplicável","analiseTecnica":"texto da seção Análise técnica (enquadramento clínico/documental e, se houver DUT, adequação metodológica)","conclusao":"texto da seção Conclusão e posicionamento recomendado, incluindo a regra de reclassificação quando aplicável","pendencias":["item pendente 1","item pendente 2"],"resumoMotivo":"1-2 frases do motivo da classificação, para o Resumo executivo"}\n'+
      'Cada campo de texto deve ter 2 a 5 frases, técnico e objetivo, em português. "pendencias" pode ser um array vazio se a classificação for Favorável sem pendências. Não inclua nada fora do JSON.';
  }

  // Gera o conteúdo do parecer técnico via IA (chamada única). Retorna {baseNormativa,analiseTecnica,conclusao,pendencias,resumoMotivo} ou null se IA não configurada/falhar.
  async function gerarConteudoParecerTecnicoIA(g, ia, itens, classif){
    if(!window.getIaCfg || !window.callIAComSistema || !window.resumoGuiaTexto || !window.ctxTecnico) return null;
    var cfg=window.getIaCfg();
    if(!cfg.key) return null;
    var sistema=window.ctxTecnico(window.resumoGuiaTexto(g))+'\n\nMODO: GERAÇÃO DE PARECER TÉCNICO FORMAL (documento único, não é conversa). Responda SOMENTE com o JSON solicitado pelo usuário, sem texto antes ou depois.';
    var resp=await window.callIAComSistema(cfg, sistema, promptParecerTecnico(g, ia, itens, classif));
    if(!resp.ok) return null;
    try{
      var txt=resp.text.trim().replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      var obj=JSON.parse(txt);
      if(!obj.pendencias) obj.pendencias=[];
      return obj;
    }catch(e){ return null; }
  }

  // Fallback sem IA: monta o corpo do parecer só com os dados estruturados já calculados pelo sistema (sem análise normativa detalhada).
  function conteudoParecerTecnicoFallback(g, ia, classif){
    var temDUT=(g.procedimentos||[]).some(function(p){return p.dut;});
    var baseNormativa = temDUT
      ? 'Um ou mais procedimentos desta guia estão sujeitos a Diretriz de Utilização (DUT) da ANS, conforme Anexo II da RN nº 465/2021. A comprovação do enquadramento na DUT '+(g.dut?'foi registrada como atendida':'não foi comprovada')+' na documentação apresentada.'
      : 'Nenhum procedimento desta guia está sujeito a Diretriz de Utilização (DUT) específica da ANS. A análise considera exclusivamente os critérios contratuais, documentais e de vinculação técnica apresentados.';
    var analiseTecnica='Critérios cumpridos: '+(ia.criteriosCumpridos.length?ia.criteriosCumpridos.join('; '):'nenhum registrado')+'. '+
      (ia.criteriosNaoCumpridos.length?('Critérios não cumpridos: '+ia.criteriosNaoCumpridos.join('; ')+'. '):'')+
      'Aderência regulatória apurada: '+ia.aderencia+'% ('+ia.classificacao.label+').';
    var conclusao=ia.parecerGeral+' Conduta recomendada: '+ia.proximaAcao+'.';
    return {baseNormativa:baseNormativa, analiseTecnica:analiseTecnica, conclusao:conclusao, pendencias:ia.pendencias||[], resumoMotivo:(ia.pendencias&&ia.pendencias.length)?ia.pendencias.join('; '):ia.parecerGeral};
  }

  var _CORES_PARECER={
    favoravel:{bg:'#eaf6ef',border:'#0a8a43',text:'#054f27'},
    desfavoravel:{bg:'#fbebea',border:'#b3261e',text:'#7a1a15'},
    inconclusivo:{bg:'#fdf3e0',border:'#b8860b',text:'#7a5a08'}
  };

  // Monta o HTML completo do documento (autocontido, com CSS embutido no padrão de cores do sistema) e dispara a impressão/PDF.
  function montarHtmlParecerTecnico(g, itens, classif, conteudo, crits){
    var cor=_CORES_PARECER[classif.cls];
    var hoje=new Date(); var hojeFmt=String(hoje.getDate()).padStart(2,'0')+'/'+String(hoje.getMonth()+1).padStart(2,'0')+'/'+hoje.getFullYear();
    function linhaItens(){
      return itens.map(function(it){return '<tr><td>'+esc(it.tipo)+'</td><td class="mono">'+esc(it.cod)+'</td><td>'+esc(it.desc)+'</td><td style="text-align:center">'+(it.qtdSolic!=null?it.qtdSolic:'—')+'</td></tr>';}).join('');
    }
    function checklistPendencias(){
      if(!conteudo.pendencias || !conteudo.pendencias.length) return '<p class="pt-muted">Nenhuma pendência identificada.</p>';
      return '<ul class="pt-check">'+conteudo.pendencias.map(function(p){return '<li>☐ '+esc(p)+'</li>';}).join('')+'</ul>';
    }
    function tabelaCriticas(){
      if(!crits.length) return '<p class="pt-muted">Nenhuma crítica relevante identificada.</p>';
      return '<table class="pt-tbl"><thead><tr><th>Código</th><th>Procedimento</th><th>Crítica</th></tr></thead><tbody>'+
        crits.map(function(c){return '<tr><td class="mono">'+esc(c.codigo)+'</td><td>'+esc(c.procedimento)+'</td><td>'+esc(c.critica)+'</td></tr>';}).join('')+
        '</tbody></table>';
    }
    var temDUT=(g.procedimentos||[]).some(function(p){return p.dut;});
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Parecer Técnico — Guia '+esc(g.numero)+'</title><style>'+
      '@page{margin:18mm 16mm}'+
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0b1a12;font-size:12.5px;line-height:1.55;margin:0;padding:24px}'+
      'h1{font-size:19px;margin:0 0 2px;color:#054f27}'+
      '.pt-sub{font-size:12px;color:#5a6a60;margin:0 0 16px;font-style:italic}'+
      '.pt-class{border:1.5px solid '+cor.border+';background:'+cor.bg+';color:'+cor.text+';border-radius:8px;padding:10px 16px;text-align:center;margin-bottom:16px}'+
      '.pt-class .k{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;opacity:.85}'+
      '.pt-class .v{font-size:16px;font-weight:800;margin-top:2px}'+
      '.pt-box{border:1px solid #dfe7e1;background:#f5f8f6;border-radius:8px;padding:12px 16px;margin-bottom:16px}'+
      '.pt-box b{color:#054f27}'+
      'h2{font-size:14.5px;color:#054f27;border-bottom:2px solid #cfead9;padding-bottom:4px;margin:22px 0 8px}'+
      'table.kv{width:100%;border-collapse:collapse;margin-bottom:4px}'+
      'table.kv td{padding:5px 8px;border-bottom:1px solid #eaf6ef;vertical-align:top}'+
      'table.kv td:first-child{font-weight:700;width:190px;color:#1a2a20}'+
      '.pt-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px}'+
      '.pt-tbl th{background:#eaf6ef;color:#054f27;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #cfead9}'+
      '.pt-tbl td{padding:6px 8px;border-bottom:1px solid #eaf6ef}'+
      '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:nowrap}'+
      '.pt-check{list-style:none;padding:0;margin:6px 0}'+
      '.pt-check li{padding:3px 0;font-size:12px}'+
      '.pt-muted{color:#5a6a60;font-size:12px;font-style:italic}'+
      '.pt-foot{margin-top:26px;font-size:10.5px;color:#5a6a60;border-top:1px solid #dfe7e1;padding-top:8px;font-style:italic}'+
      '.pt-ressalva{font-size:11.5px;color:#1a2a20}'+
      '@media print{body{padding:0}}'+
      '</style></head><body>'+
      '<h1>PARECER TÉCNICO</h1>'+
      '<p class="pt-sub">Análise de Cobertura Assistencial'+(temDUT?' — Diretriz de Utilização (DUT), Anexo II, RN nº 465/2021 (ANS)':'')+'</p>'+
      '<div class="pt-class"><div class="k">Classificação técnica do parecer</div><div class="v">'+esc(classif.label)+'</div></div>'+
      '<div class="pt-box"><b>Resumo executivo para autorização</b><br><span style="font-size:12px">'+esc(conteudo.resumoMotivo||'')+'</span>'+
      (conteudo.pendencias&&conteudo.pendencias.length?('<div style="margin-top:8px"><b style="font-size:11.5px">Pendências para reclassificação:</b>'+checklistPendencias()+'</div>'):'')+
      '</div>'+
      '<h2>1. Identificação</h2>'+
      '<table class="kv">'+
        '<tr><td>Guia</td><td>'+esc(g.numero)+'</td></tr>'+
        '<tr><td>Beneficiário</td><td>'+esc(g.beneficiario.nome)+'</td></tr>'+
        '<tr><td>Carteirinha</td><td>'+esc(g.beneficiario.carteirinha||'—')+'</td></tr>'+
        '<tr><td>Solicitante</td><td>'+esc(g.solicitante||'—')+'</td></tr>'+
        '<tr><td>Tipo / Regime / Natureza</td><td>'+esc(g.tipo)+' / '+esc(g.regime)+' / '+esc(g.natureza)+'</td></tr>'+
        '<tr><td>Data de emissão</td><td>'+esc(g.dataEmissao||'—')+'</td></tr>'+
      '</table>'+
      '<h2>2. Objeto do parecer</h2>'+
      '<p>Parecer técnico elaborado para subsidiar a área de autorização/auditoria médica da operadora na análise dos serviços solicitados nesta guia, à luz das diretrizes técnicas e regulatórias aplicáveis'+(temDUT?', incluindo a Diretriz de Utilização (DUT) do Anexo II da RN nº 465/2021 da ANS':'')+'. <i>Este documento não constitui a decisão final de autorização, que permanece a cargo da auditoria médica/profissional habilitado da operadora.</i></p>'+
      '<h2>Serviços solicitados</h2>'+
      '<table class="pt-tbl"><thead><tr><th>Tipo</th><th>Código</th><th>Descrição</th><th style="text-align:center">Qtde Solic.</th></tr></thead><tbody>'+linhaItens()+'</tbody></table>'+
      '<h2>3. Base normativa aplicável</h2><p>'+esc(conteudo.baseNormativa||'').replace(/\n/g,'<br>')+'</p>'+
      '<h2>4. Análise técnica</h2><p>'+esc(conteudo.analiseTecnica||'').replace(/\n/g,'<br>')+'</p>'+
      '<h2>Críticas da guia</h2>'+tabelaCriticas()+
      '<h2>5. Conclusão e posicionamento recomendado</h2><p>'+esc(conteudo.conclusao||'').replace(/\n/g,'<br>')+'</p>'+
      '<h2>6. Documentos/informações pendentes para conclusão da análise</h2>'+checklistPendencias()+
      '<h2>7. Ressalvas</h2>'+
      '<p class="pt-ressalva">Este parecer tem caráter exclusivamente técnico-regulatório, elaborado a partir dos dados e documentos anexados à guia no sistema. Não substitui: (i) avaliação da junta médica/auditoria da operadora; (ii) parecer de médico especialista sobre a adequação clínica ao quadro do paciente; (iii) orientação jurídica.</p>'+
      '<div class="pt-foot">Documento gerado em '+hojeFmt+' por '+esc(perfilDef[State.perfil].nome)+' via RegulaAI Saúde. Sujeito à validação e decisão final por profissional habilitado.</div>'+
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>'+
      '</body></html>';
  }

  // Ponto de entrada: gera o Parecer Técnico (IA se configurada, senão fallback estruturado) e abre para impressão/PDF.
  async function gerarEImprimirParecerTecnico(g){
    var ia = g._cache || AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
    var itens = itensSolicitadosGuia(g);
    var classif = classificacaoParecerTecnico(g);
    var crits = criticasDaGuia(g, ia);
    toast('Gerando parecer técnico…','ok');
    var conteudo = await gerarConteudoParecerTecnicoIA(g, ia, itens, classif);
    var usouIA = !!conteudo;
    if(!conteudo) conteudo = conteudoParecerTecnicoFallback(g, ia, classif);
    var html = montarHtmlParecerTecnico(g, itens, classif, conteudo, crits);
    var w = window.open('', '_blank');
    if(!w){ toast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.','err'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    logAcao('Parecer técnico gerado (PDF)', g.numero+' — '+classif.label+(usouIA?'':' [sem IA configurada — versão estruturada]'));
    toast(usouIA?'Parecer técnico gerado.':'Parecer técnico gerado (IA não configurada — versão com dados do sistema).','ok');
  }

  function openParecer(g){
    if(!can('parecer')){ toast('Seu perfil não pode emitir parecer','warn'); return; }
    var ia = g._cache || AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
    var itens = itensSolicitadosGuia(g);
    // estado do parecer por item (recupera do parecer salvo, se houver)
    var pareceresItem={}; // key -> {parecer:'fav'|'desf', motivo, justificativa}
    if(g.parecerOperadora && g.parecerOperadora.itens){ g.parecerOperadora.itens.forEach(function(it){ if(it.key) pareceresItem[it.key]=it; }); }

    var TIPO_ICO={'Procedimento':'stethoscope','Pacote':'package','Diária/Taxa':'calendar-days','Mat/Med':'pill','OPME':'wrench'};
    function linhaItem(it){
      var pa=pareceresItem[it.key];
      var badge = !pa?'<span class="badge muted" style="font-size:10px">Sem parecer</span>'
        :(pa.parecer==='fav'?'<span class="badge ok" style="font-size:10px">'+ico('check',11)+' Favorável</span>':'<span class="badge danger" style="font-size:10px">'+ico('x',11)+' Desfavorável</span>');
      return '<tr data-k="'+esc(it.key)+'">'+
        '<td class="pit-chk"><input type="checkbox" class="pit-cb" data-k="'+esc(it.key)+'"></td>'+
        '<td class="nw">'+ico(TIPO_ICO[it.tipo]||'dot',12)+' '+esc(it.tipo)+'</td>'+
        '<td class="rm-cod">'+esc(it.cod)+'</td>'+
        '<td>'+esc(it.desc)+(pa&&pa.justificativa?'<div class="pit-just">'+esc(pa.justificativa)+'</div>':'')+'</td>'+
        '<td class="rm-c">'+(it.qtdSolic!=null?it.qtdSolic:'—')+'</td>'+
        '<td class="pit-st">'+badge+'</td>'+
      '</tr>';
    }
    var tabelaItens = itens.length
      ? '<div class="pit-tbl-wrap"><table class="pit-tbl"><thead><tr>'+
          '<th class="pit-chk"><input type="checkbox" id="pitAll" title="Selecionar todos"></th>'+
          '<th>Tipo</th><th>Código</th><th>Serviço solicitado</th><th>Qtde Solic.</th><th>Parecer</th>'+
        '</tr></thead><tbody id="pitBody">'+itens.map(linhaItem).join('')+'</tbody></table></div>'
      : '<div class="resumo-mini-empty">Nenhum serviço solicitado nesta guia.</div>';

    // ── Sub-abas Observações / Críticas da guia / Processo de auditoria (padrão OperadoraSmile) ──
    var crits = criticasDaGuia(g, ia);
    function tabCriticas(){
      if(!crits.length) return '<div class="resumo-mini-empty">Nenhuma crítica relevante identificada.</div>';
      var linhas=crits.map(function(c){
        return '<tr><td>'+ico('triangle-alert',12)+' '+esc(c.critica)+(c.codigo!=='—'?' <span class="pit-crit-cod">('+esc(c.codigo)+' — '+esc(c.procedimento)+')</span>':'')+'</td><td>—</td></tr>';
      }).join('');
      return '<div class="pit-tbl-wrap"><table class="pit-tbl"><thead><tr><th>Crítica do sistema</th><th>Operador que autorizou</th></tr></thead><tbody>'+linhas+'</tbody></table></div>';
    }
    function tabProcessoAuditoria(){
      var idxAtual=etapaAtualIdx(g);
      var podeAvancar=podeMoverEtapa(1) && idxAtual<g.etapas.length-1;
      var podeVoltar=podeMoverEtapa(-1) && idxAtual>0;
      var STL={aguardando:'Aguardando...',em_execucao:'Em execução',concluida:'Concluído',nao_realizado:'Não realizado'};
      var linhas=g.etapas.map(function(e,i){
        var cur=i===idxAtual;
        var podeMarcar = podeMoverEtapa(1) && e.status!=='em_execucao';
        var selNR = podeMarcar
          ? ('<select class="pa-status-sel" data-idx="'+i+'" style="font-size:11px;padding:2px 4px;border:1px solid var(--line);border-radius:5px">'+
              '<option value="0"'+(e.status!=='nao_realizado'?' selected':'')+'>'+esc(STL[e.status]||e.status)+'</option>'+
              '<option value="1"'+(e.status==='nao_realizado'?' selected':'')+'>Não realizado</option>'+
            '</select>')
          : '<span>'+esc(STL[e.status]||e.status)+'</span>';
        return '<tr class="'+(cur?'pit-etapa-cur':'')+(e.status==='nao_realizado'?' pit-etapa-nr':'')+'"><td>'+e.ordem+'</td>'+
          '<td>'+esc(g.fluxo.nome)+'</td>'+
          '<td>'+esc(e.nome)+'</td>'+
          '<td class="nw">'+(cur?ico('circle-dot',12):'')+'</td>'+
          '<td>'+selNR+'</td>'+
          '<td>'+(e.status==='concluida'?ico('check',12)+' Concluído':(e.status==='nao_realizado'?ico('ban',12)+' Não realizado':'—'))+'</td>'+
        '</tr>';
      }).join('');
      return '<div class="pit-tbl-wrap"><table class="pit-tbl"><thead><tr><th>Ordem</th><th>Processo de auditoria</th><th>Fase/Etapa</th><th>!</th><th>Situação</th><th>Resultado/Parecer</th></tr></thead><tbody>'+linhas+'</tbody></table></div>'+
        '<div class="etapa-ctrl" style="margin-top:10px">'+
          '<div class="etapa-ctrl-info">'+ico('git-branch',14)+' Etapa atual: <b>'+esc(g.etapas[idxAtual]?g.etapas[idxAtual].nome:'—')+'</b></div>'+
          '<div class="etapa-ctrl-btns">'+
            (podeVoltar?'<button class="btn sm ghost" id="paVoltar" type="button">'+ico('chevron-left',13)+' Voltar etapa</button>':'')+
            (podeAvancar?'<button class="btn sm" id="paAvancar" type="button">Avançar etapa '+ico('chevron-right',13)+'</button>':'')+
          '</div>'+
        '</div>';
    }
    var pitTabs=[['obs','Observações'],['crit','Críticas da guia'],['proc','Processo de auditoria']];
    var pitTabBar='<div class="pit-subtabs">'+pitTabs.map(function(t,i){return '<button type="button" class="pit-subtab'+(i===0?' active':'')+'" data-pit-tab="'+t[0]+'">'+esc(t[1])+'</button>';}).join('')+'</div>';

    var body=
      '<div class="pit-hd">'+ico('list-checks',14)+' Parecer por item — selecione os serviços e aplique um parecer. Você pode dar pareceres diferentes para conjuntos diferentes.</div>'+
      tabelaItens+
      '<div class="pit-acao" id="pitAcao" style="display:none">'+
        '<div class="pit-acao-hd"><b><span id="pitSelCount">0</span> item(ns) selecionado(s)</b></div>'+
        '<div class="g2" style="gap:10px">'+
          '<div class="field"><label>Parecer para os selecionados</label>'+
            '<select id="pitParecer"><option value="fav">Favorável (aprovar)</option><option value="desf">Desfavorável (reprovar)</option></select></div>'+
          '<div class="field"><label>Motivo padronizado</label><select id="pitMot"></select></div>'+
        '</div>'+
        '<div class="field"><label>Justificativa (aplicada aos selecionados)</label><textarea id="pitJust" placeholder="Justificativa técnica para estes itens..."></textarea></div>'+
        '<div style="display:flex;gap:8px"><button class="btn" id="pitAplicar" type="button">'+ico('check-check',13)+' Aplicar aos selecionados</button>'+
          '<button class="btn ghost" id="pitLimpar" type="button">'+ico('eraser',13)+' Limpar parecer dos selecionados</button></div>'+
      '</div>'+
      '<div class="pit-resumo" id="pitResumo"></div>'+
      pitTabBar+
      '<div id="pitTabObs">'+
        '<div class="field"><label>Observações impressas (vão para o prestador)</label><textarea id="pImp"></textarea></div>'+
        '<div class="field"><label>Observações não impressas (internas)</label><textarea id="pInt"></textarea></div>'+
      '</div>'+
      '<div id="pitTabCrit" style="display:none">'+tabCriticas()+'</div>'+
      '<div id="pitTabProc" style="display:none">'+tabProcessoAuditoria()+'</div>'+
      '<div class="ai-box"><div class="hd"><div class="tt">'+ico('lightbulb')+' Sugestão técnica</div></div><p style="margin:6px 0">'+esc(ia.parecerGeral)+'</p><button class="btn sm ghost" id="pJustIA" type="button">'+ico('sparkles')+' Gerar análise técnica (obs. impressas)</button></div>';
    var foot='<button class="btn ghost" id="pAudProc">'+ico('clipboard-check')+' Auditoria de procedimento</button><button class="btn ghost" id="pGerarPT">'+ico('file-text')+' Gerar parecer técnico (PDF)</button><button class="btn ghost" id="pCancel">Cancelar</button><button class="btn" id="pSalvar">'+ico('save')+' Salvar parecer</button>';
    var m = modal('Parecer da Operadora · '+esc(g.numero), 'A decisão final é exclusiva da operadora. A análise técnica atua apenas como apoio.', body, foot);

    // preenche obs salvas
    if(g.parecerOperadora){ if(g.parecerOperadora.obsImp) m.querySelector('#pImp').value=g.parecerOperadora.obsImp; if(g.parecerOperadora.obsInt) m.querySelector('#pInt').value=g.parecerOperadora.obsInt; }

    // ── sub-abas Observações / Críticas da guia / Processo de auditoria ──
    var _pitPanes={obs:'#pitTabObs',crit:'#pitTabCrit',proc:'#pitTabProc'};
    function showPitTab(tab){
      $$('.pit-subtab',m).forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-pit-tab')===tab); });
      Object.keys(_pitPanes).forEach(function(k){ var el2=m.querySelector(_pitPanes[k]); if(el2) el2.style.display=(k===tab?'':'none'); });
    }
    $$('.pit-subtab',m).forEach(function(b){ b.onclick=function(){ showPitTab(b.getAttribute('data-pit-tab')); }; });
    function _reprocessarAuditoria(){ var alvo=m.querySelector('#pitTabProc'); alvo.innerHTML=tabProcessoAuditoria(); ligarBotoesEtapa(); lcIcons(); }
    function ligarBotoesEtapa(){
      var bAv=m.querySelector('#paAvancar'); if(bAv) bAv.onclick=function(){ if(moverEtapa(g,1)){ toast('Guia avançada para a próxima etapa','ok'); _reprocessarAuditoria(); } };
      var bVt=m.querySelector('#paVoltar'); if(bVt) bVt.onclick=function(){ if(moverEtapa(g,-1)){ toast('Guia retornada à etapa anterior','ok'); _reprocessarAuditoria(); } };
      $$('.pa-status-sel',m).forEach(function(sel){
        sel.onchange=function(){
          var idx=+sel.getAttribute('data-idx');
          if(marcarEtapaNaoRealizada(g, idx, sel.value==='1')){ toast(sel.value==='1'?'Etapa marcada como não realizada':'Etapa reaberta (aguardando)','ok'); _reprocessarAuditoria(); }
          else { _reprocessarAuditoria(); }
        };
      });
    }
    ligarBotoesEtapa();

    // ── seleção de itens ──
    function selKeys(){ return $$('.pit-cb',m).filter(function(cb){return cb.checked;}).map(function(cb){return cb.getAttribute('data-k');}); }
    function updSel(){
      var n=selKeys().length;
      m.querySelector('#pitSelCount').textContent=n;
      m.querySelector('#pitAcao').style.display=n?'block':'none';
    }
    function fillMotP(){
      var pr=m.querySelector('#pitParecer').value;
      var list = pr==='desf'?MOCK.MOTIVOS_REPR:MOCK.MOTIVOS_RESS;
      m.querySelector('#pitMot').innerHTML = list.map(function(x){return '<option>'+esc(x)+'</option>'}).join('');
    }
    fillMotP();
    m.querySelector('#pitParecer').onchange=fillMotP;
    $$('.pit-cb',m).forEach(function(cb){ cb.onchange=updSel; });
    var allCb=m.querySelector('#pitAll'); if(allCb) allCb.onchange=function(){ $$('.pit-cb',m).forEach(function(cb){cb.checked=allCb.checked;}); updSel(); };

    function repintarLinha(key){
      var it=itens.filter(function(x){return x.key===key;})[0]; if(!it) return;
      var tr=m.querySelector('tr[data-k="'+CSS.escape(key)+'"]'); if(!tr) return;
      var novo=el('tbody'); novo.innerHTML=linhaItem(it);
      var ntr=novo.firstChild;
      // preserva o checkbox marcado
      var estava=tr.querySelector('.pit-cb').checked;
      tr.parentNode.replaceChild(ntr,tr);
      ntr.querySelector('.pit-cb').checked=estava;
      ntr.querySelector('.pit-cb').onchange=updSel;
      lcIcons();
    }
    function atualizarResumo(){
      var fav=0,desf=0,sem=0;
      itens.forEach(function(it){ var pa=pareceresItem[it.key]; if(!pa)sem++; else if(pa.parecer==='fav')fav++; else desf++; });
      var st = statusDerivado(fav,desf,sem,itens.length);
      m.querySelector('#pitResumo').innerHTML=
        '<div class="pit-resumo-in">'+ico('gauge',13)+' <b>Resumo:</b> '+fav+' favorável(is) · '+desf+' desfavorável(is) · '+sem+' sem parecer '+
        '<span class="pit-status-badge '+st.cls+'">→ '+st.label+'</span></div>';
    }
    function statusDerivado(fav,desf,sem,total){
      if(total===0) return {label:'Sem itens', cls:'muted', status:g.status};
      if(sem>0 && fav===0 && desf===0) return {label:'Pendente (sem parecer)', cls:'muted', status:'Em análise'};
      if(desf===0 && sem===0) return {label:'Liberada', cls:'ok', status:'Liberada'};
      if(fav===0 && sem===0) return {label:'Negada', cls:'danger', status:'Negada'};
      return {label:'Parcialmente liberada', cls:'warn', status:'Parcialmente liberada'};
    }

    m.querySelector('#pitAplicar').onclick=function(){
      var keys=selKeys(); if(!keys.length){ toast('Selecione ao menos um item','warn'); return; }
      var pr=m.querySelector('#pitParecer').value;
      var mot=m.querySelector('#pitMot').value;
      var just=m.querySelector('#pitJust').value.trim();
      keys.forEach(function(k){
        var it=itens.filter(function(x){return x.key===k;})[0]||{};
        pareceresItem[k]={key:k, tipo:it.tipo, cod:it.cod, desc:it.desc, parecer:pr, motivo:mot, justificativa:just};
        repintarLinha(k);
      });
      // desmarca e limpa o painel
      $$('.pit-cb',m).forEach(function(cb){cb.checked=false;}); if(allCb) allCb.checked=false;
      m.querySelector('#pitJust').value='';
      updSel(); atualizarResumo();
      toast(keys.length+' item(ns): parecer '+(pr==='fav'?'favorável':'desfavorável')+' aplicado','ok');
    };
    m.querySelector('#pitLimpar').onclick=function(){
      var keys=selKeys(); if(!keys.length){ toast('Selecione ao menos um item','warn'); return; }
      keys.forEach(function(k){ delete pareceresItem[k]; repintarLinha(k); });
      $$('.pit-cb',m).forEach(function(cb){cb.checked=false;}); if(allCb) allCb.checked=false;
      updSel(); atualizarResumo();
      toast('Parecer removido dos itens selecionados','ok');
    };
    atualizarResumo();
    // Botão "Auditoria de procedimento" — 1 código por vez; se houver vários procedimentos, pede para escolher qual
    var _bAud=m.querySelector('#pAudProc');
    if(_bAud) _bAud.onclick=function(){
      var procs=itens.filter(function(x){return x.tipo==='Procedimento';});
      if(!procs.length){ toast('Esta guia não possui procedimentos para auditar','warn'); return; }
      if(procs.length===1){ openAuditoriaProcedimento(g, procs[0]); return; }
      // vários: se exatamente 1 procedimento estiver selecionado na lista, usa ele; senão, pede para escolher
      var selProcs=selKeys().map(function(k){return itens.filter(function(x){return x.key===k;})[0];}).filter(function(x){return x&&x.tipo==='Procedimento';});
      if(selProcs.length===1){ openAuditoriaProcedimento(g, selProcs[0]); return; }
      escolherProcedimentoAuditoria(g, procs);
    };
    var _bPT=m.querySelector('#pGerarPT');
    if(_bPT) _bPT.onclick=function(){
      var btn=this; var orig=btn.innerHTML;
      btn.innerHTML=ico('loader')+' Gerando…'; btn.disabled=true; lcIcons();
      gerarEImprimirParecerTecnico(g).finally(function(){ btn.innerHTML=orig; btn.disabled=false; lcIcons(); });
    };
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
        m.querySelector('#pImp').value=linhas.join('\n\n');
        btn.innerHTML=ico('sparkles')+' Gerar análise técnica (obs. impressas)'; btn.disabled=false;
        lcIcons();
        hidePageLoader();
        document.body.classList.remove('pl--blurring');
        setTimeout(function(){ if(_pl2) _pl2.classList.remove('pl--transp'); },600);
        toast('Justificativa gerada. Revise antes de salvar.','ok');
      },500);
    };
    m.querySelector('#pCancel').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#pSalvar').onclick=function(){
      var obsImp=m.querySelector('#pImp').value;
      var obsInt=m.querySelector('#pInt').value;
      // consolida pareceres por item + status derivado
      var itensPar=Object.keys(pareceresItem).map(function(k){return pareceresItem[k];});
      var fav=0,desf=0,sem=0;
      itens.forEach(function(it){ var pa=pareceresItem[it.key]; if(!pa)sem++; else if(pa.parecer==='fav')fav++; else desf++; });
      if(itens.length && !itensPar.length){ toast('Dê parecer a pelo menos um item antes de salvar','warn'); return; }
      var st=statusDerivado(fav,desf,sem,itens.length);
      var dec=st.label; // decisão derivada (Liberada / Negada / Parcialmente liberada / Pendente)
      var par={decisao:dec, itens:itensPar, resumo:{favoravel:fav,desfavoravel:desf,semParecer:sem,total:itens.length},
        obsImp:obsImp, obsInt:obsInt, user:perfilDef[State.perfil].nome, ts:new Date().toISOString().slice(0,16).replace('T',' ')};
      g.parecerOperadora=par;
      g.status=st.status;
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
      MOCK.LOGS.unshift({ts:par.ts,user:par.user,perfil:State.perfil,acao:'Parecer da Operadora emitido',ref:g.numero+' → '+dec+' ('+fav+' fav / '+desf+' desf'+(sem?' / '+sem+' s/ parecer':'')+')'});
      if(obsImp||obsInt) MOCK.LOGS.unshift({ts:par.ts,user:par.user,perfil:State.perfil,tipo:'ia',acao:'Feedback ao modelo IA registrado via Parecer da Operadora',ref:'Guia '+g.numero});
      toast('Parecer salvo · '+g.status,'ok');
      m.parentNode.remove(); render();
    };
  }

  // Seleção do procedimento a auditar (quando a guia tem mais de um) — 1 código por vez
  function escolherProcedimentoAuditoria(g, procs){
    var body='<div class="audp-pick-hd">'+ico('list-checks',14)+' Esta guia possui <b>'+procs.length+'</b> procedimentos. Selecione qual deseja auditar:</div>'+
      '<div class="audp-pick-list">'+procs.map(function(p,i){
        return '<label class="audp-pick-item"><input type="radio" name="audPick" value="'+i+'"'+(i===0?' checked':'')+'>'+
          '<span class="audp-pick-cod">'+esc(p.cod)+'</span><span class="audp-pick-desc">'+esc(p.desc)+'</span></label>';
      }).join('')+'</div>';
    var foot='<button class="btn ghost" id="apkCancel">Cancelar</button><button class="btn" id="apkOk">'+ico('arrow-right')+' Auditar procedimento</button>';
    var m=modal('Auditoria de procedimento · '+esc(g.numero), 'A auditoria é feita um procedimento por vez.', body, foot);
    m.querySelector('#apkCancel').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#apkOk').onclick=function(){
      var sel=m.querySelector('input[name="audPick"]:checked');
      var idx=sel?+sel.value:0;
      m.parentNode.remove();
      openAuditoriaProcedimento(g, procs[idx]);
    };
    lcIcons();
  }

  // Modal "Auditoria de procedimento" (aberto do Parecer da Operadora) — código/qtd solicitado × autorizado + equipe médica
  function openAuditoriaProcedimento(g, proc){
    proc=proc||{}; var cod=proc.cod||'', desc=proc.desc||'';
    var _AUDITORES=['PRESTADOR TESTE DOIS','Dr. Marcos Vinícius','Dr. Tiago Ramalho','Dra. Helena Prado','Junta Médica'];
    var _MOTIVOS=['Divergência de código','Divergência de quantidade','Adequação técnica','Alteração de equipe médica','Revisão de percentuais','Outros'];
    var _TECNICAS=['—','Convencional','Videolaparoscópica','Robótica','Endoscópica','Percutânea'];
    var _EQUIPE=['—','Prestador','Executante','Solicitante'];
    var _PROFS=['—','PRESTADOR TESTE DOIS','Dr. Marcos Vinícius','Dr. Tiago Ramalho','Dra. Helena Prado'];
    function opts(arr,sel){ return arr.map(function(x){return '<option'+(x===sel?' selected':'')+'>'+esc(x)+'</option>';}).join(''); }

    // Catálogo de serviços do sistema (o Autorizado é ESCOLHIDO da lista, não digitado livremente)
    var _SERVICOS=(MOCK.PROCEDIMENTOS||[]).map(function(p){ return {cod:p.cod, desc:p.desc}; });
    // garante que o item solicitado esteja na lista (para vir pré-selecionado)
    if(cod && !_SERVICOS.some(function(s){return s.cod===cod;})) _SERVICOS.unshift({cod:cod, desc:desc||cod});
    _SERVICOS.sort(function(a,b){ return String(a.cod).localeCompare(String(b.cod)); });
    function optSrvCod(sel){ return _SERVICOS.map(function(s){return '<option value="'+esc(s.cod)+'"'+(s.cod===sel?' selected':'')+'>'+esc(s.cod)+'</option>';}).join(''); }
    function optSrvDesc(sel){ return _SERVICOS.map(function(s){return '<option value="'+esc(s.cod)+'"'+(s.cod===sel?' selected':'')+'>'+esc(s.desc)+'</option>';}).join(''); }

    var body=
      '<div class="audp-tabs">'+
        '<button class="audp-tab active" data-at="cod">Alterações no código ou quantidade</button>'+
        '<button class="audp-tab" data-at="eq">Demais alterações / Equipe médica</button>'+
      '</div>'+
      // Cabeçalho comum
      '<div class="audp-head g2">'+
        '<div class="field"><label>Auditor médico</label><select id="audAuditor">'+opts(_AUDITORES, _AUDITORES[0])+'</select></div>'+
        '<div class="field"><label>Motivo da auditoria</label><select id="audMotivo"><option value=""></option>'+opts(_MOTIVOS,'')+'</select></div>'+
      '</div>'+
      // ── Aba 1: código/quantidade ──
      '<div class="audp-pane" data-pane="cod">'+
        '<div class="audp-cols">'+
          '<div class="audp-col"><div class="audp-col-hd">Solicitado</div>'+
            '<div class="audp-row"><label>Código</label><input type="text" id="audCodSol" value="'+esc(cod)+'" readonly><input type="text" id="audDescSol" class="audp-desc" value="'+esc(desc)+'" readonly></div>'+
            '<div class="audp-row"><label>Qtde</label><input type="number" id="audQtdSol" value="1" min="0" style="max-width:90px" readonly></div>'+
          '</div>'+
          '<div class="audp-col"><div class="audp-col-hd">Autorizado</div>'+
            '<div class="audp-row"><label>Código</label><select id="audCodAut" style="max-width:120px">'+optSrvCod(cod)+'</select><select id="audDescAut" class="audp-desc">'+optSrvDesc(cod)+'</select></div>'+
            '<div class="audp-row"><label>Qtde</label><input type="number" id="audQtdAut" value="1" min="0" style="max-width:90px"></div>'+
            '<div class="audp-row"><label>Técnica a utilizar</label><select id="audTecnica" class="audp-desc">'+opts(_TECNICAS,'—')+'</select></div>'+
          '</div>'+
        '</div>'+
        '<div class="field" style="margin-top:6px"><label>Observações</label><textarea id="audObs" style="min-height:120px"></textarea></div>'+
      '</div>'+
      // ── Aba 2: equipe médica ──
      '<div class="audp-pane" data-pane="eq" style="display:none">'+
        '<div class="g2">'+
          '<div class="field"><label style="color:#b3261e">Equipe</label><input type="text" id="audEquipe" style="max-width:120px"></div>'+
          '<div class="field"><label style="color:#b3261e">Via</label><input type="text" id="audVia" style="max-width:120px"></div>'+
        '</div>'+
        '<div class="g2">'+
          '<div class="field"><label>Percentual calculado</label><input type="text" id="audPercCalc" style="max-width:120px"></div>'+
          '<div class="field"><label>Percentual diferenciado</label><input type="text" id="audPercDif" style="max-width:120px"></div>'+
        '</div>'+
        '<div class="field"><label>Anestesista</label><select id="audAnest">'+opts(_PROFS,'—')+'</select></div>'+
        (function(){
          var padrao=[30,20,20,20];
          return [1,2,3,4].map(function(n,i){
            return '<div class="audp-aux"><div class="field audp-aux-nome"><label>'+n+'º Auxiliar</label><select class="audAuxSel" data-n="'+n+'">'+opts(_PROFS,'—')+'</select></div>'+
              '<div class="field audp-aux-pct"><label>% normal</label><input type="number" class="audAuxNorm" value="'+padrao[i]+'"></div>'+
              '<div class="field audp-aux-pct"><label>% diferenciado</label><input type="number" class="audAuxDif" placeholder=""></div></div>';
          }).join('');
        })()+
        '<div class="field"><label>Auxiliar de anestesista</label><select id="audAuxAnest">'+opts(_PROFS,'—')+'</select></div>'+
      '</div>';
    var foot='<button class="btn ghost" id="audDesistir">'+ico('x')+' Desistir</button><button class="btn" id="audOk">'+ico('check')+' OK</button>';
    var m=modal('Auditoria de procedimento · '+esc(g.numero), 'Solicitado × Autorizado — ajuste de código, quantidade, técnica e equipe médica.', body, foot);

    // troca de abas
    $$('.audp-tab',m).forEach(function(b){ b.onclick=function(){
      $$('.audp-tab',m).forEach(function(x){x.classList.remove('active');}); b.classList.add('active');
      var at=b.getAttribute('data-at');
      $$('.audp-pane',m).forEach(function(p){ p.style.display=(p.getAttribute('data-pane')===at)?'block':'none'; });
    }; });

    // Autorizado: código e descrição são selects sincronizados (escolher um ajusta o outro)
    var _selCod=m.querySelector('#audCodAut'), _selDesc=m.querySelector('#audDescAut');
    _selCod.onchange=function(){ _selDesc.value=_selCod.value; };
    _selDesc.onchange=function(){ _selCod.value=_selDesc.value; };

    m.querySelector('#audDesistir').onclick=function(){ m.parentNode.remove(); };
    m.querySelector('#audOk').onclick=function(){
      var codAut=m.querySelector('#audCodAut').value, qtdAut=m.querySelector('#audQtdAut').value;
      var tec=m.querySelector('#audTecnica').value, obs=m.querySelector('#audObs').value;
      var srvAut=_SERVICOS.filter(function(s){return s.cod===codAut;})[0];
      var descAut=srvAut?srvAut.desc:codAut;
      var ts=new Date().toISOString().slice(0,16).replace('T',' ');
      var uName=perfilDef[State.perfil]?perfilDef[State.perfil].nome:State.perfil;
      var ref='Guia '+g.numero+' — proc '+cod+(codAut&&codAut!==cod?' → '+codAut+' '+descAut:'')+' (qtd aut '+qtdAut+(tec&&tec!=='—'?', técnica '+tec:'')+')';
      MOCK.LOGS.unshift({ts:ts,user:uName,perfil:State.perfil,acao:'Auditoria de procedimento registrada',ref:ref});
      if(typeof logAcao==='function') logAcao('Auditoria de procedimento', ref+(obs?' — '+(obs.length>60?obs.slice(0,60)+'…':obs):''));
      toast('Auditoria de procedimento registrada','ok');
      m.parentNode.remove();
    };
    lcIcons();
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
  var ROUTE_LABELS={dashboard:'Dashboard',guias:'Guias',kanban:'Kanban',relatorios:'Relatórios',param:'Parametrização',logs:'Logs',config:'Configurações',manual:'Manual do Usuário'};
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
      if(!State.manualDashTab) State.manualDashTab='visao';
      var DASH_TABS=[
        {id:'visao',    label:'Visão Geral'},
        {id:'kpis',     label:'KPIs'},
        {id:'gargalos', label:'Ranking de Gargalos'},
        {id:'graficos', label:'Gráficos'},
      ];
      var dashTabBar='<div class="manual-subtab-bar">';
      DASH_TABS.forEach(function(t){
        dashTabBar+='<button class="manual-subtab'+(State.manualDashTab===t.id?' active':'')+'" data-dashtab="'+t.id+'">'+t.label+'</button>';
      });
      dashTabBar+='</div>';

      var dtab=State.manualDashTab;
      var dashContent='';

      if(dtab==='visao'){
        dashContent=
          manualBox('Visão Geral',
            '<p>O Dashboard apresenta os principais indicadores do processo de auditoria em tempo real, com base nas guias visíveis para o perfil ativo.</p>'+
            manualScreen('dashboard'))+
          manualBox('Filtro de Período',
            '<p>No canto superior direito do título há um <b>seletor de período</b>. Por padrão, exibe os últimos <b>30 dias</b> a partir da data atual. O período pode ser alterado livremente — todas as métricas são recalculadas automaticamente.</p>');
      }
      else if(dtab==='kpis'){
        dashContent=
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
            '<p>Clicar em qualquer card de KPI abre um modal com a <b>lista detalhada</b> das guias que compõem aquele indicador. A partir do modal é possível clicar em qualquer guia para abrir seus detalhes completos.</p>');
      }
      else if(dtab==='gargalos'){
        dashContent=
          manualBox('Ranking de Gargalos (KPI "Etapa com gargalo")',
            '<p>O card <b>"Etapa com gargalo"</b> abre o <b>Ranking de Gargalos</b>: uma lista das etapas de auditoria ordenadas pelo <b>tempo médio</b> que as guias permanecem nelas. Serve para identificar onde o fluxo está mais lento e onde há guias travadas.</p>'+
            '<p><b>O que cada etapa representa:</b> são as etapas dos fluxos assistenciais (ex.: <i>Auditoria Prévia, Cotação OPME, Junta Médica, Abordagem Presencial</i>) percorridas por cada guia ao longo da auditoria.</p>'+
            '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--g-700)">'+ico('list-checks',13)+' Quando uma guia entra na contagem de uma etapa</h4>'+
            '<ul>'+
              '<li>A guia é contabilizada em uma etapa quando <b>passou ou está passando</b> por ela no período filtrado.</li>'+
              '<li>Etapas que <b>ainda não iniciaram</b> (status <i>aguardando</i>) <b>não entram</b> no cálculo daquela guia.</li>'+
              '<li>Cada guia contribui com o <b>tempo que levou</b> naquela etapa para o cálculo da média.</li>'+
            '</ul>'+
            '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--g-700)">'+ico('timer',13)+' Como o tempo médio é calculado</h4>'+
            '<ul>'+
              '<li><b>Etapa concluída:</b> usa o tempo real que a guia levou para completá-la.</li>'+
              '<li><b>Etapa em andamento (guia parada nela):</b> usa o tempo decorrido <b>até agora</b> (dias em auditoria × 24h) — ou seja, quanto a guia já está esperando.</li>'+
              '<li>A <b>média da etapa</b> = soma das horas de todas as guias ÷ número de guias que passaram por ela.</li>'+
              '<li>São exibidas as <b>10 etapas</b> com maior tempo médio (as mais críticas).</li>'+
            '</ul>'+
            '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--g-700)">'+ico('pause-circle',13)+' Quando uma guia aparece como "parada"</h4>'+
            '<p>Uma guia está <b>parada</b> em uma etapa quando essa etapa está <b>em andamento</b> (ainda não foi concluída). O selo ao lado de cada etapa mostra o <b>total de guias</b> que passaram por ela e, quando há travadas, <b>quantas estão paradas agora</b>:</p>'+
            '<ul>'+
              '<li>Com guias travadas: <span class="badge danger" style="font-size:10px;white-space:nowrap">8 guias · 3 paradas</span> (vermelho) — total + paradas no momento.</li>'+
              '<li>Sem nenhuma parada: <span class="badge muted" style="font-size:10px;white-space:nowrap">6 guias</span> (cinza) — todas já concluíram a etapa.</li>'+
            '</ul>'+
            '<p>Assim, quando uma etapa tem guias paradas <b>e</b> guias que já passaram, ambas aparecem no mesmo selo: o número total e, em destaque, quantas seguem travadas.</p>'+
            '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--g-700)">'+ico('triangle-alert',13)+' Barra vermelha = acima do prazo</h4>'+
            '<p>Cada etapa tem um <b>prazo configurado</b> (em horas; padrão de 24h se não definido). Quando o <b>tempo médio supera esse prazo</b>, a barra fica <span style="color:#e53935;font-weight:600">vermelha</span> — sinalizando que, em média, as guias estão estourando o tempo esperado naquela etapa. O prazo de cada etapa/fluxo é ajustável em <b>Configurações → Prazos por Fluxo</b>.</p>'+
            '<h4 style="margin:14px 0 6px;font-size:13px;color:var(--g-700)">'+ico('mouse-pointer-click',13)+' Clicar em uma etapa</h4>'+
            '<p>Clique em qualquer linha do ranking para abrir a <b>lista das guias daquela etapa</b>. As guias atualmente paradas vêm marcadas com o selo <span class="badge danger" style="font-size:9px">parada</span>. A partir dessa lista, clique em uma guia para abrir seus <b>detalhes completos</b> (já na aba <i>Etapas</i>).</p>'+
            '<p style="margin-top:10px;padding:9px 12px;background:var(--g-50);border-radius:8px;font-size:12.5px"><b>'+ico('info',12)+' Resumo:</b> o ranking responde a três perguntas — <b>onde</b> o fluxo está mais lento (ordem por tempo médio), <b>quanto</b> está acima do esperado (barra vermelha) e <b>quantas</b> guias estão travadas agora (selo de paradas).</p>');
      }
      else if(dtab==='graficos'){
        dashContent=
          manualBox('Gráficos e Distribuições',
            '<p>Abaixo dos KPIs, o dashboard exibe:</p><ul>'+
            '<li><b>Distribuição por status</b> — barras horizontais com % por status</li>'+
            '<li><b>Fluxos mais utilizados</b> — ranking de fluxos por volume de guias</li>'+
            '<li><b>Duração dos subfluxos</b> — tempo médio por etapa de auditoria</li>'+
            '</ul><p><i>Dica: clique em uma barra de status ou fluxo para abrir a relação filtrada de guias.</i></p>');
      }

      body.innerHTML=
        manualHdr('Dashboard Executivo','Visão consolidada de auditoria assistencial e indicadores operacionais')+
        dashTabBar+
        dashContent;

      setTimeout(function(){
        document.querySelectorAll('.manual-subtab[data-dashtab]').forEach(function(btn){
          btn.onclick=function(){
            State.manualDashTab=btn.getAttribute('data-dashtab');
            var b=document.querySelector('.manual-body');
            if(b) b.scrollTop=0;
            render();
          };
        });
      },0);
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
          {id:'etapas',       label:'Etapas'},
          {id:'parecer_tec',  label:'Análise Técnica IA'},
          {id:'parecer_op',   label:'Parecer Operadora'},
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
            '<p>Visão consolidada da guia. No topo, quatro indicadores; logo abaixo, o grid de risco (cada dimensão alinhada sob seu indicador); e, na sequência, os dados em duas colunas — beneficiário à esquerda, guia/solicitação à direita.</p>'+
            '<p style="margin-top:8px"><b>Indicadores (topo):</b></p>'+
            manualTable(['Campo','Descrição'],[
              ['STATUS','Badge com o status atual da guia (Ex.: Em análise, Liberada, Negada)'],
              ['DIAS EM AUDITORIA','Número de dias desde a emissão até hoje'],
              ['ADERÊNCIA REGULATÓRIA','Percentual de conformidade da guia com os critérios técnicos e documentais (documentação, DUT quando aplicável, vinculação de procedimentos/pacotes/Mat-Med/diárias e cobertura contratual) — verde (alta), amarelo (moderada), laranja (baixa), vermelho (crítica)'],
              ['FLUXO','Nome do fluxo assistencial vinculado (Ex.: Auditoria Urgência/Emergência)'],
            ])+
            '<p style="margin-top:12px"><b>Grid de Risco (4 dimensões, alinhadas sob os indicadores):</b></p>'+
            manualTable(['Dimensão','Descrição'],[
              ['Regulatório','Urgência, prazo de auditoria vencido, regime de internação etc.'],
              ['Assistencial','Complexidade do procedimento e do quadro clínico'],
              ['Documental','Aderência à DUT e documentação apresentada'],
              ['Contratual','Cobertura contratual do plano para o procedimento'],
            ])+
            '<p style="margin-top:12px"><b>Coluna esquerda — Guia e Beneficiário:</b></p>'+
            manualTable(['Campo','Descrição'],[
              ['Guia','Número identificador da guia'],
              ['Data emissão','Data de emissão da guia'],
              ['Beneficiário','Nome completo do paciente'],
              ['Data de nascimento','Data de nascimento (consultada no cadastro); a idade é calculada automaticamente e exibida entre parênteses'],
              ['Carteirinha','Número da carteirinha do beneficiário'],
              ['CPF','CPF do beneficiário, parcialmente mascarado (privacidade de dados)'],
              ['Plano / Contrato','Nome do plano e código do contrato'],
              ['Acomodação','Acomodação contratada pelo beneficiário (APARTAMENTO ou ENFERMARIA)'],
              ['Data de inclusão','Data em que o beneficiário entrou no plano; o tempo de contrato (anos) é calculado automaticamente e exibido entre parênteses'],
            ])+
            '<p style="margin-top:12px"><b>Coluna direita — Solicitação:</b></p>'+
            manualTable(['Campo','Descrição'],[
              ['Solicitante','Médico que solicitou o procedimento'],
              ['Executante','Prestador (estabelecimento) que realizará o procedimento'],
              ['Local do atendimento','Onde o atendimento será realizado (nos dados atuais, igual ao executante)'],
              ['Especialidade','Especialidade médica (derivada do tipo da guia)'],
              ['Natureza','Natureza do atendimento (Internação, Ambulatorial)'],
              ['Regime','Regime (Urgência, Eletivo)'],
              ['CID','Código internacional de doenças (CID-10) associado à solicitação'],
              ['Indicação clínica / Hipótese diagnóstica','Descrição do diagnóstico correspondente ao CID informado'],
              ['Origem','Canal de origem da solicitação (badge colorido)'],
            ])+
            '<p style="margin-top:12px"><b>Procedimentos, Pacotes e Diárias/Taxas (mini-tabelas):</b> abaixo dos cards de risco, tabelas resumidas empilhadas (em largura cheia) importam os itens das antigas abas <b>Procedimentos</b>, <b>Pacotes</b> e <b>Diárias/Taxas</b> — para consulta rápida sem sair do Resumo. Procedimentos/Pacotes mostram código, descrição, peso e flags; <b>Diárias/Taxas</b> mostra código, descrição, <b>quantidade</b> e peso.</p>',
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
            '<p>Clique em qualquer linha da tabela de guias para abrir o modal de detalhes. O modal exibe todas as informações organizadas em <b>abas</b>. Selecione uma aba abaixo para ver a explicação detalhada.</p>')+
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
              ['ADERÊNCIA À DUT','Percentual de aderência às Diretrizes de Utilização — verde (alta), amarelo (moderada), laranja (baixa) ou vermelho (crítica). Exibe "Não se aplica" quando a guia não possui procedimento com DUT vinculada'],
              ['FLUXO','Nome do fluxo assistencial vinculado à guia (Ex.: Auditoria Urgência/Emergência)'],
              ['GUIA','Número identificador da guia'],
              ['DATA EMISSÃO','Data em que a guia foi emitida'],
              ['BENEFICIÁRIO','Nome completo do paciente'],
              ['DATA DE NASCIMENTO','Data de nascimento (consultada no cadastro); a idade é calculada automaticamente e exibida entre parênteses'],
              ['CARTEIRINHA','Número da carteirinha do beneficiário'],
              ['PLANO / CONTRATO','Nome do plano e código do contrato'],
              ['DATA DE INCLUSÃO','Data em que o beneficiário entrou no plano; o tempo de contrato (anos) é calculado automaticamente e exibido entre parênteses'],
              ['SOLICITANTE','Médico que solicitou o procedimento'],
              ['EXECUTANTE','Prestador (estabelecimento) que executará o procedimento'],
              ['LOCAL DO ATENDIMENTO','Onde o atendimento será realizado (nos dados atuais, igual ao executante)'],
              ['ESPECIALIDADE','Especialidade médica (derivada do tipo da guia)'],
              ['NATUREZA','Natureza do atendimento (Ex.: Internação, Ambulatorial)'],
              ['REGIME','Regime (Ex.: Urgência, Eletivo)'],
            ])+
            '<p style="margin-top:12px">Abaixo dos dados cadastrais, um <b>grid de 4 cards</b> exibe os níveis de risco por dimensão:</p>'+
            manualTable(['Dimensão','Descrição'],[
              ['Regulatório','Risco baseado em critérios regulatórios (urgência, UTI, OPME, prazo vencido etc.)'],
              ['Assistencial','Risco assistencial com base na complexidade do procedimento e oncologia'],
              ['Documental','Risco baseado na aderência à DUT e documentação apresentada'],
              ['Contratual','Risco de cobertura contratual do plano para o procedimento solicitado'],
            ]))+

          manualBox('Aba: Etapas',
            '<p>Exibe a <b>timeline do fluxo</b> de auditoria com o status de cada etapa:</p>'+
            manualTable(['Status','Descrição'],[
              ['Concluída (verde)','Etapa já finalizada — exibe data de início e fim'],
              ['Em execução (destaque)','Etapa atualmente em andamento — exibe data de início e prazo restante'],
              ['Pendente (cinza)','Etapa ainda não iniciada'],
            ])+
            '<p>Cada etapa exibe: número de ordem, nome, responsável (Auditor / Enfermeiro), prazo em horas e datas de execução.</p>')+

          manualBox('Procedimentos e Pacotes (no Resumo)',
            '<p>As antigas abas <b>Procedimentos</b>, <b>Pacotes</b> e <b>Diárias/Taxas</b> foram incorporadas ao <b>Resumo</b>, exibidas em mini-tabelas empilhadas abaixo dos cards de risco (Diárias/Taxas inclui a coluna <b>Quantidade</b>):</p>'+
            manualTable(['Coluna','Descrição'],[
              ['Código','Código TUSS ou interno do procedimento / pacote'],
              ['Descrição','Nome do procedimento ou pacote'],
              ['Peso','Pontuação do item no cálculo de risco (0–10)'],
              ['Flags','Marcadores do item: DUT, OPME e/ou Obrigatório'],
            ]))+

          manualBox('Mat/Med e OPME (no Resumo)',
            '<p>Incorporados ao <b>Resumo</b> da guia, em cartões <b>resumidos</b> para não estender a tela. Cada um mostra uma tabela enxuta (Mat/Med: descrição, unidade, via, qtde solicitada e qtde; OPME: código solicitado, produto solicitado, qtde solicitada e qtde) e um botão <b>"Detalhes"</b> que expande a visão completa (campos regulatórios, valores solicitado × autorizado, fornecedores, etc.).</p>')+

          manualBox('Anexos (dentro do Resumo)',
            '<p>A gestão de anexos foi incorporada ao <b>Resumo</b> da guia. Use o botão <b>"Anexar documento"</b> para enviar um novo arquivo recebido após a solicitação (ex.: um exame) e <b>classificá-lo</b> por categoria (Exame complementar, Laudo médico, DUT/Evidência, etc.). O arquivo fica disponível para visualização e a ação é registrada nos logs.</p>'+
            '<p>Cada anexo exibe:</p>'+
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

          manualBox('Críticas (no Resumo)',
            '<p>As críticas foram incorporadas ao <b>Resumo</b> da guia: uma seção lista as inconsistências e alertas identificados automaticamente pela IA e pelas regras de negócio, com o contador no cabeçalho.</p>')+

          manualBox('Aba: Análise Técnica IA',
            '<p>Exibe a análise técnica gerada pela IA com base nas regras DUT e nos parâmetros configurados:</p>'+
            manualTable(['Elemento','Descrição'],[
              ['Badge de confiança','Percentual de confiança da análise (Ex.: Confiança 87%)'],
              ['Aderência regulatória','Barra visual com o percentual de conformidade da guia (documentação, DUT quando aplicável, vinculações e cobertura contratual)'],
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

          manualBox('Histórico (no Resumo)',
            '<p>Incorporado ao <b>Resumo</b> da guia. O <b>histórico clínico e tratamentos anteriores</b> do beneficiário é <b>gerado automaticamente pela IA</b> (a partir dos dados do beneficiário e das solicitações). O usuário pode <b>editar livremente</b> o conteúdo — as alterações são salvas e <b>registradas nos logs da guia</b>. Um selo indica se o texto atual é o gerado pela IA ou editado pelo usuário, e o botão <b>"Gerar pela IA"</b> refaz o histórico (descartando a edição).</p>')+

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
          '<p>A Parametrização é onde se configura tudo que a IA e os fluxos utilizam para analisar as guias. Possui 3 abas principais e um painel de KPIs no topo.</p>'+
          '<p style="padding:9px 12px;background:var(--g-50);border-radius:8px;font-size:12.5px"><b>'+ico('lock',12)+' Edição restrita:</b> apenas <b>Administrador</b> e <b>Gestor</b> editam/inserem prompts dos Subfluxos e as instruções/pesos da IA em Procedimentos, Pacotes, Mat/Med e Diárias/Taxas. <b>Auditor</b> e <b>Enfermeiro</b> visualizam, mas não editam.</p>')+
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
          '<p>A tela de Logs registra todas as ações realizadas na plataforma, garantindo rastreabilidade completa para fins de auditoria e conformidade.</p>'+
          '<p style="padding:9px 12px;background:var(--g-50);border-radius:8px;font-size:12.5px"><b>'+ico('lock',12)+' Acesso restrito:</b> a área de Logs é exclusiva de <b>Administrador</b> e <b>Gestor</b>. Auditor e Enfermeiro não visualizam este menu.</p>')+
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
        manualHdr('Configurações','Risco, prazos, permissões, usuários e assistente IA')+
        manualBox('Aba: Classificação de Risco',
          '<p>Define como as guias são classificadas automaticamente em 4 níveis de risco (Baixo, Médio, Alto, Crítico) com base em fatores presentes na guia.</p>'+
          '<p>Edição disponível para <b>Administrador</b> e <b>Gestor</b>.</p>'+
          '<p><b>Toggle "Classificação automática ativa"</b> — quando ativo, o risco é recalculado automaticamente a cada análise. Quando inativo, o risco permanece manual.</p>'+
          '<br><p><b>Sub-aba: Limiares por nível</b></p>'+
          '<p>Define os limiares de pontuação para cada nível:</p>'+
          manualTable(['Nível','Pontuação'],[
            ['Baixo','0 até o limiar baixo (padrão: 5)'],
            ['Médio','Acima do baixo até o limiar médio (padrão: 11)'],
            ['Alto','Acima do médio até o limiar alto (padrão: 17)'],
            ['Crítico','Acima do limiar alto'],
          ])+
          '<p><i>Validação: os limiares devem estar em ordem crescente. O sistema impede salvar se Baixo ≥ Médio ou Médio ≥ Alto.</i></p>'+
          '<br><p><b>Sub-aba: Prévia</b></p>'+
          '<p>Mostra em tempo real como as guias seriam distribuídas nos 4 níveis com os limiares configurados, exibindo quantidade e percentual de cada nível.</p>')+
        manualBox('Aba: Fluxos',
          '<p><span class="badge info" style="font-size:10px">Admin/Gestor editam · Auditor/Enfermeiro visualizam</span></p>'+
          '<p>Nesta aba ficam os <b>Prazos por Fluxo</b>: define o prazo máximo de auditoria (em dias) e o regime de atendimento de cada fluxo assistencial. O prazo é consultado no Solus e usado nos relatórios e gráficos. <b>Apenas Administrador e Gestor editam</b>; Auditor e Enfermeiro veem em modo somente leitura.</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Fluxo','Identificador e nome do fluxo'],
            ['Regime','Clicável — cicla entre: Todos / Eletivo / Urgência'],
            ['Prazo (dias)','Campo editável com o prazo máximo de auditoria'],
          ])+
          '<p>A legenda/nota abaixo da tabela explica o comportamento da coluna Regime.</p>')+
        manualBox('Aba: Permissões',
          '<p><span class="badge info" style="font-size:10px">só Administrador</span></p>'+
          '<p>Matriz de permissões por perfil. Esta aba é <b>exclusiva do Administrador</b> — Gestor, Auditor e Enfermeiro não a visualizam.</p>'+
          '<p>Clique em qualquer célula da matriz para ciclar entre os níveis:</p>'+
          manualTable(['Nível','Ícone','Descrição'],[
            ['Acesso total','✓','Permissão completa para a ação'],
            ['Somente leitura','👁','Pode visualizar mas não alterar'],
            ['Sem acesso','—','Funcionalidade oculta para o perfil'],
          ])+
          '<p>As alterações são salvas automaticamente no navegador (localStorage).</p>')+
        manualBox('Aba: Usuários',
          '<p><span class="badge info" style="font-size:10px">só Administrador</span></p>'+
          '<p>Cadastro e gerenciamento dos usuários que acessam a plataforma. Esta aba é <b>exclusiva do perfil Administrador</b> — os demais perfis não a visualizam.</p>'+
          '<p><b>Listagem</b> — exibe os usuários com as colunas:</p>'+
          manualTable(['Coluna','Descrição'],[
            ['Nome','Nome completo do usuário'],
            ['E-mail','E-mail de contato cadastrado'],
            ['Perfil','Administrador, Gestor, Auditor ou Enfermeiro'],
            ['Situação','Selo <b>Ativo</b> (verde) ou <b>Inativo</b> (cinza)'],
            ['Ações','Botões Editar e Excluir'],
          ])+
          '<p><b>Adicionar / Editar</b> — abre um formulário com os campos:</p>'+
          '<ul>'+
            '<li><b>Nome completo</b></li>'+
            '<li><b>CPF</b> — com máscara automática e validação dos dígitos verificadores</li>'+
            '<li><b>E-mail</b> — validado quanto ao formato</li>'+
            '<li><b>Login</b> — usado para acessar a plataforma</li>'+
            '<li><b>Senha</b> e <b>Redigite a senha</b> — devem coincidir</li>'+
            '<li><b>Perfil</b> e <b>Situação</b> (Ativo / Inativo)</li>'+
          '</ul>'+
          '<p><b>Validações:</b> Login, CPF e e-mail são <b>únicos</b> (não se repetem entre usuários); CPF e e-mail precisam ser válidos; as senhas devem ser iguais.</p>'+
          '<p style="padding:9px 12px;background:var(--g-50);border-radius:8px;font-size:12.5px"><b>'+ico('lock',12)+' Inativar acesso:</b> ao definir um usuário como <b>Inativo</b>, ele não consegue mais fazer login (recebe o aviso "Usuário inativo. Contate o administrador."). Use isso para bloquear acessos sem precisar excluir o cadastro.</p>')+
        manualBox('Aba: Assistente IA',
          '<p><span class="badge info" style="font-size:10px">só Administrador</span></p>'+
          '<p>Configura a chave de API que ativa a assistente <b>RAI</b>. Esta aba é <b>exclusiva do Administrador</b>.</p>'+
          '<p><b>Provedores suportados</b> — o Administrador escolhe um e informa a chave correspondente:</p>'+
          manualTable(['Provedor','Onde obter a chave'],[
            ['Google Gemini','aistudio.google.com (possui plano gratuito)'],
            ['Anthropic (Claude)','console.anthropic.com'],
            ['OpenAI','platform.openai.com/api-keys'],
          ])+
          '<p>Cada provedor guarda sua própria chave e modelo. A chave fica armazenada <b>apenas no navegador</b> (localStorage) — nunca é enviada ao servidor nem ao código-fonte.</p>'+
          '<p><b>Importante para os demais perfis:</b> Auditor, Enfermeiro e Gestor <b>não veem</b> esta aba, mas <b>usam o chat normalmente</b> com a chave que o Administrador configurou. Caso a chave ainda não esteja configurada naquele dispositivo, o chat orienta a contatar o Administrador.</p>'+
          '<p style="padding:9px 12px;background:#fef9e7;border:1px solid #f5e2a3;border-radius:8px;font-size:12.5px"><b>'+ico('info',12)+' Chave por dispositivo:</b> a chave é salva por navegador/dispositivo. Para habilitar a RAI em um novo computador, o <b>Administrador</b> deve abrir o sistema naquele dispositivo e inserir a chave uma vez — os demais usuários daquele navegador passam a usar o assistente sem precisar da chave. <i>(A análise de aderência das guias é local e funciona para todos, independentemente da chave.)</i></p>')+
        manualBox('Assistente RAI: modos de atendimento',
          '<p>Ao abrir o chat, a RAI se apresenta e oferece <b>três modos</b>. O usuário escolhe um pelos botões:</p>'+
          manualTable(['Modo','O que faz'],[
            ['Uso do sistema','Atua como o manual interativo — tira dúvidas sobre telas, fluxos, aderência, pontuações e usabilidade da plataforma.'],
            ['Conversa técnica','Apoio técnico-assistencial sobre uma guia específica: esclarece o parecer, discute a indicação técnica dos serviços solicitados, contraindicações e alternativas possíveis.'],
            ['Relatórios','Conversa sobre os dados dos relatórios (Painel Executivo, Beneficiários, Médicos, Prestadores, Procedimentos, OPME, Custos, Alertas, Comparativos). A RAI responde com base nos números reais das guias do período.'],
          ])+
          '<p>No modo <b>Conversa técnica</b>, a RAI primeiro solicita o <b>número da guia</b>. Ao informar, ela carrega automaticamente os dados da guia (procedimentos, aderência, parecer da IA, pendências e alertas) e passa a responder com base nesse contexto.</p>'+
          '<p>No modo <b>Relatórios</b>, a RAI recebe automaticamente um resumo analítico das guias visíveis (custos, riscos, top médicos/prestadores, OPME, natureza) e responde perguntas como "quais os 3 médicos de maior custo?" ou "quanto foi economizado com serviços negados?".</p>'+
          '<p style="padding:9px 12px;background:var(--g-50);border-radius:8px;font-size:12.5px"><b>'+ico('info',12)+' Apoio à decisão:</b> no modo técnico a RAI <b>não autoriza nem nega</b> procedimentos — é apoio ao auditor. A decisão final é exclusiva da operadora. Para trocar de modo ou de guia, inicie uma <b>nova conversa</b> (botão de histórico → fechar).</p>');
    }

    else if(sec==='perfis'){
      body.innerHTML=
        manualHdr('Perfis de Acesso','Capacidades e restrições de cada perfil de usuário')+
        manualBox('Perfis disponíveis',
          manualTable(['Perfil','Acesso','Descrição'],[
            ['Administrador','Total +','Acesso a tudo, incluindo o gerenciamento de Usuários (Configurações → Usuários). É o perfil de mais alto nível.'],
            ['Gestor','Total','Mesmos acessos do Administrador, exceto gerenciar Usuários. Inclui Configurações, Parametrização e Logs.'],
            ['Auditor','Parcial','Pode auditar guias, emitir pareceres e visualizar relatórios'],
            ['Enfermeiro','Restrito','Acesso apenas às guias dos seus fluxos e às etapas de responsabilidade do enfermeiro'],
          ]))+
        manualBox('Simulação de Perfil (Administrador / Gestor)',
          '<p>Administrador e Gestor podem simular a visão de outros perfis usando o <b>botão flutuante</b> no canto inferior direito da tela (FAB com ícone de usuários). Ao selecionar um perfil:</p>'+
          '<ul><li>A visão de guias é filtrada conforme as regras do perfil simulado</li>'+
          '<li>Um banner de aviso é exibido no topo indicando o perfil em simulação</li>'+
          '<li>Um botão "Sair da visão" permite retornar à visão completa</li></ul>')+
        manualTable(['Funcionalidade','Admin','Gestor','Auditor','Enfermeiro'],[
          ['Dashboard','✓','✓','✓','✓'],
          ['Relação de Guias','✓','✓','✓','✓ (fluxos próprios)'],
          ['Kanban','✓','✓','✓','✓ (fluxos próprios)'],
          ['Parametrização','✓','✓','—','—'],
          ['Logs','✓','✓','—','—'],
          ['Configurações','✓','✓','—','—'],
          ['Gerenciar Usuários','✓','—','—','—'],
          ['Emitir parecer','✓','✓','✓','—'],
          ['Aprovar/Reprovar','✓','✓','✓','—'],
          ['Junta médica','✓','✓','✓','—'],
          ['Triagem/Complemento','✓','✓','✓','✓'],
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
    var defaults=[{login:'admin',senha:'admin',nome:'Administrador',cpf:'',email:'',perfil:'admin',ativo:true}];
    localStorage.setItem(USERS_KEY,JSON.stringify(defaults));
    return defaults;
  }

  function authCheck(){
    return !!localStorage.getItem(AUTH_KEY);
  }

  function authLogin(login,senha){
    var users=getUsers();
    for(var i=0;i<users.length;i++){
      if(users[i].login===login&&users[i].senha===senha){
        if(users[i].ativo===false) return {_inativo:true};
        return users[i];
      }
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
      if(user&&user._inativo){
        var sp=errEl.querySelector('span'); if(sp) sp.textContent='Usuário inativo. Contate o administrador.';
        errEl.classList.add('show');
        passEl.value=''; passEl.focus(); btn.disabled=false;
        return;
      }
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
        var sp2=errEl.querySelector('span'); if(sp2) sp2.textContent='Login ou senha incorretos';
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
    var WELCOME='Olá! Sou a RAI, sua assistente virtual.';

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
      s.mode=chatMode;
      s.guiaNum=chatGuia?chatGuia.numero:null;
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

    // Base de identidade comum aos modos
    var CTX_BASE='Você é a RAI, assistente virtual integrada ao RegulaAI Saúde, plataforma de auditoria assistencial para operadoras de saúde. Você CONHECE o sistema real e a navegação exata dele. '+
      'NÃO se apresente nem use saudações como "Olá! Sou a RAI" nas respostas — a apresentação já foi feita na abertura do chat. Vá direto ao ponto. '+
      'Se o usuário perguntar o que significa RAI ou o motivo do nome, responda: "RAI é a combinação da primeira letra de Regulação (R) + AI (Artificial Intelligence)." '+
      'Responda em português, de forma objetiva, técnica e acolhedora. '+
      'REGRA DE PRECISÃO (obrigatória): nunca use linguagem vaga ou hipotética sobre o sistema. É PROIBIDO escrever "costuma ser", "geralmente", "provavelmente", "deve estar em", "ou X ou Y", ou inventar nomes de menus/telas. Cite SEMPRE o caminho exato usando os nomes reais abaixo, no formato "Seção → Aba → campo". Se você realmente não souber um caminho específico, diga "Não tenho esse caminho mapeado; consulte o Manual" — jamais invente. ';

    // Mapa de navegação REAL do sistema (nomes exatos das telas e abas)
    var MAPA_SISTEMA=
      'MAPA DE NAVEGAÇÃO (nomes EXATOS — use-os literalmente):\n'+
      'MENU LATERAL (sidebar): Dashboard | Guias | Kanban | Parametrização | Configurações | Assistente | Manual | Logs.\n'+
      'CONFIGURAÇÕES (abas): "Classificação de Risco", "Fluxos", "Permissões", "Usuários" (só Administrador), "Assistente IA" (só Administrador).\n'+
      ' - Classificação de Risco: define os fatores de risco e, na sub-aba "Limiares", os limiares Baixo/Médio/Alto; sub-aba "Prévia" mostra a distribuição.\n'+
      ' - Fluxos: define o prazo (SLA, em dias) e o regime de cada fluxo.\n'+
      ' - Permissões: matriz de permissões por perfil (clique na célula para ciclar Acesso total / Somente leitura / Sem acesso).\n'+
      ' - Usuários: cadastro de usuários (Nome, CPF, E-mail, Login, Senha, Perfil, Situação Ativo/Inativo).\n'+
      ' - Assistente IA: provedor (Gemini/Claude/OpenAI) + chave de API + modelo.\n'+
      'PARAMETRIZAÇÃO: selecione um fluxo e use as abas internas. Os PESOS do cálculo de aderência ficam na aba "Pesos IA" (ícone de cérebro) DENTRO do fluxo selecionado — lá há um campo de peso (0 a 10) para cada critério: Documental, DUT, Procedimentos, Pacotes, Mat/Med, Diárias/Taxas, Contratual/Histórico. As Regras DUT ficam na aba "Regras DUT". As vinculações (Procedimentos, Pacotes, Mat/Med, Diárias/Taxas) têm suas próprias abas, cada uma com campo de peso por item.\n'+
      'GUIAS: a relação tem filtros rápidos e o "Filtro aprofundado"; clicar numa guia abre o modal de detalhes com abas (Cabeçalho, Resumo, Beneficiário, Solicitação, Etapas, Procedimentos, Pacotes, Mat/Med, Diárias/Taxas, OPME, Anexos, Críticas, Parecer Técnico, Parecer Operadora, Obs. Impressas, Obs. Não Impressas, Histórico, Logs). O Resumo mostra beneficiário, prestador solicitante/executante, especialidade e os riscos. No rodapé do modal: botão "Reprocessar" e "Parecer da Operadora".\n'+
      'DASHBOARD: KPIs clicáveis; o KPI "Etapa com gargalo" abre o "Ranking de Gargalos".\n';

    // Modo "Uso do sistema" — manual + dúvidas de usabilidade
    var CTX_SISTEMA=CTX_BASE+
      'MODO: USO DO SISTEMA. Você atua como o manual interativo do RegulaAI Saúde, tirando dúvidas sobre usabilidade, telas, fluxos de trabalho e funcionamento da plataforma. NÃO emita pareceres clínicos neste modo; se o usuário quiser análise técnica de uma guia, oriente-o a iniciar uma "Conversa técnica". '+
      MAPA_SISTEMA+
      'CONCEITOS: '+
      '1) ADERÊNCIA: calculada por critérios ponderados pelos pesos definidos em Parametrização → (fluxo) → "Pesos IA". O TETO é dinâmico — soma apenas os critérios aplicáveis àquela guia (ex.: DUT só entra se a guia tem procedimento com DUT obrigatória; Pacotes só se houver pacote vinculado). '+
      '2) REPROCESSAR: o botão "Reprocessar" (rodapé do modal da guia) reanalisa a guia considerando itens desmarcados pelo auditor, observações e parecer da operadora. '+
      '3) PERFIS: Administrador (tudo, incluindo Configurações → Usuários), Gestor (igual ao Administrador, exceto Usuários), Auditor (análise e parecer), Enfermeiro (triagem e complemento nos seus fluxos). '+
      'Exemplo de resposta correta a "onde ajusto os pesos da aderência": "Acesse Parametrização, selecione o fluxo desejado e abra a aba Pesos IA. Lá há um campo de peso (0 a 10) para cada critério (Documental, DUT, Procedimentos, etc.)." '+
      'Se não souber um caminho específico, diga que não está mapeado e oriente a consultar o Manual — nunca invente.';

    // Modo "Conversa técnica" — recebe os dados da guia como contexto
    function ctxTecnico(resumoGuia){
      return CTX_BASE+
        'MODO: CONVERSA TÉCNICA. Você atua como apoio técnico-assistencial ao auditor sobre uma guia específica: esclarece o parecer, discute indicação técnica dos serviços solicitados, contraindicações, alternativas terapêuticas possíveis, e pontos de atenção regulatórios. '+
        'IMPORTANTE: você é apoio à decisão — NÃO autoriza nem nega procedimentos. A decisão final é exclusiva da operadora/auditor. Baseie-se nos dados fornecidos da guia e em boas práticas clínicas/regulatórias; quando faltar informação, declare a limitação. '+
        'CONTEXTO INTEGRAL: o dossiê abaixo já reúne TODAS as abas da guia (dados, serviços, análise IA, críticas, observações impressas/internas, histórico, hist. de atendimento, carências, mensalidades, etapas e a lista de anexos). Você NÃO precisa pedir que o usuário cole textos ou envie arquivos — você já tem tudo. '+
        'ANEXOS: quando arquivos (laudos, exames, imagens/PDF) forem enviados junto na conversa, LEIA o conteúdo deles e cite achados relevantes (ex.: valores de exame, IMC, laudo do médico assistente, evidência de DUT), cruzando com os serviços solicitados e a indicação clínica. Se um anexo estiver listado mas sem conteúdo legível, aponte que o arquivo não pôde ser lido. '+
        'DADOS DA GUIA EM ANÁLISE:\n'+resumoGuia;
    }

    // Modo "Relatórios" — conversa sobre os dados analíticos do módulo Relatórios
    var MAPA_RELATORIOS=
      'ABAS DO MÓDULO RELATÓRIOS (nomes exatos):\n'+
      ' - Painel Executivo: KPIs (Guias recebidas, Custo total analisado, Custo de serviços negados, Alertas ativos), Distribuição por risco (clicável p/ filtrar), quebra Ambulatorial × Internação, e rankings de médicos, prestadores e OPME.\n'+
      ' - Beneficiários: consolidado por paciente (guias, ambulatorial/internação, procedimentos, OPME, negadas, custo, score de recorrência).\n'+
      ' - Médicos Solicitantes: perfil por médico (especialidade, guias, custo, taxa de aprovação, desvio vs. média da especialidade, concentração em prestador).\n'+
      ' - Prestadores: consolidado por prestador executante (guias, ambulatorial, internações, OPME, custo médio/total, score). KPI "Acima da média" lista quem supera o custo médio/guia.\n'+
      ' - Procedimentos: rankings (Mais solicitados / Mais caros) para Procedimentos, Diárias e Taxas, OPME e Mat/Med.\n'+
      ' - OPME: valor autorizado × cobrado por item, variação de preço; alerta quando ≥25% acima.\n'+
      ' - Custos: custo total, médio por guia, maior custo, custo de serviços negados; rankings por guia/beneficiário/procedimento.\n'+
      ' - Alertas Inteligentes: alertas gerados pelo motor (concentração, desvio de especialidade, recorrência, alto custo, inconsistência de OPME) com severidade e ação sugerida.\n'+
      ' - Comparativos: destaque de cada grupo contra a média do próprio grupo.\n'+
      'FILTROS: há filtro de Período e de Natureza (Ambulatorial/Internação e subtipos) que valem em todas as abas, exceto Comparativos. Todas as tabelas podem ser exportadas para Excel.\n';

    // Resumo REAL dos dados analíticos (calculado a partir das guias visíveis)
    function resumoRelatoriosTexto(){
      var gs=(typeof guiasVisiveis==='function'?guiasVisiveis():State.guias)||[];
      function custoG(g){
        var t=0;
        (g.procedimentos||[]).forEach(function(p){ t+= (p.valor||0) || (500 + (hashStr(p.cod)%6000)); });
        (g.matmed||[]).forEach(function(m){ var d=MOCK.matmedDetalhe?MOCK.matmedDetalhe(m):null; t+= m.opme? (d?d.totalAutorizado:8000) : (d?d.totalAutorizado:(400+hashStr(m.cod)%6000)); });
        (g.diariasTaxas||[]).forEach(function(d){ t+= 150 + hashStr(d.cod)%900; });
        if(g.uti) t+= 2400*(1+(g.diasAuditoria||1)%4);
        return Math.round(t);
      }
      function hashStr(s){ var h=0;s=''+s;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return Math.abs(h); }
      var totalCusto=0, negCusto=0, nNeg=0, risco={baixo:0,medio:0,alto:0,critico:0}, nat={Internação:0,Ambulatorial:0};
      var porMed={}, porPrest={}, porOpme={};
      gs.forEach(function(g){
        var c=custoG(g); totalCusto+=c;
        if(g.status==='Negada'){ negCusto+=c; nNeg++; }
        if(risco[g.risco]!=null) risco[g.risco]++;
        if(g.natureza==='Internação') nat['Internação']++; else nat['Ambulatorial']++;
        var med=g.solicitante||'—'; porMed[med]=porMed[med]||{guias:0,custo:0}; porMed[med].guias++; porMed[med].custo+=c;
        var pr=(g.prestadorExe&&g.prestadorExe.nome)||'—'; porPrest[pr]=porPrest[pr]||{guias:0,custo:0}; porPrest[pr].guias++; porPrest[pr].custo+=c;
        (g.matmed||[]).forEach(function(m){ if(!m.opme)return; porOpme[m.cod]=porOpme[m.cod]||{desc:m.desc,qtd:0}; porOpme[m.cod].qtd++; });
      });
      function top(obj,campo,n){ return Object.keys(obj).map(function(k){var o=obj[k];o._k=k;return o;}).sort(function(a,b){return (b[campo]||0)-(a[campo]||0);}).slice(0,n); }
      function moedaTxt(v){ return 'R$ '+(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
      function brData(iso){ if(!iso) return ''; var p=String(iso).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):iso; }
      // Filtros ativos no módulo Relatórios (período + natureza)
      var flt=(window.RELATORIOS&&window.RELATORIOS.getFiltros)?window.RELATORIOS.getFiltros():{periodo:{de:'',ate:''},natureza:'',risco:''};
      var L=[];
      // PERÍODO SELECIONADO (para a RAI conseguir informar o intervalo analisado)
      if(flt.periodo.de || flt.periodo.ate){
        L.push('PERÍODO SELECIONADO: de '+(brData(flt.periodo.de)||'início')+' até '+(brData(flt.periodo.ate)||'hoje')+' (filtro de Período do módulo).');
      } else {
        L.push('PERÍODO SELECIONADO: nenhum filtro de período aplicado — considerando TODAS as guias disponíveis.');
      }
      if(flt.natureza) L.push('FILTRO DE NATUREZA ATIVO: '+flt.natureza+'.');
      if(flt.risco) L.push('FILTRO DE RISCO ATIVO: '+flt.risco+'.');
      L.push('DADOS ANALÍTICOS ATUAIS (correspondem ao período/natureza acima):');
      L.push('Total de guias analisadas: '+gs.length);
      L.push('Custo total analisado: '+moedaTxt(totalCusto));
      L.push('Custo de serviços negados: '+moedaTxt(negCusto)+' ('+nNeg+' guia(s) negada(s))');
      L.push('Distribuição por risco: baixo '+risco.baixo+', médio '+risco.medio+', alto '+risco.alto+', crítico '+risco.critico+'.');
      L.push('Natureza: Ambulatorial '+nat['Ambulatorial']+', Internação '+nat['Internação']+'.');
      L.push('Top médicos por custo: '+top(porMed,'custo',5).map(function(o){return o._k+' ('+moedaTxt(o.custo)+', '+o.guias+' guia(s))';}).join('; '));
      L.push('Top prestadores por custo: '+top(porPrest,'custo',5).map(function(o){return o._k+' ('+moedaTxt(o.custo)+', '+o.guias+' guia(s))';}).join('; '));
      L.push('OPME mais solicitados: '+top(porOpme,'qtd',5).map(function(o){return o._k+' '+o.desc+' ('+o.qtd+'x)';}).join('; '));
      return L.join('\n');
    }

    function ctxRelatorios(){
      return CTX_BASE+
        'MODO: RELATÓRIOS. Você atua como analista de BI assistencial do RegulaAI, conversando sobre os dados dos relatórios (recorrências, custos, desvios, riscos, OPME, alertas). '+
        'Responda SEMPRE com base nos DADOS ANALÍTICOS fornecidos abaixo — cite números reais (valores, quantidades, nomes). Se o usuário pedir algo que não está nos dados, diga que aquele recorte não está disponível no resumo atual e sugira a aba/filtro do módulo Relatórios onde ele encontra. NÃO invente números. Valores em R$ são estimativas simuladas do sistema para demonstração. '+
        'PERÍODO: você RECEBE o período atualmente selecionado (linha "PERÍODO SELECIONADO" abaixo) e os dados já correspondem a ele. Quando perguntarem qual período está sendo analisado, INFORME o intervalo exato dessa linha. Os dados são atualizados em tempo real conforme o usuário altera o filtro de Período no módulo — a cada pergunta você recebe o recorte vigente. '+
        MAPA_RELATORIOS+
        resumoRelatoriosTexto();
    }

    // Estado do modo de atendimento
    var chatMode=null;        // null | 'sistema' | 'tecnica' | 'relatorios'
    var chatGuia=null;        // guia carregada no modo técnico
    var aguardandoGuia=false; // true quando esperamos o usuário digitar o nº da guia
    var anexosVisaoEnviados=false; // controla envio único dos anexos (imagem/PDF) por guia

    // System context conforme o modo atual
    function systemContextAtual(){
      if(chatMode==='tecnica' && chatGuia) return ctxTecnico(resumoGuiaTexto(chatGuia));
      if(chatMode==='relatorios') return ctxRelatorios();
      return CTX_SISTEMA;
    }

    // Monta um resumo textual da guia + análise da IA para o contexto técnico
    // DOSSIÊ COMPLETO da guia — reúne o conteúdo de TODAS as abas automaticamente (sem ação do usuário),
    // para que a IA tenha o contexto integral: dados, serviços, obs, críticas, carências, mensalidades,
    // histórico de atendimento e a lista de anexos (o conteúdo binário dos anexos é enviado à parte, via visão).
    function resumoGuiaTexto(g){
      var ia=g._cache||AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)});
      g._cache=ia;
      var b=g.beneficiario||{};
      var L=[];
      function sec(t){ L.push('\n=== '+t+' ==='); }

      // ── Identificação e beneficiário ──
      sec('IDENTIFICAÇÃO');
      L.push('Guia: '+g.numero+' | Status: '+g.status+' | Risco (motor): '+(g.risco||'—'));
      L.push('Tipo/Regime/Natureza: '+g.tipo+' / '+g.regime+' / '+g.natureza+(g.subInternacao?' ('+g.subInternacao+')':''));
      L.push('Fluxo: '+(g.fluxo&&g.fluxo.nome||'—')+' | Origem: '+(g.origem||'—')+' | Acomodação: '+(b.acomodacao||'—'));
      L.push('Beneficiário: '+(b.nome||'—')+(b.idade!=null?', '+b.idade+' anos':'')+' | Plano/Contrato: '+(b.plano||'—')+' / '+(b.contrato||'—'));
      try{ var cid=MOCK.cidGuia?MOCK.cidGuia(g):null; if(cid) L.push('CID: '+cid.codigo+' — '+cid.descricao); }catch(e){}
      L.push('Solicitante: '+(g.solicitante||'—')+' | Executante: '+((g.prestadorExe&&g.prestadorExe.nome)||'—')+' | Especialidade: '+(MOCK.especialidadeDaGuia?MOCK.especialidadeDaGuia(g):'—'));

      // ── Serviços solicitados ──
      sec('SERVIÇOS SOLICITADOS');
      var procs=(g.procedimentos||[]).map(function(p){return p.cod+' '+p.desc+(p.dut?' [DUT]':'');});
      L.push('Procedimentos: '+(procs.length?procs.join('; '):'nenhum'));
      if((g.pacotes||[]).length) L.push('Pacotes: '+g.pacotes.map(function(p){return p.cod+' '+p.desc;}).join('; '));
      if((g.matmed||[]).length) L.push('Mat/Med e OPME: '+g.matmed.map(function(p){return p.cod+' '+p.desc+(p.opme?' [OPME]':'');}).join('; '));
      if((g.diariasTaxas||[]).length) L.push('Diárias/Taxas: '+g.diariasTaxas.map(function(p){return p.cod+' '+p.desc;}).join('; '));

      // ── Análise técnica da IA ──
      sec('ANÁLISE TÉCNICA IA');
      L.push('Aderência: '+ia.aderencia+'% ('+ia.classificacao.label+') | Confiança: '+Math.round(ia.confianca)+'%');
      L.push('Parecer geral: '+ia.parecerGeral);
      if((ia.pendencias||[]).length) L.push('Pendências: '+ia.pendencias.join('; '));
      if((ia.alertas||[]).length) L.push('Alertas: '+ia.alertas.join('; '));
      L.push('Próxima ação sugerida: '+ia.proximaAcao);

      // ── Críticas da guia ──
      try{
        var crits=(typeof criticasDaGuia==='function')?criticasDaGuia(g,ia):[];
        if(crits.length){ sec('CRÍTICAS'); crits.forEach(function(c){ L.push('- ['+(c.codigo||'—')+'] '+(c.procedimento&&c.procedimento!=='—'?c.procedimento+': ':'')+c.critica); }); }
      }catch(e){}

      // ── Observações ──
      try{
        var oi=(typeof getObsImpressas==='function')?getObsImpressas(g):'';
        if(oi&&oi.trim()){ sec('OBSERVAÇÕES IMPRESSAS (visíveis ao prestador)'); L.push(oi.trim()); }
        var oni=(typeof getObsNaoImpressas==='function')?getObsNaoImpressas(g):[];
        if(oni&&oni.length){ sec('OBSERVAÇÕES NÃO IMPRESSAS (internas)'); oni.forEach(function(o){ L.push('- '+(o.data||'')+' '+(o.operador||'')+': '+(o.texto||'')); }); }
      }catch(e){}

      // ── Histórico clínico (gerado pela IA sobre os atendimentos correlatos) ──
      try{ if(typeof histGeradoIA==='function'){ sec('HISTÓRICO E TRATAMENTOS ANTERIORES'); L.push(histGeradoIA(g)); } }catch(e){}

      // ── Hist. de atendimento (últimos 24m, correlatos) — resumo ──
      try{
        var hist=(MOCK.historicoAtendimentos?MOCK.historicoAtendimentos(g):[]);
        if(hist.length){
          sec('HIST. ATENDIMENTO (resumo dos últimos registros)');
          L.push(hist.length+' atendimentos registrados. Últimos 8:');
          hist.slice(0,8).forEach(function(a){ L.push('- '+a.data+' | guia '+a.guia+' | '+a.cod+' '+a.procedimento+' | '+a.espec+' | CID '+a.cid+' | Solic '+a.qtdSolic+'/Aut '+a.qtdAut+' | '+a.faturamento); });
        }
      }catch(e){}

      // ── Carências ──
      try{
        var car=MOCK.carenciasGuia?MOCK.carenciasGuia(g):null;
        if(car){
          sec('CARÊNCIAS');
          L.push('Inclusão: '+car.inclusao+' | Permanência: '+car.permanencia+' dias.');
          if(car.cpt&&car.cpt.ativo) L.push('CPT ATIVA: '+car.cpt.texto+' — vencimento '+car.cpt.vencimento+' ('+car.cpt.cid+').');
          var pend=(car.itens||[]).filter(function(it){return !it.cumprida;});
          L.push(pend.length?('Carências a cumprir: '+pend.map(function(it){return it.nome+' (vence '+it.vencimento+')';}).join('; ')):'Todas as carências cumpridas.');
        }
      }catch(e){}

      // ── Mensalidades ──
      try{
        var fat=MOCK.mensalidadesGuia?MOCK.mensalidadesGuia(g):[];
        if(fat.length){
          sec('MENSALIDADES / FATURAS');
          var vencidas=fat.filter(function(f){return f.status==='vencida';});
          var aVencer=fat.filter(function(f){return f.status==='avencer';});
          L.push(fat.length+' faturas. Em aberto/vencidas: '+vencidas.length+' | A vencer: '+aVencer.length+'.');
          if(vencidas.length) L.push('VENCIDA EM ABERTO: '+vencidas.map(function(f){return 'venc '+f.vencimento+' comp '+f.competencia+' R$ '+f.valorCorrigido+' ('+f.diasAtraso+'d atraso)';}).join('; '));
        }
      }catch(e){}

      // ── Etapas do fluxo ──
      try{
        if((g.etapas||[]).length){
          sec('ETAPAS DO FLUXO');
          L.push(g.etapas.map(function(e){return e.nome+' ['+(e.status||'')+']';}).join(' → '));
        }
      }catch(e){}

      // ── Anexos (lista + indicação de conteúdo enviado via visão) ──
      try{
        var anx=g.anexosLista||[];
        sec('ANEXOS');
        if(!anx.length){ L.push('Nenhum anexo.'); }
        else {
          L.push(anx.length+' anexo(s):');
          anx.forEach(function(a){
            var temConteudo=!!a.dataURL;
            L.push('- '+a.nome+' | categoria: '+(a.categoria||'—')+' | '+(a.enviadoEm||'')+(temConteudo?' | CONTEÚDO ANEXADO (analise a imagem/documento correspondente enviado)':' | (conteúdo do arquivo não disponível para leitura)'));
            (a.anotacoes||[]).forEach(function(an){ L.push('   · anotação: '+(an.texto||an)); });
          });
          L.push('IMPORTANTE: quando houver "CONTEÚDO ANEXADO", os arquivos correspondentes foram enviados junto para você analisar visualmente. Cruze o que está escrito neles com os serviços solicitados e a indicação clínica.');
        }
      }catch(e){}

      return L.join('\n');
    }

    // Hash simples e rápido do conteúdo (para detectar anexo alterado e diferenciar arquivos de mesmo nome)
    function _hashConteudo(s){ var h=5381; s=''+s; for(var i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))|0; } return (h>>>0).toString(36); }

    // Coleta os anexos COM conteúdo (dataURL) de imagem/PDF para enviar à IA com visão.
    // Retorna [{id, ref, hash, nome, categoria, mime, dataURL, base64}]. Limita p/ não estourar o payload.
    // ref = rótulo ÚNICO e estável (id + hash curto) para que anexos de mesmo nome NUNCA se confundam.
    function anexosParaVisao(g){
      var out=[], idx=0;
      (g.anexosLista||[]).forEach(function(a){
        if(!a.dataURL || typeof a.dataURL!=='string') return;
        var m=a.dataURL.match(/^data:([^;]+);base64,(.*)$/);
        if(!m) return;
        var mime=m[1], base64=m[2];
        // Formatos que Claude, OpenAI e Gemini leem diretamente (imagem e PDF)
        if(!/^image\/(png|jpe?g|gif|webp)$/.test(mime) && mime!=='application/pdf') return;
        idx++;
        var hash=_hashConteudo(base64.slice(0,4096)+'|'+base64.length); // amostra + tamanho = suficiente e barato
        out.push({id:a.id||('anx'+idx), ref:'Anexo #'+idx+' ['+(a.id||('anx'+idx))+'·'+hash+']', hash:hash,
                  nome:a.nome, categoria:a.categoria||'', mime:mime, dataURL:a.dataURL, base64:base64});
      });
      return out.slice(0,6); // teto de segurança
    }

    // Extratos persistidos do que a IA leu de cada anexo (por guia). Estrutura por id:
    // { hash, nome, extrato(texto), pacienteDoc, confereNome:'sim'|'nao'|'?', ts }
    function _anxExtratosKey(g){ return 'regula_anx_extrato_'+g.numero; }
    function getAnxExtratos(g){ try{ return JSON.parse(localStorage.getItem(_anxExtratosKey(g))||'{}'); }catch(e){ return {}; } }
    function saveAnxExtratos(g, obj){ localStorage.setItem(_anxExtratosKey(g), JSON.stringify(obj)); }

    // Marca anexos como analisados pela IA (persistente por guia)
    function marcarAnexosAnalisados(g, anexos){
      var key='regula_anx_ia_'+g.numero;
      var set={}; try{ set=JSON.parse(localStorage.getItem(key)||'{}'); }catch(e){}
      var stamp=new Date().toISOString().slice(0,16).replace('T',' ');
      anexos.forEach(function(a){ if(a.id) set[a.id]=stamp; });
      localStorage.setItem(key, JSON.stringify(set));
      (g.anexosLista||[]).forEach(function(ax){ if(set[ax.id]){ ax.analisadoIA=set[ax.id]; } });
    }

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

    // Renderiza markdown básico das respostas da RAI (negrito, itálico, listas, quebras)
    // Escapa HTML primeiro (segurança) e depois aplica a formatação.
    function mdToHtml(t){
      var h=esc(t);
      h=h.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');      // **negrito**
      h=h.replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>'); // *itálico*
      h=h.replace(/`([^`]+)`/g,'<code>$1</code>');      // `código`
      // listas: linhas iniciadas por "- " ou "* " ou "1. "
      h=h.replace(/(^|<br>)\s*[-*]\s+/g,'$1• ');
      h=h.replace(/\n/g,'<br>');
      return h;
    }
    // isHtml=true → texto já é HTML confiável do sistema (não escapa nem aplica markdown).
    // isHtml=false/omitido → resposta da IA: escapa e aplica markdown básico.
    function addMsg(role,text,isHtml){
      var d=el('div',{class:'mchat-msg mchat-'+role});
      if(role==='bot'){
        var corpo=isHtml?text:mdToHtml(text);
        d.innerHTML=
          '<div class="mchat-avatar rai-msg-avatar">'+RAI_AVATAR+'</div>'+
          '<div class="mchat-bubble-wrap"><span class="mchat-sender">RAI</span><div class="mchat-bubble">'+corpo+'</div></div>';
      } else d.innerHTML='<div class="mchat-bubble">'+esc(text)+'</div>';
      chatLog.appendChild(d);
      chatLog.scrollTop=chatLog.scrollHeight;
    }

    // Mensagem de "sem chave" adaptada ao perfil (admin configura; demais contatam admin)
    function msgSemChave(){
      if(can('configIA')) return '⚠️ Nenhuma chave de API configurada. Acesse <b>Configurações → Assistente IA</b> para escolher o provedor (Gemini, Claude ou OpenAI) e inserir sua chave.';
      return '⚠️ O assistente ainda não está disponível. Solicite ao <b>Administrador</b> a configuração da chave de API.';
    }

    // Adiciona os botões de escolha de modo dentro do log
    function addModePicker(){
      var d=el('div',{class:'mchat-msg mchat-bot'});
      d.innerHTML=
        '<div class="mchat-avatar rai-msg-avatar">'+RAI_AVATAR+'</div>'+
        '<div class="mchat-bubble-wrap"><span class="mchat-sender">RAI</span>'+
          '<div class="mchat-bubble">Como posso te ajudar? Escolha uma opção:'+
            '<div class="mchat-modes">'+
              '<button class="mchat-mode-btn" data-mode="sistema">'+ico('book-open',14)+' Uso do sistema</button>'+
              '<button class="mchat-mode-btn" data-mode="tecnica">'+ico('stethoscope',14)+' Conversa técnica</button>'+
              '<button class="mchat-mode-btn" data-mode="relatorios">'+ico('bar-chart-3',14)+' Relatórios</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      chatLog.appendChild(d);
      chatLog.scrollTop=chatLog.scrollHeight;
      lcIcons();
      d.querySelectorAll('.mchat-mode-btn').forEach(function(b){
        b.onclick=function(){ escolherModo(b.getAttribute('data-mode')); };
      });
    }

    // Renderiza o log a partir do chatHistory atual
    function renderLog(){
      chatLog.innerHTML='';
      addMsg('bot',WELCOME);
      if(!getIaCfg().key){ addMsg('bot',msgSemChave(),true); return; }
      // Conversa nova e sem modo definido → mostra os botões de escolha
      if(!chatMode && chatHistory.length===0){ addModePicker(); return; }
      for(var i=0;i<chatHistory.length;i++){
        addMsg(chatHistory[i].role==='user'?'user':'bot', chatHistory[i].parts[0].text);
      }
    }

    // Define o modo escolhido e instrui o próximo passo
    function escolherModo(modo){
      // remove o picker (se existir)
      var pk=chatLog.querySelector('.mchat-modes'); if(pk){ var m=pk.closest('.mchat-msg'); if(m) m.remove(); }
      if(modo==='sistema'){
        chatMode='sistema'; aguardandoGuia=false; chatGuia=null;
        addMsg('bot','Perfeito! Estou no modo <b>Uso do sistema</b>. Pode perguntar sobre telas, fluxos, aderência, pontuações e qualquer dúvida de usabilidade. O que você deseja saber?',true);
        chatInp.focus();
      } else if(modo==='tecnica'){
        chatMode='tecnica'; chatGuia=null; aguardandoGuia=true;
        addMsg('bot','Modo <b>Conversa técnica</b> ativado. Para começar, informe o <b>número da guia</b> que deseja analisar.',true);
        chatInp.placeholder='Digite o número da guia...';
        chatInp.focus();
      } else if(modo==='relatorios'){
        chatMode='relatorios'; chatGuia=null; aguardandoGuia=false;
        addMsg('bot','Modo <b>Relatórios</b> ativado. Posso conversar sobre os dados dos relatórios — <b>Painel Executivo, Beneficiários, Médicos Solicitantes, Prestadores, Procedimentos, OPME, Custos, Alertas Inteligentes</b> e <b>Comparativos</b>. Pergunte, por exemplo: "quais os 3 médicos de maior custo?", "quanto foi economizado com serviços negados?" ou "há algum alerta crítico?". As análises consideram as guias do período.',true);
        chatInp.placeholder='Pergunte sobre os relatórios...';
        chatInp.focus();
      }
    }

    // Tenta carregar a guia pelo número informado
    function carregarGuiaTecnica(num){
      var alvo=String(num).replace(/\D/g,'');
      var g=State.guias.find(function(gg){ return String(gg.numero)===String(num).trim() || String(gg.numero).replace(/\D/g,'')===alvo; });
      if(!g){
        addMsg('bot','Não encontrei a guia <b>'+esc(num)+'</b>. Confira o número e tente novamente.',true);
        return;
      }
      chatGuia=g; aguardandoGuia=false; anexosVisaoEnviados=false;
      chatInp.placeholder='Digite sua mensagem...';
      var nAnx=anexosParaVisao(g).length;
      addMsg('bot','Guia <b>'+esc(g.numero)+'</b> carregada — '+esc(g.beneficiario&&g.beneficiario.nome||'')+' · '+esc(g.tipo)+' · aderência '+ (g._cache?g._cache.aderencia:AI.analisarGuiaComIA(g,{pesos:getFluxoPesos(g.fluxo&&g.fluxo.id)}).aderencia) +'%.<br>Analisando a guia'+(nAnx?' e lendo '+nAnx+' anexo(s)':'')+'… <i>Sou apoio à decisão — a palavra final é da operadora.</i>',true);
      chatInp.focus();
      // Análise técnica automática (dossiê completo + leitura dos anexos), sem esperar pergunta
      analiseAutomaticaGuia();
    }

    // Carrega uma sessão pelo id
    function loadSession(id){
      var s=findSession(id);
      if(!s) return;
      currentSessionId=id;
      chatHistory=s.history.slice();
      chatMode=s.mode||null;
      aguardandoGuia=false;
      chatGuia=null;
      if(s.guiaNum){ chatGuia=State.guias.find(function(gg){ return String(gg.numero)===String(s.guiaNum); })||null; }
      renderLog();
      closeHist();
    }

    // Inicia conversa nova (limpa log + reseta modo)
    function startNew(){
      newSession();
      chatMode=null; chatGuia=null; aguardandoGuia=false;
      chatInp.placeholder='Digite sua mensagem...';
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
    // ({role:'user'|'model', parts:[{text} | {media:{mime,base64}}]}). Suporta anexos (imagem/PDF) via visão.
    // Retorna o texto da resposta.
    async function callIA(cfg,history){
      var SYS=systemContextAtual();
      if(cfg.prov==='claude'){
        var msgs=history.map(function(m){
          var content=(m.parts||[]).map(function(p){
            if(p.media){
              if(p.media.mime==='application/pdf') return {type:'document',source:{type:'base64',media_type:'application/pdf',data:p.media.base64}};
              return {type:'image',source:{type:'base64',media_type:p.media.mime,data:p.media.base64}};
            }
            return {type:'text',text:p.text||''};
          });
          return {role:m.role==='model'?'assistant':'user',content:content};
        });
        var r=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'x-api-key':cfg.key,
            'anthropic-version':'2023-06-01',
            'anthropic-dangerous-direct-browser-access':'true'
          },
          body:JSON.stringify({model:cfg.model,max_tokens:2048,system:SYS,messages:msgs})
        });
        var d=await r.json();
        if(d.content&&d.content[0]&&d.content[0].text) return {ok:true,text:d.content[0].text};
        return {ok:false,text:(d.error&&d.error.message)||'Sem resposta do Claude.'};
      }
      if(cfg.prov==='openai'){
        var omsgs=[{role:'system',content:SYS}].concat(history.map(function(m){
          var content=(m.parts||[]).map(function(p){
            if(p.media && /^image\//.test(p.media.mime)) return {type:'image_url',image_url:{url:'data:'+p.media.mime+';base64,'+p.media.base64}};
            if(p.media && p.media.mime==='application/pdf') return {type:'file',file:{filename:p.media.nome||'anexo.pdf',file_data:'data:application/pdf;base64,'+p.media.base64}};
            if(p.media) return {type:'text',text:'[anexo '+p.media.mime+' não suportado]'};
            return {type:'text',text:p.text||''};
          });
          return {role:m.role==='model'?'assistant':'user',content:content};
        }));
        var ro=await fetch('https://api.openai.com/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
          body:JSON.stringify({model:cfg.model,max_tokens:2048,messages:omsgs})
        });
        var dao=await ro.json();
        if(dao.choices&&dao.choices[0]&&dao.choices[0].message) return {ok:true,text:dao.choices[0].message.content};
        return {ok:false,text:(dao.error&&dao.error.message)||'Sem resposta do OpenAI.'};
      }
      // Gemini (padrão)
      var gcontents=history.map(function(m){
        var parts=(m.parts||[]).map(function(p){
          if(p.media) return {inline_data:{mime_type:p.media.mime,data:p.media.base64}};
          return {text:p.text||''};
        });
        return {role:m.role, parts:parts};
      });
      var rg=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+cfg.model+':generateContent?key='+cfg.key,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({system_instruction:{parts:[{text:SYS}]},contents:gcontents})
      });
      var dg=await rg.json();
      if(dg.candidates&&dg.candidates[0]) return {ok:true,text:dg.candidates[0].content.parts[0].text};
      return {ok:false,text:(dg.error&&dg.error.message)||'Sem resposta. Tente novamente.'};
    }

    // Chamada única de IA com um "system" explícito (não depende do chat/contexto global).
    // Usada por geradores de documento (ex.: Parecer Técnico em PDF) que não são uma conversa.
    async function callIAComSistema(cfg, sistema, userText){
      if(cfg.prov==='claude'){
        var r=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:cfg.model,max_tokens:4096,system:sistema,messages:[{role:'user',content:[{type:'text',text:userText}]}]})
        });
        var d=await r.json();
        if(d.content&&d.content[0]&&d.content[0].text) return {ok:true,text:d.content[0].text};
        return {ok:false,text:(d.error&&d.error.message)||'Sem resposta do Claude.'};
      }
      if(cfg.prov==='openai'){
        var ro=await fetch('https://api.openai.com/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},
          body:JSON.stringify({model:cfg.model,max_tokens:4096,messages:[{role:'system',content:sistema},{role:'user',content:userText}]})
        });
        var dao=await ro.json();
        if(dao.choices&&dao.choices[0]&&dao.choices[0].message) return {ok:true,text:dao.choices[0].message.content};
        return {ok:false,text:(dao.error&&dao.error.message)||'Sem resposta do OpenAI.'};
      }
      var rg=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+cfg.model+':generateContent?key='+cfg.key,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({system_instruction:{parts:[{text:sistema}]},contents:[{role:'user',parts:[{text:userText}]}]})
      });
      var dg=await rg.json();
      if(dg.candidates&&dg.candidates[0]) return {ok:true,text:dg.candidates[0].content.parts[0].text};
      return {ok:false,text:(dg.error&&dg.error.message)||'Sem resposta. Tente novamente.'};
    }
    window.getIaCfg=getIaCfg;
    window.callIAComSistema=callIAComSistema;
    window.resumoGuiaTexto=resumoGuiaTexto;
    window.ctxTecnico=ctxTecnico;

    // Executa um turno de conversa: monta a mensagem (anexando o conteúdo dos anexos na 1ª vez), chama a IA e mostra a resposta.
    // baseText: texto da mensagem. mostrarUser: se true, ecoa a mensagem no chat. opts.reusarSalvos: reprocessar sem reler anexos já lidos.
    async function enviarTurno(baseText, mostrarUser, opts){
      opts=opts||{};
      var cfg=getIaCfg();
      if(!cfg.key){ addMsg('bot',msgSemChave(),true); return; }
      if(mostrarUser) addMsg('user',baseText);

      var typing=el('div',{class:'mchat-msg mchat-bot'});
      typing.innerHTML='<div class="mchat-avatar rai-msg-avatar">'+RAI_AVATAR+'</div><div class="mchat-bubble-wrap"><span class="mchat-sender">RAI</span><div class="mchat-bubble mchat-typing"><span></span><span></span><span></span></div></div>';
      chatLog.appendChild(typing);
      chatLog.scrollTop=chatLog.scrollHeight;

      var userParts=[{text:baseText}];
      var anexosEnviadosAgora=[];
      if(chatMode==='tecnica' && chatGuia && (!anexosVisaoEnviados || opts.reusarSalvos)){
        var anx=anexosParaVisao(chatGuia);
        var extratos=getAnxExtratos(chatGuia);
        var nomeGuia=(chatGuia.beneficiario&&chatGuia.beneficiario.nome)||'';
        var novos=[], jaLidos=[];
        anx.forEach(function(a){
          var ex=extratos[a.id];
          // considera "já lido" se há extrato salvo E o hash do conteúdo bate (arquivo não mudou)
          if(ex && ex.hash===a.hash) jaLidos.push({a:a, ex:ex}); else novos.push(a);
        });

        // Anexos JÁ lidos → injeta o extrato salvo (texto), sem reenviar a imagem/PDF
        if(jaLidos.length){
          userParts.push({text:'\n\n[LEITURAS JÁ REGISTRADAS de anexos (use como fato, não releia):]'});
          jaLidos.forEach(function(j){
            userParts.push({text:'\n• '+j.a.ref+' — arquivo "'+j.a.nome+'": '+(j.ex.extrato||'(sem extrato)')+
              ' | Paciente no documento: '+(j.ex.pacienteDoc||'?')+' | Confere com a guia: '+(j.ex.confereNome||'?')+'.'});
          });
        }

        // Anexos NOVOS ou ALTERADOS → envia o conteúdo para leitura visual
        if(novos.length){
          userParts.push({text:'\n\n[Seguem '+novos.length+' anexo(s) para LEITURA. Para CADA um: identifique o NOME DO PACIENTE no documento e confira se é o mesmo da guia ("'+nomeGuia+'"). Rotule cada anexo pelo seu identificador exato (ref) — anexos de mesmo nome são DIFERENTES e não devem ser confundidos:]'});
          novos.forEach(function(a){
            userParts.push({text:'\n'+a.ref+' — arquivo "'+a.nome+'"'+(a.categoria?' ('+a.categoria+')':'')+':'});
            userParts.push({media:{mime:a.mime,base64:a.base64,nome:a.nome}});
            anexosEnviadosAgora.push(a);
          });
          // pede o bloco estruturado de extratos ao final (será salvo e removido da exibição)
          userParts.push({text:'\n\nAo FINAL da sua resposta, e SOMENTE se houver anexos novos acima, inclua um bloco EXATAMENTE neste formato para persistência (não comente sobre ele):\n'+
            '<<<EXTRATOS_ANEXOS>>>\n'+
            novos.map(function(a){ return '{"id":"'+a.id+'","nome":"'+(a.nome||'').replace(/"/g,'')+'","hash":"'+a.hash+'","pacienteDoc":"<nome do paciente no documento ou vazio>","confereNome":"<sim|nao|?>","extrato":"<1-2 frases com o achado principal do documento>"}'; }).join('\n')+
            '\n<<<FIM>>>'});
        }
        anexosVisaoEnviados=true;
      }
      chatHistory.push({role:'user',parts:userParts});

      try{
        var res=await callIA(cfg,chatHistory);
        typing.remove();
        if(res.ok){
          // Extrai e persiste o bloco de EXTRATOS dos anexos (se houver); remove-o antes de exibir
          var textoExibir=res.text;
          if(chatGuia){
            var mBloco=res.text.match(/<<<EXTRATOS_ANEXOS>>>([\s\S]*?)<<<FIM>>>/);
            if(mBloco){
              var extSalvos=getAnxExtratos(chatGuia);
              mBloco[1].split(/\r?\n/).forEach(function(ln){
                ln=ln.trim(); if(!ln||ln[0]!=='{') return;
                try{ var o=JSON.parse(ln); if(o.id){ extSalvos[o.id]={hash:o.hash||'',nome:o.nome||'',pacienteDoc:o.pacienteDoc||'',confereNome:(o.confereNome||'?'),extrato:o.extrato||'',ts:new Date().toISOString().slice(0,16).replace('T',' ')}; } }catch(e){}
              });
              saveAnxExtratos(chatGuia, extSalvos);
              textoExibir=res.text.replace(/<<<EXTRATOS_ANEXOS>>>[\s\S]*?<<<FIM>>>/,'').trim();
            }
          }
          chatHistory.push({role:'model',parts:[{text:textoExibir}]});
          addMsg('bot',textoExibir);
          if(anexosEnviadosAgora.length && chatGuia){ marcarAnexosAnalisados(chatGuia, anexosEnviadosAgora); }
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

    // Dispara a ANÁLISE AUTOMÁTICA da guia assim que ela é carregada (sem esperar pergunta do usuário)
    async function analiseAutomaticaGuia(){
      var cfg=getIaCfg();
      if(!cfg.key){ addMsg('bot',msgSemChave(),true); return; }
      var nomeGuia=(chatGuia&&chatGuia.beneficiario&&chatGuia.beneficiario.nome)||'';
      var instrucao='Faça agora a ANÁLISE TÉCNICA INICIAL COMPLETA desta guia, de forma objetiva e estruturada, usando TODO o dossiê fornecido e LENDO os anexos enviados. Organize em tópicos curtos: '+
        '1) Resumo do caso (beneficiário, quadro/indicação clínica, serviços solicitados); '+
        '2) CONFERÊNCIA DOS ANEXOS: para CADA anexo, identifique o NOME DO PACIENTE no documento e confirme se é o mesmo da guia ("'+nomeGuia+'"). '+
        'Se algum documento estiver em nome DIFERENTE, DESTAQUE no topo como alerta crítico: "⚠️ DIVERGÊNCIA: documento em nome de <X>, guia de '+nomeGuia+' — possível anexo trocado." (não bloqueia, apenas alerta). Cite cada anexo pelo seu identificador (ref); anexos de mesmo nome são DIFERENTES; '+
        '3) Achados dos anexos (o que consta em cada laudo/exame e se sustentam a solicitação); '+
        '4) Aderência às diretrizes/DUT e pontos de atenção regulatórios; '+
        '5) Coerência entre indicação clínica × serviços × histórico × carências; '+
        '6) Alertas/pendências e recomendação de apoio (sem autorizar/negar). '+
        'Seja direto. Ao final, ofereça: "Posso detalhar algum ponto ou discutir alternativas.".';
      await enviarTurno(instrucao, false);
    }

    async function sendChat(){
      var q=chatInp.value.trim();
      if(!q) return;
      chatInp.value='';
      chatInp.style.height='auto';

      // Modo técnico aguardando o número da guia: trata a entrada como nº da guia
      if(aguardandoGuia){ addMsg('user',q); carregarGuiaTecnica(q); return; }
      // Sem modo escolhido ainda → pede para escolher
      if(!chatMode){ addMsg('user',q); addMsg('bot','Antes, escolha como posso ajudar:'); addModePicker(); return; }

      await enviarTurno(q, true);
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

    // Persiste o estado de abertura do chat (sobrevive à navegação e ao reload)
    function persistChatUI(){
      var st='closed';
      if(chatRoot.classList.contains('chat-open')){
        st=chatRoot.classList.contains('chat-minimized')?'minimized':'open';
      }
      localStorage.setItem('regula_chat_ui',st);
    }
    function chatMinimize(){
      closeHist();
      chatRoot.classList.add('chat-open');
      chatRoot.classList.add('chat-minimized');
      syncBodyState();
      persistChatUI();
    }
    function chatRestore(){
      chatRoot.classList.add('chat-open');
      chatRoot.classList.remove('chat-minimized');
      syncBodyState();
      persistChatUI();
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
      persistChatUI();
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

    // Restaura o estado salvo do chat (minimizado/aberto persiste entre telas e reloads)
    var savedUI=localStorage.getItem('regula_chat_ui');
    if(savedUI==='minimized'){
      chatRoot.classList.add('chat-open','chat-minimized');
      syncBodyState();
    } else if(savedUI==='open'){
      chatRoot.classList.add('chat-open');
      syncBodyState();
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
