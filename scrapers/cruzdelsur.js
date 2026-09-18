// Cruz del Sur — DESCARTADO del backend de cotización en vivo.
//
// Se investigaron las dos vías posibles y ninguna sirve para el uso real de
// Soutex (Franco: "trabajamos por muchas [localidades], no es factible"):
//
// 1) Cuenta comercial (https://clientes.cruzdelsur.com/Cotizacion.aspx):
//    NO es una calculadora instantánea. Al enviarla, muestra "El pedido de
//    cotización fue dirigido a su comercial con éxito. A la brevedad le
//    estaremos respondiendo." — o sea, la responde una persona más tarde,
//    no sirve para un precio al toque.
//
// 2) Cotizador público "particulares"
//    (https://www.cruzdelsur.com/herramientas_cotizaciones_particulares.php):
//    verificado en vivo el 17/09/2026 con dos pruebas reales:
//      - San Francisco (2400, Córdoba) → Capital Federal (1000):
//        error "No se pudo encontrar una sucursal cercana" (localidad sin
//        cobertura en este cotizador).
//      - Córdoba capital → Capital Federal:
//        error "El tramo ingresado no se puede cotizar por este medio.
//        Debe utilizar el Cotizador para Empresas." (ese tramo requiere
//        el cotizador empresarial, no el de particulares).
//    Es decir, la cobertura de este cotizador público es demasiado acotada
//    para una empresa que despacha a "muchas" localidades distintas — no
//    hay combinación de parámetros que lo haga confiable de forma genérica.
//
// Conclusión: Cruz del Sur queda fuera de las cotizaciones en vivo. Sigue
// cotizándose con el modelo de estimación histórica que la app ya tenía
// (ver pintarCotizar()/estimar() en app-traza/traza.tpl.html) hasta que
// aparezca una vía de cotización en vivo realmente confiable (por ejemplo,
// si Cruz del Sur habilita en el futuro una API de cuenta como la de OCA).
//
// Esta función se deja como stub para no romper index.js si algo la sigue
// importando, pero index.js YA NO la llama.
function cotizarCruzDelSur() {
  return Promise.resolve({
    ok: false,
    carrier: 'cruzdelsur',
    error: 'Cruz del Sur no tiene una vía de cotización en vivo confiable (ver comentario en este archivo). Usar la estimación histórica existente en la app.',
  });
}

module.exports = { cotizarCruzDelSur };
