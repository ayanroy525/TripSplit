/**
 * Unified Server-Side In-Memory Fallback Store
 * Re-exports from api/_shared.ts so Express routes and API handlers share a single
 * in-memory fallback store without ever writing sensitive records or password hashes to disk.
 */
export {
  getLocalStore,
  saveLocalStore,
  findLocalUser,
  findLocalMember,
  saveLocalUser,
  getFullTripsForUser,
  linkUserToTripMembersInDb,
  type LocalUserRecord,
  type LocalMemberRecord,
  type ServerStoreSchema,
} from "../api/_shared";
