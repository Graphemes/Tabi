import { http } from "@/lib/http";
import { LoginSchema } from "@/features/auth/schemas/login-schema";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: number;
    email: string;
    username: string;
  };
};

export const login = async (payload: LoginSchema) => {
  const { data } = await http.post<LoginResponse>("/auth/login", payload);
  return data;
};
