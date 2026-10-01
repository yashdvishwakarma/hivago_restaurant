import { DashboardStats, NewRestaurantStats, MenuCategory, MenuItem, Order, RestaurantSettings, ProfileSettings, DietarySettings, OperationsSettings, HoursSettings, DeliverySettings, NotificationSettings, CreateMenuItemPayload, MenuItemOption, MenuItemOptionGroup, ParsedMenuCategory, ParsedMenuItem, BulkImportPayload, BulkImportResponse } from '../types';
import axios from 'axios';
import client from './client';

export const fetchRestaurantStats = async (range: string = 'today'): Promise<NewRestaurantStats> => {
  const response = await client.get<NewRestaurantStats>('/restaurants/me/stats', {
    params: { range }
  });
  return response.data;
};

export const fetchDashboardStats = async (restaurantId: string): Promise<DashboardStats> => {
  const orders = await fetchOrders(restaurantId, { activeOnly: false, pageSize: 100 });
  const today = new Date().toDateString();

  const liveOrders = orders.filter(order => order.status !== 'DELIVERED').length;

  const todayRevenue = orders.reduce((sum, order) => {
    return new Date(order.createdAt).toDateString() === today
      ? sum + order.total
      : sum;
  }, 0);

  return {
    liveOrders,
    todayRevenue,
    avgPrepTime: 'N/A',
    rejectionRate: 0
  };
};

interface FetchOrdersOptions {
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export const normalizeStatus = (status?: string | number): Order['status'] => {
  if (status === undefined || status === null) return 'PENDING';
  const normalized = String(status).trim().toLowerCase();

  // 1. Check numeric representations first (C# enum integers)
  if (normalized === '0' || normalized === '1' || normalized === '2') return 'PENDING';
  if (normalized === '3') return 'PREPARING';
  if (normalized === '4') return 'READY';
  if (normalized === '5') return 'PICKED_UP';
  if (normalized === '6') return 'DELIVERED';
  if (normalized === '7') return 'REJECTED';
  if (normalized === '8' || normalized === '9') return 'CANCELLED';
  if (normalized === '10' || normalized === '11') return 'REFUNDING';

  // 2. Check exact enum names & display names or partial terms
  if (
    normalized.includes('ready') || 
    normalized === 'readyforpickup' || 
    normalized === 'ready for pickup'
  ) {
    return 'READY';
  }
  
  if (
    normalized.includes('picked') || 
    normalized === 'pickedup' || 
    normalized === 'picked up'
  ) {
    return 'PICKED_UP';
  }
  
  if (normalized === 'delivered') return 'DELIVERED';
  
  if (
    normalized === 'rejected' || 
    normalized.includes('rejected')
  ) {
    return 'REJECTED';
  }
  
  if (
    normalized === 'cancelled' || 
    normalized === 'failed' || 
    normalized.includes('cancelled') || 
    normalized.includes('failed')
  ) {
    return 'CANCELLED';
  }
  
  if (
    normalized === 'refunding' || 
    normalized === 'refunded' || 
    normalized.includes('refund')
  ) {
    return 'REFUNDING';
  }
  
  if (normalized === 'preparing') return 'PREPARING';
  
  if (
    normalized.includes('pending') || 
    normalized.includes('paid') || 
    normalized === 'confirmed'
  ) {
    return 'PENDING';
  }

  return 'PENDING';
};

const normalizePickupType = (type?: string): Order['pickupType'] => {
  if (!type) return 'PICKUP';

  const normalized = type.toLowerCase();

  if (normalized.includes('delivery')) return 'DELIVERY';
  if (normalized.includes('dine')) return 'DINE_IN';
  if (normalized.includes('pickup')) return 'PICKUP';

  return 'PICKUP';
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', 'yes', 'verified', 'paid', 'success', 'confirmed'].includes(normalized);
  }

