import { bech32 } from "@scure/base"
import * as secp256k1 from "@noble/secp256k1"
import { Relay } from "@tijlxyz/nostr-old"

const Bech32MaxSize = 5000

export const nip19 = {

  decode: (nip19) => {

    let { prefix, words } = bech32.decode(nip19, 1000)
    let data = new Uint8Array(bech32.fromWords(words))

    if (prefix === 'nprofile') {
      let tlv = parseTLV(data)
      if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for nprofile')
      if (tlv[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')

      if (tlv[1] == undefined) {
        return {
          type: 'nprofile',
          data: {
            pubkey: secp256k1.utils.bytesToHex(tlv[0][0]),
            relays: []
          }
        }
      }

      return {
        type: 'nprofile',
        data: {
          pubkey: secp256k1.utils.bytesToHex(tlv[0][0]),
          relays: tlv[1].map(d => utf8Decoder.decode(d))
        }
      }
    }

    if (prefix === 'nevent') {
      let tlv = parseTLV(data)
      if (!tlv[0]?.[0]) throw new Error('missing TLV 0 for nevent')
      if (tlv[0][0].length !== 32) throw new Error('TLV 0 should be 32 bytes')

      return {
        type: 'nevent',
        data: {
          id: secp256k1.utils.bytesToHex(tlv[0][0]),
          relays: tlv[1].map(d => utf8Decoder.decode(d))
        }
      }
    }

    if (prefix === 'nsec' || prefix === 'npub' || prefix === 'note') {
      return { type: prefix, data: secp256k1.utils.bytesToHex(data) }
    }

    throw new Error(`unknown prefix ${prefix}`)

  },

  neventEncode(event) {
    let data = encodeTLV({
      0: [secp256k1.utils.hexToBytes(event.id)],
      1: (event.relays || []).map(url => utf8Encoder.encode(url)),
      2: event.author ? [secp256k1.utils.hexToBytes(event.author)] : []
    })
    let words = bech32.toWords(data)
    return bech32.encode('nevent', words, Bech32MaxSize)
  },

  npubEncode(hex) {
    return encodeBytes('npub', hex)
  }

}

function encodeBytes(prefix, hex) {
  let data = secp256k1.utils.hexToBytes(hex)
  let words = bech32.toWords(data)
  return bech32.encode(prefix, words, Bech32MaxSize)
}

function parseTLV(data) {
  let result = {}
  let rest = data
  while (rest.length > 0) {
    let t = rest[0]
    let l = rest[1]
    let v = rest.slice(2, 2 + l)
    rest = rest.slice(2 + l)
    if (v.length < l) continue
    result[t] = result[t] || []
    result[t].push(v)
  }
  return result
}

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

function encodeTLV(tlv) {
  let entries = []

  Object.entries(tlv)
    .reverse()
    .forEach(([t, vs]) => {
      vs.forEach(v => {
        let entry = new Uint8Array(v.length + 2)
        entry.set([parseInt(t)], 0)
        entry.set([v.length], 1)
        entry.set(v, 2)
        entries.push(entry)
      })
    })

  return secp256k1.utils.concatBytes(...entries)
}

let serial = 0;

let relayCons = new Map()

export function getEvents(relays, filter) {
  return new Promise(resolve => {

    serial = serial + 1;
    const eventsSubId = String(serial);
    let gotEvents = [];
    let relaysEose = 0;
    let sondTimeout = false;
    let timeoutId = undefined;

    relays.forEach((relay) => {

      if (relayCons[relay] == undefined || relayCons[relay].ws.readyState == 3) {
        relayCons[relay] = Relay(relay, { reconnect: false })
        relayCons[relay].on('open', () => {
          relayCons[relay].subscribe(eventsSubId, filter)
        })
      } else {
        relayCons[relay].subscribe(eventsSubId, filter)
      }

      relayCons[relay].on('event', (sub_id, ev) => {
        if (sub_id == eventsSubId) {
          gotEvents.push(ev)

          tryResolve()

          if (sondTimeout == false) {
            sondTimeout = true;
            timeoutId = setTimeout(() => {
              if (gotEvents.length > 0) {
                resolveAndProcessNow()
              } else {
                resolveAndProcessNullNow()
              }
            }, 12000)
          }
        }
      })

      relayCons[relay].on('eose', (sub_id) => {
        if (sub_id == eventsSubId) {
          relaysEose++;

          tryResolve()
        }
      })

      relayCons[relay].on('close', () => {
        relaysEose++;

        tryResolve()
      })

    })

    function tryResolve() {
      if (relaysEose >= relays.length) {
        if (gotEvents > 0) {
          resolveAndProcessNullNow()
        } else {
          resolveAndProcessNow()
        }
      }
    }

    function resolveAndProcessNow() {
      clearTimeout(timeoutId)
      // Process Data
      // Filter out duplicates
      const seenIds = new Set();
      gotEvents = gotEvents.filter(event => {
        if (seenIds.has(event.id)) {
          return false;
        } else {
          seenIds.add(event.id);
          return true;
        }
      });
      // Sort
      gotEvents = gotEvents.sort((a, b) => b.created_at - a.created_at)
      resolve(gotEvents)
    }

    function resolveAndProcessNullNow() {
      clearTimeout(timeoutId)
      resolve(null)
    }

  })
}

