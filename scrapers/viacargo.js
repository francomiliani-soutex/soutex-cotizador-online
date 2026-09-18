// Cotizador en vivo de Via Cargo, vía automatización de su formulario público.
// No existe (o no pudimos capturar) un endpoint JSON estable y replicable con
// fetch/axios: el POST real a ws.busplus.com.ar/alerce/cotizar no expone su
// payload de forma consistente al inspeccionar la red del navegador, así que
// en vez de adivinar el formato replicamos el formulario tal cual lo llena
// un humano. Es más lento que un HTTP directo, pero mucho más confiable.

const URL = 'https://www.viacargo.com.ar/cotizar-envio/';

/**
 * @param {import('playwright').Browser} browser
 * @param {object} shipment
 * @param {string} shipment.origen       texto a tipear en "Origen", ej "San Francisco"
 * @param {string} shipment.origenOpcion texto (o substring) de la opción del dropdown a elegir, ej "SAN FRANCISCO (2400) - CORDOBA"
 * @param {string} shipment.destino
 * @param {string} shipment.destinoOpcion
 * @param {number} shipment.bultos
 * @param {number} shipment.pesoKg
 * @param {number} shipment.altoCm
 * @param {number} shipment.anchoCm
 * @param {number} shipment.profundidadCm
 * @param {number} shipment.valorDeclarado
 * @param {'origen'|'destino'} [shipment.pago] default 'origen'
 */
async function cotizarViaCargo(browser, shipment) {
  const {
    origen, origenOpcion, destino, destinoOpcion,
    bultos, pesoKg, altoCm, anchoCm, profundidadCm,
    valorDeclarado, pago = 'origen',
  } = shipment;

  const page = await browser.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await fillAutocomplete(page, 'Origen', origen, origenOpcion);
    await fillAutocomplete(page, 'Destino', destino, destinoOpcion);

    await page.getByPlaceholder('Ejemplo: 1 al 999').fill(String(bultos));
    await page.getByPlaceholder('Ejemplo: 10').fill(String(pesoKg));

    const dims = page.getByPlaceholder('Ejemplo: 5, 6, 7');
    await dims.nth(0).fill(String(altoCm));
    await dims.nth(1).fill(String(anchoCm));
    await dims.nth(2).fill(String(profundidadCm));

    await page.getByPlaceholder('$100000 - $1000000').fill(String(valorDeclarado));

    const radioLabel = pago === 'destino' ? 'Pago en destino' : 'Pago en origen';
    await page.getByText(radioLabel, { exact: true }).click();

    const botonCotizar = page.getByRole('button', { name: 'Cotizá' });
    await botonCotizar.click();

    // Espera a que aparezcan las tarjetas de resultado ("Producto" / "Valor")
    await page.getByText('Producto', { exact: true }).first().waitFor({ timeout: 20000 });

    const resultados = await page.evaluate(() => {
      const out = [];
      // Cada tarjeta de resultado tiene un heading con el nombre del producto
      // y, en el mismo bloque, un valor tipo "$61000".
      const cards = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && /^\$[\d.,]+$/.test(el.textContent.trim()));
      cards.forEach(valEl => {
        const valor = Number(valEl.textContent.replace(/[^\d]/g, ''));
        // buscamos hacia arriba el contenedor de la tarjeta para sacar el nombre
        let container = valEl.closest('div');
        let nombre = null;
        if (container && container.parentElement) {
          const heading = container.parentElement.querySelector('h1,h2,h3,h4,strong,b');
          nombre = heading ? heading.textContent.trim() : null;
        }
        out.push({ producto: nombre, valor });
      });
      return out;
    });

    return { ok: true, carrier: 'viacargo', resultados };
  } catch (err) {
    return { ok: false, carrier: 'viacargo', error: err.message };
  } finally {
    await page.close();
  }
}

async function fillAutocomplete(page, labelText, texto, opcionEsperada) {
  const input = page.getByPlaceholder('Provincia, localidad o CP').nth(labelText === 'Origen' ? 0 : 1);
  await input.click();
  await input.fill(texto);
  // El dropdown tarda un instante en filtrar contra el dataset local.
  const opcion = page.getByText(opcionEsperada, { exact: false }).first();
  await opcion.waitFor({ timeout: 10000 });
  await opcion.click();
}

module.exports = { cotizarViaCargo };
