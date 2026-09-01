// Estado global de la aplicación
let activeDateFilter = '';
let activeStatusFilter = 'TODOS';
let searchQuery = '';

let products = []; // Catálogo de productos desde el backend
let selectedOrderItems = []; // Items seleccionados para el nuevo pedido

let catalogSearch = '';
let catalogCategory = 'TODAS';

document.addEventListener('DOMContentLoaded', async () => {
    // Establecer la fecha actual como predeterminada en el formulario
    const todayInput = document.getElementById('orderDeliveryDate');
    if (todayInput && window.TODAY_DATE) {
        todayInput.value = window.TODAY_DATE;
    }

    // Cargar productos y luego los pedidos
    await fetchProducts();
    fetchOrders();

    // Agregar 1 fila inicial por defecto en el selector de productos de pedido
    if (selectedOrderItems.length === 0) {
        addOrderItemRow();
    }

    // Listeners del formulario de nuevo pedido
    const orderForm = document.getElementById('newOrderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', handleCreateOrder);
    }

    // Listeners del formulario de nuevo producto
    const productForm = document.getElementById('newProductForm');
    if (productForm) {
        productForm.addEventListener('submit', handleCreateProduct);
    }

    // Listener del formulario de edicion de producto
    const editPriceForm = document.getElementById('editPriceForm');
    if (editPriceForm) {
        editPriceForm.addEventListener('submit', handleUpdateProduct);
    }

    // Listeners de filtros de pedidos
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            fetchOrders();
        });
    }

    const statusSelect = document.getElementById('statusFilterSelect');
    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            activeStatusFilter = e.target.value;
            fetchOrders();
        });
    }

    // Listeners de filtros del catálogo
    const catalogSearchInput = document.getElementById('catalogSearchInput');
    if (catalogSearchInput) {
        catalogSearchInput.addEventListener('input', (e) => {
            catalogSearch = e.target.value;
            renderCatalogTable();
        });
    }

    const catalogCategoryFilter = document.getElementById('catalogCategoryFilter');
    if (catalogCategoryFilter) {
        catalogCategoryFilter.addEventListener('change', (e) => {
            catalogCategory = e.target.value;
            renderCatalogTable();
        });
    }
});

// Navegación entre Pestañas (Tabs)
function switchTab(tabName) {
    const viewOrders = document.getElementById('viewOrders');
    const viewCatalog = document.getElementById('viewCatalog');
    const btnOrders = document.getElementById('tabBtnOrders');
    const btnCatalog = document.getElementById('tabBtnCatalog');

    if (tabName === 'orders') {
        viewOrders.style.display = 'block';
        viewCatalog.style.display = 'none';
        btnOrders.classList.add('active');
        btnCatalog.classList.remove('active');
    } else if (tabName === 'catalog') {
        viewOrders.style.display = 'none';
        viewCatalog.style.display = 'block';
        btnOrders.classList.remove('active');
        btnCatalog.classList.add('active');
    }
}

/* ==========================================================================
   SECCIÓN 1: CATÁLOGO DE PRODUCTOS (API & CRUD)
   ========================================================================== */

async function fetchProducts() {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('Error al obtener productos');
        products = await response.json();

        renderCatalogTable();
        renderOrderPickerRows(); // Actualizar desplegables en formulario de pedido
    } catch (error) {
        console.error('Error fetching products:', error);
        showToast('❌ No se pudo cargar el catálogo de productos.');
    }
}

