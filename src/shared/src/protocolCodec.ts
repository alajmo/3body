import { decode, encode } from "@msgpack/msgpack";
import type { ClientMsg, ServerMsg } from "./protocol";

export type ProtocolMessage = ClientMsg | ServerMsg;
export type ProtocolEncodedPayload = string | ArrayBufferLike | ArrayBufferView;

export const encodeProtocolMessage = (
  message: ProtocolMessage,
): Uint8Array<ArrayBuffer> =>
  encode(message, {
    ignoreUndefined: true,
  });

export const decodeProtocolMessage = (
  payload: ProtocolEncodedPayload,
): unknown =>
  typeof payload === "string" ? JSON.parse(payload) : decode(payload);
