import { useState } from 'react';
import { Order } from '../types';
import { formatCurrency, formatRelativeTime } from '../utils/format';
import OrderDetailsModal from './OrderDetailsModal';

interface HistoryTableProps {
  orders: Order[];
}

const HistoryTable = ({ orders }: HistoryTableProps) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/50">
                <th className="px-8 py-5 text-[14px] tracking-widest">Order ID</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Time</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Customer</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Items</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Total</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Payment</th>
                <th className="px-8 py-5 text-[14px] tracking-widest">Status</th>
                <th className="px-8 py-5 text-[14px] tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="">
              {orders.map((order) => (
                <tr key={order.id} className="transition-colors hover:bg-slate-50/50 group">
                  <td className="px-8 py-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
                    <div>#{order.orderNumber}</div>
                    {order.restaurantName && (
                      <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                        {order.restaurantName}
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-3 text-sm font-semibold text-slate-500 border-b border-slate-200">
                    {formatRelativeTime(order.createdAt)}
                  </td>
                  <td className="px-8 py-3 text-sm font-semibold text-slate-700 border-b border-slate-200">
                    {order.customerName}
                  </td>
                  <td className="px-8 py-3 text-sm font-semibold text-slate-500 border-b border-slate-200">
                    {order.totalItems ?? order.items.length} Item(s)
                  </td>
                  <td className="px-8 py-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
                    {formatCurrency(order.total)}
                  </td>
                  <td className="px-8 py-3 text-xs border-b border-slate-200">
                    <PaymentBadge order={order} />
                  </td>
                  <td className="px-8 py-3 text-xs border-b border-slate-200">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-8 py-3 text-xs border-b border-slate-200 text-right">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="cursor-pointer rounded-xl bg-success text-success border border-success px-3 py-1.5 font-bold transition-all text-[11px]"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <OrderDetailsModal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
      />
    </>
  );
};

const StatusBadge = ({ status }: { status: Order['status'] }) => {
  const getStyles = () => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-green-50 text-green-600 font-semibold border-green-100';
      case 'REJECTED':
        return 'bg-red-50 text-red-600 font-normal  border-red-100';
      case 'CANCELLED':
        return 'bg-red-50 text-red-600 font-normal border-red-100';
      case 'REFUNDING':
        return 'bg-orange-50 text-orange-600 font-semibold border-orange-100';
      case 'PICKED_UP':
        return 'bg-blue-50 text-blue-600 font-semibold border-blue-100';
      default:
        return 'bg-slate-100 text-slate-600 font-normal border-slate-200';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'DELIVERED':
        return 'COMPLETED';
      case 'REJECTED':
        return 'REJECTED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'REFUNDING':
        return 'REFUNDING';
      default:
        return status;
    }
  };

  return (
    <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${getStyles()}`}>
      {getLabel()}
    </span>
  );
};



const PaymentBadge = ({ order }: { order: Order }) => {
  const isPaid = order.paymentStatus?.toUpperCase() === 'PAID';
  
  return (
    <span className={`inline-flex items-center rounded-xl border px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${
      isPaid 
        ? 'bg-green-50 text-green-600 border-green-100' 
        : 'bg-yellow-50 text-yellow-700 border-yellow-100'
    }`}>
      {isPaid ? 'PAID' : (order.paymentStatusDisplay?.toUpperCase() || order.paymentStatus?.toUpperCase() || 'UNPAID')}
    </span>
  );
};

export default HistoryTable;
