import struct
import hashlib
import logging
import httpx
from typing import Tuple, Optional
import coincurve
from bip_utils import WifDecoder, Base58Decoder, SegwitBech32Decoder

logger = logging.getLogger("jvault.broadcaster")

def dsha256(b: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()

def hash160(b: bytes) -> bytes:
    return hashlib.new('ripemd160', hashlib.sha256(b).digest()).digest()

class TxBroadcaster:
    @staticmethod
    async def broadcast_litecoin(
        private_key_wif: str,
        from_address: str,
        to_address: str,
        amount_ltc: float,
        fee_sats: int = 3000
    ) -> Tuple[bool, str]:
        """Constructs, signs, and broadcasts a real SegWit (P2WPKH) Litecoin transaction."""
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JVault/1.1"}
        amount_sats = int(round(amount_ltc * 100_000_000))

        try:
            async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
                # 1. Fetch live UTXOs
                utxo_res = await client.get(f"https://litecoinspace.org/api/address/{from_address}/utxo")
                if utxo_res.status_code != 200:
                    return False, f"Failed to fetch UTXOs: HTTP {utxo_res.status_code}"

                utxos = utxo_res.json()
                if not utxos:
                    return False, "No confirmed UTXOs found on address"

                # 2. Decode private key and derive pubkey & hash160
                key_bytes, _ = WifDecoder.Decode(private_key_wif, net_ver=b"\xb0")
                priv_obj = coincurve.PrivateKey(key_bytes)
                pub_bytes = priv_obj.public_key.format(compressed=True)
                pkh = hash160(pub_bytes)

                # 3. Decode destination address to scriptPubKey
                to_addr = to_address.strip()
                if to_addr.lower().startswith("ltc1"):
                    # Native SegWit P2WPKH
                    ver, prog = SegwitBech32Decoder.Decode("ltc", to_addr)
                    dest_script = bytes([0x00, len(prog)]) + prog
                else:
                    # Legacy P2PKH (starts with L) or P2SH (starts with M)
                    decoded = Base58Decoder.CheckDecode(to_addr)
                    ver_byte = decoded[0]
                    dest_pkh = decoded[1:]
                    if ver_byte == 0x30: # 'L' P2PKH
                        dest_script = b"\x76\xa9\x14" + dest_pkh + b"\x88\xac"
                    else: # P2SH 'M'
                        dest_script = b"\xa9\x14" + dest_pkh + b"\x87"

                # 4. Gather UTXOs to cover amount + fee
                needed = amount_sats + fee_sats
                selected_utxos = []
                total_in = 0
                for u in utxos:
                    selected_utxos.append(u)
                    total_in += u["value"]
                    if total_in >= needed:
                        break

                if total_in < needed:
                    # If total_in can cover amount minus fee, sweep
                    if total_in > fee_sats:
                        amount_sats = total_in - fee_sats
                    else:
                        return False, f"Insufficient balance for fee ({total_in} < {needed} litoshis)"

                change_sats = total_in - (amount_sats + fee_sats)

                # 5. Build outputs
                outputs_bytes = bytearray()
                # Output 1: to recipient
                outputs_bytes += struct.pack("<Q", amount_sats) + bytes([len(dest_script)]) + dest_script

                # Output 2: Change back to from_address if change > dust (546 litoshis)
                if change_sats > 1000:
                    change_script = b"\x00\x14" + pkh
                    outputs_bytes += struct.pack("<Q", change_sats) + bytes([len(change_script)]) + change_script
                    num_outputs = 2
                else:
                    num_outputs = 1

                # 6. BIP143 Sighashes & Inputs
                hashPrevouts_data = bytearray()
                hashSequence_data = bytearray()
                for u in selected_utxos:
                    hashPrevouts_data += bytes.fromhex(u["txid"])[::-1] + struct.pack("<I", u["vout"])
                    hashSequence_data += struct.pack("<I", 0xffffffff)

                hashPrevouts = dsha256(bytes(hashPrevouts_data))
                hashSequence = dsha256(bytes(hashSequence_data))
                hashOutputs = dsha256(bytes(outputs_bytes))
                scriptCode = b"\x19\x76\xa9\x14" + pkh + b"\x88\xac"

                witnesses = []
                for u in selected_utxos:
                    outpoint = bytes.fromhex(u["txid"])[::-1] + struct.pack("<I", u["vout"])
                    preimage = (
                        struct.pack("<I", 1) +
                        hashPrevouts +
                        hashSequence +
                        outpoint +
                        scriptCode +
                        struct.pack("<Q", u["value"]) +
                        struct.pack("<I", 0xffffffff) +
                        hashOutputs +
                        struct.pack("<I", 0) +
                        struct.pack("<I", 1) # SIGHASH_ALL
                    )
                    sighash = dsha256(preimage)
                    sig_der = priv_obj.sign(sighash, hasher=None)
                    sig_with_hashtype = sig_der + b"\x01"
                    witnesses.append((sig_with_hashtype, pub_bytes))

                # 7. Construct Raw SegWit Transaction
                raw_tx = bytearray()
                raw_tx += struct.pack("<I", 1) # version
                raw_tx += b"\x00\x01"          # marker & flag
                raw_tx += bytes([len(selected_utxos)]) # vin count

                for u in selected_utxos:
                    raw_tx += bytes.fromhex(u["txid"])[::-1] + struct.pack("<I", u["vout"])
                    raw_tx += b"\x00"                  # empty scriptSig
                    raw_tx += struct.pack("<I", 0xffffffff) # sequence

                raw_tx += bytes([num_outputs])
                raw_tx += outputs_bytes

                # Witnesses
                for sig, pub in witnesses:
                    raw_tx += b"\x02" # 2 witness stack items
                    raw_tx += bytes([len(sig)]) + sig
                    raw_tx += bytes([len(pub)]) + pub

                raw_tx += struct.pack("<I", 0) # locktime

                # 8. Broadcast to Litecoin node
                raw_hex = raw_tx.hex()
                post_res = await client.post("https://litecoinspace.org/api/tx", content=raw_hex)
                if post_res.status_code == 200:
                    txid = post_res.text.strip()
                    logger.info(f"Successfully broadcasted real LTC tx: {txid}")
                    return True, txid
                else:
                    return False, f"Broadcast failed: {post_res.text}"

        except Exception as e:
            logger.error(f"Error broadcasting Litecoin tx: {e}")
            return False, str(e)