  return false;
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

export const normalizeOrder = (raw: Record<string, unknown>): Order => {
  const statusRaw = (raw.status ?? raw.statusDisplay ?? 'PREPARING') as string | number;
  const normalizedStatus = normalizeStatus(statusRaw);

  const pricing = (raw.pricing as Record<string, unknown>) || {};
  const deliveryInfo = (raw.deliveryInfo as Record<string, unknown>) || {};
  const deliveryAddress = (deliveryInfo.deliveryAddress as Record<string, unknown>) || {};

  const paymentVerified =
    parseBoolean(raw.paymentStatus ?? raw.paymentVerified ?? raw.paymentStatusDisplay) ||
    String(raw.paymentStatus).toLowerCase() === 'paid';

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const normalizedItems = rawItems.map((item: any) => ({
    id: String(item.id ?? item.menuItemId ?? ''),
    name: String(item.itemName ?? item.name ?? 'Unknown Item'),
    quantity: Number(item.quantity ?? 1),
    price: parseNumber(item.unitPrice ?? item.price ?? 0),
    imageUrl: String(item.imageUrl ?? ''),
    description: String(item.itemDescription ?? item.description ?? ''),
    specialInstructions: item.specialInstructions ? String(item.specialInstructions) : undefined
  }));

  const restaurantId = raw.restaurantId ? String(raw.restaurantId) : undefined;
  const restaurantName = raw.restaurantName ? String(raw.restaurantName) : undefined;

  return {
    id: String(raw.id ?? raw.orderId ?? ''),
    orderNumber: String(raw.orderNumber ?? raw.id ?? raw.orderId ?? ''),
    status: normalizedStatus,
    restaurantId,
    restaurantName,
    customerName: String(raw.customerName ?? 'Guest'),
    customerPhone: String(raw.customerPhone ?? raw.restaurantPhone ?? ''),
    customerNote: String(raw.specialInstructions ?? raw.customerNote ?? '') || undefined,
    pickupType: normalizePickupType(String(raw.fulfillmentType ?? raw.pickupType ?? (deliveryInfo ? 'DELIVERY' : 'PICKUP'))),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    total: parseNumber(pricing.total ?? raw.total ?? raw.totalDisplay),
    subTotal: parseNumber(pricing.subTotal ?? pricing.itemsTotal ?? 0),
    tax: parseNumber(pricing.tax ?? pricing.taxTotal ?? 0),
    discount: parseNumber(pricing.discount ?? pricing.discountTotal ?? 0),
    deliveryETA: String(deliveryInfo.estimatedTimeDisplay ?? raw.estimatedTimeDisplay ?? ''),
    items: normalizedItems,
    totalItems: typeof raw.totalItems === 'number' ? raw.totalItems : undefined,
    address: String(deliveryAddress.formattedAddress ?? raw.address ?? ''),
    paymentVerified,
    riderName: String(deliveryInfo.riderName ?? ''),
    riderPhone: String(deliveryInfo.riderPhone ?? ''),
    riderStatus: deliveryInfo.riderId ? 'is on the way' : undefined,
    otp: String(raw.paymentId).slice(-4), // Mock OTP from paymentId for now
    paymentStatus: String(raw.paymentStatus ?? ''),
    paymentStatusDisplay: String(raw.paymentStatusDisplay ?? raw.paymentStatus ?? ''),
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : undefined,
    preparingAt: raw.preparingAt ? String(raw.preparingAt) : undefined,
    readyAt: raw.readyAt ? String(raw.readyAt) : undefined,
    pickedUpAt: raw.pickedUpAt ? String(raw.pickedUpAt) : undefined,
    deliveredAt: raw.deliveredAt ? String(raw.deliveredAt) : undefined,
    cancelledAt: raw.cancelledAt ? String(raw.cancelledAt) : undefined,
    rejectedAt: raw.rejectedAt ? String(raw.rejectedAt) : undefined,
    cancellationReason: raw.cancellationReason ? String(raw.cancellationReason) : (raw.cancelReason ? String(raw.cancelReason) : (raw.reason && normalizedStatus === 'CANCELLED' ? String(raw.reason) : undefined)),
    rejectionReason: raw.rejectionReason ? String(raw.rejectionReason) : (raw.rejectReason ? String(raw.rejectReason) : (raw.reason && normalizedStatus === 'REJECTED' ? String(raw.reason) : undefined)),
  };
};




const extractOrders = (payload: unknown): Order[] => {
  if (Array.isArray(payload)) {
    return payload.map(item => normalizeOrder(item as Record<string, unknown>));
  }

  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    const candidates = ['items', 'orders', 'data', 'results'];

    for (const key of candidates) {
      const value = body[key];
      if (Array.isArray(value)) {
        return value.map(item => normalizeOrder(item as Record<string, unknown>));
      }
    }
  }

  throw new Error('Unexpected orders payload from API');
};

