export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "UPSTREAM_FAILURE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type ApiErrorPayload = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
  };
};

export type ApiSuccessPayload<T> = {
  success: true;
  data: T;
  requestId: string;
};

export type RequestContext = {
  requestId: string;
  startedAtMs: number;
  route: string;
  method: string;
};