function renderCatalogTable() {
    const tbody = document.getElementById('catalogTableBody');
    const countBadge = document.getElementById('catalogCount');
    if (!tbody) return;

    // Filtrado local de catálogo
    let filtered = products;
    if (catalogCategory && catalogCategory !== 'TODAS') {
        filtered = filtered.filter(p => p.category === catalogCategory);
    }
    if (catalogSearch) {
        const q = catalogSearch.toLowerCase().strip ? catalogSearch.toLowerCase().trim() : catalogSearch.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }

    if (countBadge) {
        countBadge.textContent = `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    No se encontraron productos en el catálogo.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(prod => `
        <tr>
            <td style="font-weight: 700; color: var(--primary);">#${prod.id}</td>
            <td style="font-weight: 600;">${escapeHtml(prod.name)}</td>
            <td>
                <span class="category-badge cat-${slugify(prod.category)}">${escapeHtml(prod.category)}</span>
            </td>
            <td style="font-weight: 700; font-family: var(--font-heading); font-size: 1rem;">
                $${prod.price.toLocaleString('es-AR')}
            </td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn-sm-edit" title="Editar producto" onclick="openEditModal(${prod.id})">
                        ✏️ Editar
                    </button>
                    <button class="btn-icon-danger" title="Eliminar producto" onclick="deleteProduct(${prod.id})">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleCreateProduct(event) {
    event.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;
    const price = parseFloat(document.getElementById('productPrice').value) || 0;

    if (!name || price <= 0) {
        showToast('⚠️ Ingresa un nombre y precio válido');
        return;
    }

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, price })
        });

        if (!response.ok) throw new Error('Error al guardar el producto');

        const newProd = await response.json();
        showToast(`✨ Producto "${newProd.name}" agregado con éxito`);

        document.getElementById('newProductForm').reset();
        await fetchProducts();
    } catch (error) {
        console.error('Error creating product:', error);
        showToast('❌ Error al agregar producto');
    }
}

function openEditModal(productId) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    document.getElementById('editProductId').value = prod.id;
    document.getElementById('editProductName').value = prod.name;
    document.getElementById('editProductCategory').value = prod.category;
    document.getElementById('editProductPrice').value = prod.price;

    const modal = document.getElementById('editPriceModal');
    if (modal) modal.style.display = 'flex';
}

function closeEditModal() {
    const modal = document.getElementById('editPriceModal');
    if (modal) modal.style.display = 'none';
}

async function handleUpdateProduct(event) {
    event.preventDefault();

    const productId = parseInt(document.getElementById('editProductId').value);
    const name = document.getElementById('editProductName').value.trim();
    const category = document.getElementById('editProductCategory').value;
    const price = parseFloat(document.getElementById('editProductPrice').value) || 0;

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, price })
        });

        if (!response.ok) throw new Error('Error al actualizar el producto');

        showToast(`✏️ Producto #${productId} actualizado correctamente`);
        closeEditModal();
        await fetchProducts();
    } catch (error) {
        console.error('Error updating product:', error);
        showToast('❌ Error al actualizar producto');
    }
}

async function deleteProduct(productId) {
    const prod = products.find(p => p.id === productId);
    const name = prod ? prod.name : `#${productId}`;

    if (!confirm(`¿Estás seguro de eliminar "${name}" del catálogo?`)) return;

    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('No se pudo eliminar el producto');

        showToast(`🗑️ Producto eliminado del catálogo`);
        await fetchProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
        showToast('❌ Error al eliminar el producto');
    }
}


/* ==========================================================================
   SECCIÓN 2: SELECTOR INTERACTIVO DE PRODUCTOS Y CÁLCULO DE PEDIDOS
   ========================================================================== */

function addOrderItemRow(productId = null, quantity = 1) {
    const defaultProdId = productId || (products.length > 0 ? products[0].id : null);
    selectedOrderItems.push({
        productId: defaultProdId,
        quantity: quantity
    });
    renderOrderPickerRows();
    calculateOrderTotal();
}

function removeOrderItemRow(index) {
    if (selectedOrderItems.length <= 1) {
        showToast('⚠️ El pedido debe contener al menos 1 producto');
        return;
    }
    selectedOrderItems.splice(index, 1);
    renderOrderPickerRows();
    calculateOrderTotal();
}

function onOrderItemProductChange(index, newProductId) {
    selectedOrderItems[index].productId = parseInt(newProductId);
    calculateOrderTotal();
}

function onOrderItemQtyChange(index, newQty) {
    const qty = Math.max(1, parseInt(newQty) || 1);
    selectedOrderItems[index].quantity = qty;
    calculateOrderTotal();
}

