/* RegulaAI — Dados Mockados
   Para integração real com Solus: substituir por chamadas em solus-adapter.js. */
(function(global){
  var FLUXOS = [
    { id:'F1', nome:'AUDITORIA URGÊNCIA/EMERGÊNCIA', regime:'Urgência',
      etapas:['ANÁLISE ADM - REGULAÇÃO URG','AUDITORIA PRÉVIA','SOLICITAR CORREÇÃO AO PRESTADOR','ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES','AUDITORIA EXTERNA - MÉDICO','AUDITORIA PRÉVIA (DOCUMENTAÇÃO)','AUDITORIA ESPECIALIZADA (ANALÍTICA/BUCO/NEURO)','AUDITORIA MÉDICA URG/PA','COTAÇÃO OPME','FINALIZAR GUIA','ENCERRAR PROCESSO','PROCESSO ENCERRADO'],
      vinc:['proc','pac','matmed','dt'] },
    { id:'F2', nome:'ALTA COMPLEXIDADE ELETIVO', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','SOLICITAR CONTRATO/DLP/VÍNCULO','AUDITORIA PRÉVIA','SOLICITAR CORREÇÃO AO PRESTADOR','ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES','PATOLOGIAS ANTERIORES AO PLANO','ABORDAGEM PRESENCIAL FILIAL','AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA','AUDITORIA PRÉVIA (DOCUMENTAÇÃO)','AUDITORIA EXTERNA - MÉDICO','AUDITORIA PRÉVIA (DOCUMENTAÇÃO MÉDICO)','AUDITORIA EXTERNA - CONTATO MÉDICO ASSISTENTE','JUNTA MÉDICA','GARANTIA DE ATENDIMENTO','COTAÇÃO OPME','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac','matmed'] },
    { id:'F3', nome:'AMBULATORIAL IMAGENS ELETIVO', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','SOLICITAR CONTRATO/DLP/VÍNCULO','AUDITORIA PRÉVIA','AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA','AUDITORIA PRÉVIA (DOCUMENTAÇÃO)','AUDITORIA EXTERNA - MÉDICO','CONTATO MÉDICO ASSIST. PELA OPERADORA','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac','matmed'] },
    { id:'F4', nome:'BAIXA/MÉDIA COMPLEXIDADE ELETIVO', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','AUDITORIA PRÉVIA','SOLICITAR CORREÇÃO AO PRESTADOR','AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA','AUDITORIA EXTERNA - MÉDICO','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac'] },
    { id:'F5', nome:'BUCO/CARDIOLOGIA/NEURO CABEÇA ELETIVA', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','AUDITORIA PRÉVIA','AUDITORIA ESPECIALIZADA (ANALÍTICA/BUCO/NEURO)','AUDITORIA EXTERNA - MÉDICO','JUNTA MÉDICA','COTAÇÃO OPME','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac'] },
    { id:'F6', nome:'CIRURGIA BARIÁTRICA ELETIVA', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','SOLICITAR CONTRATO/DLP/VÍNCULO','AUDITORIA PRÉVIA','ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES','AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA','AUDITORIA EXTERNA - MÉDICO','JUNTA MÉDICA','GARANTIA DE ATENDIMENTO','COTAÇÃO OPME','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc'] },
    { id:'F7', nome:'EXAMES BAIXA/MÉDIA COMPLEXIDADE', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','AUDITORIA PRÉVIA','AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA','AUDITORIA EXTERNA - MÉDICO','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac'] },
    { id:'F8', nome:'ONCOLOGIA/IMUNOBIOLÓGICO AMBULATORIAL', regime:'Eletivo',
      etapas:['SETOR ADMINISTRATIVO','SOLICITAR CONTRATO/DLP/VÍNCULO','AUDITORIA PRÉVIA','AUDITORIA EXTERNA - MÉDICO','JUNTA MÉDICA','GARANTIA DE ATENDIMENTO','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc','pac','matmed'] },
    { id:'F9', nome:'GUIAS — SEM PARAMETRIZAÇÃO', regime:'Eletivo',
      etapas:['AUDITORIA PRÉVIA','SOLICITAR CORREÇÃO AO PRESTADOR','PARAMETRIZAÇÃO','FINALIZAR GUIA','PROCESSO ENCERRADO'],
      vinc:['proc'] }
  ];

  // Comportamento padrão da IA por etapa
  var IA_POR_ETAPA = {
    'ANÁLISE ADM - REGULAÇÃO URG':'apoio','SETOR ADMINISTRATIVO':'apoio',
    'SOLICITAR CONTRATO/DLP/VÍNCULO':'apoio','AUDITORIA PRÉVIA':'auto',
    'SOLICITAR CORREÇÃO AO PRESTADOR':'apoio','ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES':'auto',
    'PATOLOGIAS ANTERIORES AO PLANO':'apoio','ABORDAGEM PRESENCIAL FILIAL':'apoio',
    'AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA':'apoio','AUDITORIA EXTERNA - MÉDICO':'apoio',
    'AUDITORIA PRÉVIA (DOCUMENTAÇÃO)':'auto','AUDITORIA PRÉVIA (DOCUMENTAÇÃO MÉDICO)':'auto',
    'AUDITORIA EXTERNA - CONTATO MÉDICO ASSISTENTE':'apoio','CONTATO MÉDICO ASSIST. PELA OPERADORA':'apoio',
    'JUNTA MÉDICA':'apoio','ABERTURA DE JUNTA':'apoio','GARANTIA DE ATENDIMENTO':'auto',
    'COTAÇÃO OPME':'apoio','FINALIZAR GUIA':'auto','ENCERRAR PROCESSO':'auto','PROCESSO ENCERRADO':'auto',
    'AUDITORIA ESPECIALIZADA (ANALÍTICA/BUCO/NEURO)':'apoio','AUDITORIA MÉDICA URG/PA':'apoio',
    'PARAMETRIZAÇÃO':'nao'
  };

  var PROCEDIMENTOS = [
    {cod:'10101012',desc:'Consulta médica em consultório',peso:1,obrig:true,ia:'auto'},
    {cod:'40901114',desc:'Ressonância magnética de crânio',peso:3,obrig:true,ia:'auto',dut:true},
    {cod:'40901327',desc:'Tomografia computadorizada de tórax',peso:3,obrig:true,ia:'auto'},
    {cod:'30912018',desc:'Gastroplastia (cirurgia bariátrica)',peso:5,obrig:true,ia:'auto',dut:true},
    {cod:'31309062',desc:'Angioplastia coronariana',peso:4,obrig:true,ia:'auto'},
    {cod:'30602131',desc:'Cirurgia de catarata',peso:2,obrig:true,ia:'auto'},
    {cod:'41001214',desc:'Endoscopia digestiva alta',peso:2,obrig:true,ia:'auto'},
    {cod:'41001230',desc:'Colonoscopia',peso:2,obrig:true,ia:'auto'},
    {cod:'40808012',desc:'Holter 24h',peso:1,obrig:false,ia:'auto'},
    {cod:'40803045',desc:'Ecocardiograma',peso:2,obrig:true,ia:'auto'},
    {cod:'31602050',desc:'Artroplastia total de joelho',peso:5,obrig:true,ia:'auto',dut:true},
    {cod:'31602069',desc:'Artroplastia total de quadril',peso:5,obrig:true,ia:'auto',dut:true},
    {cod:'10103035',desc:'Diária de UTI adulto',peso:4,obrig:true,ia:'auto'},
    {cod:'10103019',desc:'Diária de enfermaria',peso:2,obrig:true,ia:'auto'},
    {cod:'10103027',desc:'Diária de apartamento',peso:2,obrig:true,ia:'auto'},
    {cod:'30729050',desc:'Quimioterapia ambulatorial',peso:4,obrig:true,ia:'auto',dut:true},
    {cod:'30730066',desc:'Imunobiológico de alto custo',peso:5,obrig:true,ia:'auto',dut:true},
    {cod:'21010059',desc:'Cirurgia de coluna - artrodese',peso:5,obrig:true,ia:'auto',dut:true},
    {cod:'40601161',desc:'Hemograma completo',peso:1,obrig:false,ia:'auto'},
    {cod:'40601099',desc:'Glicemia de jejum',peso:1,obrig:false,ia:'auto'}
  ];

  var PACOTES = [
    {cod:'PKT-BAR-01',desc:'Pacote bariátrica completo',peso:3,obrig:true},
    {cod:'PKT-CAT-01',desc:'Pacote catarata - facectomia',peso:2,obrig:true},
    {cod:'PKT-CARD-01',desc:'Pacote cateterismo cardíaco',peso:3,obrig:true},
    {cod:'PKT-ORT-01',desc:'Pacote artroplastia joelho',peso:3,obrig:true},
    {cod:'PKT-ORT-02',desc:'Pacote artroplastia quadril',peso:3,obrig:true},
    {cod:'PKT-COL-01',desc:'Pacote artrodese coluna',peso:4,obrig:true},
    {cod:'PKT-PARTO-01',desc:'Pacote parto normal',peso:2,obrig:true},
    {cod:'PKT-PARTO-02',desc:'Pacote parto cesárea',peso:2,obrig:true},
    {cod:'PKT-ONC-01',desc:'Pacote quimioterapia sessão',peso:3,obrig:true},
    {cod:'PKT-NEURO-01',desc:'Pacote craniotomia',peso:5,obrig:true}
  ];

  var MATMED = [
    {cod:'MM-001',desc:'OPME - Prótese de joelho cimentada',peso:4,opme:true},
    {cod:'MM-002',desc:'OPME - Prótese de quadril não cimentada',peso:4,opme:true},
    {cod:'MM-003',desc:'OPME - Stent coronariano farmacológico',peso:4,opme:true},
    {cod:'MM-004',desc:'OPME - Placas e parafusos de coluna',peso:5,opme:true},
    {cod:'MM-005',desc:'Medicação alto custo - Pembrolizumabe',peso:5,obrig:true},
    {cod:'MM-006',desc:'Medicação alto custo - Trastuzumabe',peso:5,obrig:true},
    {cod:'MM-007',desc:'Imunobiológico - Adalimumabe',peso:4,obrig:true},
    {cod:'MM-008',desc:'Antibiótico - Meropenem 1g',peso:2,obrig:false},
    {cod:'MM-009',desc:'Sedativo - Propofol 200mg',peso:1,obrig:false},
    {cod:'MM-010',desc:'Contraste iodado - Iohexol',peso:1,obrig:false},
    {cod:'MM-011',desc:'Soro fisiológico 0,9% 500ml',peso:1,obrig:false},
    {cod:'MM-012',desc:'Insulina NPH',peso:1,obrig:false},
    {cod:'MM-013',desc:'OPME - Marcapasso definitivo',peso:5,opme:true},
    {cod:'MM-014',desc:'OPME - Cateter de hemodiálise',peso:3,opme:true},
    {cod:'MM-015',desc:'Curativo especial alginato',peso:1,obrig:false}
  ];

  var DIARIAS_TAXAS = [
    {cod:'DT-001',desc:'Diária UTI Adulto',peso:4,obrig:true},
    {cod:'DT-002',desc:'Diária UTI Pediátrica',peso:4,obrig:true},
    {cod:'DT-003',desc:'Diária Enfermaria',peso:2,obrig:true},
    {cod:'DT-004',desc:'Diária Apartamento',peso:2,obrig:true},
    {cod:'DT-005',desc:'Taxa de sala cirúrgica',peso:3,obrig:true},
    {cod:'DT-006',desc:'Taxa de sala de hemodinâmica',peso:3,obrig:true},
    {cod:'DT-007',desc:'Taxa de recuperação anestésica',peso:2,obrig:true},
    {cod:'DT-008',desc:'Diária acompanhante',peso:1,obrig:false},
    {cod:'DT-009',desc:'Taxa de uso de equipamento',peso:1,obrig:false},
    {cod:'DT-010',desc:'Taxa de gases medicinais',peso:1,obrig:false}
  ];

  var REGRAS_DUT = [
    {cod:'DUT-001',desc:'DUT cirurgia bariátrica - IMC ≥ 35 com comorbidade ou ≥ 40',evidencia:'Relatório nutricional + 2 anos tratamento'},
    {cod:'DUT-002',desc:'DUT artroplastia - falha de tratamento conservador 6 meses',evidencia:'Laudo ortopédico + RM/RX'},
    {cod:'DUT-003',desc:'DUT quimioterapia - protocolo conforme ANS',evidencia:'Laudo oncologista + estadiamento'},
    {cod:'DUT-004',desc:'DUT imunobiológico - falha terapia convencional',evidencia:'Histórico medicamentoso documentado'},
    {cod:'DUT-005',desc:'DUT RM crânio - indicação neurológica',evidencia:'Laudo neuro + sintomatologia'}
  ];

  var REGRAS_DOC = [
    {cod:'DOC-001',desc:'Guia TISS preenchida corretamente',obrig:true},
    {cod:'DOC-002',desc:'Laudo médico assinado e datado',obrig:true},
    {cod:'DOC-003',desc:'Exames complementares anexados',obrig:true},
    {cod:'DOC-004',desc:'Relatório de tratamento anterior',obrig:false},
    {cod:'DOC-005',desc:'Justificativa técnica detalhada',obrig:true}
  ];

  var PRESTADORES = [
    {id:'P1',nome:'SANTA CASA DE MISERICORDIA DE MACEIO',tipo:'Hospital'},
    {id:'P2',nome:'CLINICA DIAGNOSTICA IMAGEM TOTAL',tipo:'Clínica'},
    {id:'P3',nome:'INSTITUTO ONCOLOGICO DE ALAGOAS',tipo:'Hospital'},
    {id:'P4',nome:'CENTRO DE ORTOPEDIA E TRAUMATOLOGIA NORTE',tipo:'Clínica'},
    {id:'P5',nome:'CLINICA CARDIOLOGICA CARDIOCENTRO',tipo:'Clínica'}
  ];

  var BENEFICIARIOS = [
    {id:'B1',nome:'ANDRESSA GIMENEZ FERREIRA SOARES',cpf:'123.456.789-00',cartao:'9876543210001',idade:54,plano:'Pleno',contrato:'C-001',cidade:'Maceió'},
    {id:'B2',nome:'CARLOS ROBERTO OLIVEIRA SANTOS',cpf:'234.567.890-11',cartao:'9876543210002',idade:62,plano:'Master',contrato:'C-002',cidade:'Arapiraca'},
    {id:'B3',nome:'BEATRIZ SOUZA LIMA FERREIRA',cpf:'345.678.901-22',cartao:'9876543210003',idade:38,plano:'Pleno',contrato:'C-003',cidade:'João Pessoa'},
    {id:'B4',nome:'DIEGO FIGUEIREDO SOUZA MENDONCA',cpf:'456.789.012-33',cartao:'9876543210004',idade:45,plano:'Essencial',contrato:'C-004',cidade:'Campina Grande'},
    {id:'B5',nome:'EDUARDA PEREIRA COSTA ALVES',cpf:'567.890.123-44',cartao:'9876543210005',idade:29,plano:'Pleno',contrato:'C-005',cidade:'Natal'},
    {id:'B6',nome:'FABIO TEIXEIRA ALMEIDA JUNIOR',cpf:'678.901.234-55',cartao:'9876543210006',idade:71,plano:'Master',contrato:'C-006',cidade:'Brasília'},
    {id:'B7',nome:'GIOVANA RODRIGUES MENDES CAVALCANTE',cpf:'789.012.345-66',cartao:'9876543210007',idade:33,plano:'Essencial',contrato:'C-007',cidade:'Maceió'},
    {id:'B8',nome:'HEITOR BORGES CARDOSO NETO',cpf:'890.123.456-77',cartao:'9876543210008',idade:58,plano:'Pleno',contrato:'C-008',cidade:'Arapiraca'}
  ];

  var USUARIOS = [
    {id:'U1',nome:'Renata Lopes',perfil:'enfermeiro'},
    {id:'U2',nome:'Dr. Marcos Vinícius',perfil:'auditor'},
    {id:'U3',nome:'Dra. Helena Pires',perfil:'auditor'},
    {id:'U4',nome:'Patrícia Andrade',perfil:'gestor'},
    {id:'U5',nome:'Felipe Macedo',perfil:'enfermeiro'},
    {id:'U6',nome:'Dr. Tiago Reis',perfil:'auditor'}
  ];

  var STATUS = ['Em análise','Aguardando complemento','Em junta médica','Cotação de OPME','Analisada','Liberada','Negada'];
  var ORIGENS = ['Site','Web Prestador','Emissão guias'];

  var MOTIVOS_COMP = ['Documentação incompleta','Laudo médico ilegível','Ausência de exame complementar','DUT não atendida','Justificativa clínica insuficiente'];
  var MOTIVOS_REPR = ['Cobertura contratual negada','DUT não atendida','Ausência de indicação clínica','Procedimento não autorizado pela ANS','Carência não cumprida'];
  var MOTIVOS_RESS = ['Aprovado com limitação de diárias','Aprovado com substituição de OPME','Aprovado por garantia de atendimento','Aprovado parcial - exames','Aprovado com auditoria pós-pagamento'];

  // Horas médias típicas por etapa (base para mock de gargalo)
  var ETAPA_HORAS_BASE = {
    'ANÁLISE ADM - REGULAÇÃO URG':2,'SETOR ADMINISTRATIVO':4,
    'SOLICITAR CONTRATO/DLP/VÍNCULO':8,'AUDITORIA PRÉVIA':18,
    'SOLICITAR CORREÇÃO AO PRESTADOR':36,'ANALISAR HISTÓRICOS E TRATAMENTO ANTERIORES':14,
    'PATOLOGIAS ANTERIORES AO PLANO':10,'ABORDAGEM PRESENCIAL FILIAL':48,
    'AUDITORIA EXTERNA - TRIAGEM ENFERMEIRA':6,'AUDITORIA EXTERNA - MÉDICO':12,
    'AUDITORIA PRÉVIA (DOCUMENTAÇÃO)':20,'AUDITORIA PRÉVIA (DOCUMENTAÇÃO MÉDICO)':16,
    'AUDITORIA EXTERNA - CONTATO MÉDICO ASSISTENTE':24,'CONTATO MÉDICO ASSIST. PELA OPERADORA':24,
    'JUNTA MÉDICA':72,'ABERTURA DE JUNTA':8,'GARANTIA DE ATENDIMENTO':6,
    'COTAÇÃO OPME':54,'FINALIZAR GUIA':3,'ENCERRAR PROCESSO':2,'PROCESSO ENCERRADO':1,
    'AUDITORIA ESPECIALIZADA (ANALÍTICA/BUCO/NEURO)':30,'AUDITORIA MÉDICA URG/PA':8,
    'PARAMETRIZAÇÃO':96
  };
  function buildEtapas(fluxo, statusGuia){
    var lst=[]; var marcaCorrente = statusGuia==='Em análise' || statusGuia==='Aguardando complemento' || statusGuia==='Em junta médica';
    var corrIdx = marcaCorrente ? Math.min(fluxo.etapas.length-2, Math.max(1, Math.floor(fluxo.etapas.length*0.45))) : fluxo.etapas.length;
    var baseDay=1, baseHour=8, cumHours=0;
    for(var i=0;i<fluxo.etapas.length;i++){
      var nome=fluxo.etapas[i];
      var st = i<corrIdx?'concluida':(i===corrIdx?'em_execucao':'aguardando');
      if(statusGuia==='Liberada'||statusGuia==='Negada'||statusGuia==='Encerrada') st='concluida';
      var horasBase=ETAPA_HORAS_BASE[nome]||12;
      // Variação +/-40% por índice para simular realidade
      var variacao=1 + ((i*0.13)%0.8 - 0.4);
      var horasReal=Math.round(horasBase*variacao);
      var dIni=Math.floor(cumHours/24)+baseDay, hIni=baseHour+(cumHours%24);
      var inicioPad='2026-06-'+String(Math.min(dIni,28)).padStart(2,'0')+' '+String(Math.min(hIni,23)).padStart(2,'0')+':00';
      cumHours+=horasReal;
      var dFim=Math.floor(cumHours/24)+baseDay, hFim=baseHour+(cumHours%24);
      var fimPad='2026-06-'+String(Math.min(dFim,28)).padStart(2,'0')+' '+String(Math.min(hFim,23)).padStart(2,'0')+':00';
      lst.push({ ordem:i+1, nome:nome, ia:IA_POR_ETAPA[nome]||'apoio', status:st,
        prazoHoras: nome.indexOf('URG')>=0?4:(nome.indexOf('JUNTA')>=0?72:24),
        horasReais: st!=='aguardando'?horasReal:0,
        responsavel: (nome.indexOf('MÉDICO')>=0||nome.indexOf('JUNTA')>=0)?'auditor':(nome.indexOf('ENFERMEIRA')>=0?'enfermeiro':'auditor'),
        inicio: st!=='aguardando' ? inicioPad : '',
        fim: st==='concluida' ? fimPad : ''
      });
    }
    return lst;
  }

  function pickItems(arr, n){ var o=[]; for(var i=0;i<n && i<arr.length;i++){ o.push(arr[i*Math.max(1,Math.floor(arr.length/n))%arr.length]); } return o; }

  var GUIAS_RAW = [
    {numero:'101848029',benId:'B1',presS:'P1',presE:'P1',solicitante:'DIOGO SOARES DE MENDES',tipo:'Internação',natureza:'Internação',regime:'Urgência',fluxoId:'F1',status:'Em análise',origem:'Site',uti:true,opme:true,dut:true,anexos:true,prio:'Alta',procs:['10103035','40901327','31602050'],pacs:[],mm:['MM-001','MM-008'],dt:['DT-001','DT-005'],risco:'alto',internacao:'2026-06-05',obs:'Internação urgência com UTI e OPME ortopédico.'},
    {numero:'203741856',benId:'B2',presS:'P1',presE:'P1',solicitante:'CARLOS HENRIQUE PINTO LIMA',tipo:'Cirurgia',natureza:'Eletiva',regime:'Eletivo',fluxoId:'F6',status:'Aguardando complemento',origem:'Web Prestador',uti:false,opme:false,dut:true,anexos:false,prio:'Média',procs:['30912018'],pacs:['PKT-BAR-01'],mm:[],dt:['DT-005'],risco:'medio',obs:'Bariátrica eletiva — DUT incompleta, faltam relatórios.'},
    {numero:'304529173',benId:'B3',presS:'P3',presE:'P3',solicitante:'FERNANDA OLIVEIRA COSTA',tipo:'Quimioterapia',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F8',status:'Em junta médica',origem:'Emissão guias',uti:false,opme:false,dut:true,anexos:true,prio:'Alta',procs:['30729050'],pacs:['PKT-ONC-01'],mm:['MM-005','MM-006'],dt:[],risco:'alto',obs:'Imunobiológico de alto custo — junta médica.'},
    {numero:'405837264',benId:'B4',presS:'P2',presE:'P2',solicitante:'RICARDO ALVES FONSECA',tipo:'Exame imagem',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F3',status:'Em análise',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Baixa',procs:['40901114'],pacs:[],mm:['MM-009','MM-010'],dt:[],risco:'baixo',obs:'RM crânio com sedação.'},
    {numero:'506294837',benId:'B5',presS:'P2',presE:'P2',solicitante:'PATRICIA MENEZES SOUZA',tipo:'Exame',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F9',status:'Em análise',origem:'Emissão guias',uti:false,opme:false,dut:false,anexos:false,prio:'Baixa',procs:['40601161'],pacs:[],mm:[],dt:[],risco:'baixo',obs:'Exame sem parametrização — exige cadastro de regras.'},
    {numero:'607183924',benId:'B6',presS:'P5',presE:'P5',solicitante:'MARCOS VINICIUS TELES',tipo:'Hemodinâmica',natureza:'Eletiva',regime:'Eletivo',fluxoId:'F2',status:'Em análise',origem:'Site',uti:false,opme:true,dut:false,anexos:true,prio:'Alta',procs:['31309062'],pacs:['PKT-CARD-01'],mm:['MM-003'],dt:['DT-006'],risco:'alto',obs:'Angioplastia com stent farmacológico.'},
    {numero:'708364519',benId:'B7',presS:'P1',presE:'P1',solicitante:'JULIANA BARBOSA RAMOS',tipo:'Cirurgia neuro',natureza:'Eletiva',regime:'Eletivo',fluxoId:'F5',status:'Em análise',origem:'Web Prestador',uti:true,opme:false,dut:false,anexos:true,prio:'Alta',procs:['21010059'],pacs:[],mm:[],dt:['DT-001','DT-005'],risco:'critico',obs:'Cirurgia coluna — neuro.'},
    {numero:'809274631',benId:'B8',presS:'P4',presE:'P4',solicitante:'ANDERSON LOPES CAVALCANTE',tipo:'Cirurgia ortopédica',natureza:'Eletiva',regime:'Eletivo',fluxoId:'F2',status:'Cotação de OPME',origem:'Web Prestador',uti:false,opme:true,dut:true,anexos:true,prio:'Média',procs:['31602069'],pacs:['PKT-ORT-02'],mm:['MM-002'],dt:['DT-005'],risco:'medio',obs:'Artroplastia quadril — aguardando cotação de 3 fornecedores de OPME.'},
    {numero:'910583742',benId:'B2',presS:'P1',presE:'P1',solicitante:'BRUNO CESAR MAGALHAES',tipo:'Internação',natureza:'Internação',regime:'Eletivo',fluxoId:'F2',status:'Analisada',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['41001214','40601161'],pacs:[],mm:[],dt:['DT-003'],risco:'baixo',obs:'Histórico anterior relevante.'},
    {numero:'112847563',benId:'B3',presS:'P3',presE:'P3',solicitante:'LETICIA VIEIRA ANDRADE',tipo:'Junta médica',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F8',status:'Em junta médica',origem:'Emissão guias',uti:false,opme:false,dut:true,anexos:true,prio:'Alta',procs:['30730066'],pacs:['PKT-ONC-01'],mm:['MM-007'],dt:[],risco:'alto',obs:'Em junta médica para revisão.'},
    {numero:'213956874',benId:'B1',presS:'P2',presE:'P2',solicitante:'RAFAEL MONTEIRO GOMES',tipo:'Exame',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F7',status:'Liberada',origem:'Web Prestador',uti:false,opme:false,dut:false,anexos:true,prio:'Baixa',procs:['40803045'],pacs:[],mm:[],dt:[],risco:'baixo',obs:'Liberado após análise.'},
    {numero:'314862795',benId:'B4',presS:'P1',presE:'P1',solicitante:'THIAGO NASCIMENTO CRUZ',tipo:'Cirurgia',natureza:'Eletiva',regime:'Eletivo',fluxoId:'F4',status:'Negada',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['30602131'],pacs:['PKT-CAT-01'],mm:[],dt:['DT-005'],risco:'medio',obs:'Negada por DUT não atendida.'}
  ];

  function hydrate(){
    var out=[];
    for(var i=0;i<GUIAS_RAW.length;i++){
      var g=GUIAS_RAW[i];
      var ben = BENEFICIARIOS.filter(function(b){return b.id===g.benId})[0];
      var ps = PRESTADORES.filter(function(p){return p.id===g.presS})[0];
      var pe = PRESTADORES.filter(function(p){return p.id===g.presE})[0];
      var fluxo = FLUXOS.filter(function(f){return f.id===g.fluxoId})[0];
      var diasEm = 1 + (i%9);
      out.push({
        numero:g.numero, beneficiario:ben, prestadorSol:ps, prestadorExe:pe, fluxo:fluxo,
        tipo:g.tipo, natureza:g.natureza, regime:g.regime, status:g.status, origem:g.origem, congenere:ben.cidade||'—', solicitante:g.solicitante||'—',
        uti:g.uti, opme:g.opme, dut:g.dut, anexos:g.anexos, prio:g.prio,
        risco:g.risco, dataEmissao:'2026-06-0'+((i%9)+1), internacao:g.internacao||'', alta:'',
        diasAuditoria:diasEm, prazoVencido: diasEm>5,
        procedimentos: PROCEDIMENTOS.filter(function(p){return g.procs.indexOf(p.cod)>=0}),
        pacotes: PACOTES.filter(function(p){return g.pacs.indexOf(p.cod)>=0}),
        matmed: MATMED.filter(function(p){return g.mm.indexOf(p.cod)>=0}),
        diariasTaxas: DIARIAS_TAXAS.filter(function(p){return g.dt.indexOf(p.cod)>=0}),
        etapas: buildEtapas(fluxo, g.status),
        anexosLista: g.anexos ? [
          {id:g.numero+'-A1',nome:'Laudo médico assinado.pdf',tipo:'pdf',categoria:'Laudo médico',tamanho:'412 KB',enviadoEm:'2026-06-0'+((i%9)+1)+' 09:12',enviadoPor:g.presS,paginas:3,anotacoes:[]},
          {id:g.numero+'-A2',nome:'Exame de imagem.jpg',tipo:'img',categoria:'Exame complementar',tamanho:'1.8 MB',enviadoEm:'2026-06-0'+((i%9)+1)+' 09:15',enviadoPor:g.presS,paginas:1,anotacoes:[]},
          {id:g.numero+'-A3',nome:'Guia TISS preenchida.pdf',tipo:'pdf',categoria:'Guia TISS',tamanho:'220 KB',enviadoEm:'2026-06-0'+((i%9)+1)+' 09:00',enviadoPor:g.presS,paginas:2,anotacoes:[]},
          {id:g.numero+'-A4',nome:'Relatório clínico.pdf',tipo:'pdf',categoria:'Relatório clínico',tamanho:'305 KB',enviadoEm:'2026-06-0'+((i%9)+1)+' 09:22',enviadoPor:g.presS,paginas:4,anotacoes:[]}
        ] : [],
        observacoes:g.obs, parecerOperadora:null, parecerIA:null,
        ultimaSync:'2026-06-09 23:'+(10+i)
      });
    }
    return out;
  }

  var LOGS = [
    // Dia 09/06
    {ts:'2026-06-09 23:10',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Sincronização Solus concluída',ref:'12 guias atualizadas'},
    {ts:'2026-06-09 22:50',user:'Dr. Marcos',perfil:'auditor',tipo:'usuario',acao:'Parecer da Operadora emitido',ref:'314862795 → Negada'},
    {ts:'2026-06-09 21:05',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Reclassificação automática de risco',ref:'809274631 — Alto risco detectado'},
    {ts:'2026-06-09 20:18',user:'Carla Mendonça',perfil:'enfermeiro',tipo:'usuario',acao:'Complemento inserido',ref:'405193827'},
    {ts:'2026-06-09 18:32',user:'Renata Lopes',perfil:'enfermeiro',tipo:'usuario',acao:'Triagem enfermeira concluída',ref:'809274631'},
    {ts:'2026-06-09 17:45',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Parecer IA gerado',ref:'405193827 — Aderência 91%'},
    {ts:'2026-06-09 16:01',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Parecer IA gerado',ref:'304529173 — Aderência 78%'},
    {ts:'2026-06-09 15:22',user:'Patrícia Andrade',perfil:'gestor',tipo:'usuario',acao:'Parametrização atualizada',ref:'Fluxo F8 — peso ajustado'},
    {ts:'2026-06-09 15:00',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Alerta de vencimento de prazo',ref:'203741856 — prazo em 2h'},
    {ts:'2026-06-09 14:10',user:'Dra. Helena',perfil:'auditor',tipo:'usuario',acao:'Solicitar complemento',ref:'203741856'},
    {ts:'2026-06-09 13:52',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Análise OPME — cotação verificada',ref:'112847563 — 3 itens'},
    {ts:'2026-06-09 12:45',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Guia recebida do Solus',ref:'607183924'},
    {ts:'2026-06-09 12:30',user:'Dr. Tiago',perfil:'auditor',tipo:'usuario',acao:'Guia aprovada',ref:'607183924'},
    {ts:'2026-06-09 11:33',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Regra DUT-001 aplicada',ref:'203741856'},
    {ts:'2026-06-09 11:00',user:'Renata Lopes',perfil:'enfermeiro',tipo:'usuario',acao:'Triagem enfermeira concluída',ref:'203741856'},
    {ts:'2026-06-09 10:40',user:'Patrícia Andrade',perfil:'gestor',tipo:'usuario',acao:'Configuração de Classificação de Risco salva',ref:'Limiares atualizados'},
    {ts:'2026-06-09 10:14',user:'Dr. Tiago',perfil:'auditor',tipo:'usuario',acao:'Encaminhar para junta',ref:'112847563'},
    {ts:'2026-06-09 09:48',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Backup automático realizado',ref:'6 tabelas — 14 MB'},
    {ts:'2026-06-09 09:15',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Score de risco recalculado',ref:'304529173 — 87 pontos'},
    {ts:'2026-06-09 09:00',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Início do dia operacional',ref:'—'},
    // Dia 10/06
    {ts:'2026-06-10 22:11',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Parecer IA gerado',ref:'718293046 — Aderência 64%'},
    {ts:'2026-06-10 21:30',user:'Dr. Marcos',perfil:'auditor',tipo:'usuario',acao:'Parecer da Operadora emitido',ref:'718293046 → Aprovada'},
    {ts:'2026-06-10 19:55',user:'Carla Mendonça',perfil:'enfermeiro',tipo:'usuario',acao:'Complemento inserido',ref:'812047361'},
    {ts:'2026-06-10 18:40',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Sincronização Solus concluída',ref:'9 guias atualizadas'},
    {ts:'2026-06-10 17:22',user:'Patrícia Andrade',perfil:'gestor',tipo:'usuario',acao:'Relatório exportado',ref:'Guias — junho 2026'},
    {ts:'2026-06-10 16:05',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Regra DUT-003 aplicada',ref:'812047361'},
    {ts:'2026-06-10 15:18',user:'Dra. Helena',perfil:'auditor',tipo:'usuario',acao:'Guia negada',ref:'503847192 → Negada'},
    {ts:'2026-06-10 14:33',user:'Renata Lopes',perfil:'enfermeiro',tipo:'usuario',acao:'Triagem enfermeira concluída',ref:'503847192'},
    {ts:'2026-06-10 13:50',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Alerta de inconsistência detectada',ref:'503847192 — CID divergente'},
    {ts:'2026-06-10 12:22',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Análise preditiva de custo',ref:'503847192 — R$ 48.200'},
    {ts:'2026-06-10 11:44',user:'Dr. Tiago',perfil:'auditor',tipo:'usuario',acao:'Junta médica convocada',ref:'920481736'},
    {ts:'2026-06-10 11:00',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Guia recebida do Solus',ref:'920481736'},
    {ts:'2026-06-10 10:15',user:'IA RegulaAI',perfil:'sistema',tipo:'ia',acao:'Score de risco calculado',ref:'920481736 — 93 pontos'},
    {ts:'2026-06-10 09:00',user:'Sistema',perfil:'sistema',tipo:'sistema',acao:'Início do dia operacional',ref:'—'}
  ];

  var CATEGORIAS_ANEXO = ['Guia TISS','Laudo médico','Exame complementar','Relatório clínico','Histórico/Prontuário','Justificativa técnica','DUT/Evidência','OPME — orçamento','Termo de consentimento','Outros'];

  // ── Detalhamento de item Mat/Med (campos ricos, estilo Solus) ──
  // Gerado de forma determinística por código do item, para ser estável entre renders.
  function _mmSeed(s){ var h=0; s=''+s; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  var _VIAS = ['Oral','Endovenosa','Subcutânea','Intramuscular','Tópica','Inalatória'];
  var _UNID = ['MG - Miligrama','ML - Mililitro','UN - Unidade','FR - Frasco','AMP - Ampola'];
  var _FREQ = [1,2,3,4,6];
  function matmedDetalhe(m){
    var s = _mmSeed(m.cod);
    var opme = !!m.opme;
    var vlrTabela = +((opme ? 3500 + s%38000 : 40 + s%1800) + (s%100)/100).toFixed(4);
    var glosaPct = (s%5===0) ? (5 + s%20)/100 : 0;         // ~alguns itens têm glosa parcial
    var vlrAutorizado = +(vlrTabela * (1 - glosaPct)).toFixed(4);
    var doses = opme ? 1 : (1 + s%6);
    var qtdeSolic = opme ? 1 : (1 + s%3);
    var unidade = opme ? 'UN - Unidade' : _UNID[s % _UNID.length];
    var via = opme ? '—' : _VIAS[s % _VIAS.length];
    var freq = opme ? 0 : _FREQ[s % _FREQ.length];
    var fornecidoPrestador = (s%3!==0);
    return {
      cod:m.cod, desc:m.desc, opme:opme,
      qtde:qtdeSolic, qtdeSolic:qtdeSolic,
      calculo:'Automático',
      fornecido: fornecidoPrestador ? 'Não, fornecido pelo prestador' : 'Sim, pela operadora',
      statusReq:'—', qtdConsolidada:0, qtdDevolvida:0,
      vlrTabela:vlrTabela, vlrAutorizado:vlrAutorizado,
      totalSolicitado:+(vlrTabela*qtdeSolic).toFixed(2),
      totalAutorizado:+(vlrAutorizado*qtdeSolic).toFixed(2),
      totalSolicitadoDoses:+(vlrTabela*doses).toFixed(2),
      totalAutorizadoDoses:+(vlrAutorizado*doses).toFixed(2),
      coParticipacao:0, prevUso:'22/05/2026',
      descEspecifica: opme ? 'OPME GENÉRICA' : (m.desc||''),
      dosesSolic:doses, doses:doses,
      unidade:unidade, unidadeTNUMM:'—',
      via:via, frequencia:freq, ordenacao:1,
      kit:'Produto avulso', alteradoKit:'Produto avulso',
      processoJuridico:'—', pacotePTU:'Não'
    };
  }

  global.MOCK = {
    FLUXOS:FLUXOS, IA_POR_ETAPA:IA_POR_ETAPA,
    PROCEDIMENTOS:PROCEDIMENTOS, PACOTES:PACOTES, MATMED:MATMED, DIARIAS_TAXAS:DIARIAS_TAXAS,
    REGRAS_DUT:REGRAS_DUT, REGRAS_DOC:REGRAS_DOC,
    PRESTADORES:PRESTADORES, BENEFICIARIOS:BENEFICIARIOS, USUARIOS:USUARIOS,
    STATUS:STATUS, ORIGENS:ORIGENS, CATEGORIAS_ANEXO:CATEGORIAS_ANEXO,
    MOTIVOS_COMP:MOTIVOS_COMP, MOTIVOS_REPR:MOTIVOS_REPR, MOTIVOS_RESS:MOTIVOS_RESS,
    LOGS:LOGS, buildGuias: hydrate, matmedDetalhe: matmedDetalhe
  };
})(window);
