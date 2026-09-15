"""
Conector Cruz del Sur - versión Playwright.
El sitio usa Cloudflare Bot Management: un POST crudo (requests) es detectado
y devuelve la página sin procesar. Con un navegador real (headless Chromium)
pasa sin problema, igual que validamos a mano.
"""
from playwright.sync_api import sync_playwright

FORM_URL = "https://www.cruzdelsur.com/herramientas_cotizaciones_particulares.php"

PROVINCIAS = {
    "SALTA": "SALTA", "JUJUY": "JUJUY", "SANTIAGO DEL ESTERO": "SANTIAGO DEL ESTERO",
    "FORMOSA": "FORMOSA", "CHACO": "CHACO", "ENTRE RIOS": "ENTRE RIOS",
    "CORRIENTES": "CORRIENTES", "MISIONES": "MISIONES", "CAPITAL FEDERAL": "CAPITAL FEDERAL",
    "CORDOBA": "CORDOBA", "SANTA FE": "SANTA FE", "SAN LUIS": "SAN LUIS",
    "BUENOS AIRES": "BUENOS AIRES", "LA PAMPA": "LA PAMPA", "MENDOZA": "MENDOZA",
    "SAN JUAN": "SAN JUAN", "NEUQUEN": "NEUQUEN", "RIO NEGRO": "RIO NEGRO",
    "CHUBUT": "CHUBUT", "SANTA CRUZ": "SANTA CRUZ", "TIERRA DEL FUEGO": "TIERRA DEL FUEGO",
    "TUCUMAN": "TUCUMAN", "CATAMARCA": "CATAMARCA", "LA RIOJA": "LA RIOJA",
    "GRAN BUENOS AIRES": "GRAN BUENOS AIRES",
}


def cotizar(
    origen_localidad: str,
    origen_cp: str,
    origen_provincia: str,
    destino_localidad: str,
    destino_cp: str,
    destino_provincia: str,
    ancho_cm: float,
    largo_cm: float,
    alto_cm: float,
    peso_kg: float,
    valor_declarado: float,
    headless: bool = True,
    timeout_ms: int = 25000,
) -> dict:
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            page = browser.new_page()
            page.goto(FORM_URL, timeout=timeout_ms)

            # Remitente
            page.locator("input[name='RemitenteLocalidad']").fill(origen_localidad)
            page.locator("input[name='RemitenteCodigoPostal']").fill(str(origen_cp))
            page.locator("select[name='RemitenteProvincia']").select_option(label=origen_provincia.upper())

            # Destinatario
            page.locator("input[name='DestinatarioLocalidad']").fill(destino_localidad)
            page.locator("input[name='DestinatarioCodigoPostal']").fill(str(destino_cp))
            page.locator("select[name='DestinatarioProvincia']").select_option(label=destino_provincia.upper())

            # Producto
            page.locator("input[name='MercaderiaAncho']").fill(str(ancho_cm))
            page.locator("input[name='MercaderiaLargo']").fill(str(largo_cm))
            page.locator("input[name='MercaderiaAlto']").fill(str(alto_cm))
            page.locator("input[name='MercaderiaPesoUnidad']").fill(str(peso_kg))
            page.locator("input[name='MercaderiaValorDeclarado']").fill(str(valor_declarado))

            page.get_by_role("button", name="Cotizá").click()
            page.wait_for_url("**herramientas_cotizaciones_particulares_detalles.php*", timeout=timeout_ms)
            page.wait_for_timeout(1000)

            texto = page.locator("body").inner_text()
            url_resultado = page.url
            browser.close()

            opciones = _parsear_opciones(texto)
            if not opciones:
                return {
                    "transporte": "Cruz del Sur", "ok": False,
                    "error": "No se detectaron precios en el resultado (revisar selectores)",
                    "url_resultado": url_resultado,
                }
            return {"transporte": "Cruz del Sur", "ok": True, "opciones": opciones, "url_resultado": url_resultado}

    except Exception as e:
        return {"transporte": "Cruz del Sur", "ok": False, "error": str(e)}


def _parsear_opciones(texto: str) -> list:
    import re
    opciones = []
    # Filas visibles tipo: "Retiro en sucursal 24 Hs. / 72 Hs. $ 22512,00 ..."
    for m in re.finditer(r"\$\s?[\d.,]+", texto):
        inicio = max(0, m.start() - 80)
        contexto = texto[inicio:m.start()].strip().split("\n")[-1]
        opciones.append({"descripcion": contexto, "precio_texto": m.group(0)})
    return opciones


if __name__ == "__main__":
    import json
    resultado = cotizar(
        origen_localidad="Buenos Aires", origen_cp="1000", origen_provincia="CAPITAL FEDERAL",
        destino_localidad="Buenos Aires", destino_cp="1000", destino_provincia="CAPITAL FEDERAL",
        ancho_cm=40, largo_cm=30, alto_cm=40, peso_kg=10, valor_declarado=100000,
    )
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
