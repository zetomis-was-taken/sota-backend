export interface AuthContext {
  userId: string;
  email: string | null;
  accessToken: string;
}

export interface ValidatedRequestData<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
      validated?: ValidatedRequestData;
    }
  }
}

export {};
