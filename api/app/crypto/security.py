import os
import json
import base64
import hashlib
from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Random import get_random_bytes
from Crypto.Hash import SHA256
from app.config import settings

def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derives a 256-bit key using PBKDF2 HMAC-SHA256."""
    return PBKDF2(passphrase.encode('utf-8'), salt, dkLen=32, count=100000, hmac_hash_module=SHA256)

def encrypt_payload(data: dict | str, passphrase: str = None) -> str:
    """Encrypts plaintext/dict using AES-256-GCM. Returns base64 encoded string."""
    if passphrase is None:
        passphrase = settings.SECRET_KEY
    if isinstance(data, dict):
        raw_text = json.dumps(data)
    else:
        raw_text = str(data)
        
    salt = get_random_bytes(16)
    key = derive_key(passphrase, salt)
    cipher = AES.new(key, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(raw_text.encode('utf-8'))
    
    payload = {
        "s": base64.b64encode(salt).decode('utf-8'),
        "n": base64.b64encode(cipher.nonce).decode('utf-8'),
        "t": base64.b64encode(tag).decode('utf-8'),
        "c": base64.b64encode(ciphertext).decode('utf-8')
    }
    return base64.b64encode(json.dumps(payload).encode('utf-8')).decode('utf-8')

def decrypt_payload(encrypted_token: str, passphrase: str = None) -> str | dict:
    """Decrypts base64 token using AES-256-GCM. Returns string or dict if valid json."""
    if passphrase is None:
        passphrase = settings.SECRET_KEY
    try:
        raw_json = base64.b64decode(encrypted_token.encode('utf-8')).decode('utf-8')
        payload = json.loads(raw_json)
        salt = base64.b64decode(payload["s"])
        nonce = base64.b64decode(payload["n"])
        tag = base64.b64decode(payload["t"])
        ciphertext = base64.b64decode(payload["c"])
        
        key = derive_key(passphrase, salt)
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        decrypted = cipher.decrypt_and_verify(ciphertext, tag).decode('utf-8')
        try:
            return json.loads(decrypted)
        except Exception:
            return decrypted
    except Exception as e:
        raise ValueError(f"Decryption failed or invalid passphrase: {str(e)}")

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if salt is None:
        salt = os.urandom(16).hex()
    hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return hashed, salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    expected, _ = hash_password(password, salt)
    return hashlib.sha256(expected.encode()).hexdigest() == hashlib.sha256(hashed.encode()).hexdigest()
