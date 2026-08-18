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
    status?: string;
    role?: "ADMIN" | "MEMBER";
    locationSharingEnabled?: boolean;
  }>;
  createdById?: number;
  createdBy?: ApiUser | null;
  createdAt?: string;
  /** Newest message in the group, for the trip-list preview line. */
  lastMessage?: ApiMessage | null;
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
  expenseId?: number | null;
  expense?: {
    id: number;
    title: string;
    totalAmount: string;
    currency: string;
    createdById: number;
  } | null;
  createdAt: string;
  /** The API includes the sender on both list and create; used for chat avatars/names. */
  sender?: ApiUser | null;
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

export const getGroup = async (groupId: number) => {
  const { data } = await http.get<ApiGroup>(`/groups/${groupId}`);
  return data;
};

/** Admin-only on the backend (`ensureAdmin`); non-admins get a 403. */
export const updateGroup = async (
  groupId: number,
  payload: { name?: string; description?: string },
) => {
  const { data } = await http.patch<ApiGroup>(`/groups/${groupId}`, payload);
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

export const sendLocationMessage = async (
  groupId: number,
  payload: { latitude: number; longitude: number },
) => {
  const { data } = await http.post<ApiMessage>(`/groups/${groupId}/location/message`, payload);
  return data;
};

/**
 * START = where the trip begins (at most one per trip, enforced by the backend);
 * DESTINATION = somewhere the trip is going; STOP = a waypoint along the way.
 */
export type PlaceKind = "START" | "DESTINATION" | "STOP";

export type ApiSavedPlace = {
  id: number;
  groupId: number;
  createdById: number;
  name: string;
  kind: PlaceKind;
  note?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  externalId?: string | null;
  createdAt: string;
  createdBy?: ApiUser | null;
};

export type ApiLiveLocation = {
  id: number;
  groupId: number;
  userId: number;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  sharedAt: string;
  user?: ApiUser | null;
};

export const listGroupPlaces = async (groupId: number) => {
  const { data } = await http.get<ApiSavedPlace[]>(`/groups/${groupId}/places`);
  return data;
};

export const createPlace = async (
  groupId: number,
  payload: {
    name: string;
    kind?: PlaceKind;
    note?: string;
    address?: string;
    latitude: number;
    longitude: number;
    externalId?: string;
  },
) => {
  const { data } = await http.post<ApiSavedPlace>(`/groups/${groupId}/places`, payload);
  return data;
};

export const updatePlace = async (
  groupId: number,
  placeId: number,
  payload: { name?: string; note?: string; kind?: PlaceKind },
) => {
  const { data } = await http.patch<ApiSavedPlace>(
    `/groups/${groupId}/places/${placeId}`,
    payload,
  );
  return data;
};

export const deletePlace = async (groupId: number, placeId: number) => {
  const { data } = await http.delete(`/groups/${groupId}/places/${placeId}`);
  return data;
};

export const sharePlace = async (groupId: number, placeId: number) => {
  const { data } = await http.post<ApiMessage>(
    `/groups/${groupId}/places/${placeId}/share`,
  );
  return data;
};

export const listLiveLocations = async (groupId: number) => {
  const { data } = await http.get<ApiLiveLocation[]>(`/groups/${groupId}/location/live`);
  return data;
};

export const setLocationSharing = async (groupId: number, enabled: boolean) => {
  const { data } = await http.patch(`/groups/${groupId}/location/sharing`, { enabled });
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

export const updateMemberStatus = async (
  groupId: number,
  status: 'ACTIVE' | 'PENDING' | 'ARCHIVED',
) => {
  const { data } = await http.patch(`/groups/${groupId}/members/status`, { status });
  return data;
};

export const logout = async () => {
  const { data } = await http.post("/auth/logout");
  return data;
};

export const listGroupExpenses = async (groupId: number) => {
  const { data } = await http.get(`/groups/${groupId}/expenses`);
  return data;
};

export const getGroupBalances = async (groupId: number) => {
  const { data } = await http.get(`/groups/${groupId}/balances`);
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

export type ApiSplitRule = {
  id: number;
  userId: number;
  groupId: number | null;
  name: string;
  splitType: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export const listSplitRules = async (groupId: number) => {
  const { data } = await http.get<ApiSplitRule[]>(
    `/groups/${groupId}/split-rules`,
    { params: { groupId } },
  );
  return data;
};

export const saveSplitRule = async (
  groupId: number,
  payload: { name: string; splitType: string; config: Record<string, unknown> },
) => {
  const { data } = await http.post<ApiSplitRule>(
    `/groups/${groupId}/split-rules`,
    { ...payload, groupId },
  );
  return data;
};

export const uploadReceipt = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await http.post<{ url: string }>("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
};