export const fetchOrders = async (
  restaurantId: string,
  options: FetchOrdersOptions = {}
): Promise<Order[]> => {
  const activeOnly = options.activeOnly ?? false;
  const pageSize = options.pageSize ?? 100;
  const explicitPage = typeof options.page === 'number';

  let currentPage = options.page ?? 1;
  const orders: Order[] = [];

  while (true) {
    const response = await client.get<unknown>(`orders/restaurant/${restaurantId}`, {
      params: { activeOnly, page: currentPage, pageSize }
    });

    const pageOrders = extractOrders(response.data);
    orders.push(...pageOrders);

    if (explicitPage || pageOrders.length < pageSize) break;

    currentPage += 1;
  }

  /*
  // Inject a demo order for testing "Picked up" section redesign
  const demoOrder: Order = {
    id: 'demo-pickup-id',
    orderNumber: 'ORD-1230',
    status: 'PICKED_UP',
    customerName: 'Aditya Shinde',
    customerPhone: '8080125309',
    customerNote: 'Extra gravy please',
    pickupType: 'DELIVERY',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    total: 160,
    subTotal: 150,
    tax: 10,
    discount: 0,
    deliveryETA: '15 mins ago',
    items: [
      { id: 'item-1', name: 'Lamb Rogan Josh', quantity: 1, price: 100 },
      { id: 'item-2', name: 'Basmati Rice', quantity: 1, price: 60 }
    ],
    address: 'Powai, Mumbai',
    paymentVerified: true,
    riderName: 'Santosh Kamble',
    riderPhone: '9876543210',
    riderStatus: 'has picked up your order',
    otp: '5678'
  };

  orders.unshift(demoOrder);
  */


  return orders;
};



export const fetchOrderById = async (orderId: string): Promise<Order> => {
  const response = await client.get<Record<string, unknown>>(`orders/${orderId}`);

  // If the response data is an object with a 'data' property (common wrapper)
  const rawData = response.data.data ? (response.data.data as Record<string, unknown>) : response.data;

  return normalizeOrder(rawData);
};

export const confirmOrder = async (orderId: string): Promise<Order> => {
  const response = await client.put(`orders/${orderId}/confirm`, {});
  return normalizeOrder(response.data.data || response.data);
};

export const rejectOrder = async (orderId: string, reason: string): Promise<Order> => {
  const response = await client.put(`orders/${orderId}/reject`, { reason });
  const order = normalizeOrder(response.data.data || response.data);
  order.status = 'REJECTED';
  return order;
};

export const preparingOrder = async (orderId: string, prepTime?: number, deliveryPartner?: 'HIVAGO' | 'RESTAURANT'): Promise<Order> => {
  const response = await client.put(`orders/${orderId}/preparing`, {
    prepTime,
    deliveryPartner
  });
  const order = normalizeOrder(response.data.data || response.data);
  order.status = 'PREPARING';
  return order;
};


export const readyOrder = async (orderId: string): Promise<Order> => {
  const response = await client.put(`orders/${orderId}/ready`, {});
  const order = normalizeOrder(response.data.data || response.data);
  order.status = 'READY';
  return order;
};

export const customerPickupOrder = async (orderId: string): Promise<Order> => {
  const response = await client.put(`orders/${orderId}/customer-pickup`, {});
  const order = normalizeOrder(response.data.data || response.data);
  order.status = 'DELIVERED';
  return order;
};

// Settings & Profile APIs
export const fetchRestaurantSettings = async (): Promise<RestaurantSettings> => {
  const response = await client.get('/restaurants/me/details');
  return response.data.data ?? response.data;
};

export const updateProfile = async (data: Partial<ProfileSettings>): Promise<string> => {
  const payload = { ...data };
  if (payload.phone) {
    const digitsOnly = payload.phone.replace(/\D/g, '');
    payload.phone = digitsOnly.slice(-10);
  }
  const res = await client.patch('/restaurants/me/profile', payload);
  return res.data?.message || 'Profile updated successfully';
};

export const updateDietary = async (data: Partial<DietarySettings>): Promise<string> => {
  const res = await client.patch('/restaurants/me/dietary', data);
  return res.data?.message || 'Dietary settings updated successfully';
};

export const fetchOperations = async (): Promise<OperationsSettings> => {
  const res = await client.get('/restaurants/me/operations');
  return res.data?.data || res.data;
};

export const updateOperations = async (data: Partial<OperationsSettings>): Promise<string> => {
  const res = await client.patch('/restaurants/me/operations', data);
  return res.data?.message || 'Operations updated successfully';
};

export const updateHours = async (data: Partial<HoursSettings>): Promise<string> => {
  const res = await client.patch('/restaurants/me/hours', data);
  return res.data?.message || 'Business hours updated successfully';
};

export const updateDelivery = async (data: Partial<DeliverySettings>): Promise<string> => {
  const res = await client.patch('/restaurants/me/delivery', data);
  return res.data?.message || 'Delivery settings updated successfully';
};

