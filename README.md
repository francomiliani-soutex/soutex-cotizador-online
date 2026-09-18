# Cotizador 2-en-1 — backend (Vía Cargo + OCA en vivo)

Servicio que recibe los datos de UN envío y devuelve, en una sola respuesta,
la cotización en vivo de Vía Cargo (Playwright, formulario público) y OCA
(API real de la cuenta comercial ePak de Soutex, sin necesidad de navegador).

**Cruz del Sur queda afuera** (ver "Por qué Cruz del Sur no está" más abajo)
— sigue cotizándose con la estimación histórica que la app ya tenía.

## Estado actual

- **Vía Cargo**: probado en vivo, funciona (`scrapers/viacargo.js`).
- **OCA**: probado en vivo, funciona (`scrapers/oca.js`) — usa la API real
  del portal ePak (`ocaepak.oca.com.ar`), con las tarifas negociadas de la
  cuenta de Soutex. Requiere una cookie de sesión válida (ver más abajo).
- **Cruz del Sur**: descartado del backend (`scrapers/cruzdelsur.js` es un
  stub que siempre devuelve `ok:false`, index.js ya no lo llama).

## Por qué Cruz del Sur no está

Se probaron las dos vías posibles y ninguna sirve para una empresa que
despacha a muchas localidades distintas:

1. **Cuenta comercial** (`clientes.cruzdelsur.com`): no es una calculadora
   instantánea — el formulario de "Pedido de cotización" solo genera un
   pedido que un comercial responde después.
2. **Cotizador público "particulares"**: probado en vivo con dos rutas
   reales — San Francisco (Córdoba) → Capital Federal dio "No se pudo
   encontrar una sucursal cercana" (sin cobertura), y Córdoba capital →
   Capital Federal dio "El tramo ingresado no se puede cotizar por este
   medio. Debe utilizar el Cotizador para Empresas." La cobertura es
   demasiado acotada para un uso genérico.

Si en el futuro Cruz del Sur habilita una API de cuenta como la de OCA,
conviene reconstruir `cruzdelsur.js` de la misma forma (HTTP directo, sin
navegador).

## Sesión de OCA (`OCA_SESSION_COOKIE`)

`scrapers/oca.js` llama directamente a la API del portal ePak, pero esa API
exige estar logueado. Como no se puede automatizar el login (usuario y
contraseña los maneja Franco), el backend recibe la sesión ya iniciada como
variable de entorno:

1. Franco inicia sesión normalmente en `https://ocaepak.oca.com.ar` desde su
   navegador.
2. Con las herramientas de desarrollador del navegador (pestaña "Network" o
   "Application → Cookies"), copia el valor completo del header `Cookie` que
   el navegador manda a `ocaepak.oca.com.ar`.
3. Ese valor se carga como variable de entorno `OCA_SESSION_COOKIE` en Render
   / Railway (o en un archivo `.env` local).

**Ojo**: esa cookie expira (la sesión del portal tiene un tiempo de vida
limitado). Cuando `oca.js` empiece a devolver `ok:false` con error de sesión,
hay que repetir estos 3 pasos y actualizar la variable de entorno. Es la
única parte manual de todo el proceso.

## Probar en local

```bash
npm install
npm start
```

Variable de entorno necesaria para que OCA funcione:

```bash
export OCA_SESSION_COOKIE="pegar acá la cookie completa"
```

Luego:

```bash
curl -X POST http://localhost:3000/cotizar \
  -H "Content-Type: application/json" \
  -d '{
    "origen": "San Francisco",
    "origenOpcion": "SAN FRANCISCO (2400) - CORDOBA",
    "destino": "Capital Federal",
    "destinoOpcion": "RETIRO (1000) - CAPITAL FEDERAL",
    "origenCP": "2400",
    "origenLocalidad": "SAN FRANCISCO",
    "destinoCP": "1000",
    "destinoLocalidad": "CAPITAL FEDERAL",
    "bultos": 2,
    "pesoKg": 10,
    "altoCm": 40,
    "anchoCm": 30,
    "profundidadCm": 40,
    "valorDeclarado": 300000
  }'
```

Con estos datos reales verificados, OCA devuelve `$37.861,83 + IVA` (operativa
"ePak - Estandar SaP - Generica", 3 días de entrega) y Vía Cargo devuelve
`$61.000` (entrega a domicilio) / `$49.000` (despacho agencia-entrega domicilio).
Cruz del Sur devuelve siempre `ok:false` con el mensaje explicando que no es
cotizable automáticamente.

## Deploy en Render (gratis)

1. Subí esta carpeta a un repo de GitHub.
2. En [render.com](https://render.com) → **New +** → **Web Service** → conectá el repo.
3. Configuración:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: agregá `OCA_SESSION_COOKIE` con el valor descripto arriba.
4. Render corre `postinstall` solo, que instala Chromium para Playwright (necesario para Vía Cargo) — la primera build puede tardar varios minutos.
5. Una vez desplegado, Render te da una URL tipo `https://soutex-cotizador.onrender.com`. Esa es la URL que va a llamar `traza.tpl.html`.

**Nota sobre el free tier**: tanto Render como Railway "duermen" el servicio tras un rato sin uso, y la primera consulta después de eso tarda más (arranca el contenedor + navegador). Para un uso esporádico (cotizar unos pocos envíos por día) es aceptable; si se vuelve un uso intensivo, conviene pasar a un plan pago para que no "duerma".

## Deploy en Railway (alternativa)

1. Subí el repo a GitHub.
2. En [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Railway detecta Node automáticamente; el `postinstall` instala Chromium igual que en Render.
4. Agregá la variable de entorno `OCA_SESSION_COOKIE` en la configuración del servicio.
5. Railway te da una URL pública para el servicio.

## Pendiente antes de conectar con la app

- Confirmar con Franco qué operativa(s) de OCA usar por defecto según tipo de caja/entrega (`scrapers/oca.js` → `OPERATIVAS`).
- Definir el proceso para renovar `OCA_SESSION_COOKIE` cuando expire.
- Actualizar `traza.tpl.html` (`#p-cot`) para que llame a `POST /cotizar` de esta URL y muestre los resultados de Vía Cargo y OCA en vivo, dejando Cruz del Sur con su tarjeta de estimación histórica como está hoy.
