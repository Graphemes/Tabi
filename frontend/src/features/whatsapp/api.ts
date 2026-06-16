import { http } from "@/lib/http";

export type ApiUser = {
  id: number;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  mobile?: string;
  phone?: string | null;
  contactName?: string | null;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  user: ApiUser;
  mobile?: string;
  name?: string;
  phone?: string;
};

export type ApiContact = {
  contactId: number;
  name?: string;
  user: ApiUser;
  createdAt: string;
};

export type DiscoverUser = ApiUser & {
  isContact: boolean;
  contactName?: string | null;
};

export type ApiGroup = {
  id: number;
  name: string;
  description?: string | null;
  photoUrl?: string | null;
  defaultCurrency: string;
  members: Array<{
    userId: number;
    user: ApiUser;
  }>;
  updatedAt: string;
};

export type ApiMessage = {
  id: number;
  groupId: number;
  senderId: number;
  type: "TEXT" | "IMAGE" | "VIDEO" | "LOCATION" | "SYSTEM";
  content?: string | null;
  mediaUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
};

export const mobileLogin = async (payload: { name: string; mobile: string }) => {
  const { data } = await http.post<AuthResponse>("/auth/mobile-login", payload);
  return data;
};

export const requestOtp = async (phone: string) => {
  const { data } = await http.post<{ message: string }>("/auth/request-otp", { phone });
  return data;
};

export const verifyOtp = async (payload: { phone: string; otp: string }) => {
  const { data } = await http.post<AuthResponse>("/auth/verify-otp", payload);
  return data;
};

export const listContacts = async () => {
  const { data } = await http.get<ApiContact[]>("/friends");
  return data;
};

export const discoverUsers = async (query = "") => {
  const { data } = await http.get<DiscoverUser[]>("/friends/discover", {
    params: query ? { query } : undefined,
  });
  return data;
};

export const addContact = async (payload: {
  contacts: Array<{ phone: string; name?: string }>;
}) => {
  const { data } = await http.post<{
    results: Array<{ phone: string; status: string; error?: string }>;
  }>("/friends/add-contact", payload);
  return data;
};

export const getGroups = async () => {
  const { data } = await http.get<ApiGroup[]>("/groups");
  return data;
};

export const createGroup = async (payload: { name: string }) => {
  const { data } = await http.post<ApiGroup>("/groups", payload);
  return data;
};

export const addGroupMember = async (groupId: number, userId: number) => {
  const { data } = await http.post(`/groups/${groupId}/members`, { userId });
  return data;
};

export const getMessages = async (groupId: number) => {
  const { data } = await http.get<ApiMessage[]>(`/groups/${groupId}/messages`);
  return data.slice().reverse();
};

export const sendMessage = async (
  groupId: number,
  payload: {
    type?: "TEXT" | "LOCATION";
    content?: string;
    latitude?: number;
    longitude?: number;
  },
) => {
  const { data } = await http.post<ApiMessage>(`/groups/${groupId}/messages`, payload);
  return data;
};

export const sendLocationMessage = async (groupId: number) => {
  const latitude = 28.6139;
  const longitude = 77.209;
  const { data } = await http.post<ApiMessage>(`/groups/${groupId}/location/message`, {
    latitude,
    longitude,
  });
  return data;
};

export type ApiProfile = {
  id: number;
  email: string | null;
  username: string | null;
  name: string | null;
  phone: string | null;
};

export const getProfile = async () => {
  const { data } = await http.get<ApiProfile>("/users/profile");
  return data;
};

export const updateProfile = async (payload: {
  name?: string;
  username?: string;
  email?: string;
  phone?: string;
}) => {
  const { data } = await http.patch<ApiProfile>("/users/profile", payload);
  return data;
};

export const changePassword = async (payload: { currentPassword: string; newPassword: string }) => {
  const { data } = await http.post("/auth/change-password", payload);
  return data;
};

export const deleteAccount = async () => {
  const { data } = await http.delete("/users/account");
  return data;
};

export const logout = async () => {
  const { data } = await http.post("/auth/logout");
  return data;
};

export const createExpense = async (
  group: ApiGroup,
  userId: number,
  payload: { title: string; amount: number },
) => {
  const memberIds = group.members.map((member) => member.userId);
  const { data } = await http.post(`/groups/${group.id}/expenses`, {
    title: payload.title,
    totalAmount: payload.amount,
    currency: group.defaultCurrency || "USD",
    splitType: "EQUAL",
    paidBy: [{ userId, amount: payload.amount }],
    participants: memberIds.map((memberId) => ({ userId: memberId })),
  });
  return data;
};
