import logging
import os
from datetime import date, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

# Imports opcionales para integración con Google Sheets
try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuración de Google Sheets
GOOGLE_SHEETS_CREDENTIALS = os.getenv("GOOGLE_SHEETS_CREDENTIALS", "credentials.json")
GOOGLE_SHEETS_NAME = os.getenv("GOOGLE_SHEETS_NAME", "Pedidos")
GOOGLE_SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

app = FastAPI(title="Keto Bakery - Sistema de Pedidos y Entregas")

# Configurar archivos estáticos y plantillas
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# Modelos de datos (Pydantic)
class ProductCreate(BaseModel):
    name: str = Field(..., example="Pan de Molde de Almendras")
    price: float = Field(..., example=6500.0)
    category: str = Field("Panes", example="Panes")


class Product(ProductCreate):
    id: int


class OrderItem(BaseModel):
    product_id: int
    quantity: int = Field(1, ge=1)
    unit_price: Optional[float] = None
    product_name: Optional[str] = None


class OrderCreate(BaseModel):
    client_name: str = Field(..., example="Laura Gómez")
    phone: Optional[str] = Field("", example="+54 9 11 4567-8901")
    items: str = Field(..., example="1x Pan Keto Sésamo, 2x Cheesecake Almendra")
    delivery_date: str = Field(..., example=str(date.today()))
    address: Optional[str] = Field("", example="Av. Cabildo 2400, CABA")
    status: str = Field("Pendiente", example="Pendiente")
    total_price: float = Field(..., example=12500.0)
    notes: Optional[str] = Field("", example="Sin semillas de girasol por alergia")
    selected_items: Optional[List[OrderItem]] = None


class Order(OrderCreate):
    id: int


# Base de datos en memoria para Productos (Catálogo)
products_db: List[Product] = [
    Product(id=1, name="Pan de Molde de Almendras (Keto)", price=6500.0, category="Panes"),
    Product(id=2, name="Alfajores Harina de Coco (Pack x6)", price=3600.0, category="Dulces"),
    Product(id=3, name="Cheesecake de Frutos Rojos", price=11500.0, category="Postres"),
    Product(id=4, name="Box 4 Donas Cacao", price=5800.0, category="Dulces"),
    Product(id=5, name="Tarta Keto Maracuyá & Coco", price=10500.0, category="Postres"),
    Product(id=6, name="Pan Baguette Keto de Lino y Almendra", price=3500.0, category="Panes"),
    Product(id=7, name="Keto Cinnamon Rolls (Pack x4)", price=6800.0, category="Facturas"),
    Product(id=8, name="Bagel de Queso Keto", price=2600.0, category="Panes"),
]

product_id_counter = 9


# Base de datos en memoria para Pedidos
today_str = str(date.today())
tomorrow_str = str(date.today() + timedelta(days=1))
next_week_str = str(date.today() + timedelta(days=3))

orders_db: List[Order] = [
    Order(
        id=1,
        client_name="Camila Rossi",
        phone="+54 9 11 5544-3322",
        items="2x Pan de Molde de Almendras (Keto), 1x Box 4 Donas Cacao",
        delivery_date=today_str,
        address="Palermo, Gorriti 4800",
        status="En Preparación",
        total_price=18800.0,
        notes="Enviar aviso por WhatsApp 10 min antes",
    ),
    Order(
        id=2,
        client_name="Mateo Benítez",
        phone="+54 9 11 2233-4455",
        items="1x Tarta Keto Maracuyá & Coco, 1x Alfajores Harina de Coco (Pack x6)",
        delivery_date=today_str,
        address="Belgrano, Moldes 1900",
        status="Pendiente",
        total_price=14100.0,
        notes="Dejar en guardia de recepcion",
    ),
    Order(
        id=3,
        client_name="Valentina Morales",
        phone="+54 9 11 9988-7766",
        items="3x Pan Baguette Keto de Lino y Almendra, 1x Cheesecake de Frutos Rojos",
        delivery_date=tomorrow_str,
        address="Recoleta, Quintana 350",
        status="Listo para Entrega",
        total_price=22000.0,
        notes="Cliente recurrente - Envío prioritario",
    ),
    Order(
        id=4,
        client_name="Gonzalo Fernández",
        phone="+54 9 11 3344-5566",
        items="2x Keto Cinnamon Rolls (Pack x4), 1x Bagel de Queso Keto",
        delivery_date=next_week_str,
        address="Caballito, Av. Pedro Goyena 1100",
        status="Pendiente",
        total_price=16200.0,
        notes="Apto celíacos estricto",
    ),
]

order_id_counter = 5


# Endpoints Web
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Renderiza la pantalla principal del gestor de pedidos."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "today_date": today_str,
        },
    )


# Endpoints REST - Catálogo de Productos
@app.get("/api/products", response_model=List[Product])
async def get_products():
    """Obtiene la lista completa de productos del catálogo."""
    return products_db


@app.post("/api/products", response_model=Product, status_code=201)
async def create_product(product_data: ProductCreate):
    """Crea un nuevo producto en el catálogo."""
    global product_id_counter
    new_product = Product(id=product_id_counter, **product_data.model_dump())
    product_id_counter += 1
    products_db.append(new_product)
    return new_product


@app.put("/api/products/{product_id}", response_model=Product)
async def update_product(product_id: int, product_data: ProductCreate):
    """Actualiza un producto existente en el catálogo."""
    for idx, prod in enumerate(products_db):
        if prod.id == product_id:
            updated_product = Product(id=product_id, **product_data.model_dump())
            products_db[idx] = updated_product
            return updated_product
    raise HTTPException(status_code=404, detail="Producto no encontrado")


