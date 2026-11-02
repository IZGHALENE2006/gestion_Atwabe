import mongoose from "mongoose";
import Client from "../models/Client.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function normalizeDocumentClientId(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) throw fail("invalidClientSelection");
  return value.toLowerCase();
}

// Keep the printed name as a snapshot, even if the client's record changes later.
export async function resolveDocumentClient({ clientId, clientName }, idAdmin, session) {
  const id = normalizeDocumentClientId(clientId);
  if (!id) return { clientName: clientName.trim() };
  if (!mongoose.isValidObjectId(idAdmin)) throw fail("clientUnavailable", 404);
  let query = Client.findOne({ _id: id, idAdmin }).select("_id name");
  if (session) query = query.session(session);
  const client = await query;
  if (!client) throw fail("clientUnavailable", 404);
  return { clientId: client._id, clientName: client.name };
}
