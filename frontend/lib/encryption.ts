export async function decryptAurexPayload(
  encryptedBase64: string,
  keyString: string
): Promise<string> {
  if (!encryptedBase64 || !keyString) return "";
  
  try {
    // 1. Decode base64
    const binaryStr = atob(encryptedBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    
    // 2. Extract IV (first 12 bytes) and Ciphertext+Tag
    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);
    
    // 3. Derive key (SHA-256 of the keyString, just like the Python SDK)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      hashBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    // 4. Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      data
    );
    
    // 5. Decode to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error("Failed to decrypt payload:", error);
    return "[Decryption Failed - Check Key]";
  }
}