@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int):
    """Elimina un producto del catálogo."""
    global products_db
    initial_length = len(products_db)
    products_db = [p for p in products_db if p.id != product_id]
    if len(products_db) == initial_length:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return {"message": f"Producto #{product_id} eliminado exitosamente"}


# Endpoints REST - Pedidos
@app.get("/api/orders", response_model=List[Order])
async def get_orders(
    delivery_date: Optional[str] = Query(
        None, description="Filtrar por fecha YYYY-MM-DD"
    ),
    status: Optional[str] = Query(
        None, description="Filtrar por estado del pedido"
    ),
    search: Optional[str] = Query(
        None, description="Buscar por nombre de cliente o dirección"
    ),
):
    """Obtiene la lista de pedidos con opciones de filtrado."""
    filtered = orders_db
    if delivery_date:
        filtered = [o for o in filtered if o.delivery_date == delivery_date]
    if status and status != "TODOS":
        filtered = [o for o in filtered if o.status == status]
    if search:
        s = search.lower().strip()
        filtered = [
            o
            for o in filtered
            if s in o.client_name.lower()
            or s in o.address.lower()
            or s in o.items.lower()
        ]
    return filtered


def get_google_worksheet(client: "gspread.Client", target_name: str):
    """
    Busca y abre la planilla de Google Sheets de forma segura (por título, URL o ID)
    y retorna la primera hoja de trabajo (worksheet / solapa).
    """
    target = target_name.strip()
    sheet = None

    if target.startswith("http://") or target.startswith("https://"):
        sheet = client.open_by_url(target)
    else:
        # 1. Intentar abrir por el título especificado
        try:
            sheet = client.open(target)
        except gspread.exceptions.SpreadsheetNotFound:
            # 2. Intentar abrir por ID/Key
            try:
                sheet = client.open_by_key(target)
            except Exception:
                pass

        # 3. Intentar nombres alternativos/fallbacks comunes
        if not sheet:
            for fallback in ["Pedidos", "Pedidos Keto Bakery", "Keto Bakery Pedidos"]:
                try:
                    sheet = client.open(fallback)
                    if sheet:
                        logger.info(f"Planilla abierta mediante nombre fallback: '{fallback}'")
                        break
                except Exception:
                    pass

        # 4. Si aún no se encuentra, abrir la primera planilla accesible para el service account
        if not sheet:
            files = client.list_spreadsheet_files()
            if files:
                sheet = client.open_by_key(files[0]["id"])
                logger.info(f"Planilla abierta desde la lista de accesibles: '{sheet.title}'")

    if not sheet:
        raise Exception(f"No se encontró ninguna planilla accesible con el nombre o ID: '{target_name}'")

    # Obtener la primera solapa (worksheet) de forma segura usando get_worksheet(0)
    worksheet = sheet.get_worksheet(0)
    if not worksheet:
        try:
            worksheet = sheet.sheet1
        except Exception:
            pass
    if not worksheet:
        worksheets = sheet.worksheets()
        if worksheets:
            worksheet = worksheets[0]

    if not worksheet:
        raise Exception(f"La planilla '{sheet.title}' no contiene ninguna solapa válida.")

    return worksheet


def append_order_to_google_sheets(order: Order) -> bool:
    """
    Registra una nueva fila en la planilla de Google Sheets con los datos del pedido:
    [nombre del cliente, productos con su cantidad, fecha de entrega, precio total]
    """
    if not GSPREAD_AVAILABLE:
        logger.warning("gspread o google-auth no están disponibles en el entorno.")
        return False

    if not os.path.exists(GOOGLE_SHEETS_CREDENTIALS):
        logger.warning(
            f"No se encontró el archivo de credenciales '{GOOGLE_SHEETS_CREDENTIALS}'. "
            "El pedido se guardó localmente sin sincronizar con Google Sheets."
        )
        return False

    try:
        creds = Credentials.from_service_account_file(
            GOOGLE_SHEETS_CREDENTIALS, scopes=GOOGLE_SHEETS_SCOPES
        )
        client = gspread.authorize(creds)

        worksheet = get_google_worksheet(client, GOOGLE_SHEETS_NAME)

        row = [
            order.client_name,
            order.items,
            order.delivery_date,
            order.total_price,
        ]

        worksheet.append_row(row)
        logger.info(f"Pedido #{order.id} ('{order.client_name}') registrado exitosamente en Google Sheets ({worksheet.spreadsheet.title} -> {worksheet.title}).")
        return True
    except Exception as e:
        logger.error(f"Error al sincronizar el pedido #{order.id} en Google Sheets: {e}")
        return False


@app.post("/api/orders", response_model=Order, status_code=201)
async def create_order(order_data: OrderCreate):
    """Crea un nuevo pedido de panadería keto."""
    global order_id_counter
    new_order = Order(id=order_id_counter, **order_data.model_dump())
    order_id_counter += 1
    orders_db.append(new_order)

    # Sincronizar con Google Sheets
    append_order_to_google_sheets(new_order)

    return new_order


@app.patch("/api/orders/{order_id}/status", response_model=Order)
async def update_order_status(order_id: int, status: str = Query(...)):
    """Actualiza el estado de un pedido."""
    for order in orders_db:
        if order.id == order_id:
            order.status = status
            return order
    raise HTTPException(status_code=404, detail="Pedido no encontrado")


@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: int):
    """Elimina un pedido del sistema."""
    global orders_db
    orders_db = [o for o in orders_db if o.id != order_id]
    return {"message": f"Pedido #{order_id} eliminado exitosamente"}

