"""
run_cotizador.py — corre en GitHub Actions cada X horas.

1. Cotiza un set de casos representativos (definidos en CASOS abajo) contra
   Cruz del Sur, Vía Cargo y OCA usando Playwright (navegador real).
2. Escribe el resultado en la pestaña "COTIZ_ONLINE" de la planilla real
   (TRAZABILIDAD DE ESTADOS-LOGISTICA-2026), usando una cuenta de servicio.

Variables de entorno esperadas (se configuran como Secrets en GitHub):
  GCP_SERVICE_ACCOUNT_JSON  -> contenido completo del JSON de la cuenta de servicio
  SHEET_ID                  -> id de la planilla (ya seteado abajo por default)
"""
import os
import json
import datetime

import gspread
from google.oauth2.service_account import Credentials

import cruz_del_sur
import via_cargo
import oca

SHEET_ID = os.environ.get("SHEET_ID", "1boeKgWx6eumTFtzVFHPasa72wlzK41uquBme7j6Ty7Y")
TAB_NAME = "COTIZ_ONLINE"

# Casos a cotizar en cada corrida. Se puede ampliar con más provincias/destinos.
CASOS = [
    {
        "nombre": "CABA -> CABA (caja 40x30x40, 10kg)",
        "origen_localidad": "Buenos Aires", "origen_cp": "1000", "origen_provincia": "CAPITAL FEDERAL",
        "destino_localidad": "Buenos Aires", "destino_cp": "1000", "destino_provincia": "CAPITAL FEDERAL",
        "ancho_cm": 40, "largo_cm": 30, "alto_cm": 40, "peso_kg": 10, "valor_declarado": 100000,
        "origen_calle": "Av Corrientes", "origen_nro": "1000",
        "destino_calle": "Av Rivadavia", "destino_nro": "5000",
    },
    # Agregar más casos acá si hace falta (otras provincias, otros pesos).
]


def conectar_sheet():
    creds_json = os.environ["GCP_SERVICE_ACCOUNT_JSON"]
    creds_dict = json.loads(creds_json)
    scopes = ["https://www.googleapis.com/auth/spreadsheets"]
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)
    try:
        ws = sh.worksheet(TAB_NAME)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=TAB_NAME, rows=200, cols=10)
    return ws


def cotizar_caso(caso: dict) -> dict:
    resultados = {}

    resultados["Cruz del Sur"] = cruz_del_sur.cotizar(
        origen_localidad=caso["origen_localidad"], origen_cp=caso["origen_cp"],
        origen_provincia=caso["origen_provincia"],
        destino_localidad=caso["destino_localidad"], destino_cp=caso["destino_cp"],
        destino_provincia=caso["destino_provincia"],
        ancho_cm=caso["ancho_cm"], largo_cm=caso["largo_cm"], alto_cm=caso["alto_cm"],
        peso_kg=caso["peso_kg"], valor_declarado=caso["valor_declarado"],
    )

    resultados["Vía Cargo"] = via_cargo.cotizar(
        origen_texto=caso["origen_localidad"], destino_texto=caso["destino_localidad"],
        bultos=1, peso_kg=caso["peso_kg"], alto_cm=caso["alto_cm"], ancho_cm=caso["ancho_cm"],
        profundidad_cm=caso["largo_cm"], valor_declarado=caso["valor_declarado"],
        forma_pago="origen",
    )

    resultados["OCA"] = oca.cotizar(
        origen_calle=caso.get("origen_calle", caso["origen_localidad"]),
        origen_nro=caso.get("origen_nro", "100"), origen_cp=caso["origen_cp"],
        destino_calle=caso.get("destino_calle", caso["destino_localidad"]),
        destino_nro=caso.get("destino_nro", "100"), destino_cp=caso["destino_cp"],
        alto_cm=caso["alto_cm"], largo_cm=caso["largo_cm"], ancho_cm=caso["ancho_cm"],
        peso_kg=caso["peso_kg"],
    )

    return resultados


def formatear_precio(res: dict) -> str:
    if not res.get("ok"):
        return "ERROR: " + str(res.get("error", ""))[:80]
    opciones = res.get("opciones", [])
    if not opciones:
        return "sin opciones"
    return " | ".join(
        f"{o.get('descripcion') or o.get('producto') or ''}: {o.get('precio_texto', '')}"
        for o in opciones[:3]
    )


def main():
    ws = conectar_sheet()
    ahora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")

    filas = [["Actualizado", ahora, "", "", ""]]
    filas.append(["Caso", "Cruz del Sur", "Vía Cargo", "OCA", "Detalle (JSON)"])

    for caso in CASOS:
        print(f"Cotizando: {caso['nombre']}")
        resultados = cotizar_caso(caso)
        fila = [
            caso["nombre"],
            formatear_precio(resultados["Cruz del Sur"]),
            formatear_precio(resultados["Vía Cargo"]),
            formatear_precio(resultados["OCA"]),
            json.dumps(resultados, ensure_ascii=False),
        ]
        filas.append(fila)
        print(json.dumps(resultados, indent=2, ensure_ascii=False))

    ws.clear()
    ws.update(range_name="A1", values=filas)
    print(f"Listo. {len(CASOS)} caso(s) escritos en la pestaña '{TAB_NAME}'.")


if __name__ == "__main__":
    main()