function renderOrderPickerRows() {
    const container = document.getElementById('orderItemsPicker');
    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = `<div class="empty-picker">Cargando productos del catálogo...</div>`;
        return;
    }

    container.innerHTML = selectedOrderItems.map((item, index) => {
        const selectedProd = products.find(p => p.id === item.productId) || products[0];
        const subtotal = selectedProd ? selectedProd.price * item.quantity : 0;

        const optionsHtml = products.map(p => `
            <option value="${p.id}" ${p.id === item.productId ? 'selected' : ''}>
                ${escapeHtml(p.name)} - $${p.price.toLocaleString('es-AR')}
            </option>
        `).join('');

        return `
            <div class="item-picker-row">
                <select class="form-control item-select" onchange="onOrderItemProductChange(${index}, this.value)">
                    ${optionsHtml}
                </select>
                <div class="qty-control">
                    <span class="qty-label">Cant:</span>
                    <input type="number" class="form-control item-qty" min="1" value="${item.quantity}"
                        onchange="onOrderItemQtyChange(${index}, this.value)"
                        oninput="onOrderItemQtyChange(${index}, this.value)">
                </div>
                <div class="row-subtotal">
                    $${subtotal.toLocaleString('es-AR')}
                </div>
                ${selectedOrderItems.length > 1 ? `
                    <button type="button" class="btn-remove-row" title="Quitar ítem" onclick="removeOrderItemRow(${index})">
                        ❌
                    </button>
                ` : '<div style="width: 28px;"></div>'}
            </div>
        `;
    }).join('');
}

function calculateOrderTotal() {
    let grandTotal = 0;
    const itemsSummaryList = [];
    const rows = document.querySelectorAll('.item-picker-row');

    selectedOrderItems.forEach((item, index) => {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
            const subtotal = prod.price * item.quantity;
            grandTotal += subtotal;
            itemsSummaryList.push(`${item.quantity}x ${prod.name}`);

            if (rows[index]) {
                const subtotalEl = rows[index].querySelector('.row-subtotal');
                if (subtotalEl) {
                    subtotalEl.textContent = `$${subtotal.toLocaleString('es-AR')}`;
                }
            }
        }
    });

    // Actualizar campo de precio total
    const totalPriceInput = document.getElementById('orderTotalPrice');
    if (totalPriceInput) {
        totalPriceInput.value = grandTotal;
    }

    // Actualizar input oculto del texto del resumen de productos
    const itemsInput = document.getElementById('orderItems');
    if (itemsInput) {
        itemsInput.value = itemsSummaryList.join(', ');
    }
}


/* ==========================================================================
   SECCIÓN 3: GESTIÓN DE PEDIDOS (GET, POST, PATCH, DELETE)
   ========================================================================== */

function filterByDate(pillElement, dateValue) {
    document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
    pillElement.classList.add('active');

    activeDateFilter = dateValue;
    fetchOrders();
}

async function fetchOrders() {
    try {
        const params = new URLSearchParams();
        if (activeDateFilter) params.append('delivery_date', activeDateFilter);
        if (activeStatusFilter && activeStatusFilter !== 'TODOS') params.append('status', activeStatusFilter);
        if (searchQuery) params.append('search', searchQuery);

        const response = await fetch(`/api/orders?${params.toString()}`);
        if (!response.ok) throw new Error('Error al obtener los pedidos');

        const orders = await response.json();
        renderOrders(orders);
    } catch (error) {
        console.error('Error:', error);
        showToast('❌ No se pudieron cargar los pedidos.');
    }
}

