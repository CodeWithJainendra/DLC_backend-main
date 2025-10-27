#!/usr/bin/env python3
"""
AES Encryption/Decryption Utility
Advanced Encryption Standard (AES) for Encryption with the following specifications:

➢ Cipher Mode Operation: Galois/Counter Mode (GCM) with No Padding
➢ Cryptographic Key: 256 bits (32 bytes)
➢ IV Vector: First 12 bytes of cryptographic key (Secret Key)
➢ GCM Tag Length: 16 Bytes

Note: AES secret key will be shared separately via Email/SMS.

This implementation is based on the C# AES Encryption Logic provided,
but adapted for Python using the cryptography library.
"""

import base64
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend


class AESEncryption:
    """
    AES GCM Encryption/Decryption class following the specified requirements
    """
    
    def __init__(self, key=None):
        """
        Initialize AES encryption with a key
        
        Args:
            key (str): 32-character dynamic key (256 bits)
        """
        self.key = key
    
    def set_key(self, key):
        """
        Set or update the encryption key
        
        Args:
            key (str): 32-character dynamic key (256 bits)
        """
        if len(key) != 32:
            raise ValueError("Key must be exactly 32 characters (256 bits)")
        self.key = key
    
    def encrypt(self, plain_text):
        """
        AES Encrypt function equivalent to the C# implementation
        
        Function Definition: public string AESEncrypt(string PlainText, byte[] key, byte[] iv)
        
        Args:
            plain_text (str): The plain text string to be encrypted
            
        Returns:
            str: Base64 encoded encrypted string (equivalent to C# Convert.ToBase64String)
        """
        if not self.key:
            raise ValueError("Encryption key not set. Use set_key() method.")
        
        encrypted_str = ""
        
        try:
            # Convert key to bytes (equivalent to Encoding.UTF8.GetBytes(key))
            secret_key = self.key.encode('utf-8')
            
            # Get IV from first 12 bytes of secret key
            # Equivalent to: Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(secretkey).Substring(0,12))
            iv = secret_key[:12]
            
            # Convert plain text to bytes (equivalent to Encoding.UTF8.GetBytes(PlainText))
            plain_bytes = plain_text.encode('utf-8')
            
            # Create AESGCM cipher (equivalent to GcmBlockCipher cipher = new GcmBlockCipher(new AesEngine()))
            aesgcm = AESGCM(secret_key)
            
            # Encrypt the data with GCM mode
            # This combines the functionality of:
            # - AeadParameters parameters = new AeadParameters(new KeyParameter(key), 128, iv, null)
            # - cipher.Init(true, parameters)
            # - cipher.ProcessBytes(...) and cipher.DoFinal(...)
            encrypted_bytes = aesgcm.encrypt(iv, plain_bytes, None)
            
            # Convert to Base64 string (equivalent to Convert.ToBase64String(encryptedBytes, Base64FormattingOptions.None))
            encrypted_str = base64.b64encode(encrypted_bytes).decode('utf-8')
            
        except Exception as ex:
            print(f"AES Encryption Error: {str(ex)}")
            # In C# implementation, exceptions are caught but ignored (empty catch block)
            
        return encrypted_str
    
    def decrypt(self, encrypted_text):
        """
        AES Decrypt function equivalent to the C# implementation
        
        Function Definition: public string AESDecrypt(string EncryptedText, byte[] key, byte[] iv)
        
        Args:
            encrypted_text (str): The Base64 encoded encrypted string
            
        Returns:
            str: Decrypted plain text string
        """
        if not self.key:
            raise ValueError("Decryption key not set. Use set_key() method.")
        
        decrypted_str = ""
        
        try:
            # Convert key to bytes (equivalent to Encoding.UTF8.GetBytes(key))
            secret_key = self.key.encode('utf-8')
            
            # Get IV from first 12 bytes of secret key
            iv = secret_key[:12]
            
            # Convert Base64 encrypted text to bytes (equivalent to Convert.FromBase64String(EncryptedText))
            encrypted_bytes = base64.b64decode(encrypted_text)
            
            # Create AESGCM cipher (equivalent to GcmBlockCipher cipher = new GcmBlockCipher(new AesEngine()))
            aesgcm = AESGCM(secret_key)
            
            # Decrypt the data
            # This combines the functionality of:
            # - AeadParameters parameters = new AeadParameters(new KeyParameter(key), 128, iv, null)
            # - cipher.Init(false, parameters)
            # - cipher.ProcessBytes(...) and cipher.DoFinal(...)
            plain_bytes = aesgcm.decrypt(iv, encrypted_bytes, None)
            
            # Convert to string and trim (equivalent to Encoding.UTF8.GetString(plainBytes).TrimEnd("\r\n\0".ToCharArray()))
            decrypted_str = plain_bytes.decode('utf-8').rstrip('\r\n\0')
            
        except Exception as ex:
            print(f"AES Decryption Error: {str(ex)}")
            # In C# implementation, exceptions are caught but ignored (empty catch block)
            
        return decrypted_str


