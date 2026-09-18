// OCA no tiene cotizador público, pero Soutex SÍ tiene cuenta comercial en el
// portal ePak (https://ocaepak.oca.com.ar), y ese portal expone una API JSON
// real (confirmada en vivo el 17/09/2026 inspeccionando la red del navegador
// mientras Franco estaba logueado con la cuenta de Soutex):
//
//   1) POST https://ocaepak.oca.com.ar/middleware/canalizador/sincronizar-region
//      body: { "cp": "2400" }
//      → lista de localidades para ese código postal, cada una con su
//        "IdCodPostal" (el ID que pide el paso 2, NO es el código postal).
//
//   2) POST https://ocaepak.oca.com.ar/middleware/envio/calcular
//      body: {
//        "idoperativa": 419467,        // ver OPERATIVAS abajo
//        "idcodpostalori": 1077,       // IdCodPostal de origen (paso 1)
//        "idcodpostaldes": 1,          // IdCodPostal de destino (paso 1)
//        "cpori": "", "cpdest": "",
//        "cantidadpaquetes": 2,
//        "pesototal": 20,              // peso TOTAL (todos los bultos sumados)
//        "volumentotal": 0.096,        // m3 TOTAL
//        "valordeclarado": 300000
//      }
//      → [{ "Precio":37861.83, "Ambito":"Nacional 1", "PlazoEntrega":3,
//           "Adicional":0, "Total":37861.83, ... }]
//
// Ambas llamadas requieren estar autenticado en el portal (cookie de sesión).
// Esta función NO inicia sesión por sí sola: recibe la cookie ya armada
// (variable de entorno OCA_SESSION_COOKIE) que hay que refrescar a mano cada
// tanto (ver README, sección "Sesión de OCA").
//
// Ejemplo real verificado: San Francisco (2400, Córdoba) → Capital Federal
// (1000), operativa 419467 "ePak - Estandar SaP - Generica", 2 bultos, 10kg
// c/u, 40x40x30cm, $300.000 declarado → $37.861,83 + IVA, 3 días de entrega.
//
// AGREGADO 2026-09-18: se reutiliza el mismo endpoint de sincronizar-region
// para dar autocompletado de localidad a partir del código postal en
// traza.tpl.html (ver listarLocalidades / GET /localidad en index.js). Es la
// misma llamada que ya se usaba para resolver el IdCodPostal antes de
// cotizar, solo que ahora también se expone su resultado crudo.

const BASE = 'https://ocaepak.oca.com.ar';

// Operativas propias de la cuenta de Soutex, tal como aparecen en el
// desplegable "Seleccionar operativa" del portal. Puede haber más: si hace
// falta otra, se agrega acá con su id real (se ve en el mismo desplegable).
const OPERATIVAS = {
  ESTANDAR_GENERICA: 419467,       // ePak - Estandar SaP - Generica
  PYME_LOG_INV_DEV_SAP: 447797,    // Standard Pyme Log Inv Dev SaP
  PYME_LOG_INV_DEV_PAP: 447796,    // Standard Pyme Log Inv Dev PaP
  PYME_LOG_INV_CAM_SAP: 447795,    // Standard Pyme Log Inv Cam SaP
  PYME_LOG_INV_CAM_PAP: 447794,    // Standard Pyme Log Inv Cam PaP
};

function headers() {
  const cookie = process.env.OCA_SESSION_COOKIE;
  if (!cookie) {
    throw new Error('Falta la variable de entorno OCA_SESSION_COOKIE (sesión del portal ePak)');
  }
  return {
    'Content-Type': 'application/json',
    'Cookie': cookie,
    'Origin': BASE,
    'Referer': BASE + '/envios',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  };
}

/**
 * Llama a sincronizar-region y devuelve la lista cruda de localidades que
 * OCA conoce para ese código postal (puede haber más de una: un mismo CP a
 * veces cubre varios parajes/localidades).
 */
