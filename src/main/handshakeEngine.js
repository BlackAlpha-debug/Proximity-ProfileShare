import tls from 'tls'
import { validateProfilePayload } from './profilePayload.js'

// Electron-free handshake protocol engine so the choreography (including the
// simultaneous-tap tie-break and the TLS profile exchange) can be unit-tested
// with two engines over real sockets. handshake.js wires this to electron.
//
// Transport is TLS (self-signed) — see certs.js. Self-signed TLS only ENCRYPTS
// the channel; it does not authenticate the peer. Identity is confirmed by the
// two-word verification code, so the client connects with rejectUnauthorized:false.
//
// Wire protocol — newline-delimited JSON:
//   share-request   { deviceId, displayName }   initiator → receiver
//   share-accept    { deviceId, displayName }   receiver  → initiator
//   share-decline   { deviceId, reason }         receiver  → initiator
//   share-cancel    { deviceId }                 initiator → receiver (gave up)
//   profile-payload { profile }                  both ways, after acceptance

export function createHandshakeEngine({
  ownId,
  ownName,
  ownProfile,
  emit,
  tlsCredentials,
  receiverTimeoutMs = 20000,
  initiatorTimeoutMs = 25000,
  exchangeTimeoutMs = 12000
}) {
  let server = null
  let serverPort = null
  let startPromise = null
  const outgoing = new Map() // peerId -> { socket, timer, peer }   (request pending)
  const incoming = new Map() // peerId -> { socket, timer, name }   (awaiting user)
  const exchanges = new Map() // peerId -> { socket, timer, name }  (swapping payloads)

  function send(socket, message) {
    try {
      socket.write(JSON.stringify(message) + '\n')
    } catch {
      /* socket already gone */
    }
  }

  function attachReader(socket, onMessage) {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        let message
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        onMessage(message)
      }
    })
  }

  function clearOutgoing(peerId) {
    const entry = outgoing.get(peerId)
    if (!entry) return
    clearTimeout(entry.timer)
    try {
      entry.socket.destroy()
    } catch {
      /* ignore */
    }
    outgoing.delete(peerId)
  }

  function clearIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return
    clearTimeout(entry.timer)
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
    incoming.delete(peerId)
  }

  function clearExchange(peerId) {
    const entry = exchanges.get(peerId)
    if (!entry) return
    clearTimeout(entry.timer)
    // Delete before end() so the socket 'close' handler sees no active exchange.
    exchanges.delete(peerId)
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
  }

  // ---- Profile exchange (after both sides have accepted) ----

  function beginExchange(peerId, socket, name) {
    socket.__peerId = peerId
    // Send our own card (with our deviceId; never our local photoPath).
    const profile = { ...(ownProfile() || {}), deviceId: ownId() }
    delete profile.photoPath
    send(socket, { type: 'profile-payload', profile })

    const timer = setTimeout(() => {
      if (exchanges.has(peerId)) {
        emit({ type: 'error', peer: { deviceId: peerId, name }, reason: 'timeout' })
        clearExchange(peerId)
      }
    }, exchangeTimeoutMs)
    exchanges.set(peerId, { socket, timer, name })

    const onFailure = () => {
      if (exchanges.has(peerId)) {
        emit({ type: 'error', peer: { deviceId: peerId, name }, reason: 'connection' })
        clearExchange(peerId)
      }
    }
    socket.on('error', onFailure)
    socket.on('close', onFailure)
  }

  function onProfilePayload(peerId, message) {
    const entry = exchanges.get(peerId)
    if (!entry) return
    const clean = validateProfilePayload(message.profile)
    if (!clean) {
      emit({ type: 'error', peer: { deviceId: peerId, name: entry.name }, reason: 'invalid-payload' })
      clearExchange(peerId)
      return
    }
    emit({ type: 'profile-received', peer: { deviceId: peerId, name: entry.name }, profile: clean })
    clearExchange(peerId)
  }

  // ---- Server side ----

  function ensureServer() {
    if (server && serverPort) return Promise.resolve(serverPort)
    if (startPromise) return startPromise
    startPromise = (async () => {
      const { cert, key } = await tlsCredentials()
      await new Promise((resolve) => {
        server = tls.createServer({ cert, key }, (socket) => handleConnection(socket))
        server.on('error', () => {})
        server.listen(0, () => {
          serverPort = server.address().port
          resolve()
        })
      })
      return serverPort
    })()
    return startPromise
  }

  function handleConnection(socket) {
    socket.on('error', () => {})
    attachReader(socket, (message) => {
      if (message.type === 'share-request') {
        onShareRequest(socket, message)
      } else if (message.type === 'share-cancel') {
        const peerId = String(message.deviceId || '')
        if (incoming.has(peerId)) {
          clearIncoming(peerId)
          emit({ type: 'incoming-cancelled', peer: { deviceId: peerId } })
        }
      } else if (message.type === 'profile-payload') {
        onProfilePayload(socket.__peerId, message)
      }
    })
  }

  function onShareRequest(socket, message) {
    const me = ownId()
    const peerId = String(message.deviceId || '')
    const name = message.displayName || 'Someone'
    if (!peerId || peerId === me) return

    // Simultaneous tap: we already sent this peer a request. Break the tie by
    // comparing deviceIds — the smaller id is the sole initiator.
    if (outgoing.has(peerId)) {
      if (me < peerId) {
        // We are the initiator. Ignore the peer's redundant request and keep
        // waiting for our outgoing to be accepted. We deliberately do NOT close
        // this socket — the peer tears it down when it cancels its own outgoing.
        return
      }
      // Peer is the initiator (smaller id). Drop our own outgoing and treat the
      // peer's incoming request as an implicit accept, then exchange payloads.
      clearOutgoing(peerId)
      send(socket, { type: 'share-accept', deviceId: me, displayName: ownName() })
      emit({ type: 'completed', peer: { deviceId: peerId, name }, role: 'accepter', tieBroken: true })
      beginExchange(peerId, socket, name)
      return
    }

    if (incoming.has(peerId)) return // ignore duplicates while one is pending

    // Normal case: prompt the user to Accept / Decline.
    const timer = setTimeout(() => {
      send(socket, { type: 'share-decline', deviceId: me, reason: 'timeout' })
      incoming.delete(peerId)
      try {
        socket.end()
      } catch {
        /* ignore */
      }
      emit({ type: 'incoming-cancelled', peer: { deviceId: peerId }, reason: 'timeout' })
    }, receiverTimeoutMs)

    incoming.set(peerId, { socket, timer, name })
    emit({ type: 'incoming-request', peer: { deviceId: peerId, name } })
  }

  function acceptIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return { ok: false }
    clearTimeout(entry.timer)
    incoming.delete(peerId)
    send(entry.socket, { type: 'share-accept', deviceId: ownId(), displayName: ownName() })
    emit({ type: 'completed', peer: { deviceId: peerId, name: entry.name }, role: 'accepter' })
    beginExchange(peerId, entry.socket, entry.name)
    return { ok: true }
  }

  function declineIncoming(peerId) {
    const entry = incoming.get(peerId)
    if (!entry) return { ok: false }
    clearTimeout(entry.timer)
    send(entry.socket, { type: 'share-decline', deviceId: ownId(), reason: 'declined' })
    incoming.delete(peerId)
    try {
      entry.socket.end()
    } catch {
      /* ignore */
    }
    return { ok: true }
  }

  // ---- Client side ----

  function requestShare(peer) {
    const me = ownId()
    const peerId = String(peer?.deviceId || '')
    if (!peerId || peerId === me) return { ok: false, reason: 'invalid-peer' }
    if (!peer.ip || !peer.port) {
      emit({ type: 'cancelled', peer, reason: 'unreachable' })
      return { ok: false, reason: 'unreachable' }
    }
    if (outgoing.has(peerId)) return { ok: true, already: true }

    // rejectUnauthorized:false — we accept the self-signed cert (channel encryption
    // only); the verification code, not TLS, establishes identity.
    const socket = tls.connect(
      { host: peer.ip, port: peer.port, rejectUnauthorized: false },
      () => {
        send(socket, { type: 'share-request', deviceId: me, displayName: ownName() })
        emit({ type: 'outgoing-pending', peer })
      }
    )

    const timer = setTimeout(() => {
      send(socket, { type: 'share-cancel', deviceId: me })
      clearOutgoing(peerId)
      emit({ type: 'cancelled', peer, reason: 'timeout' })
    }, initiatorTimeoutMs)

    outgoing.set(peerId, { socket, timer, peer })

    attachReader(socket, (message) => {
      if (message.type === 'share-accept') {
        // Promote to the exchange phase — keep the socket open.
        const entry = outgoing.get(peerId)
        if (entry) clearTimeout(entry.timer)
        outgoing.delete(peerId)
        emit({ type: 'completed', peer, role: 'initiator' })
        beginExchange(peerId, socket, peer.name)
      } else if (message.type === 'share-decline') {
        clearOutgoing(peerId)
        emit({ type: 'declined', peer, reason: message.reason || 'declined' })
      } else if (message.type === 'profile-payload') {
        onProfilePayload(peerId, message)
      }
    })

    socket.on('error', () => {
      if (outgoing.has(peerId)) {
        clearOutgoing(peerId)
        emit({ type: 'cancelled', peer, reason: 'unreachable' })
      }
    })

    return { ok: true }
  }

  function cancelOutgoing(peerId) {
    const entry = outgoing.get(peerId)
    if (!entry) return { ok: false }
    send(entry.socket, { type: 'share-cancel', deviceId: ownId() })
    clearOutgoing(peerId)
    return { ok: true }
  }

  function close() {
    for (const peerId of [...outgoing.keys()]) clearOutgoing(peerId)
    for (const peerId of [...incoming.keys()]) clearIncoming(peerId)
    for (const peerId of [...exchanges.keys()]) clearExchange(peerId)
    if (server) {
      try {
        server.close()
      } catch {
        /* ignore */
      }
      server = null
      serverPort = null
      startPromise = null
    }
  }

  return {
    ensureServer,
    requestShare,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    close,
    getPort: () => serverPort
  }
}
