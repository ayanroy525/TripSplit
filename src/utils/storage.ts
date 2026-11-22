// Barrel re-exports for modular storage layer
export type {
  DbMemberRow,
  DbExpenseRow,
  DbPaymentRow,
  DbActivityRow,
  ServerTripPayload,
} from "./storage/mappers";
export {
  mapTripToRow,
  mapMemberToRow,
  mapExpenseToRow,
  mapPaymentToRow,
  mapActivityToRow,
  isUserAuthorizedForTrip,
  isPhoneMatch,
  isEmailMatch,
} from "./storage/mappers";

export type { InviteTripPreview } from "./storage/trips";
export {
  saveTripToDatabase,
  saveTripToFirestore,
  getTripFromDatabase,
  getTripFromFirestore,
  getAllTripsFromDatabase,
  getAllTripsFromFirestore,
  deleteTripFromDatabase,
  deleteTripFromFirestore,
  linkUserToExistingTripMembers,
  getTripByInviteCode,
  joinTripByInviteCode,
} from "./storage/trips";

export {
  addExpenseToDatabase,
  addExpenseToFirestore,
  updateExpenseInDatabase,
  updateExpenseInFirestore,
  deleteExpenseFromDatabase,
  deleteExpenseFromFirestore,
  saveExpenseAtomic,
} from "./storage/expenses";

export {
  recordPaymentAtomic,
  confirmPaymentAtomic,
  addPaymentToDatabase,
  addPaymentToFirestore,
  updatePaymentInDatabase,
  updatePaymentInFirestore,
  deletePaymentFromDatabase,
  deletePaymentFromFirestore,
  addMemberToDatabase,
  addMemberToFirestore,
  updateMemberInDatabase,
  updateMemberInFirestore,
  deleteMemberFromDatabase,
  deleteMemberFromFirestore,
  addActivityToDatabase,
  addActivityToFirestore,
} from "./storage/members";

export type { AppState } from "./storage/local";
export {
  loadUserLocalState,
  saveUserLocalState,
  clearUserLocalState,
  loadState,
  saveState,
  exportBackupJSON,
  exportExpensesCSV,
  generateInviteLink,
  generateTripDeepLink,
  createCleanInitialTrip,
  DEFAULT_AUTH_USER,
  resetStorageState,
} from "./storage/local";

export {
  subscribeToTrip,
  subscribeToUserTrips,
  subscribeToAllTrips,
} from "./storage/sync";