async function listarLocalidadesCrudo(cp) {
  const res = await fetch(`${BASE}/middleware/canalizador/sincronizar-region`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ cp: String(cp) }),
  });
  if (!res.ok) throw new Error(`sincronizar-region respondió ${res.status}`);
  const localidades = await res.json();
  if (!Array.isArray(localidades)) throw new Error('Respuesta inesperada de sincronizar-region');
  return localidades;
}

/**
 * Versión para el endpoint /localidad: solo lo que hace falta para el
 * autocompletado en la app (sin el IdCodPostal interno, que no le importa
 * al navegador).
 */
async function listarLocalidades(cp) {
  const crudo = await listarLocalidadesCrudo(cp);
  return crudo.map(l => ({
    localidad: l.Localidad,
    provincia: l.provinciaDescripcion,
    cp: l.CodigoPostal,
  }));
}

async function buscarIdCodPostal(cp, localidadTexto) {
  const localidades = await listarLocalidadesCrudo(cp);
  if (!localidades.length) {
    throw new Error(`Sin localidades para el CP ${cp}`);
  }
  if (localidadTexto) {
    const match = localidades.find(l => l.Localidad && l.Localidad.toUpperCase().includes(localidadTexto.toUpperCase()));
    if (match) return match.IdCodPostal;
  }
  // Si no se especifica localidad (o no matchea), se usa la primera opción del CP.
  return localidades[0].IdCodPostal;
}

/**
 * @param {object} shipment
 * @param {string|number} shipment.origenCP
 * @param {string} [shipment.origenLocalidad]  texto para desambiguar dentro del CP (ej "SAN FRANCISCO")
 * @param {string|number} shipment.destinoCP
 * @param {string} [shipment.destinoLocalidad]
 * @param {number} shipment.bultos
 * @param {number} shipment.pesoKg        peso POR BULTO
 * @param {number} shipment.altoCm
 * @param {number} shipment.largoCm
 * @param {number} shipment.anchoCm
 * @param {number} shipment.valorDeclarado
 * @param {number} [shipment.idOperativa]  default OPERATIVAS.ESTANDAR_GENERICA
 */
async function cotizarOCA(shipment) {
  try {
    const {
      origenCP, origenLocalidad, destinoCP, destinoLocalidad,
      bultos, pesoKg, altoCm, largoCm, anchoCm, valorDeclarado,
      idOperativa = OPERATIVAS.ESTANDAR_GENERICA,
    } = shipment;

    const [idOrigen, idDestino] = await Promise.all([
      buscarIdCodPostal(origenCP, origenLocalidad),
      buscarIdCodPostal(destinoCP, destinoLocalidad),
    ]);

    const pesoTotal = bultos * pesoKg;
    const volumenTotal = bultos * (altoCm / 100) * (largoCm / 100) * (anchoCm / 100);

    const res = await fetch(`${BASE}/middleware/envio/calcular`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        idoperativa: idOperativa,
        idcodpostalori: idOrigen,
        idcodpostaldes: idDestino,
        cpori: '',
        cpdest: '',
        cantidadpaquetes: bultos,
        pesototal: pesoTotal,
        volumentotal: Number(volumenTotal.toFixed(3)),
        valordeclarado: valorDeclarado,
      }),
    });

    if (!res.ok) throw new Error(`calcular respondió ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      return { ok: false, carrier: 'oca', error: 'La cotización no devolvió resultados (¿ruta sin cobertura para esta operativa?)' };
    }

    return {
      ok: true,
      carrier: 'oca',
      resultados: data.map(r => ({
        producto: `OCA - ${r.Ambito || 'operativa'} (${r.PlazoEntrega} días)`,
        valor: r.Total,
        detalle: r,
      })),
    };
  } catch (err) {
    return { ok: false, carrier: 'oca', error: err.message };
  }
}

module.exports = { cotizarOCA, listarLocalidades, OPERATIVAS };
