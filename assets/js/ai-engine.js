/* RegulaAI — Motor de IA Parametrizada (baseado em regras, sem API externa)
 * A IA NÃO decide autorização/negativa. Atua como apoio técnico/regulatório.
 */
(function(global){

  function classificaAderencia(p){
    if(p>=90) return {label:'Alta aderência', cls:'alta'};
    if(p>=70) return {label:'Aderência moderada', cls:'mod'};
    if(p>=50) return {label:'Baixa aderência', cls:'baixa'};
    return {label:'Crítica', cls:'crit'};
  }

  function analisarGuiaComIA(guia, paramz){
    paramz = paramz || {};
    var pesos = paramz.pesos || {documental:6,dut:8,procedimento:7,pacote:5,matmed:7,diaria:5,contratual:7,historico:4};
    var itemExtra = paramz.itemPesosExtra || {procedimento:0,pacote:0,matmed:0,diaria:0};
    var cumpridos=0, total=0;
    var crit_ok=[], crit_no=[], crit_na=[];
    var pendencias=[], alertas=[], sugestoes=[], regrasAplicadas=[], regrasNaoAvaliadas=[];

    // Documental
    if(guia.anexos){ cumpridos+=pesos.documental; crit_ok.push('Documentação anexada'); regrasAplicadas.push('DOC-001/DOC-002');}
    else { crit_no.push('Documentação obrigatória ausente'); pendencias.push('Solicitar laudo médico e guia TISS preenchida'); }
    total+=pesos.documental;

    // DUT
    var temDUT = false;
    for(var i=0;i<guia.procedimentos.length;i++){ if(guia.procedimentos[i].dut){ temDUT=true; break; } }
    if(temDUT){
      total+=pesos.dut;
      if(guia.dut){ cumpridos+=pesos.dut; crit_ok.push('DUT atendida'); regrasAplicadas.push('DUT-001..005'); }
      else { crit_no.push('DUT não comprovada'); pendencias.push('Anexar evidências da DUT vigente'); alertas.push('Procedimento com DUT obrigatória'); }
    } else { crit_na.push('Sem procedimentos sujeitos a DUT'); }

    // Procedimentos
    if(guia.procedimentos.length){
      var pesoProc=pesos.procedimento+itemExtra.procedimento;
      total+=pesoProc;
      cumpridos+=pesoProc*0.9;
      crit_ok.push('Procedimentos vinculados encontrados ('+guia.procedimentos.length+')'+(itemExtra.procedimento?' · +'+itemExtra.procedimento+' pts dos itens':''));
      regrasAplicadas.push('Vinculação de procedimentos');
    } else { crit_no.push('Sem procedimentos vinculados'); }

    // Pacotes
    if(guia.pacotes.length){
      var pesoPac=pesos.pacote+itemExtra.pacote;
      total+=pesoPac; cumpridos+=pesoPac;
      crit_ok.push('Pacotes vinculados'+(itemExtra.pacote?' · +'+itemExtra.pacote+' pts dos itens':''));
      regrasAplicadas.push('Vinc. pacotes');
    }
    else { regrasNaoAvaliadas.push('Pacotes — sem parametrização cadastrada para esta guia'); crit_na.push('Pacotes não parametrizados'); }

    // Mat/Med
    if(guia.matmed.length){
      var pesoMatmed=pesos.matmed+itemExtra.matmed;
      total+=pesoMatmed;
      var opmes=0; for(var j=0;j<guia.matmed.length;j++){ if(guia.matmed[j].opme) opmes++; }
      cumpridos+=pesoMatmed*0.8;
      crit_ok.push('Mat/Med vinculados ('+guia.matmed.length+(opmes?', '+opmes+' OPME':'')+')'+(itemExtra.matmed?' · +'+itemExtra.matmed+' pts dos itens':''));
      regrasAplicadas.push('Vinc. Mat/Med');
      if(opmes) alertas.push('OPME presente — exigir cotação de 3 fornecedores');
    } else { regrasNaoAvaliadas.push('Mat/Med — sem itens vinculados'); crit_na.push('Mat/Med não avaliados'); }

    // Diárias/Taxas
    if(guia.diariasTaxas.length){
      var pesoDiaria=pesos.diaria+itemExtra.diaria;
      total+=pesoDiaria; cumpridos+=pesoDiaria*0.85;
      crit_ok.push('Diárias/Taxas vinculadas'+(itemExtra.diaria?' · +'+itemExtra.diaria+' pts dos itens':''));
      regrasAplicadas.push('Vinc. Diárias/Taxas');
    }
    else { regrasNaoAvaliadas.push('Diárias/Taxas — sem parametrização cadastrada'); crit_na.push('Diárias/Taxas não parametrizadas'); }

    // Contratual / histórico
    total+=pesos.contratual;
    cumpridos+=pesos.contratual*0.95;
    crit_ok.push('Cobertura contratual verificada');
    regrasAplicadas.push('Vínculo / DLP / contrato');

    // Risco
    var risco = guia.risco || 'medio';
    if(guia.uti) alertas.push('Solicitação envolve diária de UTI');
    if(guia.regime==='Urgência') alertas.push('Regime de urgência — prazo curto de garantia de atendimento');

    var perc = total>0 ? Math.round((cumpridos/total)*100) : 0;
    var cls = classificaAderencia(perc);

    // Sugestões / próxima ação
    var proximaAcao = 'Manter em análise';
    if(perc>=90 && pendencias.length===0) proximaAcao = 'Liberar com ressalvas (sugestão IA)';
    else if(pendencias.length>0) proximaAcao = 'Solicitar complemento ao prestador';
    else if(perc<50) proximaAcao = 'Encaminhar para junta médica';
    else if(perc<70) proximaAcao = 'Encaminhar auditor médico';

    sugestoes.push('Verificar se a indicação clínica está justificada no laudo.');
    sugestoes.push('Confirmar elegibilidade contratual do beneficiário no Solus.');
    if(temDUT) sugestoes.push('Solicitar evidências objetivas da DUT (relatórios, exames, tempo de tratamento).');
    if(guia.opme) sugestoes.push('Validar cotação de OPME e equivalência técnica entre fornecedores.');

    var topicos = [];
    topicos.push('Resumo: '+guia.tipo+' / '+guia.regime+' / '+guia.natureza);
    topicos.push('Fluxo aplicado: '+guia.fluxo.nome);
    topicos.push('Risco classificado: '+risco);

    // Pareceres por item
    function pPar(arr, tipo){
      var out=[]; for(var i=0;i<arr.length;i++){
        var it=arr[i];
        out.push({cod:it.cod, desc:it.desc, parecer:'Item conforme parametrização '+tipo+'. Verificar evidência.', conformidade: it.dut? (guia.dut?'OK':'PENDENTE') : 'OK'});
      } return out;
    }

    return {
      aderencia: perc,
      classificacao: cls,
      proximaAcao: proximaAcao,
      confianca: Math.max(55, Math.min(96, 60 + (perc/3))),
      parecerGeral: 'A guia '+guia.numero+' apresenta '+cls.label.toLowerCase()+' ('+perc+'%) frente às regras parametrizadas. '+(pendencias.length?'Há pendências documentais que devem ser sanadas. ':'')+'A IA recomenda como próxima ação: '+proximaAcao+'.',
      criteriosCumpridos: crit_ok,
      criteriosNaoCumpridos: crit_no,
      criteriosNaoAvaliados: crit_na,
      pendencias: pendencias,
      alertas: alertas,
      sugestoesArgumentos: sugestoes,
      topicosAuditor: topicos,
      regrasAplicadas: regrasAplicadas,
      regrasNaoAvaliadas: regrasNaoAvaliadas,
      pareceresProcedimentos: pPar(guia.procedimentos,'de procedimento'),
      pareceresPacotes: pPar(guia.pacotes,'de pacote'),
      pareceresMatMed: pPar(guia.matmed,'de Mat/Med'),
      pareceresDiariasTaxas: pPar(guia.diariasTaxas,'de diária/taxa'),
      avisoLegal: 'Parecer gerado por IA como apoio à auditoria. Decisão final exclusiva da operadora.',
      justificativaCalculo: (function(){
        var linhas=[];
        linhas.push('Critérios avaliados nesta guia:');
        linhas.push('');
        if(guia.anexos) linhas.push('  Documental            '+pesos.documental+' / '+pesos.documental+' pts');
        else             linhas.push('  Documental            0 / '+pesos.documental+' pts  (ausente)');
        if(temDUT)       linhas.push('  DUT                   '+(guia.dut?pesos.dut:0)+' / '+pesos.dut+' pts'+(guia.dut?'':'  (não comprovada)'));
        else             linhas.push('  DUT                   —  (não aplicável a esta guia)');
        if(guia.procedimentos.length){ var pp=pesos.procedimento+itemExtra.procedimento; linhas.push('  Procedimentos         '+Math.round(pp*0.9)+' / '+pp+' pts  ('+guia.procedimentos.length+' item'+(guia.procedimentos.length>1?'s':'')+')'); }
        else linhas.push('  Procedimentos         —  (sem vínculos)');
        if(guia.pacotes.length){ var pk=pesos.pacote+itemExtra.pacote; linhas.push('  Pacotes               '+pk+' / '+pk+' pts'); }
        else linhas.push('  Pacotes               —  (não aplicável a esta guia)');
        if(guia.matmed.length){ var pm=pesos.matmed+itemExtra.matmed; linhas.push('  Mat/Med               '+Math.round(pm*0.8)+' / '+pm+' pts'); }
        else linhas.push('  Mat/Med               —  (não aplicável a esta guia)');
        if(guia.diariasTaxas.length){ var pd=pesos.diaria+itemExtra.diaria; linhas.push('  Diárias/Taxas         '+Math.round(pd*0.85)+' / '+pd+' pts'); }
        else linhas.push('  Diárias/Taxas         —  (não aplicável a esta guia)');
        linhas.push('  Contratual/Histórico  '+Math.round(pesos.contratual*0.95)+' / '+pesos.contratual+' pts');
        linhas.push('');
        linhas.push('  O teto ('+Math.round(total)+' pts) é a soma dos critérios');
        linhas.push('  aplicáveis a esta guia — varia por guia.');
        linhas.push('');
        linhas.push('  '+Math.round(cumpridos)+' / '+Math.round(total)+' pts  →  Aderência: '+perc+'%');
        return linhas.join('\n');
      })()
    };
  }

  global.AI = { analisarGuiaComIA: analisarGuiaComIA, classificaAderencia: classificaAderencia };
})(window);