function renderOrders(orders) {
    const container = document.getElementById('ordersContainer');
    const countBadge = document.getElementById('ordersCount');

    if (countBadge) {
        countBadge.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
    }

    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🥑🧁</div>
                <h3>No se encontraron pedidos</h3>
                <p>Intenta cambiar los filtros de fecha o estado, o ingresa un nuevo pedido.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map(order => `
        <div class="order-card" id="order-card-${order.id}">
            <div class="order-main-info">
                <div class="order-header-row">
                    <span class="order-id">#${order.id}</span>
                    <span class="client-name">${escapeHtml(order.client_name)}</span>
                </div>
                <div class="order-items">
                    🛒 ${escapeHtml(order.items)}
                </div>
                <div class="order-meta">
                    <span>📅 Entrega: <strong>${formatDate(order.delivery_date)}</strong></span>
                    ${order.address ? `<span>📍 ${escapeHtml(order.address)}</span>` : ''}
                    ${order.phone ? `<span>📞 ${escapeHtml(order.phone)}</span>` : ''}
                </div>
                ${order.notes ? `<div class="order-notes">📝 ${escapeHtml(order.notes)}</div>` : ''}
            </div>

            <div class="order-side-info">
                <span class="status-badge ${order.status}">${order.status}</span>
                <span class="order-price">$${order.total_price.toLocaleString('es-AR')}</span>

                <div class="order-actions">
                    <select class="status-select-sm" onchange="updateOrderStatus(${order.id}, this.value)">
                        <option value="Pendiente" ${order.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="En Preparación" ${order.status === 'En Preparación' ? 'selected' : ''}>En Preparación</option>
                        <option value="Listo para Entrega" ${order.status === 'Listo para Entrega' ? 'selected' : ''}>Listo para Entrega</option>
                        <option value="Entregado" ${order.status === 'Entregado' ? 'selected' : ''}>Entregado</option>
                    </select>
                    <button class="btn-icon-danger" title="Eliminar pedido" onclick="deleteOrder(${order.id})">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

async function handleCreateOrder(event) {
    event.preventDefault();

    // Asegurar que el cálculo está actualizado
    calculateOrderTotal();

    const itemsVal = document.getElementById('orderItems').value;
    if (!itemsVal) {
        showToast('⚠️ Selecciona al menos un producto válido');
        return;
    }

    const orderData = {
        client_name: document.getElementById('orderClientName').value.trim(),
        phone: document.getElementById('orderPhone').value.trim(),
        items: itemsVal,
        delivery_date: document.getElementById('orderDeliveryDate').value,
        address: document.getElementById('orderAddress').value.trim(),
        total_price: parseFloat(document.getElementById('orderTotalPrice').value) || 0,
        notes: document.getElementById('orderNotes').value.trim(),
        status: 'Pendiente'
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (!response.ok) throw new Error('Error al registrar el pedido');

        const newOrder = await response.json();
        showToast(`✅ Pedido #${newOrder.id} cargado con éxito`);

        // Resetear formulario y mantener la fecha actual
        const dateVal = document.getElementById('orderDeliveryDate').value;
        document.getElementById('newOrderForm').reset();
        document.getElementById('orderDeliveryDate').value = dateVal;

        // Reiniciar selector de productos con 1 fila por defecto
        selectedOrderItems = [];
        addOrderItemRow();

        fetchOrders();
    } catch (error) {
        console.error('Error:', error);
        showToast('❌ Error al registrar el pedido');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`/api/orders/${orderId}/status?status=${encodeURIComponent(newStatus)}`, {
            method: 'PATCH'
        });

        if (!response.ok) throw new Error('No se pudo actualizar el estado');

        showToast(`🔄 Pedido #${orderId} actualizado a "${newStatus}"`);
        fetchOrders();
    } catch (error) {
        console.error('Error:', error);
        showToast('❌ Error al actualizar estado');
    }
}

async function deleteOrder(orderId) {
    if (!confirm(`¿Estás seguro de eliminar el pedido #${orderId}?`)) return;

    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('No se pudo eliminar el pedido');

        showToast(`🗑️ Pedido #${orderId} eliminado`);
        fetchOrders();
    } catch (error) {
        console.error('Error:', error);
        showToast('❌ Error al eliminar pedido');
    }
}


/* ==========================================================================
   SECCIÓN 4: UTILIDADES DE UI
   ========================================================================== */

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function slugify(text) {
    if (!text) return 'general';
    return text.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');
}
