export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'REJECTED' | 'REFUNDING';

export type OrderSectionKey = 'PENDING' | 'PREPARING' | 'READY' | 'HISTORY';


export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl?: string;
  description?: string;
  specialInstructions?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  restaurantId?: string;
  restaurantName?: string;

  customerName: string;
  customerPhone: string;
  customerNote?: string;
  pickupType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  createdAt: string;
  total: number;
  subTotal?: number;
  tax?: number;
  discount?: number;
  deliveryETA: string;
  items: OrderItem[];
  totalItems?: number;
  address: string;
  paymentVerified?: boolean;
  riderName?: string;
  riderPhone?: string;
  riderStatus?: string;
  otp?: string;
  paymentStatus?: string;
  paymentStatusDisplay?: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  cancellationReason?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  rejectedAt?: string;
}


export interface DashboardStats {
  liveOrders: number;
  todayRevenue: number;
  avgPrepTime: string;
  rejectionRate: number;
}

export interface NewRestaurantStats {
  range: string;
  periodStartUtc: string;
  ordersTotal: number;
  ordersDelivered: number;
  ordersCancelled: number;
  ordersActive: number;
  grossRevenue: number;
  averageOrderValue: number;
  activeByStatus: {
    Paid?: number;
    Confirmed?: number;
    Preparing?: number;
    ReadyForPickup?: number;
    [key: string]: number | undefined;
  };
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface MenuItemOption {
  id?: string;
  name: string;
  type: 'AddOn' | 'Size' | 'Choice' | string;
  additionalPrice: number;
  isDefault: boolean;
}

export interface MenuItemOptionGroup {
  id?: string;
  groupName: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  displayOrder: number;
  options: MenuItemOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category: string;
  isVeg: boolean;
  isAvailable: boolean;
  menuId: string;
  displayOrder?: number;
  isVegetarian?: boolean;
  preparationTimeMinutes?: number;
  tags?: string[];
  optionGroups?: MenuItemOptionGroup[];
  options?: MenuItemOption[];
}

export interface CreateMenuItemPayload {
  menuId: string;
  name: string;
  description?: string;
  basePrice: number;
  imageUrl?: string;
  displayOrder?: number;
  isVegetarian?: boolean;
  preparationTimeMinutes?: number;
  tags?: string[];
  options?: MenuItemOption[];
  optionGroups?: MenuItemOptionGroup[];
}

export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";

export interface WeeklyScheduleSlot {
  opensAt: string; // "09:00" or "09:00:00"
  closesAt: string;
}

export interface DaySchedule {
  dayOfWeek: DayOfWeek | string;
  slots: WeeklyScheduleSlot[];
}

export interface ProfileSettings {
  name: string;
  phone: string;
  email: string;
  fssaiNumber: string | null;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  logoUrl: string | null;
}

export interface DietarySettings {
  dietaryType: "PureVeg" | "PureNonVeg" | "Both";
  isPureVeg: boolean;
  isVeganFriendly: boolean;
  hasJainOptions: boolean;
  cuisineTypes: string[];
}

export interface OperationsSettings {
  isActive: boolean;
  isAcceptingOrders: boolean;
  autoAcceptOrders: boolean;
  avgPrepTimeMins: number;
  minOrderAmount: number;
  commissionPercentage: number;
  commissionFlatFee?: number;
}

export interface HoursSettings {
  useCustomSchedule: boolean;
  openingTime: string;
  closingTime: string;
  weeklySchedule: DaySchedule[];
}

export interface DeliverySettings {
  deliveryMode: "Hivago" | "SelfDelivery";
  acceptsPickup: boolean;
}


export interface NotificationSettings {
  emailAlerts: boolean;
  browserNotifications: boolean;
  orderSound: boolean;
}

export interface RestaurantSettings {
  id: string;
  profile: ProfileSettings;
  dietary: DietarySettings;
  operations: OperationsSettings;
  hours: HoursSettings;
  delivery: DeliverySettings;
  notifications: NotificationSettings;
}


export type PayoutLedgerStatus = 'Pending' | 'Batched' | 'PaidOut';
export type PayoutStatus = 'Pending' | 'Processing' | 'Paid' | 'Failed' | 'OnHold';

export interface PayoutLedgerDto {
  orderId: string;
  orderNumber: string;
  orderAmount: number;
  gstAmount: number;
  commissionAmount: number;
  commissionGst: number;
  tdsAmount: number;
  netAmount: number;
  status: PayoutLedgerStatus;
  createdAt: string;
}

export interface EarningsSummaryDto {
  orderCount: number;
  grossRevenue: number;
  totalCommission: number;
  totalTds: number;
  netEarnings: number;
  periodStart: string;
  periodEnd: string;
  ledgerEntries: PayoutLedgerDto[];
}

export interface PayoutDto {
  id: string;
  ownerId: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  grossOrderAmount: number;
  totalGstCollected: number;
  totalCommission: number;
  totalCommissionGst: number;
  totalTds: number;
  netPayoutAmount: number;
  status: PayoutStatus;
  transactionReference?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PayoutDetailDto extends PayoutDto {
  ledgerEntries: PayoutLedgerDto[];
}

export interface GstLineItemDto {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  grossAmount: number;
  gstOnOrder: number;
  commission: number;
  commissionGst: number;
}

export interface GstSummaryDto {
  fromDate: string;
  toDate: string;
  orderCount: number;
  grossOrderAmount: number;
  totalGstOnOrders: number;
  totalCommission: number;
  totalCommissionGst: number;
  lineItems: GstLineItemDto[];
}

export interface TdsLineItemDto {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  grossAmount: number;
  commission: number;
  tdsDeducted: number;
  netAfterTds: number;
}

export interface TdsSummaryDto {
  fromDate: string;
  toDate: string;
  orderCount: number;
  grossOrderAmount: number;
  totalCommission: number;
  totalTdsDeducted: number;
  netAfterTds: number;
  lineItems: TdsLineItemDto[];
}

// Admin Payout Types
export interface RestaurantPayoutSummary {
  pendingCount: number;
  totalPendingAmount: number;
  failedAmount: number;
  onHoldCount: number;
  onHoldAmount: number;
  platformProfit: number;
  nextAutoRunAtUtc: string;
  lastAutoRun?: {
    atUtc: string;
    restaurantCount: number;
    totalAmount: number;
    totalPaid: number;
  };
}

export interface RestaurantPayoutRow {
  payoutId: string;
  ownerId: string;
  displayName: string;
  orderCount: number;
  gmv: number;
  netPayable: number;
  status: PayoutStatus;
  statusNote?: string;
  cycleStart: string;
  cycleEnd: string;
  createdAtUtc: string;
  paidAtUtc?: string;
  transactionReference?: string;
}

export interface RestaurantPayoutsPagedResult {
  items: RestaurantPayoutRow[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// Keep PayoutCycle and PayoutSummary for backward compatibility during transition if needed
// but mark them as deprecated or update them to wrap the new types
export interface PayoutCycle {
  id: string;
  cycleRange: string;
  payoutDate: string;
  ordersCount: number;
  amount: number;
  status: 'PAID' | 'PENDING' | 'UPCOMING' | string;
  utr?: string;
  restaurantName?: string;
}

export interface PayoutSummary {
  currentCycle: PayoutCycle;
  pastCycles: PayoutCycle[];
}

export type AuthRole = 'admin' | 'owner' | 'restaurant';

export interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string;
  panNumber?: string;
  gstNumber?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankAccountName?: string;
  crossOutletAcceptEnabled?: boolean;
  isCrossOutletAcceptEnabled?: boolean;
}

export interface RestaurantMinimal {
  id: string;
  name: string;
  rstCode: string;
  addressLine?: string;
  isActive?: boolean;
  isAcceptingOrders?: boolean;
}

export interface ParsedMenuCategory {
  name: string;
}

export interface ParsedMenuItem {
  name: string;
  description?: string;
  price: number;
  category: string;
  isVeg: boolean;
  optionGroups?: MenuItemOptionGroup[];
}

export interface ParsePdfResponse {
  success: boolean;
  data: {
    categories: ParsedMenuCategory[];
    items: ParsedMenuItem[];
  };
}

export interface BulkImportPayload {
  categories: ParsedMenuCategory[];
  items: ParsedMenuItem[];
}

export interface BulkImportResponse {
  success: boolean;
  message: string;
  data: {
    categoriesCreated: number;
    itemsCreated: number;
  };
}


