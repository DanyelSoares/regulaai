/* RegulaAI — Solus Adapter (simulado)
 *
 * Endpoints REST esperados para integração real em PHP 5.4:
 *   GET  /api/solus/fluxos.php
 *   GET  /api/solus/guias.php
 *   GET  /api/solus/procedimentos.php
 *   GET  /api/solus/pacotes.php
 *   GET  /api/solus/matmed.php
 *   GET  /api/solus/diarias-taxas.php
 *   POST /api/parecer-operadora.php
 *   POST /api/sincronizacao.php
 *
 * Formato JSON esperado (exemplo):
 *   { "ok": true, "data": [ ... ], "lastSync": "2026-06-09 23:10:00" }
 *
 * Para migrar: substituir as funções abaixo por chamadas AJAX (XMLHttpRequest)
 * compatíveis com PHP 5.4. Não usar fetch ou async/await em produção legada.
 */
(function(global){
  var SyncLog = [];
  function log(msg, ok){ SyncLog.unshift({ts:new Date().toISOString(), ok:ok!==false, msg:msg}); }

  // Em produção, trocar por AJAX. Aqui retornamos os mocks.
  function syncFluxos(cb){ log('GET /api/solus/fluxos.php'); cb(null, MOCK.FLUXOS); }
  function syncProcedimentos(cb){ log('GET /api/solus/procedimentos.php'); cb(null, MOCK.PROCEDIMENTOS); }
  function syncPacotes(cb){ log('GET /api/solus/pacotes.php'); cb(null, MOCK.PACOTES); }
  function syncProdutosMatMed(cb){ log('GET /api/solus/matmed.php'); cb(null, MOCK.MATMED); }
  function syncDiariasTaxas(cb){ log('GET /api/solus/diarias-taxas.php'); cb(null, MOCK.DIARIAS_TAXAS); }
  function syncGuias(cb){ log('GET /api/solus/guias.php'); cb(null, MOCK.buildGuias()); }

  /* Mapeia campos do JSON Solus → modelo interno RegulaAI */
  function mapSolusGuideToInternalGuide(solusGuia){
    return {
      numero: solusGuia.nr_guia || solusGuia.numero,
      origem: 'Solus',
      tipo: solusGuia.tp_solicitacao,
      regime: solusGuia.regime,
      natureza: solusGuia.natureza,
      status: solusGuia.status,
      fluxoId: solusGuia.id_fluxo,
      procedimentos: solusGuia.procedimentos || [],
      pacotes: solusGuia.pacotes || [],
      matmed: solusGuia.matmed || [],
      diariasTaxas: solusGuia.diarias_taxas || []
    };
  }

  function getSyncLog(){ return SyncLog.slice(0,50); }

  global.Solus = {
    syncFluxos:syncFluxos, syncGuias:syncGuias, syncProcedimentos:syncProcedimentos,
    syncPacotes:syncPacotes, syncProdutosMatMed:syncProdutosMatMed, syncDiariasTaxas:syncDiariasTaxas,
    getSyncLog:getSyncLog, mapSolusGuideToInternalGuide:mapSolusGuideToInternalGuide
  };
})(window);
