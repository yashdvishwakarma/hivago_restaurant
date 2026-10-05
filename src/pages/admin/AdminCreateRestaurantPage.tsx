import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOwner, createRestaurant, getAllOwners, toggleCrossOutletAcceptAdmin, CreateOwnerPayload, CreateRestaurantPayload } from '../../api/adminApi';
import { Owner } from '../../types';
import { useToast } from '../../context/ToastContext';

const AdminCreateRestaurantPage = () => {
  const [step, setStep] = useState(1);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingOwners, setFetchingOwners] = useState(true);
  const [crossAcceptEnabled, setCrossAcceptEnabled] = useState(false);
  const [togglingCrossAccept, setTogglingCrossAccept] = useState(false);
  const { showToast } = useToast();

  const handleToggleCrossAccept = async (enabled: boolean) => {
    if (!selectedOwnerId) return;
    setTogglingCrossAccept(true);
    try {
      await toggleCrossOutletAcceptAdmin(selectedOwnerId, enabled);
      setCrossAcceptEnabled(enabled);
      showToast(`Cross-outlet accept ${enabled ? 'enabled' : 'disabled'} for owner`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update cross-outlet accept setting', 'error');
    } finally {
      setTogglingCrossAccept(false);
    }
  };

  
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [ownerForm, setOwnerForm] = useState<CreateOwnerPayload>({
    name: '',
    email: '',
    phone: '',
    password: 'DefaultPass@123'
  });

  const [restaurantForm, setRestaurantForm] = useState<Omit<CreateRestaurantPayload, 'ownerId'>>({
    name: '',
    phone: '',
    email: '',
    password: 'DefaultPass@123',
    addressLine: '',
    latitude: 19.0760,
    longitude: 72.8777
  });

  const navigate = useNavigate();

  useEffect(() => {
    const fetchOwners = async () => {
      try {
        const data = await getAllOwners();
        setOwners(data);
      } catch (err) {
        console.error('Failed to fetch owners', err);
      } finally {
        setFetchingOwners(false);
      }
    };
    fetchOwners();
  }, []);

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { ownerId } = await createOwner(ownerForm);
      setSelectedOwnerId(ownerId);
      showToast('Owner created successfully!', 'success');
      setStep(2);
    } catch (err: any) {
      showToast(err?.message || 'Failed to create owner.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExistingOwner = () => {
    if (selectedOwnerId) {
      setStep(2);
    } else {
      showToast('Please select an owner first.', 'error');
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createRestaurant({ ...restaurantForm, ownerId: selectedOwnerId });
      showToast('Restaurant created successfully!', 'success');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      showToast(err?.message || 'Failed to create restaurant.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create New Restaurant</h1>
        <div className="flex items-center justify-center gap-4 mt-6">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-brand-600' : 'text-slate-400'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-brand-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>1</span>
            <span className="font-bold">Owner Details</span>
          </div>
          <div className="w-12 h-px bg-slate-200"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-brand-600' : 'text-slate-400'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-brand-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>2</span>
            <span className="font-bold">Restaurant Details</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] p-8 md:p-12 border border-slate-100 shadow-xl">
        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-6">Select Existing Owner</h3>
                <div className="space-y-4">
                  {fetchingOwners ? (
                    <div className="animate-pulse space-y-3">
                      {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-2xl"></div>)}
                    </div>
                  ) : (
                    <select 
                      value={selectedOwnerId}
                      onChange={(e) => {
                        const ownerId = e.target.value;
                        setSelectedOwnerId(ownerId);
                        const found = owners.find(o => o.id === ownerId);
                        setCrossAcceptEnabled(Boolean(found?.crossOutletAcceptEnabled ?? found?.isCrossOutletAcceptEnabled));
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                    >
                      <option value="">Select an owner...</option>
                      {owners.map(o => <option key={o.id} value={o.id}>{o.name} ({o.email})</option>)}
                    </select>
                  )}
                  {selectedOwnerId && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Multi-Outlet Cross-Accept</h4>
                        <p className="text-[11px] text-slate-500">Enable receiving & accepting orders for all outlets under this owner.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleCrossAccept(!crossAcceptEnabled)}
                        disabled={togglingCrossAccept}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-sm ${
                          crossAcceptEnabled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                      >
                        {togglingCrossAccept ? 'Saving...' : crossAcceptEnabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={handleSelectExistingOwner}
                    disabled={!selectedOwnerId}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50"
                  >
                    Continue with Selected Owner
                  </button>
                </div>
              </div>

              <div className="lg:border-l lg:pl-12 border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Create New Owner</h3>
                <form onSubmit={handleCreateOwner} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Full Name</label>
                    <input 
                      required
                      type="text" 
                      value={ownerForm.name}
                      onChange={e => setOwnerForm({...ownerForm, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Email Address</label>
                    <input 
                      required
                      type="email" 
                      value={ownerForm.email}
                      onChange={e => setOwnerForm({...ownerForm, email: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Phone Number</label>
                    <input 
                      required
                      type="tel" 
                      value={ownerForm.phone}
                      onChange={e => setOwnerForm({...ownerForm, phone: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-brand-100"
                  >
                    {loading ? 'Creating...' : 'Create and Continue'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setStep(1)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h3 className="text-xl font-bold text-slate-900">Restaurant Configuration</h3>
            </div>
            
            <form onSubmit={handleCreateRestaurant} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Restaurant Name</label>
                <input 
                  required
                  type="text" 
                  value={restaurantForm.name}
                  onChange={e => setRestaurantForm({...restaurantForm, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Support Email</label>
                <input 
                  required
                  type="email" 
                  value={restaurantForm.email}
                  onChange={e => setRestaurantForm({...restaurantForm, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Support Phone</label>
                <input 
                  required
                  type="tel" 
                  value={restaurantForm.phone}
                  onChange={e => setRestaurantForm({...restaurantForm, phone: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-slate-700">Full Address</label>
                <textarea 
                  required
                  rows={3}
                  value={restaurantForm.addressLine}
                  onChange={e => setRestaurantForm({...restaurantForm, addressLine: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 font-semibold outline-none focus:border-brand-500 transition-all resize-none"
                />
              </div>
              <div className="md:col-span-2 mt-4">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-brand-100"
                >
                  {loading ? 'Saving Restaurant...' : 'Complete Registration'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>


    </div>
  );
};

export default AdminCreateRestaurantPage;
