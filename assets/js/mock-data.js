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
    {id:'B1',nome:'ANDRESSA GIMENEZ FERREIRA SOARES',cpf:'123.456.789-00',cartao:'9876543210001',carteirinha:'0739961.01',dataNascimento:'15/04/1971',dataInclusao:'12/03/2019',plano:'PREMIUM PROMO',contrato:'C-001',acomodacao:'APARTAMENTO',cidade:'Maceió'},
    {id:'B2',nome:'CARLOS ROBERTO OLIVEIRA SANTOS',cpf:'234.567.890-11',cartao:'9876543210002',carteirinha:'0814522.03',dataNascimento:'22/08/1963',dataInclusao:'05/07/2016',plano:'PLATINUM PROMO',contrato:'C-002',acomodacao:'APARTAMENTO',cidade:'Arapiraca'},
    {id:'B3',nome:'BEATRIZ SOUZA LIMA FERREIRA',cpf:'345.678.901-22',cartao:'9876543210003',carteirinha:'0655190.02',dataNascimento:'03/12/1987',dataInclusao:'23/11/2020',plano:'MOBI',contrato:'C-003',acomodacao:'ENFERMARIA',cidade:'João Pessoa'},
    {id:'B4',nome:'DIEGO FIGUEIREDO SOUZA MENDONCA',cpf:'456.789.012-33',cartao:'9876543210004',carteirinha:'0721438.01',dataNascimento:'19/06/1980',dataInclusao:'18/02/2022',plano:'EASY',contrato:'C-004',acomodacao:'ENFERMARIA',cidade:'Campina Grande'},
    {id:'B5',nome:'EDUARDA PEREIRA COSTA ALVES',cpf:'567.890.123-44',cartao:'9876543210005',carteirinha:'0903277.04',dataNascimento:'28/01/1997',dataInclusao:'30/09/2018',plano:'PREMIUM PROMO',contrato:'C-005',acomodacao:'APARTAMENTO',cidade:'Natal'},
    {id:'B6',nome:'FABIO TEIXEIRA ALMEIDA JUNIOR',cpf:'678.901.234-55',cartao:'9876543210006',carteirinha:'0587013.02',dataNascimento:'07/03/1954',dataInclusao:'14/06/2015',plano:'PLATINUM PROMO',contrato:'C-006',acomodacao:'APARTAMENTO',cidade:'Brasília'},
    {id:'B7',nome:'GIOVANA RODRIGUES MENDES CAVALCANTE',cpf:'789.012.345-66',cartao:'9876543210007',carteirinha:'0668904.01',dataNascimento:'11/09/1992',dataInclusao:'27/04/2021',plano:'MOBI',contrato:'C-007',acomodacao:'ENFERMARIA',cidade:'Maceió'},
    {id:'B8',nome:'HEITOR BORGES CARDOSO NETO',cpf:'890.123.456-77',cartao:'9876543210008',carteirinha:'0790115.03',dataNascimento:'25/10/1967',dataInclusao:'09/01/2017',plano:'EASY',contrato:'C-008',acomodacao:'ENFERMARIA',cidade:'Arapiraca'}
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
    {numero:'101848029',benId:'B1',presS:'P1',presE:'P1',solicitante:'DIOGO SOARES DE MENDES',tipo:'Internação',natureza:'Internação',subInternacao:'Clínica',regime:'Urgência',fluxoId:'F1',status:'Em análise',origem:'Site',uti:true,opme:true,dut:true,anexos:true,prio:'Alta',procs:['40901327','31602050'],pacs:[],mm:['MM-001','MM-008'],dt:['DT-001','DT-005'],risco:'alto',internacao:'2026-06-05',obs:'Internação urgência com UTI e OPME ortopédico.'},
    {numero:'203741856',benId:'B2',presS:'P1',presE:'P1',solicitante:'CARLOS HENRIQUE PINTO LIMA',tipo:'Cirurgia',natureza:'Internação',subInternacao:'Cirúrgica',regime:'Eletivo',fluxoId:'F6',status:'Aguardando complemento',origem:'Web Prestador',uti:false,opme:false,dut:true,anexos:false,prio:'Média',procs:['30912018'],pacs:['PKT-BAR-01'],mm:[],dt:['DT-005'],risco:'medio',obs:'Bariátrica eletiva — DUT incompleta, faltam relatórios.'},
    {numero:'304529173',benId:'B3',presS:'P3',presE:'P3',solicitante:'FERNANDA OLIVEIRA COSTA',tipo:'Quimioterapia',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F8',status:'Em junta médica',origem:'Emissão guias',uti:false,opme:false,dut:true,anexos:true,prio:'Alta',procs:['30729050'],pacs:['PKT-ONC-01'],mm:['MM-005','MM-006'],dt:[],risco:'alto',obs:'Imunobiológico de alto custo — junta médica.'},
    {numero:'405837264',benId:'B4',presS:'P2',presE:'P2',solicitante:'RICARDO ALVES FONSECA',tipo:'Exame imagem',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F3',status:'Em análise',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Baixa',procs:['40901114'],pacs:[],mm:['MM-009','MM-010'],dt:[],risco:'baixo',obs:'RM crânio com sedação.'},
    {numero:'506294837',benId:'B5',presS:'P2',presE:'P2',solicitante:'DIOGO SOARES DE MENDES',tipo:'Internação',natureza:'Internação',subInternacao:'Pediátrica',regime:'Eletivo',fluxoId:'F2',status:'Em análise',origem:'Emissão guias',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['41001214','40601161'],pacs:[],mm:['MM-001'],dt:['DT-003'],risco:'medio',obs:'Internação pediátrica eletiva.'},
    {numero:'607183924',benId:'B6',presS:'P5',presE:'P5',solicitante:'THIAGO NASCIMENTO CRUZ',tipo:'Cirurgia',natureza:'Internação',subInternacao:'Cirúrgica',regime:'Eletivo',fluxoId:'F4',status:'Em análise',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['30912018'],pacs:['PKT-BAR-01'],mm:['MM-003'],dt:['DT-005'],risco:'medio',obs:'Cirurgia eletiva.'},
    {numero:'708364519',benId:'B7',presS:'P1',presE:'P1',solicitante:'THIAGO NASCIMENTO CRUZ',tipo:'Cirurgia',natureza:'Internação',subInternacao:'Cirúrgica',regime:'Eletivo',fluxoId:'F4',status:'Em análise',origem:'Web Prestador',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['30602131'],pacs:['PKT-CAT-01'],mm:[],dt:['DT-005'],risco:'medio',obs:'Cirurgia eletiva.'},
    {numero:'809274631',benId:'B8',presS:'P4',presE:'P4',solicitante:'ANDERSON LOPES CAVALCANTE',tipo:'Cirurgia ortopédica',natureza:'Internação',subInternacao:'Cirúrgica',regime:'Eletivo',fluxoId:'F2',status:'Cotação de OPME',origem:'Web Prestador',uti:false,opme:true,dut:true,anexos:true,prio:'Média',procs:['31602069'],pacs:['PKT-ORT-02'],mm:['MM-002'],dt:['DT-005'],risco:'medio',obs:'Artroplastia quadril — aguardando cotação de 3 fornecedores de OPME.'},
    {numero:'910583742',benId:'B2',presS:'P1',presE:'P1',solicitante:'BRUNO CESAR MAGALHAES',tipo:'Internação',natureza:'Internação',subInternacao:'Obstétrica',regime:'Eletivo',fluxoId:'F2',status:'Analisada',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['41001214','40601161'],pacs:[],mm:[],dt:['DT-003'],risco:'baixo',obs:'Internação obstétrica — histórico anterior relevante.'},
    {numero:'112847563',benId:'B3',presS:'P3',presE:'P3',solicitante:'LETICIA VIEIRA ANDRADE',tipo:'Junta médica',natureza:'Ambulatorial',regime:'Eletivo',fluxoId:'F8',status:'Em junta médica',origem:'Emissão guias',uti:false,opme:false,dut:true,anexos:true,prio:'Alta',procs:['30730066'],pacs:['PKT-ONC-01'],mm:['MM-007'],dt:[],risco:'alto',obs:'Em junta médica para revisão.'},
    {numero:'213956874',benId:'B1',presS:'P2',presE:'P2',solicitante:'DIOGO SOARES DE MENDES',tipo:'Internação',natureza:'Internação',subInternacao:'Psiquiátrica',regime:'Eletivo',fluxoId:'F2',status:'Liberada',origem:'Web Prestador',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['41001214'],pacs:[],mm:['MM-008'],dt:['DT-003'],risco:'baixo',obs:'Internação psiquiátrica — liberada após análise.'},
    {numero:'314862795',benId:'B4',presS:'P1',presE:'P1',solicitante:'THIAGO NASCIMENTO CRUZ',tipo:'Cirurgia',natureza:'Internação',subInternacao:'Cirúrgica',regime:'Eletivo',fluxoId:'F4',status:'Negada',origem:'Site',uti:false,opme:false,dut:true,anexos:true,prio:'Média',procs:['30602131'],pacs:['PKT-CAT-01'],mm:[],dt:['DT-005'],risco:'medio',obs:'Negada por DUT não atendida.'}
  ];

  function hydrate(){
    var out=[];
    for(var i=0;i<GUIAS_RAW.length;i++){
      var g=GUIAS_RAW[i];
      var ben = BENEFICIARIOS.filter(function(b){return b.id===g.benId})[0];
      if(ben && ben.idade==null) ben.idade = calcIdade(ben.dataNascimento); // idade calculada da data de nascimento
      var ps = PRESTADORES.filter(function(p){return p.id===g.presS})[0];
      var pe = PRESTADORES.filter(function(p){return p.id===g.presE})[0];
      var fluxo = FLUXOS.filter(function(f){return f.id===g.fluxoId})[0];
      var diasEm = 1 + (i%9);
      out.push({
        numero:g.numero, beneficiario:ben, prestadorSol:ps, prestadorExe:pe, fluxo:fluxo,
        tipo:g.tipo, natureza:g.natureza, subInternacao:g.subInternacao||'', regime:g.regime, status:g.status, origem:g.origem, congenere:ben.cidade||'—', solicitante:g.solicitante||'—',
        uti:g.uti, opme:g.opme, dut:g.dut, anexos:g.anexos, prio:g.prio,
        risco:g.risco, dataEmissao:'2026-06-0'+((i%9)+1), horaEmissao:String(8+(i%10)).padStart(2,'0')+':'+String((i*7+13)%60).padStart(2,'0'), internacao:g.internacao||'', alta:'',
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

  // ── Detalhamento de item Procedimento (Qtde Solic./Qtde/Tabela), determinístico por código ──
  function procDetalhe(p){
    var s = _mmSeed(p.cod);
    var qtdeSolic = 1 + s%3;
    var glosaQtd = (s%6===0) ? 1 : 0; // às vezes autoriza menos do que solicitado
    var qtde = Math.max(1, qtdeSolic - glosaQtd);
    var vlrTabela = +((80 + s%920) + (s%100)/100).toFixed(2);
    return {
      cod:p.cod, desc:p.desc,
      qtdeSolic:qtdeSolic, qtde:qtde,
      vlrTabela:vlrTabela
    };
  }

  // ── Detalhamento de item OPME (campos próprios, estilo Solus) ──
  var FORNECEDORES_OPME = ['MedSupply Distribuidora','OrtoTech Brasil','CardioMed Implantes','BioImplante Ltda','Global OPME','Nordeste Materiais Médicos','Prime Health Supply'];
  var _MARCAS = ['Biomet','Zimmer','Stryker','Medtronic','Johnson & Johnson','Smith & Nephew','B.Braun'];
  var _LABANVISA = ['Zimmer Biomet Brasil Ltda','Stryker do Brasil','Medtronic Comercial Ltda','Johnson & Johnson do Brasil'];
  function opmeDetalhe(m){
    var s=_mmSeed('opme'+m.cod);
    var qtde = 1 + (s%2);
    var vlrTabela = +(3500 + s%38000 + (s%100)/100).toFixed(4);
    // cotado/pago pode variar sobre a tabela; autorizado pode ser < cotado (glosa)
    var cotado = +(vlrTabela * (0.9 + (s%25)/100)).toFixed(4);
    var glosa = (s%4===0) ? (5+s%15)/100 : 0;
    var autorizado = +(cotado * (1-glosa)).toFixed(4);
    var consignado = (s%2===0) ? 'Sim' : 'Não';
    var fornSolic = FORNECEDORES_OPME[s % FORNECEDORES_OPME.length];
    var fornAutoriz = (s%5===0) ? FORNECEDORES_OPME[(s+2) % FORNECEDORES_OPME.length] : fornSolic; // às vezes muda
    var anvisa = '1' + String(10000000000 + (s%89999999999));
    var codSolic = 'OPM-' + (10000 + s%89999);
    var codAutoriz = (fornAutoriz===fornSolic) ? codSolic : ('OPM-' + (10000 + (s+7)%89999));
    var interc = (s%6===0) ? 'PTU' : '—';
    var entregue = (s%3===0) ? 'Sim' : 'Não';
    return {
      cod:m.cod, desc:m.desc,
      codReferencia:'REF-'+(1000+s%9000),
      anvisa:anvisa,
      marca:_MARCAS[s % _MARCAS.length],
      qtde:qtde, calculo:'Automático',
      fornecido: (s%3!==0)?'Não, fornecido pelo prestador':'Sim, pela operadora',
      statusReq:'—', qtdConsolidada:0, qtdDevolvida:0,
      consignado:consignado,
      fornecedorUtilizado:fornSolic,
      // Solicitado
      fornecedorSolic:fornSolic, codSolic:codSolic, anvisaSolic:anvisa, produtoSolic:m.desc,
      vlrUnSolic:vlrTabela, vlrTotalSolic:+(vlrTabela*qtde).toFixed(2),
      vlrUnCotado:cotado, vlrTotalCotado:+(cotado*qtde).toFixed(2),
      vlrUnTabela:vlrTabela,
      // Autorizado
      qtdeAuto:qtde, fornecedorAutoriz:fornAutoriz, codAutoriz:codAutoriz, produtoAutoriz:m.desc,
      vlrUnAutorizado:autorizado, vlrTotalAutorizado:+(autorizado*qtde).toFixed(2),
      // Outros
      ordemPrioridade:1, observacoesEspec:'—',
      produtoInterPTU:interc, produtoEntregue:entregue, dataEntrega:(entregue==='Sim'?'25/05/2026':'—'),
      tipoAnexo:'3 - OPME',
      processoJuridico:'—', codProdutoFabricante:'FAB-'+(1000+s%9000),
      labAnvisa:_LABANVISA[s % _LABANVISA.length],
      negociado:(s%2===0)?'Sim':'Não'
    };
  }

  // ── Observações do ERP por guia (impressas + não impressas) ──
  // Determinístico por número da guia. Simula o que viria do Solus.
  var _OPERADORES = ['YASMINFREITAS','CARLOSMENDES','ANAPAULA','ROBERTASILVA','MARCOSLIMA'];
  var _OBS_NI = [
    'Informar a paciente que ela já pode ir tomar a medicação no Cancer Center.',
    'Aguardando retorno do prestador sobre documentação complementar.',
    'Beneficiário orientado sobre necessidade de laudo atualizado.',
    'Contato telefônico realizado — paciente ciente do agendamento.',
    'Pendência de cotação de OPME enviada ao setor responsável.',
    'Guia liberada mediante apresentação de relatório médico.',
    'Solicitado parecer da junta médica para o procedimento.'
  ];
  function observacoesGuia(numero){
    var s=_mmSeed('obs'+numero);
    var n = 1 + (s % 3); // 1 a 3 observações não impressas
    var naoImpressas=[];
    var hh=9+(s%8), mm=(s%6)*10;
    for(var i=0;i<n;i++){
      var si=_mmSeed('obs'+numero+'#'+i);
      var min=(mm+i*23)%60, hora=(hh+i)%24;
      naoImpressas.push({
        data:'22/05/2026 '+String(hora).padStart(2,'0')+':'+String(min).padStart(2,'0'),
        operador:_OPERADORES[si % _OPERADORES.length],
        podeInformar: (si%3===0) ? 'Sim' : 'Não',
        texto:_OBS_NI[si % _OBS_NI.length],
        // "cabeçalho" técnico como no ERP (protocolo interno)
        ref: (395480+ (si%9000)) + ' - 20260522 - ' + (200000+(si%99999))
      });
    }
    var protocolo = '395480' + '20260522' + (215000 + (s%999));
    var impressas = 'Protocolo de atendimento: ' + protocolo;
    return {impressas:impressas, protocolo:protocolo, naoImpressas:naoImpressas};
  }

  // ── Especialidade médica (derivada do tipo da guia) ──
  var ESPEC_MAP = {'Internação':'Clínica Médica','Cirurgia':'Cirurgia Geral','Quimioterapia':'Oncologia','Cirurgia neuro':'Neurocirurgia','Cirurgia ortopédica':'Ortopedia','Exame imagem':'Radiologia','Exame':'Clínica Médica','Hemodinâmica':'Cardiologia','Junta médica':'Multiprofissional'};
  function especialidadeDaGuia(g){ return ESPEC_MAP[g&&g.tipo]||'Outros'; }

  // Natureza da guia: Ambulatorial × Internação (campo direto, já normalizado nos dados).
  // Quando Internação, há um subtipo (subInternacao): Clínica, Cirúrgica, Obstétrica, Pediátrica, Psiquiátrica.
  var SUB_INTERNACAO = ['Clínica','Cirúrgica','Obstétrica','Pediátrica','Psiquiátrica'];
  function naturezaDaGuia(g){ return (g && g.natureza) || 'Ambulatorial'; }
  // Rótulo detalhado: "Ambulatorial" ou "Internação Cirúrgica"
  function naturezaDetalhada(g){
    if(!g) return 'Ambulatorial';
    if(g.natureza==='Internação' && g.subInternacao) return 'Internação '+g.subInternacao;
    return g.natureza||'Ambulatorial';
  }
  // HTML padronizado do seletor de Natureza (usado em Relatórios, Guias e Kanban).
  // Emite um <select> plano (sem optgroup) para ser decorado pelo makeCustomSelect (estilo .csel).
  // Os subtipos de internação são marcados com data-sub="1" para receberem recuo visual no dropdown.
  // sel = valor selecionado; extraAttrs = string de atributos extras no <select>.
  function naturezaSelectHTML(sel, extraAttrs){
    function esc2(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
    sel = sel||'';
    var subOpts = SUB_INTERNACAO.map(function(s){
      var v='Internação '+s;
      return '<option value="'+esc2(v)+'" data-sub="1"'+(sel===v?' selected':'')+'>'+esc2(v)+'</option>';
    }).join('');
    return '<select'+(extraAttrs?' '+extraAttrs:'')+'>'+
      '<option value=""'+(sel===''?' selected':'')+'>Natureza</option>'+
      '<option value="Ambulatorial"'+(sel==='Ambulatorial'?' selected':'')+'>Ambulatorial</option>'+
      '<option value="Internação"'+(sel==='Internação'?' selected':'')+'>Internação (todas)</option>'+
      subOpts+
    '</select>';
  }

  // ── CID (simulado, coerente com o tipo da guia) ──
  var CID_MAP = {
    'Internação':      ['J18.9 — Pneumonia não especificada','I50.0 — Insuficiência cardíaca congestiva','A41.9 — Sepse não especificada'],
    'Cirurgia':        ['K35.8 — Apendicite aguda','K80.2 — Colelitíase','K40.9 — Hérnia inguinal'],
    'Quimioterapia':   ['C50.9 — Neoplasia maligna da mama','C34.9 — Neoplasia maligna dos brônquios/pulmão','C18.9 — Neoplasia maligna do cólon'],
    'Cirurgia neuro':  ['G91.9 — Hidrocefalia não especificada','I67.1 — Aneurisma cerebral','C71.9 — Neoplasia maligna do encéfalo'],
    'Cirurgia ortopédica':['M17.1 — Gonartrose primária','S72.0 — Fratura do colo do fêmur','M51.1 — Transtorno de disco lombar'],
    'Exame imagem':    ['R91 — Achado anormal em imagem de pulmão','R51 — Cefaleia','M54.5 — Dor lombar baixa'],
    'Exame':           ['Z00.0 — Exame médico geral','R10.4 — Dor abdominal','E11.9 — Diabetes mellitus tipo 2'],
    'Hemodinâmica':    ['I20.0 — Angina instável','I21.9 — Infarto agudo do miocárdio','I25.1 — Doença aterosclerótica do coração'],
    'Junta médica':    ['Z02.7 — Emissão de atestado médico','M54.9 — Dorsalgia não especificada','F41.9 — Transtorno de ansiedade']
  };
  function cidGuia(g){
    if(!g) return {codigo:'—', descricao:'—'};
    var lista = CID_MAP[g.tipo] || ['Z76.9 — Contato com serviço de saúde não especificado'];
    var h = _mmSeed(String(g.numero||g.tipo||''));
    var raw = lista[h % lista.length];
    var parts = raw.split('—');
    return { codigo:(parts[0]||'').trim(), descricao:(parts[1]||parts[0]||'').trim() };
  }

  // ── Cálculos de tempo (idade e tempo de contrato) a partir de DD/MM/AAAA ──
  function _parseData(s){
    if(!s) return null;
    var p = String(s).split('/');
    if(p.length!==3) return null;
    var d = parseInt(p[0],10), m = parseInt(p[1],10), y = parseInt(p[2],10);
    if(isNaN(d)||isNaN(m)||isNaN(y)) return null;
    return {d:d,m:m,y:y};
  }
  // anos completos entre a data informada e hoje
  function _anosDecorridos(s){
    var p = _parseData(s);
    if(!p) return null;
    var hoje = new Date();
    var anos = hoje.getFullYear() - p.y;
    var mHoje = hoje.getMonth()+1, dHoje = hoje.getDate();
    if(mHoje < p.m || (mHoje===p.m && dHoje < p.d)) anos--; // ainda não fez aniversário no ano
    return anos<0 ? 0 : anos;
  }
  // idade do beneficiário calculada da data de nascimento
  function calcIdade(dataNasc){ return _anosDecorridos(dataNasc); }
  // tempo de contrato (anos completos desde a data de inclusão no plano)
  function anosContrato(dataInc){ return _anosDecorridos(dataInc); }

  // ── Histórico de atendimentos do paciente (determinístico por beneficiário) ──
  // Gera atendimentos anteriores (sessões de terapia/consultas) no estilo do ERP, para a aba "Hist. atendimento".
  var _HIST_PRESTADORES = ['ALANNA MONIQUE DE FREITAS COSTA DE JESUS','PATRICIA DE SOUZA SILVA CARNAUBA','QUITERIA MARIA TENORIO DE HOLANDA','FERNANDO SANTOS DE SOUZA','JOSEANE MARINHO DE ARAUJO'];
  var _HIST_LOCAIS = ['MAIS SAUDE - UNIDADE DELMAN','MAIS SAUDE - UNIDADE CENTRO','CLINICA INTEGRAR REABILITAÇÃO','HOSPITAL SANTA CASA','HOSPITAL DO CORAÇÃO'];
  var _HIST_FAT = ['Não faturada','Faturada','Não faturada','Em análise'];

  // ── Linhas de cuidado: cada guia deriva sua linha; o histórico é gerado com procedimentos/CID CORRELATOS ──
  // Assim, guia cardiológica → histórico cardiológico; ortopédica → ortopédico; etc.
  var _LINHAS_CUIDADO = {
    cardiologia: {
      procs:[
        {cod:'40803045', desc:'ECOCARDIOGRAMA TRANSTORACICO',            espec:'CARDIOLOGIA',        valor:180.00},
        {cod:'40808012', desc:'HOLTER 24H',                              espec:'CARDIOLOGIA',        valor:150.00},
        {cod:'40804025', desc:'TESTE ERGOMETRICO',                       espec:'CARDIOLOGIA',        valor:210.00},
        {cod:'10101012', desc:'CONSULTA CARDIOLOGICA',                   espec:'CARDIOLOGIA',        valor:0.00},
        {cod:'40803010', desc:'ELETROCARDIOGRAMA (ECG)',                 espec:'CARDIOLOGIA',        valor:45.00}
      ],
      cids:['I25 - Doença isquêmica crônica do coração','I20 - Angina pectoris','I10 - Hipertensão essencial','I48 - Fibrilação e flutter atrial'],
      obsImp:['Avaliação cardiológica de rotina.','Acompanhamento de cardiopatia isquêmica.','Controle pressórico registrado em prontuário.'],
      obsNi:['Paciente cardiopata em acompanhamento contínuo.','Verificar aderência à terapia anti-hipertensiva.','Investigação de dor torácica em andamento.']
    },
    ortopedia: {
      procs:[
        {cod:'40901114', desc:'RESSONANCIA MAGNETICA DE JOELHO',        espec:'ORTOPEDIA',          valor:520.00},
        {cod:'30725224', desc:'INFILTRACAO ARTICULAR',                   espec:'ORTOPEDIA',          valor:160.00},
        {cod:'20101015', desc:'SESSAO DE FISIOTERAPIA MOTORA',           espec:'FISIOTERAPIA',       valor:38.00},
        {cod:'10101012', desc:'CONSULTA ORTOPEDICA',                     espec:'ORTOPEDIA',          valor:0.00},
        {cod:'40901300', desc:'RX DE JOELHO/QUADRIL',                    espec:'ORTOPEDIA',          valor:70.00}
      ],
      cids:['M17 - Gonartrose (artrose do joelho)','M16 - Coxartrose (artrose do quadril)','M54 - Dorsalgia','M25 - Outros transtornos articulares'],
      obsImp:['Avaliação ortopédica com queixa articular.','Tratamento conservador em curso.','Fisioterapia em andamento conforme prescrição.'],
      obsNi:['Falha de tratamento conservador a ser documentada.','Verificar tempo de fisioterapia previamente realizado.','Correlação clínico-radiológica pendente.']
    },
    oncologia: {
      procs:[
        {cod:'30729050', desc:'SESSAO DE QUIMIOTERAPIA AMBULATORIAL',    espec:'ONCOLOGIA',          valor:1200.00},
        {cod:'40311210', desc:'MARCADOR TUMORAL',                        espec:'ONCOLOGIA',          valor:95.00},
        {cod:'40901327', desc:'TOMOGRAFIA PARA ESTADIAMENTO',            espec:'ONCOLOGIA',          valor:640.00},
        {cod:'10101012', desc:'CONSULTA ONCOLOGICA',                     espec:'ONCOLOGIA',          valor:0.00}
      ],
      cids:['C50 - Neoplasia maligna da mama','C34 - Neoplasia maligna dos brônquios/pulmão','C18 - Neoplasia maligna do cólon','Z51 - Cuidado por quimioterapia'],
      obsImp:['Ciclo de quimioterapia conforme protocolo.','Estadiamento registrado em prontuário.','Acompanhamento oncológico ativo.'],
      obsNi:['Protocolo antineoplásico a validar com estadiamento.','Verificar linha de tratamento e ciclos prévios.','Laudo do oncologista anexado.']
    },
    gastro: {
      procs:[
        {cod:'41001214', desc:'ENDOSCOPIA DIGESTIVA ALTA',              espec:'GASTROENTEROLOGIA',  valor:320.00},
        {cod:'41001230', desc:'COLONOSCOPIA',                            espec:'GASTROENTEROLOGIA',  valor:480.00},
        {cod:'10101012', desc:'CONSULTA GASTROENTEROLOGICA',            espec:'GASTROENTEROLOGIA',  valor:0.00},
        {cod:'40311260', desc:'PESQUISA DE H. PYLORI',                   espec:'GASTROENTEROLOGIA',  valor:60.00}
      ],
      cids:['K21 - Doença do refluxo gastroesofágico','K29 - Gastrite e duodenite','E66 - Obesidade','K25 - Úlcera gástrica'],
      obsImp:['Investigação digestiva em curso.','Acompanhamento de doença péptica.','Preparo e realização de exame endoscópico.'],
      obsNi:['Correlacionar sintomatologia digestiva.','Verificar critérios da DUT quando aplicável.','Resultado de exame prévio a anexar.']
    },
    neuro: {
      procs:[
        {cod:'40901114', desc:'RESSONANCIA MAGNETICA DE CRANIO',        espec:'NEUROLOGIA',         valor:680.00},
        {cod:'40808020', desc:'ELETROENCEFALOGRAMA (EEG)',              espec:'NEUROLOGIA',         valor:140.00},
        {cod:'10101012', desc:'CONSULTA NEUROLOGICA',                    espec:'NEUROLOGIA',         valor:0.00}
      ],
      cids:['G40 - Epilepsia','G43 - Enxaqueca','G20 - Doença de Parkinson','I63 - Infarto cerebral'],
      obsImp:['Avaliação neurológica com sintomatologia.','Investigação de cefaleia/crise.','Acompanhamento neurológico ativo.'],
      obsNi:['Correlação clínico-neurológica em andamento.','Verificar exames de imagem prévios.','Laudo neurológico anexado.']
    },
    terapias: {
      procs:[
        {cod:'50001084', desc:'ASSISTENTE TERAPEUTICO',                  espec:'ACOMPANHANTE TERAPEUTICO', valor:22.00},
        {cod:'91000471', desc:'SESSAO DE PSICOPEDAGOGIA INDIVIDUAL',     espec:'PSICOPEDAGOGIA',          valor:27.50},
        {cod:'50000470', desc:'SESSAO DE PSICOTERAPIA INDIVIDUAL',       espec:'PSICOLOGO EM GERAL',      valor:27.50},
        {cod:'50001213', desc:'MUSICOTERAPIA - POR SESSÃO',             espec:'MUSICOTERAPEUTA',         valor:35.20},
        {cod:'50000330', desc:'SESSAO DE FONOAUDIOLOGIA INDIVIDUAL',     espec:'FONOAUDIOLOGIA',          valor:29.90},
        {cod:'50000585', desc:'SESSAO DE TERAPIA OCUPACIONAL',           espec:'TERAPIA OCUPACIONAL',     valor:31.40}
      ],
      cids:['F84.0 - Autismo infantil','F84 - Transt globais do desenvolv','F80 - Transt desenvolv da fala','F90 - Transt hipercinéticos'],
      obsImp:['Sessão realizada conforme plano terapêutico individual.','Atendimento dentro da periodicidade autorizada.','Evolução registrada em prontuário.'],
      obsNi:['Beneficiário em acompanhamento multidisciplinar contínuo.','Verificar periodicidade x autorização vigente.','Guia vinculada a plano terapêutico ativo.']
    },
    geral: {
      procs:[
        {cod:'10101012', desc:'CONSULTA MEDICA EM CONSULTORIO',          espec:'CLINICA MEDICA',     valor:0.00},
        {cod:'40601161', desc:'HEMOGRAMA COMPLETO',                      espec:'CLINICA MEDICA',     valor:22.00},
        {cod:'40601099', desc:'GLICEMIA DE JEJUM',                       espec:'CLINICA MEDICA',     valor:12.00},
        {cod:'40901327', desc:'TOMOGRAFIA COMPUTADORIZADA',              espec:'RADIOLOGIA',         valor:600.00}
      ],
      cids:['Z00 - Exame médico geral','R10 - Dor abdominal','R51 - Cefaleia','E11 - Diabetes mellitus tipo 2'],
      obsImp:['Atendimento clínico de rotina.','Exames de rotina/pré-operatórios.','Acompanhamento clínico ativo.'],
      obsNi:['Avaliação clínica em andamento.','Verificar exames complementares.','Acompanhamento conforme protocolo.']
    }
  };
  // Deriva a linha de cuidado da guia a partir dos procedimentos + especialidade + tipo.
  function _linhaCuidadoDaGuia(g){
    var txt=((g.procedimentos||[]).map(function(p){return p.desc;}).join(' ')+' '+
             (g.pacotes||[]).map(function(p){return p.desc;}).join(' ')+' '+
             (g.tipo||'')+' '+(ESPEC_MAP[g&&g.tipo]||'')).toLowerCase();
    if(/cardio|angioplast|stent|cateter|coronari|ecocardio|hemodinâm|marcapasso/.test(txt)) return 'cardiologia';
    if(/artroplast|ortoped|joelho|quadril|coluna|artrodese|prótese|fisioter/.test(txt))     return 'ortopedia';
    if(/quimioter|oncolog|imunobiológico|neoplasia|tumor|pembroli|trastuz/.test(txt))       return 'oncologia';
    if(/endoscop|colonoscop|gastro|bariátrica|gastroplastia|digest/.test(txt))               return 'gastro';
    if(/neuro|crânio|cranio|ressonância.*crân|epilep|cerebr/.test(txt))                      return 'neuro';
    if(/terapêutic|psicoped|psicoterap|musicoter|fonoaud|terapia ocupacional|autism|desenvolv/.test(txt)) return 'terapias';
    return 'geral';
  }
  // Retorna array de atendimentos { data, guia, qtdSolic, qtdAut, cod, procedimento, solicitante, prestador, local,
  //   espec, cid, diarias, valor, faturamento, itens:[...], obsImpressas, obsNaoImpressas:[...], hipotese }
  function historicoAtendimentos(g){
    var ben = g.beneficiario||{};
    var base = _mmSeed('hist'+(ben.id||g.numero));
    var qtd = 40 + (base % 41); // 40 a 80 atendimentos, espalhados por ~2 anos
    var solicitanteFixo = (g.solicitante && g.solicitante!=='—') ? g.solicitante : 'JORDANA ALYRANDRA FARIAS DE MELO';
    // Linha de cuidado da guia atual → histórico CORRELATO (procedimentos/CID/observações da mesma linha)
    var linha = _linhaCuidadoDaGuia(g);
    var LC = _LINHAS_CUIDADO[linha] || _LINHAS_CUIDADO.geral;
    var out = [];
    // atendimentos partindo de hoje e recuando em passos variáveis (2 a 12 dias), cobrindo ~2 anos
    var acumDias = 0;
    var d0 = new Date();
    for(var i=0;i<qtd;i++){
      var s = _mmSeed('hist'+(ben.id||g.numero)+'#'+i);
      var proc = LC.procs[s % LC.procs.length];
      var passo = 2 + (s % 11); // dias entre atendimentos (variável)
      acumDias += (i===0 ? 0 : passo);
      var dt = new Date(d0.getTime() - acumDias*86400000 - (s%12)*3600000 - (s%50)*60000);
      var dataFmt = _fmtDataHora(dt);
      var numGuia = 14649711 - i; // sequência decrescente, estilo ERP
      var prestador = _HIST_PRESTADORES[s % _HIST_PRESTADORES.length];
      var local = _HIST_LOCAIS[s % _HIST_LOCAIS.length];
      var cid = LC.cids[s % LC.cids.length];
      var cidCod = cid.split(' - ')[0].replace('.','').slice(0,4);
      var qSol = 1, qAut = (s%9===0)?0:1; // ocasionalmente não autorizada
      var fat = _HIST_FAT[s % _HIST_FAT.length];
      out.push({
        data:dataFmt, dataObj:dt, guia:String(numGuia), qtdSolic:qSol, qtdAut:qAut,
        cod:proc.cod, procedimento:proc.desc, solicitante:solicitanteFixo,
        prestador:prestador, local:local, espec:proc.espec, cid:cidCod, linhaCuidado:linha,
        diarias:0, valor:proc.valor, faturamento:fat,
        itens:[{tipo:'Procedimento', cod:proc.cod, desc:proc.desc, qtdSolic:qSol, qtdAut:qAut, procJuridico:'—'}],
        obsImpressas:LC.obsImp[s % LC.obsImp.length],
        obsNaoImpressas:[{
          data:dataFmt, operador:prestador.split(' ')[0]+' '+(prestador.split(' ')[1]||''),
          podeInformar:(s%3===0)?'Sim':'Não', texto:LC.obsNi[s % LC.obsNi.length]
        }],
        hipotese:cid, atual:(i===0)
      });
    }
    return out;
  }
  function _fmtDataHora(d){
    var dd=('0'+d.getDate()).slice(-2), mm=('0'+(d.getMonth()+1)).slice(-2), yy=d.getFullYear();
    var hh=('0'+d.getHours()).slice(-2), mi=('0'+d.getMinutes()).slice(-2);
    return dd+'/'+mm+'/'+yy+' '+hh+':'+mi;
  }

  // ── Carências do beneficiário (determinístico por guia) ──
  // Tabela de carências no padrão ANS: cada item tem prazo (dias) a partir da data de inclusão.
  var CARENCIAS_DEF = [
    {nome:'URGÊNCIA & EMERGÊNCIA', dias:24},
    {nome:'CONSULTAS MÉDICAS ELETIVAS', dias:30},
    {nome:'EXAMES DE LABORATÓRIO, RAIO X S/C, ECG E OFTÁLMICOS SIMPLES', dias:30},
    {nome:'EXAMES OBSTETRICOS SIMPLES', dias:30},
    {nome:'PROCEDIMENTOS DE APOIO/DIAGNÓSTICO SIMPLES', dias:60},
    {nome:'DEMAIS PROCEDIMENTOS DE APOIO/DIAGNÓSTICO E ESPECIAIS E PAC', dias:180},
    {nome:'EXAMES OBSTETRICOS DE ALTA COMPLEXIDADE', dias:180},
    {nome:'INTERNAÇÕES', dias:180},
    {nome:'CIRURGIAS OBSTETRICAS', dias:300}
  ];
  function _addDias(dt, dias){ var d=new Date(dt.getTime()); d.setDate(d.getDate()+dias); return d; }
  function _fmtData(d){ var dd=('0'+d.getDate()).slice(-2), mm=('0'+(d.getMonth()+1)).slice(-2), yy=(''+d.getFullYear()).slice(-2); return dd+'/'+mm+'/'+yy; }
  // Retorna { inclusao, permanencia(dias ativos), itens:[{nome,vencimento,numeroDias,cumpridos,restantes,cumprida}], cpt:{ativo,texto,vencimento,cid} }
  function carenciasGuia(g){
    var ben = g.beneficiario||{};
    var pInc = _parseData(ben.dataInclusao);
    var dtInc = pInc ? new Date(pInc.y, pInc.m-1, pInc.d) : new Date(2021,5,30);
    var hoje = new Date();
    var permanencia = Math.max(0, Math.round((hoje - dtInc)/86400000)); // dias ativos
    var itens = CARENCIAS_DEF.map(function(c){
      var venc = _addDias(dtInc, c.dias);
      var cumprida = hoje >= venc;
      // dias já decorridos (limitado ao prazo) e restantes até o vencimento
      var decorridos = Math.min(c.dias, Math.max(0, Math.round((hoje - dtInc)/86400000)));
      var restantes = Math.max(0, c.dias - decorridos);
      return {
        nome:c.nome, vencimento:_fmtData(venc),
        numeroDias:c.dias, cumpridos:cumprida?c.dias:decorridos, restantes:cumprida?0:restantes,
        cumprida:cumprida
      };
    });
    // CPT (Cobertura Parcial Temporária) — determinística por número da guia
    var s=0, st=''+g.numero; for(var i=0;i<st.length;i++){ s=(s*31+st.charCodeAt(i))|0; } s=Math.abs(s);
    var temCPT = (s%3===0); // ~1/3 das guias com CPT a cumprir
    var cptVenc = _addDias(dtInc, 730); // CPT: até 24 meses
    var cpt = temCPT ? {
      ativo:true,
      cid:'F84 - Transt globais do desenvolv',
      vencimento:_fmtData(cptVenc),
      texto:'Beneficiário com CPT a cumprir'
    } : {ativo:false};
    return { inclusao:ben.dataInclusao||'—', permanencia:permanencia, itens:itens, cpt:cpt };
  }

  global.MOCK = {
    FLUXOS:FLUXOS, IA_POR_ETAPA:IA_POR_ETAPA, ESPEC_MAP:ESPEC_MAP, especialidadeDaGuia:especialidadeDaGuia,
    PROCEDIMENTOS:PROCEDIMENTOS, PACOTES:PACOTES, MATMED:MATMED, DIARIAS_TAXAS:DIARIAS_TAXAS,
    REGRAS_DUT:REGRAS_DUT, REGRAS_DOC:REGRAS_DOC,
    PRESTADORES:PRESTADORES, BENEFICIARIOS:BENEFICIARIOS, USUARIOS:USUARIOS,
    STATUS:STATUS, ORIGENS:ORIGENS, CATEGORIAS_ANEXO:CATEGORIAS_ANEXO,
    MOTIVOS_COMP:MOTIVOS_COMP, MOTIVOS_REPR:MOTIVOS_REPR, MOTIVOS_RESS:MOTIVOS_RESS,
    LOGS:LOGS, buildGuias: hydrate, matmedDetalhe: matmedDetalhe, opmeDetalhe: opmeDetalhe, procDetalhe: procDetalhe, observacoesGuia: observacoesGuia,
    calcIdade: calcIdade, anosContrato: anosContrato, cidGuia: cidGuia, carenciasGuia: carenciasGuia, historicoAtendimentos: historicoAtendimentos,
    naturezaDaGuia: naturezaDaGuia, naturezaDetalhada: naturezaDetalhada, SUB_INTERNACAO: SUB_INTERNACAO,
    naturezaSelectHTML: naturezaSelectHTML
  };
})(window);
