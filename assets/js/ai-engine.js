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
    var pesos = paramz.pesos || {documental:3, dut:4, procedimento:3, pacote:2, matmed:3, diaria:2, contratual:3, historico:2};
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
      total+=pesos.procedimento;
      cumpridos+=pesos.procedimento*0.9;
      crit_ok.push('Procedimentos vinculados encontrados ('+guia.procedimentos.length+')');
      regrasAplicadas.push('Vinculação de procedimentos');
    } else { crit_no.push('Sem procedimentos vinculados'); }

    // Pacotes
    if(guia.pacotes.length){ total+=pesos.pacote; cumpridos+=pesos.pacote; crit_ok.push('Pacotes vinculados'); regrasAplicadas.push('Vinc. pacotes'); }
    else { regrasNaoAvaliadas.push('Pacotes — sem parametrização cadastrada para esta guia'); crit_na.push('Pacotes não parametrizados'); }

    // Mat/Med
    if(guia.matmed.length){
      total+=pesos.matmed;
      var opmes=0; for(var j=0;j<guia.matmed.length;j++){ if(guia.matmed[j].opme) opmes++; }
      cumpridos+=pesos.matmed*0.8;
      crit_ok.push('Mat/Med vinculados ('+guia.matmed.length+(opmes?', '+opmes+' OPME':'')+')');
      regrasAplicadas.push('Vinc. Mat/Med');
      if(opmes) alertas.push('OPME presente — exigir cotação de 3 fornecedores');
    } else { regrasNaoAvaliadas.push('Mat/Med — sem itens vinculados'); crit_na.push('Mat/Med não avaliados'); }

    // Diárias/Taxas
    if(guia.diariasTaxas.length){ total+=pesos.diaria; cumpridos+=pesos.diaria*0.85; crit_ok.push('Diárias/Taxas vinculadas'); regrasAplicadas.push('Vinc. Diárias/Taxas'); }
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
      justificativaCalculo: 'aderencia = '+cumpridos.toFixed(1)+' / '+total.toFixed(1)+' × 100 = '+perc+'%'
    };
  }

  global.AI = { analisarGuiaComIA: analisarGuiaComIA, classificaAderencia: classificaAderencia };
})(window);
