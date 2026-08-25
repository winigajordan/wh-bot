export type JwtPayload = {
  sub: string;
  businessId: string;
  email: string;
};

export type AuthenticatedUser = {
  userId: string;
  businessId: string;
  email: string;
};
