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
  function kpiCard(titulo, valor, sub, cor){
    return '<div class="rel-kpi">'+
      '<div class="rel-kpi-v" style="color:'+(cor||'var(--g-700)')+'">'+valor+'</div>'+
      '<div class="rel-kpi-t">'+esc(titulo)+'</div>'+
      (sub?'<div class="rel-kpi-s">'+sub+'</div>':'')+
    '</div>';
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
    if(id==='executivo'){
      return '<div class="rel-section">'+
        '<div class="rel-kpi-grid">'+
          kpiCard('Total de guias analisadas','—','no período','var(--g-700)')+
          kpiCard('Custo total analisado','R$ —','simulado','#0f766e')+
          kpiCard('Custo potencialmente evitável','R$ —','economia','#b45309')+
          kpiCard('Alertas ativos','—','caixa de entrada','#dc2626')+
        '</div>'+
        emBreve('Painel Executivo — visão da diretoria',
          'Aqui ficarão os KPIs consolidados, distribuição por risco, rankings (médicos, prestadores, OPME), custo total, economia potencial e os gráficos de evolução mensal.',
          ['KPIs por risco (baixo/médio/alto/crítico)','Custo total e custo evitável','Ranking de médicos por volume','Ranking de prestadores por custo','Ranking de OPME por valor','Distribuição por especialidade e por tipo de inconsistência'])+
      '</div>';
    }
    if(id==='beneficiarios') return emBreve('Análise por Beneficiário','Visão individual e consolidada por beneficiário.',['Total de guias, procedimentos e OPME','Custo acumulado e custo médio por guia','Negativas, reanálises, internações, exames repetidos','Nº de médicos e prestadores diferentes','Score de risco do beneficiário']);
    if(id==='medicos') return emBreve('Análise por Médico Solicitante','Ranking e perfil de comportamento dos solicitantes, comparados aos pares da mesma especialidade.',['Volume, custo, taxa de aprovação/negativa','Procedimentos e OPME mais solicitados','Concentração em prestador/fornecedor','Score de risco do médico','Alertas de desvio estatístico vs. especialidade']);
    if(id==='prestadores') return emBreve('Análise por Prestador','Visão consolidada por hospital, clínica e laboratório.',['Custo total e médio (por guia, procedimento, internação)','Tempo médio de internação e reinternações','Concentração de OPME e de médicos','Alertas de custo/glosa/uso incomum de diárias']);
    if(id==='procedimentos') return emBreve('Análise por Procedimento','Mineração estatística dos procedimentos solicitados.',['Mais solicitados, mais caros, mais negados/glosados','Crescimento e associação a OPME','Cortes por especialidade, CID, faixa etária, sexo','Alertas de incompatibilidade (CID/idade/sexo) e repetição']);
    if(id==='opme') return emBreve('Análise por OPME','Painel exclusivo de OPME.',['Mais solicitados, mais caros, por fornecedor/fabricante','Valor médio autorizado x cobrado, variação de preço','Score de risco da OPME','Alertas: preço acima do percentil, repetição, divergências']);
    if(id==='custos') return emBreve('Custos — análises financeiras','Maior custo, maior economia, maior glosa, maior desperdício.',['Custo total e evitável','Ranking por custo (beneficiário/médico/prestador/procedimento/OPME)','Glosas e desperdícios','Evolução mensal de custo assistencial']);
    if(id==='alertas') return renderAlertas();
    if(id==='tendencias') return emBreve('Tendências','Crescimento, redução, sazonalidade e previsão.',['Evolução mensal e tendência futura','Sazonalidade por procedimento/especialidade','Projeções e pontos de inflexão']);
    if(id==='comparativos') return emBreve('Comparativos Estatísticos','Comparações lado a lado.',['Hospital A x Hospital B','Médico x média da especialidade','OPME x referência de mercado','Procedimento x equivalentes']);
    if(id==='exportacoes') return emBreve('Exportações','Geração e download de relatórios.',['Exportar para Excel/CSV/PDF','Relatórios agendados','Seleção de período e filtros']);
    return '';
  }

  // ── Alertas Inteligentes — central (tabela de exemplo) ────────────
  var ALERTA_EXEMPLOS = [
    {id:'AL-0001', data:'30/06/2026', guia:'101848029', benef:'ANDRESSA G. F. SOARES', medico:'DIOGO SOARES DE MENDES', prestador:'CLÍNICA IMAGEM TOTAL', tipo:'concentracao', sev:'alta', score:92, desc:'Médico concentra 78% das solicitações de OPME ortopédico em um único prestador.', valor:'R$ 42.800', status:'novo', acao:'Encaminhar para auditoria médica'},
    {id:'AL-0002', data:'30/06/2026', guia:'304529173', benef:'BEATRIZ S. L. FERREIRA', medico:'FERNANDA OLIVEIRA COSTA', prestador:'ONCOCLÍNICA', tipo:'alto_custo', sev:'critica', score:97, desc:'Imunobiológico de alto custo solicitado 3x para o mesmo beneficiário em 30 dias.', valor:'R$ 96.400', status:'em_analise', acao:'Revisão por junta médica'},
    {id:'AL-0003', data:'29/06/2026', guia:'607183924', benef:'FABIO T. ALMEIDA JR', medico:'MARCOS VINICIUS TELES', prestador:'HOSPITAL CARDIO', tipo:'inconsistencia_opme', sev:'media', score:71, desc:'Stent farmacológico com preço 38% acima do percentil 95 da base comparativa.', valor:'R$ 18.200', status:'novo', acao:'Solicitar cotação de 3 fornecedores'},
    {id:'AL-0004', data:'29/06/2026', guia:'213956874', benef:'ANDRESSA G. F. SOARES', medico:'RAFAEL MONTEIRO GOMES', prestador:'LAB CENTRAL', tipo:'recorrencia', sev:'media', score:68, desc:'Exame de imagem repetido para o mesmo beneficiário em intervalo de 12 dias.', valor:'R$ 1.450', status:'confirmado', acao:'Verificar justificativa clínica'},
    {id:'AL-0005', data:'28/06/2026', guia:'314862795', benef:'DIEGO F. S. MENDONCA', medico:'THIAGO NASCIMENTO CRUZ', prestador:'HOSPITAL SANTA FÉ', tipo:'negativa_recorrente', sev:'baixa', score:54, desc:'Procedimento com 4 negativas por DUT não atendida no último trimestre.', valor:'R$ 9.300', status:'descartado', acao:'Monitorar reincidência'}
  ];
  var SEV_CLS = {critica:'rel-sev-critica', alta:'rel-sev-alta', media:'rel-sev-media', baixa:'rel-sev-baixa'};
  var SEV_LBL = {critica:'Crítica', alta:'Alta', media:'Média', baixa:'Baixa'};
  var TIPO_LBL = {recorrencia:'Recorrência', alto_custo:'Alto custo', concentracao:'Concentração', incompatibilidade:'Incompatibilidade técnica', divergencia:'Divergência documental', fraude:'Possível fraude', desperdicio:'Desperdício', glosa_recorrente:'Glosa recorrente', negativa_recorrente:'Negativa recorrente', inconsistencia_opme:'Inconsistência de OPME', risco_regulatorio:'Risco regulatório'};
  var STATUS_LBL = {novo:'Novo', em_analise:'Em análise', confirmado:'Confirmado', descartado:'Descartado', resolvido:'Resolvido', auditoria:'Enc. auditoria', compliance:'Enc. compliance'};
  var STATUS_CLS = {novo:'badge info', em_analise:'badge', confirmado:'badge warn', descartado:'badge muted', resolvido:'badge', auditoria:'badge warn', compliance:'badge danger'};

  function renderAlertas(){
    var linhas = ALERTA_EXEMPLOS.map(function(a){
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

    var resumo = '<div class="rel-kpi-grid" style="margin-bottom:16px">'+
      kpiCard('Alertas ativos', ALERTA_EXEMPLOS.filter(function(a){return a.status==='novo'||a.status==='em_analise';}).length, 'pendentes', '#dc2626')+
      kpiCard('Críticos', ALERTA_EXEMPLOS.filter(function(a){return a.sev==='critica';}).length, 'severidade máxima', '#b91c1c')+
      kpiCard('Valor envolvido', 'R$ 168.150', 'soma estimada', '#b45309')+
      kpiCard('Confirmados', ALERTA_EXEMPLOS.filter(function(a){return a.status==='confirmado';}).length, 'validados', '#15803d')+
    '</div>';

    return '<div class="rel-section">'+
      resumo+
      '<div class="rel-note">'+ico('info',13)+' <span>Central de alertas — caixa de entrada da auditoria. <b>Dados de exemplo</b> nesta versão; o motor de detecção automática (recorrências, concentração, alto custo, divergências) será conectado na próxima fase. Clique numa linha para ver a explicação da IA.</span></div>'+
      '<div class="table-wrap"><table class="cfg-table rel-alert-table"><thead><tr>'+
        '<th>ID</th><th>Data</th><th>Guia</th><th>Médico</th><th>Severidade</th><th>Tipo</th><th>Score</th><th>Valor</th><th>Status</th>'+
      '</tr></thead><tbody>'+linhas+'</tbody></table></div>'+
    '</div>';
  }

  // ── View principal do módulo ──────────────────────────────────────
  function view(ctx){
    global.__RELCTX = ctx;
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

    setTimeout(function(){
      tabBar.querySelectorAll('.rel-tab').forEach(function(b){
        b.onclick=function(){
          _state.tab=b.getAttribute('data-rtab');
          tabBar.querySelectorAll('.rel-tab').forEach(function(x){x.classList.toggle('active',x===b);});
          content.innerHTML=renderTab(_state.tab);
          if(ctx.lcIcons) ctx.lcIcons();
          bindAlertas(content);
          // rola a aba ativa para a vista (mobile)
          if(window.innerWidth<=640) b.scrollIntoView({inline:'center',block:'nearest'});
        };
      });
      bindAlertas(content);
      if(ctx.lcIcons) ctx.lcIcons();
    },0);

    return wrap;
  }

  // Expande/recolhe a explicação do alerta ao clicar na linha
  function bindAlertas(container){
    container.querySelectorAll('.rel-alert-row').forEach(function(row){
      row.onclick=function(){
        var id=row.getAttribute('data-alert');
        var det=container.querySelector('.rel-alert-detail[data-detail="'+id+'"]');
        if(det) det.style.display = det.style.display==='none'?'table-row':'none';
      };
    });
  }

  global.RELATORIOS = { view: view };

})(window);