export const updateNotifications = async (data: Partial<NotificationSettings>): Promise<string> => {
  const res = await client.patch('/restaurants/me/notifications', data);
  return res.data?.message || 'Notification preferences updated successfully';
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<string> => {
  const res = await client.patch('/restaurants/me/password', { currentPassword, newPassword });
  return res.data?.message || 'Password changed successfully';
};

// Logo upload might be kept or changed. Based on spec, it's not strictly mentioned in the 7 PATCH.
// We'll leave the old one but point to /restaurants/me/logo just in case, or drop it if not needed.
// Actually, I'll keep the legacy path until requested otherwise, but spec didn't mention logo.
export const uploadRestaurantLogo = async (restaurantId: string, file: File): Promise<{ logoUrl: string }> => {
  // 1. Get upload URL
  const urlRes = await client.post<any>(
    `/users/restaurants/${restaurantId}/logo/upload-url`,
    { contentType: 'image/jpeg' }
  );
  
  const responseData = urlRes.data.data || urlRes.data;
  const { uploadUrl, fileKey } = responseData;

  console.log('File to upload:', file);
  console.log('File Name:', file.name);
  console.log('Upload URL:', uploadUrl);

  // 2. Upload to S3/R2 (Use a clean axios call to avoid global interceptors/headers)
  const uploadResponse = await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': 'image/jpeg'
    }
  });

  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw new Error('Failed to upload image to storage');
  }

  // 3. Confirm upload
  const confirmRes = await client.patch<any>(
    `/users/restaurants/${restaurantId}/logo/confirm`,
    { fileKey }
  );

  return confirmRes.data.data || confirmRes.data;
};

// Menu Item Operations
export const createMenuCategory = async (name: string): Promise<MenuCategory> => {
  const response = await client.post('/restaurant/menus', { name });
  return response.data.data || response.data;
};

export const deleteMenuCategory = async (menuId: string): Promise<void> => {
  await client.delete(`/restaurant/menus/${menuId}`);
};


export const fetchMenuItemDetails = async (itemId: string): Promise<MenuItem> => {
  const response = await client.get(`/items/${itemId}`);
  const item = response.data.data || response.data;
  return {
    ...item,
    price: parseNumber(item.basePrice ?? item.price ?? 0),
    isVeg: parseBoolean(item.isVegetarian ?? item.isVeg ?? true)
  };
};

export const createMenuItem = async (payload: CreateMenuItemPayload): Promise<MenuItem> => {
  const response = await client.post('/restaurant/items', payload);
  const item = response.data.data || response.data;
  return item;
};

export const updateMenuItem = async (itemId: string, payload: Partial<CreateMenuItemPayload>): Promise<void> => {
  await client.put(`/restaurant/items/${itemId}`, payload);
};

export const createOptionGroup = async (itemId: string, payload: any): Promise<MenuItemOptionGroup> => {
  const response = await client.post(`/items/${itemId}/option-groups`, payload);
  return response.data.data || response.data;
};

export const updateOptionGroup = async (itemId: string, groupId: string, payload: any): Promise<void> => {
  await client.put(`/items/${itemId}/option-groups/${groupId}`, payload);
};

export const deleteOptionGroup = async (itemId: string, groupId: string): Promise<void> => {
  await client.delete(`/items/${itemId}/option-groups/${groupId}`);
};

export const createOption = async (groupId: string, payload: any): Promise<MenuItemOption> => {
  const response = await client.post(`/restaurant/option-groups/${groupId}/options`, payload);
  return response.data.data || response.data;
};

export const updateOption = async (optionId: string, payload: any): Promise<void> => {
  await client.put(`/restaurant/options/${optionId}`, payload);
};

export const deleteOption = async (optionId: string): Promise<void> => {
  await client.delete(`/restaurant/options/${optionId}`);
};

// Delete a menu item
export const deleteMenuItem = async (itemId: string): Promise<void> => {
  await client.delete(`/restaurant/items/${itemId}`);
};

// Delete all menu items and categories (delete whole menu)
export const deleteAllMenu = async (restaurantId?: string): Promise<void> => {
  try {
    await client.delete('/restaurant/menus/all');
  } catch (err: any) {
    // Fallback: fetch menu and delete all items and categories individually
    if (restaurantId) {
      const { categories, items } = await fetchFullMenu(restaurantId);
      await Promise.all(items.map(item => deleteMenuItem(item.id).catch(() => {})));
      await Promise.all(categories.map(cat => deleteMenuCategory(cat.id).catch(() => {})));
    }
  }
};

