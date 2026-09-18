const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { cotizarViaCargo } = require('./scrapers/viacargo');
const { cotizarOCA, listarLocalidades } = require('./scrapers/oca');

// Cruz del Sur QUEDA FUERA de la cotización en vivo (ver scrapers/cruzdelsur.js
// para el detalle de por qué: el cotizador público "particulares" tiene
// cobertura muy acotada -- ni siquiera cubre San Francisco (Córdoba) ni la
// ruta Córdoba capital<->CABA, que exige el "Cotizador para Empresas"-- y la
// cuenta comercial de Soutex no da un precio instantáneo, solo genera un
// pedido que responde un comercial más tarde. Con Soutex operando "por
// muchas" localidades distintas, ninguna de las dos vías es confiable como
// fuente de precio automático. Cruz del Sur sigue cotizándose con el modelo
// de estimación histórica que la app ya tenía antes de este proyecto.

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'soutex-cotizador-4en1' });
});

// AGREGADO 2026-09-18: autocompletado de localidad a partir del código
// postal, para el campo "Localidad" del panel de cotización en vivo en
// traza.tpl.html. Reutiliza el mismo endpoint de OCA que ya se usaba
// internamente para resolver el IdCodPostal antes de cotizar (sincronizar-
// region) -- no agrega ninguna llamada nueva a OCA, solo expone lo que esa
// llamada ya devolvía. Requiere la misma OCA_SESSION_COOKIE que /cotizar.
//
// GET /localidad?cp=2400
// → { ok:true, localidades:[{ localidad, provincia, cp }, ...] }
app.get('/localidad', async (req, res) => {
  const cp = (req.query.cp || '').trim();
  if (!cp) {
    return res.status(400).json({ ok: false, error: 'Falta el parámetro cp' });
  }
  try {
    const localidades = await listarLocalidades(cp);
    res.json({ ok: true, localidades });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Un único endpoint: recibe los datos del envío UNA vez y devuelve los
// resultados en vivo de Vía Cargo (Playwright) y OCA (API real de la cuenta
// ePak de Soutex). Cruz del Sur NO se cotiza acá (ver nota arriba). Ningún
// fallo individual tira abajo la respuesta completa: cada transporte
// devuelve su propio { ok, resultados|error }.
//
// Body esperado (ver README para el ejemplo completo):
// {
//   origen, origenOpcion,      // para Vía Cargo (texto tal como en su autocomplete)
//   destino, destinoOpcion,
//   origenCP, origenLocalidad, // para OCA (código postal + texto para desambiguar)
//   destinoCP, destinoLocalidad,
//   bultos, pesoKg,            // pesoKg = peso POR BULTO
//   altoCm, anchoCm, profundidadCm,
//   valorDeclarado,
// }
app.post('/cotizar', async (req, res) => {
  const shipment = req.body || {};

  const camposObligatorios = [
    'origen', 'origenOpcion', 'destino', 'destinoOpcion',
    'origenCP', 'destinoCP',
    'bultos', 'pesoKg', 'altoCm', 'anchoCm', 'profundidadCm', 'valorDeclarado',
  ];
  const faltantes = camposObligatorios.filter(c => shipment[c] === undefined || shipment[c] === null || shipment[c] === '');
  if (faltantes.length) {
    return res.status(400).json({ error: 'Faltan campos', faltantes });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    const [viaCargo, oca] = await Promise.all([
      cotizarViaCargo(browser, shipment),
      cotizarOCA({
        origenCP: shipment.origenCP,
        origenLocalidad: shipment.origenLocalidad || shipment.origen,
        destinoCP: shipment.destinoCP,
        destinoLocalidad: shipment.destinoLocalidad || shipment.destino,
        bultos: shipment.bultos,
        pesoKg: shipment.pesoKg,
        altoCm: shipment.altoCm,
        largoCm: shipment.profundidadCm,
        anchoCm: shipment.anchoCm,
        valorDeclarado: shipment.valorDeclarado,
      }),
    ]);

    res.json({
      shipment,
      cotizadoEl: new Date().toISOString(),
      viacargo: viaCargo,
      oca,
      cruzdelsur: {
        ok: false,
        carrier: 'cruzdelsur',
        error: 'No cotizable automáticamente: usar la estimación histórica existente en la app.',
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno al cotizar', detalle: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Soutex cotizador 4-en-1 escuchando en puerto ${PORT}`);
});
