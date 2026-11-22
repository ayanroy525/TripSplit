import type { IncomingMessage, ServerResponse } from "http";

export type QueryParamValue = string | string[] | undefined;

export interface ApiRequest extends IncomingMessage {
  query?: Record<string, QueryParamValue>;
  body?: unknown;
  cookies?: Record<string, string>;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (body: unknown) => ApiResponse;
  send?: (body: unknown) => ApiResponse;
}

export interface DbRecord extends Record<string, unknown> {
  id: string;
}

export interface DbTripChildRow extends DbRecord {
  trip_id: string;
}

export interface TelegramChat {
  id?: number | string;
  first_name?: string;
  username?: string;
}

export interface TelegramUser {
  id?: number | string;
  first_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
}

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message ?? err);
  }
  return String(err);
}