// 1 & 2. Get upload URL & upload directly to S3/Cloudflare R2 (returns fileKey)
export const uploadMenuItemImageToStorage = async (itemId: string, file: File): Promise<string> => {
  const urlRes = await client.post<any>(
    `/catalog/menu-items/${itemId}/image/upload-url`,
    { contentType: 'image/jpeg' }
  );
  
  const responseData = urlRes.data.data || urlRes.data;
  const { uploadUrl, fileKey } = responseData;

  const uploadResponse = await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': 'image/jpeg'
    }
  });

  if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
    throw new Error('Failed to upload menu item image to storage');
  }

  return fileKey;
};

// 3. Confirm upload on backend
export const confirmMenuItemImage = async (itemId: string, fileKey: string): Promise<{ imageUrl: string }> => {
  const confirmRes = await client.patch<any>(
    `/catalog/menu-items/${itemId}/image/confirm`,
    { fileKey }
  );

  return confirmRes.data.data || confirmRes.data;
};

// Kept for backward compatibility
export const uploadMenuItemImage = async (itemId: string, file: File): Promise<{ imageUrl: string }> => {
  const fileKey = await uploadMenuItemImageToStorage(itemId, file);
  return confirmMenuItemImage(itemId, fileKey);
};

export const fetchFullMenu = async (restaurantId: string): Promise<{ categories: MenuCategory[], items: MenuItem[] }> => {
  const response = await client.get(`catalog/restaurants/${restaurantId}/menu`);
  const data = response.data.data || response.data;
  const menus = Array.isArray(data.menus) ? data.menus : [];

  // Sort menus by displayOrder
  const sortedMenus = [...menus].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));

  const categories: MenuCategory[] = sortedMenus.map((m: any) => ({
    id: m.menuId || m.id,
    name: m.name
  }));

  const items: MenuItem[] = sortedMenus.flatMap((m: any) =>
    (m.items || []).map((item: any) => ({
      ...item,
      menuId: m.menuId || m.id,
      category: m.name,
      price: parseNumber(item.basePrice ?? item.price ?? 0),
      isVeg: parseBoolean(item.isVegetarian ?? item.isVeg ?? true)
    }))
  );

  return { categories, items };
};




export const toggleItemAvailability = async (itemId: string, isAvailable: boolean): Promise<void> => {
  await client.patch(`/restaurant/items/${itemId}/availability`, { isAvailable });
};

export const updateRestaurantAvailability = async (status: boolean): Promise<any> => {
  const response = await client.put('/restaurants/me/availability', {
    isAcceptingOrders: status
  });
  return response.data;
};

export const fetchDeliveryCodes = async (orderId: string): Promise<{ pickupCode: string | null, dropCode: string | null } | null> => {
  try {
    const response = await client.get(`/delivery/orders/${orderId}/codes`);
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
};

export const bulkImportMenu = async (payload: BulkImportPayload): Promise<BulkImportResponse> => {
  const response = await client.post<BulkImportResponse>('/restaurant/menus/bulk-import', payload);
  return response.data;
};

/**
 * Reverse geocode latitude and longitude to a human-readable display address.
 * Routes through backend proxy endpoint first, falling back to direct geocoding service
 * with compliant headers (User-Agent, Accept-Language).
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  try {
    const response = await client.get('/location/reverse-geocode', {
      params: { lat, lng }
    });
    return response.data?.address || response.data?.display_name || response.data?.data?.address || null;
  } catch {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
        headers: {
          'User-Agent': 'HivagoRestaurant/1.0 (contact@hivago.com)',
          'Accept-Language': 'en-US,en'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data?.display_name || null;
    } catch (err) {
      console.error('Failed to reverse geocode address:', err);
      return null;
    }
  }
};

/**
 * Search location query string for coordinate suggestions.
 * Routes through backend proxy endpoint first, falling back to direct geocoding service
 * with compliant headers (User-Agent, Accept-Language).
 */
export const searchLocation = async (queryStr: string): Promise<any[]> => {
  if (!queryStr.trim()) return [];
  try {
    const response = await client.get('/location/geocode', {
      params: { query: queryStr, limit: 5 }
    });
    return response.data?.suggestions || response.data?.data || response.data || [];
  } catch {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&limit=5`, {
        headers: {
          'User-Agent': 'HivagoRestaurant/1.0 (contact@hivago.com)',
          'Accept-Language': 'en-US,en'
        }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to search location:', err);
      return [];
    }
  }
};

export interface RestaurantOutlet {
  id: string;
  name: string;
  rstCode?: string;
  addressLine?: string;
  isActive?: boolean;
}

export const fetchMyOutlets = async (): Promise<RestaurantOutlet[]> => {
  const response = await client.get('/restaurants/me/outlets');
  return response.data?.data || response.data || [];
};