# Standalone functions for backward compatibility
def aes_encrypt(plain_text, key):
    """
    Standalone AES encryption function
    
    Args:
        plain_text (str): The plain text string to be encrypted
        key (str): The 32-character dynamic key
        
    Returns:
        str: Base64 encoded encrypted string
    """
    aes = AESEncryption(key)
    return aes.encrypt(plain_text)


def aes_decrypt(encrypted_text, key):
    """
    Standalone AES decryption function
    
    Args:
        encrypted_text (str): The Base64 encoded encrypted string
        key (str): The 32-character dynamic key
        
    Returns:
        str: Decrypted plain text string
    """
    aes = AESEncryption(key)
    return aes.decrypt(encrypted_text)


def encrypt_json_data(json_data, key):
    """
    Utility function to encrypt JSON data
    
    Args:
        json_data (dict): The JSON data to encrypt
        key (str): The 32-character AES key
        
    Returns:
        str: Base64 encoded encrypted string
    """
    json_str = json.dumps(json_data, separators=(',', ':'))  # Compact JSON
    return aes_encrypt(json_str, key)


def decrypt_json_data(encrypted_data, key):
    """
    Utility function to decrypt JSON data
    
    Args:
        encrypted_data (str): Base64 encoded encrypted string
        key (str): The 32-character AES key
        
    Returns:
        dict: Decrypted JSON data
    """
    decrypted_str = aes_decrypt(encrypted_data, key)
    try:
        return json.loads(decrypted_str)
    except json.JSONDecodeError:
        return None


def demo():
    """
    Demonstration of AES encryption/decryption functionality
    """
    print("=== AES Encryption/Decryption Demo ===")
    
    # Test with the same key structure as in the requirements
    dynamic_key = "bam5kllfzjzvjv560s5q24fnwbtqs50d"  # 32 character key
    test_text = "Hello, this is a test message for AES-GCM encryption!"
    
    print(f"Dynamic Key (32 chars): {dynamic_key}")
    print(f"IV (First 12 bytes): {dynamic_key[:12]}")
    print(f"Original Text: {test_text}")
    
    # Initialize AES encryption
    aes_cipher = AESEncryption(dynamic_key)
    
    # Encrypt
    encrypted = aes_cipher.encrypt(test_text)
    print(f"Encrypted (Base64): {encrypted}")
    
    # Decrypt
    decrypted = aes_cipher.decrypt(encrypted)
    print(f"Decrypted Text: {decrypted}")
    
    # Verify
    success = test_text == decrypted
    print(f"Encryption/Decryption Test: {'✅ SUCCESS' if success else '❌ FAILED'}")
    
    # Test with JSON data
    print("\n--- JSON Data Encryption Test ---")
    test_json = {
        "username": "UserJP",
        "password": "sensitive_password",
        "timestamp": "20250922093000",
        "data": "confidential information"
    }
    
    encrypted_json = encrypt_json_data(test_json, dynamic_key)
    decrypted_json = decrypt_json_data(encrypted_json, dynamic_key)
    
    print(f"Original JSON: {json.dumps(test_json, indent=2)}")
    print(f"Encrypted JSON: {encrypted_json}")
    print(f"Decrypted JSON: {json.dumps(decrypted_json, indent=2) if decrypted_json else 'Failed to decrypt'}")
    
    json_success = test_json == decrypted_json
    print(f"JSON Encryption/Decryption Test: {'✅ SUCCESS' if json_success else '❌ FAILED'}")
    
    return success and json_success


if __name__ == "__main__":
    demo()
