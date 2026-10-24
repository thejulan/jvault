import hashlib
from typing import Dict, Any, List
from bip_utils import (
    Bip39MnemonicGenerator, Bip39SeedGenerator, Bip39MnemonicValidator,
    Bip44, Bip44Coins, Bip84, Bip84Coins, Bip44Changes
)
from app.crypto.networks import NETWORKS

class WalletGenerator:
    @staticmethod
    def generate_mnemonic(words_num: int = 12) -> str:
        """Generates a secure BIP39 mnemonic phrase (12 or 24 words)."""
        if words_num not in (12, 15, 18, 21, 24):
            words_num = 12
        return Bip39MnemonicGenerator().FromWordsNumber(words_num).ToStr()

    @staticmethod
    def validate_mnemonic(mnemonic: str) -> bool:
        """Validates a BIP39 mnemonic phrase."""
        try:
            return Bip39MnemonicValidator().IsValid(mnemonic.strip())
        except Exception:
            return False

    @staticmethod
    def mnemonic_to_seed(mnemonic: str, passphrase: str = "") -> bytes:
        """Derives 64-byte seed from mnemonic."""
        return Bip39SeedGenerator(mnemonic.strip()).Generate(passphrase)

    @classmethod
    def derive_address_for_network(
        cls,
        seed_bytes: bytes,
        network_id: str,
        address_index: int = 0,
        change: int = 0
    ) -> Dict[str, Any]:
        """Derives address, public key, private key, and derivation path for a specific network."""
        if network_id not in NETWORKS:
            raise ValueError(f"Unsupported network: {network_id}")

        net_info = NETWORKS[network_id]
        net_type = net_info["type"]
        change_type = Bip44Changes.CHAIN_EXT if change == 0 else Bip44Changes.CHAIN_INT

        address = ""
        priv_key = ""
        pub_key = ""
        path = ""

        try:
            if net_type == "evm":
                # Standard EVM uses BIP44 coin 60
                bip_obj = Bip44.FromSeed(seed_bytes, Bip44Coins.ETHEREUM)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().Raw().ToHex()
                path = f"m/44'/60'/0'/{change}/{address_index}"

            elif network_id == "bitcoin":
                # Native SegWit BIP84 (bc1q...)
                bip_obj = Bip84.FromSeed(seed_bytes, Bip84Coins.BITCOIN)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().ToWif()
                path = f"m/84'/0'/0'/{change}/{address_index}"

            elif network_id == "solana":
                bip_obj = Bip44.FromSeed(seed_bytes, Bip44Coins.SOLANA)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().Raw().ToHex()
                path = f"m/44'/501'/0'/{change}'/{address_index}'"

            elif network_id == "tron":
                bip_obj = Bip44.FromSeed(seed_bytes, Bip44Coins.TRON)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().Raw().ToHex()
                path = f"m/44'/195'/0'/{change}/{address_index}"

            elif network_id == "ton":
                bip_obj = Bip44.FromSeed(seed_bytes, Bip44Coins.TON)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().Raw().ToHex()
                path = f"m/44'/607'/0'/{change}/{address_index}"

            elif network_id == "litecoin":
                bip_obj = Bip84.FromSeed(seed_bytes, Bip84Coins.LITECOIN)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().ToWif()
                path = f"m/84'/2'/0'/{change}/{address_index}"

            elif network_id == "dogecoin":
                bip_obj = Bip44.FromSeed(seed_bytes, Bip44Coins.DOGECOIN)
                leaf = bip_obj.Purpose().Coin().Account(0).Change(change_type).AddressIndex(address_index)
                address = leaf.PublicKey().ToAddress()
                pub_key = leaf.PublicKey().RawCompressed().ToHex()
                priv_key = leaf.PrivateKey().ToWif()
                path = f"m/44'/3'/0'/{change}/{address_index}"

            return {
                "network_id": network_id,
                "network_name": net_info["name"],
                "short_name": net_info["short_name"],
                "address": address,
                "address_index": address_index,
                "derivation_path": path,
                "public_key": pub_key,
                "private_key": priv_key,
                "explorer_url": net_info["explorer_addr"].format(address=address)
            }
        except Exception as e:
            raise RuntimeError(f"Error deriving address for {network_id}: {str(e)}")

    @classmethod
    def generate_all_network_addresses(
        cls,
        seed_bytes: bytes,
        address_index: int = 0
    ) -> List[Dict[str, Any]]:
        """Generates addresses across all supported networks for a given address_index."""
        addresses = []
        for net_id in NETWORKS.keys():
            res = cls.derive_address_for_network(seed_bytes, net_id, address_index=address_index)
            addresses.append(res)
        return addresses
