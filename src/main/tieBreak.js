// Pure tie-break comparator for the simultaneous-tap case in the handshake.
// Electron-free so it can be unit-tested. When both peers tap each other at the
// same instant, both sides hold an outgoing request; exactly one must proceed as
// the initiator. The rule is a total, symmetric ordering on deviceIds: the
// lexicographically SMALLER id is the sole initiator, the larger id accepts.
//
// Because string comparison is a total order, both devices independently reach
// the same conclusion (one initiator, one accepter) with no coordination.

// The initiator of a tie is the peer with the smaller deviceId.
export function tieBreakInitiator(idA, idB) {
  return String(idA) < String(idB) ? String(idA) : String(idB)
}

// From our own perspective: are WE the initiator against this peer?
// True when our id sorts before the peer's. Ties (equal ids) are not a real
// scenario — deviceIds are unique per install — but return false defensively so
// a self-collision never yields two initiators.
export function isInitiator(ownId, peerId) {
  return String(ownId) < String(peerId)
}
