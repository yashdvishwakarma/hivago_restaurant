import client from './client';
import { Owner, RestaurantMinimal } from '../types';
import { UpdateBankDetailsPayload } from './ownerApi';


export interface CreateOwnerPayload {
  name: string;
  email: string;
  phone: string;
  password?: string;
  panNumber?: string;
  gstNumber?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
  bankAccountName?: string;
}

export interface CreateRestaurantPayload {
  ownerId: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  addressLine: string;
  latitude: number;
  longitude: number;
}

export const createOwner = async (payload: CreateOwnerPayload): Promise<{ ownerId: string }> => {
  const response = await client.post<{ ownerId: string }>('/admin/owners', payload);
  return response.data;
};

export const createRestaurant = async (payload: CreateRestaurantPayload): Promise<{ restaurantId: string; rstCode: string }> => {
  const response = await client.post<{ restaurantId: string; rstCode: string }>('/admin/restaurants', payload);
  return response.data;
};

export const getAllOwners = async (): Promise<Owner[]> => {
  const response = await client.get<Owner[]>('/admin/owners');
  return response.data;
};

export const updateOwnerBankDetailsAdmin = async (ownerId: string, payload: UpdateBankDetailsPayload): Promise<any> => {
  const response = await client.put(`/admin/owners/${ownerId}/bank`, payload);
  return response.data;
};

export const toggleCrossOutletAcceptAdmin = async (ownerId: string, enabled: boolean): Promise<any> => {
  const response = await client.put(`/admin/owners/${ownerId}/cross-outlet-accept`, { enabled });
  return response.data;
};

